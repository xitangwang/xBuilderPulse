import type { APIRoute } from 'astro';
import { listReports, fetchReport, getLatestCommitSha } from '../../../lib/github';
import { getLastSha, setLastSha, kvEnabled } from '../../../lib/kv';
import { fanout } from '../../../lib/push';

export const prerender = false;
export const config = { maxDuration: 60 };

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const forceRebuild = url.searchParams.get('force') === '1';

  const result: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
  };

  try {
    const latestSha = await getLatestCommitSha();
    const lastSha = await getLastSha();
    result.latestSha = latestSha;
    result.lastSha = lastSha;

    const isNew = forceRebuild || latestSha !== lastSha;
    if (!isNew) {
      result.action = 'skipped';
      return json(result);
    }

    // Trigger rebuild (fire and forget — deploy happens in parallel with fanout).
    const hook = process.env.DEPLOY_HOOK_URL;
    if (hook) {
      try {
        const res = await fetch(hook, { method: 'POST' });
        result.rebuildTriggered = res.ok;
        result.rebuildStatus = res.status;
      } catch (e) {
        result.rebuildError = (e as Error).message;
      }
    } else {
      result.rebuildTriggered = false;
      result.rebuildSkipReason = 'DEPLOY_HOOK_URL not set';
    }

    // Fanout push with the latest report metadata for each language.
    if (kvEnabled() && process.env.PUBLIC_VAPID_PUBLIC_KEY) {
      const [enLatest, zhLatest] = await Promise.all([
        listReports('en').then((r) => r[0] ?? null),
        listReports('zh').then((r) => r[0] ?? null),
      ]);

      const [enReport, zhReport] = await Promise.all([
        enLatest ? fetchReport(enLatest).catch(() => null) : null,
        zhLatest ? fetchReport(zhLatest).catch(() => null) : null,
      ]);

      const stats = await fanout((sub) => {
        const report = sub.lang === 'zh' ? zhReport : enReport;
        const meta = sub.lang === 'zh' ? zhLatest : enLatest;
        if (!report || !meta) {
          return {
            title:
              sub.lang === 'zh' ? 'BuilderPulse 每日' : 'BuilderPulse Daily',
            body:
              sub.lang === 'zh' ? '今日报告已更新' : 'A new report is out',
            url: `/${sub.lang}`,
          };
        }
        const titlePrefix =
          sub.lang === 'zh' ? 'BuilderPulse ' : 'BuilderPulse · ';
        const body = report.summary
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        return {
          title: `${titlePrefix}${meta.date}`,
          body,
          url: `/${meta.lang}/${meta.year}/${meta.slug}`,
          tag: `bp-${meta.lang}-${meta.date}`,
        };
      });
      result.push = stats;
    } else {
      result.pushSkipReason = kvEnabled()
        ? 'VAPID not configured'
        : 'Upstash not configured';
    }

    await setLastSha(latestSha);
    result.action = 'fired';
    return json(result);
  } catch (e) {
    result.error = (e as Error).message;
    return json(result, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
