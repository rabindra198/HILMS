import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      api.post("/auth/logout").catch(() => {});
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
