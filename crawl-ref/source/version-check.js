// version-check.js — detects when a new deploy has shipped while this
// tab was open and shows a non-blocking banner with a "Reload" button.
// Stays passive during gameplay; never auto-reloads, the user clicks
// when they're ready.
//
// Mechanism:
//   1. Build emits /version.txt (one-line timestamp).
//   2. Build sed-injects the same value into each HTML page's
//      <meta name="dcss-version" content="__DEPLOY_VERSION__">.
//   3. This script reads its own embedded version, polls version.txt
//      on load (after a grace window) / visibilitychange / every 10
//      min, compares. Mismatch → banner.
//
// Failure modes:
//   * Un-stamped build (placeholder still in the meta) → bypass check
//     entirely so local dev / Python http.server don't constantly nag.
//   * fetch fails (offline) → silent, retry on next tick.
//   * Dismissed banner → sessionStorage stores the seen version; if a
//     newer one ships afterwards the banner reappears.

(function () {
    'use strict';

    var meta = document.querySelector('meta[name="dcss-version"]');
    var embedded = meta ? meta.getAttribute('content') : null;

    // Skip in dev: an un-stamped build still has the placeholder.
    if (!embedded || embedded.indexOf('__DEPLOY_VERSION__') !== -1) return;

    var bannerShown = false;
    var dismissed = null;
    try { dismissed = sessionStorage.getItem('dcss-version-dismissed'); } catch (e) {}

    function ensureStyles() {
        if (document.getElementById('version-banner-style')) return;
        var s = document.createElement('style');
        s.id = 'version-banner-style';
        s.textContent = [
            '#version-banner{',
              'position:fixed;bottom:0;left:0;right:0;',
              // Below #diag-banner (z=9999) so a real error still wins.
              'z-index:9990;',
              'background:rgba(20,60,80,0.95);color:#cef;',
              'border-top:1px solid rgba(180,220,240,0.5);',
              'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);',
              'padding:10px 14px;',
              'font:13px ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;',
              'display:flex;align-items:center;gap:12px;',
            '}',
            '#version-banner button{',
              'background:rgba(180,220,240,0.18);color:inherit;',
              'border:1px solid rgba(180,220,240,0.55);border-radius:4px;',
              'padding:6px 12px;font:inherit;cursor:pointer;',
            '}',
            '#version-banner button:active{background:rgba(180,220,240,0.38);}',
            '#version-banner .vb-dismiss{',
              'margin-left:auto;padding:4px 10px;font-size:18px;line-height:1;',
            '}',
        ].join('');
        document.head.appendChild(s);
    }

    function showBanner(latest) {
        if (bannerShown) return;
        if (dismissed === latest) return;
        bannerShown = true;
        ensureStyles();

        var banner = document.createElement('div');
        banner.id = 'version-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');

        var msg = document.createElement('span');
        msg.textContent = 'A new version is available.';
        banner.appendChild(msg);

        var reload = document.createElement('button');
        reload.textContent = 'Reload';
        reload.addEventListener('click', function () { location.reload(); });
        banner.appendChild(reload);

        var dismiss = document.createElement('button');
        dismiss.className = 'vb-dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.textContent = '×';
        dismiss.addEventListener('click', function () {
            try { sessionStorage.setItem('dcss-version-dismissed', latest); } catch (e) {}
            dismissed = latest;
            banner.remove();
            bannerShown = false;
        });
        banner.appendChild(dismiss);

        document.body.appendChild(banner);
    }

    function check() {
        if (bannerShown) return;
        // cache:'no-store' on top of the Caddy `Cache-Control: no-cache`
        // header — belt and suspenders so iOS Safari doesn't serve a
        // cached response on poll.
        fetch('/version.txt', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.text() : null; })
            .then(function (text) {
                if (!text) return;
                var latest = text.trim();
                if (latest && latest !== embedded) showBanner(latest);
            })
            .catch(function () { /* offline — silent, retry next tick */ });
    }

    // 30 s grace after page load: avoids false-positive when a slow
    // CDN fetch lands during initial page load.
    setTimeout(check, 30000);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();
    });

    // Periodic poll while the tab stays open. 10 min is a compromise
    // between catching deploys quickly and not generating per-tab
    // bandwidth on a static site.
    setInterval(function () {
        if (document.visibilityState === 'visible') check();
    }, 10 * 60 * 1000);
}());
