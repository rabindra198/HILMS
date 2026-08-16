const laboratoryService = require("../services/laboratory.service");
const response = require("../utils/response");

const getLaboratoryDashboard = async (req, res, next) => {
  try {
    const stats = await laboratoryService.getDashboardStats();
    response.success(res, stats);
  } catch (error) { next(error); }
};

const getPendingRequests = async (req, res, next) => {
  try {
    const requests = await laboratoryService.getPendingRequests();
    response.success(res, requests);
  } catch (error) { next(error); }
};

const updateLabRequestStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, sampleStatus } = req.body;
    const updated = await laboratoryService.updateLabRequestStatus(id, { status, sampleStatus });
    response.success(res, updated);
  } catch (error) { next(error); }
};

const getLabTests = async (req, res, next) => {
  try {
    const tests = await laboratoryService.getLabTests();
    response.success(res, tests);
  } catch (error) { next(error); }
};

const getLabReports = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const reports = await laboratoryService.getLabReports(filter);
    response.success(res, reports);
  } catch (error) { next(error); }
};

const createLabReport = async (req, res, next) => {
  try {
    const report = await laboratoryService.createLabReport(req.body, req.user._id);
    response.success(res, report, 201);
  } catch (error) { next(error); }
};

module.exports = {
  getLaboratoryDashboard,
  getPendingRequests,
  updateLabRequestStatus,
  getLabTests,
  getLabReports,
  createLabReport,
};