const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { io: createClient } = require("socket.io-client");
const User = require("../models/User");
const env = require("../config/env");
const app = require("../app");
const EVENTS = require("../realtime/events");
const {
  createSocketServer,
  emitToUser,
  disconnectUser,
} = require("../realtime/socketServer");

const DOCTOR_ID = "64b000000000000000000001";
const REVOKED_ID = "64b000000000000000000002";
const INACTIVE_ID = "64b000000000000000000003";
const TEMP_PASSWORD_ID = "64b000000000000000000004";
const users = new Map([
  [DOCTOR_ID, { _id: DOCTOR_ID, role: "doctor", status: "APPROVED", isActive: true, tokenVersion: 4 }],
  [REVOKED_ID, { _id: REVOKED_ID, role: "doctor", status: "APPROVED", isActive: true, tokenVersion: 5 }],
  [INACTIVE_ID, { _id: INACTIVE_ID, role: "doctor", status: "APPROVED", isActive: false, tokenVersion: 4 }],
  [TEMP_PASSWORD_ID, { _id: TEMP_PASSWORD_ID, role: "doctor", status: "APPROVED", isActive: true, tokenVersion: 4, mustChangePassword: true }],
]);

const originalFindById = User.findById;
User.findById = (userId) => ({
  select() {
    return this;
  },
  lean: async () => users.get(String(userId)) || null,
});

const signedCookie = (userId, tokenVersion) =>
  `token=${jwt.sign({ id: userId, tv: tokenVersion }, env.jwtSecret, { expiresIn: "2m" })}`;

const connect = (url, cookie) =>
  new Promise((resolve, reject) => {
    const client = createClient(url, {
      autoConnect: false,
      reconnection: false,
      transports: ["websocket"],
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
    });
    client.once("connect", () => resolve(client));
    client.once("connect_error", (error) => resolve({ client, error }));
    client.connect();
    setTimeout(() => reject(new Error("Socket connection timed out")), 5000).unref();
  });

const run = async () => {
  const server = http.createServer(app);
  const socketServer = createSocketServer(server);

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}`;

    const client = await connect(url, signedCookie(DOCTOR_ID, 4));
    assert.equal(client.error, undefined, "an approved user with a current token should connect");
    const serverSocket = socketServer.sockets.sockets.get(client.id);
    assert.ok(serverSocket.rooms.has(`user:${DOCTOR_ID}`));
    assert.ok(serverSocket.rooms.has("role:doctor"));

    const eventReceived = new Promise((resolve) => client.once(EVENTS.LAB_REPORT_VERIFIED, resolve));
    emitToUser(DOCTOR_ID, EVENTS.LAB_REPORT_VERIFIED, { reportId: "report-1" });
    assert.deepEqual(await eventReceived, { reportId: "report-1" });

    client.emit("room:join", "role:admin");
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(serverSocket.rooms.has("role:admin"), false, "clients cannot assign themselves to rooms");

    const unauthenticated = await connect(url, null);
    assert.ok(unauthenticated.error, "a missing cookie must be refused");
    unauthenticated.client.close();

    const revoked = await connect(url, signedCookie(REVOKED_ID, 4));
    assert.ok(revoked.error, "a stale token version must be refused");
    revoked.client.close();

    const inactive = await connect(url, signedCookie(INACTIVE_ID, 4));
    assert.ok(inactive.error, "an inactive account must be refused");
    inactive.client.close();

    const temporaryPassword = await connect(url, signedCookie(TEMP_PASSWORD_ID, 4));
    assert.ok(temporaryPassword.error, "a temporary-password account must be refused");
    temporaryPassword.client.close();

    const disconnected = new Promise((resolve) => client.once("disconnect", resolve));
    disconnectUser(DOCTOR_ID);
    await disconnected;
    client.close();
  } finally {
    User.findById = originalFindById;
    await new Promise((resolve) => socketServer.close(resolve));
  }
};

run()
  .then(() => {
    console.log("Socket.IO authentication, room scoping, events, and revocation checks passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
