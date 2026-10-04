/**
 * FR-AUTH-08 / FR-AUTH-09 / FR-AUTH-11 verification:
 *   - "Remember me" issues a long-lived token and cookie.
 *   - Each sign-in is recorded and listed as a device / session.
 *   - Logout revokes every token the account holds, immediately.
 *   - "Sign out everywhere" does the same from an authenticated endpoint.
 *
 * The account lifetime is fixed at boot so the assertions are exact rather than
 * time-dependent. Values are set before the app (and `config/env`) is required.
 */
process.env.REMEMBER_ME_DAYS = "30";
process.env.LOGIN_HISTORY_TTL_DAYS = "90";

require("dotenv").config();

const mongoose = require("mongoose");

const app = require("../app");
const env = require("../config/env");
const User = require("../models/User");
const LoginHistory = require("../models/LoginHistory");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
let server;

const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
};

const section = (title) => console.log(`\n${title}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const call = async (method, path, { body, token, headers = {} } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, setCookie: res.headers.get("set-cookie") || "" };
};

const login = (email, password, extra = {}) =>
  call("POST", "/auth/login", { body: { email, password, ...extra } });

// Reads exp/iat/tv/jti out of a JWT without verifying it.
const decode = (token) => {
  const [, payload] = String(token).split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
};

const cookieMaxAge = (setCookie) => {
  const match = /max-age=(\d+)/i.exec(setCookie);
  return match ? Number(match[1]) : null;
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  server = app.listen(PORT);

  const tag = Math.random().toString(36).slice(2, 10);
  const email = `e2e_session_${tag}@e2e.io`;
  const password = "Session!Pass1";

  const user = await User.create({
    name: "Session Fixture",
    email,
    password,
    role: "patient",
    status: "APPROVED",
  });

  try {
    section("1. Remember me extends the session (FR-AUTH-08)");
    const normal = await login(email, password);
    check("normal sign-in succeeds", normal.status === 200, `got ${normal.status}`);
    check("a token is returned", Boolean(normal.data?.token));

    const remembered = await login(email, password, { remember: true });
    check("remembered sign-in succeeds", remembered.status === 200, `got ${remembered.status}`);

    const normalClaims = decode(normal.data.token);
    const rememberClaims = decode(remembered.data.token);
    const normalLifetime = normalClaims.exp - normalClaims.iat;
    const rememberLifetime = rememberClaims.exp - rememberClaims.iat;

    const unitSeconds = { s: 1, m: 60, h: 3600, d: 86400 };
    const parseExpiry = (value) => {
      const match = /^(\d+)\s*([smhd])$/i.exec(String(value).trim());
      return match ? Number(match[1]) * unitSeconds[match[2].toLowerCase()] : Number(value);
    };
    const expectedNormal = parseExpiry(env.jwtExpiresIn);
    const expectedRemember = env.security.rememberMeDays * 86400;

    check(`normal session follows the configured lifetime (${env.jwtExpiresIn})`, normalLifetime === expectedNormal, `got ${normalLifetime}`);
    check("remembered session lasts the configured 30 days", rememberLifetime === expectedRemember, `got ${rememberLifetime}`);
    check("remembered session outlives the normal one", rememberLifetime > normalLifetime);
    check(
      "the cookie lifetime is aligned with the token",
      cookieMaxAge(remembered.setCookie) === expectedRemember,
      `got ${cookieMaxAge(remembered.setCookie)}`
    );
    check("the cookie is httpOnly", /httponly/i.test(remembered.setCookie), remembered.setCookie);

    section("2. Tokens are versioned for revocation (FR-AUTH-11)");
    check("the token carries the account's tokenVersion", normalClaims.tv === (user.tokenVersion || 0), `got ${normalClaims.tv}`);
    check("the token carries a session id", Boolean(normalClaims.jti), normalClaims.jti);
    check("the two sign-ins have different session ids", normalClaims.jti !== rememberClaims.jti);

    section("3. A token from the response authenticates requests");
    const me = await call("GET", "/auth/me", { token: normal.data.token });
    const meUser = me.data?.user || me.data;
    check("/auth/me accepts the token (200)", me.status === 200, `got ${me.status}`);
    check("the returned user is the fixture", meUser?.email === email, meUser?.email);

    section("4. Sign-ins are listed as devices / sessions (FR-AUTH-09)");
    await sleep(200);
    const sessions = await call("GET", "/auth/sessions", { token: normal.data.token });
    check("session listing succeeds", sessions.status === 200, `got ${sessions.status}`);
    const list = sessions.data?.sessions || [];
    check("both sign-ins are listed", list.length >= 2, `got ${list.length}`);
    check("exactly one entry is marked current", list.filter((s) => s.current).length === 1, JSON.stringify(list.map((s) => s.current)));
    check("the remembered sign-in is flagged", list.some((s) => s.remember === true));
    check("entries expose a timestamp", Boolean(list[0]?.signedInAt));

    // The current entry should be the normal (non-remembered) sign-in that made
    // this request.
    const currentEntry = list.find((s) => s.current);
    check("the current entry is the non-remembered sign-in", currentEntry?.remember === false);

    section("5. Rows are persisted in the login history");
    const historyCount = await LoginHistory.countDocuments({ user: user._id });
    check("login history rows exist", historyCount >= 2, `got ${historyCount}`);
    check(
      "history rows carry a TTL expiry",
      Boolean(await LoginHistory.findOne({ user: user._id, expiresAt: { $gt: new Date() } }).lean())
    );

    section("6. Logout revokes every token immediately (FR-AUTH-11)");
    const logout = await call("POST", "/auth/logout", { token: normal.data.token });
    check("logout succeeds", logout.status === 200, `got ${logout.status}`);

    const afterLogout = await call("GET", "/auth/me", { token: normal.data.token });
    check("the logged-out token is rejected (401)", afterLogout.status === 401, `got ${afterLogout.status}`);
    check("the rejection is machine-readable", afterLogout.data?.code === "SESSION_REVOKED", afterLogout.data?.code);

    const otherAfterLogout = await call("GET", "/auth/me", { token: remembered.data.token });
    check(
      "the account's other live token is revoked too",
      otherAfterLogout.status === 401,
      `got ${otherAfterLogout.status}`
    );

    section("7. A fresh sign-in works after logout");
    const fresh = await login(email, password);
    check("a new sign-in succeeds", fresh.status === 200, `got ${fresh.status}`);
    const freshMe = await call("GET", "/auth/me", { token: fresh.data.token });
    check("the new token is accepted", freshMe.status === 200, `got ${freshMe.status}`);
    check(
      "the new token has a higher version",
      decode(fresh.data.token).tv > normalClaims.tv,
      `${decode(fresh.data.token).tv} vs ${normalClaims.tv}`
    );

    section("8. Sign out everywhere (DELETE /auth/sessions)");
    const secondDevice = await login(email, password, { remember: true });
    const revoke = await call("DELETE", "/auth/sessions", { token: fresh.data.token });
    check("revoke-all succeeds", revoke.status === 200, `got ${revoke.status}`);
    check("an audit entry is recorded", Boolean(await AuditLog.findOne({ action: "SESSIONS_REVOKED_ALL", targetEmail: email }).lean()));

    const freshAfterRevoke = await call("GET", "/auth/me", { token: fresh.data.token });
    const secondAfterRevoke = await call("GET", "/auth/me", { token: secondDevice.data.token });
    check("the requesting token is revoked", freshAfterRevoke.status === 401, `got ${freshAfterRevoke.status}`);
    check("the other device is revoked too", secondAfterRevoke.status === 401, `got ${secondAfterRevoke.status}`);

    section("9. Session endpoints are protected");
    const anonymousList = await call("GET", "/auth/sessions");
    check("anonymous listing is refused (401)", anonymousList.status === 401, `got ${anonymousList.status}`);
    const badToken = await call("GET", "/auth/sessions", { token: "not.a.token" });
    check("a malformed token is refused (401)", badToken.status === 401, `got ${badToken.status}`);
  } finally {
    const users = await User.find({ email }).select("_id");
    const ids = users.map((u) => u._id);
    await Promise.all([
      User.deleteMany({ email }),
      LoginHistory.deleteMany({ user: { $in: ids } }),
      AuditLog.deleteMany({ targetEmail: email }),
      Notification.deleteMany({ recipient: { $in: ids } }),
    ]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  console.log(`\n${"=".repeat(52)}\n  ${passed} passed, ${failed} failed\n${"=".repeat(52)}`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch(async (error) => {
  console.error("\nAuth session E2E crashed:", error);
  if (server) await new Promise((resolve) => server.close(resolve)).catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
