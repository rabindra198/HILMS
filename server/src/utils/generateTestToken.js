import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "replace_this_jwt_key_in_production";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";

function generateToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
  });
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

const userId = process.argv[2] || "507f1f77bcf86cd799439011";

console.log("=== JWT Token Generator ===");
console.log(`User ID: ${userId}`);
console.log(`Secret: ${JWT_SECRET}`);
console.log(`Expiry: ${JWT_EXPIRE}`);
console.log("");

const token = generateToken(userId);
console.log("Generated Token:");
console.log(token);
console.log("");

const verification = verifyToken(token);
console.log("Verification:", verification);
