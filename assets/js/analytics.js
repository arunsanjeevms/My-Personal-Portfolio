'use strict';

/**
 * Analytics beacon.
 *
 * Sends one small payload per page view to this site's own server.
 * No third-party requests, no cookies, no identifiers stored in the
 * browser. The server derives a daily-rotating hash for counting and
 * never stores the IP address.
 *
 * Respects the browser's Do Not Track setting.
 */

(function analytics() {
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  var startedAt = Date.now();
  var sent = false;

  function currentPageKey() {
    var active = document.querySelector('[data-page].active');
    return active ? active.dataset.page : null;
  }

  function send(extra) {
    var payload = Object.assign({
      path: window.location.pathname,
      title: document.title,
      pageKey: currentPageKey(),
      referrer: document.referrer ? new URL(document.referrer).hostname : null,
      screenWidth: window.screen ? window.screen.width : null,
      screenHeight: window.screen ? window.screen.height : null,
      language: navigator.language,
    }, extra || {});

    var body = JSON.stringify(payload);

    // sendBeacon survives the page being closed; fetch is the fallback.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/collect', new Blob([body], { type: 'application/json' }));
      return;
    }

    fetch('/api/analytics/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true,
    }).catch(function () { /* analytics must never surface an error */ });
  }

  // Initial view.
  send();

  // Tab switches change the URL without a page load; count them as views.
  var lastPath = window.location.pathname;
  window.addEventListener('popstate', trackIfChanged);
  document.addEventListener('click', function () {
    // Give the navigation handler a moment to update the URL.
    setTimeout(trackIfChanged, 60);
  });

  function trackIfChanged() {
    if (window.location.pathname === lastPath) return;
    lastPath = window.location.pathname;
    startedAt = Date.now();
    send();
  }

  // Time on page, reported once when the tab is hidden or unloaded.
  function reportDuration() {
    if (sent) return;
    sent = true;
    send({ durationMs: Date.now() - startedAt });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') reportDuration();
  });
  window.addEventListener('pagehide', reportDuration);

  // Resume downloads are worth knowing about.
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href="/resume.pdf"]');
    if (!link) return;

    var body = JSON.stringify({ name: 'resume_download', path: window.location.pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/event', new Blob([body], { type: 'application/json' }));
    }
  });
}());
