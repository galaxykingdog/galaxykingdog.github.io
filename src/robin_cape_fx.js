// Robin's longer cloth is a single reusable display layer behind the v4 sprite.
// Coordinates are native game pixels at 42/444 scale, relative to atlas origin
// (222, 332). It never changes the player, projectiles, timers or random state.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RobinCapeFx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BASE_SCALE = 42 / 444;
  const COLORS = Object.freeze({ outline: 0x192912, dark: 0x30451d,
    cloth: 0x4a632c, fold: 0x617d37, light: 0x779247,
    emerald: 0x60ef91, bright: 0x91ffb1 });
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;

  function shieldColor(color, shielded) {
    if (!shielded) return color;
    const mix = 0.22;
    const r = Math.round((color >>> 16) * (1 - mix) + 0x88 * mix);
    const g = Math.round(((color >>> 8) & 255) * (1 - mix) + 0xcc * mix);
    const b = Math.round((color & 255) * (1 - mix) + 0xff * mix);
    return (r << 16) | (g << 8) | b;
  }

  // A stepped silhouette and hard fold bands match the existing pixel clusters.
  // The lower hem travels laterally, while the shoulder remains anchored. Its
  // lowest row is y19; the unchanged boots remain in front at y20.05.
  function geometry(pose) {
    const p = pose || {};
    const seconds = finite(p.elapsed, 0) / 1000;
    const moving = !!p.moving;
    const direction = clamp(finite(p.vx, 0) / 260, -1, 1);
    const power = p.weaponActive ? 1 : 0;
    const amplitude = moving ? 1.65 : 0.65;
    const rows = [];
    for (let y = -3; y <= 19; y++) {
      const u = (y + 3) / 22;
      const lag = -direction * 3 * u * u;
      const ripple = Math.sin(seconds * (moving ? 9 : 3.2) - u * 4.4) * amplitude * u;
      // Cape fans left from the shoulder, then falls into a tapered two-point hem.
      const left = Math.round(3 - 27 * Math.min(u / 0.64, 1) + 8 * Math.max(0, (u - 0.64) / 0.36) + lag + ripple);
      const right = Math.round(5 - 10 * u + lag + ripple * 0.5);
      // Last two rows have a small irregular cloth tip, not a straight rectangle.
      const inset = y > 17 ? (y - 17) * 2 : 0;
      rows.push({ y, left: left + inset, right: right - (y === 19 ? 2 : 0), u });
    }
    const phase = (seconds * (power ? 4.2 : 2.2)) % 8;
    const pulse = (Math.sin(seconds * 3.6) + 1) * 0.5;
    return {
      rows, power, phase,
      // At 42/444, subpixel or very faint glow vanished in the starfield. Keep
      // a visible two-pixel core outside the cloth plus a soft third/fourth pixel.
      haloWidth: power ? 4 : 3,
      glowAlpha: power ? 0.30 + pulse * 0.06 : 0.21 + pulse * 0.04,
      edgeAlpha: power ? 0.92 + pulse * 0.08 : 0.70 + pulse * 0.10,
      shielded: !!p.shielded
    };
  }

  function paint(graphic, shape) {
    graphic.clear();
    const rows = shape.rows;
    const color = key => shieldColor(COLORS[key], shape.shielded);

    // Draw OUTSIDE the silhouette: the following opaque cloth cannot cover this
    // 2–4 native-pixel aura. Integer bands retain the game's pixel-art edge.
    rows.forEach(row => {
      if (row.y < 7) return;
      graphic.fillStyle(COLORS.emerald, shape.glowAlpha * 0.4);
      graphic.fillRect(row.left - shape.haloWidth, row.y, shape.haloWidth, 1);
      graphic.fillStyle(COLORS.emerald, shape.glowAlpha * 0.8);
      graphic.fillRect(row.left - 2, row.y, 2, 1);
      graphic.fillStyle(COLORS.emerald, shape.edgeAlpha * 0.65);
      graphic.fillRect(row.left - 1, row.y, 1, 1);
    });
    const hem = rows[rows.length - 1];
    const hemWidth = Math.max(1, hem.right - hem.left + 1);
    graphic.fillStyle(COLORS.emerald, shape.glowAlpha * 0.55);
    graphic.fillRect(hem.left - 2, hem.y + 1, hemWidth + 4, 3);
    graphic.fillStyle(COLORS.emerald, shape.edgeAlpha * 0.38);
    graphic.fillRect(hem.left - 1, hem.y + 1, hemWidth + 2, 1);

    rows.forEach(row => {
      const width = Math.max(1, row.right - row.left + 1);
      graphic.fillStyle(color('outline'), 1);
      graphic.fillRect(row.left, row.y, width, 1);
      if (width < 3) return;
      graphic.fillStyle(color('cloth'), 1);
      graphic.fillRect(row.left + 1, row.y, width - 2, 1);
      const fold = row.left + Math.max(1, Math.round(width * 0.45));
      graphic.fillStyle(color('dark'), 1);
      graphic.fillRect(fold, row.y, Math.max(1, Math.round(width * 0.15)), 1);
      if (width > 5 && row.y < 18) {
        graphic.fillStyle(color('fold'), 1);
        graphic.fillRect(row.left + 1, row.y, Math.max(1, Math.round(width * 0.20)), 1);
      }
    });

    // Two short falling glyphs: one just outside the hem and one woven into it.
    // Their bright heads are two native pixels, with a short one-pixel tail.
    // The external glyph remains readable even when the body covers the cloth.
    for (let column = 0; column < 2; column++) {
      const headY = 8 + ((Math.floor(shape.phase) + column * 4) % 7);
      for (let j = 0; j < 3; j++) {
        const y = headY + j;
        const row = rows[y + 3];
        const x = row.left + (column === 0 ? -2 : 3);
        graphic.fillStyle(j === 0 && shape.power ? COLORS.bright : COLORS.emerald,
          shape.edgeAlpha * (j === 0 ? 1 : j === 1 ? 0.68 : 0.40));
        graphic.fillRect(x, y, j === 0 ? 2 : 1, 1);
      }
    }
    graphic.fillStyle(COLORS.emerald, shape.edgeAlpha * 0.72);
    rows.forEach(row => {
      if (row.y >= 12 && row.y % 2 === 0) graphic.fillRect(row.left, row.y, 1, 1);
    });
  }

  function create(scene, options) {
    const opts = options || {};
    const graphic = scene.add.graphics().setDepth(finite(opts.depth, 6.95)).setVisible(false);
    let destroyed = false;
    return {
      graphic,
      update(pose) {
        if (destroyed) return;
        const p = pose || {};
        const alpha = clamp(finite(p.alpha, 1), 0, 1);
        const visible = p.active !== false && p.visible !== false && alpha > 0;
        graphic.setVisible(visible).setActive(visible);
        if (!visible) return;
        graphic.setPosition(finite(p.x, 0), finite(p.y, 0))
          .setAngle(finite(p.angle, 0))
          .setScale(Math.max(0, finite(p.scale, BASE_SCALE)) / BASE_SCALE)
          .setAlpha(alpha);
        paint(graphic, geometry(p));
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        graphic.destroy();
      }
    };
  }

  return Object.freeze({ BASE_SCALE, COLORS, geometry, paint, create });
});
