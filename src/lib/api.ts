import axios from 'axios';

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/** A random id generated once per browser and kept in localStorage — what the
 * backend treats as "this device" for the student single-device login rule.
 * (Clearing site data or switching browser/phone = a new device, which then
 * needs admin approval.) Sent on every request as X-Device-Id. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('hrms_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`);
      localStorage.setItem('hrms_device_id', id);
    }
    return id;
  } catch {
    return 'unknown-device';
  }
}

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hrms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Device-Id'] = getDeviceId();
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
          }, { headers: { 'X-Device-Id': getDeviceId() } });
          const { token, refreshToken: newRefresh } = data.data;
          localStorage.setItem('hrms_token', token);
          localStorage.setItem('hrms_refresh_token', newRefresh);
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        } catch (refreshErr) {
          // A student whose account was moved to another device: say why on
          // the login screen instead of silently bouncing them there.
          const r = refreshErr as { response?: { data?: { code?: string; message?: string } } };
          if (r.response?.data?.code === 'DEVICE_CHANGED') {
            sessionStorage.setItem('hrms_login_notice', r.response.data.message || 'Your account is now active on a different device.');
          }
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
