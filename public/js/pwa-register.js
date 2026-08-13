/* =========================================================
   PWA-REGISTER.JS — VoucherHub
   Phase 3: Offline Core
   =========================================================
   Registers the Service Worker, shows an update snackbar when a new
   version is waiting, and shows a small online/offline status badge.

   This file does NOT touch Firebase/Firestore/Auth in any way — it only
   listens for browser + Service Worker events and injects a small bit
   of UI. All UI here is injected via JS (style + DOM), so this single
   file is enough to add to every page's <head> without also having to
   hand-duplicate a snackbar/badge markup block into 13 HTML files.
   ========================================================= */

(function () {
  /* ── Shared inline styles for the UI this file adds ── */
  const style = document.createElement('style');
  style.textContent = `
    #vh-snackbar{
      position:fixed; left:50%; bottom:20px; transform:translate(-50%,0);
      background:#0f172a; color:#fff; padding:12px 16px; border-radius:12px;
      display:flex; align-items:center; gap:12px; font-size:0.9rem;
      font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      box-shadow:0 6px 20px rgba(0,0,0,.25); z-index:150; max-width:92vw;
    }
    #vh-snackbar button{
      background:#16a34a; color:#fff; border:none; border-radius:8px;
      padding:6px 14px; font-size:0.85rem; font-weight:600; cursor:pointer;
      white-space:nowrap;
    }
    #vh-snackbar button:hover{ background:#15803d; }
    #vh-net-badge{
      position:fixed; right:12px; bottom:12px; z-index:140;
      font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      font-size:0.75rem; font-weight:600; padding:5px 12px; border-radius:999px;
      background:#f1f5f9; color:#475569; box-shadow:0 2px 6px rgba(0,0,0,.12);
      display:flex; align-items:center; gap:6px; transition:opacity .2s;
    }
    #vh-net-badge.vh-online{ background:#dcfce7; color:#15803d; }
    #vh-net-badge.vh-offline{ background:#fee2e2; color:#b91c1c; }
    #vh-net-badge .vh-dot{ width:7px; height:7px; border-radius:50%; background:currentColor; flex:none; }
  `;
  document.head.appendChild(style);

  /* =====================================================
     1) SERVICE WORKER REGISTRATION
     ===================================================== */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        _attachUpdateChecker(registration);
      }).catch((err) => {
        console.warn('[PWA] Service worker registration failed:', err);
      });
    });

    // Reload exactly once, right when the new SW takes control (fired
    // after the user clicks "Refresh" on the update snackbar below).
    let hasReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasReloaded) return;
      hasReloaded = true;
      window.location.reload();
    });

    // "Data from cache" indicator — see sw.js networkFirst(), which
    // posts this message only when an allowlisted API GET had to fall
    // back to a cached response because the network request failed.
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'VH_API_FROM_CACHE') {
        _showCacheLabel();
      }
    });
  }

  /* =====================================================
     2) UPDATE CHECKER + SNACKBAR
     ===================================================== */
  function _attachUpdateChecker(registration) {
    // A new SW was already waiting before this page even loaded (e.g.
    // it finished installing in a background tab).
    if (registration.waiting) {
      _showUpdateSnackbar(registration.waiting);
    }

    // A new SW starts installing while this page is open.
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        // "installed" + an existing controller already active = this is
        // a genuine update, not the very first install (which needs no
        // snackbar — there's nothing to refresh away from yet).
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          _showUpdateSnackbar(worker);
        }
      });
    });
  }

  function _showUpdateSnackbar(waitingWorker) {
    if (document.getElementById('vh-snackbar')) return; // already showing
    const bar = document.createElement('div');
    bar.id = 'vh-snackbar';
    bar.innerHTML = '<span>Versi terbaru VoucherHub tersedia</span>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Refresh';
    btn.addEventListener('click', () => {
      // Does NOT force a reload by itself — it only asks the waiting SW
      // to activate. The actual reload happens once (see
      // controllerchange listener above), never in a loop.
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      btn.disabled = true;
      btn.textContent = 'Memuat...';
    });
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  /* =====================================================
     3) ONLINE / OFFLINE STATUS BADGE
     ===================================================== */
  function _getBadge() {
    let badge = document.getElementById('vh-net-badge');
    if (badge) return badge;
    badge = document.createElement('div');
    badge.id = 'vh-net-badge';
    badge.innerHTML = '<span class="vh-dot"></span><span class="vh-label"></span>';
    document.body.appendChild(badge);
    return badge;
  }

  let cacheLabelTimeout = null;

  function _updateNetworkStatus() {
    const online = navigator.onLine;
    const badge = _getBadge();
    badge.classList.toggle('vh-online', online);
    badge.classList.toggle('vh-offline', !online);
    badge.querySelector('.vh-label').textContent = online ? 'Online' : 'Offline';
  }

  function _showCacheLabel() {
    const badge = _getBadge();
    badge.querySelector('.vh-label').textContent = 'Data dari cache';
    clearTimeout(cacheLabelTimeout);
    cacheLabelTimeout = setTimeout(_updateNetworkStatus, 4000);
  }

  window.addEventListener('online', _updateNetworkStatus);
  window.addEventListener('offline', _updateNetworkStatus);
  window.addEventListener('DOMContentLoaded', _updateNetworkStatus);
  // In case this script runs after DOMContentLoaded already fired
  // (e.g. served from cache on a fast repeat load):
  if (document.readyState !== 'loading') _updateNetworkStatus();
})();
