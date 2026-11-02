import express from "express";
import { ObjectId } from "mongodb";
import {
  requireSession,
  requireTrustedOrigin,
} from "../middleware/auth.js";

function validId(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

function parseBookingTime(date, startHour, endHour) {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < 0 ||
    startHour > 23 ||
    endHour < 1 ||
    endHour > 24 ||
    endHour <= startHour
  ) {
    return null;
  }

  // Verify that the date exists, including month lengths and leap years.
  const calendarDate = new Date(`${date}T00:00:00.000Z`);

  if (
    Number.isNaN(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== date
  ) {
    return null;
  }

  // Bangladesh local midnight converted to a UTC instant.
  const midnight = new Date(`${date}T00:00:00+06:00`).getTime();

  return {
    startAt: new Date(midnight + startHour * 60 * 60 * 1000),
    endAt: new Date(midnight + endHour * 60 * 60 * 1000),
    hours: endHour - startHour,
  };
}

function moneyToCents(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000
  ) {
    return null;
  }

  return Math.round(value * 100);
}

export function createBookingRouter(db, auth) {
  const router = express.Router();
  const bookings = db.collection("bookings");
  const studios = db.collection("studios");

  // All booking endpoints require a valid session.
  router.use(requireSession(auth));

  // Get only the signed-in user's bookings.
  router.get("/mine", async (req, res, next) => {
    try {
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

      const page = Number(rawPage);
      const limit = 10;
      const filter = { userId: req.user.id };

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

  // Create a new Pending booking.
  router.post("/", requireTrustedOrigin, async (req, res, next) => {
    try {
      const {
        studioId,
        date,
        startHour,
        endHour,
        guests,
        note = "",
      } = req.body ?? {};

      if (!validId(studioId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studio ID.",
        });
      }

      const bookingTime = parseBookingTime(date, startHour, endHour);

      if (!bookingTime) {
        return res.status(400).json({
          success: false,
          message: "Choose a valid date and start/end hours.",
        });
      }

      if (bookingTime.startAt.getTime() <= Date.now()) {
        return res.status(400).json({
          success: false,
          message: "Booking must start in the future.",
        });
      }

      if (
        !Number.isInteger(guests) ||
        guests < 1 ||
        guests > 1000 ||
        typeof note !== "string" ||
        note.trim().length > 1000
      ) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid guest count and a note under 1000 characters.",
        });
      }

      const studio = await studios.findOne({
        _id: new ObjectId(studioId),
      });

      if (!studio) {
        return res.status(404).json({
          success: false,
          message: "Studio not found.",
        });
      }

      if (
        studio.ownerId === req.user.id ||
        studio.ownerEmail === req.user.email
      ) {
        return res.status(400).json({
          success: false,
          message: "You cannot book your own studio.",
        });
      }

      if (
        !Number.isInteger(studio.maxCapacity) ||
        guests > studio.maxCapacity
      ) {
        return res.status(400).json({
          success: false,
          message: "Guest count exceeds the studio capacity.",
        });
      }

      const hourlyRateCents = moneyToCents(studio.hourlyRate);
      const securityDepositCents = moneyToCents(studio.securityDeposit);

      if (
        hourlyRateCents === null ||
        hourlyRateCents < 1 ||
        securityDepositCents === null
      ) {
        return res.status(409).json({
          success: false,
          message: "This studio's pricing needs to be updated before booking.",
        });
      }

      // Adjacent bookings are allowed:
      // 10:00–12:00 does not overlap 12:00–14:00.
      const conflict = await bookings.findOne(
        {
          studioId: studio._id,
          status: "Confirmed",
          startAt: { $lt: bookingTime.endAt },
          endAt: { $gt: bookingTime.startAt },
        },
        { projection: { _id: 1 } }
      );

      if (conflict) {
        return res.status(409).json({
          success: false,
          message: "This time overlaps a confirmed booking. Choose another time.",
        });
      }

      const rentalCents = hourlyRateCents * bookingTime.hours;
      const totalCents = rentalCents + securityDepositCents;
      const now = new Date();

      const booking = {
        studioId: studio._id,

        // Store a snapshot so booking history retains the original details.
        studioTitle: studio.title,
        studioImageUrl: studio.imageUrl,
        studioLocation: studio.location,
        ownerId: studio.ownerId ?? null,
        ownerEmail: studio.ownerEmail,

        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,

        date,
        startHour,
        endHour,
        timeZone: "Asia/Dhaka",
        startAt: bookingTime.startAt,
        endAt: bookingTime.endAt,
        hours: bookingTime.hours,
        guests,
        note: note.trim(),

        currency: "USD",
        hourlyRate: hourlyRateCents / 100,
        securityDeposit: securityDepositCents / 100,
        rentalAmount: rentalCents / 100,
        totalAmount: totalCents / 100,

        status: "Pending",
        createdAt: now,
        updatedAt: now,
      };

      const result = await bookings.insertOne(booking);

      res.status(201).json({
        success: true,
        message: "Booking request submitted.",
        data: {
          ...booking,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // A user can cancel only their own Pending booking.
  router.patch(
    "/:id/cancel",
    requireTrustedOrigin,
    async (req, res, next) => {
      try {
        if (!validId(req.params.id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid booking ID.",
          });
        }

        const filter = {
          _id: new ObjectId(req.params.id),
          userId: req.user.id,
        };

        const now = new Date();

        // Status check and update happen in one database operation.
        const result = await bookings.updateOne(
          {
            ...filter,
            status: "Pending",
          },
          {
            $set: {
              status: "Cancelled",
              cancelledAt: now,
              updatedAt: now,
            },
          }
        );

        if (!result.matchedCount) {
          const existing = await bookings.findOne(filter, {
            projection: { _id: 1 },
          });

          return res.status(existing ? 409 : 404).json({
            success: false,
            message: existing
              ? "Only Pending bookings can be cancelled."
              : "Booking not found.",
          });
        }

        res.json({
          success: true,
          message: "Booking cancelled successfully.",
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}