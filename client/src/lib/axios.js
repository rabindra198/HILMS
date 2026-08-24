import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url;
    const isSessionCheck = requestUrl === "/auth/me";

    if (error.response?.status === 401 && !isSessionCheck && requestUrl !== "/auth/logout") {
      api.post("/auth/logout").catch(() => {});
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
