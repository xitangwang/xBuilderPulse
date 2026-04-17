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
              sub.lang === 'zh' ? 'BuilderPulse · 新日报' : 'BuilderPulse · New report',
            body:
              sub.lang === 'zh'
                ? '今日报告已上新，点击查看'
                : 'Today\u2019s report is live — tap to read.',
            url: `/${sub.lang}`,
          };
        }
        return {
          title: `BuilderPulse \u00b7 ${formatDate(sub.lang, meta.date)}`,
          body: buildPushBody(report.summary, 180),
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

function formatDate(lang: 'en' | 'zh', iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (lang === 'zh') {
    return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Clean markdown → plain text, extract lead item, truncate at sentence boundary. */
function buildPushBody(summary: string, maxLen: number): string {
  const plain = summary
    // Strip leading "**Today's top 3:**" / "**今日要点：**" style labels.
    .replace(/^\*\*[^*\n]+\*\*\s*:?\s*/m, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If the summary starts with a numbered list, keep only item 1 — it's the lead.
  const lead = (() => {
    const numbered = plain.match(/^\s*1\.\s*(.+?)(?=\s+\d+\.\s|$)/s);
    if (numbered && numbered[1]) return numbered[1].trim();
    return plain;
  })();

  return truncateAtSentence(lead, maxLen);
}

function truncateAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  // Scan for the last sentence terminator (en + zh) followed by space or end.
  const re = /[.!?。！？]["'\u201D\u2019\])]?(?=\s|$)/g;
  let lastIdx = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx > max * 0.5) return slice.slice(0, lastIdx).trim();
  // Fall back to a word boundary (en) — safe because zh has no spaces to break on.
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > max * 0.5) return slice.slice(0, lastSpace).trim() + '…';
  return slice.trim() + '…';
}
