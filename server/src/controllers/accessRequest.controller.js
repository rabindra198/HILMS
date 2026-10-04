const accessRequestService = require("../services/accessRequest.service");
const response = require("../utils/response");

const run = (handler, successMessage = "Success", statusCode = 200) => async (req, res, next) => {
  try {
    const data = await handler(req);
    return response.success(res, data, statusCode, successMessage);
  } catch (error) {
    return next(error);
  }
};

const adminUser = (req) => req.user;

const controller = {
  // Public - Patient self-registration creates an active account immediately.
  registerPatient: run(
    (req) => accessRequestService.registerPatient(req.body),
    "Patient account created successfully. You can now sign in."
  , 201),

  // Public - Doctor / Laboratory submission creates a PENDING request only.
  submit: run(
    (req) => accessRequestService.submitAccessRequest(req.body),
    "Your registration request has been submitted successfully. Please wait for Admin approval.",
    201
  ),

  // Admin review surface
  list: run((req) => accessRequestService.getAccessRequests(req.query)),
  detail: run((req) => accessRequestService.getAccessRequest(req.params.id)),
  summary: run(() => accessRequestService.getSummary(), "Access request summary"),
  approve: run(
    (req) => accessRequestService.approveAccessRequest(req.params.id, adminUser(req), req.body),
    "Access request approved. A temporary password has been emailed to the user; they must change it at first sign-in."
  ),
  reject: run(
    (req) => accessRequestService.rejectAccessRequest(req.params.id, adminUser(req), req.body),
    "Access request declined."
  ),
};

module.exports = controller;
