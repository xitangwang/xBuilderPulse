import type { APIRoute } from 'astro';
import { saveSubscription, kvEnabled } from '../../lib/kv';

export const prerender = false;

interface Body {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  lang?: 'en' | 'zh';
}

export const POST: APIRoute = async ({ request }) => {
  if (!kvEnabled()) {
    return json({ ok: false, error: 'kv-not-configured' }, 503);
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400);
  }

  const sub = body?.subscription;
  if (
    !sub ||
    typeof sub.endpoint !== 'string' ||
    !sub.keys?.p256dh ||
    !sub.keys?.auth
  ) {
    return json({ ok: false, error: 'bad-subscription' }, 400);
  }

  const lang: 'en' | 'zh' = body.lang === 'zh' ? 'zh' : 'en';
  await saveSubscription({
    endpoint: sub.endpoint,
    keys: sub.keys,
    lang,
    createdAt: Date.now(),
  });

  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
