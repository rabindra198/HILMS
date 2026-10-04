import api from "@/lib/axios";
import { unwrap } from "@/lib/axios";

// Mirrors the server's rules (server/src/middleware/upload.js) so an unsupported
// file is refused before it is sent. The backend re-checks the type, the magic
// bytes and the size independently, so this is convenience, never the safeguard.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_MB = Math.round(MAX_PHOTO_BYTES / 1024 / 1024);
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const ACCEPTED_PHOTO_TYPES = ACCEPTED_TYPES;
export const PHOTO_ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");

/**
 * Shapes a client-side rejection like a server error response, so each page's
 * existing `getApiError(error)` renders this exact message without needing a
 * branch of its own for locally-detected problems.
 */
const invalid = (message) => {
  const error = new Error(message);
  error.response = { data: { message } };
  return error;
};

export const profileApi = {
  /**
   * Uploads the photo as multipart/form-data in the field named `photo`, which
   * is what the backend's multer middleware reads. `Content-Type: null` lets the
   * browser set the header itself so it can include the multipart boundary -
   * leaving axios to send JSON is what silently drops the file and leaves
   * `req.file` undefined on the server.
   *
   * On success the backend has stored the file AND recorded it on the account,
   * so the returned `user` is the persisted state, not a local preview.
   */
  uploadPhoto: async (file) => {
    if (!file) {
      throw invalid("Please choose a photo to upload.");
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw invalid("Only JPG, JPEG, PNG and WEBP images are supported.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw invalid(`Image size exceeds the ${MAX_PHOTO_MB}MB limit.`);
    }

    const formData = new FormData();
    formData.append("photo", file);

    const response = await api.post("/profile/photo", formData, {
      headers: { "Content-Type": null },
    });
    return unwrap(response);
  },

  /** Clears the reference and deletes the file. Returns the updated user. */
  removePhoto: async () => {
    const response = await api.delete("/profile/photo");
    return unwrap(response);
  },
};