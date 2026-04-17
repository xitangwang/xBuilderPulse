import { Redis } from '@upstash/redis';

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  lang: 'en' | 'zh';
  createdAt: number;
}

const HAS_REDIS =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis: Redis | null = HAS_REDIS
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export const kvEnabled = () => redis !== null;

const SUBS_KEY = 'bp:subs';
const SHA_KEY = 'bp:last-sha';

function endpointId(endpoint: string): string {
  // Stable hash for use as a Redis hash field key.
  let h = 0;
  for (let i = 0; i < endpoint.length; i++) {
    h = (h * 31 + endpoint.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36) + '-' + endpoint.length.toString(36);
}

export async function saveSubscription(s: StoredSubscription): Promise<void> {
  if (!redis) throw new Error('Upstash not configured');
  await redis.hset(SUBS_KEY, { [endpointId(s.endpoint)]: JSON.stringify(s) });
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  if (!redis) throw new Error('Upstash not configured');
  await redis.hdel(SUBS_KEY, endpointId(endpoint));
}

export async function listSubscriptions(): Promise<StoredSubscription[]> {
  if (!redis) return [];
  const raw = (await redis.hgetall(SUBS_KEY)) as Record<string, unknown> | null;
  if (!raw) return [];
  const out: StoredSubscription[] = [];
  for (const v of Object.values(raw)) {
    try {
      out.push(typeof v === 'string' ? JSON.parse(v) : (v as StoredSubscription));
    } catch {
      /* ignore malformed entries */
    }
  }
  return out;
}

export async function getLastSha(): Promise<string | null> {
  if (!redis) return null;
  const v = await redis.get<string>(SHA_KEY);
  return v ?? null;
}

export async function setLastSha(sha: string): Promise<void> {
  if (!redis) return;
  await redis.set(SHA_KEY, sha);
}
