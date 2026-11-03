import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";

const font = fileURLToPath(
  new URL("../assets/NotoSansBengali.ttf", import.meta.url)
);

const money = (value) => `USD ${Number(value).toFixed(2)}`;

const hour = (value) =>
  `${String(value).padStart(2, "0")}:00`;

export function createBookingPdf(booking) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      font,
      info: {
        Title: "StudioSpace booking receipt",
        Author: "StudioSpace",
      },
    });

    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc
      .fillColor("#7047eb")
      .fontSize(26)
      .text("StudioSpace");

    doc
      .fillColor("#20202b")
      .fontSize(18)
      .text("Booking receipt");

    doc.moveDown().fontSize(10).fillColor("#555555");

    doc.text(`Booking reference: ${booking._id}`);
    doc.text(`Status: ${booking.status}`);
    doc.text(
      `Generated: ${new Date().toISOString().slice(0, 10)} (UTC)`
    );

    doc
      .moveDown()
      .fillColor("#20202b")
      .fontSize(15)
      .text(String(booking.studioTitle));

    doc.fontSize(11).text(String(booking.studioLocation));
    doc.moveDown();

    const lines = [
      ["Guest", booking.userName],
      ["Email", booking.userEmail],
      ["Session date", booking.date],
      [
        "Session time",
        `${hour(booking.startHour)} - ${hour(
          booking.endHour
        )} (Asia/Dhaka)`,
      ],
      ["Duration", `${booking.hours} hour(s)`],
      ["Guests", booking.guests],
      ["Hourly rate", money(booking.hourlyRate)],
      ["Rental", money(booking.rentalAmount)],
      ["Security deposit", money(booking.securityDeposit)],
    ];

    for (const [label, value] of lines) {
      doc.text(`${label}: ${value}`, { lineGap: 5 });
    }

    doc
      .moveDown()
      .fillColor("#7047eb")
      .fontSize(17)
      .text(`Total quoted: ${money(booking.totalAmount)}`);

    doc
      .moveDown()
      .fillColor("#555555")
      .fontSize(10)
      .text(
        "This document confirms a reservation and its quoted costs. " +
          "It is not proof of payment or a tax invoice. " +
          "StudioSpace does not collect online payments.",
        { lineGap: 3 }
      );

    doc.end();
  });
}