/*-----------------------------------*\
  Skiddy Bot: portfolio chat widget.
  Talks to POST /api/chat on the Cloudflare Worker, which holds the Gemini key.
  No API key or secret ever lives in this file.
\*-----------------------------------*/

(() => {
  'use strict';
  if (window.__skiddyBot) return;
  window.__skiddyBot = true;

  const here = document.currentScript ? document.currentScript.src : location.href;
  const asset = (path) => new URL(path, here).href;

  const ENDPOINT = window.SKIDDY_BOT_ENDPOINT || '/api/chat';
  const LOGO = asset('../images/skiddy-bot.svg');
  const STORE = 'skiddy-bot:v1';
  const MAX_CHARS = 600;
  const MAX_HISTORY = 12;
  const GREETING =
    "Access granted. 👾 I'm **Skiddy Bot**, Arun's portfolio assistant. Ask me about his projects, hackathon wins, experience, or how to get in touch.";
  const SUGGESTIONS = ['Who is Arun?', 'Show me his top projects', 'Which hackathons has he won?', 'How can I hire him?'];

  const ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4l-.01 6.7L15 12 3.39 13.9z"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  };

  /* ---------- styles ---------- */

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = asset('../css/skiddy-bot.css');
  document.head.appendChild(css);

  /* ---------- state (kept per tab so it survives page navigation) ---------- */

  const load = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE));
      if (s && Array.isArray(s.messages)) return s;
    } catch { /* ignore */ }
    return { messages: [], open: false, tipShown: false };
  };
  const state = load();
  const save = () => {
    try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  };
  let busy = false;

  /* ---------- tiny, safe Markdown renderer (escapes all HTML) ---------- */

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const link = (url, label) => {
    const internal = /^https:\/\/(www\.)?arunsanjeev\.dev(\/|$)/i.test(url) || url.startsWith('mailto:');
    return `<a href="${esc(url)}"${internal ? '' : ' target="_blank" rel="noopener noreferrer"'}>${label}</a>`;
  };

  const emphasis = (s) =>
    esc(s)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s).,!?:;])/g, '$1<em>$2</em>');

  const TOKENS = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|`([^`\n]+)`/g;

  const inline = (s) => {
    s = s.replace(/\*\*\[([^\]\n]+)\]\(([^)\s]+)\)\*\*/g, '[**$1**]($2)'); // **[x](u)** → [**x**](u)
    let out = '';
    let last = 0;
    TOKENS.lastIndex = 0;
    for (let m; (m = TOKENS.exec(s)); ) {
      out += emphasis(s.slice(last, m.index));
      if (m[1]) out += link(m[2], emphasis(m[1]));
      else if (m[3]) out += link(m[3], esc(m[3]));
      else if (m[4]) out += link(`mailto:${m[4]}`, esc(m[4]));
      else out += `<code>${esc(m[5])}</code>`;
      last = TOKENS.lastIndex;
    }
    return out + emphasis(s.slice(last));
  };

  const markdown = (src) => {
    let html = '';
    let list = null;
    let para = [];
    const flush = () => {
      if (para.length) html += `<p>${para.map(inline).join('<br>')}</p>`;
      para = [];
    };
    const close = () => {
      if (list) html += `</${list}>`;
      list = null;
    };
    for (const line of src.replace(/\r/g, '').split('\n')) {
      const item = line.match(/^\s*(?:([-*•])|\d+[.)])\s+(.*)$/);
      if (item) {
        flush();
        const tag = item[1] ? 'ul' : 'ol';
        if (list !== tag) { close(); html += `<${tag}>`; list = tag; }
        html += `<li>${inline(item[2])}</li>`;
      } else if (!line.trim()) {
        flush();
        close();
      } else {
        close();
        para.push(line.replace(/^#{1,6}\s+/, ''));
      }
    }
    flush();
    close();
    return html;
  };

  /* ---------- DOM ---------- */

  const root = document.createElement('div');
  root.className = 'sb-root';
  root.innerHTML = `
    <div class="sb-panel" id="sb-panel" role="dialog" aria-label="Skiddy Bot chat" aria-hidden="true">
      <header class="sb-header">
        <div class="sb-avatar"><img src="${LOGO}" alt="" width="30" height="30"></div>
        <div class="sb-title">
          <h2>Skiddy Bot</h2>
          <p class="sb-status">Online · Arun's AI assistant</p>
        </div>
        <button class="sb-icon-btn" type="button" data-sb-reset title="New chat" aria-label="Start a new chat">${ICONS.reset}</button>
        <button class="sb-icon-btn" type="button" data-sb-close title="Close" aria-label="Close chat">${ICONS.close}</button>
      </header>
      <div class="sb-log" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="sb-chips"></div>
      <form class="sb-form" novalidate>
        <label class="sb-sr" for="sb-input">Message Skiddy Bot</label>
        <textarea class="sb-input" id="sb-input" rows="1" maxlength="${MAX_CHARS}" placeholder="Ask about Arun…" autocomplete="off"></textarea>
        <button class="sb-send" type="submit" aria-label="Send message" disabled>${ICONS.send}</button>
      </form>
      <p class="sb-footnote">AI answers can be wrong · Powered by Gemini · <a href="/privacy/">Privacy</a></p>
    </div>
    <span class="sb-tip" aria-hidden="true">Ask Skiddy Bot about Arun 👾</span>
    <button class="sb-launcher" type="button" aria-controls="sb-panel" aria-expanded="false" aria-label="Open Skiddy Bot chat">
      <img src="${LOGO}" alt="" width="40" height="40">
      <span class="sb-close-icon">${ICONS.close}</span>
    </button>`;

  const $ = (sel) => root.querySelector(sel);
  const panel = $('.sb-panel');
  const log = $('.sb-log');
  const chips = $('.sb-chips');
  const form = $('.sb-form');
  const input = $('.sb-input');
  const sendBtn = $('.sb-send');
  const launcher = $('.sb-launcher');
  const tip = $('.sb-tip');

  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const toBottom = () => { log.scrollTop = log.scrollHeight; };

  const bubble = (role, text, isError) => {
    const el = document.createElement('div');
    el.className = `sb-msg ${role === 'user' ? 'sb-user' : 'sb-bot'}${isError ? ' sb-error' : ''}`;
    if (role === 'user') el.textContent = text;
    else el.innerHTML = markdown(text);
    log.appendChild(el);
    return el;
  };

  const renderChips = () => {
    chips.textContent = '';
    if (state.messages.length) return;
    for (const q of SUGGESTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-chip';
      b.textContent = q;
      b.addEventListener('click', () => send(q));
      chips.appendChild(b);
    }
  };

  const renderAll = () => {
    log.textContent = '';
    bubble('model', GREETING);
    for (const m of state.messages) bubble(m.role, m.text, m.error);
    renderChips();
    toBottom();
  };

  const updateSend = () => {
    sendBtn.disabled = busy || !input.value.trim();
  };

  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
  };

  const setOpen = (open, { focus = true } = {}) => {
    state.open = open;
    save();
    root.classList.toggle('sb-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute('aria-label', open ? 'Close Skiddy Bot chat' : 'Open Skiddy Bot chat');
    tip.classList.remove('sb-show');
    if (open) {
      toBottom();
      if (focus) setTimeout(() => input.focus({ preventScroll: true }), 60);
    } else if (focus) {
      launcher.focus({ preventScroll: true });
    }
  };

  /* ---------- talking to the Worker ---------- */

  const history = () =>
    state.messages
      .filter((m) => !m.error && !m.failed)
      .slice(-MAX_HISTORY)
      .map(({ role, text }) => ({ role, text }));

  async function send(raw) {
    const text = String(raw || '').trim().slice(0, MAX_CHARS);
    if (!text || busy) return;
    busy = true;
    input.value = '';
    grow();
    updateSend();

    const userMsg = { role: 'user', text };
    state.messages.push(userMsg);
    save();
    renderChips();
    bubble('user', text);

    const out = bubble('model', '');
    out.innerHTML = '<span class="sb-typing" aria-label="Skiddy Bot is typing"><span></span><span></span><span></span></span>';
    out.setAttribute('aria-busy', 'true');
    toBottom();

    let reply = '';
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history() }),
      });
      if (!res.ok || !res.body) {
        let msg = 'Skiddy Bot is offline right now. Please try again later.';
        try {
          const data = await res.json();
          if (data && data.error) msg = data.error;
        } catch { /* not JSON */ }
        throw new Error(msg);
      }

      out.classList.add('sb-cursor');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        reply += dec.decode(value, { stream: true });
        const stick = nearBottom();
        out.innerHTML = markdown(reply);
        if (stick) toBottom();
      }
      reply += dec.decode();
      if (!reply.trim()) throw new Error('Skiddy Bot came back empty. Please try again.');
      out.innerHTML = markdown(reply);
      state.messages.push({ role: 'model', text: reply });
    } catch (err) {
      const msg =
        err instanceof TypeError
          ? "Can't reach Skiddy Bot right now. Check your connection and try again."
          : err.message;
      if (reply.trim()) {
        // keep what arrived, note the cut-off
        reply += `\n\n_${msg}_`;
        out.innerHTML = markdown(reply);
        state.messages.push({ role: 'model', text: reply });
      } else {
        userMsg.failed = true;
        out.classList.add('sb-error');
        out.innerHTML = markdown(msg);
        state.messages.push({ role: 'model', text: msg, error: true });
      }
    } finally {
      out.classList.remove('sb-cursor');
      out.removeAttribute('aria-busy');
      busy = false;
      save();
      updateSend();
      if (nearBottom()) toBottom();
    }
  }

  /* ---------- events ---------- */

  launcher.addEventListener('click', () => setOpen(!state.open));
  $('[data-sb-close]').addEventListener('click', () => setOpen(false));
  $('[data-sb-reset]').addEventListener('click', () => {
    if (busy) return;
    state.messages = [];
    save();
    renderAll();
    input.focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });

  input.addEventListener('input', () => {
    grow();
    updateSend();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) setOpen(false);
  });

  /* keep the launcher above the template's fixed bottom navbar on mobile */
  const navbar = document.querySelector('.navbar');
  const placeAboveNavbar = () => {
    let offset = 20;
    if (navbar && getComputedStyle(navbar).position === 'fixed') {
      const r = navbar.getBoundingClientRect();
      if (r.height && r.bottom >= window.innerHeight - 2) offset = Math.round(window.innerHeight - r.top) + 14;
    }
    root.style.setProperty('--sb-offset', `${offset}px`);
  };

  /* ---------- boot ---------- */

  const mount = () => {
    document.body.appendChild(root);
    renderAll();
    placeAboveNavbar();
    window.addEventListener('resize', placeAboveNavbar, { passive: true });
    if (navbar && 'ResizeObserver' in window) new ResizeObserver(placeAboveNavbar).observe(navbar);
    if (state.open) setOpen(true, { focus: false });

    if (!state.tipShown && !state.open) {
      setTimeout(() => {
        if (state.open) return;
        tip.classList.add('sb-show');
        state.tipShown = true;
        save();
        setTimeout(() => tip.classList.remove('sb-show'), 6000);
      }, 3500);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
