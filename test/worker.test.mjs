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
  '/hackathons.md': 'hackathons.md', '/experience.md': 'experience.md',
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

test('content pages negotiate Markdown', async () => {
  for (const p of ['/hackathons', '/hackathons/', '/experience', '/experience/']) {
    const r = await get(p, 'text/markdown');
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /^text\/markdown/, p);
    assert.match(await r.text(), /^# /, p);
  }
});

test('content pages are indexable: one h1, canonical, valid JSON-LD, sitemap, images exist', () => {
  for (const k of ['hackathons', 'experience']) {
    const page = read(`${k}/index.html`);
    assert.equal((page.match(/<h1[\s>]/g) || []).length, 1, `${k}: exactly one h1`);
    assert.ok(page.includes(`<link rel="canonical" href="https://arunsanjeev.dev/${k}/">`), `${k}: canonical`);

    // measure what search engines display, i.e. with entities decoded
    const decode = (s) => s.replace(/&(amp|quot|#x27|lt|gt);/g, (_, e) => ({ amp: '&', quot: '"', '#x27': "'", lt: '<', gt: '>' })[e]);
    const title = decode(page.match(/<title>(.*?)<\/title>/)[1]);
    const desc = decode(page.match(/<meta name="description" content="(.*?)">/)[1]);
    assert.ok(title.length >= 30 && title.length <= 60, `${k}: title length ${title.length}`);
    assert.ok(desc.length >= 120 && desc.length <= 160, `${k}: description length ${desc.length}`);

    const ld = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(ld['@context'], 'https://schema.org');
    const types = ld['@graph'].map((n) => n['@type']);
    assert.ok(types.includes('BreadcrumbList') && types.includes('ItemList'), `${k}: ${types}`);

    const text = page.split('<main>')[1].replace(/<nav[\s\S]*?<\/nav>/g, '').replace(/<[^>]+>/g, '');
    assert.ok(text.trim().length >= 1500, `${k} too short`);
    assert.ok(existsSync(new URL(`../${k}.md`, import.meta.url)));
    assert.ok(read('sitemap.xml').includes(`https://arunsanjeev.dev/${k}/`));

    for (const [, src] of page.matchAll(/<img src="\/([^"]+)"/g)) {
      assert.ok(existsSync(new URL(`../${src}`, import.meta.url)), `${k}: missing ${src}`);
    }
  }
});

test('llms.txt has when-to-use guidance', () => {
  const t = read('llms.txt');
  assert.match(t, /^## When to use this site/m);
  assert.match(t, /^## How agents should call this site/m);
});

// ---------- Skiddy Bot: POST /api/chat ----------

import { handleChat, toContents, systemPrompt, resetKnowledgeCache } from '../worker/chat.js';

const sse = (...events) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
const say = (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] });

const chatReq = (body, { origin = 'https://arunsanjeev.dev', type = 'application/json', method = 'POST' } = {}) =>
  new Request('https://arunsanjeev.dev/api/chat', {
    method,
    headers: { Origin: origin, 'Content-Type': type, 'CF-Connecting-IP': '203.0.113.7' },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
const ask = { messages: [{ role: 'user', text: 'Which hackathons has Arun won?' }] };
const env = { GEMINI_API_KEY: 'test-key', CHAT_MODELS: 'model-a,model-b' };

test('chat: routed from the main worker handler', async () => {
  const r = await handle(chatReq(ask, { method: 'GET' }), origin, env);
  assert.equal(r.status, 405);
});

test('chat: rejects foreign origins, non-JSON and missing key', async () => {
  assert.equal((await handleChat(chatReq(ask, { origin: 'https://evil.example' }), env, origin)).status, 403);
  assert.equal((await handleChat(chatReq(ask, { type: 'text/plain' }), env, origin)).status, 415);
  assert.equal((await handleChat(chatReq(ask), {}, origin)).status, 503);
  assert.equal((await handleChat(chatReq('{nope'), env, origin)).status, 400);
});

test('chat: validates and trims conversation history', () => {
  assert.ok(toContents({}).error);
  assert.ok(toContents({ messages: [{ role: 'system', text: 'x' }] }).error);
  assert.ok(toContents({ messages: [{ role: 'user', text: 'x'.repeat(601) }] }).error);
  assert.ok(toContents({ messages: [{ role: 'user', text: 'hi' }, { role: 'model', text: 'yo' }] }).error);
  const { contents } = toContents({
    messages: [{ role: 'model', text: 'greeting' }, { role: 'user', text: ' hi ' }],
  });
  assert.deepEqual(contents, [{ role: 'user', parts: [{ text: 'hi' }] }]);
  const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: `m${i}` }));
  long.push({ role: 'user', text: 'last' });
  const trimmed = toContents({ messages: long }).contents;
  assert.ok(trimmed.length <= 12 && trimmed[0].role === 'user' && trimmed.at(-1).parts[0].text === 'last');
});

test('chat: system prompt carries the persona and the site knowledge', () => {
  const p = systemPrompt('KNOWLEDGE-BLOCK');
  assert.match(p, /Skiddy Bot/);
  assert.match(p, /KNOWLEDGE-BLOCK/);
});

test('chat: streams Gemini text, skips thoughts, keeps the key server-side', async () => {
  resetKnowledgeCache();
  let sent;
  const gemini = async (url, init) => {
    sent = { url, init };
    return sse(
      { candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }] } }] },
      say('Arun won '),
      say('**HAIL 2026**.'),
    );
  };
  const r = await handleChat(chatReq(ask), env, origin, gemini);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/plain/);
  assert.equal(r.headers.get('x-skiddy-model'), 'model-a');
  assert.equal(await r.text(), 'Arun won **HAIL 2026**.');

  assert.match(sent.url, /\/models\/model-a:streamGenerateContent\?alt=sse$/);
  assert.equal(sent.init.headers['x-goog-api-key'], 'test-key');
  assert.ok(!sent.url.includes('test-key'), 'key must not be in the URL');
  const body = JSON.parse(sent.init.body);
  assert.match(body.systemInstruction.parts[0].text, /Skiddy Bot/);
  assert.match(body.systemInstruction.parts[0].text, /llms\.txt/); // knowledge loaded from the origin
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: ask.messages[0].text }] }]);
});

test('chat: falls back to the next model when one is overloaded', async () => {
  const calls = [];
  const gemini = async (url) => {
    calls.push(url);
    if (url.includes('model-a')) return new Response('{"error":{"code":503}}', { status: 503 });
    return sse(say('from b'));
  };
  const r = await handleChat(chatReq(ask), env, origin, gemini);
  assert.equal(r.headers.get('x-skiddy-model'), 'model-b');
  assert.equal(await r.text(), 'from b');
  assert.equal(calls.length, 2);
});

test('chat: falls back when the stream errors before any text', async () => {
  const gemini = async (url) =>
    url.includes('model-a') ? sse({ error: { code: 503, message: 'high demand' } }) : sse(say('ok'));
  const r = await handleChat(chatReq(ask), env, origin, gemini);
  assert.equal(await r.text(), 'ok');
});

test('chat: mid-stream error ends the reply with a glitch note', async () => {
  const gemini = async () => sse(say('Partial'), { error: { code: 503, message: 'high demand' } });
  const text = await (await handleChat(chatReq(ask), env, origin, gemini)).text();
  assert.match(text, /^Partial/);
  assert.match(text, /connection glitch/);
});

test('chat: all models down → 503 JSON; bad request upstream does not retry', async () => {
  let n = 0;
  const down = async () => { n++; return new Response('busy', { status: 429 }); };
  const r = await handleChat(chatReq(ask), env, origin, down);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /overloaded/);
  assert.equal(n, 2);

  n = 0;
  const bad = async () => { n++; return new Response('bad', { status: 400 }); };
  assert.equal((await handleChat(chatReq(ask), env, origin, bad)).status, 502);
  assert.equal(n, 1);
});

test('chat: rate limiter blocks when the binding says so', async () => {
  const limited = { ...env, CHAT_LIMITER: { limit: async ({ key }) => ({ success: key !== '203.0.113.7' }) } };
  const r = await handleChat(chatReq(ask), limited, origin, async () => sse(say('x')));
  assert.equal(r.status, 429);
});

test('widget: script is on every page and holds no secrets', () => {
  for (const p of ['index.html', 'about/index.html', 'contact/index.html', 'experience/index.html', 'hackathons/index.html', 'privacy/index.html', '404.html']) {
    assert.ok(read(p).includes('<script src="/assets/js/skiddy-bot.js" defer></script>'), p);
  }
  const js = read('assets/js/skiddy-bot.js');
  assert.ok(!/AIza|AQ\.[A-Za-z0-9_-]{20,}|x-goog-api-key|generativelanguage/.test(js), 'no Gemini key or direct API call in the browser');
  assert.ok(existsSync(new URL('../assets/images/skiddy-bot.svg', import.meta.url)));
  assert.ok(existsSync(new URL('../assets/css/skiddy-bot.css', import.meta.url)));
});
