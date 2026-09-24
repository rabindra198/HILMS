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
  getProcessing: () => request("get", "/processing"),
  startProcessing: (id, notes) => request("patch", `/processing/${id}/start`, { notes }),
  completeProcessing: (id, notes) => request("patch", `/processing/${id}/complete`, { notes }),
  getResults: (params) => request("get", "/results", undefined, { params }),
  createResult: (data) => request("post", "/results", data),
  updateResult: (id, data) => request("patch", `/results/${id}`, data),
  getReports: (params) => request("get", "/reports", undefined, { params }),
  getReport: (id) => request("get", `/reports/${id}`),
  createReport: (data) => request("post", "/reports", data),
  verifyReport: (id) => request("patch", `/reports/${id}/verify`),
  getTests: () => request("get", "/tests"),
  search: (q) => request("get", "/search", undefined, { params: { q } }),
  getNotifications: () => request("get", "/notifications"),
  markNotificationRead: (id) => request("patch", `/notifications/${id}/read`),
  markAllNotificationsRead: () => request("patch", "/notifications/read-all"),
  getProfile: () => request("get", "/profile"),
  updateProfile: (data) => request("patch", "/profile", data),
  updatePassword: (data) => request("patch", "/profile/password", data),
  getSettings: () => request("get", "/settings"),
  updateSettings: (data) => request("patch", "/settings", data),
};

export const getApiError = (error) => error.response?.data?.message || (error.request ? "Unable to connect to the laboratory server." : "Something went wrong.");