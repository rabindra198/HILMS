const doctorLabOrderService = require("../services/doctorLabOrder.service");
const response = require("../utils/response");

const getWorkspace = async (req, res, next) => {
  try {
    return response.success(res, await doctorLabOrderService.getWorkspace(req.user._id));
  } catch (error) {
    return next(error);
  }
};

const createRequest = async (req, res, next) => {
  try {
    const request = await doctorLabOrderService.createRequest(req.body, req.user._id);
    return response.success(res, request, 201, "Laboratory request created");
  } catch (error) {
    return next(error);
  }
};

module.exports = { getWorkspace, createRequest };