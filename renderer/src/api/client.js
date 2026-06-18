/**
 * Axios HTTP client with interceptors.
 *
 * - Base URL: /api
 * - Request interceptor: auto-inject Bearer token from localStorage
 * - Response interceptor: normalize errors, clear token on 401
 */
import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor: auto-inject token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("lc_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: unified error handling
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("lc_token");
      // Don't redirect here — leave it to the caller
    }
    return Promise.reject({
      message: error.response?.data?.error || error.message,
      code: error.response?.data?.code || "NETWORK_ERROR",
      status: error.response?.status || 0,
      retryable:
        error.response?.data?.retryable || error.code === "ECONNABORTED",
    });
  }
);

export default client;
