import express from "express";
import { ObjectId } from "mongodb";
import {
  requireApiAuth,
  requireTrustedOrigin,
} from "../middleware/auth.js";

export function createWishlistRouter(db, auth) {
  const router = express.Router();
  const wishlist = db.collection("wishlist");

  router.use(requireApiAuth(auth));

  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  router.get("/", async (req, res, next) => {
    try {
      const data = await wishlist
        .aggregate([
          {
            $match: {
              userId: req.user.id,
            },
          },
          {
            $sort: {
              createdAt: -1,
              _id: -1,
            },
          },
          {
            $lookup: {
              from: "studios",
              localField: "studioId",
              foreignField: "_id",
              as: "studio",
            },
          },
          {
            $project: {
              _id: 0,
              studioId: 1,
              studio: {
                $ifNull: [
                  { $arrayElemAt: ["$studio", 0] },
                  null,
                ],
              },
            },
          },
        ])
        .toArray();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  });

  router.param("id", (req, res, next, id) => {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID.",
      });
    }

    req.savedFilter = {
      userId: req.user.id,
      studioId: new ObjectId(id),
    };

    next();
  });

  router.put(
    "/:id",
    requireTrustedOrigin,
    async (req, res, next) => {
      try {
        const studio = await db.collection("studios").findOne({
          _id: req.savedFilter.studioId,
        });

        if (!studio) {
          return res.status(404).json({
            success: false,
            message: "Studio is no longer available.",
          });
        }

        try {
          await wishlist.updateOne(
            req.savedFilter,
            {
              $setOnInsert: {
                ...req.savedFilter,
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );
        } catch (error) {
          // Concurrent duplicate saves are harmless.
          if (error.code !== 11000) throw error;
        }

        res.json({
          success: true,
          data: {
            studioId: req.params.id,
            studio,
          },
          message: "Studio saved.",
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/:id",
    requireTrustedOrigin,
    async (req, res, next) => {
      try {
        await wishlist.deleteOne(req.savedFilter);

        res.json({
          success: true,
          message: "Studio removed from saved studios.",
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}