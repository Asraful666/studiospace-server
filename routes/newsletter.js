import express from "express";
import { rateLimit } from "express-rate-limit";
import { requireTrustedOrigin } from "../middleware/auth.js";

export function createNewsletterRouter(db) {
  const router = express.Router();
  const subscribers = db.collection("newsletterSubscribers");

  const subscribeLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many attempts. Please try again in 15 minutes.",
    },
  });

  router.post(
    "/",
    requireTrustedOrigin,
    subscribeLimit,
    async (req, res, next) => {
      try {
        const { email, consent } = req.body ?? {};

        if (
          typeof email !== "string" ||
          email.trim().length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
          consent !== true
        ) {
          return res.status(400).json({
            success: false,
            message: "Enter a valid email and agree to join the interest list.",
          });
        }

        const normalizedEmail = email.trim().toLowerCase();

        try {
          await subscribers.updateOne(
            { email: normalizedEmail },
            {
              $setOnInsert: {
                email: normalizedEmail,
                status: "interest",
                consent: true,
                consentVersion: "newsletter-interest-v1",
                createdAt: new Date(),
                source: "website-footer",
              },
            },
            { upsert: true }
          );
        } catch (error) {
          // A simultaneous request may insert the same unique email.
          if (error.code !== 11000) throw error;
        }

        res.set("Cache-Control", "no-store");

        res.json({
          success: true,
          message:
            "Your email is on the interest list. Newsletter emails are not being sent yet.",
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}