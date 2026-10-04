import axios from "axios";

/**
 * Shared API client.
 *
 * Authentication uses the httpOnly cookie set by the backend, sent
 * automatically via `withCredentials`. No JWT is kept in localStorage or
 * sessionStorage, so there is nothing script-accessible to steal via XSS.
 * (The backend additionally accepts `Authorization: Bearer <token>` for
 * non-browser clients such as Postman.)
 */
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const AUTH_FREE_PATHS = ["/auth/login", "/auth/logout", "/auth/me"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || "";
    const status = error.response?.status;
    const isAuthCheck = AUTH_FREE_PATHS.includes(url);

    // 401 = no valid session. 403 = authenticated but not allowed / not
    // approved - that state is surfaced to the user, not redirected away.
    if (status === 401 && !isAuthCheck) {
      api.post("/auth/logout").catch(() => {});
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

/** Normalised, user-safe error message - never a raw stack trace. */
export const getErrorMessage = (error, fallback = "Something went wrong. Please try again.") => {
  const data = error?.response?.data;
  if (data?.message) return data.message;
  if (data?.errors?.length) return data.errors[0].message;
  if (error?.message === "Network Error") {
    return "Unable to reach the server. Please check your connection and try again.";
  }
  return fallback;
};

/** Unwraps the `{ success, message, data }` envelope used by the API. */
export const unwrap = (response) => response?.data?.data ?? response?.data;

export const apiError = (error) => ({
  status: error?.response?.status ?? 0,
  message: getErrorMessage(error),
  data: error?.response?.data?.data ?? null,
});

export { api };
export default api;
