/* Optional story objectives attached to existing enemies. This module only
 * reads sprites and draws one Graphics object: no physics, scores, or RNG.
 * startWave must run after the actual formation spawns. enemyDefeated accepts
 * the real kill event, before/after the original sprite is destroyed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GKDInvasionObjectives = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PARTICLE_LIMIT = 24;
  const SIGNAL = 0x78ffda;
  const MARK = 0xffd978;
  const OBJECTIVES = Object.freeze({
    3: Object.freeze({ title: 'Trace the signal', total: 2, reaction: 'Carrier frequency found. Those receivers lead to the relay.' }),
    4: Object.freeze({ title: 'Cut the relay links', total: 3, reaction: 'Relay links cut. The Warden has nowhere left to hide.' }),
    7: Object.freeze({ title: 'Break the receivers', total: 3, reaction: 'We can hear the pack now. They are calling to each other.' }),
    9: Object.freeze({ title: 'Silence the last relay', total: 3, reaction: 'Last relay silenced. The Crown Carrier is transmitting alone.' })
  });

  function read(enemy, key) {
    return enemy && typeof enemy.getData === 'function' ? enemy.getData(key) : undefined;
  }

  function identity(enemy) {
    const key = read(enemy, 'slotKey');
    if (key !== undefined && key !== null && key !== '') return String(key);
    const row = read(enemy, 'row'), col = read(enemy, 'col');
    if (row !== undefined && row !== null && col !== undefined && col !== null) {
      return String(read(enemy, 'type') || 'blue') + ':' + row + ':' + col;
    }
    return null;
  }

  function list(group) {
    if (Array.isArray(group)) return group;
    return group && group.children && Array.isArray(group.children.entries) ? group.children.entries : [];
  }

  function rank(key, wave) {
    const value = wave + '/' + key;
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return hash >>> 0;
  }

  function create(scene, options) {
    options = options || {};
    const publish = typeof options.onObjective === 'function' ? options.onObjective : function () {};
    const react = typeof options.onReaction === 'function' ? options.onReaction : function () {};
    let graphics = null;
    let stopped = false;
    let enabled = true;
    let wave = 0;
    let clock = 0;
    let targetIds = Object.freeze([]);
    let targets = [];
    let done = new Set();
    let objective = null;
    let completed = false;
    let lastHp = -1;
    let lastMaxHp = -1;
    let painted = false;
    const particles = Array.from({ length: PARTICLE_LIMIT }, function () { return { active: false }; });
    let nextParticle = 0;

    try {
      if (scene && scene.add && typeof scene.add.graphics === 'function') {
        graphics = scene.add.graphics();
        graphics.setDepth(18);
      }
    } catch (_) { graphics = null; }

    function notify(fn, value) { try { fn(value); } catch (_) {} }

    function snapshot() {
      if (!objective) return null;
      return Object.freeze({ wave: wave, title: objective.title, kind: objective.kind,
        done: done.size, total: targetIds.length, complete: completed, targetIds: targetIds,
        hp: objective.kind === 'boss' ? lastHp : null,
        maxHp: objective.kind === 'boss' ? lastMaxHp : null });
    }

    function announce() { const state = snapshot(); notify(publish, state); return state; }

    function clearGraphics() {
      if (graphics && painted) { graphics.clear(); painted = false; }
    }

    function clearState() {
      targets = [];
      targetIds = Object.freeze([]);
      done.clear();
      objective = null;
      completed = false;
      lastHp = -1;
      lastMaxHp = -1;
    }

    function reset() {
      if (stopped) return;
      wave = 0;
      clock = 0;
      clearState();
      particles.forEach(function (p) { p.active = false; });
      nextParticle = 0;
      clearGraphics();
      notify(publish, null);
    }

    function startWave(value, group) {
      if (stopped || !Number.isInteger(Number(value)) || Number(value) < 1) return null;
      const nextWave = Number(value);
      // A repeated hook in one formation must not resurrect killed receivers.
      if (nextWave <= wave) return snapshot();
      wave = nextWave;
      clearState();
      const step = ((wave - 1) % 10) + 1;
      const definition = OBJECTIVES[step];
      const isBossWave = step === 5 || step === 10;
      if (!definition && !isBossWave) { clearGraphics(); return announce(); }

      const seen = new Set();
      const candidates = [];
      list(group).forEach(function (enemy) {
        if (!enemy || !enemy.active) return;
        const id = identity(enemy);
        if (id === null || seen.has(id)) return;
        const type = read(enemy, 'type');
        const boss = read(enemy, 'isBoss') || type === 'boss' || type === 'final_flagship';
        if (Boolean(boss) !== isBossWave) return;
        seen.add(id);
        candidates.push({ id: id, sprite: enemy, rank: rank(id, wave) });
      });
      candidates.sort(function (a, b) { return a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
      targets = candidates.slice(0, isBossWave ? 1 : definition.total);
      targetIds = Object.freeze(targets.map(function (target) { return target.id; }));
      if (!targets.length) { clearGraphics(); return announce(); }
      objective = isBossWave
        ? { kind: 'boss', title: step === 10 ? 'Break the crown signal' : 'Bring down the Warden',
          reaction: step === 10 ? 'The sky answers back. Every signal belongs to its own voice now.' : 'The Warden is down. The pack is still out there. Follow their voices.' }
        : { kind: 'receivers', title: definition.title, reaction: definition.reaction };
      if (isBossWave) readBossHp();
      clearGraphics();
      return announce();
    }

    function readBossHp() {
      if (!objective || objective.kind !== 'boss' || !targets[0] || completed) return false;
      const rawHp = Number(read(targets[0].sprite, 'hp'));
      const rawMax = Number(read(targets[0].sprite, 'maxHp'));
      const max = Number.isFinite(rawMax) ? Math.max(1, rawMax) : 1;
      const hp = Number.isFinite(rawHp) ? Math.max(0, Math.min(max, rawHp)) : max;
      if (lastHp === hp && lastMaxHp === max) return false;
      lastHp = hp;
      lastMaxHp = max;
      return true;
    }

    function release(x, y, crown) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const count = crown ? 12 : 6;
      for (let i = 0; i < count; i++) {
        const p = particles[nextParticle];
        nextParticle = (nextParticle + 1) % particles.length;
        const spread = (i - (count - 1) / 2) / Math.max(1, count - 1);
        p.active = true;
        p.age = 0;
        p.life = crown ? 1600 + (i % 3) * 130 : 550 + (i % 3) * 70;
        p.x = x;
        p.y = y;
        p.vx = spread * (crown ? 130 : 88);
        p.vy = -(crown ? 100 + (i % 4) * 22 : 40 + (i % 3) * 16);
        p.crown = crown;
      }
    }

    function enemyDefeated(detail) {
      if (stopped || !objective || completed || !detail || Number(detail.wave) !== wave) return false;
      const rawId = detail.slotKey !== undefined && detail.slotKey !== null ? detail.slotKey : detail.enemy_id;
      if (rawId === undefined || rawId === null) return false;
      const id = String(rawId);
      if (done.has(id)) return false;
      const target = targets.find(function (entry) { return entry.id === id; });
      if (!target) return false;
      done.add(id);
      const x = Number.isFinite(detail.x) ? detail.x : target.sprite.x;
      const y = Number.isFinite(detail.y) ? detail.y : target.sprite.y;
      release(x, y, objective.kind === 'boss' && wave % 10 === 0);
      completed = done.size === targetIds.length;
      if (objective.kind === 'boss') lastHp = 0;
      announce();
      // Boss defeat already has a priority-protected chapter transmission.
      if (completed && objective.kind !== 'boss') notify(react, Object.freeze({ event: 'objective_complete', wave: wave,
        title: 'SIGNAL RELEASED',
        speaker: 'NEON WATCH', text: objective.reaction, kind: objective.kind }));
      return true;
    }

    function drawMarker(target) {
      const enemy = target.sprite;
      if (done.has(target.id) || !enemy.active || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) return;
      const x = enemy.x, y = enemy.y;
      // The original world is 800 x 600. Skip off-screen dive/return paths.
      if (x < 8 || x > 792 || y < 48 || y > 575) return;
      const width = Math.min(70, Math.max(14, Number(enemy.displayWidth) || 24));
      const height = Math.min(80, Math.max(14, Number(enemy.displayHeight) || 24));
      const rx = Math.round(width / 2 + 4), ry = Math.round(height / 2 + 4);
      const pulse = 0.58 + Math.sin(clock * 0.005 + target.rank % 7) * 0.12;
      graphics.lineStyle(1, MARK, pulse);
      const corner = 4;
      graphics.beginPath();
      for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) {
        graphics.moveTo(x + sx * (rx - corner), y + sy * ry);
        graphics.lineTo(x + sx * rx, y + sy * ry);
        graphics.lineTo(x + sx * rx, y + sy * (ry - corner));
      }
      graphics.strokePath();
      if (objective.kind !== 'boss') {
        const antennaY = Math.max(43, y - ry - 6);
        graphics.lineStyle(1, MARK, 0.88);
        graphics.strokeRect(Math.round(x - 2), Math.round(antennaY - 2), 4, 4);
        graphics.lineBetween(x, antennaY + 3, x, antennaY + 5);
      }
    }

    function frame(delta) {
      if (stopped) return;
      const dt = Math.min(100, Math.max(0, Number(delta) || 0));
      clock += dt;
      if (readBossHp()) announce();
      let hasParticles = false;
      particles.forEach(function (p) {
        if (!p.active) return;
        p.age += dt;
        if (p.age >= p.life) { p.active = false; return; }
        p.x += p.vx * dt / 1000;
        p.y += p.vy * dt / 1000;
        hasParticles = true;
      });
      if (!graphics || !enabled || ((!objective || completed) && !hasParticles)) { clearGraphics(); return; }
      graphics.clear();
      painted = true;
      if (objective && !completed) targets.forEach(drawMarker);
      particles.forEach(function (p) {
        if (!p.active) return;
        const alpha = (1 - p.age / p.life) * 0.82;
        graphics.lineStyle(p.crown ? 1.5 : 1, SIGNAL, alpha);
        const length = p.crown ? 0.09 : 0.05;
        graphics.lineBetween(p.x - p.vx * length, p.y - p.vy * length, p.x, p.y);
        graphics.fillStyle(0xd8fff4, alpha);
        graphics.fillRect(Math.round(p.x), Math.round(p.y), p.crown ? 2 : 1, 2);
      });
    }

    function setEnabled(value) { enabled = Boolean(value); if (!enabled) clearGraphics(); }

    function destroy() {
      if (stopped) return;
      reset();
      stopped = true;
      if (graphics) { try { graphics.destroy(); } catch (_) {} graphics = null; }
      if (scene && scene.events && typeof scene.events.off === 'function') scene.events.off('shutdown', destroy);
    }

    if (scene && scene.events && typeof scene.events.once === 'function') scene.events.once('shutdown', destroy);
    return Object.freeze({ startWave: startWave, enemyDefeated: enemyDefeated, frame: frame,
      reset: reset, destroy: destroy, current: snapshot, setEnabled: setEnabled });
  }

  return Object.freeze({ create: create, PARTICLE_LIMIT: PARTICLE_LIMIT });
});
