const LabReport = require("../models/LabReport");
const LabResult = require("../models/LabResult");
const LabTest = require("../models/LabTest");
const Notification = require("../models/Notification");
const auditService = require("./audit.service");
const notificationService = require("./notification.service");
const careTeamService = require("./careTeam.service");
const { deriveFlag, formatDate } = require("../utils/clinical");

/**
 * A report the doctor may act on is one the laboratory has RELEASED: VERIFIED
 * (checked and sent to the doctor) or APPROVED (finalised). A SUPERSEDED revision
 * drops out - its replacement is the one to read.
 *
 * Imported rather than redeclared so the release rule has exactly one definition.
 */
const { RELEASED_REPORT_STATUSES: RELEASED } = require("./lab.service");
const emailService = require("./email.service");

/**
 * Doctor-side laboratory report review (FR-DR-07, FR-DR-08).
 *
 * The laboratory owns the *measurement*; the doctor owns the *interpretation*.
 * This service therefore only ever appends to `doctorComments` and never writes
 * to `remarks`, `parameters` or `status`, so a review cannot silently corrupt a
 * verified result.
 *
 * A report is only visible to the doctor who requested it, and only while that
 * patient is still in the doctor's care team.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

/**
 * Loads the result rows attached to specific reports, keyed by REPORT id.
 *
 * Keying by `labRequest` - which is what this used to do - is wrong once a report
 * has been revised. A revision is a second report on the SAME request, and every
 * revision copies its results forward, so querying by request returned the
 * superseded numbers and the corrected numbers together. The doctor comparing a
 * revised report then saw each parameter twice and whichever row sorted first,
 * which is usually the stale value: a corrected report could be read as still
 * showing the number it was corrected for.
 *
 * Each report's own `results` array is the only reliable link, so that is what is
 * resolved here. One query for all the reports passed in.
 */
const resultsByReport = async (reports) => {
  const list = Array.isArray(reports) ? reports : [reports];
  // Tolerates both an unpopulated id and an already-populated document.
  const idOf = (value) => String(value?._id ?? value);

  const ids = list.flatMap((report) => (report.results || []).map(idOf));
  if (!ids.length) return new Map();

  const rows = await LabResult.find({ _id: { $in: ids } }).sort({ createdAt: 1 }).lean();
  const byResultId = new Map(rows.map((row) => [String(row._id), row]));

  const grouped = new Map();
  for (const report of list) {
    grouped.set(
      idOf(report),
      (report.results || []).map((ref) => byResultId.get(idOf(ref))).filter(Boolean)
    );
  }
  return grouped;
};

/** The result rows `resultsByReport` grouped under a report's own id. */
const rowsFor = (grouped, report) => grouped.get(String(report._id)) || [];

/**
 * Loads a report the requesting doctor is allowed to read.
 *
 * The status filter is load-bearing, not decoration: a doctor may only act on a
 * RELEASED report. Without it, a superseded report stayed fetchable by direct id
 * after a correction, so a doctor holding an old link would keep reading numbers
 * the laboratory had already withdrawn and replaced.
 */
const getAccessibleReport = async (doctorId, reportId) => {
  const report = await LabReport.findOne({ _id: reportId, doctor: doctorId, status: { $in: RELEASED } })
    .populate("patient", "name email contactNumber phone dateOfBirth gender bloodGroup allergies")
    .populate("test", "name testName category sampleType referenceRanges normalRange unit")
    .populate("labRequest", "priority clinicalNotes requestedDate status")
    .populate("sample", "sampleId collectionDate sampleType")
    .populate("verifiedBy", "name email")
    .populate("doctorComments.doctor", "name email")
    .lean();

  if (!report) fail("Report not found", 404);
  await careTeamService.assertAccess(doctorId, report.patient._id);
  return report;
};

/** The report plus every result row attached to it. */
const getReport = async (doctorId, reportId) => {
  const report = await getAccessibleReport(doctorId, reportId);

  const results = rowsFor(await resultsByReport([report]), report);

  return {
    ...report,
    results: results.map((result) => ({
      id: result._id,
      parameters: result.parameters || [],
      attachments: result.attachments || [],
      enteredAt: result.enteredAt,
      updatedAt: result.updatedAt,
    })),
  };
};

/**
 * FR-DR-07: previous verified reports for the same patient AND same test.
 *
 * Filtering by test as well as patient is what makes the comparison meaningful -
 * comparing haemoglobin against a lipid panel produces noise. Parameter-level
 * alignment happens in `compare`, which matches on the parameter name so a
 * reordered or partially-typed panel still lines up.
 */
const history = async (doctorId, { patient, test, limit = 5 } = {}) => {
  if (!patient || !test) fail("A patient and a test are required", 422);
  await careTeamService.assertAccess(doctorId, patient);

  const reports = await LabReport.find({ patient, test, status: { $in: RELEASED } })
    .populate("test", "name testName category")
    .sort({ generatedAt: -1 })
    .limit(Math.min(20, Math.max(1, Number(limit) || 5)))
    .lean();

  if (!reports.length) return [];

  const grouped = await resultsByReport(reports);

  return reports.map((report) => ({
    id: report._id,
    reportId: report.reportId,
    generatedAt: report.generatedAt,
    verifiedAt: report.verifiedAt,
    status: report.status,
    parameters: (grouped.get(String(report._id)) || []).flatMap((result) => result.parameters || []),
    doctorCommentCount: (report.doctorComments || []).length,
  }));
};

/**
 * FR-DR-07 report comparison.
 *
 * Builds a parameter-by-parameter table: `current` is the report under review,
 * `previous` is whichever earlier report the caller selected (default: the most
 * recent one before it). Parameters present in only one report are still
 * returned with a null on the other side - hiding them would quietly mislead the
 * doctor into thinking a marker was never tested.
 */
const compare = async (doctorId, { report, previousReport } = {}) => {
  if (!report) fail("A report is required", 422);

  const current = await getAccessibleReport(doctorId, report);
  const currentParams = rowsFor(await resultsByReport([current]), current).flatMap((row) => row.parameters || []);

  let previous = null;
  let previousParams = [];

  if (previousReport) {
    previous = await getAccessibleReport(doctorId, previousReport);
    if (String(previous._id) === String(current._id)) {
      fail("Choose two different reports to compare", 422);
    }
    previousParams = rowsFor(await resultsByReport([previous]), previous).flatMap((row) => row.parameters || []);
  } else {
    // Default to the most recent earlier report for the same patient and test.
    // `doctor: doctorId` matters: `getAccessibleReport` only ever returns reports
    // this doctor ordered, so without it the most recent earlier report could be
    // someone else's and the comparison threw 404 instead of falling back to the
    // previous one this doctor can actually open.
    const candidate = await LabReport.findOne({
      doctor: doctorId,
      patient: current.patient._id,
      test: current.test._id,
      status: { $in: RELEASED },
      _id: { $ne: current._id },
      generatedAt: { $lt: current.generatedAt || new Date() },
    })
      .sort({ generatedAt: -1 })
      .lean();

    if (candidate) {
      previous = await getAccessibleReport(doctorId, candidate._id);
      previousParams = rowsFor(await resultsByReport([candidate]), candidate).flatMap((row) => row.parameters || []);
    }
  }

  const names = new Set([
    ...currentParams.map((p) => p.parameter),
    ...previousParams.map((p) => p.parameter),
  ]);

  const rows = [...names].map((name) => {
    const now = currentParams.find((p) => p.parameter === name) || null;
    const before = previousParams.find((p) => p.parameter === name) || null;

    // Trust the laboratory's stored flag; only fall back to deriving one from
    // the reference range when the lab left it unset.
    const flag = now?.flag || deriveFlag(now?.value, now?.referenceRange) || "NORMAL";

    return {
      parameter: name,
      current: now
        ? { value: now.value, unit: now.unit || current.test?.unit || null, referenceRange: now.referenceRange || null, flag }
        : null,
      previous: before
        ? {
            value: before.value,
            unit: before.unit || current.test?.unit || null,
            referenceRange: before.referenceRange || null,
            flag: before.flag || deriveFlag(before.value, before.referenceRange) || "NORMAL",
          }
        : null,
      // "IMPROVED" / "WORSENED" only when both sides are numeric and the same
      // direction of travel is meaningful. For a falling-marker like glucose a
      // rise is the bad direction, which the reference range already encodes,
      // so this reports movement and lets the flag carry severity.
      changed: Boolean(now && before && now.value !== before.value),
      status: now ? (now.flag && now.flag !== "NORMAL" ? "ABNORMAL" : "NORMAL") : "NOT_TESTED",
    };
  });

  return {
    current: {
      id: current._id,
      reportId: current.reportId,
      date: formatDate(current.generatedAt),
      generatedAt: current.generatedAt,
      test: current.test?.name || current.test?.testName || null,
    },
    previous: previous
      ? {
          id: previous._id,
          reportId: previous.reportId,
          date: formatDate(previous.generatedAt),
          generatedAt: previous.generatedAt,
          test: previous.test?.name || previous.test?.testName || null,
        }
      : null,
    rows,
  };
};

/**
 * FR-DR-07 "add comments" + FR-DR-08 "record treatment outcome".
 *
 * One append-only entry per review. Notifies the patient that a doctor has
 * commented on their report, which is the hook that starts them reading it in
 * the Patient module.
 */
const addComment = async (doctorId, reportId, payload, actor) => {
  const report = await LabReport.findOne({ _id: reportId, doctor: doctorId });
  if (!report) fail("Report not found", 404);
  await careTeamService.assertAccess(doctorId, report.patient);

  if (!RELEASED.includes(report.status)) {
    fail("Only a verified or approved report can be reviewed by a doctor", 409);
  }

  const comment = String(payload.comment || "").trim();
  if (!comment) fail("A comment is required", 422);

  report.doctorComments.push({
    comment,
    interpretation: payload.interpretation ? String(payload.interpretation).trim() : undefined,
    treatmentDecision: payload.treatmentDecision
      ? String(payload.treatmentDecision).trim()
      : undefined,
    outcome: payload.outcome ? String(payload.outcome).trim() : undefined,
    doctor: doctorId,
    commentedAt: new Date(),
  });
  await report.save();

  await auditService.record({
    action: "LAB_REPORT_REVIEWED",
    actor: actor || { _id: doctorId },
    targetType: "LabReport",
    targetId: report._id,
    metadata: {
      reportId: report.reportId,
      recordedOutcome: Boolean(payload.outcome),
      recordedTreatmentDecision: Boolean(payload.treatmentDecision),
    },
  });

  // Best effort, and deliberately NOT awaited as part of the response path: the
  // doctor's comment is already committed above, so a notification failure must not
  // turn a successful review into a 500 that invites a duplicate submission.
  // `notifyUser` swallows its own errors for the same reason.
  notificationService.notifyUser({
    recipient: report.patient,
    type: "LAB_REPORT_COMMENTED",
    title: "Your doctor commented on a lab report",
    message: `A doctor has added a clinical comment to report ${report.reportId}. Sign in to read it.`,
    entityType: "LabReport",
    entityId: report._id,
  });

  return report.populate("doctorComments.doctor", "name email");
};

/** Released (verified or approved) reports for the doctor's assigned patients. */
const list = async (doctorId, query = {}) => {
  const filter = { doctor: doctorId, status: { $in: RELEASED } };

  if (query.patient) {
    await careTeamService.assertAccess(doctorId, query.patient);
    filter.patient = query.patient;
  } else {
    const patientIds = await careTeamService.assignedPatientIds(doctorId);
    if (!patientIds.length) return { items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } };
    filter.patient = { $in: patientIds };
  }

  if (query.test) {
    // An unknown test id must not silently return an empty list that reads as
    // "this patient has no reports".
    const testExists = await LabTest.exists({ _id: query.test });
    if (!testExists) fail("Laboratory test not found", 404);
    filter.test = query.test;
  }

  // "Awaiting my review" and "Reviewed by me" are both offered by the report screen.
  // Only the negative half was implemented, so choosing "Reviewed by me" silently
  // returned every report - the chip looked like it worked and did nothing.
  if (query.reviewed === "false") {
    filter.doctorComments = { $not: { $elemMatch: { doctor: doctorId } } };
  } else if (query.reviewed === "true") {
    filter.doctorComments = { $elemMatch: { doctor: doctorId } };
  }

  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safe, "i");
    filter.$or = [{ reportId: regex }, { remarks: regex }];
  }

  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const [items, total] = await Promise.all([
    LabReport.find(filter)
      .populate("patient", "name email")
      .populate("test", "name testName category")
      .populate("labRequest", "priority requestedDate status")
      .sort({ verifiedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LabReport.countDocuments(filter),
  ]);

  return {
    items: items.map((row) => ({
      ...row,
      commentCount: (row.doctorComments || []).length,
      reviewed: (row.doctorComments || []).some((c) => String(c.doctor) === String(doctorId)),
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

module.exports = { getReport, getAccessibleReport, list, history, compare, addComment };
