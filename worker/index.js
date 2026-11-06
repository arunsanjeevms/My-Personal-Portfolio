// Cloudflare Worker for arunsanjeev.dev (GitHub Pages origin).
// Adds Markdown content negotiation (Accept: text/markdown), Markdown 404s,
// and the Skiddy Bot chat API at POST /api/chat (see chat.js).
// Deploy with `npx wrangler deploy` (see wrangler.toml); route arunsanjeev.dev/*.

import { handleChat } from './chat.js';

const MARKDOWN_PAGES = {
  '/': '/index.md',
  '/about': '/about.md',
  '/hackathons': '/hackathons.md',
  '/experience': '/experience.md',
  '/contact': '/contact.md',
  '/privacy': '/privacy.md',
};

// True when the client prefers text/markdown over text/html (q-values honoured).
export function prefersMarkdown(accept) {
  if (!accept) return false;
  let md = 0;
  let html = 0;
  for (const part of accept.split(',')) {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const weight = q ? Number(q.slice(2)) : 1;
    if (Number.isNaN(weight)) continue;
    if (type === 'text/markdown') md = Math.max(md, weight);
    else if (type === 'text/html') html = Math.max(html, weight);
  }
  return md > 0 && md >= html;
}

function normalise(pathname) {
  return pathname.replace(/\/index\.html$/, '/').replace(/(.)\/+$/, '$1') || '/';
}

function withVary(response) {
  const out = new Response(response.body, response);
  const vary = out.headers.get('Vary');
  if (!vary) out.headers.set('Vary', 'Accept');
  else if (!/(^|,\s*)(accept|\*)\s*(,|$)/i.test(vary)) out.headers.set('Vary', `${vary}, Accept`);
  return out;
}

function markdownResponse(origin, status) {
  return new Response(origin.body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Vary': 'Accept',
      'Cache-Control': 'public, max-age=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function handle(request, fetchOrigin = fetch, env = {}) {
  const url = new URL(request.url);
  if (url.pathname === '/api/chat') return handleChat(request, env, fetchOrigin);

  const wantsMarkdown =
    (request.method === 'GET' || request.method === 'HEAD') && prefersMarkdown(request.headers.get('Accept'));
  // Files with an extension (css, js, images, llms.txt, ...) are never negotiated.
  const isAsset = /\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.endsWith('/index.html');

  if (wantsMarkdown && !isAsset) {
    const mdPath = MARKDOWN_PAGES[normalise(url.pathname)];
    if (mdPath) {
      const md = await fetchOrigin(new Request(new URL(mdPath, url), { method: 'GET' }));
      if (md.ok) return markdownResponse(md, 200);
    } else {
      // Unknown path: let the origin decide; answer in Markdown only for a 404.
      const res = await fetchOrigin(request);
      if (res.status !== 404) return withVary(res);
      const md = await fetchOrigin(new Request(new URL('/404.md', url), { method: 'GET' }));
      return md.ok ? markdownResponse(md, 404) : withVary(res);
    }
  }

  const res = await fetchOrigin(request);
  return isAsset ? res : withVary(res);
}

export default {
  fetch: (request, env) => handle(request, fetch, env),
};
