const authService = require("../services/auth.service");
const response = require("../utils/response");

const register = async (req, res, next) => {
  try {
    const user = await authService.registerUser(req.body);
    response.success(res, user, 201, "User registered successfully");
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body);
    response.success(res, result, 200, "Login successful");
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login };