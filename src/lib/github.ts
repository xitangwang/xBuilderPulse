const OWNER = 'BuilderPulse';
const REPO = 'BuilderPulse';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

export type Lang = 'en' | 'zh';

export interface ReportMeta {
  lang: Lang;
  year: string;
  date: string;
  slug: string;
  path: string;
  rawUrl: string;
  htmlUrl: string;
  size: number;
}

export interface Report extends ReportMeta {
  markdown: string;
  title: string;
  summary: string;
}

interface GhContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  download_url: string | null;
  html_url: string;
}

const headers: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'xBuilderPulse-reader',
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const jsonCache = new Map<string, Promise<unknown>>();
const textCache = new Map<string, Promise<string>>();

async function ghJson<T>(url: string): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached) return cached as Promise<T>;
  const p = (async () => {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      jsonCache.delete(url);
      throw new Error(`GitHub API ${res.status}: ${url}`);
    }
    return res.json();
  })();
  jsonCache.set(url, p);
  return p as Promise<T>;
}

async function rawText(url: string): Promise<string> {
  const cached = textCache.get(url);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      textCache.delete(url);
      throw new Error(`Fetch ${res.status}: ${url}`);
    }
    return res.text();
  })();
  textCache.set(url, p);
  return p;
}

async function listDir(path: string): Promise<GhContent[]> {
  return ghJson<GhContent[]>(`${API}/contents/${path}?ref=${BRANCH}`);
}

export async function listReports(lang: Lang): Promise<ReportMeta[]> {
  const years = (await listDir(lang)).filter((x) => x.type === 'dir');
  const metas: ReportMeta[] = [];
  for (const year of years) {
    const files = (await listDir(`${lang}/${year.name}`)).filter(
      (x) => x.type === 'file' && x.name.endsWith('.md'),
    );
    for (const f of files) {
      const date = f.name.replace(/\.md$/, '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      metas.push({
        lang,
        year: year.name,
        date,
        slug: date,
        path: f.path,
        rawUrl: `${RAW}/${f.path}`,
        htmlUrl: f.html_url,
        size: f.size,
      });
    }
  }
  metas.sort((a, b) => b.date.localeCompare(a.date));
  return metas;
}

export async function listAllReports(): Promise<ReportMeta[]> {
  const [en, zh] = await Promise.all([listReports('en'), listReports('zh')]);
  return [...en, ...zh];
}

export async function fetchReport(meta: ReportMeta): Promise<Report> {
  const markdown = await rawText(meta.rawUrl);
  const { title, summary } = extractTitleAndSummary(markdown, meta);
  return { ...meta, markdown, title, summary };
}

function extractTitleAndSummary(
  md: string,
  meta: ReportMeta,
): { title: string; summary: string } {
  const lines = md.split('\n');
  let title = '';
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      title = m[1]!.replace(/^BuilderPulse Daily\s*[—-]\s*/i, '').trim();
      break;
    }
  }
  if (!title) title = meta.date;

  // Extract the first blockquote as summary (Today's top 3, 今日要点 etc.)
  const blockquote: string[] = [];
  let inQuote = false;
  for (const line of lines) {
    if (line.startsWith('>')) {
      inQuote = true;
      blockquote.push(line.replace(/^>\s?/, ''));
    } else if (inQuote && line.trim() === '') {
      if (blockquote.length > 0) break;
    } else if (inQuote) {
      break;
    }
  }
  const summary = blockquote.join('\n').trim();

  return { title, summary };
}

export async function getLatestCommitSha(): Promise<string> {
  const data = await ghJson<Array<{ sha: string }>>(
    `${API}/commits?sha=${BRANCH}&per_page=1`,
  );
  return data[0]?.sha ?? '';
}
