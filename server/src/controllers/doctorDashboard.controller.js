const doctorDashboardService = require("../services/doctorDashboard.service");
const response = require("../utils/response");

/**
 * Doctor dashboard (FR-DR-01).
 *
 * One endpoint for the whole screen. The doctor's own calendar, their assigned
 * patients, pending laboratory reports, in-flight requests and follow-ups are a
 * single coherent moment in time; fetching them separately would let the tiles
 * and the lists disagree while the page is loading.
 */
const getDashboard = async (req, res, next) => {
  try {
    const dashboard = await doctorDashboardService.build(req.user._id);
    return response.success(res, dashboard, 200, "Dashboard loaded");
  } catch (error) {
    return next(error);
  }
};

module.exports = { getDashboard };
