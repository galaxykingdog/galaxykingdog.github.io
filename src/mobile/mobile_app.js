(function (root) {
  'use strict';
  const web3 = root.GKD_WEB3_MOBILE === true && root.CHAIN?.enabled === true;
  if (!root.GKD_MOBILE_MODE || (root.CHAIN?.enabled !== false && !web3)) return;
  const $ = id => document.getElementById(id);
  const nativeAndroid = root.GKD_NATIVE_ANDROID === true;
  const gameJolt = root.GKD_GAMEJOLT === true;
  let nativeHostSuspended = nativeAndroid && root.GKD_NATIVE_HOST_SUSPENDED === true;
  const input = root.GKDMobileInput;
  let adapter = null, paused = false, previousPhase = '', lastHud = 0, lastFrame = 0;
  let installPrompt = null, sound = true, lastStatus = {}, cacheStarted = false, firePointer = null;
  let updateWaiting = false;
  let startPending = false;
  let frames = 0, frameTotal = 0, slowFrames = 0, longestFrame = 0, measuredFrameMs = 0;
  const perfEnabled = new URLSearchParams(location.search).get('perf') === '1';
  const overlay = $('mobile-overlay'), start = $('mobile-start'), pauseButton = $('mobile-pause');
  const perf = $('mobile-perf');
  const joystick = $('mobile-stick'), thumb = $('mobile-stick-thumb'), fireButton = $('mobile-fire');
  const fullscreenButton = $('mobile-fullscreen');
  const updateLink = $('mobile-update');
  if (updateLink) updateLink.hidden = true;
  let expandedView = false, viewChangePending = false;
  perf.hidden = !perfEnabled;

  function updateExpandedView() {
    document.body.classList.toggle('mobile-expanded', expandedView);
    fullscreenButton.setAttribute('aria-pressed', String(expandedView));
    fullscreenButton.setAttribute('aria-label', expandedView ? 'Restore view' : 'Expand game');
    fullscreenButton.setAttribute('title', expandedView ? 'Restore view' : 'Expand game');
  }
  updateExpandedView();

  // A phone shows the 800x600 arena at about half size, so the actors are drawn larger. Scale is
  // widened only while the renderer draws each object and restored straight after: bodies,
  // collisions and the verified replay never read it. The background and full-screen cards
  // (start icon, countdown, game over) keep their size.
  const ACTOR_VIEW_SCALE = 1.25;
  const FIXED_VIEW_TEXTURES = new Set(['background', 'start_icon', 'count1', 'count2', 'count3', 'gameover', 'player_robin_cat_legacy']);
  function drawsLarger(object) {
    // Robin's cape is a Graphics layer anchored on the costume; other Graphics draw in arena space.
    if (object.type === 'Graphics') return typeof playerCapeVisual !== 'undefined' && object === playerCapeVisual?.graphic;
    return !FIXED_VIEW_TEXTURES.has(object.texture?.key);
  }
  function enlargeActors(Phaser) {
    for (const kind of [Phaser?.GameObjects?.Sprite, Phaser?.GameObjects?.Image, Phaser?.GameObjects?.Graphics]) {
      const proto = kind?.prototype;
      for (const method of ['renderWebGL', 'renderCanvas']) {
        const draw = proto?.[method];
        if (typeof draw !== 'function' || draw.gkdActorView) continue;
        const enlarged = function (renderer, object, ...rest) {
          if (!object || !drawsLarger(object)) return draw.call(this, renderer, object, ...rest);
          const scaleX = object._scaleX, scaleY = object._scaleY;
          object._scaleX = scaleX * ACTOR_VIEW_SCALE; object._scaleY = scaleY * ACTOR_VIEW_SCALE;
          try { return draw.call(this, renderer, object, ...rest); }
          finally { object._scaleX = scaleX; object._scaleY = scaleY; }
        };
        enlarged.gkdActorView = true;
        proto[method] = enlarged;
      }
    }
  }
  enlargeActors(root.Phaser);

  // The page never asks for browser fullscreen: Android then lays its exit notice over the arena,
  // and players asked for it to be gone entirely.
  document.addEventListener('fullscreenchange', () => {
    if (!nativeAndroid) setPaused(true, 'View changed. Tap Resume when you’re ready.');
  });
  // Phone landscape puts the story rail between the tools and the joystick, and the wallet in
  // the right rail, so the arena can use the full height (mobile.css reads these values).
  function measureSideRails() {
    // Layout polish only: hosts and test shells without these DOM APIs keep the CSS defaults.
    if (typeof document.querySelector !== 'function' || !document.documentElement?.style) return;
    const bar = document.querySelector('.mobile-bar'), stick = document.querySelector('.joystick-area');
    const stage = document.querySelector('.mobile-stage');
    if (!bar?.getBoundingClientRect || !stick?.getBoundingClientRect || !stage?.getBoundingClientRect) return;
    const tools = bar.getBoundingClientRect(), move = stick.getBoundingClientRect(), arena = stage.getBoundingClientRect();
    const vars = document.documentElement.style;
    vars.setProperty('--gkd-rail-left', Math.round(tools.left + 6) + 'px');
    vars.setProperty('--gkd-rail-top', Math.round(tools.bottom + 6) + 'px');
    vars.setProperty('--gkd-rail-width', Math.max(60, Math.round(arena.left - tools.left - 12)) + 'px');
    const freeHeight = Math.round(move.top - tools.bottom - 12);
    const railHeight = Math.max(40, freeHeight);
    vars.setProperty('--gkd-rail-height', railHeight + 'px');
    // Short landscape screens get a compact story card instead of overlapping text; with no room
    // left between the tools and the joystick the card steps aside rather than cover the stick.
    const rail = document.getElementById?.('invasion-rail');
    if (rail?.classList?.toggle) {
      rail.classList.toggle('gkd-rail-tight', freeHeight < 84);
      rail.classList.toggle('gkd-rail-tiny', freeHeight < 60);
      rail.classList.toggle('gkd-rail-none', freeHeight < 34);
    }
    vars.setProperty('--gkd-right-rail', Math.max(60, Math.round(root.innerWidth - arena.right)) + 'px');
    // Phone landscape keeps the score in the right rail, just above Auto fire.
    const fire = document.querySelector('.fire-controls')?.getBoundingClientRect?.();
    if (fire) vars.setProperty('--gkd-hud-bottom', Math.max(0, Math.round(root.innerHeight - fire.top + 8)) + 'px');
    // The host's "Powered by Netlify" badge is a fixed iframe in the bottom-right corner. Keep the
    // arena left of it and lift FIRE above it while it is shown.
    const badge = document.getElementById?.('nl-badge-frame')?.getBoundingClientRect?.();
    const shown = !!badge && badge.width > 0 && badge.height > 0;
    vars.setProperty('--gkd-badge-inset', (shown ? Math.max(0, Math.round(arena.right - badge.left + 4)) : 0) + 'px');
    vars.setProperty('--gkd-badge-lift', (shown ? Math.max(0, Math.round(root.innerHeight - badge.top + 8)) : 0) + 'px');
  }
  // Phaser 3.55 caches its parent size, so a nested layout change needs an explicit remeasure.
  function refreshArena() {
    try {
      const phaser = typeof game !== 'undefined' ? game : null;
      if (phaser?.scale?.getParentBounds && phaser.scale.refresh) { phaser.scale.getParentBounds(); phaser.scale.refresh(); }
    } catch (_) {}
  }
  // Measure after the browser applies the new layout; hosts without animation frames measure now.
  const afterLayout = fn => (typeof root.requestAnimationFrame === 'function' ? root.requestAnimationFrame(fn) : fn());
  const relayout = () => afterLayout(() => { measureSideRails(); refreshArena(); });
  measureSideRails();
  root.addEventListener('resize', relayout);
  try {
    const arenaElement = typeof document.getElementById === 'function' ? document.getElementById('invasion-arena') : null;
    if (arenaElement && typeof root.ResizeObserver === 'function') new root.ResizeObserver(() => afterLayout(refreshArena)).observe(arenaElement);
    // The badge is injected after load and changes the free space without a resize event.
    if (typeof root.MutationObserver === 'function' && document.body) new root.MutationObserver(relayout).observe(document.body, { childList: true });
  } catch (_) {}

  function drawJoystick() {
    const stick = input.stick;
    thumb.style.transform = 'translate3d(' + stick.x.toFixed(2) + 'px,' + stick.y.toFixed(2) + 'px,0)';
    joystick.classList.toggle('is-active', stick.active);
  }
  function releaseCapture(element, pointer) {
    if (pointer === null) return;
    try { if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer); } catch (_) {}
  }
  function clearControls() {
    const moveOwner = input.activePointer, fireOwner = firePointer;
    input.clear(); firePointer = null; fireButton.classList.remove('is-held'); drawJoystick();
    releaseCapture(joystick, moveOwner); releaseCapture(fireButton, fireOwner);
  }

  function showOverlay(title, message, button) {
    $('mobile-title').textContent = title;
    $('mobile-message').textContent = message;
    start.textContent = button; start.disabled = false;
    overlay.hidden = false;
  }
  function setPaused(value, reason) {
    if (!value && nativeHostSuspended) return;
    if (!adapter || paused === value) return;
    const phase = adapter.snapshot().phase;
    if (value && phase !== 'running' && phase !== 'countdown') return;
    paused = value; clearControls(); lastFrame = 0;
    frames = 0; frameTotal = 0; slowFrames = 0; longestFrame = 0;
    adapter.setPaused(value);
    if (nativeAndroid && !value) adapter.setSound(sound && !nativeHostSuspended);
    root.RobinVoice?.setSuspended(value || !sound || nativeHostSuspended);
    pauseButton.textContent = value ? 'Resume' : 'Pause';
    if (value) showOverlay('Take a breath.', reason || 'Your run is paused.', 'Resume run');
    else overlay.hidden = true;
  }
  function refresh(force = false) {
    if (!adapter) return;
    const s = adapter.snapshot();
    for (const key of ['score', 'wave', 'lives', 'best']) {
      if (force || lastStatus[key] !== s[key]) $('mobile-' + key).textContent = s[key];
    }
    lastStatus = s;
    if (s.phase !== previousPhase) {
      previousPhase = s.phase;
      // A finger may already be down in the first frame after the countdown.
      // Keep that gesture when the less-frequent HUD refresh catches up.
      if (s.phase !== 'running') clearControls();
      pauseButton.disabled = s.phase === 'start' || s.phase === 'over';
      if (s.phase === 'running' || s.phase === 'countdown') {
        overlay.hidden = true; $('mobile-load').textContent = '';
      } else if (s.phase === 'over') {
        showOverlay('One more run?', 'Score ' + s.score + ' · Wave ' + s.wave + ' · Best ' + s.best, 'Play again');
      } else showOverlay('Find your aim.', web3 ? 'Testnet arcade. Connect your wallet to review the entry before you play.' : 'Hold the stick to move. Ease toward the center for a precise dodge.', web3 ? 'Review testnet entry' : 'Play free');
    }
  }
  start.addEventListener('click', async () => {
    if (!adapter || nativeHostSuspended || startPending) return;
    adapter.unlockAudio();
    if (paused) setPaused(false);
    else {
      if (!web3) { clearControls(); adapter.start(); refresh(true); return; }
      startPending = true; start.disabled = true;
      if (web3) start.textContent = 'Checking entry…';
      try { clearControls(); await adapter.start(); refresh(true); }
      catch (error) { $('mobile-message').textContent = String(error?.message || error); }
      finally {
        startPending = false; start.disabled = false;
        if (web3 && ['start','over'].includes(adapter.snapshot().phase)) {
          start.textContent = 'Review testnet entry';
          $('mobile-message').textContent = $('chain-status')?.textContent || 'Entry was not started. You can try again.';
        }
      }
    }
  });
  pauseButton.addEventListener('click', () => {
    if (nativeHostSuspended) return;
    if (paused) adapter?.unlockAudio();
    setPaused(!paused);
  });
  $('mobile-auto').addEventListener('click', () => {
    input.setAutoFire(!input.autoFire);
    $('mobile-auto').textContent = input.autoFire ? 'Auto fire: ON' : 'Auto fire: OFF';
    $('mobile-auto').setAttribute('aria-pressed', String(input.autoFire));
  });
  $('mobile-sound').addEventListener('click', () => {
    sound = !sound;
    adapter?.setSound(sound && !nativeHostSuspended && (!nativeAndroid || !paused));
    if (nativeAndroid) root.RobinVoice?.setEnabled(sound);
    root.RobinVoice?.setSuspended(!sound || paused || nativeHostSuspended);
    $('mobile-sound').textContent = sound ? 'Sound on' : 'Sound off';
    $('mobile-sound').setAttribute('aria-pressed', String(sound));
  });

  joystick.addEventListener('pointerdown', e => {
      if (!adapter || paused || adapter.snapshot().phase !== 'running' || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // Measure once per gesture; pointer moves never force layout or wait for a timer.
      const ring = joystick.getBoundingClientRect(), knob = thumb.getBoundingClientRect();
      const radius = Math.max(1, (Math.min(ring.width, ring.height) - Math.max(knob.width, knob.height)) / 2);
      if (input.begin(e.pointerId, e.clientX, e.clientY, ring.left + ring.width / 2, ring.top + ring.height / 2, radius)) {
        e.preventDefault(); joystick.setPointerCapture(e.pointerId); drawJoystick();
      }
  });
  joystick.addEventListener('pointermove', e => {
    if (input.move(e.pointerId, e.clientX, e.clientY)) { e.preventDefault(); drawJoystick(); }
  }, { passive: false });
  const releaseStick = e => {
    if (input.activePointer !== e.pointerId) return;
    input.end(e.pointerId); drawJoystick(); releaseCapture(joystick, e.pointerId);
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(event, releaseStick);
  fireButton.addEventListener('pointerdown', e => {
    if (firePointer !== null || paused || !adapter || adapter.snapshot().phase !== 'running' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    firePointer = e.pointerId; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    fireButton.classList.add('is-held');
    input.setManualFire(true);
  });
  const releaseFire = e => { if (firePointer === e.pointerId) { firePointer = null; fireButton.classList.remove('is-held'); input.setManualFire(false); releaseCapture(fireButton, e.pointerId); } };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) fireButton.addEventListener(event, releaseFire);
  const suspend = () => { clearControls(); setPaused(true, 'Tap Resume when you’re ready.'); };
  root.addEventListener('blur', suspend);
  root.addEventListener('pagehide', suspend);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else root.RobinVoice?.setSuspended(paused || !sound || nativeHostSuspended);
  });
  root.screen?.orientation?.addEventListener('change', () => {
    clearControls();
    setPaused(true, 'Phone rotated. Tap Resume when you’re ready.');
  });
  document.addEventListener('contextmenu', e => { if (!e.target.closest('dialog')) e.preventDefault(); });

  fullscreenButton.addEventListener('click', async () => {
    if (nativeAndroid || viewChangePending) return;
    // Expand only the page layout: browser fullscreen would put its exit notice
    // over Robin. Leave an old fullscreen session if this page is already in one.
    setPaused(true, 'View changed. Tap Resume when you’re ready.');
    viewChangePending = true;
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch (_) {}
    expandedView = !expandedView;
    updateExpandedView();
    // Phaser must remeasure its parent even when the browser viewport is unchanged.
    root.dispatchEvent(new Event('resize'));
    viewChangePending = false;
  });
  if (nativeAndroid) fullscreenButton.hidden = true;
  if (gameJolt || web3) {
    for (const id of ['mobile-install', 'mobile-help']) {
      $(id).hidden = true;
      $(id).disabled = true;
    }
  }
  root.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (nativeAndroid || gameJolt || web3) return;
    installPrompt = event; $('mobile-install').hidden = false;
  });
  root.addEventListener('appinstalled', () => { $('mobile-install').hidden = true; installPrompt = null; });
  $('mobile-install').addEventListener('click', async () => {
    if (nativeAndroid || gameJolt || web3 || !installPrompt) return;
    const prompt = installPrompt; installPrompt = null; $('mobile-install').hidden = true;
    setPaused(true);
    try { await prompt.prompt(); } catch (_) { $('mobile-install-help').showModal(); }
  });
  $('mobile-help').addEventListener('click', () => {
    if (gameJolt) return;
    setPaused(true); $('mobile-install-help').showModal();
  });

  function setCacheStatus(message) {
    $('mobile-cache').textContent = updateWaiting ? 'Update ready · Finish this run first' : message;
  }
  function cacheMessage(data) {
    if (data?.type !== 'GKD_MOBILE_CACHE_STATUS') return;
    setCacheStatus(data.ready ? 'Offline ready · Free arcade' : data.error ? 'Online play ready · Offline download unavailable' : 'Preparing offline play…');
  }
  async function registerOffline() {
    if (web3) { $('mobile-cache').textContent = 'Testnet · Online connection required'; return; }
    if (nativeAndroid) { $('mobile-cache').textContent = 'Offline arcade · Saved on this device'; return; }
    if (gameJolt) { $('mobile-cache').textContent = 'Free arcade · Local scores'; return; }
    if (cacheStarted || !('serviceWorker' in navigator)) return;
    cacheStarted = true;
    try {
      setCacheStatus('Preparing offline play…');
      const registration = await navigator.serviceWorker.register('/mobile-sw.js', { scope: '/mobile/', updateViaCache: 'none' });
      navigator.serviceWorker.addEventListener('message', event => cacheMessage(event.data));
      const refreshWaiting = () => {
        const wasWaiting = updateWaiting;
        updateWaiting = !!registration.waiting;
        if (updateLink) updateLink.hidden = !updateWaiting;
        if (updateWaiting || wasWaiting) setCacheStatus('Preparing offline play…');
      };
      refreshWaiting();
      const query = worker => {
        if (!worker) return;
        const channel = new MessageChannel();
        channel.port1.onmessage = event => { cacheMessage(event.data); channel.port1.close(); };
        worker.postMessage({type:'GKD_MOBILE_CACHE_STATUS'}, [channel.port2]);
      };
      query(registration.active);
      const observe = worker => worker?.addEventListener('statechange', () => {
        refreshWaiting();
        if (worker.state === 'activated') query(worker);
        if (worker.state === 'redundant') setCacheStatus('Online play ready · Offline download unavailable');
      });
      observe(registration.waiting);
      observe(registration.installing);
      registration.addEventListener('updatefound', () => { refreshWaiting(); observe(registration.installing); });
    } catch (_) { setCacheStatus('Online play ready · Offline storage unavailable'); }
  }

  root.GKDMobile = {
    attach(value) {
      adapter = value;
      nativeHostSuspended = nativeAndroid && root.GKD_NATIVE_HOST_SUSPENDED === true;
      adapter.setSound(sound && !nativeHostSuspended);
      if (nativeAndroid) {
        root.RobinVoice?.setEnabled(sound);
        root.RobinVoice?.setSuspended(nativeHostSuspended || paused || !sound);
        if (nativeHostSuspended) adapter.setPaused(true);
      }
      $('mobile-load').textContent = ''; refresh(true); registerOffline();
    },
    nativeSuspend(reason) {
      if (!nativeAndroid) return;
      root.GKD_NATIVE_HOST_SUSPENDED = nativeHostSuspended = true;
      clearControls(); setPaused(true, reason || 'Tap Resume when you’re ready.');
      // Start/game-over audio also stops when Android backgrounds the activity.
      adapter?.setSound(false); adapter?.setPaused(true);
      root.RobinVoice?.setSuspended(true); lastFrame = 0;
    },
    nativeResume() {
      if (!nativeAndroid) return;
      root.GKD_NATIVE_HOST_SUSPENDED = nativeHostSuspended = false;
      clearControls(); lastFrame = 0;
      if (!paused) adapter?.setPaused(false);
      adapter?.setSound(sound && !paused);
      root.RobinVoice?.setSuspended(paused || !sound);
    },
    nativeBack() {
      if (!nativeAndroid) return false;
      const dialog = $('mobile-install-help');
      if (dialog.open) { dialog.close(); return true; }
      if (adapter && !paused && ['running', 'countdown'].includes(adapter.snapshot().phase)) {
        setPaused(true); return true;
      }
      return false;
    },
    get paused() { return paused; },
    beforeFrame() {
      if (nativeHostSuspended) return false;
      const now = performance.now();
      measuredFrameMs = lastFrame ? now - lastFrame : 0;
      if (measuredFrameMs > 220) setPaused(true, 'A brief interruption — resume when you’re ready.');
      lastFrame = now;
      return !paused;
    },
    frame(delta) {
      if (paused) return;
      if (measuredFrameMs > 0) {
        frames++; frameTotal += measuredFrameMs; longestFrame = Math.max(longestFrame, measuredFrameMs);
        if (measuredFrameMs > 25) slowFrames++;
      }
      lastHud += delta;
      if (lastHud >= 150) { lastHud = 0; refresh(); }
      if (perfEnabled && frameTotal >= 1000) {
        perf.textContent = Math.round(frames * 1000 / frameTotal) + ' fps · max ' + longestFrame.toFixed(1) + ' ms · ' + slowFrames + ' slow';
        frames = 0; frameTotal = 0; slowFrames = 0; longestFrame = 0;
      }
    },
    loading(progress) { $('mobile-load').textContent = 'Loading ' + Math.round(progress * 100) + '%'; },
    loadError() { $('mobile-load').textContent = 'A game file could not load. Reopen with a connection to retry.'; }
  };
})(window);
