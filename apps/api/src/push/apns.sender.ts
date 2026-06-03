/**
 * Minimal APNs HTTP/2 sender using token-based auth (.p8 + key id + team id).
 *
 * We're not pulling in `apn` / `@parse/node-apn` because:
 *   - both are barely-maintained (last meaningful update years ago)
 *   - they wrap node's `http2` core anyway
 *   - we only need a one-shot "send alert to device token", no streaming,
 *     no feedback service, no certificate auth fallback
 *
 * The whole thing is ~80 lines of node http2 + jsonwebtoken (already a dep).
 *
 * Env vars:
 *   APNS_KEY            — full contents of the .p8 (with newlines, or with
 *                         literal "\n" — both accepted, see normalizeKey)
 *   APNS_KEY_ID         — 10-char key id from the Apple Developer portal
 *   APNS_TEAM_ID        — 10-char team id (Membership tab)
 *   APNS_BUNDLE_ID      — app bundle id, used as apns-topic (defaults com.fitai.app)
 *   APNS_PRODUCTION=1   — use api.push.apple.com instead of api.development.push.apple.com
 */
import { Logger } from '@nestjs/common';
import * as http2 from 'http2';
import * as jwt from 'jsonwebtoken';

const PROD_HOST = 'https://api.push.apple.com';
const DEV_HOST = 'https://api.development.push.apple.com';

const logger = new Logger('ApnsSender');

let cachedJwt: { token: string; iat: number } | null = null;
let sharedClient: http2.ClientHttp2Session | null = null;

export interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  production: boolean;
}

export function loadApnsConfig(): ApnsConfig | null {
  const key = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;
  return {
    key: normalizeKey(key),
    keyId,
    teamId,
    bundleId: process.env.APNS_BUNDLE_ID || 'com.fitai.app',
    production: process.env.APNS_PRODUCTION === '1',
  };
}

/** Env vars sometimes flatten the .p8 newlines into literal "\n". Restore them. */
function normalizeKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

/** APNs requires a fresh-ish JWT (Apple rejects > 60min old, recommends rotating < 50min). */
function getJwt(cfg: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.iat < 50 * 60) return cachedJwt.token;
  const token = jwt.sign({ iss: cfg.teamId, iat: now }, cfg.key, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: cfg.keyId },
  });
  cachedJwt = { token, iat: now };
  return token;
}

function getClient(cfg: ApnsConfig): http2.ClientHttp2Session {
  if (sharedClient && !sharedClient.closed && !sharedClient.destroyed) {
    return sharedClient;
  }
  const host = cfg.production ? PROD_HOST : DEV_HOST;
  sharedClient = http2.connect(host);
  sharedClient.on('error', (err) => logger.warn(`APNs h2 client error: ${err.message}`));
  sharedClient.on('close', () => {
    sharedClient = null;
  });
  return sharedClient;
}

export interface ApnsPayload {
  title: string;
  body: string;
  url?: string;
  badge?: number;
}

export interface ApnsResult {
  ok: boolean;
  status: number;
  reason?: string;
  /** True only when Apple says "this token is dead, stop using it" — caller deletes the row. */
  shouldDelete: boolean;
}

/** Single APNs send. Resolves with status + Apple's reason code on failure. */
export async function sendApns(
  cfg: ApnsConfig,
  deviceToken: string,
  payload: ApnsPayload,
): Promise<ApnsResult> {
  const client = getClient(cfg);
  const jwtToken = getJwt(cfg);

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
    },
    ...(payload.url ? { url: payload.url } : {}),
  });

  return new Promise<ApnsResult>((resolve) => {
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwtToken}`,
      'apns-topic': cfg.bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body).toString(),
    });

    let status = 0;
    let respBody = '';

    req.on('response', (headers) => {
      status = Number(headers[':status']) || 0;
    });
    req.setEncoding('utf8');
    req.on('data', (chunk) => (respBody += chunk));
    req.on('end', () => {
      let reason: string | undefined;
      if (respBody) {
        try {
          reason = JSON.parse(respBody)?.reason;
        } catch {
          // ignore
        }
      }
      // 410 = device-token is no longer valid (user uninstalled / logged out).
      // BadDeviceToken / Unregistered are the canonical "delete this row" reasons.
      const shouldDelete =
        status === 410 ||
        reason === 'BadDeviceToken' ||
        reason === 'Unregistered' ||
        reason === 'DeviceTokenNotForTopic';
      resolve({ ok: status === 200, status, reason, shouldDelete });
    });
    req.on('error', (err) => {
      logger.warn(`APNs request error: ${err.message}`);
      resolve({ ok: false, status: 0, reason: err.message, shouldDelete: false });
    });

    req.write(body);
    req.end();
  });
}
