const mongoose = require("mongoose");

/**
 * Shared laboratory value helpers.
 *
 * NOTE: this file is NOT mounted as router middleware. Request validation for
 * `/lab/*` lives in `services/lab.service.js`, which already returns the
 * project's standard `422` / `404` / `409` errors through the central error
 * handler. The previous version of this file was unreferenced dead code whose
 * status list disagreed with the model - it allowed `completed` but not
 * `accepted` or `verified`, and it expected a `patient` + free-text `result` on
 * report creation, none of which the API accepts. Leaving that in place invited
 * someone to wire it up later and silently change every response code.
 *
 * It is kept for the two things that are genuinely reusable: object-id parsing
 * and the canonical status vocabulary.
 */

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/** Canonical request status values, matching `models/LabRequest.js`. */
const REQUEST_STATUSES = ["PENDING", "ACCEPTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED", "VERIFIED", "CANCELLED"];

/** Canonical sample status values, matching `models/SampleCollection.js`. */
const SAMPLE_STATUSES = ["NOT_COLLECTED", "COLLECTED", "REJECTED"];

/** Lower-case spellings accepted on input and normalised by the service. */
const PRIORITIES = ["ROUTINE", "URGENT", "STAT"];

module.exports = { isValidObjectId, REQUEST_STATUSES, SAMPLE_STATUSES, PRIORITIES };
