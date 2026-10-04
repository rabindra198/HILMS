const careTeamService = require("../services/careTeam.service");
const medicalHistoryService = require("../services/medicalHistory.service");
const response = require("../utils/response");

/**
 * Patient clinical workspace (FR-DR-02, section 9).
 *
 * Every handler here is scoped to the requesting doctor. There is no code path
 * that reads a patient without `careTeamService.assertAccess` running first, so
 * an unassigned patient id resolves to 404 rather than leaking a record.
 */

/** The doctor-scoped patient list used by the "My Patients" screen. */
const listPatients = async (req, res, next) => {
  try {
    const patients = await careTeamService.assignedPatients(req.user._id, {
      search: req.query.search,
    });
    return response.success(res, patients, 200, "Patients loaded");
  } catch (error) {
    return next(error);
  }
};

/** The clinical header: demographics, allergies, care team, at-a-glance counts. */
const getPatient = async (req, res, next) => {
  try {
    const patient = await medicalHistoryService.getPatient(req.user._id, req.params.patientId);
    return response.success(res, patient, 200, "Patient loaded");
  } catch (error) {
    return next(error);
  }
};

/** The longitudinal medical history timeline. */
const getHistory = async (req, res, next) => {
  try {
    const history = await medicalHistoryService.getHistory(
      req.user._id,
      req.params.patientId,
      req.query
    );
    return response.success(res, history, 200, "Medical history loaded");
  } catch (error) {
    return next(error);
  }
};

/** This doctor's previous consultations with the patient. */
const getConsultations = async (req, res, next) => {
  try {
    const { items, pagination } = await medicalHistoryService.getConsultations(
      req.user._id,
      req.params.patientId,
      req.query
    );
    return response.success(res, items, 200, "Consultations loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listPatients, getPatient, getHistory, getConsultations };
