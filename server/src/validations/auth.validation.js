const response = require("../utils/response");

const validateRegister = (req, res, next) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return response.error(res, "name, email, password, and role are required", 400);
  }
  if (password.length < 6) {
    return response.error(res, "password must be at least 6 characters", 400);
  }
  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return response.error(res, "email and password are required", 400);
  }
  next();
};

module.exports = { validateRegister, validateLogin };