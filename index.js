import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB, closeDB } from "./config/db.js";
import { createStudioRouter } from "./routes/studios.js";

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

app.use(express.json());

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

    app.use("/api/studios", createStudioRouter(db));

    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: "API route not found.",
      });
    });

    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);

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
    });

    server.on("error", async (error) => {
      console.error("Server failed:", error.code);
      await closeDB();
      process.exit(1);
    });
  } catch (error) {
    console.error("Startup failed:", error.name);
    console.error(
      "Check MongoDB environment variables, database credentials, and IP access."
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