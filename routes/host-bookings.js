import express from "express";
import { ObjectId } from "mongodb";
import {
  requireSession,
  requireTrustedOrigin,
} from "../middleware/auth.js";

function requestError(status, message) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}

export function createHostBookingRouter(db, client, auth) {
  const router = express.Router();
  const bookings = db.collection("bookings");
  const studios = db.collection("studios");

  router.use(requireSession(auth));

  // List booking requests for this host.
  router.get("/", async (req, res, next) => {
    try {
      const rawPage = req.query.page ?? "1";
      const status = req.query.status ?? "All";

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

      const allowedStatuses = [
        "All",
        "Pending",
        "Confirmed",
        "Cancelled",
        "Rejected",
      ];

      if (
        typeof status !== "string" ||
        !allowedStatuses.includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking status.",
        });
      }

      const page = Number(rawPage);
      const limit = 10;

      const filter = {
        ownerId: req.user.id,
      };

      if (status !== "All") {
        filter.status = status;
      }

      const [data, total] = await Promise.all([
        bookings
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),

        bookings.countDocuments(filter),
      ]);

      res.set("Cache-Control", "no-store");

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

  // Confirm or reject a Pending booking.
  router.patch(
    "/:id/status",
    requireTrustedOrigin,
    async (req, res, next) => {
      if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID.",
        });
      }

      const status = req.body?.status;

      if (!["Confirmed", "Rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Choose Confirmed or Rejected.",
        });
      }

      const session = client.startSession();

      try {
        const result = await session.withTransaction(
          async () => {
            const booking = await bookings.findOne(
              {
                _id: new ObjectId(req.params.id),
                ownerId: req.user.id,
              },
              { session }
            );

            if (!booking) {
              throw requestError(404, "Booking request not found.");
            }

            if (booking.status !== "Pending") {
              throw requestError(
                409,
                "Only Pending booking requests can be changed."
              );
            }

            /*
             * Every confirmation writes to the same studio document.
             * Concurrent requests for this studio therefore conflict,
             * causing the transaction to retry against fresh data.
             */
            const studioResult = await studios.updateOne(
              {
                _id: booking.studioId,
                ownerId: req.user.id,
                ownerEmail: req.user.email,
              },
              {
                $inc: { bookingRevision: 1 },
              },
              { session }
            );

            if (!studioResult.matchedCount) {
              throw requestError(
                404,
                "The studio is unavailable or does not belong to you."
              );
            }

            if (status === "Confirmed") {
              if (
                !(booking.startAt instanceof Date) ||
                !(booking.endAt instanceof Date) ||
                !Number.isFinite(booking.startAt.getTime()) ||
                !Number.isFinite(booking.endAt.getTime()) ||
                booking.endAt <= booking.startAt
              ) {
                throw requestError(
                  409,
                  "This booking has an invalid time range."
                );
              }

              if (booking.startAt.getTime() <= Date.now()) {
                throw requestError(
                  409,
                  "A booking that has already started cannot be confirmed."
                );
              }

              const overlapping = await bookings.findOne(
                {
                  _id: { $ne: booking._id },
                  studioId: booking.studioId,
                  status: "Confirmed",
                  startAt: { $lt: booking.endAt },
                  endAt: { $gt: booking.startAt },
                },
                {
                  session,
                  projection: { _id: 1 },
                }
              );

              if (overlapping) {
                throw requestError(
                  409,
                  "This time overlaps another confirmed booking."
                );
              }
            }

            const now = new Date();

            const update = await bookings.updateOne(
              {
                _id: booking._id,
                ownerId: req.user.id,
                status: "Pending",
              },
              {
                $set: {
                  status,
                  updatedAt: now,
                  reviewedAt: now,
                  reviewedBy: req.user.id,
                },
              },
              { session }
            );

            if (!update.matchedCount) {
              throw requestError(
                409,
                "The booking status changed. Refresh and try again."
              );
            }

            return {
              id: booking._id,
              status,
            };
          },
          {
            readPreference: "primary",
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" },
          }
        );

        res.json({
          success: true,
          message:
            status === "Confirmed"
              ? "Booking confirmed successfully."
              : "Booking request rejected.",
          data: result,
        });
      } catch (error) {
        if (error.httpStatus) {
          return res.status(error.httpStatus).json({
            success: false,
            message: error.message,
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