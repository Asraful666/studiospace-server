import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";

import {
  connectDB,
  closeDB,
  getMongoClient,
} from "./config/db.js";

import { createAuth } from "./config/auth.js";
import { createStudioRouter } from "./routes/studios.js";
import { requireSession } from "./middleware/auth.js";

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

    // Keep the auth handler before express.json().
    app.all(/^\/api\/auth(?:\/.*)?$/, toNodeHandler(auth));

    app.use(express.json());

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

    app.get("/api/me", requireSession(auth), (req, res) => {
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

    app.use("/api/studios", createStudioRouter(db));

    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: "API route not found.",
      });
    });

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
      console.log("Better Auth is ready.");
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
      "Check the database connection and required authentication environment variables."
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