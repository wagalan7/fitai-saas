import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

function getStored(): { token: string | null; refreshToken: string | null } {
  try {
    const raw = localStorage.getItem('fitai-auth');
    if (!raw) return { token: null, refreshToken: null };
    const { state } = JSON.parse(raw);
    return { token: state?.token ?? null, refreshToken: state?.refreshToken ?? null };
  } catch {
    return { token: null, refreshToken: null };
  }
}

function saveTokens(accessToken: string, refreshToken: string) {
  try {
    const raw = localStorage.getItem('fitai-auth') || '{}';
    const stored = JSON.parse(raw);
    stored.state = { ...stored.state, token: accessToken, refreshToken };
    localStorage.setItem('fitai-auth', JSON.stringify(stored));
  } catch {}
}

// Attach access token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const { token } = getStored();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto refresh on 401
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { refreshToken } = getStored();
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post('/api/auth/refresh', { refreshToken }, { withCredentials: true });
        saveTokens(data.accessToken, data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('fitai-auth');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
