const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

/**
 * Multipart upload support for laboratory result attachments.
 *
 * SECURITY MODEL
 * -------------
 * Files are written OUTSIDE the Express web root. `app.js` never calls
 * `express.static` on this directory, so an uploaded file is not reachable by
 * guessing a URL. The only way to read one is the authenticated
 * `GET /lab/results/:id/attachments/:fileId` route, which re-checks the
 * laboratory role and resolves the owner from the id, never from the path.
 *
 * On disk the filename is a random token with the sanitised extension. The
 * caller's original filename is NOT used as a path segment, so `../../etc/x`
 * and `photo.png.exe` style names cannot escape the directory or mask a type.
 *
 * The stored value handed back to the client is the opaque attachment id, not a
 * filesystem path.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "..", "..", "uploads");

const MAX_FILE_BYTES = Number.parseInt(process.env.UPLOAD_MAX_BYTES || "", 10) || 5 * 1024 * 1024;

const ALLOWED_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["application/pdf", ".pdf"],
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"]);

const ensureUploadDir = () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
};

const fail = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureUploadDir();
      cb(null, UPLOAD_DIR);
    } catch (error) {
      cb(fail("Upload storage is unavailable", 500));
    }
  },
  filename: (req, file, cb) => {
    // Random name. The extension is taken from the ALLOWED table keyed by the
    // sniffed mime type, never from the client-supplied filename.
    const extension = ALLOWED_MIME.get(file.mimetype) || ".bin";
    const token = `${Date.now().toString(36)}-${crypto.randomBytes(12).toString("hex")}`;
    cb(null, `${token}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(fail("Only JPG, PNG, WEBP, GIF images and PDF documents are allowed", 422));
  }
  const extension = path.extname(String(file.originalname || "")).toLowerCase();
  if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
    return cb(fail("File extension is not allowed", 422));
  }
  return cb(null, true);
};

const uploadAttachment = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: 5 },
});

/**
 * `file.mimetype` is whatever the client typed, so it is not evidence. Each
 * file is re-checked against its magic bytes and deleted if the content does
 * not match the declared type. A renamed `.exe` is therefore rejected even
 * though it announced itself as `image/png`.
 */
const SIGNATURES = [
  { mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/gif", test: (b) => b.length > 6 && ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")) },
  { mime: "application/pdf", test: (b) => b.length > 5 && b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/webp", test: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

const contentMatches = (file) => {
  const head = Buffer.alloc(16);
  let fd;
  try {
    fd = fs.openSync(file.path, "r");
    const read = fs.readSync(fd, head, 0, 16, 0);
    if (read === 0) return false;
    return SIGNATURES.some((sig) => sig.mime === file.mimetype && sig.test(head));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
};

/** Deletes anything multer already wrote for a request that is being refused. */
const discardFiles = (files) => {
  (Array.isArray(files) ? files : []).forEach((file) => {
    if (file && file.filename) removeAttachment(file.filename);
  });
};

/**
 * Wraps multer so its errors arrive in the project's standard error shape
 * instead of multer's own HTML/default response.
 */
const uploadResultAttachments = (req, res, next) => {
  uploadAttachment.array("attachments", 5)(req, res, (error) => {
    // Any failure after the stream has started must still clean up what was
    // already written, or a rejected upload leaks a file onto disk.
    if (error) {
      discardFiles(req.files);
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return next(fail(`Each attachment must be ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB or smaller`, 422));
        }
        if (error.code === "LIMIT_FILE_COUNT") {
          return next(fail("A maximum of 5 attachments may be uploaded per request", 422));
        }
        return next(fail(error.message, 422));
      }
      return next(error);
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const impostor = files.find((file) => !contentMatches(file));
    if (impostor) {
      discardFiles(files);
      return next(fail(`"${impostor.originalname}" does not contain ${impostor.mimetype} data`, 422));
    }
    return next();
  });
};

/** Resolves an attachment id back to a real file, or null. Never trusts input. */
const resolveAttachmentPath = (storedName) => {
  if (!storedName) return null;
  // storedName is a bare token we generated. Reject anything path-like so a
  // poisoned value in the database cannot address a file outside the directory.
  if (!/^[A-Za-z0-9._-]+$/.test(storedName) || storedName.includes("..")) return null;
  const resolved = path.resolve(UPLOAD_DIR, storedName);
  // Defence in depth: confirm the resolved path is still inside the directory.
  if (resolved !== path.join(UPLOAD_DIR, storedName)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
};

const removeAttachment = (storedName) => {
  const resolved = resolveAttachmentPath(storedName);
  if (resolved) {
    try {
      fs.unlinkSync(resolved);
    } catch {
      // A missing file is not an error worth failing a request over.
    }
  }
};

/* ------------------------------------------------------------ profile photos */

// Profile photos are image-only, so they get a stricter allow-list and their own
// size ceiling than laboratory attachments (which must also accept PDFs).
const PROFILE_PHOTO_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const PROFILE_PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const MAX_PROFILE_PHOTO_BYTES =
  Number.parseInt(process.env.UPLOAD_MAX_PHOTO_BYTES || "", 10) || 2 * 1024 * 1024;

// Every photo lives under UPLOAD_DIR, in one folder per account:
//   uploads/profiles/<userId>/<timestamp>-<random>.<ext>
// The per-account folder keeps one user's photos out of another's way, and the
// generated token means a name is never reused, so a URL can never change meaning.
const PROFILE_PHOTO_ROOT_NAME = "profiles";

const PROFILE_PHOTO_ROOT = path.join(UPLOAD_DIR, PROFILE_PHOTO_ROOT_NAME);

/** Account ids reach us from Mongo, but the value is still constrained before it becomes a path. */
const sanitizeOwner = (owner) => {
  const value = String(owner ?? "");
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
};

const profilePhotoDirFor = (owner) => {
  const safeOwner = sanitizeOwner(owner);
  return safeOwner ? path.join(PROFILE_PHOTO_ROOT, safeOwner) : null;
};

/** Deletes an absolute path only when it is genuinely inside `root`. */
const unlinkWithin = (root, target) => {
  if (!target) return false;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) return false;
  try {
    fs.unlinkSync(resolved);
    return true;
  } catch {
    return false;
  }
};

const profilePhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // `protect` has already run, so req.user is the authenticated account. A
    // photo is therefore filed under the JWT's user, never under a posted id.
    const dir = profilePhotoDirFor(req.user && req.user._id);
    if (!dir) {
      return cb(fail("Not authorized to upload a profile photo", 401));
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch {
      cb(fail("Profile photo storage is unavailable", 500));
    }
  },
  filename: (req, file, cb) => {
    // Same rule as attachments: the extension comes from the sniffed mime type,
    // never from the client-supplied filename.
    const extension = PROFILE_PHOTO_MIME.get(file.mimetype) || ".img";
    const token = `${Date.now().toString(36)}-${crypto.randomBytes(12).toString("hex")}`;
    cb(null, `${token}${extension}`);
  },
});

const profilePhotoFilter = (req, file, cb) => {
  if (!PROFILE_PHOTO_MIME.has(file.mimetype)) {
    return cb(fail("Only JPG, JPEG, PNG and WEBP images are supported", 422));
  }
  const extension = path.extname(String(file.originalname || "")).toLowerCase();
  if (extension && !PROFILE_PHOTO_EXTENSIONS.has(extension)) {
    return cb(fail("File extension is not allowed", 422));
  }
  return cb(null, true);
};

const uploadProfilePhotoFile = multer({
  storage: profilePhotoStorage,
  fileFilter: profilePhotoFilter,
  limits: { fileSize: MAX_PROFILE_PHOTO_BYTES, files: 1 },
});

/** `profiles/<userId>/<token>.<ext>` - the value used for file lookups and deletion. */
const profilePhotoRelativePath = (owner, filename) => {
  const safeOwner = sanitizeOwner(owner);
  if (!safeOwner || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(filename || ""))) return null;
  return path.posix.join(PROFILE_PHOTO_ROOT_NAME, safeOwner, String(filename));
};

/**
 * Turns a stored reference back into an on-disk path, or null when it is not one
 * we could have written. Only the two shapes this project produces are accepted -
 * the per-account `profiles/<userId>/<token>` path, and the flat token written
 * before photos were filed per account - so a poisoned database value cannot
 * address a laboratory attachment or anything outside UPLOAD_DIR.
 */
const resolveProfilePhotoPath = (relativePath) => {
  if (!relativePath || typeof relativePath !== "string") return null;
  const candidate = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = candidate.split("/");

  const isFlat = segments.length === 1 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segments[0]);
  const isPerAccount =
    segments.length === 3 &&
    segments[0] === PROFILE_PHOTO_ROOT_NAME &&
    sanitizeOwner(segments[1]) === segments[1] &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segments[2]);

  if (!isFlat && !isPerAccount) return null;

  const resolved = path.resolve(UPLOAD_DIR, ...segments);
  if (resolved !== path.join(UPLOAD_DIR, ...segments)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
};

const removeProfilePhoto = (relativePath) => {
  const resolved = resolveProfilePhotoPath(relativePath);
  return resolved ? unlinkWithin(UPLOAD_DIR, resolved) : false;
};

/** Removes a file multer has just written, for a request that is being refused. */
const discardProfilePhoto = (file) => {
  if (!file || !file.path) return;
  unlinkWithin(PROFILE_PHOTO_ROOT, file.path);
};

/**
 * Wraps multer for the profile-photo endpoint.
 *
 * Mirrors `uploadResultAttachments`: multer's own errors are translated into the
 * project's error shape, and the file's bytes are re-checked against its declared
 * type so a renamed `.exe` or `.pdf` cannot be stored as somebody's face.
 *
 * A request with no file at all is passed through rather than failed here, so the
 * controller can answer with the specific "photo is required" message.
 */
const uploadProfilePhoto = (req, res, next) => {
  uploadProfilePhotoFile.single("photo")(req, res, (error) => {
    if (error) {
      discardProfilePhoto(req.file);
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return next(fail(`The photo must be ${Math.round(MAX_PROFILE_PHOTO_BYTES / 1024 / 1024)}MB or smaller`, 422));
        }
        if (error.code === "LIMIT_UNEXPECTED_FILE") {
          return next(fail('Unexpected file field. The image must be sent as "photo".', 422));
        }
        return next(fail(error.message, 422));
      }
      return next(error);
    }

    if (!req.file) return next();

    if (!contentMatches(req.file)) {
      discardProfilePhoto(req.file);
      return next(fail(`"${req.file.originalname}" does not contain ${req.file.mimetype} data`, 422));
    }
    return next();
  });
};

module.exports = {
  uploadResultAttachments,
  resolveAttachmentPath,
  removeAttachment,
  discardFiles,
  uploadProfilePhoto,
  profilePhotoRelativePath,
  resolveProfilePhotoPath,
  removeProfilePhoto,
  discardProfilePhoto,
  PROFILE_PHOTO_ROOT_NAME,
  MAX_PROFILE_PHOTO_BYTES,
  PROFILE_PHOTO_MIME,
  UPLOAD_DIR,
  MAX_FILE_BYTES,
  ALLOWED_MIME,
};


