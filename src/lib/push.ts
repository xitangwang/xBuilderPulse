import webpush from 'web-push';
import {
  deleteSubscription,
  listSubscriptions,
  type StoredSubscription,
} from './kv';

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  if (!pub || !priv) throw new Error('VAPID keys not configured');
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export async function sendOne(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<{ ok: boolean; statusCode?: number; removed?: boolean }> {
  configure();
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 },
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (err: unknown) {
    const code = (err as { statusCode?: number }).statusCode;
    // 404/410 means the subscription is gone — purge it.
    if (code === 404 || code === 410) {
      await deleteSubscription(sub.endpoint);
      return { ok: false, statusCode: code, removed: true };
    }
    return { ok: false, statusCode: code };
  }
}

export async function fanout(payloadFor: (sub: StoredSubscription) => PushPayload) {
  const subs = await listSubscriptions();
  let sent = 0;
  let failed = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      const r = await sendOne(s, payloadFor(s));
      if (r.ok) sent++;
      else {
        failed++;
        if (r.removed) removed++;
      }
    }),
  );
  return { total: subs.length, sent, failed, removed };
}
