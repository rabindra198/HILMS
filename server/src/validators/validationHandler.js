const { validationResult } = require("express-validator");

/**
 * Single shared express-validator error formatter.
 * Returns a safe, user-facing message - never a stack trace.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array();
    return res.status(400).json({
      success: false,
      message: formattedErrors[0]?.msg || "Validation failed",
      errors: formattedErrors.map(({ msg, path }) => ({ field: path, message: msg })),
    });
  }
  return next();
};

module.exports = { handleValidationErrors };
