import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";

import {
  connectDB,
  closeDB,
  getMongoClient,
} from "./config/db.js";

import { createAuth } from "./config/auth.js";
import { requireApiAuth } from "./middleware/auth.js";
import { createTokenRouter } from "./routes/token.js";
import { createStudioRouter } from "./routes/studios.js";
import { createUploadRouter } from "./routes/uploads.js";
import { createHostStudioRouter } from "./routes/host-studios.js";
import { createManageStudioRouter } from "./routes/manage-studios.js";
import { createBookingRouter } from "./routes/bookings.js";
import { createHostBookingRouter } from "./routes/host-bookings.js";
import { createNewsletterRouter } from "./routes/newsletter.js";

const app = express();

const port = Number(process.env.PORT) || 8000;
const clientOrigin =
  process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "StudioSpace API is running",
  });
});

let server;

async function startServer() {
  try {
    const db = await connectDB();
    const client = getMongoClient();
    const auth = createAuth(db, client);

    // Personal booking history.
    await db.collection("bookings").createIndex({
      userId: 1,
      createdAt: -1,
      _id: -1,
    });

    // Confirmed booking overlap queries.
    await db.collection("bookings").createIndex({
      studioId: 1,
      status: 1,
      startAt: 1,
      endAt: 1,
    });

    // Host booking history.
    await db.collection("bookings").createIndex({
      ownerId: 1,
      createdAt: -1,
      _id: -1,
    });

    // Prevent duplicate newsletter email entries.
    await db.collection("newsletterSubscribers").createIndex(
      { email: 1 },
      { unique: true }
    );

    // Better Auth must be mounted before express.json().
    app.all(/^\/api\/auth(?:\/.*)?$/, toNodeHandler(auth));

    app.use(express.json());
    app.use(cookieParser());

    // Issue an HTTPOnly JWT cookie using the login session.
    app.use("/api/token", createTokenRouter(auth));

    app.get("/api/health", async (req, res) => {
      try {
        await db.command({ ping: 1 });

        res.json({
          success: true,
          service: "studiospace-server",
          database: "connected",
        });
      } catch {
        res.status(503).json({
          success: false,
          message: "Database is unavailable.",
        });
      }
    });

    // Require both a valid session and a matching JWT.
    app.get("/api/me", requireApiAuth(auth), (req, res) => {
      res.set("Cache-Control", "no-store");

      res.json({
        success: true,
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          image: req.user.image,
        },
      });
    });

    // Public newsletter interest registration.
    app.use("/api/newsletter", createNewsletterRouter(db));

    // Authenticated image uploads.
    app.use("/api/uploads", createUploadRouter(auth));

    // Owner-only studio lookup, update, and delete.
    app.use(
      "/api/manage/studios",
      createManageStudioRouter(db, auth)
    );

    // Host booking requests, confirmation, and rejection.
    app.use(
      "/api/host/bookings",
      createHostBookingRouter(db, client, auth)
    );

    // Booking creation, personal history, and cancellation.
    app.use("/api/bookings", createBookingRouter(db, auth));

    // Keep /mine before the public /:id route.
    app.use("/api/studios", createHostStudioRouter(db, auth));

    // Public studio list, featured studios, and details.
    app.use("/api/studios", createStudioRouter(db));

    // Unmatched API routes.
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: "API route not found.",
      });
    });

    // Central error handler.
    app.use((error, req, res, next) => {
      if (res.headersSent) {
        return next(error);
      }

      console.error("Request failed:", error.name);

      const isInvalidJson = error.type === "entity.parse.failed";

      res.status(isInvalidJson ? 400 : 500).json({
        success: false,
        message: isInvalidJson
          ? "Invalid JSON request."
          : "Something went wrong. Please try again.",
      });
    });

    server = app.listen(port, () => {
      console.log(`StudioSpace API: http://localhost:${port}`);
      console.log("Better Auth and JWT access are ready.");
    });

    server.on("error", async (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `Port ${port} is already in use. Stop the other server, then restart StudioSpace.`
        );
      } else {
        console.error("Server failed:", error.code || error.name);
      }

      await closeDB();
      process.exit(1);
    });
  } catch (error) {
    console.error("Startup failed:", error.name);
    console.error(
      "Check the database connection, database indexes, authentication environment variables, and JWT_SECRET."
    );

    await closeDB();
    process.exit(1);
  }
}

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (server) {
    server.close(async () => {
      await closeDB();
      process.exit(0);
    });
  } else {
    closeDB().finally(() => process.exit(0));
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();