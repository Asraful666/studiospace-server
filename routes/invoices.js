import express from "express";
import { ObjectId } from "mongodb";
import { requireApiAuth } from "../middleware/auth.js";
import { createBookingPdf } from "../utils/booking-pdf.js";

export function createInvoiceRouter(db, auth) {
  const router = express.Router();

  router.get(
    "/:id/invoice",
    requireApiAuth(auth),
    async (req, res, next) => {
      try {
        res.set("Cache-Control", "private, no-store");

        if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid booking ID.",
          });
        }

        const booking = await db.collection("bookings").findOne({
          _id: new ObjectId(req.params.id),
          userId: req.user.id,
        });

        if (!booking) {
          return res.status(404).json({
            success: false,
            message: "Booking not found.",
          });
        }

        if (!["Confirmed", "Completed"].includes(booking.status)) {
          return res.status(409).json({
            success: false,
            message:
              "A receipt is available after the host confirms your booking.",
          });
        }

        const pdf = await createBookingPdf(booking);

        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition":
            `attachment; filename="StudioSpace-booking-${booking._id}.pdf"`,
          "X-Content-Type-Options": "nosniff",
        });

        res.send(pdf);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}