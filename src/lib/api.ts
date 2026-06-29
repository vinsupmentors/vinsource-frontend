import axios from 'axios';

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hrms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('hrms_refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, {
            refreshToken,
          });
          const { token, refreshToken: newRefresh } = data.data;
          localStorage.setItem('hrms_token', token);
          localStorage.setItem('hrms_refresh_token', newRefresh);
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        } catch {
          localStorage.removeItem('hrms_token');
          localStorage.removeItem('hrms_refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export { api };
export default api;
