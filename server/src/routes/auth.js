import express from "express";
import {
  signup,
  login,
  logout,
  getMe,
} from "../controllers/authController.js";
import { verifyToken } from "../middleware/auth.js";
import {
  validateSignup,
  validateLogin,
  handleValidationErrors,
} from "../validators/authValidator.js";

const router = express.Router();

router.post("/signup", validateSignup, handleValidationErrors, signup);
router.post("/login", validateLogin, handleValidationErrors, login);
router.post("/logout", logout);
router.get("/me", verifyToken, getMe);

export default router;
