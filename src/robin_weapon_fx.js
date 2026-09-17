// Robin's gift-colored archery effects. Presentation only: reuse the
// arcade arrow/trail/spark pools; never create bodies, timers or random events.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RobinWeaponFx = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GREEN = 0x6effaa;
  const GOLD = 0xffd66e;
  const WHITE = 0xf5ffe0;
  const MINT = 0x51ffcd;
  const AMBER = 0xffb83e;
  const LIME = 0xeeff4a;
  const ROSE = 0xff73ed;
  const ICE = 0x66cfff;
  const MODE_NAMES = ["normal", "rapid", "dual", "triple", "spread", "laser"];
  const profiles = Object.freeze({
    normal: { width: 1.1, height: 1.05, trailMs: 56, lifeMs: 110, trailAlpha: 0.38, trailLength: 1.45, tint: GOLD },
    rapid: { width: 1.05, height: 1.2, trailMs: 44, lifeMs: 120, trailAlpha: 0.68, trailLength: 1.7, tint: LIME },
    dual: { width: 1.18, height: 1.1, trailMs: 48, lifeMs: 120, trailAlpha: 0.60, trailLength: 1.5, tint: MINT },
    triple: { width: 1.3, height: 1.14, trailMs: 48, lifeMs: 120, trailAlpha: 0.62, trailLength: 1.5, tint: AMBER },
    spread: { width: 1.35, height: 1.08, trailMs: 48, lifeMs: 120, trailAlpha: 0.62, trailLength: 1.65, tint: ROSE },
    laser: { width: 1.1, height: 1.18, trailMs: 44, lifeMs: 120, trailAlpha: 0.72, trailLength: 1.2, tint: ICE },
  });
  Object.values(profiles).forEach(Object.freeze);
  const shotStyles = new WeakMap();
  const shotDirections = new WeakMap();

  function selectMode(flags) {
    const state = flags || {};
    return state.laser ? "laser" : state.spread ? "spread" : state.triple ? "triple"
      : state.dual ? "dual" : state.rapid ? "rapid" : "normal";
  }

  function descriptor(flags) {
    return Object.freeze({ mode: selectMode(flags), rapid: !!(flags && flags.rapid) });
  }

  const normalStyle = descriptor({});
  const laserStyle = descriptor({ laser: true });

  // Capture powers at the actual spawn, including when the pooled bullet is
  // reused. A flying arrow keeps its identity after power timers change.
  function capture(bullet, flags) {
    if (!bullet || (typeof bullet !== "object" && typeof bullet !== "function")) return normalStyle;
    const style = descriptor(flags);
    shotStyles.set(bullet, style);
    shotDirections.set(bullet, direction(bullet));
    return style;
  }

  function styleOf(bullet) {
    return (bullet && shotStyles.get(bullet)) ||
      (bullet && bullet.getData && bullet.getData("laser") ? laserStyle : normalStyle);
  }

  function texture(mode) { return "robin_arrow_" + mode; }

  function direction(bullet) {
    const velocity = bullet && bullet.body && bullet.body.velocity;
    const x = Number(velocity && velocity.x) || 0;
    const y = Number(velocity && velocity.y) || 0;
    const magnitude = Math.hypot(x, y);
    return magnitude > 0 ? { x: x / magnitude, y: y / magnitude } : { x: 0, y: -1 };
  }

  function buildTexture(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) return;
    const graphic = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(graphic);
    graphic.generateTexture(key, width, height);
    graphic.destroy();
  }

  function feather(graphic, y, width, color) {
    graphic.fillStyle(color, 1);
    graphic.fillTriangle(7, y, 7 - width, y - 5, 7, y + 7);
    graphic.fillTriangle(9, y, 9 + width, y - 5, 9, y + 7);
  }

  function prepare(scene) {
    if (!scene || !scene.textures || !scene.make) return;
    MODE_NAMES.forEach(mode => buildTexture(scene, texture(mode), 16, 48, graphic => {
      const color = profiles[mode].tint;
      // Bold shapes survive the game's 8–10 px projectile width. The bright
      // point is always the actual travel direction; glow never forms a hitbox.
      graphic.fillStyle(0x092d20, 0.95);
      graphic.fillRect(5, 9, 6, 34);
      graphic.fillTriangle(8, 0, 0, 16, 16, 16);
      graphic.fillStyle(color, 0.22);
      graphic.fillRect(3, 13, 10, 31);
      graphic.fillStyle(color, 1);
      graphic.fillRect(mode === "rapid" ? 6 : 5, 11, mode === "rapid" ? 4 : 6, 33);
      graphic.fillTriangle(8, 2, mode === "rapid" ? 4 : 2, 14, mode === "rapid" ? 12 : 14, 14);
      graphic.fillStyle(WHITE, 1);
      graphic.fillRect(6, 12, 4, mode === "laser" ? 30 : 22);
      graphic.fillTriangle(8, 3, 6, 11, 10, 11);
      if (mode === "normal") feather(graphic, 37, 4, GREEN);
      if (mode === "dual") {
        feather(graphic, 30, 5, MINT);
        feather(graphic, 39, 5, MINT);
      }
      if (mode === "triple") {
        feather(graphic, 23, 6, AMBER);
        feather(graphic, 32, 6, AMBER);
        feather(graphic, 40, 4, GOLD);
      }
      if (mode === "spread") {
        feather(graphic, 26, 7, ROSE);
        feather(graphic, 37, 6, ROSE);
      }
      if (mode === "rapid") {
        graphic.fillStyle(LIME, 1);
        graphic.fillRect(3, 24, 2, 15);
        graphic.fillRect(11, 29, 2, 15);
        feather(graphic, 39, 3, LIME);
      }
      if (mode === "laser") {
        graphic.fillStyle(ICE, 1);
        graphic.fillTriangle(8, 0, 0, 17, 8, 26);
        graphic.fillStyle(0xb5f4ff, 1);
        graphic.fillTriangle(8, 0, 16, 17, 8, 26);
        graphic.fillStyle(WHITE, 1);
        graphic.fillTriangle(8, 2, 6, 16, 8, 24);
        feather(graphic, 36, 5, ICE);
      }
    }));
    buildTexture(scene, "robin_arrow_wake", 16, 48, graphic => {
      graphic.fillStyle(WHITE, 0.22);
      graphic.fillTriangle(8, 0, 1, 9, 8, 48);
      graphic.fillTriangle(8, 0, 15, 9, 8, 48);
      // A 4px texture core survives downscaling as ~2 native game pixels.
      graphic.fillStyle(WHITE, 1);
      graphic.fillRect(6, 0, 4, 25);
      graphic.fillTriangle(6, 25, 10, 25, 8, 47);
    });
    buildTexture(scene, "robin_bow_accent", 32, 20, graphic => {
      graphic.fillStyle(WHITE, 1);
      // Two rising gold/green strokes resemble the snap of a curved bow.
      graphic.fillTriangle(1, 15, 3, 10, 16, 2);
      graphic.fillTriangle(31, 15, 29, 10, 16, 2);
      graphic.fillStyle(WHITE, 0.45);
      graphic.fillTriangle(4, 18, 6, 15, 16, 8);
      graphic.fillTriangle(28, 18, 26, 15, 16, 8);
    });
    buildTexture(scene, "robin_arrow_slash", 24, 24, graphic => {
      graphic.fillStyle(WHITE, 0.18);
      graphic.fillTriangle(12, 0, 5, 13, 12, 24);
      graphic.fillTriangle(12, 0, 19, 13, 12, 24);
      graphic.fillStyle(WHITE, 1);
      graphic.fillTriangle(12, 1, 10, 12, 12, 23);
      graphic.fillTriangle(12, 1, 14, 12, 12, 23);
    });
  }

  function applyArrow(visual, bullet) {
    const profile = profiles[styleOf(bullet).mode];
    visual.setTexture(texture(styleOf(bullet).mode)).clearTint()
      .setDisplaySize(bullet.displayWidth * profile.width, bullet.displayHeight * profile.height);
    return visual;
  }

  function trailInterval(bullet) {
    const style = styleOf(bullet);
    return style.rapid ? Math.min(48, profiles[style.mode].trailMs) : profiles[style.mode].trailMs;
  }

  function trail(bullet, visual) {
    const style = styleOf(bullet);
    const profile = profiles[style.mode];
    const aim = direction(bullet);
    const offset = style.mode === "laser" ? 8 : 6;
    const length = style.rapid ? Math.max(0.88, profile.trailLength) : profile.trailLength;
    return {
      texture: "robin_arrow_wake",
      x: bullet.x - aim.x * offset,
      y: bullet.y - aim.y * offset,
      scaleX: visual.displayWidth / 16 * (style.mode === "rapid" ? 1 : 0.95),
      scaleY: visual.displayHeight / 48 * length,
      rotation: Math.atan2(aim.y, aim.x) + Math.PI / 2,
      tint: profile.tint,
      alpha: profile.trailAlpha,
      lifeMs: profile.lifeMs,
      velocityX: -aim.x * 30,
      velocityY: -aim.y * 30,
    };
  }

  function spark(x, y, textureKey, scaleX, scaleY, tint, alpha, lifeMs, angle, speed) {
    return { x, y, texture: textureKey, scaleX, scaleY, tint, alpha, lifeMs,
      rotation: angle + Math.PI / 2, velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed, spin: 0 };
  }

  function muzzle(x, y, flags, shotCount) {
    const mode = selectMode(flags);
    const count = Math.max(1, Math.min(5, Number(shotCount) || 1));
    const profile = profiles[mode];
    const rapid = !!(flags && flags.rapid);
    const output = [spark(x, y + 5, "robin_bow_accent",
      mode === "spread" ? 1.1 : mode === "triple" ? 0.95 : 0.8,
      rapid ? 0.5 : 0.65, profile.tint, 0.88, rapid ? 75 : 115, -Math.PI / 2, 15)];
    // One release stroke per actual projectile (at most five); these end before
    // the next rapid shot. Partial volleys never imply extra damaging arrows.
    for (let index = 0; index < count; index++) {
      const ratio = count > 1 ? (index / (count - 1) - 0.5) * 2 : 0;
      const fan = mode === "spread" ? 0.3 : mode === "triple" ? 0.14 : 0;
      output.push(spark(x + (mode === "dual" ? ratio * 10 : ratio * 5), y - 2,
        "robin_arrow_slash", mode === "laser" ? 0.4 : 0.23,
        rapid ? 0.9 : mode === "laser" ? 1 : 0.58,
        index % 2 ? WHITE : profile.tint, 0.78, rapid ? 68 : 95,
        -Math.PI / 2 + ratio * fan, rapid ? 100 : 75));
    }
    return output;
  }

  function impact(x, y, bullet, isLaser) {
    const style = bullet ? styleOf(bullet) : (isLaser ? laserStyle : normalStyle);
    const mode = style.mode;
    const aim = (bullet && shotDirections.get(bullet)) || direction(bullet);
    const heading = Math.atan2(aim.y, aim.x);
    const profile = profiles[mode];
    const output = [spark(x, y, "robin_arrow_slash", mode === "laser" ? 0.65 : 0.42,
      mode === "laser" ? 1.4 : 0.82, WHITE, 0.92, mode === "laser" ? 140 : 115, heading, 0)];
    const count = mode === "laser" ? 4 : mode === "triple" || mode === "spread" ? 3 : 2;
    for (let index = 0; index < count; index++) {
      const angle = count === 2 ? heading + (index ? 1 : -1) * 1.15
        : heading + (index / (count - 1) - 0.5) * Math.PI;
      output.push(spark(x, y, "robin_arrow_slash", 0.2,
        mode === "rapid" ? 0.7 : 0.55, index % 2 ? profile.tint : WHITE,
        0.80, 110 + (index % 2) * 15, angle, mode === "laser" ? 90 : 65));
    }
    return output;
  }

  return Object.freeze({ prepare, capture, styleOf, selectMode, applyArrow,
    trailInterval, trail, muzzle, impact, modes: Object.freeze(MODE_NAMES.slice()) });
});
