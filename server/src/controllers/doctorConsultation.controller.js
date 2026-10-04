const consultationService = require("../services/consultation.service");
const response = require("../utils/response");

/** Consultation lifecycle (FR-DR-02, FR-DR-08). */

const list = async (req, res, next) => {
  try {
    const { items, pagination } = await consultationService.list(req.user._id, req.query);
    return response.success(res, items, 200, "Consultations loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

const getOne = async (req, res, next) => {
  try {
    const consultation = await consultationService.getOne(req.user._id, req.params.id);
    return response.success(res, consultation, 200, "Consultation loaded");
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const consultation = await consultationService.create(req.body, req.user._id, req.user);
    return response.success(res, consultation, 201, "Consultation started");
  } catch (error) {
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const consultation = await consultationService.update(
      req.user._id,
      req.params.id,
      req.body,
      req.user
    );
    return response.success(res, consultation, 200, "Consultation updated");
  } catch (error) {
    return next(error);
  }
};

/** Closes the consultation and, where linked, the appointment it came from. */
const complete = async (req, res, next) => {
  try {
    const consultation = await consultationService.complete(
      req.user._id,
      req.params.id,
      req.body,
      req.user
    );
    return response.success(res, consultation, 200, "Consultation completed");
  } catch (error) {
    return next(error);
  }
};

module.exports = { list, getOne, create, update, complete };
