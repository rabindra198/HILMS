import api from "@/lib/axios";

const request = (method, url, data, config) =>
  api({ method, url: `/patient${url}`, data, ...config }).then((response) => response.data?.data ?? response.data);

// Payment is a shared module mounted at /payments, NOT under /patient, so these are
// called directly rather than through the patient prefix.
const paymentRequest = (method, url, data, config) =>
  api({ method, url: `/payments${url}`, data, ...config }).then((response) => response.data?.data ?? response.data);

export const patientApi = {
  getDashboard: () => request("get", "/dashboard"),

  getProfile: () => request("get", "/profile"),
  updateProfile: (data) => request("patch", "/profile", data),

  getDoctors: (params) => request("get", "/doctors", undefined, { params }),

  getAppointments: (params) => request("get", "/appointments", undefined, { params }),
  getAvailability: (params) => request("get", "/appointments/availability", undefined, { params }),
  bookAppointment: (data) => request("post", "/appointments", data),
  cancelAppointment: (id, reason) => request("patch", `/appointments/${id}/cancel`, { reason }),

  getFollowUps: (params) => request("get", "/follow-ups", undefined, { params }),

  getConsultations: (params) => request("get", "/consultations", undefined, { params }),
  getMedicalHistory: (params) => request("get", "/medical-history", undefined, { params }),

  getPrescriptions: (params) => request("get", "/prescriptions", undefined, { params }),
  getPrescriptionDocument: (id) => request("get", `/prescriptions/${id}/document`),
  // The PDF is a binary response, so it is an <a href> rather than an axios call:
  // that bypasses the client's baseURL and needs the "/api" prefix the dev proxy
  // strips. Authentication is the httpOnly cookie the browser sends by itself.
  prescriptionPdfUrl: (id, download = false) =>
    `/api/patient/prescriptions/${id}/document.pdf${download ? "?download=true" : ""}`,

  getLabRequests: (params) => request("get", "/lab-requests", undefined, { params }),
  getLabReports: (params) => request("get", "/lab-reports", undefined, { params }),
  getLabReport: (id) => request("get", `/lab-reports/${id}`),

  getPayments: () => request("get", "/payments"),

  // Which gateways are usable. Returns no secret, only what the server can offer.
  getPaymentConfig: () => paymentRequest("get", "/config"),
  // Starts an eSewa payment and returns the signed form fields. The browser posts
  // those fields to the gateway; it never signs anything itself.
  initiateEsewaPayment: (invoiceId) => paymentRequest("post", "/esewa/initiate", { invoiceId }),
  // Re-checks a transaction whose redirect back was lost.
  verifyEsewaPayment: (payload) => paymentRequest("post", "/esewa/verify", payload),
  getPaymentStatus: (paymentId) => paymentRequest("get", `/${paymentId}/status`),

  getNotifications: (params) => request("get", "/notifications", undefined, { params }),
  getUnreadCount: () => request("get", "/notifications/unread-count"),
  markNotificationRead: (id) => request("patch", `/notifications/${id}/read`),
  markAllNotificationsRead: () => request("patch", "/notifications/read-all"),
};

export const getApiError = (error) =>
  error.response?.data?.message ||
  (error.request ? "Unable to reach the hospital server. Check your connection and try again." : "Something went wrong.");