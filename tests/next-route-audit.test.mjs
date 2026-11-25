import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pagesDir = path.join(root, 'legacy-pages');
const publicDir = path.join(root, 'public');
const pages = readdirSync(pagesDir).filter((name) => name.endsWith('.html')).sort();
assert.equal(pages.length, 25, 'all 25 original website pages must be included');

for (const pageName of pages) {
  const source = readFileSync(path.join(pagesDir, pageName), 'utf8');
  assert.match(source, /<body\b[\s\S]*?<\/body\s*>/i, `${pageName} must contain a body`);
  for (const href of source.matchAll(/<link\b[^>]*href=["']([^"']+)["']/gi)) {
    const value = href[1];
    if (/^(?:https?:)?\/\//i.test(value) || value.startsWith('data:')) continue;
    assert.ok(existsSync(path.join(publicDir, value.split('?')[0].replace(/^\.\//, '').replace(/^\//, ''))), `${pageName}: missing stylesheet/head asset ${value}`);
  }
  for (const src of source.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)) {
    const value = src[1];
    if (/^(?:https?:)?\/\//i.test(value) || value.startsWith('data:')) continue;
    assert.ok(existsSync(path.join(publicDir, value.split('?')[0].replace(/^\.\//, '').replace(/^\//, ''))), `${pageName}: missing script ${value}`);
  }
}

const route = readFileSync(path.join(root, 'app', '[[...slug]]', 'page.tsx'), 'utf8');
assert.match(route, /generateStaticParams/);
assert.match(route, /getLegacyPageData/);
assert.match(route, /page\.styles\.map/, 'inline head styles from original pages must be preserved');
const config = readFileSync(path.join(root, 'next.config.ts'), 'utf8');
assert.match(config, /output: 'export'/, 'GitHub Pages deployment needs a static export');
const bootstrap = readFileSync(path.join(publicDir, 'account-bootstrap.js'), 'utf8');
assert.match(bootstrap, /clearQuestionProgressOnReload/, 'reload must clear SQL solved state');
console.log(`Next route audit passed: ${pages.length} pages and every referenced local CSS/JS asset are present.`);
