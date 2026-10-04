import api from "@/lib/axios";

/**
 * Admin API client.
 *
 * Every call hits the real backend under `/api/admin`; authorization is enforced
 * server-side by `protect` + `isAdmin` + `blockUntilPasswordChanged` on the whole
 * router, so nothing here is a security boundary - it is a typed view of the
 * contract in `server/src/routes/admin.js`.
 *
 * JSON endpoints unwrap the `{ success, message, data }` envelope. Binary
 * endpoints (report exports) use `download*`, which deliberately bypasses that
 * unwrap because they return a file, not a JSON body.
 */
const request = (method, url, data, config) =>
  api({ method, url: `/admin${url}`, data, ...config }).then((response) => response.data?.data ?? response.data);

// ---- Access request review ----
export const getAccessRequests = (params) => request("get", "/access-requests", undefined, { params });
export const getAccessRequestSummary = () => request("get", "/access-requests/summary");
export const getAccessRequest = (id) => request("get", `/access-requests/${id}`);
export const approveAccessRequest = (id, notes) => request("patch", `/access-requests/${id}/approve`, { notes });
export const rejectAccessRequest = (id, notes) => request("patch", `/access-requests/${id}/reject`, { notes });

// ---- Dashboard (FR-AD-01) ----
// `date` is an optional `YYYY-MM-DD`; the backend defaults to today.
export const getDashboard = (params) => request("get", "/dashboard", undefined, { params });
export const globalSearch = (q) => request("get", "/search", undefined, { params: { q } });

// ---- Appointments (FR-AD-02 / FR-AD-03) ----
export const getAppointments = (params) => request("get", "/appointments", undefined, { params });
export const getAppointmentQueue = (params) => request("get", "/appointments/queue", undefined, { params });
export const getAppointment = (id) => request("get", `/appointments/${id}`);
export const createAppointment = (payload) => request("post", "/appointments", payload);
export const rescheduleAppointment = (id, payload) => request("patch", `/appointments/${id}/reschedule`, payload);
export const cancelAppointment = (id, reason) => request("patch", `/appointments/${id}/cancel`, { reason });
export const updateAppointmentStatus = (id, status) => request("patch", `/appointments/${id}/status`, { status });

// ---- Doctors & availability (FR-AD-04) ----
export const getDoctors = (params) => request("get", "/doctors", undefined, { params });
export const updateDoctor = (doctorId, payload) => request("patch", `/doctors/${doctorId}`, payload);
export const getDoctorAvailability = (doctorId) => request("get", `/doctors/${doctorId}/availability`);
export const replaceDoctorAvailability = (doctorId, windows) => request("put", `/doctors/${doctorId}/availability`, { windows });
export const addAvailabilityWindow = (doctorId, payload) => request("post", `/doctors/${doctorId}/availability`, payload);
export const updateAvailabilityWindow = (doctorId, windowId, payload) =>
  request("patch", `/doctors/${doctorId}/availability/${windowId}`, payload);
export const removeAvailabilityWindow = (doctorId, windowId) =>
  request("delete", `/doctors/${doctorId}/availability/${windowId}`);
export const getDoctorSlots = (doctorId, params) => request("get", `/doctors/${doctorId}/slots`, undefined, { params });

// ---- Patients (FR-AD-02) ----
// Provisions a Patient account. The temporary password is generated and emailed
// by the backend, so no password is ever sent from the client.
export const createPatientAccount = (payload) => request("post", "/patients", payload);
export const getPatients = (params) => request("get", "/patients", undefined, { params });
export const getPatient = (id, params) => request("get", `/patients/${id}`, undefined, { params });
export const updatePatient = (id, payload) => request("patch", `/patients/${id}`, payload);

// ---- Laboratory coordination (FR-AD-06) ----
export const getLaboratoryOverview = () => request("get", "/laboratory");

// ---- Billing (FR-AD-07) ----
export const getBillingSummary = (params) => request("get", "/billing/summary", undefined, { params });
export const getInvoices = (params) => request("get", "/billing/invoices", undefined, { params });
export const getInvoice = (id) => request("get", `/billing/invoices/${id}`);
export const createInvoice = (payload) => request("post", "/billing/invoices", payload);
export const voidInvoice = (id, reason) => request("patch", `/billing/invoices/${id}/void`, { reason });
export const getPayments = (params) => request("get", "/billing/payments", undefined, { params });
export const recordPayment = (payload) => request("post", "/billing/payments", payload);

// ---- Reports (FR-AD-05) ----
// The export handler builds the same payload the JSON route returns, so a
// downloaded file can never disagree with the table on screen.
export const getReport = (kind, params) => request("get", `/reports/${kind}`, undefined, { params });
export const getReportPatients = (params) => request("get", "/reports/patients", undefined, { params });

/**
 * Triggers a browser download for a report export.
 *
 * The response is a file, so it must not go through the JSON `request` helper.
 * A temporary object URL is created and revoked in a `finally`: on Windows a
 * revoked download that is still in flight cancels the save, so the click is
 * dispatched before the URL is released. The filename comes from the server's
 * `Content-Disposition` when present so the file matches the report it came from.
 */
export const downloadReport = async (kind, params = {}) => {
  const response = await api.get(`/admin/reports/export/${kind}`, {
    params,
    responseType: "blob",
  });

  const disposition = response.headers?.["content-disposition"] || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : `${kind}-report`;

  const blobUrl = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  return filename;
};

// ---- Notifications ----
export const getNotifications = (params) => request("get", "/notifications", undefined, { params });
export const getUnreadNotificationCount = () => request("get", "/notifications/unread-count");
export const markNotificationRead = (id) => request("patch", `/notifications/${id}/read`);
export const markAllNotificationsRead = () => request("patch", "/notifications/read-all");

// ---- Profile & settings ----
export const getMyProfile = () => request("get", "/profile");
export const updateMyProfile = (payload) => request("patch", "/profile", payload);
export const getMySettings = () => request("get", "/settings");
export const updateMySettings = (payload) => request("patch", "/settings", payload);

// Password changes are NOT on the admin router - they live on the shared auth
// router as `PATCH /auth/change-password`, which performs its own
// current-password check. So this one call skips the `/admin` prefix helper.
// Required body: { currentPassword, newPassword, confirmPassword }.
export const changeMyPassword = (payload) =>
  api({ method: "patch", url: "/auth/change-password", data: payload }).then((response) => response.data?.data ?? response.data);

// ---- User management ----
export const getUsers = (params) => request("get", "/users", undefined, { params });
export const updateUserRole = (id, role) => request("patch", `/users/${id}/role`, { role });
export const updateUserStatus = (id, status) => request("patch", `/users/${id}/status`, { status });
export const deleteUser = (id) => request("delete", `/users/${id}`);
export { getErrorMessage } from "@/lib/axios";

// ---- Care team management (section 25) ----
export const getCareTeamAssignments = (params) => request("get", "/care-team", undefined, { params });
export const assignDoctorPatient = (doctorId, patientId) => request("post", `/doctors/${doctorId}/patients`, { patientId });
export const reassignDoctorPatient = (doctorId, patientId, payload) =>
  request("patch", `/doctors/${doctorId}/patients/${patientId}/reassign`, payload);
export const revokeDoctorPatient = (doctorId, patientId) => request("delete", `/doctors/${doctorId}/patients/${patientId}`);

// ---- System overview & audit trail ----
export const getSystemOverview = () => request("get", "/overview");
export const getAuditLogs = (limit) => request("get", "/audit-logs", undefined, { params: { limit } });
