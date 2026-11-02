import express from "express";
import { ObjectId } from "mongodb";

const categories = [
  "Photo Studio",
  "Film Stage",
  "Podcast Lounge",
  "Music Suite",
  "Workshop",
];

const sorting = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { hourlyRate: 1, _id: 1 },
  "price-desc": { hourlyRate: -1, _id: 1 },
  rating: { rating: -1, reviewCount: -1, _id: 1 },
};

export function createStudioRouter(db) {
  const router = express.Router();
  const studios = db.collection("studios");

  router.get("/featured", async (req, res, next) => {
    try {
      const data = await studios
        .find({})
        .sort(sorting.newest)
        .limit(6)
        .toArray();

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const keys = ["page", "limit", "search", "category", "sort"];

      if (
        keys.some(
          (key) =>
            req.query[key] !== undefined &&
            typeof req.query[key] !== "string"
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Query parameters must be single text values.",
        });
      }

      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 6);
      const search = (req.query.search ?? "").trim();
      const category = req.query.category ?? "";
      const sort = req.query.sort ?? "newest";

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
          message: "Invalid page or limit.",
        });
      }

      if (search.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Search must be 100 characters or fewer.",
        });
      }

      if (category && !categories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studio category.",
        });
      }

      if (!Object.hasOwn(sorting, sort)) {
        return res.status(400).json({
          success: false,
          message: "Invalid sorting option.",
        });
      }

      const filter = {};

      if (category) {
        filter.category = category;
      }

      if (search) {
        // Treat special characters as literal search text.
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        filter.$or = [
          { title: { $regex: escaped, $options: "i" } },
          { location: { $regex: escaped, $options: "i" } },
        ];
      }

      const [data, total] = await Promise.all([
        studios
          .find(filter)
          .sort(sorting[sort])
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        studios.countDocuments(filter),
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

      res.json({ success: true, data: studio });
    } catch (error) {
      next(error);
    }
  });

  return router;
}