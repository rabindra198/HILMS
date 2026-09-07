const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = require("./config/env");
const app = require("./app");
const connectDB = require("./config/db");
const logger = require("./utils/logger");

connectDB().then(() => {
  app.listen(env.port, () => {
    logger.info(`Server running on http://localhost:${env.port}`);
  });
});