const success = (res, data, statusCode = 200, message = "Success") => {
  return res.status(statusCode).json({ success: true, message, data });
};

const error = (res, message = "Something went wrong", statusCode = 500) => {
  return res.status(statusCode).json({ success: false, message });
};

module.exports = { success, error };