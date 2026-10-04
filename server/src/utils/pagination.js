/**
 * Shared list-query helpers.
 *
 * SRS: large datasets must be paginated, and the response must carry metadata
 * while NOT breaking the existing `{ success, message, data }` contract that
 * every current frontend caller already reads via `response.data.data`.
 *
 * The rule this file exists to enforce: list endpoints keep returning a plain
 * ARRAY in `data`, and the pagination envelope is attached as a sibling key by
 * `utils/response.js`. Nothing that already works changes shape.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Fields a client is allowed to sort by, per collection. Anything else 422s. */
const SORTABLE = Object.freeze({
  labRequest: ["createdAt", "updatedAt", "requestedDate", "status", "priority"],
  sample: ["createdAt", "collectionDate", "status", "sampleId"],
  result: ["createdAt", "enteredAt"],
  report: ["createdAt", "generatedAt", "status", "reportId"],
  test: ["createdAt", "name", "category", "price"],
  notification: ["createdAt", "readAt"],
  user: ["createdAt", "name", "email"],
  appointment: ["createdAt", "appointmentDate", "status"],
  default: ["createdAt", "updatedAt"],
});

const fail = (message, statusCode = 422) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

/** Parses an optional ISO date, rejecting anything unparseable. */
const parseDate = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) fail(`"${fieldName}" is not a valid date`, 422);
  return parsed;
};

/**
 * Turns `?page=&limit=&sort=&order=` into a validated query plan.
 * `limit=0` is the documented escape hatch for "give me everything" and is
 * what the lab UI keeps using implicitly while it grows a real pager.
 */
const buildQueryPlan = (query = {}, options = {}) => {
  const allowed = SORTABLE[options.sortable] || SORTABLE.default;

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawLimit = Number.parseInt(query.limit, 10);
  const unlimited = rawLimit === 0;
  const limit = unlimited ? 0 : Math.min(MAX_LIMIT, Math.max(1, rawLimit || options.defaultLimit || DEFAULT_LIMIT));

  const sort = String(query.sort || allowed[0]);
  if (!allowed.includes(sort)) {
    fail(`Cannot sort by "${sort}". Allowed: ${allowed.join(", ")}`, 422);
  }
  const order = String(query.order || options.defaultOrder || "desc").toLowerCase() === "asc" ? 1 : -1;

  return { page, limit, skip: limit > 0 ? (page - 1) * limit : 0, sort, order: { [sort]: order } };
};

/**
 * Runs a Mongoose query as a paginated read. Returns the array plus the
 * metadata envelope for the response.
 */
const runPaginated = async (query, plan, extraMeta = {}) => {
  const order = Object.values(plan.order)[0] === 1 ? "asc" : "desc";

  // `limit=0` means "no paging" - the compatibility escape hatch.
  if (plan.limit === 0) {
    const data = await query;
    const total = Array.isArray(data) ? data.length : 0;
    return { data, pagination: { page: 1, limit: 0, total, totalPages: 1, sort: plan.sort, order, ...extraMeta } };
  }

  // A Query is single-use: awaiting `countDocuments()` on it marks it executed,
  // and the follow-up `.sort().skip().limit()` read then throws
  // "Query was already executed". It bites as soon as the caller has chained
  // `.populate()`, which every laboratory list does. Cloning gives each read
  // its own query while keeping one filter definition.
  const total = await query.clone().countDocuments();
  const data = await query.sort(plan.order).skip(plan.skip).limit(plan.limit);

  return {
    data,
    pagination: {
      page: plan.page,
      limit: plan.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / plan.limit)),
      sort: plan.sort,
      order,
      ...extraMeta,
    },
  };
};

module.exports = { buildQueryPlan, runPaginated, parseDate, fail, DEFAULT_LIMIT, MAX_LIMIT, SORTABLE };
