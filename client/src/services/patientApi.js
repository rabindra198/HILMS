import api from "@/lib/axios";

export const patientApi = {
  getProfile: () => api.get("/patient/profile").then((r) => r.data),
  getAppointments: () => api.get("/patient/appointments").then((r) => r.data),
  getConsultations: () => api.get("/patient/consultations").then((r) => r.data),
  getPrescriptions: () => api.get("/patient/prescriptions").then((r) => r.data),
  getLabReports: () => api.get("/patient/lab-reports").then((r) => r.data),
  getFollowUps: () => api.get("/patient/follow-ups").then((r) => r.data),
};
