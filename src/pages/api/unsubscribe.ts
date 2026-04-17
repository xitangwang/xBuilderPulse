import type { APIRoute } from 'astro';
import { deleteSubscription, kvEnabled } from '../../lib/kv';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!kvEnabled()) {
    return json({ ok: false, error: 'kv-not-configured' }, 503);
  }
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400);
  }
  if (!body?.endpoint || typeof body.endpoint !== 'string') {
    return json({ ok: false, error: 'bad-endpoint' }, 400);
  }
  await deleteSubscription(body.endpoint);
  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
