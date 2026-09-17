// Original, code-native alien hound starfighters. All poses retain the exact
// source texture dimensions. This module changes presentation only.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GKDInvasionEnemyFx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const POSES = Object.freeze(['closed', 'warning', 'open']);
  const TYPES = Object.freeze(['blue', 'purple', 'red', 'flagship', 'final_flagship']);
  const sceneCaches = new WeakMap();
  const DESIGNS = Object.freeze({
    blue: Object.freeze({ width: 51, height: 38, name: 'Fang scout',
      shadow: '#102345', dark: '#154672', hull: '#237cab', light: '#53bcdd', edge: '#b0f2ff', accent: '#00eaff' }),
    purple: Object.freeze({ width: 41, height: 62, name: 'Split-mandible stalker',
      shadow: '#281a43', dark: '#493168', hull: '#7b43a6', light: '#ba74d8', edge: '#edc3ff', accent: '#fd579b' }),
    red: Object.freeze({ width: 49, height: 49, name: 'Armored jaw breaker',
      shadow: '#3a1729', dark: '#782634', hull: '#c44147', light: '#f66e63', edge: '#ffb297', accent: '#ffda63' }),
    flagship: Object.freeze({ width: 49, height: 49, name: 'Crown-jaw command ship',
      shadow: '#332039', dark: '#81502d', hull: '#c99336', light: '#f7cf64', edge: '#fff0a7', accent: '#62ffdd' }),
    final_flagship: Object.freeze({ width: 49, height: 49, name: 'Crown-jaw sovereign',
      shadow: '#33152a', dark: '#824027', hull: '#d6972c', light: '#ffd45f', edge: '#fff3b5', accent: '#ff545d' })
  });
  const INK = '#080b1b';
  const MOUTH = '#05060f';
  const TEETH = '#f5f1d9';
  const TOOTH_SHADOW = '#96adba';
  const KEY_TABLE = Object.create(null);
  for (let t = 0; t < TYPES.length; t++) {
    const type = TYPES[t];
    const phases = type === 'flagship' || type === 'final_flagship' ? 3 : 1;
    const table = KEY_TABLE[type] = [];
    for (let phase = 1; phase <= phases; phase++) {
      table[phase] = POSES.map(pose => 'gkd_hound_v1_' + type + '_' + phase + '_' + pose);
    }
  }

  function normalizedType(type) { return type === 'boss' ? 'flagship' : DESIGNS[type] ? type : null; }
  function normalizedPhase(type, phase) {
    return type === 'flagship' || type === 'final_flagship' ? Math.max(1, Math.min(3, Number(phase) | 0)) : 1;
  }
  function getDesign(type) { return DESIGNS[normalizedType(type)] || null; }
  function textureKey(type, pose, phase) {
    type = normalizedType(type);
    if (!type) return null;
    const index = pose === 'open' ? 2 : pose === 'warning' ? 1 : 0;
    return KEY_TABLE[type][normalizedPhase(type, phase)][index];
  }

  // Integer scan conversion: no smoothed paths, subpixel strokes or scaled art.
  // Mirror pairs use the complete canvas width so every silhouette is centered.
  function painter(ctx, width) {
    function rect(color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
    function poly(color, points) {
      let lo = Infinity; let hi = -Infinity;
      for (let i = 0; i < points.length; i += 2) { lo = Math.min(lo, points[i + 1]); hi = Math.max(hi, points[i + 1]); }
      const spans = [];
      ctx.fillStyle = color;
      for (let y = lo; y < hi; y++) {
        spans.length = 0;
        for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
          const ax = points[j], ay = points[j + 1], bx = points[i], by = points[i + 1];
          if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) {
            spans.push(ax + (y + 0.5 - ay) * (bx - ax) / (by - ay));
          }
        }
        spans.sort((a, b) => a - b);
        for (let i = 0; i + 1 < spans.length; i += 2) {
          const x = Math.ceil(spans[i] - 0.5), end = Math.ceil(spans[i + 1] - 0.5);
          if (end > x) ctx.fillRect(x, y, end - x, 1);
        }
      }
    }
    function pair(color, x, y, w, h) { rect(color, x, y, w, h); rect(color, width - x - w, y, w, h); }
    function wings(color, points) {
      poly(color, points);
      const reflected = [];
      for (let i = 0; i < points.length; i += 2) reflected.push(width - points[i], points[i + 1]);
      poly(color, reflected);
    }
    return { rect, poly, pair, wings };
  }

  function paintScout(p, d, pose) {
    const { rect, poly, pair, wings } = p;
    // Swept engine nacelles and rear ear fins keep the familiar broad blue
    // scout footprint. Pale vent clusters read as metal at native game scale.
    wings(INK, [1,16, 5,11, 9,14, 13,26, 17,31, 13,36, 5,32, 1,25]);
    wings(d.dark, [3,16, 5,14, 7,17, 11,28, 14,31, 11,33, 5,29, 3,24]);
    wings(d.hull, [3,17, 5,15, 7,19, 7,27, 5,27, 3,24]);
    pair(d.light, 3, 17, 2, 7); pair(d.accent, 6, 28, 2, 3);
    wings(INK, [11,22, 14,18, 18,24, 21,35, 17,37, 11,33]);
    wings(d.hull, [13,23, 14,21, 17,26, 19,34, 16,34, 13,31]);
    pair(d.light, 14, 26, 2, 6);
    poly(INK, [16,7, 22,5, 29,5, 35,7, 39,17, 37,25, 31,32, 20,32, 14,25, 12,17]);
    poly(d.shadow, [18,8, 33,8, 37,17, 34,24, 29,29, 22,29, 17,24, 14,17]);
    wings(d.hull, [15,16, 20,15, 23,19, 23,28, 20,26, 16,22]);
    wings(d.light, [16,16, 19,17, 21,22, 20,25, 17,22]);
    poly(d.hull, [22,19, 29,19, 30,26, 27,31, 24,31, 21,26]);
    rect(d.light, 24, 22, 3, 7); rect(d.edge, 25, 25, 1, 4);
    // Recessed brows over angled cyan eyes, either side of a canine snout.
    pair(INK, 16, 17, 7, 4); pair(d.accent, 17, 18, 5, 2);
    pair(d.edge, 18, 18, 2, 1);
    const spread = pose === 'open' ? 3 : pose === 'warning' ? 1 : 0;
    wings(INK, [16-spread,6, 22,5, 24,10, 22,16, 16-spread,17, 13-spread,12]);
    wings(d.hull, [17-spread,7, 21,7, 22,11, 20,14, 16-spread,14, 15-spread,11]);
    pair(d.light, 16-spread, 8, 3, 3);
    rect(MOUTH, 21-spread, pose === 'open' ? 4 : 8, 9+spread*2, pose === 'open' ? 11 : 7);
    const fangY = pose === 'closed' ? 6 : pose === 'warning' ? 4 : 1;
    wings(TOOTH_SHADOW, [18-spread, fangY, 21-spread,fangY, 22-spread,12, 19-spread,13]);
    pair(TEETH, 18-spread, fangY, 2, pose === 'open' ? 8 : 5);
    if (pose !== 'closed') {
      pair(TEETH, 22, 5, 2, 3); pair(TOOTH_SHADOW, 22, 12, 2, 2);
      rect(d.accent, 24, 11, 3, 2);
    }
    rect(d.dark, 23, 14, 5, 3); rect(d.edge, 24, 14, 3, 1);
  }

  function paintStalker(p, d, pose) {
    const { rect, poly, pair, wings } = p;
    // Long antenna/ear fins, a narrow spine, and independent cutting mandibles.
    wings(INK, [2,27, 7,23, 11,31, 13,47, 10,58, 7,61, 3,55]);
    wings(d.dark, [4,28, 7,26, 9,32, 11,47, 8,56, 6,57, 5,50]);
    pair(d.hull, 5, 31, 3, 18); pair(d.light, 5, 32, 1, 13);
    pair(d.accent, 6, 52, 2, 4); pair(d.edge, 6, 52, 1, 2);
    wings(INK, [9,36, 13,31, 16,44, 18,59, 14,61, 10,55]);
    wings(d.hull, [11,38, 13,36, 15,46, 16,56, 14,57, 12,52]);
    pair(d.light, 12, 42, 1, 9);
    poly(INK, [13,12, 28,12, 33,25, 30,35, 26,43, 24,54, 17,54, 15,43, 11,35, 8,25]);
    poly(d.dark, [14,16, 27,16, 30,25, 27,35, 23,43, 22,51, 19,51, 18,43, 14,35, 11,25]);
    wings(d.hull, [12,23, 17,21, 19,29, 18,37, 15,35, 12,29]);
    pair(d.light, 13, 25, 2, 7);
    poly(d.hull, [18,30, 23,30, 25,39, 22,46, 19,46, 16,39]);
    rect(d.light, 19, 34, 3, 8); rect(d.edge, 20, 35, 1, 5);
    pair(INK, 12, 21, 6, 5); pair(d.accent, 13, 22, 4, 2); pair(d.edge, 14, 22, 1, 1);
    // Two halves pivot sideways inside the same texture; the physics never does.
    const spread = pose === 'open' ? 4 : pose === 'warning' ? 2 : 0;
    wings(INK, [14-spread,1, 17-spread,1, 20,11, 20,18, 16,24, 9-spread,22, 7-spread,16, 11-spread,7]);
    wings(d.hull, [14-spread,4, 16-spread,4, 18,12, 17,17, 14,20, 11-spread,19, 9-spread,16, 13-spread,8]);
    wings(d.light, [14-spread,5, 15-spread,5, 14-spread,12, 12-spread,17, 10-spread,16]);
    rect(MOUTH, 18-spread, pose === 'closed' ? 12 : 8, 5+spread*2, pose === 'closed' ? 8 : 12);
    wings(TOOTH_SHADOW, [15-spread,5, 18-spread,8, 18-spread,15, 16-spread,17, 15-spread,12]);
    pair(TEETH, 16-spread, 8, 2, 6);
    if (pose !== 'closed') {
      pair(TEETH, 13-spread, 17, 3, 2); pair(TEETH, 17-spread, 18, 2, 3);
      rect(d.accent, 19, 15, 3, 4); rect(d.edge, 20, 16, 1, 2);
    }
    rect(d.dark, 18, 22, 5, 4); rect(d.light, 19, 22, 3, 1);
    // Three separated radiator bars prevent the long stern reading as a tail.
    pair(d.accent, 17, 47, 2, 1); pair(d.light, 17, 50, 2, 1);
  }

  function paintHeavy(p, d, pose, phase, sovereign) {
    const { rect, poly, pair, wings } = p;
    const royal = d === DESIGNS.flagship || d === DESIGNS.final_flagship;
    const glow = phase === 3 ? '#ff665b' : phase === 2 ? '#ffb45f' : d.accent;
    // Wing armor has small exposed mechanics and luminous engine nozzles.
    wings(INK, [1,16, 6,11, 12,15, 16,31, 13,43, 6,46, 2,38]);
    wings(d.dark, [3,17, 6,14, 10,17, 13,31, 11,40, 7,42, 4,37]);
    wings(d.hull, [4,18, 7,16, 10,20, 11,31, 8,35, 5,33]);
    pair(d.light, 4, 19, 2, 12); pair(d.edge, 4, 20, 1, 5);
    pair(INK, 6, 35, 5, 5); pair(d.accent, 7, 37, 3, 3); pair(d.edge, 8, 38, 1, 2);
    pair(d.shadow, 6, 23, 5, 2); pair(d.shadow, 6, 28, 5, 2);
    if (royal) {
      // A five-point golden crown forms the rear silhouette (top when diving).
      poly(INK, [9,33, 15,35, 17,42, 20,35, 24,47, 25,47, 29,35, 32,42, 34,35, 40,33, 37,45, 31,46, 28,49, 21,49, 18,46, 12,45]);
      wings(d.hull, [11,36, 14,37, 17,44, 20,41, 22,46, 18,44, 14,44]);
      poly(d.light, [22,38, 27,38, 26,46, 24,48, 23,44]);
      pair(d.edge, 14, 39, 1, 4); rect(d.edge, 24, 42, 1, 4);
      pair(glow, 16, 39, 2, 2);
    } else {
      wings(INK, [11,30, 16,28, 19,36, 18,47, 14,48, 10,41]);
      wings(d.hull, [13,32, 15,31, 17,37, 16,44, 14,45, 12,40]);
      pair(d.light, 13, 35, 2, 7);
    }
    poly(INK, [14,9, 20,6, 29,6, 35,9, 40,22, 37,32, 30,40, 19,40, 12,32, 9,22]);
    poly(d.shadow, [15,11, 21,8, 28,8, 34,11, 37,22, 34,30, 28,37, 21,37, 15,30, 12,22]);
    wings(d.hull, [12,22, 18,19, 22,23, 21,33, 18,34, 14,29]);
    wings(d.light, [13,23, 17,22, 19,26, 18,31, 15,28]);
    // Armored canine forehead, brow cuts and a central command gem.
    poly(d.hull, [21,24, 28,24, 30,32, 27,39, 22,39, 19,32]);
    poly(d.light, [23,27, 26,27, 28,32, 25,37, 23,35, 21,32]);
    rect(d.edge, 24, 29, 1, 5);
    pair(INK, 14, 21, 8, 5); pair(glow, 15, 22, 6, 2); pair('#fff7db', 16, 22, 2, 1);
    pair(d.dark, 14, 25, 6, 2);
    const spread = pose === 'open' ? 3 : pose === 'warning' ? 1 : 0;
    const jawY = pose === 'closed' ? 8 : pose === 'warning' ? 6 : 3;
    wings(INK, [13-spread,jawY, 20,jawY-1, 23,12, 21,21, 14,22, 9-spread,17, 9-spread,12]);
    wings(d.hull, [14-spread,jawY+2, 19,jawY+1, 21,12, 19,18, 14,19, 11-spread,16, 11-spread,12]);
    wings(d.light, [13-spread,jawY+3, 17-spread,jawY+2, 16-spread,13, 13-spread,16, 11-spread,15]);
    const mouthX = 19-spread;
    rect(MOUTH, mouthX, jawY, 11+spread*2, 18-jawY);
    const fangY = pose === 'open' ? 1 : pose === 'warning' ? 4 : 6;
    wings(TOOTH_SHADOW, [15-spread,fangY, 19-spread,fangY, 20-spread,13, 17-spread,15]);
    pair(TEETH, 16-spread, fangY, 2, pose === 'open' ? 9 : 6);
    if (pose !== 'closed') {
      pair(TEETH, 20-spread, jawY+1, 2, 4); rect(TOOTH_SHADOW, 23, jawY+1, 3, 2);
      pair(TEETH, 18-spread, 15, 3, 3); pair(TEETH, 22, 15, 2, 2);
      rect(glow, 23, 12, 3, 2);
    } else { pair(TOOTH_SHADOW, 21, 10, 2, 3); }
    rect(d.dark, 21, 18, 7, 3); rect(d.light, 22, 18, 5, 1); rect(INK, 23, 20, 3, 2);
    if (royal) {
      rect(INK, 22, 33, 5, 5); rect(glow, 23, 34, 3, 3); rect('#ffffff', 24, 34, 1, 1);
      if (phase >= 2) { pair(glow, 10, 28, 2, 4); pair(d.edge, 11, 29, 1, 1); }
      if (phase >= 3) { pair(glow, 14, 32, 2, 3); pair(glow, 19, 37, 2, 2); }
      if (sovereign) {
        // The final ship keeps its gold category but adds crimson heraldry,
        // dark horn sockets, and three command gems even in its first phase.
        pair('#9c263f', 5, 19, 3, 9); pair('#ff7770', 5, 19, 1, 6);
        pair(INK, 14, 34, 4, 4); pair('#ff6269', 15, 35, 2, 2);
        rect('#ffda7c', 23, 28, 3, 2);
      }
    }
  }

  function paint(ctx, type, pose, phase) {
    type = normalizedType(type);
    if (!ctx || !type) return false;
    const d = DESIGNS[type];
    pose = POSES.indexOf(pose) < 0 ? 'closed' : pose;
    phase = normalizedPhase(type, phase);
    ctx.clearRect(0, 0, d.width, d.height);
    ctx.imageSmoothingEnabled = false;
    const p = painter(ctx, d.width);
    if (type === 'blue') paintScout(p, d, pose);
    else if (type === 'purple') paintStalker(p, d, pose);
    else paintHeavy(p, d, pose, phase, type === 'final_flagship');
    return true;
  }

  function install(scene) {
    if (!scene || !scene.textures) return null;
    const cached = sceneCaches.get(scene);
    if (cached) return cached;
    const manager = scene.textures;
    const cache = { textureCount: 0 };
    for (let t = 0; t < TYPES.length; t++) {
      const type = TYPES[t], d = DESIGNS[type], table = KEY_TABLE[type];
      for (let phase = 1; phase < table.length; phase++) {
        for (let pose = 0; pose < POSES.length; pose++) {
          const key = table[phase][pose];
          if (!manager.exists(key)) {
            const texture = manager.createCanvas(key, d.width, d.height);
            if (!texture) continue;
            paint(texture.getContext(), type, POSES[pose], phase);
            texture.refresh();
            if (texture.setFilter) texture.setFilter(0); // Phaser.Textures.FilterMode.NEAREST
          }
          cache.textureCount++;
        }
      }
    }
    sceneCaches.set(scene, cache);
    if (scene.events && scene.events.once) {
      scene.events.once('shutdown', function () { sceneCaches.delete(scene); });
    }
    return cache;
  }

  function poseFor(enemy, timeMs) {
    const state = enemy.getData('state');
    if (state === 'returning') return 'closed';
    if (state === 'boss') {
      const phase = normalizedPhase('flagship', enemy.getData('bossPhase'));
      const shotCd = Number(enemy.getData('bossShotCdMs'));
      // Existing shot cooldown is the tell. Aggressive phases also bare the
      // jaw longer, with no timers or state added to the enemy itself.
      if (Number.isFinite(shotCd) && shotCd > 0 && shotCd <= 180) return 'warning';
      if (phase >= 3 || (phase === 2 && ((Number(timeMs) || 0) % 1100) < 420)) return 'open';
      return 'closed';
    }
    if (state === 'diveLoop') {
      const delay = Number(enemy.getData('diveDelayMs')) || 0;
      if (delay > 220) return 'closed';
      if (delay > 0 || (Number(enemy.getData('loopT')) || 0) < 0.12) return 'warning';
      return 'open';
    }
    return state === 'diveStraight' ? 'open' : 'closed';
  }

  function update(scene, enemies, timeMs) {
    if (!enemies || !install(scene)) return;
    const entries = Array.isArray(enemies) ? enemies : enemies.children && enemies.children.entries;
    if (!entries) return;
    for (let i = 0; i < entries.length; i++) {
      const enemy = entries[i];
      if (!enemy || enemy.active === false || typeof enemy.getData !== 'function') continue;
      const type = normalizedType(enemy.getData('type'));
      if (!type) continue;
      const key = textureKey(type, poseFor(enemy, timeMs), enemy.getData('bossPhase'));
      if (!enemy.texture || enemy.texture.key !== key) {
        // Phaser 3.55's setTexture always calls setFrame with resizing enabled.
        // Assign the cached texture, then explicitly disable size/origin updates.
        // No body method or gameplay setter is called, including on pooled sprites.
        enemy.texture = scene.textures.get(key);
        enemy.setFrame(undefined, false, false);
      }
    }
  }

  return Object.freeze({ POSES, TYPES, DESIGNS, getDesign, textureKey, paint, install, poseFor, update });
});
