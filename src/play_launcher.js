(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.start(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const STORAGE_KEY = 'gkd.play.controls.v1';
  const SKIN_KEY = 'gkd.play.skin.v1';
  const DEFAULT_SKIN = 'robin-cat-v6';
  const validMode = value => value === 'desktop' || value === 'mobile';
  const SKINS = ['robin-cat-v6', 'robin-hood', 'robin-moon', 'robin-sailor-smoon', 'robin-ginger', 'robin-frost'];
  const validSkin = value => SKINS.includes(value);

  function detectMode(device) {
    const ua = device.userAgent || '';
    if (device.userAgentMobile === true || /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
    // iPadOS can identify itself as a Mac, including its desktop-browser mode.
    if (/Mac/i.test(device.platform || ua) && device.maxTouchPoints > 1) return 'mobile';
    if (device.coarsePointer && device.maxTouchPoints > 0 && !device.canHover) return 'mobile';
    // Window dimensions alone must never turn a desktop Game Jolt iframe into a phone.
    return 'desktop';
  }

  function selectMode(queryMode, savedMode, device) {
    if (queryMode === 'choose') return null;
    if (validMode(queryMode)) return queryMode;
    if (validMode(savedMode)) return savedMode;
    return detectMode(device);
  }

  function start(win) {
    const doc = win.document;
    const desktop = doc.getElementById('play-desktop');
    const mobile = doc.getElementById('play-mobile');
    if (!desktop || !mobile) return;
    const status = doc.getElementById('play-status');
    // The costume is remembered here so the choice survives the redirect and
    // the next visit on both computer and phone.
    let savedSkin = null;
    try { savedSkin = win.localStorage.getItem(SKIN_KEY); } catch (_) { /* Private browsers deny storage. */ }
    const askedSkin = new URLSearchParams(win.location.search).get('skin');
    let skin = validSkin(askedSkin) ? askedSkin : (validSkin(savedSkin) ? savedSkin : DEFAULT_SKIN);
    // The mobile page carries no skin controls, so the list is simply empty there.
    const skinInputs = typeof doc.querySelectorAll === 'function'
      ? Array.from(doc.querySelectorAll('input[name="skin"]')) : [];
    // Clicking a card follows its href, so the costume has to live in that href
    // too, not only in the redirect the launcher builds for itself.
    const applySkinToLink = () => {
      for (const link of [desktop, mobile]) {
        try {
          const url = new URL(link.getAttribute('href'), doc.baseURI);
          url.searchParams.set('skin', skin);
          link.setAttribute('href', url.href);
        } catch (_) { /* A malformed href is left exactly as the page wrote it. */ }
      }
    };
    applySkinToLink();
    for (const input of skinInputs) {
      input.checked = input.value === skin;
      input.addEventListener('change', () => {
        if (!input.checked || !validSkin(input.value)) return;
        skin = input.value;
        try { win.localStorage.setItem(SKIN_KEY, skin); } catch (_) { /* Choice still applies to this visit. */ }
        applySkinToLink();
      });
    }
    const remember = mode => {
      try { win.localStorage.setItem(STORAGE_KEY, mode); } catch (_) { /* Private/embedded browsers can deny storage. */ }
    };
    desktop.addEventListener('click', () => remember('desktop'));
    mobile.addEventListener('click', () => remember('mobile'));

    let savedMode = null;
    try { savedMode = win.localStorage.getItem(STORAGE_KEY); } catch (_) { /* Detection still works without storage. */ }
    const nav = win.navigator || {};
    const matches = query => {
      try { return Boolean(win.matchMedia && win.matchMedia(query).matches); } catch (_) { return false; }
    };
    const queryMode = new URLSearchParams(win.location.search).get('mode');
    const mode = selectMode(queryMode, savedMode, {
      userAgent: nav.userAgent,
      platform: nav.platform,
      maxTouchPoints: nav.maxTouchPoints || 0,
      userAgentMobile: nav.userAgentData && nav.userAgentData.mobile,
      coarsePointer: matches('(pointer: coarse)'),
      canHover: matches('(hover: hover)')
    });
    if (!mode) return;
    if (validMode(queryMode)) remember(mode);
    if (status) status.textContent = mode === 'mobile' ? 'Opening joystick controls…' : 'Opening keyboard controls…';
    // Resolve from the declared base so the same launcher also works inside hosted ZIP subdirectories.
    const target = new URL((mode === 'mobile' ? mobile : desktop).getAttribute('href'), doc.baseURI);
    target.searchParams.set('skin', skin);
    try { win.location.replace(target.href); }
    catch (_) { if (status) status.textContent = 'Choose your controls to continue.'; }
  }

  return { detectMode, selectMode, start, STORAGE_KEY };
});
