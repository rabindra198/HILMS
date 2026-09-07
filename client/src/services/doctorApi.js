import api from "@/lib/axios";

export const doctorApi = {
  getDashboard: () => api.get("/doctor/dashboard").then((r) => r.data),
  getLabTests: () => api.get("/doctor/lab-tests").then((r) => r.data),

  getAppointments: (params) =>
    api.get("/doctor/appointments", { params }).then((r) => r.data),

  getPatients: (search) =>
    api.get("/doctor/patients", { params: { search } }).then((r) => r.data),

  getConsultations: () => api.get("/doctor/consultations").then((r) => r.data),
  getConsultation: (id) => api.get(`/doctor/consultations/${id}`).then((r) => r.data),
  getConsultationByAppointment: (appointmentId) => api.get(`/doctor/consultations/appointment/${appointmentId}`).then((r) => r.data),
  saveConsultation: (payload, id) =>
    id
      ? api.put(`/doctor/consultations/${id}`, payload).then((r) => r.data)
      : api.post("/doctor/consultations", payload).then((r) => r.data),

  getPrescriptions: () => api.get("/doctor/prescriptions").then((r) => r.data),
  createPrescription: (payload) =>
    api.post("/doctor/prescriptions", payload).then((r) => r.data),

  getLabRequests: () => api.get("/doctor/lab-requests").then((r) => r.data),
  requestLabTest: (payload) =>
    api.post("/doctor/lab-requests", payload).then((r) => r.data),

  getLabReports: () => api.get("/doctor/lab-reports").then((r) => r.data),
  getLabReport: (id) => api.get(`/doctor/lab-reports/${id}`).then((r) => r.data),
  addReportComment: (id, comment) =>
    api.post(`/doctor/lab-reports/${id}/comments`, { comment }).then((r) => r.data),
  continueTreatment: (id, payload) =>
    api.post(`/doctor/lab-reports/${id}/treatment`, payload).then((r) => r.data),

  getFollowUps: () => api.get("/doctor/follow-ups").then((r) => r.data),
  createFollowUp: (payload) =>
    api.post("/doctor/follow-ups", payload).then((r) => r.data),

  getProfile: () => api.get("/doctor/profile").then((r) => r.data),
  updateProfile: (payload) => api.put("/doctor/profile", payload).then((r) => r.data),

  getSettings: () => api.get("/doctor/settings").then((r) => r.data),
  updateSettings: (payload) => api.put("/doctor/settings", payload).then((r) => r.data),

  getNotifications: () => api.get("/doctor/notifications").then((r) => r.data),
};
