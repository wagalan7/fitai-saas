import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Attach access token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('fitai-auth');
    if (stored) {
      const { state } = JSON.parse(stored);
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    }
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
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const stored = JSON.parse(localStorage.getItem('fitai-auth') || '{}');
        stored.state = { ...stored.state, token: data.accessToken };
        localStorage.setItem('fitai-auth', JSON.stringify(stored));
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
