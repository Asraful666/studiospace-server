import express from "express";
import { ObjectId } from "mongodb";

export function createStudioRouter(db) {
  const router = express.Router();
  const studios = db.collection("studios");

  // Home page: newest 6 studios
  // GET /api/studios/featured
  router.get("/featured", async (req, res, next) => {
    try {
      const data = await studios
        .find({})
        .sort({ createdAt: -1, _id: -1 })
        .limit(6)
        .toArray();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  });

  // Explore page: studio list with pagination
  // GET /api/studios?page=1&limit=12
  router.get("/", async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 12);

      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 10000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 50
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Page must be between 1 and 10000; limit must be between 1 and 50.",
        });
      }

      const [data, total] = await Promise.all([
        studios
          .find({})
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),

        studios.countDocuments({}),
      ]);

      res.json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // Studio details
  // GET /api/studios/:id
  router.get("/:id", async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!/^[a-fA-F0-9]{24}$/.test(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studio ID.",
        });
      }

      const studio = await studios.findOne({
        _id: new ObjectId(id),
      });

      if (!studio) {
        return res.status(404).json({
          success: false,
          message: "Studio not found.",
        });
      }

      res.json({
        success: true,
        data: studio,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}