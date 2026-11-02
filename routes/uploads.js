import express from "express";
import multer from "multer";
import {
  requireSession,
  requireTrustedOrigin,
} from "../middleware/auth.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
  },
}).single("image");

function isSupportedImage(buffer) {
  const png =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const jpeg =
    buffer.length >= 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255;

  const webp =
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  return png || jpeg || webp;
}

export function createUploadRouter(auth) {
  const router = express.Router();

  router.post(
    "/",
    requireSession(auth),
    requireTrustedOrigin,
    (req, res, next) => {
      upload(req, res, (error) => {
        if (error) {
          return res.status(400).json({
            success: false,
            message:
              error.code === "LIMIT_FILE_SIZE"
                ? "Image must be 5 MB or smaller."
                : "Please upload one JPEG, PNG, or WebP image.",
          });
        }

        next();
      });
    },
    async (req, res) => {
      if (!req.file || !isSupportedImage(req.file.buffer)) {
        return res.status(400).json({
          success: false,
          message: "Please select a valid JPEG, PNG, or WebP image.",
        });
      }

      if (!process.env.IMGBB_API_KEY) {
        return res.status(503).json({
          success: false,
          message: "Image upload is not configured.",
        });
      }

      try {
        const form = new FormData();
        form.append("image", req.file.buffer.toString("base64"));

        const response = await fetch(
          `https://api.imgbb.com/1/upload?key=${encodeURIComponent(
            process.env.IMGBB_API_KEY
          )}`,
          {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(30000),
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success || !result.data?.url) {
          throw new Error("Upload provider rejected the request.");
        }

        res.status(201).json({
          success: true,
          imageUrl: result.data.url,
        });
      } catch {
        res.status(502).json({
          success: false,
          message: "Image upload failed. Please try again.",
        });
      }
    }
  );

  return router;
}