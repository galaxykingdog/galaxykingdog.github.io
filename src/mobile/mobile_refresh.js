(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.start(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const TIMEOUT_MS = 15000;
  const SHELL_URL = '/assets/mobile/offline-shell.txt';
  const MESSAGES = {
    network: 'The latest version could not be verified. Check your connection and tap Try again.',
    integrity: 'The update is still arriving. Wait a moment, then tap Try again.',
    crypto: 'This browser cannot verify the update. Open this page in an up-to-date Chrome browser using HTTPS.',
    foreign: 'This page found a different offline app. No other app was removed. Open the official Robin site in Chrome and try again.',
    removal: 'The old mobile version could not be released. Close other Robin mobile tabs, then tap Try again.',
    concurrent: 'Another Robin tab is keeping its offline version active. Close other Robin mobile tabs, then tap Try again.',
    unknown: 'The refresh did not finish. Check your connection, close other Robin mobile tabs, then tap Try again.'
  };

  function failure(code) {
    const error = new Error(MESSAGES[code]);
    error.refreshCode = code;
    return error;
  }

  async function deadline(win, work, code) {
    let timer;
    const abort = win.AbortController ? new win.AbortController() : null;
    const timeout = new Promise((_, reject) => {
      timer = win.setTimeout(() => {
        if (abort) abort.abort();
        reject(failure(code));
      }, TIMEOUT_MS);
    });
    try { return await Promise.race([work(abort && abort.signal), timeout]); }
    finally { win.clearTimeout(timer); }
  }

  async function verifyLatestShell(win) {
    if (!win.crypto || !win.crypto.subtle || typeof win.crypto.subtle.digest !== 'function') throw failure('crypto');
    return deadline(win, async signal => {
      let manifest, shell;
      try {
        const options = { cache: 'no-store', redirect: 'error' };
        if (signal) options.signal = signal;
        const [manifestResponse, shellResponse] = await Promise.all([
          win.fetch('/assets/mobile/precache.json', options),
          win.fetch(SHELL_URL, options)
        ]);
        if (!manifestResponse.ok || !shellResponse.ok) throw failure('network');
        [manifest, shell] = await Promise.all([manifestResponse.json(), shellResponse.arrayBuffer()]);
      } catch (_) { throw failure('network'); }
      const entries = manifest && Array.isArray(manifest.assets) ? manifest.assets.filter(asset => asset.url === '/mobile/') : [];
      const asset = entries[0];
      if (!manifest || manifest.schema !== 1 || manifest.scope !== '/mobile/' || manifest.entry !== '/mobile/' ||
          entries.length !== 1 || !asset || asset.sourceUrl !== SHELL_URL ||
          !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes !== shell.byteLength ||
          !/^[a-f0-9]{64}$/i.test(asset.sha256 || '')) throw failure('integrity');
      const digest = await win.crypto.subtle.digest('SHA-256', shell);
      const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== asset.sha256.toLowerCase()) throw failure('integrity');
      return manifest.version;
    }, 'network');
  }

  function isOwnedRegistration(registration, origin) {
    if (!registration || registration.scope !== origin + '/mobile/') return false;
    const workers = [registration.installing, registration.waiting, registration.active].filter(Boolean);
    if (!workers.length) return false;
    return workers.every(worker => {
      try {
        const script = new URL(worker.scriptURL);
        return script.origin === origin && script.pathname === '/mobile-sw.js';
      } catch (_) { return false; }
    });
  }

  async function removeOwnedRegistration(win) {
    const serviceWorker = win.navigator && win.navigator.serviceWorker;
    if (!serviceWorker) return;
    const registration = await deadline(win, () => serviceWorker.getRegistration('/mobile/'), 'removal');
    if (!registration) return;
    if (!isOwnedRegistration(registration, win.location.origin)) throw failure('foreign');
    const removed = await deadline(win, () => registration.unregister(), 'removal');
    if (removed !== true) throw failure('removal');
    // A live game tab may register again while this page is working. Never loop or remove its replacement.
    const remaining = await deadline(win, () => serviceWorker.getRegistration('/mobile/'), 'removal');
    if (remaining) throw failure(isOwnedRegistration(remaining, win.location.origin) ? 'concurrent' : 'foreign');
  }

  function start(win) {
    const button = win.document.getElementById('mobile-refresh');
    const status = win.document.getElementById('mobile-refresh-status');
    const play = win.document.getElementById('mobile-refresh-play');
    if (!button || !status || !play) return;
    let busy = false;
    play.hidden = true;
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      button.disabled = true;
      play.hidden = true;
      status.textContent = 'Checking the latest mobile version…';
      try {
        await verifyLatestShell(win);
        status.textContent = 'Releasing the old mobile version…';
        await removeOwnedRegistration(win);
        play.setAttribute('href', '/mobile/');
        play.hidden = false;
        status.textContent = 'The latest version is ready. Opening Robin…';
        try { win.location.replace('/mobile/'); }
        catch (_) { status.textContent = 'The latest version is ready. Tap Open Robin below.'; }
      } catch (error) {
        status.textContent = error && error.refreshCode ? MESSAGES[error.refreshCode] : MESSAGES.unknown;
        button.textContent = 'Try again';
        button.disabled = false;
        busy = false;
      }
    });
  }

  return { verifyLatestShell, isOwnedRegistration, removeOwnedRegistration, start };
});
