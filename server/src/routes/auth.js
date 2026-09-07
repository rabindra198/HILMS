const express = require("express");
const {
  signup,
  login,
  logout,
  getMe,
} = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");
const {
  validateSignup,
  validateLogin,
  handleValidationErrors,
} = require("../validators/authValidator");

const router = express.Router();

router.post("/signup", validateSignup, handleValidationErrors, signup);
router.post("/register", validateSignup, handleValidationErrors, signup);
router.post("/login", validateLogin, handleValidationErrors, login);
router.post("/logout", logout);
router.get("/me", verifyToken, getMe);

module.exports = router;
