import api from "@/lib/axios";

/**
 * Doctor module API (FR-DR-01 .. FR-DR-09).
 *
 * No doctor id is ever sent. The server derives it from the JWT on every
 * request, so a doctor cannot read or write another doctor's records by
 * tampering with a query parameter - and the client has no id to tamper with.
 *
 * Per-patient authorization is likewise absent here. The backend scopes every
 * patient route to the caller's care team and answers 404 for anyone else, so a
 * page that renders a patient id it was given by a link is safe to open.
 */

const request = (method, url, data, config) =>
  api({ method, url: `/doctor${url}`, data, ...config }).then((response) => response.data?.data ?? response.data);

/**
 * List endpoints return the page as a plain ARRAY in `data`, with `pagination`
 * as a sibling key on the envelope (see `server/src/utils/response.js`).
 *
 * Reading only `data` - which the shared `unwrap` helper does - silently drops
 * the page metadata, so a "Next" button has nothing to disable itself against.
 * This collapses both into one object the list screens can destructure.
 */
const paged = (method, url, params) =>
  api({ method, url: `/doctor${url}`, params }).then((response) => ({
    items: response.data?.data ?? [],
    pagination: response.data?.pagination ?? null,
  }));

export const doctorApi = {
  // ---- Dashboard (FR-DR-01) ----
  getDashboard: () => request("get", "/dashboard"),

  // ---- Appointments & follow-ups (FR-DR-01, FR-DR-09) ----
  getAppointments: (params) => paged("get", "/appointments", params),
  getAppointment: (id) => request("get", `/appointments/${id}`),
  bookAppointment: (data) => request("post", "/appointments", data),
  updateAppointmentStatus: (id, status) => request("patch", `/appointments/${id}/status`, { status }),

  // ---- Patient workspace (FR-DR-02) ----
  getPatients: (params) => request("get", "/patients", undefined, { params }),
  getPatient: (id) => request("get", `/patients/${id}`),
  getPatientHistory: (id, params) => request("get", `/patients/${id}/history`, undefined, { params }),
  getPatientConsultations: (id, params) => paged("get", `/patients/${id}/consultations`, params),

  // ---- Consultations (FR-DR-02, FR-DR-08) ----
  getConsultations: (params) => paged("get", "/consultations", params),
  getConsultation: (id) => request("get", `/consultations/${id}`),
  createConsultation: (data) => request("post", "/consultations", data),
  updateConsultation: (id, data) => request("patch", `/consultations/${id}`, data),
  completeConsultation: (id, data) => request("patch", `/consultations/${id}/complete`, data),

  // ---- Prescriptions & printable document (FR-DR-03, FR-DR-04) ----
  getPrescriptions: (params) => paged("get", "/prescriptions", params),
  getPrescription: (id) => request("get", `/prescriptions/${id}`),
  createPrescription: (data) => request("post", "/prescriptions", data),
  // One payload feeds both the on-screen print view and the PDF, so the printed
  // page can never drift from what the doctor reviewed on screen.
  getPrescriptionDocument: (id) => request("get", `/prescriptions/${id}/document`),
  // A plain <a href>, not an axios call: the browser navigates to it, so it needs
  // the "/api" prefix the dev proxy strips. Auth is the httpOnly cookie the
  // browser attaches to a normal link request.
  prescriptionPdfUrl: (id, download = false) =>
    `/api/doctor/prescriptions/${id}/document.pdf${download ? "?download=true" : ""}`,

  // ---- Laboratory review & comparison (FR-DR-07, FR-DR-08) ----
  getReports: (params) => paged("get", "/reports", params),
  getReport: (id) => request("get", `/reports/${id}`),
  getReportHistory: (params) => request("get", "/reports/history", undefined, { params }),
  compareReports: (params) => request("get", "/reports/compare", undefined, { params }),
  addReportComment: (id, data) => request("post", `/reports/${id}/comments`, data),

  // ---- Laboratory ordering (FR-DR-05, FR-DR-06) ----
  getLaboratoryWorkspace: (params) => request("get", "/laboratory", undefined, { params }),
  createLabRequest: (data) => request("post", "/laboratory/requests", data),

  // ---- Notifications (SRS 8.1) ----
  getNotifications: (params) => request("get", "/notifications", undefined, { params }),
  getUnreadNotificationCount: () => request("get", "/notifications/unread-count"),
  markNotificationRead: (id) => request("patch", `/notifications/${id}/read`),
  markAllNotificationsRead: () => request("patch", "/notifications/read-all"),

  // ---- Profile & settings ----
  getProfile: () => request("get", "/profile"),
  updateProfile: (data) => request("patch", "/profile", data),
  getSettings: () => request("get", "/settings"),
  updateSettings: (data) => request("patch", "/settings", data),
};

/**
 * Reuse the shared normaliser rather than a module-local copy, so doctor errors
 * read exactly like laboratory and admin errors and `getErrorMessage`'s
 * field-level fallback (first `errors[]` entry) works here too.
 */
export { getErrorMessage as getDoctorApiError } from "@/lib/axios";
