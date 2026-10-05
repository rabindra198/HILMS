const User = require("../models/User");
const response = require("../utils/response");
const { userResource } = require("../resources/userResource");
const {
  PROFILE_PHOTO_ROOT_NAME,
  profilePhotoRelativePath,
  resolveProfilePhotoPath,
  removeProfilePhoto,
  discardProfilePhoto,
} = require("../middleware/upload");

/**
 * Profile photo persistence.
 *
 * THE REFERENCE IS THE DATABASE. The image file on disk is only half of the
 * feature: `User.profilePhotoUrl` is what every read path trusts, so an upload
 * that does not write that field has not happened as far as the application is
 * concerned. `/auth/me` is re-read on every page load, which is why a photo held
 * only in React state survives the upload and then vanishes on refresh.
 *
 * Each write therefore completes in this order:
 *   1. multer has stored the image under uploads/profiles/<userId>/
 *   2. the database reference is updated
 *   3. only then is the previous file deleted
 * If step 2 fails the new file is removed and the error is surfaced, so a failed
 * upload can never leave the user without the photo they already had.
 */

/**
 * Prefix used for the stored reference and for the URL the browser requests.
 *
 * It matches the `baseURL` of the client's shared axios instance, so the React
 * app resolves the image the same way it resolves every other API call and no
 * component ever needs to know the API host - there is no `localhost:5000` here.
 */
const PHOTO_URL_PREFIX = "/api/profile/photo/";

const fail = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

/**
 * Reduces a stored URL to the trailing owner-id/filename pair (or a legacy bare
 * filename) that the serving route is addressed by.
 */
const ownerAndFilenameFrom = (rawUrl) => {
  const value = String(rawUrl ?? "");
  if (!value) return null;
  const marker = PHOTO_URL_PREFIX;
  const at = value.lastIndexOf(marker);
  if (at !== -1) return value.slice(at + marker.length);
  // Tolerate an absolute URL so a reference written by a different deployment
  // still resolves to the same file.
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }
  return value;
};

/** Converts a stored reference into the per-account path used on disk. */
const relativePathFrom = (storedUrl) => {
  const tail = ownerAndFilenameFrom(storedUrl);
  if (!tail) return null;
  const segments = tail.split("/").filter(Boolean);
  // Already in the on-disk shape (written by an earlier version of this module).
  if (segments.length === 3 && segments[0] === PROFILE_PHOTO_ROOT_NAME) return segments.join("/");
  // Current shape: an owner id and a filename. A single segment is the legacy flat file.
  return segments.length === 2 ? `${PROFILE_PHOTO_ROOT_NAME}/${segments.join("/")}` : tail;
};

const run = (handler, successMessage = "Success", statusCode = 200) => async (req, res, next) => {
  try {
    return response.success(res, await handler(req), statusCode, successMessage);
  } catch (error) {
    return next(error);
  }
};

/** Identity always comes from the session, so no request can address another account. */
const authenticatedId = (req) => {
  const userId = req.user?._id;
  if (!userId) throw fail("Not authorized, no token provided", 401);
  return userId;
};

module.exports = {
  /**
   * Streams a stored photo - the caller's own, and only the caller's own.
   *
   * The directory is never mounted as a static web root, so this authenticated
   * route is the only way to read a file. The name is an unguessable random
   * token and the path is validated against the two shapes this project writes.
   *
   * Authenticated is not the same as authorised. Without the check below, any
   * signed-in account could read any other account's photo by putting that
   * account's id in the URL, since ids are not secret. Every consumer in the app
   * renders the signed-in user's own `profilePhotoUrl`, so requiring that match
   * costs nothing and closes the read.
   */
  getPhoto: async (req, res, next) => {
    try {
      const { userId, filename } = req.params;
      // The URL omits the on-disk `profiles/` segment, so the owner id and the
      // filename are re-joined into the path the resolver understands. It
      // returns null for anything it did not generate, which becomes a 404.
      const reference =
        userId && filename ? profilePhotoRelativePath(userId, filename) : filename;
      // The database is the authority on which file belongs to whom, so the
      // request has to name exactly the photo recorded on the caller's account.
      const ownReference = relativePathFrom(req.user?.profilePhotoUrl);
      if (!reference || !ownReference || reference !== ownReference) {
        return res.status(404).send("Not found");
      }
      const filePath = resolveProfilePhotoPath(reference);
      if (!filePath) {
        return res.status(404).send("Not found");
      }
      return res.sendFile(filePath, {
        headers: {
          // Every upload gets a brand new filename, so the bytes behind a given
          // URL never change. That makes this cacheable indefinitely, which is
          // what stops the browser from painting a stale photo after a replace -
          // no cache-busting query string is needed anywhere.
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    } catch (error) {
      return next(error);
    }
  },

  /**
   * Stores the photo AND records it against the authenticated account.
   *
   * Returns the updated user alongside the URL so the client can refresh its
   * session from one response instead of guessing what changed.
   */
  uploadPhoto: run(async (req) => {
    const userId = authenticatedId(req);

    if (!req.file) {
      throw fail("Profile photo is required", 422);
    }

    const relativePath = profilePhotoRelativePath(userId, req.file.filename);
    if (!relativePath) {
      discardProfilePhoto(req.file);
      throw fail("Unable to store the profile photo", 500);
    }

    const photoUrl = `${PHOTO_URL_PREFIX}${userId}/${req.file.filename}`;
    const previousReference = relativePathFrom(req.user.profilePhotoUrl);

    let updated;
    try {
      updated = await User.findByIdAndUpdate(
        userId,
        { $set: { profilePhotoUrl: photoUrl } },
        { new: true, runValidators: true }
      );
    } catch (databaseError) {
      // No reference means the file is unreachable and would leak forever.
      discardProfilePhoto(req.file);
      throw databaseError;
    }

    if (!updated) {
      discardProfilePhoto(req.file);
      throw fail("Account not found", 404);
    }

    // Reached only once the new photo is stored AND referenced, so replacing a
    // photo can never leave the account pointing at a file that is already gone.
    if (previousReference && previousReference !== relativePath) {
      removeProfilePhoto(previousReference);
    }

    return {
      photoUrl,
      profilePhotoUrl: photoUrl,
      filename: req.file.filename,
      user: userResource(updated),
    };
  }, "Profile photo updated successfully", 200),

  /**
   * Detaches the photo from the account and deletes the file.
   *
   * The reference is cleared first: an orphaned file is invisible, whereas a
   * cleared-then-broken reference would render as a broken image.
   */
  removePhoto: run(async (req) => {
    const userId = authenticatedId(req);
    const previousReference = relativePathFrom(req.user.profilePhotoUrl);

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { profilePhotoUrl: null } },
      { new: true }
    );
    if (!updated) {
      throw fail("Account not found", 404);
    }

    if (previousReference) {
      removeProfilePhoto(previousReference);
    }

    return { photoUrl: null, profilePhotoUrl: null, user: userResource(updated) };
  }, "Profile photo removed successfully", 200),
};