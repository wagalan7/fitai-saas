import axios, { AxiosRequestConfig } from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 60000,
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

function clearAuthAndRedirect() {
  try { localStorage.removeItem('fitai-auth'); } catch {}
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

// Attach access token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const { token } = getStored();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Single-flight refresh: only one /auth/refresh request runs at a time.
// All other 401s wait for that one to finish, then retry with the new token.
// This avoids the race where N parallel 401s each consume/burn the (single-use)
// refresh token on the backend, kicking the user out.
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = getStored();
  if (!refreshToken) throw new Error('No refresh token');
  const { data } = await axios.post(
    '/api/auth/refresh',
    { refreshToken },
    { withCredentials: true, timeout: 15000 },
  );
  if (!data?.accessToken || !data?.refreshToken) {
    throw new Error('Malformed refresh response');
  }
  saveTokens(data.accessToken, data.refreshToken);
  return data.accessToken as string;
}

function getOrStartRefresh(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      // Clear after a microtask so any waiters that just resolved still see
      // the same promise reference, but subsequent 401s start fresh.
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// Auto refresh on 401
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = (error.config || {}) as AxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const url: string = original.url || '';

    // Don't try to refresh for auth endpoints themselves — that would loop.
    const isAuthEndpoint =
      url.includes('/auth/refresh') ||
      url.includes('/auth/login') ||
      url.includes('/auth/register');

    if (status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        const newToken = await getOrStartRefresh();
        original.headers = original.headers || {};
        (original.headers as any).Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        clearAuthAndRedirect();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);
