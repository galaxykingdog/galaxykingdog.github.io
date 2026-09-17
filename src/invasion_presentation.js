/* Optional chapter presentation. It owns DOM/textures only, never run state. */
(function (root) {
  'use strict';
  if (!root || !root.document) return;
  const doc = root.document;
  if (new URLSearchParams(root.location.search).get('invasion') === '0') return;
  const host = doc.getElementById('game-container');
  if (!host || !root.GKDInvasionStory || !root.GKDInvasionEnemyFx) return;

  // A permanent rail reserves space. Captions never resize or cover the arena.
  const style = doc.createElement('style');
  style.textContent = `
    #game-container.invasion-shell{position:relative;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;min-width:0;min-height:0}
    body:has(#chain-ui) #game-container.invasion-shell{box-sizing:border-box;padding-top:72px}
    #invasion-arena{position:relative;flex:1 1 0;min-width:0;min-height:0;overflow:hidden;width:100%}
    #invasion-rail{box-sizing:border-box;flex:0 0 70px;min-height:70px;display:flex;align-items:center;justify-content:center;gap:14px;padding:7px 16px;color:#e0eeed;background:linear-gradient(100deg,#061313,#0c1a25);border-bottom:1px solid #265856;font:13px/1.3 system-ui,sans-serif;position:relative;z-index:2}
    #invasion-copy{width:min(660px,100%);min-width:0}
    #invasion-meta{font:700 10px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#79e5c0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #invasion-line{margin:3px 0 0;min-height:17px;line-height:1.3}
    #invasion-rail[data-event=sector_complete]{border-bottom-color:#bcfa84}
    #invasion-rail[data-event=sector_complete] #invasion-meta{color:#c9fa90}
    #invasion-toggle{box-sizing:border-box;flex:none;border:1px solid #365b60;border-radius:7px;background:#10212b;color:#c4e9e0;font:11px system-ui,sans-serif;cursor:pointer;min-width:58px;min-height:34px;padding:7px 9px;touch-action:manipulation}
    #invasion-toggle:focus-visible{outline:2px solid #b3ffe6;outline-offset:2px}
    #invasion-controls{display:flex;flex-direction:column;align-items:stretch;gap:3px;flex:none}
    #invasion-objective{color:#82f0db;font:700 9px/1.2 ui-monospace,Consolas,monospace;white-space:nowrap;text-align:center}
    #invasion-objective[hidden]{display:none}
    #invasion-objective[data-complete=true]{color:#ceff8b}
    body:has(.invasion-shell) #mode-tag{top:auto;bottom:45px;font-size:10px}
    @media(max-width:650px){#invasion-rail{gap:8px;padding:6px 9px;font-size:12px;flex-basis:76px;min-height:76px}#invasion-meta{font-size:9px}#invasion-toggle{min-width:47px;padding:6px}}
    @media(orientation:landscape) and (max-height:600px){#invasion-rail{flex-basis:58px;min-height:58px;font-size:11px;padding:4px 9px;gap:8px}#invasion-meta{font-size:9px}#invasion-line{margin-top:2px}#invasion-toggle{min-width:46px;min-height:32px;padding:5px}}
    #game-container.invasion-letterbox #invasion-arena,#game-container.invasion-side #invasion-arena{position:absolute;inset:0;width:100%;height:100%}
    .invasion-letterbox #invasion-rail{position:absolute;top:0;left:0;right:0}
    .invasion-side #invasion-rail{position:absolute;left:8px;top:14px;width:var(--invasion-gutter);min-height:0;flex-direction:column;align-items:stretch;gap:12px;padding:12px 10px;border:1px solid #265856;border-radius:9px;font-size:12px}
    .invasion-side #invasion-meta{white-space:normal;line-height:1.5;font-size:9px}
    .invasion-side #invasion-line{line-height:1.45;margin-top:7px}
    .invasion-side #invasion-toggle{align-self:flex-start}
    @media(orientation:landscape){body.mobile-expanded .invasion-shell:not(.invasion-side) #invasion-rail{flex-basis:78px;min-height:78px;padding-top:24px}body.mobile-expanded .invasion-side #invasion-rail{top:28px}}
  `;
  doc.head.appendChild(style);
  const rail = doc.createElement('aside');
  rail.id = 'invasion-rail';
  rail.setAttribute('aria-label', 'Chapter transmissions');
  const copy = doc.createElement('div');
  copy.id = 'invasion-copy';
  copy.setAttribute('role', 'status');
  copy.setAttribute('aria-live', 'polite');
  const meta = doc.createElement('div');
  meta.id = 'invasion-meta';
  const line = doc.createElement('p');
  line.id = 'invasion-line';
  copy.append(meta, line);
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.id = 'invasion-toggle';
  toggle.setAttribute('aria-label', 'Hide story transmissions');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.textContent = 'Story on';
  const controls = doc.createElement('div');
  controls.id = 'invasion-controls';
  const goal = doc.createElement('output');
  goal.id = 'invasion-objective';
  goal.hidden = true;
  controls.append(goal, toggle);
  rail.append(copy, controls);
  const arena = doc.createElement('div');
  arena.id = 'invasion-arena';
  host.classList.add('invasion-shell');
  host.append(rail, arena);

  let sceneRef = null;
  let enemiesRef = null;
  let objectives = null;
  let objective = null;
  let layoutMode = '';
  function layout() {
    // Spend unused letterbox/gutter space first. Decisions depend on viewport,
    // never on caption length, and therefore cannot jump during a wave.
    const width = host.clientWidth, height = host.clientHeight;
    const horizontalGap = (width - Math.min(width, height * 4 / 3)) / 2;
    const verticalGap = (height - Math.min(height, width * 3 / 4)) / 2;
    const expandedLandscape = root.innerWidth > root.innerHeight && doc.body.classList.contains('mobile-expanded');
    const railHeight = (root.innerWidth > root.innerHeight && root.innerHeight <= 600 ? 58 : root.innerWidth <= 650 ? 76 : 70) + (expandedLandscape ? 20 : 0);
    const sideMinimum = root.GKD_MOBILE_MODE ? 120 : 136;
    const next = doc.getElementById('chain-ui') ? '' : verticalGap >= railHeight + 4 ? 'invasion-letterbox' : horizontalGap >= sideMinimum ? 'invasion-side' : '';
    host.style.setProperty('--invasion-gutter', Math.min(220, horizontalGap - 16) + 'px');
    if (next !== layoutMode) {
      host.classList.remove('invasion-letterbox', 'invasion-side');
      if (next) host.classList.add(next);
      layoutMode = next;
    }
    if (sceneRef && sceneRef.scale) {
      // Phaser 3.55 refresh uses cached parentSize before reading DOM bounds.
      // Measure first when an in-page expansion changes this nested parent.
      sceneRef.scale.getParentBounds();
      sceneRef.scale.refresh();
    }
  }
  layout();
  if (root.ResizeObserver) new root.ResizeObserver(layout).observe(host);
  else root.addEventListener('resize', layout);

  let elapsed = 0;
  let muted = false;
  let current = null;
  let last = null;
  let runWave = 1;
  let failed = false;
  function render(message) {
    current = message;
    if (message) { last = message; runWave = message.wave; }
    rail.dataset.event = message ? message.event : '';
    if (muted) {
      meta.textContent = 'BREAK THE LEASH';
      line.textContent = 'Story hidden. Keep your aim.';
    } else if (message) {
      meta.textContent = 'W' + message.wave + ' · ' + message.title + ' / ' + message.speaker;
      line.textContent = message.text;
    } else {
      meta.textContent = 'BREAK THE LEASH · ' + (runWave > 1 ? 'DISTRICT ' + Math.ceil(runWave / 10) : 'NEON WARD');
      line.textContent = objective && !objective.complete ? objective.title + (objective.kind === 'boss' ? '.' : ' — hit the marked ships.') : last ? 'Channel quiet. ' + last.title + '.' : 'Alien hounds. One command signal. A cat who won’t obey.';
    }
  }
  function showObjective(value) {
    objective = value;
    goal.hidden = muted || !value;
    if (value) {
      const boss = value.kind === 'boss';
      const percent = Math.max(0, Math.min(100, Math.ceil(100 * (value.hp || 0) / Math.max(1, value.maxHp || 1))));
      goal.textContent = value.complete ? 'SIGNAL FREE' : boss ? 'SIGNAL ' + percent + '%' : 'RELAYS ' + value.done + '/' + value.total;
      goal.dataset.complete = String(value.complete);
      goal.setAttribute('aria-label', value.title + ': ' + goal.textContent);
    }
    if (!current) render(null);
  }
  function objectiveCall(method, ...args) {
    try { if (objectives && typeof objectives[method] === 'function') objectives[method](...args); }
    catch (_) { /* Optional story objectives never stop a running game. */ }
  }
  const director = root.GKDInvasionStory.createDirector({ now: function () { return elapsed; }, onTransmission: render });
  toggle.addEventListener('click', function () {
    muted = !muted;
    toggle.textContent = muted ? 'Story off' : 'Story on';
    toggle.setAttribute('aria-label', muted ? 'Show story transmissions' : 'Hide story transmissions');
    toggle.setAttribute('aria-pressed', String(muted));
    render(current);
    goal.hidden = muted || !objective;
    objectiveCall('setEnabled', !muted);
    // Keyboard gameplay should regain focus after using a presentation control.
    toggle.blur();
  });
  render(null);

  root.GKDInvasionPresentation = Object.freeze({
    parentId: arena.id,
    init: function (scene, enemies) {
      sceneRef = scene;
      enemiesRef = enemies;
      try {
        objectiveCall('destroy');
        if (root.GKDInvasionObjectives) objectives = root.GKDInvasionObjectives.create(scene, {
          onObjective: showObjective,
          onReaction: function (reaction) { director.emit('objective_complete', reaction); }
        });
      } catch (_) { objectives = null; }
      if (failed) return;
      try { root.GKDInvasionEnemyFx.install(scene); root.GKDInvasionEnemyFx.update(scene, enemies, elapsed); }
      catch (_) { failed = true; }
    },
    emit: function (event, detail) {
      if (event === 'run_start') { elapsed = 0; last = null; runWave = 1; objectiveCall('reset'); director.reset(); }
      if (event === 'hide') { last = null; runWave = 1; objectiveCall('reset'); director.reset(); return; }
      if (event === 'enemy_defeated') { objectiveCall('enemyDefeated', detail); return; }
      director.emit(event, detail);
      if (event === 'run_start' || event === 'wave_start') objectiveCall('startWave', detail && detail.wave || 1, enemiesRef);
    },
    frame: function (scene, enemies, delta) {
      // Paused frames never call this, so the user does not miss a transmission.
      elapsed += Math.max(0, Math.min(250, Number(delta) || 0));
      director.tick();
      objectiveCall('frame', delta);
      if (!failed) {
        try { root.GKDInvasionEnemyFx.update(scene, enemies, elapsed); }
        catch (_) { failed = true; }
      }
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
