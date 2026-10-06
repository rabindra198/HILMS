/**
 * The envelope every endpoint already returns.
 *
 * `meta` is a new, optional trailing argument. It is spread onto the response
 * body as sibling keys, which is how `pagination` is exposed without wrapping
 * `data` - existing callers keep reading `response.data.data` and keep getting
 * a plain array. Callers that pass fewer than five arguments are unaffected.
 */
const success = (res, data, statusCode = 200, message = "Success", meta) => {
  return res.status(statusCode).json({ success: true, message, data, ...(meta || {}) });
};

const error = (res, message = "Something went wrong", statusCode = 500, details) => {
  return res.status(statusCode).json({ success: false, message, ...(details || {}) });
};

module.exports = { success, error };