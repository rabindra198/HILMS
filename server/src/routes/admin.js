import express from "express";
import { verifyToken, isAdmin } from "../middleware/auth.js";
import { getAllUsers, updateUserRole, deleteUser, getAdminDashboard } from "../controllers/adminController.js";

const router = express.Router();

router.use(verifyToken);
router.use(isAdmin);

router.get("/", (req, res) => {
  res.status(200).json({ message: "Admin API is running" });
});

router.get("/dashboard", getAdminDashboard);
router.get("/users", getAllUsers);
router.put("/users/:id/role", updateUserRole);
router.delete("/users/:id", deleteUser);

export default router;
