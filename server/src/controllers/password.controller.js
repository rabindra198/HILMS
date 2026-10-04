const passwordService = require("../services/password.service");
const response = require("../utils/response");

const run = (handler, successMessage = "Success", statusCode = 200) => async (req, res, next) => {
  try {
    const data = await handler(req);
    return response.success(res, data, statusCode, successMessage);
  } catch (error) {
    return next(error);
  }
};

const controller = {
  forgotPassword: run(
    async (req) => {
      // Always responds identically so the endpoint cannot enumerate accounts.
      const result = await passwordService.requestPasswordReset(req.body.email);
      return { delivered: result.delivered };
    },
    "If an account exists for that email, a password reset has been issued."
  ),
  resetPassword: run(
    (req) => passwordService.resetPassword(req.body),
    "Password reset successfully. You can now sign in with your new password."
  ),
  changePassword: run(
    (req) => passwordService.changePassword(req.user._id, req.body),
    "Password changed successfully"
  ),
};

module.exports = controller;
