// Optional presentation layer. Receives game events; never reads or changes game state.
(function (root) {
  'use strict';

  // Only the wave transition waits for current speech; every other busy line is dropped.
  const QUEUEABLE = new Set(['wave_clear', 'wave_clear_quip', 'wave_start']);
  const FOLLOW_UP_PAUSE_MS = 1400;
  const FOLLOW_UP_FRESH_MS = 12000;

  function createRobinVoiceDirector(options) {
    const { lines = {}, Audio, now = Date.now, setTimer = setTimeout,
      clearTimer = clearTimeout, onCaption = () => {}, onSpeaking = () => {} } = options;
    let enabled = true;
    let unlocked = false;
    let suspended = false;
    let ended = false;
    let active = null;
    let speaking = false;
    let silentUntil = 0;
    let followUps = [];
    let followUpTimer = null;
    const lastEvent = new Map();
    const variants = new Map();

    function publish(text, value) {
      speaking = value;
      try { onCaption(text); } catch (_) {}
      try { onSpeaking(value); } catch (_) {}
    }

    function halt() {
      const previous = active;
      active = null; // Invalidate pending play promises before touching media.
      if (previous) {
        clearTimer(previous.loadTimer);
        clearTimer(previous.endTimer);
        previous.audio.onended = null;
        previous.audio.onerror = null;
        try { previous.audio.pause(); } catch (_) {}
        try { previous.audio.removeAttribute('src'); previous.audio.load(); } catch (_) {}
      }
      publish('', false);
    }

    function clearFollowUps() {
      followUps = [];
      if (followUpTimer !== null) clearTimer(followUpTimer);
      followUpTimer = null;
    }

    function stop() {
      clearFollowUps();
      halt();
    }

    function available(selection) {
      return selection.ids.filter(id => lines[id] && lines[id].src && lines[id].text);
    }

    function choose(event, detail) {
      const wave = Number(detail.wave) || 1;
      switch (event) {
        case 'run_start': return { ids: ['start_1'], priority: 80, gap: 0 };
        case 'wave_start':
          if (wave <= 1) return null;
          if (detail.finalBoss) return { ids: ['final_boss_enter', 'final_boss_enter_2'], priority: 90, gap: 0 };
          if (detail.boss) return { ids: ['boss_enter_3', 'boss_enter', 'boss_enter_2'], priority: 90, gap: 0 };
          return { ids: wave >= 8 ? ['wave_late_1', 'wave_late_2', 'wave_late_3'] : wave >= 4 ? ['wave_mid_1', 'wave_mid_2', 'wave_mid_3'] :
            ['wave_early_1', 'wave_early_2', 'wave_early_3'], priority: 45, gap: 9000 };
        case 'wave_clear': {
          // Every cleared wave gets the paper-hands send-off. The original clear quips keep
          // their every-third-non-boss-wave slot and follow it.
          const selection = { ids: ['clear_4'], priority: 35, gap: 0, celebration: true };
          if (!detail.boss && wave % 3 === 0) {
            selection.then = { event: 'wave_clear_quip', ids: ['clear_1', 'clear_2', 'clear_3'], priority: 35, gap: 14000, celebration: true };
          }
          return selection;
        }
        case 'boss_phase':
          if (Number(detail.phase) < 2) return null;
          return { ids: ['boss_rage', 'boss_rage_2', 'boss_rage_3'], priority: 85, gap: 18000 };
        case 'boss_defeated':
          return { ids: detail.finalBoss ? ['final_boss_defeated', 'final_boss_defeated_2'] : ['boss_defeated', 'boss_defeated_2', 'boss_defeated_3'],
            priority: 96, gap: 0, celebration: true };
        case 'powerup':
          if (!['dual', 'triple', 'rapid', 'spread', 'laser', 'shield', 'speed', 'life', 'bomb'].includes(detail.type)) return null;
          return { ids: [detail.type, `${detail.type}_2`, `${detail.type}_3`],
            priority: detail.type === 'life' ? 60 : 40, gap: 8000 };
        case 'shield_save': return { ids: ['shield', 'shield_2', 'shield_3'], priority: 55, gap: 18000 };
        case 'player_hit':
          if (Number(detail.lives) <= 0) return null;
          return { ids: Number(detail.lives) === 1 ? ['last_life', 'last_life_2', 'last_life_3'] : ['hit', 'hit_2', 'hit_3'],
            priority: Number(detail.lives) === 1 ? 95 : 65, gap: Number(detail.lives) === 1 ? 0 : 10000 };
        case 'game_over': return { ids: ['game_over_1', 'game_over_2', 'game_over_3', 'game_over_4'], priority: 100, gap: 0 };
        default: return null;
      }
    }

    // A cleared wave's lines wait for the current celebration instead of being dropped, so
    // the send-off, the third-wave quip and the next wave's line (boss entrance included) are heard.
    function waiting(event, selection) {
      if (!QUEUEABLE.has(event) || !enabled || !unlocked || suspended || !available(selection).length) return false;
      if (selection.priority >= 80 && event !== 'wave_start') return false;
      return !!(active && active.celebration) || followUpTimer !== null || followUps.length > 0;
    }

    function scheduleFollowUp() {
      if (followUpTimer !== null || !followUps.length) return;
      followUpTimer = setTimer(() => {
        followUpTimer = null;
        while (followUps.length) {
          const item = followUps.shift();
          if (now() - item.at <= FOLLOW_UP_FRESH_MS && speak(item.event, item.selection, true)) return;
        }
      }, FOLLOW_UP_PAUSE_MS);
    }

    function queue(event, selection) {
      followUps = followUps.filter(item => item.event !== event);
      followUps.push({ event, selection, at: now() });
      if (!active) scheduleFollowUp();
    }

    function emit(event, detail = {}) {
      if (ended) return false;
      // End the event stream even while muted, locked, or missing audio assets.
      if (event === 'game_over') { ended = true; stop(); }
      const selection = choose(event, detail);
      if (!selection) return false;
      const next = selection.then;
      if (waiting(event, selection)) {
        queue(event, selection);
        if (next) queue(next.event, next);
        return true;
      }
      if (speak(event, selection)) {
        if (next) queue(next.event, next);
        return true;
      }
      // Packs without the send-off recording keep the original third-wave quip.
      return !!next && !available(selection).length && speak(next.event, next);
    }

    function speak(event, selection, fromQueue = false) {
      if (!enabled || !unlocked || suspended) return false;
      const time = now();
      const previousTime = lastEvent.get(event);
      if (previousTime !== undefined && time - previousTime < selection.gap) return false;
      if (active && !(selection.priority >= 80 && selection.priority > active.priority)) return false;
      if (!fromQueue && !active && time < silentUntil && selection.priority < 80) return false;
      const choices = available(selection);
      if (!choices.length || typeof Audio !== 'function') {
        if (event === 'game_over') stop();
        return false;
      }
      // Rotate each line family independently; picking up a laser must not skip a dual quip.
      // Cooldowns still belong to the event, so different pickups do not add chatter.
      const family = selection.ids.join('|');
      const index = variants.get(family) || 0;
      const id = choices[index % choices.length];
      const line = lines[id];
      let audio;
      try { audio = new Audio(line.src); } catch (_) { return false; }
      // A new line that did not come from the wave-transition queue replaces it.
      if (!fromQueue) clearFollowUps();
      halt();
      const current = { audio, priority: selection.priority, celebration: !!selection.celebration, loadTimer: null, endTimer: null };
      active = current;
      lastEvent.set(event, time);
      variants.set(family, index + 1);
      audio.preload = 'auto';
      audio.volume = 0.88;
      const finish = () => {
        if (active !== current) return;
        silentUntil = now() + FOLLOW_UP_PAUSE_MS;
        halt();
        scheduleFollowUp();
      };
      audio.onended = finish;
      audio.onerror = finish;
      current.loadTimer = setTimer(finish, 2000);
      const durationSeconds = Number(line.durationSeconds);
      const lifetime = Number.isFinite(durationSeconds) && durationSeconds > 0 ?
        Math.max(5500, Math.min(8000, Math.ceil(durationSeconds * 1000) + 2300)) : 5500;
      current.endTimer = setTimer(finish, lifetime);
      try {
        Promise.resolve(audio.play()).then(() => {
          if (active !== current) return;
          clearTimer(current.loadTimer);
          publish(line.text, true);
        }, finish);
      } catch (_) { finish(); }
      return true;
    }

    return {
      emit, stop,
      preview() {
        stop();
        return speak('preview', { ids: ['start_1', 'start_2'], priority: 80, gap: 0 });
      },
      unlock() { unlocked = true; },
      reset() { stop(); ended = false; silentUntil = 0; lastEvent.clear(); },
      setEnabled(value) { enabled = !!value; if (!enabled) stop(); },
      setSuspended(value) { suspended = !!value; if (suspended) stop(); },
      isEnabled() { return enabled; },
      isSpeaking() { return speaking; }
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createRobinVoiceDirector };
    return;
  }
  if (!root.document || !root.ROBIN_VOICE_LINES) return;
  const document = root.document;
  const style = document.createElement('style');
  style.textContent = `
    #robin-voice-controls{position:fixed;bottom:10px;left:10px;z-index:10002;display:flex;gap:6px;font:700 11px 'Courier New',monospace}
    #robin-voice-controls button{color:#b7ffd2;background:#07150eed;border:1px solid #426f51;border-radius:6px;padding:7px 9px;cursor:pointer;font:inherit}
    #robin-voice-controls button:focus-visible{outline:2px solid #f7d47b;outline-offset:3px}
    #robin-voice-controls button[aria-pressed=false]{color:#afbaaf;border-color:#555}
    #robin-voice-caption{position:fixed;top:52px;left:12px;z-index:10000;box-sizing:border-box;width:min(420px,calc(100vw - 24px));padding:8px 12px;border-left:3px solid #e3bc59;border-radius:4px;background:#06150df0;color:#ecffe6;font:700 14px/1.35 'Courier New',monospace;text-align:left;pointer-events:none}
    #robin-voice-caption[hidden]{display:none}
    #robin-voice-caption strong{display:block;color:#e3bc59;font-size:10px;letter-spacing:2px;margin-bottom:3px}
    @media(max-width:600px){#robin-voice-caption{font-size:12px}#robin-voice-controls{bottom:7px;left:7px}}
  `;
  document.head.appendChild(style);
  const controls = document.createElement('div');
  controls.id = 'robin-voice-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Robin voice');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'robin-voice-toggle';
  toggle.title = 'Enable or mute Robin’s voice';
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.id = 'robin-voice-preview';
  preview.textContent = 'Hear Robin';
  preview.title = 'Preview Robin’s voice';
  controls.append(toggle, preview);
  document.body.appendChild(controls);
  const caption = document.createElement('div');
  caption.id = 'robin-voice-caption';
  caption.hidden = true;
  caption.setAttribute('role', 'status');
  const name = document.createElement('strong');
  name.textContent = 'ROBIN';
  const words = document.createElement('span');
  caption.append(name, words);
  document.body.appendChild(caption);

  function positionCaption() {
    if (caption.hidden) return;
    const canvas = document.querySelector('#game-container canvas');
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const gutter = 12;
    if (bounds.left >= 244) {
      // Wide desktop: the black side margin, above the voice buttons.
      caption.style.width = Math.min(320, bounds.left - gutter * 2) + 'px';
      caption.style.left = gutter + 'px';
      caption.style.top = Math.max(gutter, controls.getBoundingClientRect().top - caption.offsetHeight - gutter) + 'px';
    } else {
      // Tall/narrow preview: the black margin immediately above the canvas.
      const width = Math.min(420, root.innerWidth - gutter * 2);
      caption.style.width = width + 'px';
      caption.style.left = Math.max(gutter, Math.min(root.innerWidth - width - gutter,
        bounds.left + (bounds.width - width) / 2)) + 'px';
      caption.style.top = Math.max(gutter, bounds.top - caption.offsetHeight - gutter) + 'px';
    }
  }
  root.addEventListener('resize', () => root.requestAnimationFrame(positionCaption));

  const director = createRobinVoiceDirector({
    lines: root.ROBIN_VOICE_LINES,
    Audio: root.Audio,
    onCaption(text) { words.textContent = text; caption.hidden = !text; positionCaption(); }
  });
  let remembered = true;
  try { remembered = root.localStorage.getItem('gkd.robinVoice.enabled') !== 'false'; } catch (_) {}
  director.setEnabled(remembered);
  function refreshToggle() {
    const enabled = director.isEnabled();
    toggle.textContent = enabled ? 'Robin voice: ON' : 'Robin voice: OFF';
    toggle.setAttribute('aria-pressed', String(enabled));
    preview.disabled = !enabled;
  }
  toggle.addEventListener('click', () => {
    director.unlock();
    director.setEnabled(!director.isEnabled());
    try { root.localStorage.setItem('gkd.robinVoice.enabled', String(director.isEnabled())); } catch (_) {}
    refreshToggle();
    toggle.blur();
  });
  preview.addEventListener('click', () => {
    director.unlock();
    director.preview();
    preview.blur();
  });
  function unlock(event) { if (event.isTrusted) director.unlock(); }
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    director.setSuspended(document.hidden);
  });
  root.addEventListener('pagehide', () => director.stop());
  director.setSuspended(document.hidden);
  root.RobinVoice = director;
  refreshToggle();
})(globalThis);
