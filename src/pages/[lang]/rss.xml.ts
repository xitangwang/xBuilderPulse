import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { listReports, fetchReport, type Lang } from '../../lib/github';

export async function getStaticPaths() {
  return [{ params: { lang: 'en' } }, { params: { lang: 'zh' } }];
}

export async function GET(context: APIContext) {
  const lang = context.params.lang as Lang;
  const metas = (await listReports(lang)).slice(0, 30);

  const items = await Promise.all(
    metas.map(async (m) => {
      let title = m.date;
      let description = '';
      try {
        const r = await fetchReport(m);
        title = r.title ? `${m.date} · ${r.title}` : m.date;
        description = r.summary
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500);
      } catch {
        // keep defaults on fetch failure
      }
      return {
        title,
        link: `/${lang}/${m.year}/${m.slug}`,
        pubDate: new Date(m.date + 'T00:00:00Z'),
        description,
      };
    }),
  );

  return rss({
    title:
      lang === 'zh'
        ? 'BuilderPulse 每日 · 阅读器'
        : 'BuilderPulse Daily · Reader',
    description:
      lang === 'zh'
        ? '每日聚合 Hacker News、GitHub、Product Hunt、HuggingFace、Google Trends、Reddit 的构建机会。'
        : 'Daily signals and 2-hour build ideas from Hacker News, GitHub, Product Hunt, HuggingFace, Google Trends, and Reddit.',
    site: context.site ?? 'https://xbuilderpulse.vercel.app',
    items,
    customData: `<language>${lang === 'zh' ? 'zh-CN' : 'en'}</language>`,
  });
}
