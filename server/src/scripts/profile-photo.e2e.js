/**
 * End-to-end verification of PROFILE PHOTO PERSISTENCE, for every role that owns
 * a profile: Patient, Doctor, Laboratory and Admin.
 *
 * The bug this suite exists to prevent is a photo that renders in the browser and
 * then disappears on refresh. That symptom has exactly one real cause - the image
 * was never recorded in the database - so every assertion below is checked against
 * the DATABASE and against the FILE ON DISK, not just against the API response.
 * A passing HTTP status is deliberately never treated as sufficient on its own.
 *
 * For each role the script proves the full chain:
 *   upload -> file stored -> reference persisted -> response returns the user
 *          -> the image is served back over HTTP
 *          -> a brand new session (logout/login) still reports it
 *   then: replacing a photo swaps the reference AND removes the old file
 *         editing personal details leaves the photo untouched
 *         removing the photo clears the reference AND deletes the file
 *
 * It also asserts the validation and authorisation rules: image-only types, magic
 * bytes, the size ceiling, authentication required, and that a userId posted in
 * the body cannot redirect the upload onto somebody else's account.
 *
 * Fixtures use the `PROFILEE2E_` namespace and are removed on entry and exit.
 * Pass `--db=<name>` to run against a scratch database.
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

const app = require("../app");
const User = require("../models/User");
const { UPLOAD_DIR, MAX_PROFILE_PHOTO_BYTES } = require("../middleware/upload");

const PORT = 5104;
const BASE = `http://127.0.0.1:${PORT}`;
const NS = /^profilee2e_/i;
const PASSWORD = "ProfileE2e!Pass1";

// A genuine 1x1 PNG, so the stored file is a real image and not just bytes that
// happen to begin with the right four magic bytes.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// Same image, different bytes, so a replacement is detectable on disk.
const PNG_1PX_ALT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

let passed = 0;
let failed = 0;
let server;

const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const section = (title) => console.log(`\n${title}`);
const uniq = () => Math.random().toString(36).slice(2, 10);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Browser-faithful session: logs in and keeps the httpOnly cookie, exactly as the
 * React client does. Proving the photo over the cookie transport also proves the
 * `<img>` tag in the top bar can fetch it.
 *
 * `/auth/login` and `/auth/me` return `authResource(...)` directly rather than the
 * `{ success, message, data }` envelope the other endpoints use, so the user is
 * read off `body.user`.
 */
const login = async (email) => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
  const body = await res.json().catch(() => null);
  return { cookie, body, status: res.status };
};

const api = async (cookie, method, path_, body) => {
  const res = await fetch(`${BASE}${path_}`, {
    method,
    headers: {
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

/** `GET /auth/me` - the read every page load performs. */
const readMe = async (cookie) => {
  const { status, data } = await api(cookie, "GET", "/auth/me");
  return { status, user: data?.user ?? null };
};

/**
 * The stored reference is what the BROWSER requests, and in development that
 * request goes through the Vite dev proxy, which strips the leading `/api` before
 * forwarding. Express is mounted at the root, so this test does the same strip to
 * reproduce the browser's request exactly.
 */
const toExpressPath = (url) => url.replace(/^\/api/, "");

const fetchPhoto = async (cookie, url) => {
  const res = await fetch(`${BASE}${toExpressPath(url)}`, { headers: { Cookie: cookie } });
  return {
    status: res.status,
    contentType: res.headers.get("content-type") || "",
    cacheControl: res.headers.get("cache-control") || "",
    bytes: Buffer.from(await res.arrayBuffer()),
  };
};

const upload = async (cookie, { bytes = PNG_1PX, name = "photo.png", type = "image/png", extra } = {}) => {
  const form = new FormData();
  form.append("photo", new Blob([bytes], { type }), name);
  if (extra) Object.entries(extra).forEach(([k, v]) => form.append(k, v));

  const res = await fetch(`${BASE}/profile/photo`, { method: "POST", headers: { Cookie: cookie }, body: form });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, body: data?.data ?? {} };
};

/** Where a stored reference actually points on disk, derived independently of the app. */
const onDisk = (photoUrl) => {
  if (!photoUrl) return null;
  const tail = photoUrl.slice(photoUrl.lastIndexOf("/profile/photo/") + "/profile/photo/".length);
  return path.join(UPLOAD_DIR, "profiles", tail);
};

const dbPhoto = async (userId) => (await User.findById(userId).lean()).profilePhotoUrl || null;

/** A brand new session, i.e. what happens after logout then login again. */
const freshSession = async (email) => {
  const { cookie, status } = await login(email);
  const me = await readMe(cookie);
  return { cookie, me: me.user, loginStatus: status === 200 };
};

const purge = async () => {
  const users = await User.find({ email: NS }).lean();
  const dirs = new Set(
    users.map((u) => path.join(UPLOAD_DIR, "profiles", String(u._id)))
  );
  await User.deleteMany({ email: NS });
  dirs.forEach((dir) => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* nothing to clean */
    }
  });
};

const run = async () => {
  const dbArg = process.argv.find((arg) => arg.startsWith("--db="));
  const DB_NAME = dbArg ? dbArg.split("=")[1] : undefined;

  await mongoose.connect(process.env.MONGO_URI, DB_NAME ? { dbName: DB_NAME } : {});
  const resolved = mongoose.connection.name;
  if (DB_NAME && resolved !== DB_NAME) {
    throw new Error(`--db=${DB_NAME} requested but connection resolved to "${resolved}". Aborting.`);
  }
  console.log(`database: ${resolved}${DB_NAME ? " (scratch)" : " (configured default)"}\n`);

  await purge();
  server = app.listen(PORT);
  await wait(200);

  const tag = uniq();
  const accounts = [
    { key: "patient", role: "patient", name: "ProfileE2E Patient" },
    { key: "doctor", role: "doctor", name: "ProfileE2E Doctor", nmcNumber: `PROFILEE2E-NMC-${tag}`.toUpperCase() },
    { key: "lab", role: "lab", name: "ProfileE2E Technologist", labRegistryNumber: `PROFILEE2E-REG-${tag}`.toUpperCase() },
    { key: "admin", role: "admin", name: "ProfileE2E Administrator" },
  ];

  const created = await User.create(
    accounts.map((a) => ({
      name: a.name,
      email: `PROFILEE2E_${a.key}_${tag}@e2e.io`,
      phone: "9800000000",
      password: PASSWORD,
      role: a.role,
      status: "APPROVED",
      isActive: true,
      mustChangePassword: false,
      ...(a.nmcNumber ? { nmcNumber: a.nmcNumber } : {}),
      ...(a.labRegistryNumber ? { labRegistryNumber: a.labRegistryNumber } : {}),
    }))
  );

  const byRole = Object.fromEntries(accounts.map((a, i) => [a.key, created[i]]));

  /* ------------------------------------------------------------------ */
  section("1. Upload persists the photo for EVERY role (file + database + response)");

  for (const a of accounts) {
    const user = byRole[a.key];
    const { cookie } = await login(user.email);
    const up = await upload(cookie);

    check(`${a.key}: upload returns 200`, up.status === 200, `got ${up.status} ${JSON.stringify(up.data)}`);
    check(`${a.key}: response returns the persisted photo URL`, typeof up.body.photoUrl === "string" && up.body.photoUrl.length > 0);
    check(`${a.key}: response returns the updated user`, Boolean(up.body.user && up.body.user.id));
    check(
      `${a.key}: response user carries the same photo URL`,
      up.body.user?.profilePhotoUrl === up.body.photoUrl,
      `user=${up.body.user?.profilePhotoUrl} photoUrl=${up.body.photoUrl}`
    );

    const stored = await dbPhoto(user._id);
    check(`${a.key}: DATABASE records the photo URL`, Boolean(stored), "profilePhotoUrl is still empty");
    check(`${a.key}: database value matches the response`, stored === up.body.photoUrl);

    const file = onDisk(stored);
    check(`${a.key}: FILE exists on disk`, Boolean(file) && fs.existsSync(file), file || "no path");
    check(`${a.key}: stored file is a real PNG`, Boolean(file) && fs.existsSync(file) && fs.readFileSync(file).equals(PNG_1PX));

    check(
      `${a.key}: photo is filed under the OWNER's folder`,
      Boolean(file) && path.basename(path.dirname(file)) === String(user._id),
      file
    );
  }

  /* ------------------------------------------------------------------ */
  section("2. The photo is SERVED back over HTTP (what <img> does in the browser)");

  for (const a of accounts) {
    const user = byRole[a.key];
    const { cookie } = await login(user.email);
    const url = await dbPhoto(user._id);
    const res = await fetchPhoto(cookie, url);

    check(`${a.key}: GET the stored URL returns 200`, res.status === 200, `got ${res.status}`);
    check(`${a.key}: served with an image content type`, res.contentType.startsWith("image/"), res.contentType);
    check(`${a.key}: served bytes match what was uploaded`, res.bytes.equals(PNG_1PX));
    check(`${a.key}: served with a long-lived cache policy`, res.cacheControl.includes("immutable"), res.cacheControl);
  }

  /* ------------------------------------------------------------------ */
  section("3. REFRESH: a new read of /auth/me still reports the photo");

  for (const a of accounts) {
    const user = byRole[a.key];
    const stored = await dbPhoto(user._id);
    // A brand new cookie, exactly as a page reload produces.
    const { cookie } = await login(user.email);
    const me = await readMe(cookie);
    check(
      `${a.key}: /auth/me still returns the photo after reload`,
      me.user?.profilePhotoUrl === stored,
      `me=${me.user?.profilePhotoUrl} db=${stored}`
    );
  }

  /* ------------------------------------------------------------------ */
  section("4. LOGOUT / LOGIN: the photo survives a completely new session");

  for (const a of accounts) {
    const user = byRole[a.key];
    const stored = await dbPhoto(user._id);

    const first = await login(user.email);
    const out = await fetch(`${BASE}/auth/logout`, { method: "POST", headers: { Cookie: first.cookie } });
    check(`${a.key}: logout succeeds`, out.status === 200, `got ${out.status}`);

    const { cookie: cookie2, status: loginStatus } = await login(user.email);
    check(`${a.key}: login again succeeds`, loginStatus === 200, `got ${loginStatus}`);

    const me = await readMe(cookie2);
    check(`${a.key}: photo still reported after logout + login`, me.user?.profilePhotoUrl === stored);

    // The role's own profile endpoint must agree, so no screen depends on one route.
    const own = {
      patient: "/patient/profile",
      doctor: "/doctor/profile",
      lab: "/lab/profile",
      admin: "/admin/profile",
    }[a.key];
    const ownRes = await api(cookie2, "GET", own);
    const ownPhoto = ownRes.data?.data?.profilePhotoUrl;
    check(`${a.key}: own profile endpoint (${own}) also returns the photo`, ownPhoto === stored, `got ${ownPhoto}`);
  }

  /* ------------------------------------------------------------------ */
  section("5. REPLACING a photo swaps the reference and deletes the OLD file");

  for (const a of accounts) {
    const user = byRole[a.key];
    const before = await dbPhoto(user._id);
    const beforeFile = onDisk(before);

    const { cookie } = await login(user.email);
    const up = await upload(cookie, { bytes: PNG_1PX_ALT, name: "new.png" });
    check(`${a.key}: replacement upload returns 200`, up.status === 200, `got ${up.status}`);

    const after = await dbPhoto(user._id);
    const afterFile = onDisk(after);

    check(`${a.key}: reference changed`, after && after !== before, `${before} -> ${after}`);
    check(`${a.key}: new file stored with the new bytes`, Boolean(afterFile) && fs.existsSync(afterFile) && fs.readFileSync(afterFile).equals(PNG_1PX_ALT));
    check(`${a.key}: OLD file was deleted after the new one was safe`, Boolean(beforeFile) && !fs.existsSync(beforeFile));

    const served = await fetchPhoto(cookie, after);
    check(`${a.key}: the replaced photo serves the NEW bytes`, served.status === 200 && served.bytes.equals(PNG_1PX_ALT));
  }

  /* ------------------------------------------------------------------ */
  section("6. Editing personal details must NOT disturb the photo");

  const edits = {
    patient: ["/patient/profile", { name: "ProfileE2E Patient Renamed" }],
    doctor: ["/doctor/profile", { name: "ProfileE2E Doctor Renamed", department: "Cardiology" }],
    lab: ["/lab/profile", { name: "ProfileE2E Technologist Renamed" }],
    admin: ["/admin/profile", { name: "ProfileE2E Administrator Renamed" }],
  };

  for (const a of accounts) {
    const user = byRole[a.key];
    const before = await dbPhoto(user._id);
    const beforeFile = onDisk(before);

    const { cookie } = await login(user.email);
    const [route, payload] = edits[a.key];
    const res = await api(cookie, "PATCH", route, payload);

    check(`${a.key}: name-only profile update succeeds`, res.status === 200, `got ${res.status} ${JSON.stringify(res.data)}`);
    check(`${a.key}: photo reference survives a name change`, (await dbPhoto(user._id)) === before);
    check(`${a.key}: photo file survives a name change`, Boolean(beforeFile) && fs.existsSync(beforeFile));

    const me = await readMe(cookie);
    check(`${a.key}: name change persisted`, me.user?.name === payload.name, me.user?.name);
    check(`${a.key}: photo AND name coexist on the same record`, me.user?.profilePhotoUrl === before && me.user?.name === payload.name);
  }

  /* ------------------------------------------------------------------ */
  section("7. Validation: only real images under the size limit are accepted");

  const { cookie: vCookie } = await login(byRole.patient.email);
  const patientBefore = await dbPhoto(byRole.patient._id);

  const pdf = await upload(vCookie, { bytes: Buffer.from("%PDF-1.4\n%evil\n"), name: "resume.pdf", type: "application/pdf" });
  check("a PDF is rejected", pdf.status === 422, `got ${pdf.status}`);
  check("PDF rejection explains the allowed types", /JPG, JPEG, PNG and WEBP/.test(pdf.data?.message || ""), pdf.data?.message);
  check("photo unchanged after a rejected PDF", (await dbPhoto(byRole.patient._id)) === patientBefore);

  const fake = await upload(vCookie, { bytes: Buffer.from("MZ\u0090\u0000this is a windows binary"), name: "trojan.png", type: "image/png" });
  check("a renamed executable is rejected by its magic bytes", fake.status === 422, `got ${fake.status}`);
  check("photo unchanged after a rejected impostor", (await dbPhoto(byRole.patient._id)) === patientBefore);

  const oversize = await upload(vCookie, {
    bytes: Buffer.concat([PNG_1PX, Buffer.alloc(MAX_PROFILE_PHOTO_BYTES + 1024)]),
    name: "huge.png",
    type: "image/png",
  });
  check("an oversized image is rejected", oversize.status === 422, `got ${oversize.status}`);
  check("oversize rejection mentions the limit", /MB or smaller/.test(oversize.data?.message || ""), oversize.data?.message);
  check("photo unchanged after an oversized upload", (await dbPhoto(byRole.patient._id)) === patientBefore);

  const noFile = await fetch(`${BASE}/profile/photo`, { method: "POST", headers: { Cookie: vCookie } });
  const noFileBody = await noFile.json().catch(() => null);
  check("a request with no file is refused with a clear message", noFile.status === 422 && /required/i.test(noFileBody?.message || ""), `${noFile.status} ${noFileBody?.message}`);

  const leftovers = fs
    .readdirSync(path.join(UPLOAD_DIR, "profiles"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name === String(byRole.patient._id))
    .flatMap((d) => fs.readdirSync(path.join(UPLOAD_DIR, "profiles", d.name)));
  check("rejected uploads leave no files behind", leftovers.length === 1, `found ${leftovers.length}: ${leftovers.join(", ")}`);

  /* ------------------------------------------------------------------ */
  section("8. Security: authentication required, ownership cannot be forged");

  const anon = await fetch(`${BASE}/profile/photo`, { method: "POST" });
  check("upload without a session is refused", anon.status === 401, `got ${anon.status}`);

  const strangerPhotoBefore = await dbPhoto(byRole.doctor._id);

  // A userId posted in the body must be ignored entirely: identity comes from the JWT.
  const forged = await upload(vCookie, { extra: { userId: String(byRole.doctor._id) } });
  check("upload with a forged userId in the body still succeeds for the caller", forged.status === 200, `got ${forged.status}`);
  check("the target account was NOT modified", (await dbPhoto(byRole.doctor._id)) === strangerPhotoBefore);
  check("the file was filed under the CALLER, not the posted id", path.basename(path.dirname(onDisk(await dbPhoto(byRole.patient._id)))) === String(byRole.patient._id));

  const anonRead = await fetch(`${BASE}${toExpressPath(await dbPhoto(byRole.patient._id))}`);
  check("the photo cannot be fetched without a session", anonRead.status === 401, `got ${anonRead.status}`);

  // Authenticating is not the same as being allowed to read someone else's photo.
  // Ids are not secret, so an authenticated stranger who learns another account's
  // id must not be able to read that account's photo by naming it in the URL.
  const patientPhotoUrl = await dbPhoto(byRole.patient._id);
  const ownRead = await fetchPhoto(vCookie, patientPhotoUrl);
  check("the owner can still read their own photo", ownRead.status === 200, `got ${ownRead.status}`);

  const { cookie: doctorCookie } = await login(byRole.doctor.email);
  const strangerRead = await fetchPhoto(doctorCookie, patientPhotoUrl);
  check(
    "an authenticated stranger CANNOT read another account's photo by naming its id",
    strangerRead.status === 404,
    `got ${strangerRead.status}`
  );
  check(
    "the refused response leaked no image bytes",
    !PNG_1PX.equals(strangerRead.bytes),
    `${strangerRead.bytes.length} bytes returned`
  );

  // The legacy flat form (files written before photos were filed per account)
  // addresses the same file without an owner segment, so it has to be closed on
  // exactly the same terms rather than becoming the way around the check.
  const { cookie: adminCookie } = await login(byRole.admin.email);
  const flatName = path.posix.basename(toExpressPath(patientPhotoUrl));
  const flatRead = await fetch(`${BASE}/profile/photo/${flatName}`, { headers: { Cookie: adminCookie } });
  check("the legacy flat photo form is closed to a stranger too", flatRead.status === 404, `got ${flatRead.status}`);

  // Encoded separators must not let a request walk out of the upload root.
  const traversalTargets = [
    `/profile/photo/${byRole.patient._id}/..%2f..%2f..%2f.env`,
    `/profile/photo/${byRole.patient._id}/%2e%2e%2f%2e%2e%2fpackage.json`,
    "/profile/photo/..%2f..%2fpackage.json",
  ];
  for (const target of traversalTargets) {
    const res = await fetch(`${BASE}${target}`, { headers: { Cookie: vCookie } });
    check(
      `traversal refused: ${target.slice(0, 60)}`,
      res.status !== 200,
      `got ${res.status}`
    );
  }

  /* ------------------------------------------------------------------ */
  section("9. REMOVE: reference cleared AND file deleted, no broken image left behind");

  for (const a of accounts) {
    const user = byRole[a.key];
    const before = await dbPhoto(user._id);
    const beforeFile = onDisk(before);
    check(`${a.key}: has a photo before removal`, Boolean(before) && fs.existsSync(beforeFile));

    const { cookie } = await login(user.email);
    const res = await api(cookie, "DELETE", "/profile/photo");

    check(`${a.key}: remove returns 200`, res.status === 200, `got ${res.status}`);
    check(`${a.key}: response reports no photo`, res.data?.data?.photoUrl === null);
    check(`${a.key}: response returns the user`, Boolean(res.data?.data?.user));
    check(`${a.key}: DATABASE field is cleared`, (await dbPhoto(user._id)) === null);
    check(`${a.key}: stored FILE is deleted`, !fs.existsSync(beforeFile), beforeFile);

    const served = await fetchPhoto(cookie, before);
    check(`${a.key}: old URL now 404s rather than serving a broken image`, served.status === 404, `got ${served.status}`);

    const me = await readMe(cookie);
    check(`${a.key}: /auth/me reports no photo after removal`, !me.user?.profilePhotoUrl);
  }

  /* ------------------------------------------------------------------ */
  section("10. A photo can be uploaded again after removal");

  const { cookie: againCookie } = await login(byRole.patient.email);
  const back = await upload(againCookie);
  check("re-upload after removal succeeds", back.status === 200, `got ${back.status}`);
  check("re-upload is persisted", (await dbPhoto(byRole.patient._id)) === back.body.photoUrl);
  const served = await fetchPhoto(againCookie, back.body.photoUrl);
  check("re-uploaded photo serves correctly", served.status === 200 && served.bytes.equals(PNG_1PX));

  const fresh = await freshSession(byRole.patient.email);
  check("re-uploaded photo survives a fresh session", fresh.me?.profilePhotoUrl === back.body.photoUrl);

  console.log(`\n${"-".repeat(60)}`);
  console.log(`  scratch database: ${resolved}`);
  console.log(`  upload directory: ${UPLOAD_DIR}`);
  console.log(`-`.repeat(60));
};

if (require.main === module) {
  run()
    .catch((error) => {
      failed += 1;
      console.error(`\n  ERROR ${error.stack || error.message}`);
    })
    .finally(async () => {
      try {
        await purge();
      } catch (error) {
        console.error(`  cleanup failed: ${error.message}`);
      }
      if (server) await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect().catch(() => {});
      const total = passed + failed;
      console.log(`\n${"-".repeat(60)}`);
      console.log(`  ${passed}/${total} checks passed${failed ? `, ${failed} FAILED` : ""}`);
      console.log(`-`.repeat(60));
      process.exit(failed ? 1 : 0);
    });
}

module.exports = { run };