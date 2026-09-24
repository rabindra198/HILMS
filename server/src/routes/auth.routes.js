const express = require("express");
const router = express.Router();
const { register, login } = require("../controllers/auth.controller");
const { me } = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");
const {
  validateRegister,
  validateLogin,
} = require("../validations/auth.validation");

router.post("/register", validateRegister, register);
router.post("/signup", validateRegister, register);
router.post("/login", validateLogin, login);
router.get("/me", protect, me);

module.exports = router;
