const careTeamService = require("../services/careTeam.service");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const response = require("../utils/response");

/**
 * Admin-side care-team management.
 *
 * Section 25 puts the doctor/patient relationship under Admin control, so this is
 * the surface that establishes and withdraws it. A doctor can see who is on
 * their team but can never add to it themselves - otherwise the access control
 * the doctor module depends on would be self-serve.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const listAssignments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.doctorId) filter.doctor = req.query.doctorId;
    if (req.query.patientId) filter.patient = req.query.patientId;
    if (req.query.includeRevoked !== "true") filter.revokedAt = null;

    const assignments = await DoctorPatientAssignment.find(filter)
      .populate("doctor", "name email nmcNumber department")
      .populate("patient", "name email")
      .populate("assignedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return response.success(res, assignments, 200, "Care team assignments loaded");
  } catch (error) {
    return next(error);
  }
};

const assign = async (req, res, next) => {
  try {
    const assignment = await careTeamService.assign({
      doctorId: req.params.doctorId,
      patientId: req.body.patientId,
      relationship: req.body.relationship,
      actor: req.user,
    });
    return response.success(res, assignment, 201, "Patient assigned to doctor");
  } catch (error) {
    return next(error);
  }
};

const revoke = async (req, res, next) => {
  try {
    const assignment = await careTeamService.revoke({
      doctorId: req.params.doctorId,
      patientId: req.params.patientId,
      actor: req.user,
    });
    return response.success(res, assignment, 200, "Access revoked");
  } catch (error) {
    return next(error);
  }
};

/** Re-assigns a patient without losing the audit trail of the change. */
const reassign = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const { patientId, relationship, newDoctorId } = req.body;

    if (!newDoctorId) fail("Please choose the doctor to hand this patient to", 422);

    await careTeamService.revoke({ doctorId, patientId, actor: req.user });
    const assignment = await careTeamService.assign({
      doctorId: newDoctorId,
      patientId,
      relationship,
      actor: req.user,
    });

    return response.success(res, assignment, 200, "Patient reassigned");
  } catch (error) {
    return next(error);
  }
};

module.exports = { listAssignments, assign, revoke, reassign };
