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

// Auto-refresh on 401. One refresh at a time (shared by every request and tab), and a temporary network
// problem never signs anyone out — only a refresh the server actually rejects does.
let refreshing: Promise<string> | null = null;
function doRefresh(refreshToken: string): Promise<string> {
  if (!refreshing) {
    refreshing = axios
      .post(`${BASE_URL}/api/auth/refresh`, { refreshToken }, { headers: { 'X-Device-Id': getDeviceId() } })
      .then(({ data }) => {
        const { token, refreshToken: newRefresh } = data.data;
        localStorage.setItem('hrms_token', token);
        if (newRefresh) localStorage.setItem('hrms_refresh_token', newRefresh);
        return token as string;
      })
      .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const usedToken = String(original.headers?.Authorization || '').replace('Bearer ', '');
      const stored = localStorage.getItem('hrms_token');
      // Another tab/request already got a fresh token while this one was failing — just use it.
      if (stored && stored !== usedToken) {
        original.headers.Authorization = `Bearer ${stored}`;
        return api(original);
      }
      const refreshToken = localStorage.getItem('hrms_refresh_token');
      if (refreshToken) {
        try {
          const token = await doRefresh(refreshToken);
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        } catch (refreshErr) {
          const r = refreshErr as { response?: { status?: number; data?: { code?: string; message?: string } } };
          // No answer from the server (offline / restarting): keep the session, let the request fail normally.
          if (!r.response) return Promise.reject(error);
          // A student whose account was moved to another device: say why on
          // the login screen instead of silently bouncing them there.
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
