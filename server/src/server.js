const dns = require("dns");
const http = require("http");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = require("./config/env");
const app = require("./app");
const connectDB = require("./config/db");
const logger = require("./utils/logger");

connectDB().then(() => {
  const server = http.createServer(app);
  require("./realtime/socketServer").createSocketServer(server);
  server.listen(env.port, () => {
    logger.info(`Server running on http://localhost:${env.port}`);
  });
});