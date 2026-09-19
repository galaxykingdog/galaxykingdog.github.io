/* Mobile Free Arcade only. Build with tools/build_mobile_assets.py after source edits.
 * Register /mobile-sw.js with {scope:'/mobile/', updateViaCache:'none'}.
 * Installation prepares a separate complete cache; it never takes over a running game.
 */
'use strict';

const BUILD_REVISION = 'a537745ca16c5d4e4d71c3ae'; // Set by the mobile asset builder.
const CACHE_PREFIX = 'gkd-mobile-v1-';
const CACHE_NAME = CACHE_PREFIX + BUILD_REVISION;
const MANIFEST_URL = '/assets/mobile/precache.json';
const SHELL_SOURCE_URL = '/assets/mobile/offline-shell.txt';
const COMPLETE_URL = '/mobile/__offline_complete__';
const SCOPE_PATH = '/mobile/';
let manifestPromise;

function isMobileClient(client) {
  if (!client || !client.url) return false;
  const url = new URL(client.url);
  return url.origin === self.location.origin && url.pathname.startsWith(SCOPE_PATH);
}

function allowedPath(path) {
  if (path === '/mobile/' || path === '/mobile/index.html' || path === '/manifest.mobile.webmanifest') return true;
  if (path === '/src/chain/gkd_whitepaper_spec.js') return true;
  if (/^\/src\/(?:mobile\/)?[a-z0-9_-]+\.(?:js|css)$/i.test(path)) return true;
  if (/^\/assets\/[^/]+\.(?:png|jpg|jpeg|json|ogg|wav)$/i.test(path)) return true;
  if (/^\/assets\/voice\/robin\/en\/robin-local-v3\/[a-z0-9_]+\.ogg$/.test(path)) return true;
  if (/^\/assets\/mobile\/(?:icon(?:-maskable)?-\d+\.png|icon\.svg|robin_up_runtime\.(?:png|json)|phaser-3\.55\.2\.min\.js|PHASER-LICENSE\.txt)$/.test(path)) return true;
  if (/^\/assets\/robin-(?:frost|cat|hood|moon|sailor-smoon)-v1-mobile\/robin_up_runtime\.(?:png|json)$/.test(path)) return true;
  return path === '/assets/site/star.svg';
}

function validateManifest(manifest) {
  if (!manifest || manifest.version !== BUILD_REVISION || !Array.isArray(manifest.assets) || !manifest.assets.length) {
    throw new Error('Mobile offline manifest does not match this build.');
  }
  const seen = new Set();
  for (const asset of manifest.assets) {
    const url = new URL(asset.url, self.location.origin);
    const shell = url.pathname === '/mobile/' || url.pathname === '/mobile/index.html';
    if (url.origin !== self.location.origin || !allowedPath(url.pathname) || url.hash ||
        asset.url !== url.pathname + url.search || !/^[a-f0-9]{64}$/.test(asset.sha256) ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || seen.has(asset.url)) {
      throw new Error('Invalid mobile offline asset.');
    }
    // Netlify may inject markup into .html responses. Only these two navigation
    // aliases may download an unprocessed, byte-identical shell payload instead.
    if (shell ? asset.sourceUrl !== SHELL_SOURCE_URL : Object.prototype.hasOwnProperty.call(asset, 'sourceUrl')) {
      throw new Error('Invalid offline shell source.');
    }
    seen.add(asset.url);
  }
  if (!seen.has('/mobile/') || !seen.has('/assets/mobile/phaser-3.55.2.min.js')) {
    throw new Error('Mobile offline shell or game engine is missing.');
  }
  return manifest;
}

async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

async function verifiedResponse(asset) {
  const response = await fetch(asset.sourceUrl || asset.url, {cache: 'no-store', credentials: 'same-origin'});
  if (!response.ok || response.type === 'opaque' || response.status !== 200) {
    throw new Error('Offline download failed: ' + asset.url);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== asset.bytes || await digest(bytes) !== asset.sha256) {
    throw new Error('Offline file changed during download: ' + asset.url);
  }
  const headers = new Headers(response.headers);
  // fetch() has already decoded Content-Encoding; the cached body is these exact bytes.
  headers.delete('Content-Encoding');
  headers.set('Content-Length', String(bytes.byteLength));
  // Keep the installed manifest usable offline even if a static host falls
  // back to application/octet-stream for the .webmanifest extension.
  if (asset.url === '/manifest.mobile.webmanifest') headers.set('Content-Type', 'application/manifest+json');
  if (asset.sourceUrl === SHELL_SOURCE_URL) {
    headers.delete('Content-Disposition');
    headers.set('Content-Type', 'text/html; charset=utf-8');
  }
  return new Response(bytes, {status: 200, headers});
}

async function notifyStatus(status) {
  const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
  for (const client of clients) {
    if (isMobileClient(client)) client.postMessage({type: 'GKD_MOBILE_CACHE_STATUS', ...status});
  }
}

async function installOfflineGame() {
  if (new URL(self.registration.scope).pathname !== SCOPE_PATH) {
    throw new Error('This worker must be registered only for /mobile/.');
  }
  const response = await fetch(MANIFEST_URL, {cache: 'no-store'});
  if (!response.ok) throw new Error('Mobile offline manifest is unavailable.');
  const manifest = validateManifest(await response.json());
  const cache = await caches.open(CACHE_NAME);
  // Re-installing the identical complete build must not remove a working cache.
  if (await cache.match(COMPLETE_URL)) return;
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < manifest.assets.length) {
      const asset = manifest.assets[next++];
      try {
        await cache.put(asset.url, await verifiedResponse(asset));
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  try {
    // Keep background traffic bounded. The page never waits for this to start playing.
    const results = await Promise.allSettled([worker(), worker()]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    await cache.put(MANIFEST_URL, new Response(JSON.stringify(manifest), {headers: {'Content-Type': 'application/json'}}));
    await cache.put(COMPLETE_URL, new Response(JSON.stringify({version: BUILD_REVISION, count: manifest.assets.length}), {
      headers: {'Content-Type': 'application/json'}
    }));
    manifestPromise = Promise.resolve(manifest);
    await notifyStatus({ready: true, version: BUILD_REVISION, count: manifest.assets.length});
  } catch (error) {
    await caches.delete(CACHE_NAME);
    await notifyStatus({ready: false, version: BUILD_REVISION, error: 'Offline download was not completed. Try again while online.'});
    throw error;
  }
}

async function storedManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (!await cache.match(COMPLETE_URL)) return null;
      const response = await cache.match(MANIFEST_URL);
      return response ? validateManifest(await response.json()) : null;
    })().then(manifest => {
      // A status query while installation is still running must not memoize
      // "not ready" and prevent the completed installation from activating.
      if (!manifest) manifestPromise = undefined;
      return manifest;
    }).catch(error => {
      manifestPromise = undefined;
      throw error;
    });
  }
  return manifestPromise;
}

async function rangedResponse(response, range) {
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const bytes = await response.arrayBuffer();
  if (!match || (!match[1] && !match[2])) return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + bytes.byteLength}});
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= bytes.byteLength) {
    return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + bytes.byteLength}});
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), {status: 206, headers});
}

async function respond(event, url) {
  const client = event.clientId ? await self.clients.get(event.clientId) : null;
  const navigation = event.request.mode === 'navigate';
  if (!navigation && !isMobileClient(client)) return fetch(event.request);
  const manifest = await storedManifest();
  if (!manifest) return fetch(event.request);
  const key = navigation ? '/mobile/' : url.pathname + url.search;
  if (!manifest.assets.some(asset => asset.url === key)) return fetch(event.request);
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);
  // A deleted/evicted asset cannot be advertised as a complete offline game.
  if (!cached) {
    await cache.delete(COMPLETE_URL);
    manifestPromise = undefined;
    await notifyStatus({ready: false, version: BUILD_REVISION});
    return fetch(event.request);
  }
  return rangedResponse(cached, event.request.headers.get('Range'));
}

self.addEventListener('install', event => event.waitUntil(installOfflineGame()));

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!await storedManifest()) throw new Error('Incomplete mobile cache cannot activate.');
    // Unregistering/re-registering can activate a new worker while an older game
    // remains open under its previous controller. Keep that client's assets even
    // if it is no longer controlled by this registration.
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    if (windows.some(isMobileClient)) return;
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    // No clients.claim(): the current page finishes with the version it loaded.
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !allowedPath(url.pathname)) return;
  if (event.request.mode === 'navigate' && url.pathname !== '/mobile/' && url.pathname !== '/mobile/index.html') return;
  event.respondWith(respond(event, url));
});

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'GKD_MOBILE_CACHE_STATUS' || !isMobileClient(event.source)) return;
  event.waitUntil((async () => {
    const manifest = await storedManifest();
    const cache = await caches.open(CACHE_NAME);
    const keys = new Set((await cache.keys()).map(request => {
      const url = new URL(request.url);
      return url.pathname + url.search;
    }));
    const ready = !!manifest && manifest.assets.every(asset => keys.has(asset.url));
    if (manifest && !ready) {
      await cache.delete(COMPLETE_URL);
      manifestPromise = undefined;
    }
    const message = {type: 'GKD_MOBILE_CACHE_STATUS', ready, version: BUILD_REVISION, count: ready ? manifest.assets.length : 0};
    if (event.ports && event.ports[0]) event.ports[0].postMessage(message);
    else event.source.postMessage(message);
  })());
});
