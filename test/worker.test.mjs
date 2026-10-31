import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { handle, prefersMarkdown } from '../worker/index.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// Fake GitHub Pages origin backed by the repo files.
const files = {
  '/': 'index.html', '/about/': 'about/index.html', '/llms.txt': 'llms.txt',
  '/index.md': 'index.md', '/404.md': '404.md', '/about.md': 'about.md',
  '/contact.md': 'contact.md', '/privacy.md': 'privacy.md',
};
const origin = async (req) => {
  const p = new URL(req.url).pathname;
  if (files[p]) {
    const type = p.endsWith('.md') ? 'text/markdown' : p.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8';
    return new Response(read(files[p]), { headers: { 'Content-Type': type, Vary: 'Accept-Encoding' } });
  }
  return new Response(read('404.html'), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
const get = (path, accept) =>
  handle(new Request(`https://arunsanjeev.dev${path}`, { headers: accept ? { Accept: accept } : {} }), origin);

test('prefersMarkdown honours q-values', () => {
  assert.equal(prefersMarkdown('text/markdown'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.5'), true);
  assert.equal(prefersMarkdown('text/html'), false);
  assert.equal(prefersMarkdown('text/html, text/markdown;q=0.5'), false);
  assert.equal(prefersMarkdown('*/*'), false);
  assert.equal(prefersMarkdown(null), false);
});

test('homepage: Markdown for text/markdown with Vary: Accept', async () => {
  const r = await get('/', 'text/markdown');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/markdown/);
  assert.match(r.headers.get('vary'), /Accept/i);
  assert.match(await r.text(), /^# M S Arun Sanjeev/);
});

test('homepage: HTML for text/html and default, with Vary: Accept', async () => {
  for (const a of ['text/html', undefined]) {
    const r = await get('/', a);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(r.headers.get('vary'), /Accept(,|$)/);
    assert.match(await r.text(), /<!DOCTYPE html>/i);
  }
});

test('trust pages negotiate Markdown', async () => {
  for (const p of ['/about', '/about/', '/contact', '/privacy/']) {
    const r = await get(p, 'text/markdown');
    assert.match(r.headers.get('content-type'), /^text\/markdown/, p);
  }
});

test('404: status kept, Markdown body when requested', async () => {
  const r = await get('/does-not-exist', 'text/markdown');
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /^text\/markdown/);
  assert.match(r.headers.get('vary'), /Accept/i);
  const body = await r.text();
  assert.ok(body.length > 20);
  assert.match(body, /llms\.txt/);
});

test('404: HTML remains for browsers', async () => {
  const r = await get('/does-not-exist', 'text/html');
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /text\/html/);
});

test('static assets are untouched', async () => {
  const r = await get('/llms.txt', 'text/markdown');
  assert.match(r.headers.get('content-type'), /text\/plain/);
});

test('trust pages have >=500 characters and are in the sitemap', () => {
  for (const k of ['about', 'contact', 'privacy']) {
    const text = read(`${k}/index.html`).split('<article')[1].split('<nav')[0].replace(/<[^>]+>/g, '');
    assert.ok(text.trim().length >= 500, `${k} too short: ${text.trim().length}`);
    assert.ok(existsSync(new URL(`../${k}.md`, import.meta.url)));
    assert.ok(read('sitemap.xml').includes(`https://arunsanjeev.dev/${k}/`));
  }
});

test('llms.txt has when-to-use guidance', () => {
  const t = read('llms.txt');
  assert.match(t, /^## When to use this site/m);
  assert.match(t, /^## How agents should call this site/m);
});
