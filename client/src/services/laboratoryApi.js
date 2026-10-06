import api from "@/lib/axios";

const request = (method, url, data, config) => api({ method, url: `/lab${url}`, data, ...config }).then((response) => response.data?.data ?? response.data);

export const laboratoryApi = {
  getDashboard: () => request("get", "/dashboard"),
  getRequests: (params) => request("get", "/requests", undefined, { params }),
  getRequest: (id) => request("get", `/requests/${id}`),
  acceptRequest: (id) => request("post", `/requests/${id}/accept`),
  updateRequestStatus: (id, status) => request("patch", `/requests/${id}/status`, { status }),
  getSamples: (params) => request("get", "/samples", undefined, { params }),
  getSample: (id) => request("get", `/samples/${id}`),
  createSample: (data) => request("post", "/samples", data),
  updateSample: (id, data) => request("patch", `/samples/${id}`, data),
  // SRS FR-LB-03: a printable SVG label. `format` is "barcode" (Code 128, default) or
  // "qr"; both encode the same non-PHI `HILMS-LAB:` payload, so a scanned QR pasted
  // into lookupSample resolves the same sample as a printed barcode.
  getSampleLabel: (id, format = "barcode") => request("get", `/samples/${id}/label`, undefined, { params: { format } }),
  // Specimen receipt: resolve a scanned barcode/QR payload or a typed sample id.
  lookupSample: (code) => request("post", "/samples/lookup", { code }),
  getProcessing: (params) => request("get", "/processing", undefined, { params }),
  getProcessingItem: (id) => request("get", `/processing/${id}`),
  startProcessing: (id, notes) => request("patch", `/processing/${id}/start`, { notes }),
  completeProcessing: (id, notes) => request("patch", `/processing/${id}/complete`, { notes }),
  getResults: (params) => request("get", "/results", undefined, { params }),
  getResult: (id) => request("get", `/results/${id}`),
  createResult: (data) => request("post", "/results", data),
  // Attachments need multipart/form-data so the server can stream and sniff the
  // binary itself.
  //
  // The shared client sets `Content-Type: application/json` as an instance
  // default, and axios keys its body transform off that header: left alone it
  // JSON-stringifies the FormData and the file silently becomes "{}" with no
  // error. `null` unsets it so the browser generates the multipart body *and* its
  // boundary - hand-writing "multipart/form-data" without a boundary produces an
  // unparseable body instead.
  createResultWithFiles: (formData) =>
    api({
      method: "post",
      url: "/lab/results",
      data: formData,
      headers: { "Content-Type": null },
    }).then((response) => response.data?.data ?? response.data),
  updateResult: (id, data) => request("patch", `/results/${id}`, data),
  getReports: (params) => request("get", "/reports", undefined, { params }),
  getReport: (id) => request("get", `/reports/${id}`),
  createReport: (data) => request("post", "/reports", data),
  // FR-LB-05: verification requires the reviewer to confirm every check first; the
  // server rejects an incomplete attestation with 422 rather than silently releasing.
  verifyReport: (id, checks) => request("patch", `/reports/${id}/verify`, { checks }),
  // FR-LB-05: the final sign-off that freezes the document.
  approveReport: (id) => request("patch", `/reports/${id}/approve`),
  // A released report is never edited in place; a correction is a new revision that
  // supersedes the original. The reason is mandatory.
  reviseReport: (id, reason) => request("post", `/reports/${id}/revise`, { reason }),
  // FR-LB-06: categories are their own entity so tests group consistently.
  getCategories: (params) => request("get", "/categories", undefined, { params }),
  createCategory: (data) => request("post", "/categories", data),
  updateCategory: (id, data) => request("patch", `/categories/${id}`, data),
  deleteCategory: (id) => request("delete", `/categories/${id}`),
  getTests: (params) => request("get", "/tests", undefined, { params }),
  getTest: (id) => request("get", `/tests/${id}`),
  // Blank result-entry rows for a test, with reference ranges resolved for the
  // supplied patient (sex-specific ranges need the patient's gender).
  getTestParameters: (id, patientId) =>
    request("get", `/tests/${id}/parameters`, undefined, { params: patientId ? { patient: patientId } : undefined }),
  createTest: (data) => request("post", "/tests", data),
  updateTest: (id, data) => request("patch", `/tests/${id}`, data),
  deleteTest: (id) => request("delete", `/tests/${id}`),
  setTestActive: (id, isActive) => request("patch", `/tests/${id}/status`, { isActive }),
  getPatient: (id) => request("get", `/patients/${id}`),
  search: (q) => request("get", "/search", undefined, { params: { q } }),
  getNotifications: (params) => request("get", "/notifications", undefined, { params }),
  getUnreadNotificationCount: () => request("get", "/notifications/unread-count"),
  markNotificationRead: (id) => request("patch", `/notifications/${id}/read`),
  markAllNotificationsRead: () => request("patch", "/notifications/read-all"),
  // This is an <a href>, not an axios call, so it bypasses the client's
  // baseURL and needs the "/api" prefix the dev proxy strips. Authentication is
  // the httpOnly cookie, which the browser sends with a normal link.
  attachmentUrl: (resultId, fileId) => `/api/lab/results/${resultId}/attachments/${fileId}`,
  getProfile: () => request("get", "/profile"),
  updateProfile: (data) => request("patch", "/profile", data),
  updatePassword: (data) => request("patch", "/profile/password", data),
  getSettings: () => request("get", "/settings"),
  updateSettings: (data) => request("patch", "/settings", data),
};

export const getApiError = (error) => error.response?.data?.message || (error.request ? "Unable to connect to the laboratory server." : "Something went wrong.");

/**
 * Extracts structured detail from a laboratory API error.
 *
 * Some errors carry additional context beyond a message - for example, the
 * completion check returns `missingParameters` so the UI can name the exact
 * parameter that is still required. This helper keeps that parsing in one place
 * instead of scattering `error.response?.data?.` lookups across every caller.
 */
export const getLabError = (error) => ({
  message: getApiError(error),
  missingParameters: error?.response?.data?.missingParameters || [],
});

export { getErrorMessage } from "@/lib/axios";