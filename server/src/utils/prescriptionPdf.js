const PDFDocument = require("pdfkit");

/**
 * FR-DR-04: "The system shall generate a printable prescription and a PDF
 * prescription from the recorded items."
 *
 * The service layer owns the document *content* (`prescriptionService.buildDocument`)
 * and this module only draws it. That split is what keeps the browser print view
 * and the downloaded PDF from drifting apart: both consume the same payload, so
 * a field added to one appears in the other.
 *
 * The builder returns a Buffer rather than piping to the response, so the caller
 * decides whether to download, inline, or attach. It also means a rendering error
 * is caught before any bytes reach the client, instead of truncating a download.
 */

const TEAL = "#1f4a40";
const TEAL_MID = "#2e7c67";
const INK = "#25332e";
const MUTED = "#5b6b65";
const LINE = "#d9e2dd";
const BAND = "#dcefe7";

const PAGE_MARGIN = 48;

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const formatTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

/** `ONCE_DAILY` -> `Once daily`. Falls back to the raw enum for future values. */
const humanise = (value) => {
  if (!value) return "-";
  const words = String(value).toLowerCase().split("_");
  return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ");
};

const label = (value) => (value ? String(value).replace(/_/g, " ").toLowerCase() : "-");

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;

/** A "Name: value" line, with the label in muted small caps. */
const fieldRow = (doc, x, y, width, { label: fieldLabel, value, bold = false }) => {
  const text = value ? String(value) : "-";
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(bold ? INK : MUTED);
  doc.text(fieldLabel.toUpperCase(), x, y, { width, continued: false });
  const labelHeight = doc.heightOfString(fieldLabel.toUpperCase(), { width });

  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10.5).fillColor(INK);
  doc.text(text, x, y + labelHeight + 1, { width });
  return y + labelHeight + doc.heightOfString(text, { width }) + 10;
};

const drawItemsTable = (doc, items, startY) => {
  const columns = [
    { label: "#", width: 22, align: "left" },
    { label: "Medicine", width: 132, align: "left" },
    { label: "Dosage", width: 74, align: "left" },
    { label: "Frequency", width: 84, align: "left" },
    { label: "Duration", width: 66, align: "left" },
    { label: "Route", width: 58, align: "left" },
    { label: "Qty", width: 36, align: "right" },
  ];
  const instructionsWidth = 30;

  let y = startY;

  // Header band
  doc.rect(PAGE_MARGIN, y, 545, 22).fill(BAND);
  let x = PAGE_MARGIN + 8;
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEAL);
  columns.forEach((column) => {
    doc.text(column.label.toUpperCase(), x, y + 7, { width: column.width - 8, align: column.align });
    x += column.width;
  });
  y += 26;

  const rowHeight = (item) => {
    const instructionText = item.instructions ? `Instructions: ${item.instructions}` : "";
    return Math.max(20, doc.font("Helvetica").fontSize(9).heightOfString(instructionText, { width: 545 - instructionsWidth }) + 10);
  };

  items.forEach((item, index) => {
    const height = rowHeight(item);

    // A new page is drawn *before* the row, so a row is never split in half.
    if (y + height > 720) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    if (index % 2 === 1) {
      doc.rect(PAGE_MARGIN, y - 3, 545, height).fill("#f7faf8");
    }

    x = PAGE_MARGIN + 8;
    doc.font("Helvetica").fontSize(9).fillColor(INK);
    doc.text(String(index + 1), x, y, { width: columns[0].width - 8 });
    x += columns[0].width;

    doc.font("Helvetica-Bold").text(item.medicine || "-", x, y, { width: columns[1].width - 8 });
    x += columns[1].width;

    doc.font("Helvetica").text(item.dosage || "-", x, y, { width: columns[2].width - 8 });
    x += columns[2].width;

    doc.text(humanise(item.frequency), x, y, { width: columns[3].width - 8 });
    x += columns[3].width;

    doc.text(item.duration || "-", x, y, { width: columns[4].width - 8 });
    x += columns[4].width;

    doc.text(label(item.route), x, y, { width: columns[5].width - 8 });
    x += columns[5].width;

    doc.text(item.quantity == null ? "-" : String(item.quantity), x, y, {
      width: columns[6].width - 8,
      align: "right",
    });

    if (item.instructions) {
      doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED);
      doc.text(`Instructions: ${item.instructions}`, PAGE_MARGIN + 8, y + 11, { width: 545 - instructionsWidth });
      doc.font("Helvetica").fillColor(INK);
    }

    doc.moveTo(PAGE_MARGIN, y + height - 4).lineTo(PAGE_MARGIN + 545, y + height - 4).lineWidth(0.5).strokeColor(LINE).stroke();
    y += height;
  });

  return y;
};

/**
 * Renders `buildDocument`'s payload to a PDF Buffer.
 *
 * @param {object} documentData the payload from `prescriptionService.buildDocument`
 * @returns {Promise<Buffer>}
 */
const buildPrescriptionPdf = (documentData) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // `buildDocument` returns a FLAT payload: `prescriptionNo`, `issuedAt`,
    // `status`, `notes` and `followUpDate` sit at the top level, beside
    // `patient`, `doctor`, `items` and `consultation`. Reading them off a
    // nested `prescription` object silently printed a page of dashes.
    const { patient = {}, doctor = {}, items = [], consultation = null } = documentData;
    const prescriptionNo = documentData.prescriptionNo;
    const issuedAt = documentData.issuedAt;
    const status = documentData.status;
    const notes = documentData.notes;
    const followUpDate = documentData.followUpDate;

    // ---- Masthead ----
    doc.rect(PAGE_MARGIN, PAGE_MARGIN, 545, 66).fill(TEAL);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(17).text("HILMS", PAGE_MARGIN + 18, PAGE_MARGIN + 14);
    doc.font("Helvetica").fontSize(9).text("Hospital Information & Laboratory Management System", PAGE_MARGIN + 18, PAGE_MARGIN + 36);
    doc.fontSize(8).text("Prescription", PAGE_MARGIN + 18, PAGE_MARGIN + 50);

    doc.font("Helvetica-Bold").fontSize(12).text(prescriptionNo || "-", PAGE_MARGIN + 360, PAGE_MARGIN + 18, {
      width: 167,
      align: "right",
    });
    doc.font("Helvetica").fontSize(8).fillColor("#cfe3da").text(`Issued ${formatDate(issuedAt)}`, PAGE_MARGIN + 340, PAGE_MARGIN + 36, {
      width: 187,
      align: "right",
    });
    doc.fillColor("#ffffff").fontSize(8).text(`Status ${humanise(status)}`, PAGE_MARGIN + 340, PAGE_MARGIN + 48, {
      width: 187,
      align: "right",
    });

    let y = PAGE_MARGIN + 84;

    // ---- Patient & prescriber ----
    const columnWidth = 262;
    const leftX = PAGE_MARGIN + 4;
    const rightX = PAGE_MARGIN + 288;

    let leftY = y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL_MID).text("PATIENT", leftX, leftY);
    leftY += 15;
    leftY = fieldRow(doc, leftX, leftY, columnWidth, { label: "Name", value: patient.name, bold: true });
    leftY = fieldRow(doc, leftX, leftY, columnWidth, { label: "Reference", value: patient.reference });

    const half = (columnWidth - 14) / 2;
    const rowY = leftY;
    const age = patient.age != null ? `${patient.age} yrs` : null;
    fieldRow(doc, leftX, rowY, half, { label: "Age", value: age });
    fieldRow(doc, leftX + half + 14, rowY, half, { label: "Gender", value: patient.gender });
    leftY = rowY + 34;

    leftY = fieldRow(doc, leftX, leftY, columnWidth, {
      label: "Blood group",
      value: patient.bloodGroup,
    });
    fieldRow(doc, leftX, leftY, columnWidth, { label: "Contact", value: patient.contactNumber });

    let rightY = y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL_MID).text("PRESCRIBED BY", rightX, rightY);
    rightY += 15;
    rightY = fieldRow(doc, rightX, rightY, columnWidth, { label: "Doctor", value: doctor.name, bold: true });
    rightY = fieldRow(doc, rightX, rightY, columnWidth, { label: "Department", value: doctor.department });
    rightY = fieldRow(doc, rightX, rightY, columnWidth, { label: "Qualification", value: doctor.qualification });
    rightY = fieldRow(doc, rightX, rightY, columnWidth, { label: "NMC number", value: doctor.nmcNumber });

    y = Math.max(leftY, rightY) + 4;

    // Allergy callout. Printed because a drug that clashes with it is the single
    // most consequential thing on this page being missed.
    if (patient.allergies) {
      // Warm coral tint rather than the old sand: this band carries dark red text,
// and a teal fill would read as reassurance on a drug-allergy warning.
      doc.rect(PAGE_MARGIN, y, 545, 30).fill("#ffe0da");
      doc.fillColor("#a33b1f").font("Helvetica-Bold").fontSize(9).text("ALLERGIES", PAGE_MARGIN + 12, y + 6);
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(patient.allergies, PAGE_MARGIN + 78, y + 6, { width: 455 });
      y += 40;
    }

    // ---- Diagnosis, when the prescription is consultation-linked ----
    if (consultation?.diagnosis) {
      doc.rect(PAGE_MARGIN, y, 545, 34).fill("#f2f8f5");
      doc.fillColor(TEAL_MID).font("Helvetica-Bold").fontSize(9).text("DIAGNOSIS", PAGE_MARGIN + 12, y + 6);
      doc.fillColor(INK).font("Helvetica").fontSize(9.5).text(consultation.diagnosis, PAGE_MARGIN + 90, y + 6, { width: 443 });
      y += 44;
    }

    // ---- Medication ----
    doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL_MID).text("MEDICATION", PAGE_MARGIN, y);
    y += 16;
    y = drawItemsTable(doc, items || [], y);

    // ---- Notes & follow-up ----
    if (notes) {
      y += 8;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL_MID).text("NOTES", PAGE_MARGIN, y);
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(notes, PAGE_MARGIN, y + 13, { width: 545 });
      y += 13 + doc.heightOfString(notes, { width: 545 }) + 8;
    }

    if (followUpDate) {
      doc.rect(PAGE_MARGIN, y, 545, 28).fill(BAND);
      doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(9.5).text(
        `Follow-up: ${formatDate(followUpDate)}`,
        PAGE_MARGIN + 12,
        y + 9
      );
      y += 38;
    }

    // ---- Signature ----
    const signatureY = Math.max(y + 18, 660);
    doc.moveTo(PAGE_MARGIN + 300, signatureY).lineTo(PAGE_MARGIN + 545, signatureY).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(
      `${doctor.name || "Doctor"}${doctor.qualification ? `, ${doctor.qualification}` : ""}`,
      PAGE_MARGIN + 300,
      signatureY + 5,
      { width: 245, align: "center" }
    );

    // ---- Footer on every page ----
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
      doc.text(
        `Generated by HILMS on ${formatDate(new Date())} at ${formatTime(new Date())}. Verify against the patient's clinical record before dispensing.`,
        PAGE_MARGIN,
        790,
        { width: 420 }
      );
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE_MARGIN + 430, 790, { width: 115, align: "right" });
    }

    doc.end();
  });

/** A filesystem-safe name for the download, e.g. `RX-2026-0001.pdf`. */
const pdfFileName = (documentData) => {
  const number = String(documentData?.prescriptionNo || "prescription")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${number || "prescription"}.pdf`;
};

module.exports = { buildPrescriptionPdf, pdfFileName };
