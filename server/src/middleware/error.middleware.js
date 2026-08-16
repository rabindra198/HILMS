const logger = require("../utils/logger");
const response = require("../utils/response");

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);
  const statusCode = err.statusCode && err.statusCode !== 200 ? err.statusCode : 500;
  response.error(res, err.message || "Internal Server Error", statusCode);
};

module.exports = { errorHandler };
