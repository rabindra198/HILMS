import PDFDocument from "pdfkit";

const idOf = (value) => {
  if (!value) return undefined;
  return typeof value.toString === "function" ? value.toString() : value;
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
};

const hospitalName = () => process.env.HOSPITAL_NAME || "HILMS Hospital";

/**
 * Generate a prescription PDF from real database data.
 * Expects a prescription document populated with `doctor` (incl. user) and `patient`.
 */
export const generatePrescriptionPdf = (prescription) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const doctor =
      prescription.doctor && typeof prescription.doctor === "object"
        ? prescription.doctor
        : null;
    const doctorUser = doctor && doctor.user && typeof doctor.user === "object" ? doctor.user : null;
    const doctorName = doctorUser?.name || doctor?.name || "";
    const doctorDepartment = doctor?.department || doctorUser?.department || "";
    const doctorLicense = doctor?.licenseNumber || "";

    const patient =
      prescription.patient && typeof prescription.patient === "object"
        ? prescription.patient
        : null;
    const patientName = patient?.name || "";
    const patientAge = patient?.age != null ? `Age: ${patient.age}` : "";
    const patientGender = patient?.gender ? `Gender: ${patient.gender}` : "";
    const patientPhone = patient?.phone ? `Phone: ${patient.phone}` : "";
    const patientId = patient?.patientId ? `Patient ID: ${patient.patientId}` : "";

    const date = formatDate(prescription.createdAt);
    const medicines = prescription.medicines || [];

    // Header band
    doc.rect(50, 50, 495, 60).fill("#0f766e");
    doc.fill("#ffffff").fontSize(22).font("Helvetica-Bold").text(hospitalName(), 65, 62, { width: 350 });
    doc.fontSize(10).font("Helvetica").text("Hospital Information & Laboratory Management System", 65, 88, { width: 350 });
    doc.fontSize(20).font("Helvetica-Bold").text("Prescription", 350, 68, { width: 180, align: "right" });

    // Meta row
    doc.fill("#334155").fontSize(9).font("Helvetica").text(`Date: ${date || "—"}`, 50, 130).text(`Prescription ID: RX-${idOf(prescription._id) || ""}`, 50, 143);

    // Doctor block
    doc.fill("#0f766e").fontSize(11).font("Helvetica-Bold").text("DOCTOR", 50, 168);
    doc.fill("#1e293b").fontSize(11).font("Helvetica").text(doctorName || "—", 50, 183);
    doc.fontSize(9).text([doctorDepartment, doctorLicense ? `License: ${doctorLicense}` : ""].filter(Boolean).join("    "), 50, 198);

    // Patient block
    doc.fill("#0f766e").fontSize(11).font("Helvetica-Bold").text("PATIENT", 350, 168);
    doc.fill("#1e293b").fontSize(11).font("Helvetica").text(patientName || "—", 350, 183);
    doc.fontSize(9).text([patientAge, patientGender, patientPhone, patientId].filter(Boolean).join("    "), 350, 198, { width: 195 });

    // Diagnosis
    doc.fill("#0f766e").fontSize(11).font("Helvetica-Bold").text("DIAGNOSIS", 50, 240);
    doc.fill("#1e293b").fontSize(11).font("Helvetica").text(prescription.diagnosis || "—", 50, 255, { width: 495 });

    // Medicines table
    let y = 300;
    doc.fill("#0f766e").fontSize(11).font("Helvetica-Bold").text("MEDICINES", 50, y);

    y += 20;
    doc.rect(50, y, 495, 24).fill("#f1f5f9");
    doc.fill("#334155").fontSize(9).font("Helvetica-Bold");
    doc.text("Medicine", 60, y + 8, { width: 110 });
    doc.text("Dosage", 175, y + 8, { width: 80 });
    doc.text("Frequency", 260, y + 8, { width: 90 });
    doc.text("Duration", 355, y + 8, { width: 70 });
    doc.text("Instructions", 430, y + 8, { width: 105 });

    y += 24;
    doc.fill("#1e293b").fontSize(9).font("Helvetica");
    if (medicines.length === 0) {
      doc.text("No medicines prescribed.", 60, y + 4, { width: 400 });
      y += 22;
    } else {
      for (const med of medicines) {
        const height = Math.max(18, doc.heightOfString(med.instructions || "", { width: 105 }) + 6);
        doc.text(med.name || "", 60, y + 2, { width: 110 });
        doc.text(med.dosage || "", 175, y + 2, { width: 80 });
        doc.text(med.frequency || "", 260, y + 2, { width: 90 });
        doc.text(med.duration || "", 355, y + 2, { width: 70 });
        doc.text(med.instructions || "", 430, y + 2, { width: 105 });
        y += height;
        if (y > 700) {
          doc.addPage();
          y = 60;
        }
      }
    }

    // Doctor notes / follow-up
    y += 12;
    if (prescription.notes) {
      doc.fill("#0f766e").fontSize(11).font("Helvetica-Bold").text("DOCTOR'S NOTES", 50, y);
      doc.fill("#1e293b").fontSize(10).font("Helvetica").text(prescription.notes, 50, y + 15, { width: 495 });
      y += 30 + doc.heightOfString(prescription.notes, { width: 495 });
    }
    if (prescription.followUpDate) {
      doc.fill("#0f766e").fontSize(10).font("Helvetica-Bold").text(`Follow-up Date: ${formatDate(prescription.followUpDate)}`, 50, y + 4);
      y += 24;
    }

    // Signature
    doc.moveTo(300, Math.min(740, y + 90)).lineTo(490, Math.min(740, y + 90)).stroke("#94a3b8");
    doc.fill("#1e293b").fontSize(10).font("Helvetica-Bold").text(doctorName || "Doctor", 300, Math.min(740, y + 94), { width: 190, align: "right" });
    doc.fontSize(8).font("Helvetica").text("Doctor Signature", 300, Math.min(740, y + 108), { width: 190, align: "right" });

    doc.end();
  });
};