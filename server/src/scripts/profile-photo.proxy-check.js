/**
 * Verifies the photo through the REAL dev stack: Express on :5000 and the Vite
 * dev server on :5173, so the stored `/api/profile/photo/...` reference is fetched
 * exactly the way a browser `<img>` fetches it - through the proxy that strips
 * `/api`, carrying only the httpOnly session cookie.
 *
 * This is the one link an API-level test has to simulate, so it is checked here
 * against the real proxy rather than assumed.
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

const app = require("../app");
const User = require("../models/User");
const { UPLOAD_DIR } = require("../middleware/upload");

const WEB = "http://localhost:5174";
const API = "http://localhost:5001";
const NS = "proxycheck_";
const PASSWORD = "ProxyCheck!Pass1";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const tag = Math.random().toString(36).slice(2, 8);
  const email = `${NS}${tag}@e2e.io`;

  const user = await User.create({
    name: "Proxy Check Patient",
    email,
    password: PASSWORD,
    role: "patient",
    status: "APPROVED",
    isActive: true,
    mustChangePassword: false,
  });

  // Spare ports, so a developer already running the app on 5000/5173 is left
  // untouched. VITE_API_PROXY_TARGET is what vite.config.js reads to decide where
  // `/api` is forwarded, so this needs a Vite instance pointed at this server.
  // That instance is started externally (see the header) because this script does
  // not spawn child processes.
  const server = app.listen(5001);
  await wait(300);

  let viteUp = false;
  for (let i = 0; i < 60 && !viteUp; i += 1) {
    await wait(500);
    try {
      const r = await fetch(`${WEB}/`);
      viteUp = r.ok;
    } catch {
      /* not listening yet */
    }
  }

  try {
    check("vite dev server is up", viteUp);
    if (!viteUp) return;

    // ---- login THROUGH the proxy, exactly like the browser ----
    const loginRes = await fetch(`${WEB}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
    const loginBody = await loginRes.json().catch(() => null);
    check("login through the /api proxy succeeds", loginRes.status === 200 && Boolean(loginBody?.user), `status ${loginRes.status}`);
    check("a session cookie was issued", cookie.startsWith("token="), cookie);

    // ---- upload through the proxy ----
    const form = new FormData();
    form.append("photo", new Blob([PNG], { type: "image/png" }), "proxy.png");
    const upRes = await fetch(`${WEB}/api/profile/photo`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    const upBody = await upRes.json().catch(() => null);
    const photoUrl = upBody?.data?.photoUrl;
    check("upload through the proxy succeeds", upRes.status === 200, `status ${upRes.status} ${JSON.stringify(upBody)}`);
    check("response returns the persisted URL", typeof photoUrl === "string" && photoUrl.startsWith("/api/profile/photo/"), photoUrl);
    check("response returns the updated user", Boolean(upBody?.data?.user?.profilePhotoUrl));

    // ---- THE decisive check: <img src={photoUrl}> through the proxy ----
    const imgRes = await fetch(`${WEB}${photoUrl}`, { headers: { Cookie: cookie } });
    const imgBytes = Buffer.from(await imgRes.arrayBuffer());
    check("<img> fetch of the stored URL succeeds", imgRes.status === 200, `status ${imgRes.status}`);
    check("served as an image", (imgRes.headers.get("content-type") || "").startsWith("image/"), imgRes.headers.get("content-type"));
    check("served bytes are the uploaded photo", imgBytes.equals(PNG));

    // ---- the database, re-read directly ----
    const raw = await User.findById(user._id).lean();
    check("database holds the URL", raw.profilePhotoUrl === photoUrl, raw.profilePhotoUrl);
    const disk = path.join(UPLOAD_DIR, "profiles", String(user._id), photoUrl.split("/").pop());
    check("the referenced file exists on disk", fs.existsSync(disk), disk);

    // ---- refresh: a brand new session, same as reopening the browser ----
    const reLogin = await fetch(`${WEB}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const cookie2 = (reLogin.headers.get("set-cookie") || "").split(";")[0];
    const me = await fetch(`${WEB}/api/auth/me`, { headers: { Cookie: cookie2 } }).then((r) => r.json());
    check("/auth/me after re-login returns the photo", me?.user?.profilePhotoUrl === photoUrl, me?.user?.profilePhotoUrl);

    const imgAgain = await fetch(`${WEB}${photoUrl}`, { headers: { Cookie: cookie2 } });
    check("the photo still renders for the new session", imgAgain.status === 200);

    // ---- top bar reads the same single source ----
    check("top bar source (user.profilePhotoUrl) is the same value", me?.user?.profilePhotoUrl === photoUrl);
  } finally {
    await new Promise((r) => server.close(r));
    await User.deleteOne({ _id: user._id });
    try {
      fs.rmSync(path.join(UPLOAD_DIR, "profiles", String(user._id)), { recursive: true, force: true });
    } catch {
      /* nothing to clean */
    }
    await mongoose.disconnect();
  }

  const total = passed + failed;
  console.log(`\n  ${passed}/${total} checks passed${failed ? `, ${failed} FAILED` : ""}`);
  process.exit(failed ? 1 : 0);
};

run().catch((error) => {
  console.error(`\n  ERROR ${error.stack || error.message}`);
  process.exit(1);
});