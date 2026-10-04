const prescriptionService = require("../services/prescription.service");
const { buildPrescriptionPdf, pdfFileName } = require("../utils/prescriptionPdf");
const response = require("../utils/response");

/** Prescriptions (FR-DR-03) and the printable document (FR-DR-04). */

const create = async (req, res, next) => {
  try {
    const prescription = await prescriptionService.create(req.body, req.user._id, req.user);
    return response.success(res, prescription, 201, "Prescription issued");
  } catch (error) {
    return next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const { items, pagination } = await prescriptionService.list(req.user._id, req.query);
    return response.success(res, items, 200, "Prescriptions loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

const getOne = async (req, res, next) => {
  try {
    const prescription = await prescriptionService.getOne(req.user._id, req.params.id);
    return response.success(res, prescription, 200, "Prescription loaded");
  } catch (error) {
    return next(error);
  }
};

/**
 * The print/PDF payload. Returned as JSON rather than a generated file so the
 * browser print stylesheet and the PDF renderer read one identical document,
 * guaranteeing the printed output matches what the doctor reviewed.
 */
const getDocument = async (req, res, next) => {
  try {
    const document = await prescriptionService.buildDocument(req.user._id, req.params.id);
    return response.success(res, document, 200, "Prescription document ready");
  } catch (error) {
    return next(error);
  }
};

/**
 * FR-DR-04: the PDF prescription.
 *
 * Built in full before a single byte is sent, so a rendering failure returns a
 * normal JSON error instead of a truncated, unopenable download. `inline` is the
 * default so the file can also be previewed in a new tab; `?download=true` sets
 * the attachment disposition.
 */
const getDocumentPdf = async (req, res, next) => {
  try {
    const document = await prescriptionService.buildDocument(req.user._id, req.params.id);
    const pdf = await buildPrescriptionPdf(document);

    const disposition = req.query.download === "true" ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Content-Disposition", `${disposition}; filename="${pdfFileName(document)}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(pdf);
  } catch (error) {
    return next(error);
  }
};

module.exports = { create, list, getOne, getDocument, getDocumentPdf };
