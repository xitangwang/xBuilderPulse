import { Marked } from 'marked';
import markedShiki from 'marked-shiki';
import { createHighlighter } from 'shiki';

let markedInstance: Marked | null = null;

async function getMarked(): Promise<Marked> {
  if (markedInstance) return markedInstance;

  const highlighter = await createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs: [
      'javascript',
      'typescript',
      'tsx',
      'jsx',
      'python',
      'bash',
      'shell',
      'json',
      'yaml',
      'markdown',
      'html',
      'css',
      'sql',
      'go',
      'rust',
    ],
  });

  const m = new Marked({
    gfm: true,
    breaks: false,
  });

  m.use(
    markedShiki({
      highlight(code, lang) {
        const resolved = highlighter.getLoadedLanguages().includes(lang as never)
          ? lang
          : 'text';
        return highlighter.codeToHtml(code, {
          lang: resolved,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        });
      },
    }),
  );

  // Add ids to headings for TOC anchors.
  m.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = tokens
          .map((t) => ('raw' in t ? (t as { raw: string }).raw : ''))
          .join('');
        const id = slugify(plain);
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${title}"` : '';
        const isExternal = /^https?:\/\//.test(href);
        const rel = isExternal ? ' rel="noopener noreferrer" target="_blank"' : '';
        return `<a href="${href}"${titleAttr}${rel}>${text}</a>`;
      },
    },
  });

  markedInstance = m;
  return m;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export async function renderMarkdown(md: string): Promise<string> {
  const m = await getMarked();
  return m.parse(md) as Promise<string>;
}

export interface TocItem {
  depth: number;
  text: string;
  id: string;
}

export function extractToc(md: string): TocItem[] {
  const toc: TocItem[] = [];
  const lines = md.split('\n');
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const depth = m[1]!.length;
    const text = m[2]!.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    toc.push({ depth, text, id: slugify(text) });
  }
  return toc;
}
