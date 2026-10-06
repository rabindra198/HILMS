const logger = require("../utils/logger");
const response = require("../utils/response");

/**
 * Centralized error handler.
 *
 * Only deliberate, client-safe messages are returned. Unexpected failures are
 * logged server-side and reported to the client as a generic message, so stack
 * traces and internal details are never exposed.
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  logger.error(err.stack || err.message);

  // Mongoose schema validation
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors || {})
      .map((el) => el.message)
      .join(", ");
    return response.error(res, message || "Validation failed", 400);
  }

  // Duplicate key (e.g. unique email race)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || { field: "" })[0];
    return response.error(res, field ? `${field} is already in use` : "Duplicate value", 409);
  }

  // Database unreachable
  if (
    err.name === "MongooseError" ||
    err.name === "MongoServerSelectionError" ||
    err.name === "MongoNetworkError" ||
    err.name === "MongoTopologyClosedError" ||
    err.name === "MongoTimeoutError"
  ) {
    return response.error(res, "Database unavailable. Please try again shortly.", 503);
  }

  const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;

  if (statusCode >= 500) {
    return response.error(res, "Something went wrong. Please try again.", statusCode);
  }

  return response.error(res, err.message || "Request failed", statusCode, err.details);
};

module.exports = { errorHandler };
