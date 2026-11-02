import express from "express";
import {
  requireApiAuth as requireSession,
  requireTrustedOrigin,
} from "../middleware/auth.js";
const categories = [
  "Photo Studio",
  "Film Stage",
  "Podcast Lounge",
  "Music Suite",
  "Workshop",
];

function validText(value, min, max) {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.trim().length <= max
  );
}

function validMoney(value, minimum) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= 100000 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
  );
}

function validImageUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return false;

  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function createHostStudioRouter(db, auth) {
  const router = express.Router();
  const studios = db.collection("studios");

  // GET /api/studios/mine
  router.get("/mine", requireSession(auth), async (req, res, next) => {
    try {
      const rawPage = req.query.page ?? "1";
      const page = Number(rawPage);
      const limit = 12;

      if (
        typeof rawPage !== "string" ||
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 10000
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid page.",
        });
      }

      // Both values come from the authenticated session.
      const filter = {
        ownerId: req.user.id,
        ownerEmail: req.user.email,
      };

      const [data, total] = await Promise.all([
        studios
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        studios.countDocuments(filter),
      ]);

      res.set("Cache-Control", "no-store");

      res.json({
        success: true,
        data,
        pagination: {
          page,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/studios
  router.post(
    "/",
    requireSession(auth),
    requireTrustedOrigin,
    async (req, res, next) => {
      try {
        const body = req.body ?? {};

        const valid =
          validText(body.title, 3, 120) &&
          categories.includes(body.category) &&
          validMoney(body.hourlyRate, 0.01) &&
          validMoney(body.securityDeposit, 0) &&
          Number.isInteger(body.maxCapacity) &&
          body.maxCapacity >= 1 &&
          body.maxCapacity <= 1000 &&
          validText(body.location, 3, 300) &&
          validText(body.overview, 20, 5000) &&
          validImageUrl(body.imageUrl) &&
          Array.isArray(body.amenities) &&
          body.amenities.length <= 20 &&
          body.amenities.every((item) => validText(item, 1, 60));

        if (!valid) {
          return res.status(400).json({
            success: false,
            message:
              "Check the studio details, image URL, prices, capacity, and overview.",
          });
        }

        const now = new Date();

        const studio = {
          title: body.title.trim(),
          category: body.category,
          hourlyRate: body.hourlyRate,
          securityDeposit: body.securityDeposit,
          maxCapacity: body.maxCapacity,
          location: body.location.trim(),
          overview: body.overview.trim(),
          imageUrl: body.imageUrl.trim(),
          gallery: [body.imageUrl.trim()],
          amenities: [
            ...new Set(body.amenities.map((item) => item.trim())),
          ],

          ownerId: req.user.id,
          ownerEmail: req.user.email,
          ownerName: req.user.name,

          rating: 0,
          reviewCount: 0,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
        };

        const result = await studios.insertOne(studio);

        res.status(201).json({
          success: true,
          message: "Studio created successfully.",
          id: result.insertedId,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}