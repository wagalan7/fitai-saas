import { api } from './api';

/** Convert URL-safe base64 to Uint8Array (required by PushManager) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getNotificationStatus(): Promise<
  'unsupported' | 'denied' | 'granted' | 'default' | 'unsubscribed'
> {
  if (!isSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'default';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js').catch(() => null);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub ? 'granted' : 'unsubscribed';
}

/** Register the SW, ask for permission, subscribe and persist on the backend. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };

  // Fetch VAPID public key
  let publicKey: string | null = null;
  try {
    const { data } = await api.get('/push/public-key');
    if (!data?.enabled || !data?.publicKey) return { ok: false, reason: 'disabled' };
    publicKey = data.publicKey;
  } catch {
    return { ok: false, reason: 'network' };
  }

  // Permission
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };

  // Register SW
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // Subscribe
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey!) as BufferSource,
    });
  }

  // Send to backend
  const json = sub.toJSON();
  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
  });

  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!isSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await api.delete('/push/subscribe', { data: { endpoint } }).catch(() => {});
  }
}
