const User = require("../models/User");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const auditService = require("./audit.service");

/**
 * Care-team access control (section 25).
 *
 * This service is the single authority on "may this doctor treat this patient".
 * Every doctor endpoint calls `assertAccess` before it reads or writes any
 * patient-scoped data, so the check cannot be forgotten by an individual route.
 *
 * Design notes:
 *  - A doctor with an Admin-assigned care team sees exactly those patients.
 *  - The scope is a *ceiling*, not a grant of access to unrelated patients: even
 *    for an assigned patient, the doctor still only reaches the clinical records
 *    the doctor module exposes.
 *  - Every rejection is 404, not 403. A 403 would confirm that the patient
 *    record exists, which turns the endpoint into a patient-identifier oracle.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

/**
 * Throws unless `doctorId` is assigned to `patientId`.
 * Returns the patient document so callers avoid a second lookup.
 *
 * The select deliberately carries the demographic and clinical-identifying
 * fields. A printable prescription and a medical-history header both have to
 * show age, gender and blood group, and re-querying the patient per document is
 * how those fields silently end up null on the printed page.
 *
 * Returns `lean()` plain objects rather than Mongoose documents on purpose: a
 * `{ ...patient }` spread of a hydrated document copies `_doc` and `$__`, not the
 * fields, so the demographics silently vanished from the prescription payload.
 */
const assertAccess = async (doctorId, patientId) => {
  if (!doctorId || !patientId) fail("A doctor and a patient are required", 422);

  const patient = await User.findOne({
    _id: patientId,
    role: "patient",
    // A revoked or deactivated account must stop yielding clinical records even
    // while the care-team assignment row is still live.
    status: "APPROVED",
    isActive: true,
  })
    .select(
      "name email phone contactNumber address dateOfBirth gender bloodGroup allergies emergencyContactName emergencyContactNumber"
    )
    .lean();

  if (!patient) fail("Patient not found", 404);

  const assignment = await DoctorPatientAssignment.findOne({
    doctor: doctorId,
    patient: patientId,
    revokedAt: null,
  })
    .select("_id")
    .lean();

  if (!assignment) fail("Patient not found", 404);

  return { patient, assignment };
};

/** True when the doctor is assigned to the patient. Never throws. */
const hasAccess = async (doctorId, patientId) => {
  try {
    await assertAccess(doctorId, patientId);
    return true;
  } catch {
    return false;
  }
};

/** The ObjectIds of every patient currently assigned to this doctor. */
const assignedPatientIds = async (doctorId, { includeRevoked = false } = {}) => {
  const filter = { doctor: doctorId };
  if (!includeRevoked) filter.revokedAt = null;
  const assignments = await DoctorPatientAssignment.find(filter).select("patient").lean();
  return assignments.map((row) => row.patient);
};

/**
 * The doctor's patient list, as documents (not just ids) so the caller can
 * render a name without a second round trip.
 */
const assignedPatients = async (doctorId, { search } = {}) => {
  const ids = await assignedPatientIds(doctorId);
  if (!ids.length) return [];

  const filter = { _id: { $in: ids }, role: "patient", status: "APPROVED", isActive: true };

  if (search) {
    // Escape the input: an unescaped regex from a search box is a ReDoS and an
    // enumeration vector.
    const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: new RegExp(safe, "i") }, { email: new RegExp(safe, "i") }];
  }

  return User.find(filter)
    .select("name email phone contactNumber address")
    .sort({ name: 1 })
    .lean();
};

/** Assigns a patient to a doctor. Idempotent - re-assigning is not an error. */
const assign = async ({ doctorId, patientId, relationship, actor }) => {
  const [doctor, patient] = await Promise.all([
    User.findOne({ _id: doctorId, role: "doctor" }).select("_id name email"),
    User.findOne({ _id: patientId, role: "patient" }).select("_id name email"),
  ]);

  if (!doctor) fail("Doctor not found", 404);
  if (!patient) fail("Patient not found", 404);

  const existing = await DoctorPatientAssignment.findOne({
    doctor: doctorId,
    patient: patientId,
    revokedAt: null,
  });

  if (existing) return existing;

  // The unique partial index makes a concurrent double-assign fail with 11000;
  // re-reading turns that race into the same successful, idempotent outcome.
  let assignment;
  try {
    assignment = await DoctorPatientAssignment.create({
      doctor: doctorId,
      patient: patientId,
      relationship,
      assignedBy: actor?._id,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    assignment = await DoctorPatientAssignment.findOne({
      doctor: doctorId,
      patient: patientId,
      revokedAt: null,
    });
    return assignment;
  }

  await auditService.record({
    action: "CARE_TEAM_ASSIGNED",
    actor,
    targetType: "DoctorPatientAssignment",
    targetId: assignment._id,
    targetEmail: patient.email,
    metadata: { doctorId: String(doctorId), patientId: String(patientId), relationship },
  });

  return assignment;
};

/**
 * Revokes access. Soft, so the history of who could see which patient survives
 * for audit rather than vanishing with the row.
 */
const revoke = async ({ doctorId, patientId, actor }) => {
  const assignment = await DoctorPatientAssignment.findOneAndUpdate(
    { doctor: doctorId, patient: patientId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );

  if (!assignment) fail("That doctor is not currently assigned to this patient", 404);

  await auditService.record({
    action: "CARE_TEAM_REVOKED",
    actor,
    targetType: "DoctorPatientAssignment",
    targetId: assignment._id,
    metadata: { doctorId: String(doctorId), patientId: String(patientId) },
  });

  return assignment;
};

/** Every doctor currently assigned to a patient (the patient-facing "care team"). */
const careTeamFor = async (patientId) => {
  const assignments = await DoctorPatientAssignment.find({ patient: patientId, revokedAt: null })
    .populate("doctor", "name email nmcNumber")
    .lean();

  return assignments
    .map((row) => row.doctor)
    .filter(Boolean)
    .map((doctor) => ({
      id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      nmcNumber: doctor.nmcNumber || null,
    }));
};

module.exports = {
  assertAccess,
  hasAccess,
  assignedPatientIds,
  assignedPatients,
  assign,
  revoke,
  careTeamFor,
};
