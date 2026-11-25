import fs from 'node:fs';
import path from 'node:path';

export type LegacyAttributeMap = Record<string, string>;
export type LegacyScript = {
  attributes: LegacyAttributeMap;
  content: string;
};
export type LegacyLink = LegacyAttributeMap;
export type LegacyPageData = {
  fileName: string;
  title: string;
  description: string;
  bodyAttributes: LegacyAttributeMap;
  bodyHtml: string;
  links: LegacyLink[];
  styles: string[];
  scripts: LegacyScript[];
};

const pagesDirectory = path.join(process.cwd(), 'legacy-pages');

function parseAttributes(source: string): LegacyAttributeMap {
  const attrs: LegacyAttributeMap = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = value;
  }
  return attrs;
}

export function getLegacyPageNames(): string[] {
  return fs.readdirSync(pagesDirectory)
    .filter((name) => name.endsWith('.html'))
    .sort();
}

function normalizePageName(slug?: string[]): string {
  if (!slug || slug.length === 0) return 'index.html';
  if (slug.length !== 1) return '';
  const name = slug[0];
  if (!/^[a-z0-9-]+\.html$/i.test(name)) return '';
  return name;
}

export function getLegacyPageData(slug?: string[]): LegacyPageData | null {
  const fileName = normalizePageName(slug);
  if (!fileName || !getLegacyPageNames().includes(fileName)) return null;

  const raw = fs.readFileSync(path.join(pagesDirectory, fileName), 'utf8');
  const head = raw.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? '';
  const bodyMatch = raw.match(/<body\b([^>]*)>([\s\S]*?)<\/body\s*>/i);
  const bodyAttributes = parseAttributes(bodyMatch?.[1] ?? '');
  let bodyHtml = bodyMatch?.[2] ?? raw;

  const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.trim() ?? 'CodeBolt';
  const description = head.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1]
    ?? 'CodeBolt interactive SQL and Python learning platform.';

  const links = [...head.matchAll(/<link\b([^>]*)\/?\s*>/gi)]
    .map((match) => parseAttributes(match[1]))
    .filter((attrs) => Boolean(attrs.href));
  const styles = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
    .map((match) => match[1]);

  const scripts: LegacyScript[] = [...raw.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => ({ attributes: parseAttributes(match[1]), content: match[2] }));

  // Scripts are re-created by the client runtime after the body markup mounts.
  bodyHtml = bodyHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');

  return { fileName, title, description, bodyAttributes, bodyHtml, links, styles, scripts };
}
