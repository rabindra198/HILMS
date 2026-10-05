const doctorReportService = require("../services/doctorReport.service");
const response = require("../utils/response");

/**
 * Doctor-side laboratory report review and comparison (FR-DR-07, FR-DR-08).
 *
 * This is the read/interpret half of the laboratory workflow. The existing
 * `/doctor/laboratory` router owns ordering and sample collection; nothing here
 * may write to a result, so the doctor's interpretation can never corrupt a
 * verified measurement.
 */

const list = async (req, res, next) => {
  try {
    const { items, pagination } = await doctorReportService.list(req.user._id, req.query);
    return response.success(res, items, 200, "Reports loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

const getOne = async (req, res, next) => {
  try {
    const report = await doctorReportService.getReport(req.user._id, req.params.id);
    return response.success(res, report, 200, "Report loaded");
  } catch (error) {
    return next(error);
  }
};

/** Previous verified reports for the same patient and test. */
const history = async (req, res, next) => {
  try {
    const reports = await doctorReportService.history(req.user._id, {
      patient: req.query.patient,
      test: req.query.test,
      limit: req.query.limit,
    });
    return response.success(res, reports, 200, "Report history loaded");
  } catch (error) {
    return next(error);
  }
};

/** Parameter-by-parameter comparison against an earlier report. */
const compare = async (req, res, next) => {
  try {
    const comparison = await doctorReportService.compare(req.user._id, {
      report: req.query.report,
      previousReport: req.query.previousReport,
    });
    return response.success(res, comparison, 200, "Comparison ready");
  } catch (error) {
    return next(error);
  }
};

/** Appends the doctor's comment, interpretation and treatment outcome. */
const addComment = async (req, res, next) => {
  try {
    const report = await doctorReportService.addComment(
      req.user._id,
      req.params.id,
      req.body,
      req.user
    );
    return response.success(res, report, 200, "Comment added");
  } catch (error) {
    return next(error);
  }
};

const listForPatient = async (req, res, next) => {
  try {
    const { items, pagination } = await doctorReportService.listForPatient(
      req.user._id,
      req.params.patientId,
      req.query
    );
    return response.success(res, items, 200, "Patient reports loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

module.exports = { list, listForPatient, getOne, history, compare, addComment };
