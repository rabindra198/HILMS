const mongoose = require("mongoose");
const User = require("../models/User");
const LabTest = require("../models/LabTest");
const LabRequest = require("../models/LabRequest");
const SampleCollection = require("../models/SampleCollection");
const LabTestCategory = require("../models/LabTestCategory");
const LabResult = require("../models/LabResult");
const LabReport = require("../models/LabReport");
const Notification = require("../models/Notification");
const LabSettings = require("../models/LabSettings");
const emailService = require("./email.service");
const auditService = require("./audit.service");
const passwordService = require("./password.service");
const { emitToRole, emitToUser } = require("../realtime/socketServer");
const { publishNotification } = require("./notification.service");
const REALTIME_EVENTS = require("../realtime/events");
const { nextSequence, highestExistingSequence, withDuplicateRetry } = require("../utils/sequence");
const { buildQueryPlan, runPaginated, parseDate, fail: queryFail } = require("../utils/pagination");
const sampleLabel = require("../utils/sampleLabel");

const SAMPLE_TYPES = SampleCollection.SAMPLE_TYPES;

// ---------------------------------------------------------------------------
// Workflow vocabulary
// ---------------------------------------------------------------------------

const REQUEST_STATUSES = ["PENDING", "ACCEPTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED", "VERIFIED", "CANCELLED"];

// Every stored spelling of a status, including the legacy lowercase values the
// schema still accepts and the display forms the old service tolerated. One
// place to look, instead of the ad-hoc arrays that were inlined in each query.
const STATUS_VARIANTS = {
  PENDING: ["PENDING", "pending", "Pending"],
  ACCEPTED: ["ACCEPTED", "accepted", "Accepted"],
  SAMPLE_COLLECTED: ["SAMPLE_COLLECTED", "sample_collected", "Sample Collected", "Sample_collected"],
  PROCESSING: ["PROCESSING", "processing", "Processing", "In Progress", "in progress"],
  COMPLETED: ["COMPLETED", "completed", "Completed"],
  VERIFIED: ["VERIFIED", "verified", "Verified"],
  CANCELLED: ["CANCELLED", "cancelled", "Cancelled", "CANCELED", "canceled"],
};

const PRIORITY_VARIANTS = {
  ROUTINE: ["ROUTINE", "routine", "Routine"],
  URGENT: ["URGENT", "urgent", "Urgent"],
  STAT: ["STAT", "stat", "Stat"],
};

const TRANSITIONS = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["SAMPLE_COLLECTED", "CANCELLED"],
  SAMPLE_COLLECTED: ["PROCESSING"],
  PROCESSING: ["COMPLETED"],
  COMPLETED: ["VERIFIED"],
  VERIFIED: [],
  CANCELLED: [],
};

// The only transitions whose target means "this fact is now recorded".
// A generic status patch may not assert them without the backing document.
const REQUIRES = {
  SAMPLE_COLLECTED: {
    check: (request) => SampleCollection.exists({ labRequest: request._id }),
    message: "A collected sample must exist before this request can be marked SAMPLE_COLLECTED. Use POST /lab/samples to record it.",
  },
};

const STATUS_ALIASES = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  sample_collected: "SAMPLE_COLLECTED",
  "sample collected": "SAMPLE_COLLECTED",
  processing: "PROCESSING",
  "in progress": "PROCESSING",
  completed: "COMPLETED",
  verified: "VERIFIED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
};

const normalizeStatus = (value) => {
  const raw = String(value ?? "").trim();
  const key = raw.toLowerCase().replace(/_/g, " ");
  return STATUS_ALIASES[key] || (REQUEST_STATUSES.includes(raw) ? raw : raw.toUpperCase());
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const fail = (message, statusCode = 400, details) => { const error = new Error(message); error.statusCode = statusCode; if (details) error.details = details; throw error; };

/**
 * Appends one entry to the audit trail (SRS NFR-04/NFR-09: every laboratory
 * update must be attributable to a user).
 *
 * The workflow services receive only `req.user._id` from the controller, so the
 * actor's email and role are resolved here rather than being written empty.
 * `auditService.record` never throws into the request path, so a failed audit
 * write cannot roll back a laboratory action that already completed.
 */
const audit = async (userId, { action, targetType, targetId, targetEmail, metadata }) => {
  if (!userId) return null;
  const actor = await User.findById(userId).select("email role").lean();
  return auditService.record({
    action,
    actor: actor || { _id: userId },
    targetType,
    targetId,
    targetEmail,
    metadata,
  });
};

/**
 * Fans a notification out to every active laboratory user (SRS 8.1: a new
 * request must reach the laboratory, not sit unseen in the queue).
 *
 * Honours each recipient's own alert preference from /lab/settings - a
 * technician who switched urgent-request alerts off stops receiving them, which
 * is the entire point of that screen.
 *
 * Best effort - a notification failure must never fail the business action that
 * triggered it, and a lab with no active accounts simply produces no rows.
 */
const notifyLabStaff = async ({ type, title, message, entityType, entityId, preference }) => {
  try {
    const staff = await User.find({ role: "lab", isActive: true }).select("_id").lean();
    if (!staff.length) return;
    const recipients = await Promise.all(
      staff.map(async (member) => ({ member, wants: await wantsLabAlert(member._id, preference || "urgentRequestAlerts") }))
    );
    const rows = recipients.filter((row) => row.wants).map((row) => ({ recipient: row.member._id, type, title, message, entityType, entityId }));
    if (!rows.length) return;
    await Notification.insertMany(rows, { ordered: false });
  } catch (error) {
    console.error(`[LAB] Failed to notify laboratory staff (${type}):`, error.message);
  }
};

const id = (value, name = "id") => { if (!value || !mongoose.Types.ObjectId.isValid(value)) fail(`A valid ${name} is required`, 422); return value; };
const normalizeToken = (value) => String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const requestPopulate = (query) => query.populate("patient", "name email phone").populate("doctor", "name email").populate("test", "name testName testCode category sampleType");
const labRequestQuery = (filter = {}) => requestPopulate(LabRequest.find(filter));

/**
 * Reads one laboratory user's alert preferences.
 *
 * `/lab/settings` persisted four booleans that nothing consulted, so a
 * technician who turned an alert off still received it. `LabSettings` holds a
 * document per user, so this resolves the acting user's own row and falls back
 * to "alert on" when the user has never saved a preference. Defaults are read
 * from the model rather than hardcoded so a new preference is not invented twice.
 */
const labPreferences = async (userId) => {
  if (!userId) return null;
  try {
    const stored = await LabSettings.findOne({ user: userId }).lean();
    return stored || null;
  } catch (error) {
    console.error("[LAB] Failed to read laboratory settings:", error.message);
    return null;
  }
};

/**
 * Whether a laboratory user wants this class of alert.
 *
 * `preference` names a boolean on LabSettings. An unset or unreadable preference
 * means "alert on", because silently swallowing a clinical notification is the
 * worse failure.
 */
const wantsLabAlert = async (userId, preference) => {
  const settings = await labPreferences(userId);
  if (!settings || settings[preference] === undefined || settings[preference] === null) return true;
  return Boolean(settings[preference]);
};

const notify = async (recipient, type, title, message, entityType, entityId) => {
  const notification = await Notification.create({ recipient, type, title, message, entityType, entityId });
  publishNotification(notification);
  return notification;
};

/**
 * Creates one or more notifications, honouring an optional transaction session.
 *
 * The documents are always passed in an ARRAY, even for a single row. This is not
 * style: Mongoose 8.9 validates a phantom empty document when `create` is given a
 * single document object followed by an options object, so `create(doc, {})`
 * fails with `Path 'recipient' is required` even though `doc` is complete. The
 * array form is unaffected, and `ordered` is required for a multi-document create
 * inside a session.
 */
const createNotifications = (rows, session) => {
  const list = Array.isArray(rows) ? rows : [rows];
  return Notification.create(list, session ? { session, ordered: true } : { ordered: true });
};

/**
 * Notifies the doctor, unless the laboratory user who triggered the action has
 * turned that class of alert off in /lab/settings.
 *
 * The preference is the laboratory user's, not the doctor's: it records whether
 * this bench wants to be interrupted about processing milestones at all. It is
 * separate from DoctorSettings.labReportAlerts, which is the doctor's own choice
 * about what reaches them.
 */
const notifyLab = async (userId, preference, recipient, type, title, message, entityType, entityId) => {
  if (!(await wantsLabAlert(userId, preference))) return null;
  return notify(recipient, type, title, message, entityType, entityId);
};

/**
 * Names a test consistently in notification text and audit metadata.
 */
const testLabel = (test) => test?.name || test?.testName || "laboratory test";

/**
 * Logs a request whose stored priority/status is outside the canonical set.
 *
 * A row written by a raw driver bypassed Mongoose validation, so it only
 * becomes visible here. It is reported, never silently rewritten, and it never
 * blocks a transition - the repair script owns data changes.
 */
const warnIfLegacy = (request) => {
  const priority = String(request.priority ?? "");
  const status = String(request.status ?? "");
  const badPriority = priority && !LabRequest.schema.path("priority").enumValues.includes(priority);
  const badStatus = status && !LabRequest.schema.path("status").enumValues.includes(status);
  if (badPriority || badStatus) {
    console.warn(
      `[LAB] LabRequest ${request._id} holds out-of-enum data (priority=${JSON.stringify(priority)}, status=${JSON.stringify(status)}). ` +
        "Run `npm run repair:lab-requests` to normalise it. The workflow will continue; only the fields being written are validated."
    );
  }
};

/**
 * Applies a workflow transition as a single atomic, targeted update.
 *
 * Two properties matter here:
 *  - the expected current status is part of the filter, so two lab users racing
 *    on the same request cannot both win;
 *  - `runValidators` on a `$set` validates ONLY the written paths, so a
 *    pre-existing invalid field on the same document can no longer block an
 *    unrelated transition. This is what stopped "complete processing" from
 *    failing on a legacy `priority` value.
 */
const applyTransition = async (requestId, fromStatus, set, userId, conflictMessage, note) => {
  const updated = await LabRequest.findOneAndUpdate(
    { _id: id(requestId, "lab request id"), status: { $in: STATUS_VARIANTS[fromStatus] } },
    {
      $set: { ...set, updatedBy: userId },
      // The document records its own trail, so "who moved this request and when"
      // is answerable from the request itself rather than only from AuditLog,
      // which is append-only and has no target index.
      $push: { statusHistory: { from: fromStatus, to: set.status, by: userId, at: new Date(), note } },
    },
    { new: true, runValidators: true }
  );
  if (updated) return updated;

  const current = await LabRequest.findById(requestId).select("status priority").lean();
  if (!current) fail("Laboratory request not found", 404);
  fail(conflictMessage || `This request is now ${current.status}, so that action is no longer available. Refresh and try again.`, 409);
};

const assertTransitionAllowed = async (request, target) => {
  const current = normalizeStatus(request.status);
  if (!REQUEST_STATUSES.includes(target)) {
    fail(`"${target}" is not a valid laboratory status. Use one of: ${REQUEST_STATUSES.join(", ")}`, 422);
  }
  if (!TRANSITIONS[current]) {
    fail(`This request is ${current}, so it can no longer be changed.`, 409);
  }
  if (!TRANSITIONS[current].includes(target)) {
    fail(`Cannot change a laboratory request from ${current} to ${target}. Allowed next steps: ${TRANSITIONS[current].join(", ") || "none"}.`, 409);
  }
  const requirement = REQUIRES[target];
  if (requirement && !(await requirement.check(request))) {
    fail(requirement.message, 409);
  }
};

/**
 * Runs `work` inside a transaction when the deployment supports one, and falls
 * back to sequential writes when it does not. A standalone mongod cannot start
 * a transaction, and a failed attempt must never cause the work to run twice.
 */
let transactionsSupported = null;
const isTransactionUnsupported = (error) =>
  error?.code === 20 ||
  /Transaction numbers are only allowed|Transactions are not supported|replica set member or mongos/i.test(error?.message || "");

const withOptionalTransaction = async (work) => {
  if (transactionsSupported === false) return work(null);

  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    transactionsSupported = true;
    return result;
  } catch (error) {
    if (session) await session.endSession().catch(() => {});
    if (isTransactionUnsupported(error)) {
      transactionsSupported = false;
      console.warn("[LAB] MongoDB deployment does not support transactions; writing sequentially instead.");
      return work(null);
    }
    throw error;
  } finally {
    if (session) await session.endSession().catch(() => {});
  }
};

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

const nextSampleId = async () => {
  const year = new Date().getFullYear();
  const prefix = `SMP-${year}-`;
  const seq = await nextSequence(`sampleId:${year}`, () => highestExistingSequence(SampleCollection, "sampleId", prefix));
  const sampleId = `${prefix}${String(seq).padStart(4, "0")}`;
  // Both codes are derived from the id, never supplied by the caller. A frontend
  // cannot choose the identifier that a physical specimen is labelled with, and
  // neither payload carries patient identity (SRS FR-LB-03).
  const { qrPayload, barcode } = sampleLabel.buildSpecimenCodes(sampleId);
  return { sampleId, barcode, qrPayload };
};

const nextReportId = async () => {
  const year = new Date().getFullYear();
  const prefix = `RPT-${year}-`;
  const seq = await nextSequence(`reportId:${year}`, () => highestExistingSequence(LabReport, "reportId", prefix));
  return `${prefix}${String(seq).padStart(4, "0")}`;
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** STAT is the most time-critical priority, so it is counted separately. */
const URGENT_PRIORITIES = [...PRIORITY_VARIANTS.URGENT, ...PRIORITY_VARIANTS.STAT];

/**
 * Clinical urgency order: STAT, then URGENT, then ROUTINE.
 *
 * A MongoDB sort on `priority` is alphabetical, which would put ROUTINE first
 * and hide the emergencies at the bottom of the dashboard queue. MongoDB cannot
 * sort on a computed field here without an aggregation, so the small page is
 * ordered in memory instead.
 */
const PRIORITY_RANK = { STAT: 0, URGENT: 1, ROUTINE: 2 };
const priorityRank = (priority) => {
  const rank = PRIORITY_RANK[String(priority || "").toUpperCase()];
  return rank === undefined ? 3 : rank;
};

const byUrgency = (left, right) =>
  priorityRank(left.priority) - priorityRank(right.priority) ||
  new Date(left.requestedDate || 0) - new Date(right.requestedDate || 0);

const getDashboard = async (userId) => {
  const count = (statuses) => LabRequest.countDocuments({ status: { $in: statuses } });
  const activeStatuses = [...STATUS_VARIANTS.PENDING, ...STATUS_VARIANTS.ACCEPTED, ...STATUS_VARIANTS.SAMPLE_COLLECTED, ...STATUS_VARIANTS.PROCESSING];
  const [pendingRequests, acceptedRequests, samplesCollected, processingTests, completedTests, verifiedReports, urgentRequests, reportsAwaitingVerification, activeRequests, recentSamples, recentRequests, recentReports, unreadNotifications] = await Promise.all([
    count(STATUS_VARIANTS.PENDING),
    count(STATUS_VARIANTS.ACCEPTED),
    SampleCollection.countDocuments({ status: { $in: ["COLLECTED", "RECEIVED", "collected", "received"] } }),
    count(STATUS_VARIANTS.PROCESSING),
    count(STATUS_VARIANTS.COMPLETED),
    // Released reports, not just VERIFIED: an approved report is a finished
    // report, and counting only VERIFIED made the dashboard's number fall when a
    // report was approved - the terminal state looked like a regression.
    LabReport.countDocuments({ status: { $in: RELEASED_REPORT_STATUSES } }),
    LabRequest.countDocuments({ status: { $in: activeStatuses }, priority: { $in: URGENT_PRIORITIES } }),
    LabReport.countDocuments({ status: "COMPLETED" }),
    // Ranked per priority group and merged, because fetching one flat page and
    // sorting it afterwards would silently drop urgent work whenever more than
    // `limit` routine requests were older.
    Promise.all(
      Object.keys(PRIORITY_RANK).map((priority) =>
        labRequestQuery({ status: { $in: activeStatuses }, priority: { $in: PRIORITY_VARIANTS[priority] } }).sort({ requestedDate: 1 }).limit(6).then((rows) => [...rows])
      )
    ).then((groups) => groups.flat()),
    SampleCollection.find().populate("patient", "name").populate("test", "name testName").sort({ collectionDate: -1 }).limit(6),
    labRequestQuery().sort({ createdAt: -1 }).limit(8),
    LabReport.find().populate("patient", "name").populate("doctor", "name").populate("test", "name testName").sort({ createdAt: -1 }).limit(8),
    userId ? Notification.countDocuments({ recipient: userId, readAt: null }) : Promise.resolve(0),
  ]);
  return {
    pendingRequests,
    acceptedRequests,
    samplesCollected,
    processingTests,
    completedTests,
    verifiedReports,
    urgentRequests,
    reportsAwaitingVerification,
    activeRequests: activeRequests.sort(byUrgency).slice(0, 6),
    recentSamples,
    recentRequests,
    recentReports,
    unreadNotifications,
  };
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** Turns the supported query string into a MongoDB filter. */
const buildRequestFilter = (query = {}) => {
  const filter = {};

  if (query.status) {
    const target = normalizeStatus(query.status);
    if (!REQUEST_STATUSES.includes(target)) fail(`"${query.status}" is not a valid laboratory status.`, 422);
    filter.status = { $in: STATUS_VARIANTS[target] };
  }
  if (query.priority) {
    const target = String(query.priority).trim().toUpperCase();
    const variants = PRIORITY_VARIANTS[target];
    if (!variants) fail(`"${query.priority}" is not a valid priority. Use ROUTINE, URGENT or STAT.`, 422);
    filter.priority = { $in: variants };
  }
  for (const [field, name] of [["test", "test"], ["patient", "patient"], ["doctor", "doctor"]]) {
    if (query[field]) filter[field] = id(query[field], `${name} id`);
  }

  const from = parseDate(query.dateFrom, "dateFrom");
  const to = parseDate(query.dateTo, "dateTo");
  if (from || to) {
    filter.requestedDate = {};
    if (from) filter.requestedDate.$gte = from;
    if (to) filter.requestedDate.$lte = to;
  }
  return filter;
};

/**
 * Free-text search for the requests queue (SRS FR-LB-01: search by patient,
 * request id or test).
 *
 * The requested fields live on POPULATED documents, so the patient and test
 * ids are resolved to ids first and the request filter then matches on them.
 * This is the same technique `search()` uses, so one term finds a request by
 * patient name, test name, test code or clinical notes without a collection
 * scan.
 */
const applyRequestSearch = async (filter, term) => {
  const query = String(term || "").trim();
  if (query.length < 2) return filter;

  const byObjectId = mongoose.Types.ObjectId.isValid(query) ? new RegExp(`^${escapeRegex(query)}`) : null;
  const regex = new RegExp(escapeRegex(query), "i");
  const [patientIds, testIds] = await Promise.all([
    User.find({ role: "patient", $or: [{ name: regex }, { email: regex }] }).select("_id").lean(),
    LabTest.find({ $or: [{ name: regex }, { testName: regex }, { testCode: regex }] }).select("_id").lean(),
  ]);

  const clauses = [
    { clinicalNotes: regex },
    { patient: { $in: patientIds.map((row) => row._id) } },
    { test: { $in: testIds.map((row) => row._id) } },
  ];
  if (byObjectId) clauses.push({ _id: byObjectId });

  const existing = filter.$or;
  filter.$or = existing ? [...existing, ...clauses] : clauses;
  return filter;
};

const getRequests = async (query = {}) => {
  const plan = buildQueryPlan(query, { sortable: "labRequest" });
  const filter = await applyRequestSearch(buildRequestFilter(query), query.search);
  return runPaginated(labRequestQuery(filter), plan);
};

const getRequest = async (requestId) => {
  id(requestId, "lab request id");
  const result = await labRequestQuery({ _id: requestId }).findOne();
  if (!result) fail("Laboratory request not found", 404);
  warnIfLegacy(result);
  return result;
};

const acceptRequest = async (requestId, userId) => {
  const request = await LabRequest.findById(id(requestId, "lab request id"));
  if (!request) fail("Laboratory request not found", 404);
  await assertTransitionAllowed(request, "ACCEPTED");

  const updated = await applyTransition(request._id, "PENDING", { status: "ACCEPTED", acceptedBy: userId, acceptedAt: new Date() }, userId);
  await notify(updated.doctor, "LAB_REQUEST_ACCEPTED", "Laboratory request accepted", "Your laboratory request has been accepted and is waiting for a sample.", "LabRequest", updated._id);
  await audit(userId, {
    action: "LAB_REQUEST_ACCEPTED",
    targetType: "LabRequest",
    targetId: updated._id,
    metadata: { from: "PENDING", to: "ACCEPTED", priority: updated.priority },
  });
  return getRequest(updated._id);
};

/**
 * Generic status patch.
 *
 * Kept for API compatibility, but deliberately narrower than before. It used to
 * accept any status the TRANSITIONS table allowed and nothing else, which meant
 * a client could assert SAMPLE_COLLECTED with no sample on file. Two guards are
 * added: transitions that assert a recorded fact now require that fact, and
 * VERIFIED is refused outright because verification is a dedicated operation
 * with its own rules, notifications and audit trail.
 */
const updateRequestStatus = async (requestId, nextStatus, userId, options = {}) => {
  const request = await LabRequest.findById(id(requestId, "lab request id"));
  if (!request) fail("Laboratory request not found", 404);

  const target = normalizeStatus(nextStatus);
  if (target === "VERIFIED") {
    fail("A laboratory request becomes VERIFIED only by verifying its report. Use PATCH /lab/reports/:id/verify.", 409);
  }
  await assertTransitionAllowed(request, target);

  const set = { status: target };
  if (target === "ACCEPTED") { set.acceptedBy = userId; set.acceptedAt = new Date(); }
  if (target === "SAMPLE_COLLECTED") set.sampleStatus = "COLLECTED";
  if (target === "CANCELLED") {
    set.sampleStatus = "REJECTED";
    // Cancelling a test is the one workflow action with no undo, so who did it
    // and why is recorded on the request rather than only in the audit log.
    set.cancelledBy = userId;
    set.cancelledAt = new Date();
    const reason = String(options.reason || "").trim();
    if (reason) set.cancellationReason = reason;
  }

  const current = normalizeStatus(request.status);
  const updated = await applyTransition(request._id, current, set, userId, undefined, options.reason);
  await audit(userId, {
    action: target === "CANCELLED" ? "LAB_REQUEST_CANCELLED" : "LAB_REQUEST_STATUS_UPDATED",
    targetType: "LabRequest",
    targetId: updated._id,
    metadata: { from: current, to: target, ...(options.reason ? { reason: options.reason } : {}) },
  });
  return getRequest(updated._id);
};

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

/**
 * Resolves the separate collection TIME (SRS FR-LB-03).
 *
 * Accepts either a full timestamp (`2026-01-31T09:30:00.000Z`) or a bare clock
 * time (`09:30`, `09:30:15`) which is applied to the already-known collection
 * date in local time. A bare time therefore keeps its own meaning, and anything
 * unparseable falls back to the collection date rather than failing a sample a
 * technician has physically already taken.
 */
/**
 * Parses a collection date the way a technician means it.
 *
 * A form's `YYYY-MM-DD` is a local calendar day. `new Date("2026-01-31")` parses
 * as UTC midnight, which is 30 January for any clinic west of Greenwich, so the
 * sample would be filed under the wrong day. A bare day is therefore anchored to
 * local midnight; anything with a time component keeps its own offset.
 */
const resolveCollectionDate = (input) => {
  if (input === undefined || input === null || String(input).trim() === "") return new Date();
  const raw = String(input).trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (day) {
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const local = new Date(year, month - 1, date, 0, 0, 0, 0);
    // The Date constructor silently rolls 2026-13-45 over into 2027, so the
    // round-trip is what actually proves the input was a real calendar day.
    if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== date) {
      fail("collectionDate is not a valid date", 422);
    }
    return local;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) fail("collectionDate is not a valid date", 422);
  return parsed;
};

const resolveCollectionTime = (input, collectionDate) => {
  if (input === undefined || input === null || String(input).trim() === "") return collectionDate;
  const raw = String(input).trim();
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (clock) {
    const [hours, minutes, seconds] = [Number(clock[1]), Number(clock[2]), Number(clock[3] || 0)];
    if (hours > 23 || minutes > 59 || seconds > 59) fail("collectionTime must be a valid time of day (HH:mm)", 422);
    const combined = new Date(collectionDate);
    combined.setHours(hours, minutes, seconds, 0);
    return combined;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) fail("collectionTime must be a time (HH:mm) or a valid date-time", 422);
  return parsed;
};

/** Accepts the value the client sent, normalises it, and falls back to the test. */
const resolveSampleType = (input, testValue) => {
  const candidate = SAMPLE_TYPES.find((type) => type === normalizeToken(input));
  if (candidate) return candidate;
  const fallback = SAMPLE_TYPES.find((type) => type === normalizeToken(testValue));
  if (fallback) return fallback;
  fail(`Sample type "${input ?? testValue}" is not supported. Use one of: ${SAMPLE_TYPES.join(", ")}.`, 422);
};

const getSamples = async (query = {}) => {
  const plan = buildQueryPlan(query, { sortable: "sample" });
  const filter = {};
  if (query.status) filter.status = String(query.status).trim().toUpperCase();
  if (query.labRequest) filter.labRequest = id(query.labRequest, "lab request id");
  if (query.patient) filter.patient = id(query.patient, "patient id");
  return runPaginated(
    SampleCollection.find(filter).populate("patient", "name email").populate("test", "name testName category").populate("labRequest").populate("collectedBy", "name"),
    plan
  );
};

const getSample = async (sampleId) => {
  id(sampleId, "sample id");
  const sample = await SampleCollection.findById(sampleId).populate("patient", "name email").populate("test", "name testName category").populate("labRequest").populate("collectedBy", "name");
  if (!sample) fail("Sample not found", 404);
  return sample;
};

const createSample = async (data, userId) => {
  const request = await LabRequest.findById(id(data.labRequest, "lab request id")).populate("test");
  if (!request) fail("Laboratory request not found", 404);
  if (!request.test) {
    fail("Cannot collect a sample because this laboratory request has no valid LabTest reference. An administrator must repair or re-order the request.", 409);
  }
  warnIfLegacy(request);

  const status = normalizeStatus(request.status);
  if (!["ACCEPTED", "SAMPLE_COLLECTED"].includes(status)) {
    fail(`Only an accepted request can have a sample collected. This request is ${request.status}.`, 409);
  }
  if (await SampleCollection.exists({ labRequest: request._id })) {
    fail("A sample already exists for this laboratory request", 409);
  }

  const sampleType = resolveSampleType(data.sampleType, request.test.sampleType);
  const collectionDate = resolveCollectionDate(data.collectionDate);

  // SRS FR-LB-03 records the collection DATE and the collection TIME separately.
  // They used to be the same value written twice, so a form could never say
  // "collected this morning" about an afternoon sample. `collectionTime` accepts
  // a full timestamp or a bare `HH:mm` applied to the collection date, and falls
  // back to the date itself when the technician supplies neither.
  const collectionTime = resolveCollectionTime(data.collectionTime, collectionDate);

  const sample = await withDuplicateRetry(async () => {
    const { sampleId, barcode, qrPayload } = await nextSampleId();
    return SampleCollection.create({
      sampleId,
      barcode,
      qrPayload,
      labRequest: request._id,
      patient: request.patient,
      test: request.test._id,
      sampleType,
      collectionDate,
      collectionTime,
      collectedBy: userId,
      updatedBy: userId,
      notes: data.notes,
    });
  });

  // The request carries the draw too, so "who collected this" is answerable
  // from the request alone. It used to live only on the sample document.
  await applyTransition(
    request._id,
    status,
    { status: "SAMPLE_COLLECTED", sampleStatus: "COLLECTED", collectedBy: userId, collectedAt: collectionTime },
    userId
  );
  await notify(request.doctor, "SAMPLE_COLLECTED", "Sample collected", `A sample for your laboratory request has been collected (${sample.sampleId}).`, "SampleCollection", sample._id);
  await audit(userId, {
    action: "LAB_SAMPLE_COLLECTED",
    targetType: "SampleCollection",
    targetId: sample._id,
    metadata: {
      sampleId: sample.sampleId,
      labRequest: String(request._id),
      test: testLabel(request.test),
      sampleType,
      collectionDate: collectionDate.toISOString(),
      collectionTime: collectionTime.toISOString(),
    },
  });
  return getSample(sample._id);
};

const updateSample = async (sampleId, data, userId) => {
  const sample = await SampleCollection.findById(id(sampleId, "sample id"));
  if (!sample) fail("Sample not found", 404);

  const set = {};
  ["status", "notes"].forEach((field) => { if (data[field] !== undefined) set[field] = data[field]; });
  if (data.collectionDate !== undefined) {
    set.collectionDate = resolveCollectionDate(data.collectionDate);
  }
  if (data.collectionTime !== undefined) {
    set.collectionTime = resolveCollectionTime(data.collectionTime, set.collectionDate || sample.collectionDate);
  }

  // The barcode is generated. A patch may not rewrite it.
  if (Object.keys(set).length) {
    set.updatedBy = userId;
    await SampleCollection.updateOne({ _id: sample._id }, { $set: set }, { runValidators: true });
    await audit(userId, {
      action: "LAB_SAMPLE_UPDATED",
      targetType: "SampleCollection",
      targetId: sample._id,
      metadata: { sampleId: sample.sampleId, fields: Object.keys(set).filter((field) => field !== "updatedBy") },
    });
  }
  return getSample(sample._id);
};

/**
 * The printable specimen label for a sample (SRS FR-LB-03).
 *
 * Both codes are regenerated from the stored sample id, so reprinting a label
 * months later produces exactly the code the tube was first labelled with, and
 * the codes can never drift from the record. Neither payload carries patient
 * identity - the label names the specimen, not the person.
 */
const getSampleLabel = async (sampleId, { format = "barcode" } = {}) => {
  const sample = await SampleCollection.findById(id(sampleId, "sample id")).lean();
  if (!sample) fail("Sample not found", 404);
  const target = String(format || "").toLowerCase();
  if (!["barcode", "qr"].includes(target)) fail(`"${format}" is not a supported label format. Use "barcode" or "qr".`, 422);

  const value = target === "qr" ? sample.qrPayload || sampleLabel.buildQrPayload(sample.sampleId) : sample.barcode || `BC-${sample.sampleId}`;
  return {
    sampleId: sample.sampleId,
    format: target,
    value,
    svg: target === "qr" ? sampleLabel.renderQrSvg(value) : sampleLabel.renderBarcodeSvg(value),
  };
};

/**
 * Resolves a scanned or typed specimen code back to the sample it labels.
 *
 * This is the reason the code has to be trustworthy: a technician at specimen
 * receipt scans the tube, and the result gets filed against whatever this
 * returns. A payload that fails its integrity check is rejected with an
 * explanation rather than being parsed on a best-effort basis, and an unknown
 * code is reported as unknown instead of resolving to the nearest match.
 */
const findSampleByCode = async (code, userId) => {
  const raw = String(code || "").trim();
  if (!raw) fail("A specimen code is required", 422);

  const sampleId = sampleLabel.parseQrPayload(raw);
  if (!sampleId) fail("That code is not a HILMS specimen label.", 422);

  // A QR payload carries its own checksum; a bare typed/barcoded sample id does
  // not, so the check only applies when one is present.
  if (raw.toUpperCase().startsWith(`${sampleLabel.LABEL_DOMAIN}:`)) {
    const check = sampleLabel.verifyQrPayload(raw);
    if (!check.valid) fail(check.reason, 422);
  }

  const escaped = escapeRegex(sampleId);
  const sample = await SampleCollection.findOne({
    $or: [
      { sampleId: new RegExp(`^${escaped}$`, "i") },
      { barcode: new RegExp(`^${escapeRegex(`BC-${sampleId}`)}$`, "i") },
    ],
  })
    .populate("patient", "name email")
    .populate("test", "name testName category sampleType")
    .populate("labRequest")
    .populate("collectedBy", "name");
  if (!sample) fail(`No specimen is labelled ${sampleId}.`, 404);

  if (userId) {
    await SampleCollection.updateOne({ _id: sample._id }, { $set: { receivedAt: new Date(), receivedBy: userId, updatedBy: userId } });
    await audit(userId, {
      action: "LAB_SAMPLE_RECEIVED",
      targetType: "SampleCollection",
      targetId: sample._id,
      metadata: { sampleId: sample.sampleId, labRequest: String(sample.labRequest), format: raw.toUpperCase().startsWith(`${sampleLabel.LABEL_DOMAIN}:`) ? "qr" : "barcode" },
    });
  }
  return sample;
};

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

const getProcessing = async (query = {}) => {
  const plan = buildQueryPlan(query, { sortable: "labRequest", defaultSort: "updatedAt" });
  // COMPLETED belongs here too, not just on the bench: a technician who realises a
  // parameter is missing has to be able to record it before the report is
  // generated. `createResult` already accepts this status.
  const filter = {
    status: { $in: [...STATUS_VARIANTS.SAMPLE_COLLECTED, ...STATUS_VARIANTS.PROCESSING, ...STATUS_VARIANTS.COMPLETED] },
  };
  const term = String(query.search || "").trim();
  if (term.length >= 2) {
    const regex = new RegExp(escapeRegex(term), "i");
    // The sample's generated identifiers are what a technician has on the tube in
    // front of them, so they have to be searchable too.
    const [patientIds, testIds, sampleIds] = await Promise.all([
      User.find({ role: "patient", $or: [{ name: regex }, { email: regex }] }).select("_id").lean(),
      LabTest.find({ $or: [{ name: regex }, { testName: regex }, { testCode: regex }] }).select("_id").lean(),
      SampleCollection.find({ $or: [{ sampleId: regex }, { barcode: regex }] }).select("labRequest").lean(),
    ]);
    filter.$or = [
      { clinicalNotes: regex },
      { _id: { $in: sampleIds.map((row) => row.labRequest) } },
      { patient: { $in: patientIds.map((row) => row._id) } },
      { test: { $in: testIds.map((row) => row._id) } },
    ];
  }
  // The processing bench needs the specimen to act on, not just the request, so
  // the sample is joined here rather than making the client fetch it per row.
  // `lean()` is required for the merge below: a Mongoose document hides `_id`
  // from a spread, which would strip the identifier from every listed request.
  const requests = await runPaginated(
    labRequestQuery(filter).populate("processedBy", "name").lean(),
    plan
  );
  const requestIds = requests.data.map((row) => row._id);
  const samples = requestIds.length
    ? await SampleCollection.find({ labRequest: { $in: requestIds } })
        .select("labRequest sampleId barcode sampleType status collectionDate collectionTime")
        .lean()
    : [];
  const sampleByRequest = new Map(samples.map((sample) => [String(sample.labRequest), sample]));
  requests.data = requests.data.map((row) => ({ ...row, sample: sampleByRequest.get(String(row._id)) || null }));
  return requests;
};

const getProcessingItem = async (requestId) => getRequest(requestId);

const startProcessing = async (requestId, userId, notes) => {
  const request = await LabRequest.findById(id(requestId, "lab request id"));
  if (!request) fail("Laboratory request not found", 404);
  await assertTransitionAllowed(request, "PROCESSING");

  // `completeProcessing` already preserved existing notes; starting did not, so a
  // technician who saved a note and then pressed Start lost it. Same contract now.
  const updated = await applyTransition(
    request._id,
    "SAMPLE_COLLECTED",
    { status: "PROCESSING", processingStartedAt: new Date(), processingStartedBy: userId, processingNotes: notes ?? request.processingNotes, processedBy: userId },
    userId
  );
  await Promise.all([
    notifyLab(userId, "processingAlerts", updated.doctor, "LAB_PROCESSING_STARTED", "Laboratory analysis started", `The laboratory has started analysing the sample for ${testLabel(updated.test)}.`, "LabRequest", updated._id),
    audit(userId, {
      action: "LAB_PROCESSING_STARTED",
      targetType: "LabRequest",
      targetId: updated._id,
      metadata: { from: "SAMPLE_COLLECTED", to: "PROCESSING" },
    }),
  ]);
  return getRequest(updated._id);
};

const completeProcessing = async (requestId, userId, notes) => {
  const request = await LabRequest.findById(id(requestId, "lab request id"));
  if (!request) fail("Laboratory request not found", 404);
  await assertTransitionAllowed(request, "COMPLETED");

  // SRS FR-LB-02/8.1: a completed test must have results. Previously this
  // transition succeeded with nothing recorded, leaving a request stuck at
  // COMPLETED that could only be diagnosed when report generation rejected it.
  // The check lives on the results themselves so a test configured with
  // required parameters is held to all of them.
  //
  // Results are scoped to THIS lab request (requirement: do not accidentally
  // satisfy a parameter from another request for the same patient/test).
  const results = await LabResult.find({ labRequest: request._id, test: request.test }).select("parameters");
  if (!results.length) {
    fail("This test cannot be completed until its results are recorded. Use POST /lab/results to enter them.", 409);
  }
  const test = request.test ? await LabTest.findById(request.test).select("name parameters resultStyle") : null;
  if (test?.resultStyle !== "NARRATIVE") {
    const required = (test?.parameters || []).filter((parameter) => parameter.isRequired !== false);

    // A parameter counts as "recorded" only when a result holds a stable
    // match (by parameterId, preferred) AND that result carries a real value.
    // Empty strings, null, undefined and whitespace-only values are treated as
    // missing so a blank cell in the form can't silently pass completion.
    const recordedById = new Set();
    const recordedByName = new Set();
    for (const result of results) {
      for (const parameter of (result.parameters || [])) {
        if (!String(parameter.value || "").trim()) continue;
        if (parameter.parameterId) recordedById.add(String(parameter.parameterId));
        recordedByName.add(String(parameter.parameter || "").trim().toLowerCase());
      }
    }

    const missing = required
      .filter((parameter) => {
        const idMatch = parameter._id && recordedById.has(String(parameter._id));
        const nameMatch = recordedByName.has(String(parameter.parameter || "").trim().toLowerCase());
        return !idMatch && !nameMatch;
      })
      .map((parameter) => parameter.parameter);

    if (missing.length) {
      fail(
        "Required laboratory results are missing.",
        409,
        { missingParameters: missing }
      );
    }
  }

  const updated = await applyTransition(
    request._id,
    "PROCESSING",
    { status: "COMPLETED", processingCompletedAt: new Date(), processingNotes: notes ?? request.processingNotes, processedBy: userId },
    userId
  );
  await Promise.all([
    notifyLab(userId, "processingAlerts", updated.doctor, "LAB_PROCESSING_COMPLETED", "Laboratory analysis finished", `Analysis of your laboratory sample is complete. A report is being prepared for ${testLabel(updated.test)}.`, "LabRequest", updated._id),
    audit(userId, {
      action: "LAB_PROCESSING_COMPLETED",
      targetType: "LabRequest",
      targetId: updated._id,
      metadata: { from: "PROCESSING", to: "COMPLETED" },
    }),
  ]);
  return getRequest(updated._id);
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const resultPopulate = (query) => query.populate("patient", "name email").populate("test", "name testName category").populate("sample", "sampleId sampleType").populate("enteredBy", "name");
const getResults = async (query = {}) => {
  const plan = buildQueryPlan(query, { sortable: "result" });
  const filter = {};
  if (query.labRequest) filter.labRequest = id(query.labRequest, "lab request id");
  if (query.patient) filter.patient = id(query.patient, "patient id");
  if (query.test) filter.test = id(query.test, "test id");
  return runPaginated(resultPopulate(LabResult.find(filter)), plan);
};

const getResult = async (resultId) => {
  id(resultId, "result id");
  const result = await resultPopulate(LabResult.findById(resultId));
  if (!result) fail("Laboratory result not found", 404);
  return result;
};

// ---------------------------------------------------------------------------
// Result parameters (SRS FR-LB-04 / FR-LB-06)
// ---------------------------------------------------------------------------

/**
 * Picks the reference bounds that apply to one patient.
 *
 * Several analytes (haemoglobin, haematocrit, red cell count, uric acid) have a
 * different normal range per sex. A range stored only as "13.0-17.0 g/dL" is
 * unusable on a report without knowing whose it is, so the sex-specific bounds
 * are preferred when the configuration supplies them and the patient's gender is
 * known, falling back to the general range otherwise.
 */
const resolveBounds = (parameter, gender) => {
  const sex = String(gender || "").trim().toLowerCase();
  if (sex === "male" && (parameter.maleMin != null || parameter.maleMax != null)) {
    return { min: parameter.maleMin, max: parameter.maleMax, sexSpecific: true };
  }
  if (sex === "female" && (parameter.femaleMin != null || parameter.femaleMax != null)) {
    return { min: parameter.femaleMin, max: parameter.femaleMax, sexSpecific: true };
  }
  return { min: parameter.min, max: parameter.max, sexSpecific: false };
};

/** Renders the printable range for a report, preferring the explicit text. */
const formatReferenceRange = (parameter, bounds) => {
  if (parameter.referenceRangeText) return parameter.referenceRangeText;
  if (bounds.min != null && bounds.max != null) return `${bounds.min} - ${bounds.max}${parameter.unit ? ` ${parameter.unit}` : ""}`;
  if (bounds.max != null) return `Up to ${bounds.max}${parameter.unit ? ` ${parameter.unit}` : ""}`;
  if (bounds.min != null) return `Above ${bounds.min}${parameter.unit ? ` ${parameter.unit}` : ""}`;
  return "";
};

/**
 * Derives the NORMAL/HIGH/LOW flag from the configured bounds.
 *
 * A value that is not numeric (a qualitative "Negative", or a "<0.01" threshold)
 * cannot be compared, so it is left as submitted. An explicit flag typed by the
 * technician always wins: the flag is a clinical judgement, and a bound is only
 * a default for it.
 */
const deriveFlag = (value, bounds) => {
  const numeric = Number(String(value).replace(/[^\d.\-]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  if (bounds.min != null && numeric < bounds.min) return "LOW";
  if (bounds.max != null && numeric > bounds.max) return "HIGH";
  return "NORMAL";
};

/**
 * Fills in unit, reference range and flag for each submitted result parameter
 * from the test's stored configuration.
 *
 * This is what makes the reference range come from the database rather than from
 * the technician retyping it: the client sends a parameter name and a value, and
 * everything else is resolved here against `LabTest.parameters`.
 *
 * Parameters are matched by stable identifier first and by normalized name as a
 * fallback, so the same mechanism that drives the Processing form's read-only
 * panel also drives completion validation. When a match is found the test
 * parameter's `_id` is recorded on the result as `parameterId`, giving every
 * downstream check (completion, reports) a reliable key instead of a
 * display-name string that the bench form used to let the user rename.
 *
 * Parameters the configuration does not know about are still accepted - an
 * extended panel or a locally-run analyte is legitimate - but they keep whatever
 * the technician typed and are flagged as unconfigured rather than silently
 * given an invented range.
 */
const resolveParameters = async (test, submitted, patientId) => {
  // Index the test's panel two ways so a submitted entry resolves whether it
  // arrives with a parameterId (preferred) or only a parameter name (legacy
  // records, or tests whose parameter _id changed after a re-seed).
  const byId = new Map();
  const byName = new Map();
  for (const parameter of (test?.parameters || [])) {
    if (parameter._id) byId.set(String(parameter._id), parameter);
    byName.set(String(parameter.parameter || "").trim().toLowerCase(), parameter);
  }

  const gender = patientId
    ? (await User.findById(patientId).select("gender").lean())?.gender
    : "";

  return (submitted || []).map((entry) => {
    const key = String(entry?.parameter || "").trim().toLowerCase();
    const match =
      entry.parameterId && byId.has(String(entry.parameterId))
        ? byId.get(String(entry.parameterId))
        : byName.get(key);
    if (!match) {
      return {
        parameter: String(entry.parameter).trim(),
        ...(entry.parameterId ? { parameterId: entry.parameterId } : {}),
        value: String(entry.value).trim(),
        unit: entry.unit || "",
        referenceRange: entry.referenceRange || "",
        flag: entry.flag || "NORMAL",
        remarks: entry.remarks || "",
      };
    }
    const bounds = resolveBounds(match, gender);
    return {
      parameter: match.parameter,
      parameterId: match._id,
      value: String(entry.value).trim(),
      unit: entry.unit || match.unit || "",
      referenceRange: entry.referenceRange || formatReferenceRange(match, bounds),
      flag: entry.flag && entry.flag !== "NORMAL" ? entry.flag : deriveFlag(entry.value, bounds) || entry.flag || "NORMAL",
      remarks: entry.remarks || "",
    };
  });
};

/**
 * The result-entry form's blank rows, so the client never has to hardcode the
 * analytes of a test (SRS FR-LB-04: parameters must come from the test
 * configuration).
 */
const buildParameterTemplate = (test, gender = "") => {
  const parameters = [...(test?.parameters || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));
  return parameters.map((parameter) => {
    const bounds = resolveBounds(parameter, gender);
    return {
      parameterId: parameter._id,
      parameter: parameter.parameter,
      unit: parameter.unit || "",
      referenceRange: formatReferenceRange(parameter, bounds),
      min: bounds.min ?? null,
      max: bounds.max ?? null,
      sexSpecific: bounds.sexSpecific,
      isRequired: parameter.isRequired !== false,
      isNumeric: parameter.isNumeric !== false,
      value: "",
      flag: "NORMAL",
      remarks: "",
    };
  });
};

const createResult = async (data, userId) => {
  const request = await LabRequest.findById(id(data.labRequest, "lab request id"));
  if (!request) fail("Laboratory request not found", 404);
  if (!request.test) {
    fail("Cannot record a result because this laboratory request has no valid LabTest reference. An administrator must repair or re-order the request.", 409);
  }
  warnIfLegacy(request);

  const status = normalizeStatus(request.status);
  if (!["PROCESSING", "COMPLETED"].includes(status)) {
    fail(`Results can only be recorded once processing has started. This request is ${request.status}.`, 409);
  }

  const sample = await SampleCollection.findById(id(data.sample, "sample id"));
  if (!sample) fail("The selected sample does not exist", 404);
  if (String(sample.labRequest) !== String(request._id)) {
    fail("The selected sample was not collected for this laboratory request", 409);
  }
  if (String(sample.test) !== String(request.test)) {
    fail("The selected sample is for a different test than this laboratory request", 409);
  }
  // A rejected specimen has no analysable content, so a result read off it would
  // be meaningless. Previously only the request status was checked.
  if (String(sample.status || "").toUpperCase() === "REJECTED") {
    fail("This sample was rejected and cannot have a result recorded against it. Collect a new sample instead.", 409);
  }

  const parameters = Array.isArray(data.parameters) ? data.parameters : [];
  if (parameters.length === 0) fail("At least one result parameter is required", 422);
  for (const [index, parameter] of parameters.entries()) {
    if (!parameter || !String(parameter.parameter || "").trim() || !String(parameter.value || "").trim()) {
      fail(`Result parameter ${index + 1} needs both a name and a value`, 422);
    }
  }

  // Units, reference ranges and default flags are resolved from the test's stored
  // configuration, so what lands on the report is the catalogue's range rather
  // than whatever the technician typed into the form.
  const test = await LabTest.findById(request.test).select("name parameters resultStyle");
  if (!test) fail("The laboratory test for this request no longer exists", 409);
  const resolved = await resolveParameters(test, parameters, request.patient);

  const result = await LabResult.create({
    labRequest: request._id,
    sample: sample._id,
    patient: request.patient,
    test: request.test,
    parameters: resolved,
    attachments: data.attachments || [],
    enteredBy: userId,
    enteredAt: new Date(),
  });

  // Bench notes are written from the result-entry form, where the technician
  // actually is. Without this they were typed, acknowledged and thrown away.
  const processingNotes = String(data.processingNotes || "").trim();
  if (processingNotes) {
    await LabRequest.updateOne({ _id: request._id }, { $set: { processingNotes, updatedBy: userId } });
  }

  // SRS FR-LB-04/8.1: the requesting doctor must know the result exists, even
  // before the report is generated and verified.
  await notifyLab(userId, "processingAlerts", request.doctor, "LAB_RESULT_ENTERED", "Laboratory result entered", `A result for ${testLabel(request.test)} has been entered and is awaiting report generation.`, "LabResult", result._id);
  await audit(userId, {
    action: "LAB_RESULT_ENTERED",
    targetType: "LabResult",
    targetId: result._id,
    metadata: {
      labRequest: String(request._id),
      sampleId: sample.sampleId,
      parameterCount: parameters.length,
      attachmentCount: (data.attachments || []).length,
      processingNotesRecorded: Boolean(processingNotes),
    },
  });
  return getResult(result._id);
};

const updateResult = async (resultId, data, userId) => {
  const result = await LabResult.findById(id(resultId, "result id"));
  if (!result) fail("Laboratory result not found", 404);

  // A verified or approved report is a released clinical document (SRS 6.3).
  // Editing the numbers behind it afterwards would silently change what a doctor
  // and patient have already read, so a released report freezes its results and a
  // correction has to be issued as a new revision instead.
  const releasedReport = await LabReport.findOne({
    results: result._id,
    status: { $in: ["VERIFIED", "APPROVED"] },
  }).select("reportId revision status");
  if (releasedReport) {
    fail(
      `This result belongs to ${releasedReport.status.toLowerCase()} report ${releasedReport.reportId} and can no longer be changed. Raise a corrected report instead.`,
      409
    );
  }

  if (data.parameters !== undefined) {
    if (!Array.isArray(data.parameters) || data.parameters.length === 0) {
      fail("At least one result parameter is required", 422);
    }
    for (const [index, parameter] of data.parameters.entries()) {
      if (!parameter || !String(parameter.parameter || "").trim() || !String(parameter.value || "").trim()) {
        fail(`Result parameter ${index + 1} needs both a name and a value`, 422);
      }
    }
  }
  const set = {};
  if (data.parameters !== undefined) {
    // Re-resolved against the catalogue, exactly as on create, so a corrected
    // value picks up the current reference range rather than keeping the typed-in
    // one the technician no longer trusts.
    const test = await LabTest.findById(result.test).select("name parameters resultStyle");
    set.parameters = await resolveParameters(test, data.parameters, result.patient);
  }
  if (data.attachments !== undefined) set.attachments = data.attachments;
  if (Object.keys(set).length) {
    set.updatedBy = userId;
    await LabResult.updateOne({ _id: result._id }, { $set: set }, { runValidators: true });
    await audit(userId, {
      action: "LAB_RESULT_UPDATED",
      targetType: "LabResult",
      targetId: result._id,
      metadata: { fields: Object.keys(set).filter((field) => field !== "updatedBy") },
    });
  }
  return getResult(result._id);
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const REPORT_STATUSES = ["DRAFT", "COMPLETED", "VERIFIED", "APPROVED", "SUPERSEDED"];

/**
 * A report in one of these states has been released to the doctor and the
 * patient, so the numbers behind it are a final clinical document. Anything
 * past release must be corrected by issuing a revision, never by editing.
 */
const RELEASED_REPORT_STATUSES = ["VERIFIED", "APPROVED"];

const reportPopulate = (query) => query.populate("patient", "name email gender").populate("doctor", "name email").populate("test", "name testName category").populate("sample", "sampleId sampleType barcode qrPayload collectionDate collectionTime").populate("results").populate("generatedBy", "name").populate("verifiedBy", "name").populate("approvedBy", "name");
const getReports = async (query = {}) => {
  const plan = buildQueryPlan(query, { sortable: "report" });
  const filter = {};
  if (query.status) {
    const target = String(query.status).trim().toUpperCase();
    if (!REPORT_STATUSES.includes(target)) fail(`"${query.status}" is not a valid report status. Use one of: ${REPORT_STATUSES.join(", ")}.`, 422);
    filter.status = target;
  }
  if (query.labRequest) filter.labRequest = id(query.labRequest, "lab request id");
  if (query.patient) filter.patient = id(query.patient, "patient id");
  if (query.doctor) filter.doctor = id(query.doctor, "doctor id");
  return runPaginated(reportPopulate(LabReport.find(filter)), plan);
};

const getReport = async (reportId) => {
  id(reportId, "report id");
  const report = await reportPopulate(LabReport.findById(reportId));
  if (!report) fail("Laboratory report not found", 404);
  return report;
};

const createReport = async (data, userId) => {
  const request = await LabRequest.findById(id(data.labRequest, "lab request id"));
  if (!request) fail("Laboratory request not found", 404);
  if (normalizeStatus(request.status) !== "COMPLETED") {
    fail(`Only a completed request can generate a report. This request is ${request.status}.`, 409);
  }

  // Input is validated before the "a report already exists" conflict is checked,
  // so a caller who sent no results is told that, rather than being told a report
  // already exists and left not knowing their payload was also empty. The
  // idempotency conflict is only meaningful once the request is well-formed.
  const resultIds = Array.isArray(data.results) ? data.results : [];
  if (resultIds.length === 0) fail("At least one result is required to generate a report", 422);

  // One live report per request. A correction is issued through reviseReport(),
  // which supersedes the old one rather than replacing it, so this stays the
  // check that stops a second independent report being generated for one test.
  const existing = await LabReport.findOne({ labRequest: request._id, status: { $ne: "SUPERSEDED" } }).select("reportId status revision");
  if (existing) {
    fail(
      `Report ${existing.reportId} already exists for this request. Use PATCH /lab/reports/${existing._id}/revise to issue a corrected revision.`,
      409
    );
  }

  // Ownership is proved, not assumed: every result and the sample must belong
  // to THIS request. Previously these ids were stored unchecked, which allowed
  // one patient's results to be attached to another patient's report.
  const foundResults = await LabResult.find({ _id: { $in: resultIds.map((value) => id(value, "result id")) } }).select("labRequest");
  if (foundResults.length !== resultIds.length) {
    fail("One or more of the supplied results do not exist", 404);
  }
  const foreignResult = foundResults.find((result) => String(result.labRequest) !== String(request._id));
  if (foreignResult) {
    fail("A supplied result belongs to a different laboratory request and cannot be included in this report", 409);
  }

  const sample = await SampleCollection.findById(id(data.sample, "sample id")).select("labRequest test sampleId status");
  if (!sample) fail("The selected sample does not exist", 404);
  if (String(sample.labRequest) !== String(request._id)) {
    fail("The selected sample was not collected for this laboratory request", 409);
  }
  // The report is stamped with the requested test, so the specimen it cites must
  // be the one for that test. Without this a report could name test A while
  // citing a sample drawn for test B.
  if (request.test && sample.test && String(sample.test) !== String(request.test)) {
    fail("The selected sample is for a different test than this laboratory request", 409);
  }
  if (String(sample.status || "").toUpperCase() === "REJECTED") {
    fail("This sample was rejected and cannot be reported on. Collect a new sample instead.", 409);
  }

  const report = await withDuplicateRetry(async () => LabReport.create({
    reportId: await nextReportId(),
    labRequest: request._id,
    patient: request.patient,
    doctor: request.doctor,
    test: request.test,
    sample: sample._id,
    results: resultIds,
    remarks: data.remarks,
    generatedBy: userId,
    generatedAt: new Date(),
    status: "COMPLETED",
    revision: 1,
  }));

  await notifyLab(userId, "reportVerificationAlerts", request.doctor, "LAB_REPORT_GENERATED", "Laboratory report generated", `Laboratory report ${report.reportId} has been generated for ${testLabel(request.test)} and is awaiting verification.`, "LabReport", report._id);
  await audit(userId, {
    action: "LAB_REPORT_GENERATED",
    targetType: "LabReport",
    targetId: report._id,
    metadata: { reportId: report.reportId, labRequest: String(request._id), sampleId: sample.sampleId, resultCount: resultIds.length },
  });
  return getReport(report._id);
};

/** Best-effort email. Never throws, never rolls back the verification. */
const emailReportReady = async (report, recipientRole, emailAddress) => {
  if (!emailAddress) return;
  try {
    const { text, html } = emailService.buildLabReportReadyEmail({
      name: recipientRole === "doctor" ? report.doctor?.name : report.patient?.name,
      reportId: report.reportId,
      testName: report.test?.name || report.test?.testName,
      loginUrl: `${emailService.env.appUrl}/login`,
    });
    await emailService.sendMail({ to: emailAddress, subject: `HILMS - Laboratory report ${report.reportId} is ready`, text, html });
  } catch (error) {
    console.error(`[LAB] Report-ready email failed for ${report.reportId}:`, error.message);
  }
};

const verifyReport = async (reportId, userId, options = {}) => {
  const report = await LabReport.findById(id(reportId, "report id"));
  if (!report) fail("Laboratory report not found", 404);
  if (RELEASED_REPORT_STATUSES.includes(report.status)) {
    fail(`This report has already been ${report.status.toLowerCase()}`, 409);
  }
  if (report.status !== "COMPLETED") {
    fail(`Only a completed report can be verified. This report is ${report.status}.`, 409);
  }

  const request = await LabRequest.findById(report.labRequest);
  if (!request) fail("The laboratory request for this report no longer exists", 409);
  if (normalizeStatus(request.status) !== "COMPLETED") {
    fail(`The laboratory request for this report is ${request.status}. Only a completed request can be verified.`, 409);
  }

  // SRS FR-LB-05: a report may not be marked verified without the result data.
  // The report carries the results array, and each result carries at least one
  // parameter - so an empty report, or one whose results were detached, cannot
  // be released to a doctor.
  const results = await LabResult.find({ _id: { $in: report.results || [] } }).select("_id parameters attachments");
  if (!results.length) {
    fail("Report cannot be verified until results are complete. Attach at least one result to this report first.", 409);
  }
  const emptyResult = results.find((result) => !(result.parameters || []).some((parameter) => String(parameter.value || "").trim()));
  if (emptyResult) {
    fail("Report cannot be verified until results are complete. Every result parameter needs a recorded value.", 409);
  }

  // The reviewer's attestations. Recorded with the verification so the release
  // carries evidence of what was actually checked, not just that someone clicked.
  const verificationChecks = {
    resultsChecked: Boolean(options.checks?.resultsChecked),
    referenceRangesChecked: Boolean(options.checks?.referenceRangesChecked),
    attachmentsChecked: Boolean(options.checks?.attachmentsChecked),
  };
  const unchecked = Object.entries(verificationChecks).filter(([, value]) => !value).map(([key]) => key);
  if (unchecked.length) {
    fail(`Report cannot be verified until every review check is confirmed: ${unchecked.join(", ")}.`, 422);
  }

  const verifiedAt = new Date();

  // Resolved before the transaction opens so the settings read does not join the
  // transaction's connection pool.
  const alertsEnabled = await wantsLabAlert(userId, "reportVerificationAlerts");

  // Report state, request state and both notifications move together, so a
  // failure cannot leave a verified report attached to a non-verified request.
  let createdNotifications = [];
  await withOptionalTransaction(async (session) => {
    const opts = session ? { session } : {};

    const updatedReport = await LabReport.findOneAndUpdate(
      { _id: report._id, status: "COMPLETED" },
      { $set: { status: "VERIFIED", verifiedBy: userId, verifiedAt, verificationChecks } },
      { ...opts, new: true, runValidators: true }
    );
    if (!updatedReport) fail("This report was verified by another user a moment ago", 409);

    await LabRequest.updateOne(
      { _id: report.labRequest },
      { $set: { status: "VERIFIED", verifiedBy: userId, verifiedAt, updatedBy: userId }, $push: { statusHistory: { from: "COMPLETED", to: "VERIFIED", by: userId, at: verifiedAt } } },
      opts
    );

    if (!alertsEnabled) return;

    // `ordered: true` is mandatory here: Mongoose refuses a multi-document
    // `create` inside a session without it, and this deployment does support
    // transactions, so the failure was live rather than theoretical. A failure
    // part-way through the batch would roll the whole verification back anyway.
    createdNotifications = await createNotifications(
      [
        { recipient: report.doctor, type: "LAB_REPORT_VERIFIED", title: "Laboratory report verified", message: `Laboratory report ${report.reportId} has been verified and is ready for review.`, entityType: "LabReport", entityId: report._id },
        { recipient: report.patient, type: "LAB_REPORT_VERIFIED", title: "Your laboratory report is ready", message: `Your laboratory report ${report.reportId} has been verified and is now available.`, entityType: "LabReport", entityId: report._id },
      ],
      session
    );
  });

  const updated = await getReport(report._id);
  // Emails are dispatched after the transaction commits and can never undo it.
  // They are gated by the same preference as the in-app notification, so turning
  // report alerts off is genuinely quiet rather than half-quiet.
  if (alertsEnabled) {
    await Promise.allSettled([
      emailReportReady(updated, "doctor", updated.doctor?.email),
      emailReportReady(updated, "patient", updated.patient?.email),
    ]);
  }
  await audit(userId, {
    action: "LAB_REPORT_VERIFIED",
    targetType: "LabReport",
    targetId: updated._id,
    metadata: { reportId: updated.reportId, labRequest: String(updated.labRequest), resultCount: (updated.results || []).length, verificationChecks },
  });
  createdNotifications.forEach(publishNotification);
  const verifiedEvent = {
    reportId: String(updated._id),
    status: updated.status,
    changedAt: verifiedAt.toISOString(),
  };
  if (alertsEnabled) {
    emitToUser(updated.doctor?._id, REALTIME_EVENTS.LAB_REPORT_VERIFIED, verifiedEvent);
    emitToUser(updated.patient?._id, REALTIME_EVENTS.LAB_REPORT_VERIFIED, verifiedEvent);
  }
  emitToRole("lab", REALTIME_EVENTS.LAB_REPORT_VERIFIED, verifiedEvent);
  return updated;
};

/**
 * Final sign-off (SRS FR-LB-05: "generate, verify, and approve").
 *
 * Verification releases the report to the requesting doctor; approval is the
 * laboratory's own finalisation, after which the document is treated as
 * immutable and any correction has to be issued as a revision. Both the report
 * and the request move together so the request's status always matches the
 * document hanging off it.
 */
const approveReport = async (reportId, userId) => {
  const report = await LabReport.findById(id(reportId, "report id"));
  if (!report) fail("Laboratory report not found", 404);
  if (report.status === "APPROVED") fail("This report has already been approved", 409);
  if (report.status === "SUPERSEDED") fail("This report has been superseded by a later revision and can no longer be approved", 409);
  if (report.status !== "VERIFIED") {
    fail(`A report must be verified before it can be approved. This report is ${report.status}.`, 409);
  }

  const request = await LabRequest.findById(report.labRequest);
  if (!request) fail("The laboratory request for this report no longer exists", 409);

  const approvedAt = new Date();
  let createdNotifications = [];
  await withOptionalTransaction(async (session) => {
    const opts = session ? { session } : {};
    const updatedReport = await LabReport.findOneAndUpdate(
      { _id: report._id, status: "VERIFIED" },
      { $set: { status: "APPROVED", approvedBy: userId, approvedAt } },
      { ...opts, new: true, runValidators: true }
    );
    if (!updatedReport) fail("This report was approved by another user a moment ago", 409);

    await LabRequest.updateOne(
      { _id: report.labRequest },
      { $set: { updatedBy: userId }, $push: { statusHistory: { from: "VERIFIED", to: "APPROVED", by: userId, at: approvedAt, note: "Report approved" } } },
      opts
    );

    // The doctor is told the report is final, which is a different action from
    // "a report is ready": it means the numbers will not move again.
    createdNotifications = await createNotifications(
      [
        { recipient: report.doctor, type: "LAB_REPORT_APPROVED", title: "Laboratory report approved", message: `Laboratory report ${report.reportId} has been approved as final.`, entityType: "LabReport", entityId: report._id },
        { recipient: report.patient, type: "LAB_REPORT_APPROVED", title: "Your laboratory report is final", message: `Laboratory report ${report.reportId} has been approved as final.`, entityType: "LabReport", entityId: report._id },
      ],
      session
    );
  });

  const updated = await getReport(report._id);
  await audit(userId, {
    action: "LAB_REPORT_APPROVED",
    targetType: "LabReport",
    targetId: updated._id,
    metadata: { reportId: updated.reportId, labRequest: String(updated.labRequest), revision: updated.revision },
  });
  createdNotifications.forEach(publishNotification);
  const approvedEvent = {
    reportId: String(updated._id),
    status: updated.status,
    changedAt: approvedAt.toISOString(),
  };
  emitToUser(updated.doctor?._id, REALTIME_EVENTS.LAB_REPORT_APPROVED, approvedEvent);
  emitToUser(updated.patient?._id, REALTIME_EVENTS.LAB_REPORT_APPROVED, approvedEvent);
  emitToRole("lab", REALTIME_EVENTS.LAB_REPORT_APPROVED, approvedEvent);
  return updated;
};

/**
 * Issues a corrected revision of a report that has already been released.
 *
 * A verified or approved report is a clinical document a doctor and a patient
 * have already read, so it is never overwritten. This clones it into a new report
 * with revision + 1, marks the original SUPERSEDED, and carries the reason. The
 * original stays readable, so the audit trail survives the correction rather than
 * being erased by it.
 *
 * The revision lands in COMPLETED, not DRAFT: it already carries its own results
 * and report number, so it enters the ordinary verify -> approve path with no
 * special-casing. The request is walked back to COMPLETED to match.
 */
const reviseReport = async (reportId, data, userId) => {
  const original = await LabReport.findById(id(reportId, "report id"));
  if (!original) fail("Laboratory report not found", 404);
  if (!RELEASED_REPORT_STATUSES.includes(original.status)) {
    fail(`Only a verified or approved report can be revised. This report is ${original.status}.`, 409);
  }
  const reason = String(data?.reason || "").trim();
  if (!reason) fail("A reason is required to revise a released report", 422);

  const live = await LabReport.findOne({ labRequest: original.labRequest, status: { $ne: "SUPERSEDED" } }).select("_id reportId revision");
  if (live && String(live._id) !== String(original._id)) {
    fail(`Report ${live.reportId} is already the live revision for this request. Revise that one instead.`, 409);
  }

  const revision = (original.revision || 1) + 1;

  // The revision starts with its own copy of the results so a correction is a
  // difference a reader can see, rather than an empty document that silently
  // replaces the numbers. Editing those copied parameters is permitted because
  // the copy belongs to the new, unreleased report.
  const copiedResults = [];
  for (const source of await LabResult.find({ _id: { $in: original.results || [] } })) {
    const copy = await LabResult.create({
      labRequest: source.labRequest,
      sample: source.sample,
      patient: source.patient,
      test: source.test,
      parameters: (source.parameters || []).map((parameter) => ({ ...parameter.toObject?.() ?? parameter })),
      attachments: source.attachments || [],
      enteredBy: userId,
      enteredAt: new Date(),
    });
    copiedResults.push(copy._id);
  }
  if (!copiedResults.length) {
    fail("The report being revised has no results to carry forward.", 409);
  }

  const revisionReport = await withDuplicateRetry(async () => LabReport.create({
    reportId: await nextReportId(),
    labRequest: original.labRequest,
    patient: original.patient,
    doctor: original.doctor,
    test: original.test,
    sample: original.sample,
    results: copiedResults,
    remarks: original.remarks,
    generatedBy: userId,
    generatedAt: new Date(),
    // COMPLETED, not DRAFT: this revision already has its results and its own
    // report number, so it is a generated report awaiting verification. A DRAFT
    // revision was a dead end - nothing can move a report out of DRAFT
    // (createReport only ever writes COMPLETED and verifyReport only accepts
    // COMPLETED), and createReport now refuses a second report for the request,
    // so the revision could never be verified or approved at all.
    status: "COMPLETED",
    revision,
    amends: original._id,
    amendmentReason: reason,
  }));

  let createdNotifications = [];
  await withOptionalTransaction(async (session) => {
    const opts = session ? { session } : {};
    await LabReport.updateOne({ _id: original._id }, { $set: { status: "SUPERSEDED" } }, opts);
    // The request returns to COMPLETED so the revision is generated, verified and
    // approved through the normal controlled path.
    await LabRequest.updateOne(
      { _id: original.labRequest },
      {
        $set: { status: "COMPLETED", updatedBy: userId },
        $unset: { verifiedBy: 1, verifiedAt: 1 },
        $push: { statusHistory: { from: original.status, to: "COMPLETED", by: userId, at: new Date(), note: `Revision ${revision} raised: ${reason}` } },
      },
      opts
    );
    createdNotifications = await createNotifications(
      { recipient: original.doctor, type: "LAB_REPORT_REVISED", title: "Laboratory report under revision", message: `Laboratory report ${original.reportId} has been superseded by revision ${revision}.`, entityType: "LabReport", entityId: revisionReport._id },
      session
    );
  });

  await audit(userId, {
    action: "LAB_REPORT_REVISED",
    targetType: "LabReport",
    targetId: revisionReport._id,
    metadata: { reportId: revisionReport.reportId, amends: String(original._id), previousReportId: original.reportId, revision, reason },
  });
  const updated = await getReport(revisionReport._id);
  createdNotifications.forEach(publishNotification);
  const revisedEvent = {
    reportId: String(updated._id),
    status: updated.status,
    changedAt: new Date().toISOString(),
  };
  emitToUser(updated.doctor?._id, REALTIME_EVENTS.LAB_REPORT_REVISED, revisedEvent);
  emitToRole("lab", REALTIME_EVENTS.LAB_REPORT_REVISED, revisedEvent);
  return updated;
};

// ---------------------------------------------------------------------------
// Test categories (SRS FR-LB-06)
// ---------------------------------------------------------------------------

/**
 * Lists the laboratory's test categories with a live test count.
 *
 * The count comes from a grouped aggregate on LabTest rather than being loaded
 * per row, so the category manager stays one query regardless of catalogue size.
 */
const getCategories = async ({ includeInactive = false } = {}) => {
  const filter = includeInactive ? {} : { isActive: true };
  const counts = await LabTest.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const countByCategory = new Map(counts.map((row) => [row._id, row.count]));
  const categories = await LabTestCategory.find(filter).sort({ order: 1, name: 1 }).lean();
  return categories.map((category) => ({ ...category, testCount: countByCategory.get(category.name) || 0 }));
};

/**
 * Resolves a category by name, creating it when it is genuinely new.
 *
 * A category name typed into the test form that does not exist yet is a new
 * department the laboratory is working in, not an error - the catalogue has to be
 * able to grow without a database migration. Existing rows that predate this
 * collection are backfilled on first sight so their categories become manageable
 * rather than orphaned.
 */
const resolveCategory = async (name, { create = true } = {}) => {
  const trimmed = String(name || "").trim();
  if (!trimmed) fail("A test category is required", 422);
  const slug = LabTestCategory.slugify(trimmed);
  if (!slug) fail(`"${trimmed}" cannot be used as a category name`, 422);

  const existing = await LabTestCategory.findOne({ $or: [{ slug }, { name: new RegExp(`^${escapeRegex(trimmed)}$`, "i") }] });
  if (existing) return existing;
  if (!create) return null;
  return LabTestCategory.create({ name: trimmed, slug });
};

const createCategory = async (data) => {
  const name = String(data?.name || "").trim();
  if (!name) fail("A category name is required", 422);
  const slug = LabTestCategory.slugify(name);
  if (!slug) fail(`"${name}" cannot be used as a category name`, 422);
  const clash = await LabTestCategory.findOne({ $or: [{ slug }, { name: new RegExp(`^${escapeRegex(name)}$`, "i") }] }).select("name");
  if (clash) fail(`A category named "${clash.name}" already exists.`, 409);
  const order = data?.order ?? (await LabTestCategory.countDocuments());
  return LabTestCategory.create({ name, slug, description: data?.description, order: Number(order) || 0, isActive: data?.isActive !== false });
};

/**
 * Renames or reorders a category.
 *
 * A rename also rewrites `LabTest.category` on every test filed under it, because
 * that field holds the category's name and a report printed today has to agree
 * with the catalogue. Tests keep pointing at the same `categoryRef`, and the slug
 * is deliberately left alone so the rename does not break stored references.
 */
const updateCategory = async (categoryId, data) => {
  id(categoryId, "category id");
  const category = await LabTestCategory.findById(categoryId);
  if (!category) fail("Laboratory test category not found", 404);

  const set = {};
  if (data.description !== undefined) set.description = data.description;
  if (data.order !== undefined) set.order = Number(data.order) || 0;
  if (data.isActive !== undefined) set.isActive = Boolean(data.isActive);

  const nextName = data.name === undefined ? null : String(data.name).trim();
  if (nextName !== null) {
    if (!nextName) fail("A category name cannot be blank", 422);
    const clash = await LabTestCategory.findOne({ _id: { $ne: category._id }, name: new RegExp(`^${escapeRegex(nextName)}$`, "i") }).select("name");
    if (clash) fail(`A category named "${clash.name}" already exists.`, 409);
    set.name = nextName;
  }

  const updated = await LabTestCategory.findByIdAndUpdate(categoryId, { $set: set }, { new: true, runValidators: true });
  if (!updated) fail("Laboratory test category not found", 404);

  if (nextName && nextName !== category.name) {
    await LabTest.updateMany({ category: category.name }, { $set: { category: nextName } });
  }
  return updated;
};

/**
 * Retires a category.
 *
 * A category that still has tests cannot be switched off silently - the Tests
 * screen groups by category and an active test hidden behind a retired category
 * looks like data loss. The caller has to move or deactivate those tests first.
 */
const deleteCategory = async (categoryId) => {
  id(categoryId, "category id");
  const category = await LabTestCategory.findById(categoryId);
  if (!category) fail("Laboratory test category not found", 404);
  const activeTests = await LabTest.countDocuments({ category: category.name, isActive: true });
  if (activeTests > 0) {
    fail(
      `"${category.name}" still has ${activeTests} active test${activeTests === 1 ? "" : "s"}. Move or deactivate ${activeTests === 1 ? "it" : "them"} before removing the category.`,
      409
    );
  }
  return LabTestCategory.findByIdAndUpdate(categoryId, { $set: { isActive: false } }, { new: true });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const getTests = async (filter = {}) => {
  const query = filter || {};
  return LabTest.find(query).sort({ category: 1, name: 1 });
};

const getTest = async (testId) => {
  id(testId, "test id");
  const test = await LabTest.findById(testId);
  if (!test) fail("Laboratory test not found", 404);
  return test;
};

/**
 * Validates a test's configured parameter panel.
 *
 * A reference range that cannot be rendered on a report is worse than none: the
 * result entry form would show a blank reference column and the technician would
 * have to retype it. Both the bound and the text forms are therefore checked at
 * write time rather than at report time.
 */
const normalizeTestParameters = (parameters) => {
  if (parameters === undefined) return undefined;
  if (!Array.isArray(parameters)) fail("Test parameters must be a list", 422);
  const seen = new Set();
  return parameters.map((parameter, index) => {
    const name = String(parameter?.parameter || "").trim();
    if (!name) fail(`Test parameter ${index + 1} needs a name`, 422);
    const key = name.toLowerCase();
    if (seen.has(key)) fail(`Test parameter "${name}" is listed more than once`, 422);
    seen.add(key);

    const numeric = ["min", "max", "maleMin", "maleMax", "femaleMin", "femaleMax"].reduce((acc, field) => {
      if (parameter?.[field] !== undefined && parameter[field] !== null && parameter[field] !== "") {
        const parsed = Number(parameter[field]);
        if (!Number.isFinite(parsed)) fail(`Test parameter "${name}" has a non-numeric ${field}`, 422);
        acc[field] = parsed;
      }
      return acc;
    }, {});

    const hasBound = numeric.min != null || numeric.max != null;
    const hasSexBound = numeric.maleMin != null || numeric.maleMax != null || numeric.femaleMin != null || numeric.femaleMax != null;
    if (!hasBound && !hasSexBound && !String(parameter?.referenceRangeText || "").trim()) {
      fail(`Test parameter "${name}" needs a reference range (min/max or reference text) so results can be interpreted`, 422);
    }
    if (numeric.min != null && numeric.max != null && numeric.min > numeric.max) {
      fail(`Test parameter "${name}" has a minimum (${numeric.min}) above its maximum (${numeric.max})`, 422);
    }

    return {
      parameter: name,
      unit: String(parameter?.unit || "").trim(),
      min: numeric.min,
      max: numeric.max,
      referenceRangeText: String(parameter?.referenceRangeText || "").trim(),
      maleMin: numeric.maleMin,
      maleMax: numeric.maleMax,
      femaleMin: numeric.femaleMin,
      femaleMax: numeric.femaleMax,
      isRequired: parameter?.isRequired !== false,
      isNumeric: parameter?.isNumeric !== false,
      sortOrder: Number.isFinite(Number(parameter?.sortOrder)) ? Number(parameter.sortOrder) : index,
      // Preserve the parameter _id when the client already knows it (test
      // management form round-trip). Keeping the _id stable means a re-saved
      // test does not orphan result.parameters[].parameterId references that
      // were stored against the old parameter.
      ...(parameter?._id ? { _id: parameter._id } : {}),
    };
  });
};

/** Keeps the legacy flat `normalRange` string in step with the parameter panel. */
const deriveNormalRange = (test) => {
  if (test.normalRange !== undefined) return {};
  const parameters = test.parameters || [];
  if (!parameters.length) return {};
  return {
    normalRange: parameters
      .map((parameter) => {
        const range = formatReferenceRange(parameter, { min: parameter.min, max: parameter.max });
        return range ? `${parameter.parameter} ${range}` : parameter.parameter;
      })
      .join("; "),
    referenceRanges: parameters.map((parameter) => {
      const range = formatReferenceRange(parameter, { min: parameter.min, max: parameter.max });
      return `${parameter.parameter}${range ? ` ${range}` : ""}`;
    }),
  };
};

const createTest = async (data) => {
  if (!String(data.name || data.testName || "").trim()) fail("A test name is required", 422);
  if (!String(data.category || "").trim()) fail("A test category is required", 422);
  if (data.price === undefined || data.price === null || data.price === "") fail("A test price is required", 422);
  if (Number(data.price) < 0) fail("Price cannot be negative", 422);

  const category = await resolveCategory(data.category);
  const payload = { ...data, name: data.name || data.testName, category: category.name, categoryRef: category._id };
  const parameters = normalizeTestParameters(data.parameters);
  if (parameters) payload.parameters = parameters;
  const derived = deriveNormalRange(payload);
  return LabTest.create({ ...payload, ...derived });
};

const updateTest = async (testId, data) => {
  id(testId, "test id");
  if (data.price !== undefined && Number(data.price) < 0) fail("Price cannot be negative", 422);

  const payload = { ...data };
  delete payload.includeInactive;

  if (data.category !== undefined) {
    const category = await resolveCategory(data.category);
    payload.category = category.name;
    payload.categoryRef = category._id;
  }
  const parameters = normalizeTestParameters(data.parameters);
  if (parameters) payload.parameters = parameters;
  Object.assign(payload, deriveNormalRange(payload));

  const test = await LabTest.findByIdAndUpdate(testId, { $set: payload }, { new: true, runValidators: true });
  if (!test) fail("Laboratory test not found", 404);
  return test;
};

/**
 * The blank result-entry rows for a test, resolved for one patient.
 *
 * The result form is built from this rather than from a hardcoded analyte list,
 * so "Complete Blood Count" brings up haemoglobin, white cell count and
 * platelets with their catalogue ranges, and a test added tomorrow brings up its
 * own parameters with no code change.
 */
const getTestParameterTemplate = async (testId, patientId) => {
  const test = await getTest(testId);
  const gender = patientId
    ? (await User.findById(id(patientId, "patient id")).select("gender").lean())?.gender
    : "";
  return {
    testId: test._id,
    testName: testLabel(test),
    resultStyle: test.resultStyle || "PANEL",
    parameters: buildParameterTemplate(test, gender),
  };
};

/** Soft delete: the catalogue must never lose a test a past report references. */
const deleteTest = async (testId) => {
  id(testId, "test id");
  const test = await LabTest.findByIdAndUpdate(testId, { $set: { isActive: false } }, { new: true, runValidators: true });
  if (!test) fail("Laboratory test not found", 404);
  return test;
};

const setTestActive = async (testId, isActive, userId) => {
  id(testId, "test id");
  const test = await LabTest.findByIdAndUpdate(testId, { $set: { isActive: Boolean(isActive) } }, { new: true, runValidators: true });
  if (!test) fail("Laboratory test not found", 404);
  return test;
};

// ---------------------------------------------------------------------------
// Search / patient context / notifications / profile / settings
// ---------------------------------------------------------------------------

const getPatient = async (patientId) => {
  const patient = await User.findOne({ _id: id(patientId, "patient id"), role: "patient", isActive: true }).select("name email phone createdAt");
  if (!patient) fail("Patient not found", 404);
  // `getRequests` is the paginated source of truth; a bare Mongoose Query has
  // no `.data`, so calling `labRequestQuery` here silently returned undefined.
  const [requests, reports] = await Promise.all([
    getRequests({ patient: patient._id, limit: 0 }),
    getReports({ patient: patient._id, limit: 0 }),
  ]);
  return { patient, laboratoryRequests: requests.data, previousReports: reports.data };
};

const search = async (query) => {
  const q = String(query || "").trim();
  if (q.length < 2) return { patients: [], requests: [], samples: [], tests: [], reports: [] };
  const regex = new RegExp(escapeRegex(q), "i");

  // Resolve matching patient/test ids first so request search can match on
  // populated names without a collection scan or a post-filter in memory.
  const [patientIds, testIds] = await Promise.all([
    User.find({ role: "patient", $or: [{ name: regex }, { email: regex }] }).select("_id").lean(),
    LabTest.find({ $or: [{ name: regex }, { testName: regex }, { testCode: regex }] }).select("_id").lean(),
  ]);

  const [patients, requests, samples, tests, reports] = await Promise.all([
    User.find({ role: "patient", $or: [{ name: regex }, { email: regex }] }).select("name email").limit(10),
    labRequestQuery({ $or: [{ clinicalNotes: regex }, { patient: { $in: patientIds.map((p) => p._id) } }, { test: { $in: testIds.map((t) => t._id) } }] }).limit(10),
    SampleCollection.find({ $or: [{ sampleId: regex }, { barcode: regex }] }).populate("patient", "name").limit(10),
    LabTest.find({ $or: [{ name: regex }, { testName: regex }, { testCode: regex }] }).limit(10),
    LabReport.find({ reportId: regex }).populate("patient", "name").limit(10),
  ]);
  return { patients, requests, samples, tests, reports };
};

const getNotifications = async (userId, query = {}) => {
  const plan = buildQueryPlan(query, { sortable: "notification" });
  const filter = { recipient: userId };
  if (query.unread === "true") filter.readAt = null;
  if (query.read === "true") filter.readAt = { $ne: null };
  return runPaginated(Notification.find(filter), plan);
};

const getUnreadNotificationCount = async (userId) =>
  Notification.countDocuments({ recipient: userId, readAt: null });

// The recipient is part of the filter, so a notification belonging to somebody
// else is simply not found - never updated.
const markNotificationRead = async (notificationId, userId) => {
  const item = await Notification.findOneAndUpdate(
    { _id: id(notificationId, "notification id"), recipient: userId },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!item) fail("Notification not found", 404);
  return item;
};

const markAllNotificationsRead = async (userId) => {
  await Notification.updateMany({ recipient: userId, readAt: null }, { $set: { readAt: new Date() } });
  const { data } = await getNotifications(userId, { limit: 0 });
  return data;
};

const getProfile = async (userId) =>
  User.findById(userId).select("name email phone profilePhotoUrl role isActive createdAt updatedAt");

const updateProfile = async (userId, data) => {
  const allowed = {};
  ["name", "phone", "contactNumber"].forEach((field) => { if (data[field] !== undefined) allowed[field] = data[field]; });
  // Identity comes from the JWT. A patientId in the body is never consulted.
  return User.findByIdAndUpdate(userId, { $set: allowed }, { new: true, runValidators: true }).select("name email phone contactNumber role isActive createdAt updatedAt");
};

// Delegates to the shared implementation every other role uses, so a password
// change here clears `mustChangePassword` and writes an audit record exactly
// like `PATCH /auth/change-password` does. Re-implementing it locally is what
// previously left a forced-change flag set after a successful change, keeping
// the account blocked by `blockUntilPasswordChanged` on every other lab route.
const updatePassword = async (userId, data) =>
  passwordService.changePassword(userId, data);

const getSettings = async (userId) => LabSettings.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { new: true, upsert: true, setDefaultsOnInsert: true });

const updateSettings = async (userId, data) => {
  const allowed = {};
  ["urgentRequestAlerts", "processingAlerts", "reportVerificationAlerts", "emailNotifications"].forEach((field) => { if (data[field] !== undefined) allowed[field] = Boolean(data[field]); });
  return LabSettings.findOneAndUpdate({ user: userId }, { $set: allowed, $setOnInsert: { user: userId } }, { new: true, upsert: true, setDefaultsOnInsert: true });
};

module.exports = {
  getDashboard,
  getRequests, getRequest, acceptRequest, updateRequestStatus,
  getSamples, getSample, createSample, updateSample,
  getProcessing, getProcessingItem, startProcessing, completeProcessing,
  getResults, getResult, createResult, updateResult,
  getReports, getReport, createReport, verifyReport, approveReport, reviseReport,
  getCategories, createCategory, updateCategory, deleteCategory,
  getTests, getTest, getTestParameterTemplate, createTest, updateTest, deleteTest, setTestActive,
  getSampleLabel, findSampleByCode,
  getPatient, search,
  getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
  getProfile, updateProfile, updatePassword, getSettings, updateSettings,
  // Exported for the e2e suite so it can assert the workflow rules directly.
  STATUS_VARIANTS, TRANSITIONS, SAMPLE_TYPES, REPORT_STATUSES, RELEASED_REPORT_STATUSES, normalizeStatus,
  // Shared with the doctor ordering service so the "notify the laboratory" rule
  // (SRS 8.1) has exactly one implementation.
  notifyLabStaff,
  // Shared so the doctor module resolves sex-specific reference ranges from the
  // same catalogue entry the laboratory recorded the result against.
  resolveBounds, formatReferenceRange,
};
