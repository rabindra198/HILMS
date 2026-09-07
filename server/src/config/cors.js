const env = require("./env");

const corsOptions = {
  origin: env.clientUrl,
  credentials: true,
};

module.exports = corsOptions;