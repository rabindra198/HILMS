const { body, validationResult } = require("express-validator");
const { ROLE_VALUES } = require("../config/roles");

const validateSignup = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2 })
    .withMessage("Name must be at least 2 characters"),
  body("email")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail(),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone is required")
    .matches(/^[0-9+\-\s()]{7,20}$/)
    .withMessage("Please enter a valid phone number"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .isIn(ROLE_VALUES)
    .withMessage("Please select a valid role"),
];

const validateLogin = [
  body("email")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required"),
];

const validateRoleUpdate = [
  body("role")
    .isIn(ROLE_VALUES)
    .withMessage("Please select a valid role"),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array();
    return res.status(400).json({
      message: formattedErrors[0]?.msg || "Validation failed",
      errors: formattedErrors,
    });
  }
  next();
};

module.exports = {
  validateSignup,
  validateLogin,
  validateRoleUpdate,
  handleValidationErrors,
};
