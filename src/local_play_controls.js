// Optional input controls for the local, free arcade preview.
// Sends ordinary keyboard events; never reads or modifies gameplay state.
(() => {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  if (!local || location.pathname !== '/galaxian.html' ||
      new URLSearchParams(location.search).get('controls') !== '1' ||
      window.CHAIN?.enabled !== false) return;

  const keys = {
    left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, which: 37 },
    right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39 },
    space: { key: ' ', code: 'Space', keyCode: 32, which: 32 }
  };
  const held = new Set();
  let active = null;
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Timed game controls');
  panel.style.cssText = 'position:fixed;left:8px;top:44px;z-index:10001;padding:10px;background:#07100ef2;border:1px solid #48b784;border-radius:8px;color:#c7ffe4;font:12px monospace;max-width:290px';
  panel.innerHTML = `<strong>LOCAL TEST CONTROLS</strong>
    <div style="display:flex;gap:5px;margin:8px 0;flex-wrap:wrap">
      <button type="button" data-move="left">Left + fire 1s</button>
      <button type="button" data-move="none">Fire 1s</button>
      <button type="button" data-move="right">Right + fire 1s</button>
      <button type="button" id="local-controls-stop">Stop</button>
    </div><output aria-live="polite">Ready — normal game rules</output>`;
  document.body.appendChild(panel);
  const status = panel.querySelector('output');

  function key(name, down) {
    if (held.has(name) === down) return;
    if (down) held.add(name); else held.delete(name);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      ...keys[name], bubbles: true, cancelable: true, repeat: false
    }));
  }

  function stop(reason = 'Stopped') {
    if (active) active.abort();
    active = null;
    for (const name of [...held]) key(name, false);
    status.textContent = reason;
  }

  function delay(ms, signal) {
    return new Promise(resolve => {
      if (signal.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done, { once: true });
    });
  }

  async function control({ direction = 'none', durationMs = 500, shooting = 'off' } = {}, options = {}) {
    if (!['none', 'left', 'right'].includes(direction) ||
        !['off', 'hold', 'tap'].includes(shooting) ||
        !Number.isInteger(durationMs) || durationMs < 60 || durationMs > 1500) {
      throw new Error('Choose left/right/none, off/hold/tap, and 60–1500 milliseconds.');
    }
    stop();
    const lease = new AbortController();
    active = lease;
    const abort = () => lease.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) lease.abort();
    status.textContent = `${direction} · ${shooting} · ${durationMs} ms`;
    const started = performance.now();
    try {
      if (!lease.signal.aborted) {
        if (direction !== 'none') key(direction, true);
        if (shooting === 'hold') key('space', true);
        if (shooting === 'tap') {
          // Real press/release edges: holding normally fires only once.
          while (!lease.signal.aborted && performance.now() - started < durationMs) {
            key('space', true);
            await delay(Math.min(60, durationMs - (performance.now() - started)), lease.signal);
            if (active !== lease) break;
            key('space', false);
            await delay(Math.min(100, Math.max(0, durationMs - (performance.now() - started))), lease.signal);
          }
        } else {
          await delay(durationMs, lease.signal);
        }
      }
      return { direction, shooting, durationMs, stopped: lease.signal.aborted };
    } finally {
      options.signal?.removeEventListener('abort', abort);
      if (active === lease) stop(lease.signal.aborted ? 'Stopped' : 'Ready — keys released');
    }
  }

  for (const button of panel.querySelectorAll('[data-move]')) {
    button.addEventListener('click', () => {
      control({ direction: button.dataset.move, shooting: 'tap', durationMs: 1000 })
        .catch(error => stop(error.message));
    });
  }
  panel.querySelector('#local-controls-stop').addEventListener('click', () => stop());
  window.addEventListener('blur', () => stop('Stopped — focus changed'));
  window.addEventListener('pagehide', () => stop());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop('Stopped — tab hidden');
  });
  // A human's real input takes over immediately.
  window.addEventListener('keydown', event => {
    if (event.isTrusted && active) stop('Manual control');
  }, true);

  const context = document.modelContext || navigator.modelContext;
  if (context?.registerTool) {
    Promise.resolve(context.registerTool({
      name: 'arcade_timed_input',
      description: 'Play the LOCAL FREE arcade game using ordinary keys for 60–1500 ms. Direction holds an arrow key; shooting off releases Space, hold keeps Space down, tap presses Space for 60 ms then releases for 100 ms. All normal game limits apply. Observe the screen after each move. This returns only the input action, no game state.',
      inputSchema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['none', 'left', 'right'] },
          durationMs: { type: 'integer', minimum: 60, maximum: 1500 },
          shooting: { type: 'string', enum: ['off', 'hold', 'tap'] }
        },
        required: ['direction', 'durationMs', 'shooting'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, consequentialHint: false },
      execute: control
    })).catch(() => { status.textContent = 'Ready — use the timed buttons'; });
  }
})();
