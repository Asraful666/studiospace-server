import "dotenv/config";
import express from "express";
import cors from "cors";

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

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "studiospace-server",
    status: "ok",
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

app.listen(port, () => {
  console.log(`StudioSpace API: http://localhost:${port}`);
});