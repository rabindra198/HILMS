const app = require("./app");
const connectDB = require("./config/db");

let connectionPromise;

const ensureDatabaseConnection = () => {
  if (!connectionPromise) {
    connectionPromise = connectDB().catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
};

module.exports = async (req, res) => {
  await ensureDatabaseConnection();

  if (req.url === "/api" || req.url.startsWith("/api/")) {
    req.url = req.url.slice("/api".length) || "/";
  }

  return app(req, res);
};
