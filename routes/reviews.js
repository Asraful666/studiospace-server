import express from "express";
import { ObjectId } from "mongodb";
import {
  requireApiAuth,
  requireTrustedOrigin,
} from "../middleware/auth.js";

function validId(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

function requestError(status, message) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}

export function createReviewRouter(db, client, auth) {
  const router = express.Router();

  const reviews = db.collection("reviews");
  const bookings = db.collection("bookings");
  const studios = db.collection("studios");

  // Public: read reviews for one studio.
  router.get("/studio/:id", async (req, res, next) => {
    try {
      if (!validId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studio ID.",
        });
      }

      const rawPage = req.query.page ?? "1";

      if (
        typeof rawPage !== "string" ||
        !/^[1-9]\d*$/.test(rawPage) ||
        Number(rawPage) > 10000
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid page number.",
        });
      }

      const studioId = new ObjectId(req.params.id);

      const studio = await studios.findOne(
        { _id: studioId },
        {
          projection: {
            _id: 1,
            rating: 1,
            reviewCount: 1,
          },
        }
      );

      if (!studio) {
        return res.status(404).json({
          success: false,
          message: "Studio not found.",
        });
      }

      const page = Number(rawPage);
      const limit = 5;
      const filter = { studioId };

      const [data, total] = await Promise.all([
        reviews
          .find(filter, {
            projection: {
              _id: 1,
              reviewerName: 1,
              rating: 1,
              comment: 1,
              createdAt: 1,
            },
          })
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),

        reviews.countDocuments(filter),
      ]);

      res.set("Cache-Control", "no-store");

      res.json({
        success: true,
        data,
        summary: {
          rating: studio.rating ?? 0,
          reviewCount: studio.reviewCount ?? 0,
        },
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

  // Private: submit one review for an owned Completed booking.
  router.post(
    "/",
    requireTrustedOrigin,
    requireApiAuth(auth),
    async (req, res, next) => {
      const { bookingId, rating, comment } = req.body ?? {};

      if (
        !validId(bookingId) ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        typeof comment !== "string" ||
        comment.trim().length < 10 ||
        comment.trim().length > 2000
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Choose a rating from 1 to 5 and write a review of 10–2000 characters.",
        });
      }

      const session = client.startSession();

      try {
        const result = await session.withTransaction(
          async () => {
            const booking = await bookings.findOne(
              {
                _id: new ObjectId(bookingId),
                userId: req.user.id,
              },
              { session }
            );

            if (!booking) {
              throw requestError(404, "Booking not found.");
            }

            if (booking.status !== "Completed") {
              throw requestError(
                409,
                "You can review a studio after your booking is completed."
              );
            }

            if (
              !(booking.endAt instanceof Date) ||
              !Number.isFinite(booking.endAt.getTime()) ||
              booking.endAt.getTime() > Date.now()
            ) {
              throw requestError(
                409,
                "This session has not ended or its end time is invalid."
              );
            }

            /*
             * Serialize review updates for this studio.
             * This also coordinates with studio deletion.
             */
            const locked = await studios.updateOne(
              { _id: booking.studioId },
              { $inc: { bookingRevision: 1 } },
              { session }
            );

            if (!locked.matchedCount) {
              throw requestError(404, "Studio not found.");
            }

            const studio = await studios.findOne(
              { _id: booking.studioId },
              {
                session,
                projection: {
                  ownerId: 1,
                  ownerEmail: 1,
                },
              }
            );

            if (
              studio.ownerId === req.user.id ||
              studio.ownerEmail === req.user.email
            ) {
              throw requestError(
                403,
                "You cannot review your own studio."
              );
            }

            const existing = await reviews.findOne(
              { bookingId: booking._id },
              {
                session,
                projection: { _id: 1 },
              }
            );

            if (existing) {
              throw requestError(
                409,
                "You have already reviewed this booking."
              );
            }

            const now = new Date();

            const review = {
              _id: new ObjectId(),
              studioId: booking.studioId,
              bookingId: booking._id,
              userId: req.user.id,
              reviewerName: req.user.name,
              rating,
              comment: comment.trim(),
              createdAt: now,
            };

            await reviews.insertOne(review, { session });

            // Recalculate from the actual review documents.
            const statistics = await reviews
              .aggregate(
                [
                  {
                    $match: {
                      studioId: booking.studioId,
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      averageRating: { $avg: "$rating" },
                      reviewCount: { $sum: 1 },
                    },
                  },
                ],
                { session }
              )
              .toArray();

            const summary = statistics[0];

            await studios.updateOne(
              { _id: booking.studioId },
              {
                $set: {
                  rating:
                    Math.round(summary.averageRating * 10) / 10,
                  reviewCount: summary.reviewCount,
                  ratingUpdatedAt: now,
                },
              },
              { session }
            );

            const bookingUpdate = await bookings.updateOne(
              {
                _id: booking._id,
                userId: req.user.id,
                status: "Completed",
              },
              {
                $set: {
                  reviewId: review._id,
                  reviewedAt: now,
                  updatedAt: now,
                },
              },
              { session }
            );

            if (!bookingUpdate.matchedCount) {
              throw requestError(
                409,
                "The booking changed. Refresh and try again."
              );
            }

            return {
              _id: review._id,
              studioId: review.studioId,
              reviewerName: review.reviewerName,
              rating: review.rating,
              comment: review.comment,
              createdAt: review.createdAt,
            };
          },
          {
            readPreference: "primary",
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" },
          }
        );

        res.status(201).json({
          success: true,
          message: "Your review has been published.",
          data: result,
        });
      } catch (error) {
        if (error.httpStatus) {
          return res.status(error.httpStatus).json({
            success: false,
            message: error.message,
          });
        }

        if (error.code === 11000) {
          return res.status(409).json({
            success: false,
            message: "You have already reviewed this booking.",
          });
        }

        next(error);
      } finally {
        await session.endSession();
      }
    }
  );

  return router;
}