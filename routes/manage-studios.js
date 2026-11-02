import express from "express";
import { ObjectId } from "mongodb";
import { getMongoClient } from "../config/db.js";
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

function validMoney(value, min) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= 100000 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
  );
}

function validImage(value) {
  if (typeof value !== "string" || value.length > 2000) {
    return false;
  }

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

export function createManageStudioRouter(db, auth) {
  const router = express.Router();
  const studios = db.collection("studios");
  const bookings = db.collection("bookings");

  router.use(requireSession(auth));

  router.param("id", (req, res, next, id) => {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID.",
      });
    }

    req.studioFilter = {
      _id: new ObjectId(id),
      ownerId: req.user.id,
      ownerEmail: req.user.email,
    };

    next();
  });

  // Get a studio owned by the signed-in user.
  router.get("/:id", async (req, res, next) => {
    try {
      const studio = await studios.findOne(req.studioFilter);

      if (!studio) {
        return res.status(404).json({
          success: false,
          message: "Studio not found in your listings.",
        });
      }

      res.set("Cache-Control", "no-store");

      res.json({
        success: true,
        data: studio,
      });
    } catch (error) {
      next(error);
    }
  });

  // Update only permitted studio fields.
  router.patch("/:id", requireTrustedOrigin, async (req, res, next) => {
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
        validImage(body.imageUrl) &&
        Array.isArray(body.amenities) &&
        body.amenities.length <= 20 &&
        body.amenities.every((item) => validText(item, 1, 60));

      if (!valid) {
        return res.status(400).json({
          success: false,
          message: "Please check all studio fields and try again.",
        });
      }

      const existing = await studios.findOne(req.studioFilter);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Studio not found in your listings.",
        });
      }

      // Preserve additional gallery images when replacing the cover.
      const gallery = [
        ...new Set([
          body.imageUrl,
          ...(Array.isArray(existing.gallery) ? existing.gallery : []).filter(
            (url) => url !== existing.imageUrl
          ),
        ]),
      ];

      const result = await studios.updateOne(req.studioFilter, {
        $set: {
          title: body.title.trim(),
          category: body.category,
          hourlyRate: body.hourlyRate,
          securityDeposit: body.securityDeposit,
          maxCapacity: body.maxCapacity,
          location: body.location.trim(),
          overview: body.overview.trim(),
          imageUrl: body.imageUrl,
          gallery,
          amenities: [
            ...new Set(body.amenities.map((item) => item.trim())),
          ],
          updatedAt: new Date(),
        },
      });

      if (!result.matchedCount) {
        return res.status(404).json({
          success: false,
          message: "Studio no longer exists.",
        });
      }

      res.json({
        success: true,
        message: "Studio updated successfully.",
      });
    } catch (error) {
      next(error);
    }
  });

  // Delete an owned studio only when it has no booking history.
  router.delete("/:id", requireTrustedOrigin, async (req, res, next) => {
    const session = getMongoClient().startSession();

    try {
      const outcome = await session.withTransaction(
        async () => {
          // Coordinate with booking creation and confirmation transactions.
          const locked = await studios.updateOne(
            req.studioFilter,
            {
              $inc: { bookingRevision: 1 },
            },
            { session }
          );

          if (!locked.matchedCount) {
            return {
              status: 404,
              success: false,
              message: "Studio not found in your listings.",
            };
          }

          const booking = await bookings.findOne(
            {
              studioId: req.studioFilter._id,
            },
            {
              session,
              projection: { _id: 1 },
            }
          );

          if (booking) {
            return {
              status: 409,
              success: false,
              message:
                "This studio has booking history and cannot be deleted. You can edit its details.",
            };
          }

          await studios.deleteOne(req.studioFilter, { session });

          return {
            status: 200,
            success: true,
            message: "Studio deleted successfully.",
          };
        },
        {
          readPreference: "primary",
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
        }
      );

      res.status(outcome.status).json({
        success: outcome.success,
        message: outcome.message,
      });
    } catch (error) {
      next(error);
    } finally {
      await session.endSession();
    }
  });

  return router;
}