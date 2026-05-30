/**
 * SWR fetcher tied to our axios instance so it picks up auth headers,
 * the refresh interceptor, and the global timeout. Use with `useSWR(key, fetcher)`.
 *
 * Convention: the SWR key is the API path (e.g. `/workouts/plan`). The fetcher
 * receives that key and routes through axios, so SWR's revalidate-on-focus
 * and cache work without us hand-rolling a query layer.
 */
import { api } from './api';

export const fetcher = async <T = any>(path: string): Promise<T> => {
  const { data } = await api.get(path);
  return data as T;
};

// Sensible defaults: revalidate on focus + reconnect (so the user sees fresh
// data when switching back from another tab), but do NOT poll — that wastes
// battery on mobile and the chat-driven regen flow already pushes updates
// via the PLAN_UPDATED event bus.
export const swrConfig = {
  fetcher,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  shouldRetryOnError: false,
  dedupingInterval: 5000,
};
