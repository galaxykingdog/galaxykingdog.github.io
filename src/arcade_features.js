const BOSS_EVERY_N_WAVES = 5;
const FINAL_FLAGSHIP_EVERY_N = 10;
const DUAL_SHOT_DURATION_MS = 12000;
const TRIPLE_SHOT_DURATION_MS = 8000;
const RAPID_FIRE_DURATION_MS = 10000;
const SPREAD_SHOT_DURATION_MS = 10000;
const LASER_SHOT_DURATION_MS = 9000;
const SPEED_BOOST_DURATION_MS = 10000;
const SHIELD_DURATION_MS = 8000;
const MAX_PLAYER_BULLETS_DUAL = 6;
const MAX_PLAYER_BULLETS_TRIPLE = 9;
const MAX_PLAYER_BULLETS_SPREAD = 12;
const MAX_PLAYER_BULLETS_RAPID = 10;
const MAX_PRESENTS_ONSCREEN = 5;
// One reserved slot lets the boss opening supply arrive even when five kill drops remain.
const MAX_BOSS_START_PRESENTS_ONSCREEN = MAX_PRESENTS_ONSCREEN + 1;
const BOSS_WEAPON_TYPES = Object.freeze(["dual", "triple", "rapid", "spread", "laser"]);
const PRESENT_FALL_SPEED = 78;
const PRESENT_DROP_CHANCE_BASE = 0.05;
const BOSS_EXTRA_LIFE_CHANCE = 0.25;
const FINAL_EXTRA_LIFE_CHANCE = 0.30;
const PLAYER_ARROW_VISUAL_POOL_SIZE = 24;
const PLAYER_ARROW_TRAIL_POOL_SIZE = 48;
const PLAYER_ARROW_SPARK_POOL_SIZE = 40;
const ARCADE_SCORE_RULES = (typeof module !== "undefined" && module.exports)
  ? require("./scoring_rules")
  : globalThis.GKD_SCORING_RULES;

if (!ARCADE_SCORE_RULES) throw new Error("GKD scoring rules are not loaded.");

let dualShotMs = 0;
let tripleShotMs = 0;
let rapidFireMs = 0;
let spreadShotMs = 0;
let laserShotMs = 0;
let speedBoostMs = 0;
let shieldMs = 0;
let shieldCharges = 0;
let rapidFireCdMs = 0;
let presents = null;
let presentPlayerCollider = null;
let bossHpBarBg = null;
let bossHpBarFill = null;
let bossHpBarLabel = null;
let banterBanner = null;
let powerupText = null;
let activeBoss = null;
let presentSerial = 0;
const bossSupplyIssuedWaves = new Set();
let playerArrowVisualPool = [];
let playerArrowVisuals = new Map();
let playerArrowTrailPool = [];
let playerArrowSparkPool = [];

const PRESENT_TYPES = {
  dual:   { weight: 20, color: 0x33ddbb, name: "DUAL FIGHTER", banner: "DUAL FIGHTER! PEW PEW x2", bannerColor: "#66ffcc" },
  triple: { weight: 10, color: 0xffcc44, name: "TRIPLE BORK", banner: "TRIPLE BORK CANNON!", bannerColor: "#ffcc66" },
  rapid:  { weight: 15, color: 0xffee33, name: "RAPID FIRE", banner: "RAPID FIRE! HOLD SPACE!", bannerColor: "#ffff66" },
  spread: { weight: 13, color: 0xff66dd, name: "SPREAD SHOT", banner: "SPREAD SHOT! FAN OF GOOD BOYS!", bannerColor: "#ff88ff" },
  laser:  { weight: 12, color: 0x66aaff, name: "MEGA LASER", banner: "MEGA LASER! PIERCES THE PACK!", bannerColor: "#88ccff" },
  shield: { weight: 13, color: 0x88aaff, name: "BUBBLE SHIELD", banner: "BUBBLE SHIELD ON!", bannerColor: "#99bbff" },
  speed:  { weight: 11, color: 0x88ff88, name: "ZOOM ZOOM", banner: "ZOOM ZOOM! SUPER SPEED!", bannerColor: "#88ffaa" },
  bone:   { weight: 16, color: 0xffddaa, name: "BONUS BONES", banner: "BONUS BONES! YUM.", bannerColor: "#ffddaa" },
  life:   { weight: 4,  color: 0xff4466, name: "1-UP TREAT", banner: "1-UP TREAT! EXTRA LIFE!", bannerColor: "#ff6688" },
  bomb:   { weight: 8,  color: 0xff8844, name: "BARK BOMB", banner: "BARK BOMB! BULLETS GO BYE!", bannerColor: "#ffaa66" }
};

// Optional presentation only: a missing or failed voice module must never affect a run.
function arcadeRobinVoice(event, detail) {
  try {
    const voice = typeof globalThis !== "undefined" ? globalThis.RobinVoice : null;
    if (voice && typeof voice.emit === "function") voice.emit(event, detail || {});
  } catch (_) {}
}

function arcadeResetRobinVoice() {
  try {
    const voice = typeof globalThis !== "undefined" ? globalThis.RobinVoice : null;
    if (voice && typeof voice.reset === "function") voice.reset();
  } catch (_) {}
}

// The optional chapter is presentation only; failures cannot interrupt a run.
function arcadeInvasionEvent(event, detail) {
  try {
    const chapter = typeof globalThis !== "undefined" ? globalThis.GKDInvasionPresentation : null;
    if (chapter) chapter.emit(event, detail || {});
  } catch (_) {}
}

function arcadeInvasionFrame(scene, group, delta) {
  try {
    const chapter = typeof globalThis !== "undefined" ? globalThis.GKDInvasionPresentation : null;
    if (chapter) chapter.frame(scene, group, delta);
  } catch (_) {}
}

function arcadeLedgerEvent(type, extra) {
  if (typeof window === "undefined" || !window.__GKD_LEDGER_ARCADE_EVENT) return;
  window.__GKD_LEDGER_ARCADE_EVENT(type, extra || {});
}

function arcadeAwardScore(type, points, extra) {
  const amount = Math.max(0, Math.trunc(Number(points) || 0));
  score += amount;
  arcadeLedgerEvent(type, { ...(extra || {}), points: amount });
  return amount;
}

function arcadeLedgerEnemyId(enemy, fallbackType) {
  if (!enemy || typeof enemy.getData !== "function") return String(fallbackType || "enemy") + ":unknown";
  const slotKey = enemy.getData("slotKey");
  if (slotKey) return String(slotKey);
  const row = enemy.getData("row");
  const col = enemy.getData("col");
  if (row != null && col != null) return `${fallbackType || "enemy"}:${row}:${col}`;
  return String(fallbackType || "enemy") + ":unknown";
}

function arcadeRecordEnemyKill(enemy, context, points) {
  const enemyId = arcadeLedgerEnemyId(enemy, context && context.type);
  const gained = arcadeAwardScore("kill", points, {
    enemy_id: enemyId,
    enemy_type: (context && context.type) || "blue",
    enemy_state: (context && context.state) || "formation",
  });
  arcadeInvasionEvent("enemy_defeated", {
    wave, enemy_id: enemyId, type: (context && context.type) || "blue",
    x: enemy && enemy.x, y: enemy && enemy.y
  });
  return gained;
}

function arcadeRecordWaveClear(clearedWave, points) {
  arcadeInvasionEvent("wave_clear", { wave: clearedWave });
  return arcadeAwardScore("wave_clear", points, { wave: clearedWave | 0 });
}

function arcadeRecordWaveStart(nextWave) {
  arcadeLedgerEvent("wave_start", { wave: nextWave | 0, points: 0 });
}

const ARCADE_KILL_LINES = {
  blue: ["BORK!", "WOOFED!", "PUP YEET!", "SPACE FLEA!"],
  purple: ["GRAPE SMASH!", "PURPLE PANIC!", "VIOLET VAPORIZED!"],
  red: ["RED ALERT OVER!", "HOT DOG DONE!", "SCARLET SCOLDED!"],
  flagship: ["FLAGSHIP FLOPPED!", "ADMIRAL OOPS!", "BRIDGE IS TOAST!"],
  boss: ["BOSS BONKED!", "MID-BOSS MELTDOWN!"],
  final_flagship: ["FINAL FLAGSHIP: EMBARRASSED!", "GALAXY KING CROWNED!"]
};

const ARCADE_WAVE_TITLES = [
  "MILD DOG MENACE",
  "BORK FORMATION AHEAD",
  "THE TREATS HAVE TEETH",
  "SQUIRREL SQUADRON",
  "BONE TO PICK",
  "LASER LEASH PROTOCOL",
  "FETCH... WITH BULLETS",
  "NO CATS ALLOWED",
  "WAGGING WARPATH",
  "FINAL FLAGSHIP FEVER"
];

const ARCADE_BOSS_TAUNTS = [
  "WHO'S A BAD DOG? YOU!",
  "I BROUGHT EXTRA BULLETS... FOR YOU!",
  "BOW-WOW OR DIE TRYING!",
  "THIS ISN'T FETCH. THIS IS WAR.",
  "PREPARE TO BE PROFESSIONALLY BORKED!"
];

const ARCADE_DEATH_LINES = [
  "OOF. THAT WAS RUDE.",
  "SHIP GO SPLAT. AGAIN.",
  "RESPAWN TAX APPLIED.",
  "PRO TIP: DODGE THE GLOWY THINGS."
];

const ARCADE_CLEAR_LINES = [
  "WAVE CLEARED! TREATS FOR EVERYONE!",
  "FORMATION: FULLY EMBARRASSED.",
  "CLEAN SWEEP!",
  "THEY FLED TO THE DOGHOUSE."
];

function isBossWave(value) {
  return value > 0 && value % BOSS_EVERY_N_WAVES === 0;
}

function isFinalFlagshipWave(value) {
  return value > 0 && value % FINAL_FLAGSHIP_EVERY_N === 0;
}

function arcadePick(items) {
  if (!items || items.length === 0) return "";
  return items[Math.floor(POHP_vrFloat() * items.length) % items.length];
}

function arcadeWaveTitle(value) {
  if (typeof globalThis !== "undefined" && globalThis.GKDInvasionPresentation && globalThis.GKDInvasionStory) {
    return globalThis.GKDInvasionStory.title(value);
  }
  if (isFinalFlagshipWave(value)) return "FINAL FLAGSHIP";
  if (isBossWave(value)) return "BOSS FLAGSHIP";
  return ARCADE_WAVE_TITLES[(value - 1) % ARCADE_WAVE_TITLES.length];
}

function showFloatText(scene, x, y, message, color = "#ffff66", scale = 1) {
  if (!scene || !message) return;
  const text = scene.add.text(x, y, message, {
    fontSize: Math.floor(14 * scale) + "px",
    fill: color,
    fontFamily: "Courier New",
    stroke: "#000000",
    strokeThickness: 3,
    align: "center"
  }).setOrigin(0.5).setDepth(40);
  scene.tweens.add({
    targets: text,
    y: y - 42,
    alpha: 0,
    scale: 1.15,
    duration: 780,
    ease: "Cubic.easeOut",
    onComplete: () => text.destroy()
  });
}

function showBanterBanner(scene, message, color = "#ff66ff", holdMs = 1600) {
  if (!scene || !message) return;
  if (banterBanner) {
    scene.tweens.killTweensOf(banterBanner);
    banterBanner.destroy();
  }
  const banner = scene.add.text(400, 120, message, {
    fontSize: "22px",
    fill: color,
    fontFamily: "Courier New",
    stroke: "#000000",
    strokeThickness: 4,
    align: "center"
  }).setOrigin(0.5).setDepth(45).setAlpha(0);
  banterBanner = banner;
  scene.tweens.add({
    targets: banner,
    alpha: 1,
    y: 100,
    duration: 220,
    yoyo: true,
    hold: holdMs,
    onComplete: () => {
      banner.destroy();
      if (banterBanner === banner) banterBanner = null;
    }
  });
}

function setBossHpBarVisible(visible, hp, maxHp, label) {
  if (!bossHpBarBg || !bossHpBarFill || !bossHpBarLabel) return;
  bossHpBarBg.setVisible(!!visible);
  bossHpBarFill.setVisible(!!visible);
  bossHpBarLabel.setVisible(!!visible);
  if (!visible) return;
  const ratio = Phaser.Math.Clamp((hp || 0) / Math.max(1, maxHp || 1), 0, 1);
  bossHpBarFill.setScale(ratio, 1);
  if (typeof globalThis !== "undefined" && globalThis.GKDInvasionPresentation) label = label === "FINAL FLAGSHIP" ? "CROWN CARRIER" : label === "BOSS FLAGSHIP" ? "THE WARDEN" : label;
  bossHpBarLabel.setText(label || "BOSS");
}

function refreshPowerupHud() {
  if (!powerupText) return;
  const labels = [];
  if (tripleShotMs > 0) labels.push("3X " + Math.ceil(tripleShotMs / 1000) + "s");
  else if (dualShotMs > 0) labels.push("2X " + Math.ceil(dualShotMs / 1000) + "s");
  if (spreadShotMs > 0) labels.push("SPREAD " + Math.ceil(spreadShotMs / 1000) + "s");
  if (laserShotMs > 0) labels.push("LASER " + Math.ceil(laserShotMs / 1000) + "s");
  if (rapidFireMs > 0) labels.push("RAPID " + Math.ceil(rapidFireMs / 1000) + "s");
  if (speedBoostMs > 0) labels.push("SPEED " + Math.ceil(speedBoostMs / 1000) + "s");
  if (shieldCharges > 0 || shieldMs > 0) labels.push("SHIELD x" + Math.max(1, shieldCharges));
  powerupText.setText(labels.join("  |  "));
}

function tickPowerupTimers(delta) {
  dualShotMs = Math.max(0, dualShotMs - delta);
  tripleShotMs = Math.max(0, tripleShotMs - delta);
  rapidFireMs = Math.max(0, rapidFireMs - delta);
  spreadShotMs = Math.max(0, spreadShotMs - delta);
  laserShotMs = Math.max(0, laserShotMs - delta);
  speedBoostMs = Math.max(0, speedBoostMs - delta);
  shieldMs = Math.max(0, shieldMs - delta);
  rapidFireCdMs = Math.max(0, rapidFireCdMs - delta);
  if (shieldMs <= 0) shieldCharges = 0;
  refreshPowerupHud();
}

function resetArcadeFunState() {
  dualShotMs = 0;
  tripleShotMs = 0;
  rapidFireMs = 0;
  spreadShotMs = 0;
  laserShotMs = 0;
  speedBoostMs = 0;
  shieldMs = 0;
  shieldCharges = 0;
  rapidFireCdMs = 0;
  activeBoss = null;
  presentSerial = 0;
  bossSupplyIssuedWaves.clear();
  setBossHpBarVisible(false, 0, 1, "");
  clearAllPresents();
  clearPlayerArrowEffects();
  if (player && player.clearTint) player.clearTint();
  if (powerupText) powerupText.setText("");
  if (banterBanner) {
    if (banterBanner.scene) banterBanner.scene.tweens.killTweensOf(banterBanner);
    banterBanner.destroy();
    banterBanner = null;
  }
}

function playerBulletCapNow() {
  if (spreadShotMs > 0) return MAX_PLAYER_BULLETS_SPREAD;
  if (tripleShotMs > 0) return MAX_PLAYER_BULLETS_TRIPLE;
  if (rapidFireMs > 0) return MAX_PLAYER_BULLETS_RAPID;
  if (dualShotMs > 0) return MAX_PLAYER_BULLETS_DUAL;
  return MAX_PLAYER_BULLETS_ONSCREEN;
}

function playerMoveSpeedNow() {
  return speedBoostMs > 0 ? 320 : 220;
}

function ensurePresentTextures(scene) {
  Object.keys(PRESENT_TYPES).forEach((type) => {
    const key = "present_" + type;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const definition = PRESENT_TYPES[type];
    const graphic = scene.make.graphics({ x: 0, y: 0, add: false });
    graphic.fillStyle(0x111827, 1);
    graphic.fillRoundedRect(8, 8, 32, 32, 8);
    graphic.fillStyle(definition.color, 1);
    graphic.fillRoundedRect(12, 12, 24, 24, 6);
    graphic.lineStyle(2.2, 0xffffff, 0.95);
    graphic.strokeRoundedRect(12, 12, 24, 24, 6);
    graphic.fillStyle(0xffe27a, 1);
    graphic.fillRect(22, 8, 4, 32);
    graphic.fillRect(10, 22, 28, 4);
    graphic.fillStyle(0xffcc33, 1);
    graphic.fillCircle(18, 16, 4);
    graphic.fillCircle(30, 16, 4);
    graphic.fillCircle(24, 18, 3);
    graphic.fillStyle(0xffffff, 0.25);
    graphic.fillRoundedRect(15, 14, 6, 6, 2);
    graphic.fillCircle(31, 14, 3);
    graphic.generateTexture(key, 48, 48);
    graphic.destroy();
  });
}

function ensurePlayerArrowFxTexture(scene) {
  const key = "player_arrow_spark";
  if (scene.textures.exists(key)) return;
  const graphic = scene.make.graphics({ x: 0, y: 0, add: false });
  graphic.fillStyle(0x00ff99, 0.08);
  graphic.fillCircle(12, 12, 11);
  graphic.fillStyle(0x33ffbb, 0.20);
  graphic.fillCircle(12, 12, 7);
  graphic.fillStyle(0xffffaa, 0.95);
  graphic.fillCircle(12, 12, 3);
  graphic.fillStyle(0xffffff, 1);
  graphic.fillCircle(12, 12, 1.5);
  graphic.generateTexture(key, 24, 24);
  graphic.destroy();
}

function deactivatePlayerArrowFx(effect) {
  if (!effect) return;
  effect.setActive(false).setVisible(false).setPosition(-200, -200);
  effect.setAlpha(1).setScale(1).setRotation(0).clearTint();
  effect.setData("lifeMs", 0);
  effect.setData("maxLifeMs", 1);
  effect.setData("velocityX", 0);
  effect.setData("velocityY", 0);
  effect.setData("spin", 0);
  effect.setData("baseScaleX", 1);
  effect.setData("baseScaleY", 1);
  effect.setData("baseAlpha", 1);
}

function initializePlayerArrowFxPools(scene) {
  ensurePlayerArrowFxTexture(scene);
  if (typeof RobinWeaponFx !== "undefined") RobinWeaponFx.prepare(scene);
  playerArrowVisualPool = [];
  playerArrowVisuals = new Map();
  playerArrowTrailPool = [];
  playerArrowSparkPool = [];

  // These images never join a physics group. The original projectile texture,
  // scale, and body remain responsible for every collision and shot rule.
  for (let index = 0; index < PLAYER_ARROW_VISUAL_POOL_SIZE; index++) {
    const visual = scene.add.image(-200, -200, "player_arrow_skin").setDepth(18);
    deactivatePlayerArrowFx(visual);
    playerArrowVisualPool.push(visual);
  }

  for (let index = 0; index < PLAYER_ARROW_TRAIL_POOL_SIZE; index++) {
    const trail = scene.add.image(-200, -200, "player_arrow_skin")
      .setDepth(16)
      .setBlendMode(Phaser.BlendModes.ADD);
    deactivatePlayerArrowFx(trail);
    playerArrowTrailPool.push(trail);
  }

  for (let index = 0; index < PLAYER_ARROW_SPARK_POOL_SIZE; index++) {
    const spark = scene.add.image(-200, -200, "player_arrow_spark")
      .setDepth(19)
      .setBlendMode(Phaser.BlendModes.ADD);
    deactivatePlayerArrowFx(spark);
    playerArrowSparkPool.push(spark);
  }
}

function hidePlayerArrowVisual(bullet) {
  const visual = playerArrowVisuals.get(bullet);
  if (visual) deactivatePlayerArrowFx(visual);
}

function syncPlayerArrowVisual(bullet, resetEffects = false) {
  if (!bullet || !bullet.active) {
    hidePlayerArrowVisual(bullet);
    return null;
  }
  let visual = playerArrowVisuals.get(bullet);
  if (!visual) {
    visual = playerArrowVisualPool[playerArrowVisuals.size];
    if (!visual) return null;
    playerArrowVisuals.set(bullet, visual);
  }
  const isLaser = !!bullet.getData("laser");
  const velocity = bullet.body && bullet.body.velocity;
  const rotation = Math.atan2(velocity ? velocity.y : -400, velocity ? velocity.x : 0) + Math.PI / 2;
  visual
    .setPosition(bullet.x, bullet.y)
    .setDisplaySize(bullet.displayWidth, bullet.displayHeight)
    .setRotation(rotation)
    .setAlpha(1)
    .setActive(true)
    .setVisible(true);
  if (typeof RobinWeaponFx !== "undefined") RobinWeaponFx.applyArrow(visual, bullet);
  else if (isLaser) visual.setTint(0x88ddff);
  else if (spreadShotMs > 0) visual.setTint(0xffaadd);
  else visual.clearTint();
  if (resetEffects) {
    visual.setData("fxAgeMs", 0);
    visual.setData("trailCdMs", 0);
  }
  return visual;
}

function activatePlayerArrowFx(effect, settings) {
  if (!effect) return false;
  const lifeMs = Math.max(1, settings.lifeMs || 120);
  if (settings.texture) effect.setTexture(settings.texture);
  effect
    .setPosition(settings.x, settings.y)
    .setScale(settings.scaleX, settings.scaleY)
    .setRotation(settings.rotation || 0)
    .setTint(settings.tint)
    .setAlpha(settings.alpha)
    .setActive(true)
    .setVisible(true);
  effect.setData("lifeMs", lifeMs);
  effect.setData("maxLifeMs", lifeMs);
  effect.setData("velocityX", settings.velocityX || 0);
  effect.setData("velocityY", settings.velocityY || 0);
  effect.setData("spin", settings.spin || 0);
  effect.setData("baseScaleX", settings.scaleX);
  effect.setData("baseScaleY", settings.scaleY);
  effect.setData("baseAlpha", settings.alpha);
  return true;
}

function spawnPlayerArrowTrailFx(bullet) {
  if (!bullet || !bullet.active) return;
  const visual = playerArrowVisuals.get(bullet);
  if (!visual || !visual.active) return;
  const trail = playerArrowTrailPool.find(effect => !effect.active);
  if (!trail) return;
  if (typeof RobinWeaponFx !== "undefined") {
    activatePlayerArrowFx(trail, RobinWeaponFx.trail(bullet, visual));
    return;
  }
  const isLaser = !!bullet.getData("laser");
  activatePlayerArrowFx(trail, {
    x: bullet.x,
    y: bullet.y + (isLaser ? 7 : 5),
    scaleX: visual.scaleX * 1.05,
    scaleY: visual.scaleY * 0.65,
    rotation: visual.rotation,
    tint: isLaser ? 0x62d8ff : 0x35ff91,
    alpha: isLaser ? 0.24 : 0.16,
    lifeMs: isLaser ? 110 : 90,
    velocityY: isLaser ? 85 : 65,
  });
}

function spawnPlayerArrowSparkFx(x, y, settings) {
  const spark = playerArrowSparkPool.find(effect => !effect.active);
  if (!spark) return;
  activatePlayerArrowFx(spark, {
    x,
    y,
    texture: settings.texture,
    scaleX: settings.scaleX,
    scaleY: settings.scaleY,
    rotation: settings.rotation || 0,
    tint: settings.tint,
    alpha: settings.alpha,
    lifeMs: settings.lifeMs,
    velocityX: settings.velocityX,
    velocityY: settings.velocityY,
    spin: settings.spin || 0,
  });
}

function currentPlayerArrowStyle() {
  return { laser: laserShotMs > 0, spread: spreadShotMs > 0,
    triple: tripleShotMs > 0, dual: dualShotMs > 0, rapid: rapidFireMs > 0 };
}

function spawnPlayerArrowMuzzleFx(scene, x, y, isLaser, shotCount) {
  if (!scene || !playerArrowSparkPool.length) return;
  if (typeof RobinWeaponFx !== "undefined") {
    const flags = currentPlayerArrowStyle();
    flags.laser = isLaser;
    RobinWeaponFx.muzzle(x, y, flags, shotCount).forEach(settings => {
      spawnPlayerArrowSparkFx(settings.x, settings.y, settings);
    });
    return;
  }
  const tint = isLaser ? 0x55ccff : 0xffee77;
  const strength = Phaser.Math.Clamp(Number(shotCount) || 1, 1, 5);
  spawnPlayerArrowSparkFx(x, y - 7, {
    scaleX: isLaser ? 0.72 : 0.50,
    scaleY: isLaser ? 1.00 : 0.70,
    tint,
    alpha: 0.72,
    lifeMs: 90,
    velocityX: 0,
    velocityY: -90,
  });
  for (let index = 0; index < 2; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const tier = Math.floor(index / 2) + 1;
    spawnPlayerArrowSparkFx(x + side * (5 + tier * 2), y - 2 + tier * 2, {
      scaleX: 0.34 + strength * 0.035,
      scaleY: 0.50 + strength * 0.045,
      tint: tier === 1 ? tint : 0x36ff99,
      alpha: 0.52,
      lifeMs: 70 + tier * 20,
      velocityX: side * (35 + tier * 18),
      velocityY: -18 - tier * 12,
      spin: side * 4,
    });
  }
}

function spawnPlayerArrowImpactFx(scene, x, y, isLaser, bullet) {
  if (!scene || !playerArrowSparkPool.length) return;
  if (typeof RobinWeaponFx !== "undefined") {
    RobinWeaponFx.impact(x, y, bullet, isLaser).forEach(settings => {
      spawnPlayerArrowSparkFx(settings.x, settings.y, settings);
    });
    return;
  }
  const tint = isLaser ? 0x55ccff : 0xffdd55;
  const particles = isLaser ? 6 : 4;
  spawnPlayerArrowSparkFx(x, y, {
    scaleX: isLaser ? 1.00 : 0.68,
    scaleY: isLaser ? 1.00 : 0.68,
    tint,
    alpha: 0.82,
    lifeMs: isLaser ? 145 : 110,
    velocityX: 0,
    velocityY: 0,
  });
  for (let index = 0; index < particles; index++) {
    const angle = (Math.PI * 2 * index) / particles;
    const speed = (isLaser ? 105 : 78) + (index % 3) * 14;
    spawnPlayerArrowSparkFx(x, y, {
      scaleX: isLaser ? 0.45 : 0.34,
      scaleY: isLaser ? 0.68 : 0.52,
      rotation: angle + Math.PI / 2,
      tint: index % 2 === 0 ? tint : 0x39ff9d,
      alpha: 0.70,
      lifeMs: 110 + (index % 3) * 18,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      spin: index % 2 === 0 ? 5 : -5,
    });
  }
}

function updatePlayerArrowFxPool(pool, delta, expands) {
  const dt = Math.max(0, Number(delta) || 0) / 1000;
  pool.forEach(effect => {
    if (!effect.active) return;
    const lifeMs = Math.max(0, (effect.getData("lifeMs") || 0) - delta);
    const maxLifeMs = Math.max(1, effect.getData("maxLifeMs") || 1);
    const ratio = lifeMs / maxLifeMs;
    const progress = 1 - ratio;
    effect.setData("lifeMs", lifeMs);
    effect.x += (effect.getData("velocityX") || 0) * dt;
    effect.y += (effect.getData("velocityY") || 0) * dt;
    effect.rotation += (effect.getData("spin") || 0) * dt;
    const baseScaleX = effect.getData("baseScaleX") || 1;
    const baseScaleY = effect.getData("baseScaleY") || 1;
    const stretch = expands ? (1 + progress * 0.7) : (1 + progress * 0.18);
    effect.setScale(baseScaleX * stretch, baseScaleY * (1 - progress * 0.22));
    effect.setAlpha((effect.getData("baseAlpha") || 1) * ratio * ratio);
    if (lifeMs <= 0) deactivatePlayerArrowFx(effect);
  });
}

function updatePlayerArrowEffects(delta) {
  if (playerBullets && playerBullets.children && playerBullets.children.entries) {
    playerBullets.children.entries.forEach(bullet => {
      const visual = syncPlayerArrowVisual(bullet);
      if (!visual) return;
      const isLaser = !!bullet.getData("laser");
      const ageMs = (visual.getData("fxAgeMs") || 0) + delta;
      let trailCdMs = (visual.getData("trailCdMs") || 0) - delta;
      if (trailCdMs <= 0) {
        spawnPlayerArrowTrailFx(bullet);
        const interval = typeof RobinWeaponFx !== "undefined"
          ? RobinWeaponFx.trailInterval(bullet) : (isLaser ? 40 : 56);
        // Keep the fractional frame remainder so a 44 ms wake does not silently
        // become 50 ms at 60 Hz. A hitch still emits at most one wake per arrow.
        trailCdMs = Math.max(0, trailCdMs + interval);
      }
      visual.setData("fxAgeMs", ageMs);
      visual.setData("trailCdMs", trailCdMs);
      visual.setAlpha(0.96 + Math.sin(ageMs / (isLaser ? 28 : 46)) * 0.04);
    });
  }
  updatePlayerArrowFxPool(playerArrowTrailPool, delta, false);
  updatePlayerArrowFxPool(playerArrowSparkPool, delta, true);
}

function clearPlayerArrowEffects() {
  playerArrowVisualPool.forEach(deactivatePlayerArrowFx);
  playerArrowTrailPool.forEach(deactivatePlayerArrowFx);
  playerArrowSparkPool.forEach(deactivatePlayerArrowFx);
}

function initializeArcadeFeaturePools(scene) {
  presents = scene.physics.add.group();
  ensurePresentTextures(scene);
  for (let index = 0; index < 10; index++) {
    const present = scene.physics.add.sprite(-200, -200, "present_dual");
    present.setDepth(25);
    present.setData("fromKill", false);
    if (present.body) {
      present.body.setAllowGravity(false);
      present.body.setSize(26, 26, true);
    }
    presents.add(present);
    disablePresent(present);
  }
  initializePlayerArrowFxPools(scene);
}

function initializeArcadeFeatureUi(scene) {
  try {
    if (globalThis.GKDInvasionPresentation) globalThis.GKDInvasionPresentation.init(scene, enemies);
  } catch (_) {}
  bossHpBarBg = scene.add.rectangle(400, 28, 280, 12, 0x331111, 0.85).setDepth(46).setVisible(false);
  bossHpBarFill = scene.add.rectangle(260, 28, 280, 12, 0xff3355, 0.95).setOrigin(0, 0.5).setDepth(47).setVisible(false);
  bossHpBarLabel = scene.add.text(400, 12, "BOSS", {
    fontSize: "14px",
    fill: "#ffcc66",
    fontFamily: "Courier New",
    stroke: "#000000",
    strokeThickness: 3
  }).setOrigin(0.5).setDepth(48).setVisible(false);
  powerupText = scene.add.text(790, 150, "", {
    fontSize: "14px",
    fill: "#66ffcc",
    fontFamily: "Courier New",
    align: "right",
    stroke: "#000000",
    strokeThickness: 3
  }).setOrigin(1, 0).setDepth(48);
  presentPlayerCollider = scene.physics.add.overlap(player, presents, collectPresent, null, scene);
}

function disablePresent(present) {
  if (!present) return;
  if (present.scene && present.scene.tweens) present.scene.tweens.killTweensOf(present);
  present.setActive(false);
  present.setVisible(false);
  present.setAlpha(1);
  present.setAngle(0);
  present.setData("presentType", null);
  present.setData("giftId", null);
  present.setData("sourceEnemyId", null);
  present.setData("lifeMs", 0);
  present.setData("fromKill", false);
  present.setData("giftSource", null);
  present.setData("supplyWave", null);
  if (present.body) {
    present.body.enable = false;
    present.body.setVelocity(0, 0);
    if (typeof present.body.stop === "function") present.body.stop();
  }
  present.setPosition(-200, -200);
}

function clearAllPresents() {
  if (!presents) return;
  presents.children.entries.forEach(disablePresent);
}

function activePresentCount() {
  return presents ? presents.countActive(true) : 0;
}

function pickPresentType(preferGood) {
  const entries = Object.keys(PRESENT_TYPES).map((key) => ({ key, weight: PRESENT_TYPES[key].weight }));
  if (preferGood) {
    entries.forEach((entry) => {
      if (entry.key === "triple" || entry.key === "laser" || entry.key === "life" || entry.key === "bomb") entry.weight *= 1.8;
      if (entry.key === "bone") entry.weight *= 0.6;
    });
  }
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = POHP_grFloat() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.key;
  }
  return "dual";
}

function spawnPresent(scene, x, y, forcedType, options) {
  if (!scene || !presents || !options) return null;
  const bossSupply = options.bossSupply && options.bossSupply === activeBoss &&
    activeBoss.active && activeBoss.getData("isBoss") && scene === activeBoss.scene &&
    isBossWave(wave) && !bossSupplyIssuedWaves.has(wave) && BOSS_WEAPON_TYPES.includes(forcedType);
  if (!bossSupply && options.fromKill !== true) return null;
  const limit = bossSupply ? MAX_BOSS_START_PRESENTS_ONSCREEN : MAX_PRESENTS_ONSCREEN;
  if (gamePhase !== GAME_PHASE.RUNNING || activePresentCount() >= limit) return null;
  const type = forcedType || pickPresentType(false);
  const present = presents.getFirstDead(false);
  if (!present) return null;
  present.setTexture("present_" + (PRESENT_TYPES[type] ? type : "dual"));
  present.setActive(true);
  present.setVisible(true);
  present.setAlpha(1);
  present.setScale(0.8);
  present.clearTint();
  present.setData("presentType", PRESENT_TYPES[type] ? type : "dual");
  if (!bossSupply) presentSerial += 1;
  const giftId = bossSupply ? `w${wave}:boss-supply` : `w${wave}:gift:${presentSerial}`;
  const sourceEnemyId = bossSupply ? arcadeLedgerEnemyId(activeBoss, "boss") : String(options.sourceEnemyId || "");
  present.setData("giftId", giftId);
  present.setData("sourceEnemyId", sourceEnemyId);
  present.setData("lifeMs", 12000);
  present.setData("fromKill", !bossSupply);
  present.setData("giftSource", bossSupply ? "boss_supply" : "kill");
  present.setData("supplyWave", bossSupply ? wave : null);
  if (bossSupply) bossSupplyIssuedWaves.add(wave);
  present.setPosition(Phaser.Math.Clamp(x, 40, 760), Phaser.Math.Clamp(y, 40, 520));
  if (present.body) {
    present.body.enable = true;
    present.body.reset(present.x, present.y);
    present.body.setAllowGravity(false);
    present.body.setSize(26, 26, true);
    present.body.setVelocity(bossSupply ? 0 : POHP_grFloatBetween(-30, 30), PRESENT_FALL_SPEED);
  }
  scene.tweens.add({
    targets: present,
    angle: { from: -12, to: 12 },
    duration: 380,
    yoyo: true,
    repeat: 8
  });
  showFloatText(scene, present.x, present.y - 18, bossSupply ? "WEAPON SUPPLY!" : "PRESENT!", "#ffe066", 0.9);
  arcadeLedgerEvent(bossSupply ? "boss_supply" : "gift_spawn", {
    enemy_id: giftId,
    enemy_type: PRESENT_TYPES[type] ? type : "dual",
    enemy_state: sourceEnemyId,
    points: 0,
  });
  return present;
}

function spawnBossStartWeapon(scene, boss) {
  if (gamePhase !== GAME_PHASE.RUNNING || !scene || boss !== activeBoss || !boss || !boss.active ||
      !boss.getData("isBoss") || !isBossWave(wave) || bossSupplyIssuedWaves.has(wave)) return null;
  const type = BOSS_WEAPON_TYPES[Math.min(BOSS_WEAPON_TYPES.length - 1, Math.floor(POHP_grFloat() * BOSS_WEAPON_TYPES.length))];
  const x = player && player.active ? player.x : 400;
  const present = spawnPresent(scene, x, 220, type, { bossSupply: boss });
  if (present) arcadeInvasionEvent("boss_supply", { wave, type, gift_id: present.getData("giftId"), x: present.x, y: present.y });
  return present;
}

function hasPresentProvenance(present) {
  if (present.getData("fromKill") === true) return true;
  const supplyWave = present.getData("supplyWave");
  return present.getData("giftSource") === "boss_supply" && bossSupplyIssuedWaves.has(supplyWave) &&
    present.getData("giftId") === `w${supplyWave}:boss-supply` &&
    present.getData("sourceEnemyId") === "boss:0" && BOSS_WEAPON_TYPES.includes(present.getData("presentType"));
}

function presentDropChanceForEnemy(enemyType, aliveRatio = 1) {
  let chance = PRESENT_DROP_CHANCE_BASE;
  if (enemyType === "purple") chance = 0.05;
  if (enemyType === "red") chance = 0.06;
  if (enemyType === "flagship") chance = 0.08;
  if (enemyType === "boss") chance = 0.10;
  if (enemyType === "final_flagship") chance = 0.12;
  if (aliveRatio < 0.35) chance += 0.02;
  return chance;
}

function maybeDropPresentFromKill(scene, x, y, enemyType, sourceEnemyId) {
  if (!scene || gamePhase !== GAME_PHASE.RUNNING) return;
  const type = enemyType || "blue";
  const killOptions = { fromKill: true, sourceEnemyId };
  if (type === "boss" || type === "final_flagship") {
    const lifeChance = type === "final_flagship" ? FINAL_EXTRA_LIFE_CHANCE : BOSS_EXTRA_LIFE_CHANCE;
    if (POHP_grFloat() < lifeChance) spawnPresent(scene, x, y, "life", killOptions);
  }
  const chance = presentDropChanceForEnemy(type, aliveRatioNow());
  if (POHP_grFloat() > chance) return;
  const preferGood = type === "flagship" || type === "boss" || type === "final_flagship" || type === "red";
  let giftType = pickPresentType(preferGood);
  if (type === "final_flagship" && POHP_grFloat() < 0.25) {
    giftType = POHP_grFloat() < 0.5 ? "triple" : "laser";
  } else if (type === "boss" && POHP_grFloat() < 0.15) {
    giftType = "bomb";
  }
  spawnPresent(scene, x, y, giftType, killOptions);
}

function updatePresents(delta) {
  if (!presents) return;
  presents.children.entries.forEach((present) => {
    if (!present) return;
    if (present.active && !hasPresentProvenance(present)) {
      disablePresent(present);
      return;
    }
    if (!present.active) return;
    const lifeMs = (present.getData("lifeMs") || 0) - delta;
    present.setData("lifeMs", lifeMs);
    if (lifeMs < 2500) present.setAlpha(Math.floor(lifeMs / 120) % 2 ? 0.35 : 1);
    if (present.y > 560 && present.body) {
      present.y = 560;
      present.body.reset(present.x, present.y);
      present.body.setVelocity(present.body.velocity.x * 0.4, 0);
    }
    if (lifeMs <= 0 || present.y > 640 || present.x < -40 || present.x > 840) disablePresent(present);
  });
}

function arcadeSyncScore(updateHighScore = false) {
  if (scoreText) scoreText.setText("SCORE: " + score);
  if (typeof onArcadeScoreChanged === "function") onArcadeScoreChanged();
  if (!updateHighScore) return;
  const gotNewHigh = maybeUpdateHighScore();
  if (gotNewHigh && highScoreText) {
    highScoreText.setText("HI-SCORE: " + highScore);
    saveScores();
  }
}

function collectPresent(playerObject, present) {
  if (gamePhase !== GAME_PHASE.RUNNING || playerState !== PLAYER_STATE.PLAYING) return;
  if (!present || !present.active || !playerObject || !playerObject.active || !hasPresentProvenance(present)) return;
  const type = present.getData("presentType") || "dual";
  const giftId = String(present.getData("giftId") || "");
  const definition = PRESENT_TYPES[type] || PRESENT_TYPES.dual;
  const scene = present.scene || mainScene;
  const supplyWave = present.getData("giftSource") === "boss_supply" ? present.getData("supplyWave") : null;
  disablePresent(present);
  arcadeRobinVoice("powerup", { type: PRESENT_TYPES[type] ? type : "dual" });
  applyPresentPower(type, scene, playerObject.x, playerObject.y, giftId);
  if (supplyWave != null) arcadeInvasionEvent("boss_supply_collected", { wave, supply_wave: supplyWave, type, gift_id: giftId });
  showFloatText(scene, playerObject.x, playerObject.y - 36, definition.name + "!", definition.bannerColor, 1.1);
  showBanterBanner(scene, definition.banner, definition.bannerColor, 1100);
}

function applyPresentPower(type, scene, x, y, giftId) {
  if (type === "dual") {
    dualShotMs = Math.max(dualShotMs, DUAL_SHOT_DURATION_MS);
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: type, points: 0 });
  }
  else if (type === "triple") {
    tripleShotMs = Math.max(tripleShotMs, TRIPLE_SHOT_DURATION_MS);
    dualShotMs = Math.max(dualShotMs, Math.floor(DUAL_SHOT_DURATION_MS * 0.5));
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: type, points: 0 });
  } else if (type === "rapid") {
    rapidFireMs = Math.max(rapidFireMs, RAPID_FIRE_DURATION_MS);
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: type, points: 0 });
  } else if (type === "spread") {
    spreadShotMs = Math.max(spreadShotMs, SPREAD_SHOT_DURATION_MS);
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: type, points: 0 });
  } else if (type === "laser") {
    laserShotMs = Math.max(laserShotMs, LASER_SHOT_DURATION_MS);
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: type, points: 0 });
  } else if (type === "speed") {
    speedBoostMs = Math.max(speedBoostMs, SPEED_BOOST_DURATION_MS);
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: type, points: 0 });
  }
  else if (type === "shield") {
    shieldMs = Math.max(shieldMs, SHIELD_DURATION_MS);
    shieldCharges = Math.max(shieldCharges, 1);
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: type, points: 0 });
  } else if (type === "bone") {
    const bonus = ARCADE_SCORE_RULES.boneGiftMinimum(wave) + POHP_grBetween(0, ARCADE_SCORE_RULES.BONE_GIFT_VARIANCE);
    arcadeAwardScore("gift_collect", bonus, { enemy_id: giftId, enemy_type: type });
    arcadeSyncScore(true);
    showFloatText(scene, x, y - 50, "+" + bonus + " BONES", "#ffdd88", 1.05);
  } else if (type === "life") {
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: type, points: 0 });
    const previousLives = lives;
    lives = Math.min(lives + 1, 6);
    if (livesText) livesText.setText("LIVES: " + lives);
    if (lives > previousLives && window.__GKD_LEDGER_ARCADE_EVENT) {
      window.__GKD_LEDGER_ARCADE_EVENT("life_gain", {
        lives,
        enemy_id: giftId,
        enemy_type: "life",
        points: 0,
        client_score: -1
      });
    }
    showFloatText(scene, x, y - 50, "EXTRA LIFE!", "#ff6688", 1.2);
  } else if (type === "bomb") {
    arcadeAwardScore("gift_collect", ARCADE_SCORE_RULES.BOMB_GIFT_POINTS, { enemy_id: giftId, enemy_type: type });
    arcadeSyncScore(true);
    triggerBarkBomb(scene);
  } else {
    dualShotMs = Math.max(dualShotMs, DUAL_SHOT_DURATION_MS);
    arcadeLedgerEvent("gift_collect", { enemy_id: giftId, enemy_type: "dual", points: 0 });
  }
  refreshPowerupHud();
}

function triggerBarkBomb(scene) {
  if (enemyBullets) enemyBullets.children.entries.forEach((bullet) => {
    if (bullet && bullet.active) disableBullet(bullet);
  });
  if (enemies) {
    enemies.children.entries.slice().forEach((enemy) => {
      if (!enemy || !enemy.active) return;
      if (enemy.getData("isBoss")) {
        const hp = Math.max(0, (enemy.getData("hp") || 1) - 3);
        enemy.setData("hp", hp);
        setBossHpBarVisible(true, hp, enemy.getData("maxHp") || 1,
          enemy.getData("type") === "final_flagship" ? "FINAL FLAGSHIP" : "BOSS FLAGSHIP");
        if (hp <= 0) bombFinishEnemy(scene, enemy);
        else {
          showFloatText(scene, enemy.x, enemy.y, "BOOM -3", "#ff8844", 0.9);
          enemy.setTint(0xffaa66);
          scene.time.delayedCall(80, () => { if (enemy.active) enemy.clearTint(); });
        }
      } else {
        bombFinishEnemy(scene, enemy);
      }
    });
  }
  if (scene) {
    const flash = scene.add.rectangle(400, 300, 800, 600, 0xffaa44, 0.35).setDepth(30);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 280, onComplete: () => flash.destroy() });
  }
  arcadeSyncScore(true);
}

function bombFinishEnemy(scene, enemy) {
  if (!enemy || !enemy.active) return;
  const type = enemy.getData("type") || "blue";
  const wasBoss = !!enemy.getData("isBoss");
  const x = enemy.x;
  const y = enemy.y;
  const enemyId = arcadeLedgerEnemyId(enemy, type);
  const enemyState = enemy.getData("state") || "formation";
  enemy.setActive(false);
  enemy.setVisible(false);
  if (enemy.body) {
    enemy.body.enable = false;
    enemy.body.setVelocity(0, 0);
  }
  AI_onEnemyKilled(type);
  const gained = ARCADE_SCORE_RULES.bombKillPoints(type);
  if (wasBoss) {
    activeBoss = null;
    setBossHpBarVisible(false, 0, 1, "");
    arcadeRobinVoice("boss_defeated", { wave, finalBoss: type === "final_flagship" });
    arcadeInvasionEvent("boss_defeated", { wave });
  }
  arcadeAwardScore("bomb_kill", gained, {
    enemy_id: enemyId,
    enemy_type: type,
    enemy_state: enemyState,
  });
  arcadeInvasionEvent("enemy_defeated", { wave, enemy_id: enemyId, type, x, y });
  arcadeSyncScore(true);
  if (scene) {
    const explosion = scene.add.sprite(x, y, "explosion").setScale(wasBoss ? 1.6 : 0.9);
    scene.time.delayedCall(280, () => explosion.destroy());
  }
  if (enemies && enemies.countActive(true) === 0) maybeStartNextWave(scene || mainScene);
}

function fireOnePlayerBullet(x, y, velocityX, velocityY, options) {
  const bullet = playerBullets.getFirstDead(false);
  if (!bullet) return false;
  const settings = options || {};
  const isLaser = laserShotMs > 0 || settings.laser;
  bullet.setActive(true);
  bullet.setVisible(true);
  bullet.setAlpha(0);
  bullet.setScale(settings.scale || (isLaser ? 0.95 : 0.6));
  if (isLaser) {
    bullet.setTint(0x66ccff);
    bullet.setData("pierce", settings.pierce != null ? settings.pierce : 3);
    bullet.setData("laser", true);
  } else if (spreadShotMs > 0) {
    bullet.setTint(0xff66dd);
    bullet.setData("pierce", 0);
    bullet.setData("laser", false);
  } else {
    bullet.clearTint();
    bullet.setData("pierce", 0);
    bullet.setData("laser", false);
  }
  setupBulletBody(bullet, "player");
  if (isLaser && bullet.body) {
    const width = bullet.displayWidth || 8;
    const height = bullet.displayHeight || 16;
    bullet.body.setSize(Math.max(6, Math.floor(width * 0.85)), Math.max(12, Math.floor(height * 0.95)), true);
  }
  bullet.setPosition(x, y);
  if (bullet.body) {
    bullet.body.enable = true;
    bullet.body.reset(x, y);
    bullet.body.setVelocity(velocityX || 0, velocityY || -400);
  }
  if (typeof RobinWeaponFx !== "undefined") {
    const flags = currentPlayerArrowStyle();
    flags.laser = !!isLaser;
    RobinWeaponFx.capture(bullet, flags);
  }
  syncPlayerArrowVisual(bullet, true);
  return true;
}

function shootEnemyBulletAngled(x, y, velocityX, velocityY, scale = 0.55) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const cap = Math.max(maxEnemyBulletsNow() + 6, 14);
  if (enemyBullets && enemyBullets.countActive(true) >= cap) return false;
  const bullet = enemyBullets.getFirstDead(false);
  if (!bullet) return false;
  bullet.setActive(true);
  bullet.setVisible(true);
  bullet.setScale(scale);
  bullet.clearTint();
  setupBulletBody(bullet, "enemy");
  bullet.setPosition(x, y);
  if (bullet.body) {
    bullet.body.enable = true;
    bullet.body.reset(x, y);
    bullet.body.setVelocity(velocityX || 0, velocityY || ENEMY_BULLET_SPEED_PPS);
  }
  return true;
}

function bossFanShot(x, y, count, speed, spreadDegrees) {
  const amount = Math.max(3, count | 0);
  const half = (amount - 1) / 2;
  const spread = (spreadDegrees || 50) * Math.PI / 180;
  for (let index = 0; index < amount; index++) {
    const ratio = half === 0 ? 0 : (index - half) / half;
    const angle = Math.PI / 2 + ratio * spread * 0.5;
    shootEnemyBulletAngled(x, y + 12, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.58);
  }
}

function bossRingShot(x, y, count, speed) {
  const amount = Math.max(6, count | 0);
  for (let index = 0; index < amount; index++) {
    const angle = index / amount * Math.PI * 2 + POHP_grFloat() * 0.08;
    shootEnemyBulletAngled(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.5);
  }
}

function bossMaxHpForWave(value) {
  return ARCADE_SCORE_RULES.bossMaxHp(isFinalFlagshipWave(value) ? "final_flagship" : "boss", value);
}

function createBossEncounter(scene) {
  enemies.clear(true, true);
  enemyFormation = [];
  enemyDirection = 1;
  formationSwayMs = 0;
  formationSwayPrev = 0;
  formationMoveAccPx = 0;
  formationTotalAtWave = 0;
  activeBoss = null;
  const finalBoss = isFinalFlagshipWave(wave);
  const bossType = finalBoss ? "final_flagship" : "boss";
  const maxHp = bossMaxHpForWave(wave);
  const bossHomeY = finalBoss ? 110 : 80;
  const escortHomeY = 150;
  if (!finalBoss) {
    [220, 320, 480, 580].forEach((x, index) => {
      const type = index % 2 === 0 ? "red" : "purple";
      const escort = scene.physics.add.sprite(x, escortHomeY, "enemy_" + type);
      escort.setScale(0.65);
      escort.setData("formationScale", 0.65);
      setupEnemyBody(escort, type);
      escort.setData("row", 1);
      escort.setData("col", index);
      escort.setData("slotKey", "escort:" + index);
      escort.setData("type", type);
      escort.setData("kernel", type);
      escort.setData("fShotCdMs", 0);
      escort.setData("homeX", x);
      escort.setData("homeY", escortHomeY);
      escort.setData("state", "formation");
      escort.setData("stateMs", 0);
      escort.setData("offscreenMs", 0);
      escort.setData("loopT", 0);
      escort.setData("loopDir", 1);
      escort.setData("diveTargetX", x);
      escort.setData("prevX", x);
      escort.setData("prevY", escortHomeY);
      escort.setRotation(ENEMY_FORMATION_ROT);
      enemies.add(escort);
      formationTotalAtWave += 1;
      if (!enemyFormation[1]) enemyFormation[1] = [];
      enemyFormation[1][index] = escort;
    });
  }
  const boss = scene.physics.add.sprite(400, bossHomeY, "enemy_flagship");
  const bossScale = finalBoss ? 1.45 : 1.2;
  boss.setScale(bossScale);
  boss.setData("formationScale", bossScale);
  boss.setData("row", 0);
  boss.setData("col", 0);
  boss.setData("slotKey", "boss:0");
  boss.setData("type", bossType);
  boss.setData("kernel", "flagship");
  boss.setData("fShotCdMs", 0);
  boss.setData("homeX", 400);
  boss.setData("homeY", bossHomeY);
  boss.setData("state", "boss");
  boss.setData("stateMs", 0);
  boss.setData("offscreenMs", 0);
  boss.setData("isBoss", true);
  boss.setData("hp", maxHp);
  boss.setData("maxHp", maxHp);
  boss.setData("bossPhase", 1);
  boss.setData("bossShotCdMs", 900);
  boss.setData("bossPattern", 0);
  boss.setData("bossSwayT", 0);
  boss.setData("bossVelocityX", 0);
  boss.setData("bossVelocityY", 0);
  boss.setData("loopT", 0);
  boss.setData("loopDir", 1);
  boss.setData("diveTargetX", 400);
  boss.setData("prevX", 400);
  boss.setData("prevY", bossHomeY);
  boss.setRotation(ENEMY_FORMATION_ROT);
  if (boss.body) {
    boss.body.setSize(49, 42, true);
  }
  enemies.add(boss);
  formationTotalAtWave += 1;
  enemyFormation[0] = [boss];
  activeBoss = boss;
  totalEnemiesSpawnedAtWaveStart = formationTotalAtWave;
  resetDiveDirectorForWave();
  if (gamePhase === GAME_PHASE.RUNNING) {
    const title = finalBoss ? "FINAL FLAGSHIP INCOMING" : "BOSS FLAGSHIP INCOMING";
    showBanterBanner(scene, title + "\n" + arcadePick(ARCADE_BOSS_TAUNTS), finalBoss ? "#ff4444" : "#ffaa33", 2200);
  }
  setBossHpBarVisible(true, maxHp, maxHp, finalBoss ? "FINAL FLAGSHIP" : "BOSS FLAGSHIP");
  spawnBossStartWeapon(scene, boss);
}

function updateBossAI(delta) {
  if (!enemies) return;
  enemies.children.entries.forEach((enemy) => {
    if (!enemy || !enemy.active || !enemy.getData("isBoss")) return;
    const hp = enemy.getData("hp") || 1;
    const maxHp = enemy.getData("maxHp") || 1;
    const hpRatio = hp / maxHp;
    const phase = hpRatio > 0.66 ? 1 : (hpRatio > 0.33 ? 2 : 3);
    const previousPhase = enemy.getData("bossPhase");
    enemy.setData("bossPhase", phase);
    if (previousPhase !== phase) arcadeRobinVoice("boss_phase", { wave, phase });
    setBossHpBarVisible(true, hp, maxHp, enemy.getData("type") === "final_flagship" ? "FINAL FLAGSHIP" : "BOSS FLAGSHIP");
    if (enemy.getData("state") !== "boss") return;
    const swayTime = (enemy.getData("bossSwayT") || 0) + delta;
    enemy.setData("bossSwayT", swayTime);
    const amplitude = isFinalFlagshipWave(wave) ? 170 : 140;
    const dt = Phaser.Math.Clamp((Number(delta) || 0) / 1000, 0, 0.1);
    const blend = 1 - Math.exp(-6 * dt);
    const targetX = Phaser.Math.Clamp(400 + Math.sin(swayTime / 700) * amplitude, 80, 720);
    const targetY = (enemy.getData("homeY") || 110) + Math.sin(swayTime / 430) * 12;
    const maximumVelocityX = isFinalFlagshipWave(wave) ? 255 : 215;
    const desiredVelocityX = Phaser.Math.Clamp((targetX - enemy.x) * 4.5, -maximumVelocityX, maximumVelocityX);
    const desiredVelocityY = Phaser.Math.Clamp((targetY - enemy.y) * 5, -70, 70);
    const velocityX = Phaser.Math.Linear(Number(enemy.getData("bossVelocityX")) || 0, desiredVelocityX, blend);
    const velocityY = Phaser.Math.Linear(Number(enemy.getData("bossVelocityY")) || 0, desiredVelocityY, blend);
    enemy.setData("bossVelocityX", velocityX);
    enemy.setData("bossVelocityY", velocityY);
    enemy.x = Phaser.Math.Clamp(enemy.x + velocityX * dt, 80, 720);
    enemy.y += velocityY * dt;
    enemy.setData("homeX", enemy.x);
    if (enemy.body) enemy.body.reset(enemy.x, enemy.y);
    const cooldown = (enemy.getData("bossShotCdMs") || 0) - delta;
    if (cooldown > 0) {
      enemy.setData("bossShotCdMs", cooldown);
      return;
    }
    const baseCooldown = phase === 1 ? 980 : (phase === 2 ? 720 : 520);
    const waveTightening = Math.max(0, Math.min(180, (wave - 5) * 8));
    enemy.setData("bossShotCdMs", Math.max(280, baseCooldown - waveTightening + POHP_grBetween(-40, 80)));
    const pattern = ((enemy.getData("bossPattern") || 0) + 1) % (phase >= 3 ? 4 : 3);
    enemy.setData("bossPattern", pattern);
    const speed = ENEMY_BULLET_SPEED_PPS * (phase === 3 ? 1.08 : 1);
    if (pattern === 0) {
      shootEnemyBullet(enemy.x - 18, enemy.y + 16, false, enemy);
      shootEnemyBullet(enemy.x, enemy.y + 16, false, enemy);
      shootEnemyBullet(enemy.x + 18, enemy.y + 16, false, enemy);
    } else if (pattern === 1) {
      bossFanShot(enemy.x, enemy.y, phase === 1 ? 5 : 7, speed, phase === 3 ? 78 : 58);
    } else if (pattern === 2) {
      shootEnemyBullet(enemy, true);
      shootEnemyBulletAngled(enemy.x - 30, enemy.y + 10, -90, speed, 0.55);
      shootEnemyBulletAngled(enemy.x + 30, enemy.y + 10, 90, speed, 0.55);
      if (phase >= 2) {
        shootEnemyBulletAngled(enemy.x - 50, enemy.y + 10, -140, speed * 0.95, 0.5);
        shootEnemyBulletAngled(enemy.x + 50, enemy.y + 10, 140, speed * 0.95, 0.5);
      }
    } else {
      bossRingShot(enemy.x, enemy.y, 10 + Math.min(4, Math.floor(wave / 10)), speed * 0.85);
    }
    const escortInFlight = enemies.children.entries.some(candidate => {
      if (!candidate || !candidate.active || candidate === enemy) return false;
      const candidateState = candidate.getData("state") || "formation";
      return candidateState !== "formation" && candidateState !== "boss";
    });
    if (phase >= 2 && !escortInFlight && POHP_grFloat() < 0.12 && enemy.getData("state") === "boss") {
      const diveDirection = enemy.x < 400 ? -1 : 1;
      startEnemyDive(enemy, true, diveDirection, 0);
      enemy.setData("diveShotsLeft", 2 + phase);
      enemy.setData("shotCdMs", 180);
      enemy.setData("diveTargetX", Phaser.Math.Clamp((player && player.active ? player.x : 400) + POHP_grSigned(80), 60, 740));
      enemy.setData("chase", 0.9);
      enemy.setData("iq", 0.9);
    }
  });
}

function arcadeConsumePlayerBullet(bullet) {
  const isLaser = !!(bullet && bullet.getData && bullet.getData("laser"));
  if (!bullet || !bullet.active) return isLaser;
  const pierceLeft = bullet.getData("pierce") || 0;
  if (pierceLeft > 0) {
    bullet.setData("pierce", pierceLeft - 1);
    if (pierceLeft - 1 <= 0) disableBullet(bullet);
  } else {
    disableBullet(bullet);
  }
  return isLaser;
}

function arcadeResolveEnemyHit(bullet, enemy) {
  if (!enemy || !enemy.active) return null;
  const impactX = bullet && Number.isFinite(bullet.x) ? bullet.x : enemy.x;
  const impactY = bullet && Number.isFinite(bullet.y) ? bullet.y : enemy.y;
  const isLaser = arcadeConsumePlayerBullet(bullet);
  spawnPlayerArrowImpactFx(enemy.scene, impactX, impactY, isLaser, bullet);
  const context = {
    scene: enemy.scene,
    type: enemy.getData("type") || "blue",
    state: enemy.getData("state"),
    x: enemy.x,
    y: enemy.y,
    isBoss: !!enemy.getData("isBoss"),
    defeated: true
  };
  if (!context.isBoss) return context;
  const previousHp = Math.max(1, enemy.getData("hp") || 1);
  const damage = Math.min(isLaser ? 2 : 1, previousHp);
  const hp = previousHp - damage;
  const maxHp = enemy.getData("maxHp") || 1;
  enemy.setData("hp", hp);
  setBossHpBarVisible(true, hp, maxHp, context.type === "final_flagship" ? "FINAL FLAGSHIP" : "BOSS FLAGSHIP");
  const hitPoints = ARCADE_SCORE_RULES.bossHitPoints(context.type, damage);
  arcadeAwardScore("boss_hit", hitPoints, {
    enemy_id: arcadeLedgerEnemyId(enemy, context.type),
    enemy_type: context.type,
    enemy_state: context.state || "boss",
  });
  arcadeSyncScore(false);
  enemy.setTint(0xffffff);
  context.scene.tweens.add({
    targets: enemy,
    alpha: 0.35,
    duration: 50,
    yoyo: true,
    onComplete: () => {
      if (enemy.active) enemy.setAlpha(1);
      enemy.clearTint();
    }
  });
  showFloatText(context.scene, enemy.x, enemy.y - 20, hp > 0 ? "HIT! " + hp + " HP" : "K.O.!", "#ffee66", 0.95);
  if (hp > 0) {
    context.defeated = false;
    if (hp === Math.floor(maxHp * 0.66) || hp === Math.floor(maxHp * 0.33)) {
      showBanterBanner(context.scene, arcadePick(ARCADE_BOSS_TAUNTS), "#ff6688", 900);
    }
  }
  return context;
}

function arcadeBossKillBonus(type) {
  return ARCADE_SCORE_RULES.bossKillBonus(type, wave);
}

function arcadeFinalizeEnemyKill(enemy, context) {
  const lines = ARCADE_KILL_LINES[context.type] || ARCADE_KILL_LINES.blue;
  showFloatText(context.scene, context.x, context.y, arcadePick(lines), context.type === "final_flagship" ? "#ff4444" : "#ffff66", context.isBoss ? 1.25 : 1);
  maybeDropPresentFromKill(context.scene, context.x, context.y, context.type, arcadeLedgerEnemyId(enemy, context.type));
  if (context.type === "final_flagship") {
    showBanterBanner(context.scene, "FINAL FLAGSHIP DOWN! YOU ARE THE GALAXY KING DOG!", "#ffdd44", 2400);
  }
  if (context.isBoss) {
    activeBoss = null;
    setBossHpBarVisible(false, 0, 1, "");
    arcadeRobinVoice("boss_defeated", { wave, finalBoss: context.type === "final_flagship" });
    arcadeInvasionEvent("boss_defeated", { wave });
  }
  const explosion = context.scene.add.sprite(context.x, context.y, "explosion");
  explosion.setScale(context.isBoss ? 2.2 : 1);
  context.scene.time.delayedCall(context.isBoss ? 500 : 300, () => explosion.destroy());
  if (!context.isBoss) return;
  for (let index = 0; index < 4; index++) {
    const effect = context.scene.add.image(
      context.x + POHP_vrBetween(-40, 40),
      context.y + POHP_vrBetween(-30, 30),
      "boom"
    ).setScale(0.8).setDepth(20);
    context.scene.tweens.add({
      targets: effect,
      alpha: 0,
      scale: 0.2,
      duration: 420 + index * 60,
      onComplete: () => effect.destroy()
    });
  }
}

function arcadeRetireRammingEnemy(enemy) {
  if (!enemy || !enemy.active) return;
  if (enemy.getData("isBoss")) {
    forceEnemyWrapToReturn(enemy);
    return;
  }
  const retiredType = enemy.getData("type") || "blue";
  arcadeLedgerEvent("enemy_retired", { enemy_id: arcadeLedgerEnemyId(enemy, retiredType), enemy_type: retiredType, enemy_state: "ram", points: 0 });
  enemy.setActive(false);
  enemy.setVisible(false);
  if (enemy.body) {
    enemy.body.enable = false;
    enemy.body.setVelocity(0, 0);
  }
}

function arcadeShieldAbsorbsHit(bulletOrEnemy, playerObject) {
  if (shieldCharges <= 0 && shieldMs <= 0) return false;
  shieldCharges = Math.max(0, shieldCharges - 1);
  if (shieldCharges <= 0) shieldMs = 0;
  invulnerabilityTimer = 900;
  playerObject.clearTint();
  const scene = playerObject.scene;
  if (sfxHitShip) sfxHitShip.play({ volume: SFX_HIT_VOLUME * 0.7, rate: 1.3 });
  showFloatText(scene, playerObject.x, playerObject.y - 28, "SHIELD POP!", "#99ccff", 1.1);
  showBanterBanner(scene, "SHIELD SAVED YOUR TAIL!", "#99bbff", 900);
  arcadeRobinVoice("shield_save", {});
  if (bulletOrEnemy && enemies && typeof enemies.contains === "function" && enemies.contains(bulletOrEnemy)) {
    arcadeRetireRammingEnemy(bulletOrEnemy);
    maybeStartNextWave(scene);
  }
  refreshPowerupHud();
  return true;
}

function arcadeSoftenPowersAfterDeath() {
  tripleShotMs = 0;
  spreadShotMs = 0;
  laserShotMs = 0;
  rapidFireMs = 0;
  speedBoostMs = 0;
  shieldMs = 0;
  shieldCharges = 0;
  dualShotMs = Math.min(dualShotMs, 1500);
  if (player && player.clearTint) player.clearTint();
  refreshPowerupHud();
}

function arcadeWaveClearMessage(scene, clearedWave, clearBonus) {
  const bossWave = isBossWave(clearedWave);
  const message = bossWave
    ? (isFinalFlagshipWave(clearedWave) ? "FINAL FLAGSHIP HUMILIATED! +" : "BOSS WRECKED! +") + clearBonus
    : arcadePick(ARCADE_CLEAR_LINES) + " +" + clearBonus;
  showBanterBanner(scene, message, bossWave ? "#ffcc44" : "#88ffaa", 1400);
}

function shootPoweredPlayerBullets() {
  const activeCount = playerBullets.children.entries.filter((bullet) => bullet.active).length;
  const cap = playerBulletCapNow();
  if (activeCount >= cap) return 0;
  const x = player.x;
  const y = player.y - 20;
  let fired = 0;
  const laser = laserShotMs > 0;
  const speed = laser ? -520 : (rapidFireMs > 0 ? -460 : -400);
  if (spreadShotMs > 0) {
    const fan = [[0, speed], [-70, speed * 0.96], [70, speed * 0.96], [-130, speed * 0.9], [130, speed * 0.9]];
    for (let index = 0; index < fan.length && activeCount + fired < cap; index++) {
      if (fireOnePlayerBullet(x + (index - 2) * 3, y, fan[index][0], fan[index][1], { laser })) fired++;
    }
  } else if (tripleShotMs > 0) {
    if (fireOnePlayerBullet(x, y, 0, speed * 1.02, { laser })) fired++;
    if (activeCount + fired < cap && fireOnePlayerBullet(x - 14, y + 4, -55, speed, { laser })) fired++;
    if (activeCount + fired < cap && fireOnePlayerBullet(x + 14, y + 4, 55, speed, { laser })) fired++;
  } else if (dualShotMs > 0) {
    if (fireOnePlayerBullet(x - 10, y, 0, speed, { laser })) fired++;
    if (activeCount + fired < cap && fireOnePlayerBullet(x + 10, y, 0, speed, { laser })) fired++;
  } else if (fireOnePlayerBullet(x, y, 0, speed, { laser, scale: laser ? 1.05 : 0.6 })) {
    fired++;
  }
  if (fired > 0) spawnPlayerArrowMuzzleFx(player.scene || mainScene, x, y, laser, fired);
  if (fired > 0 && sfxPlayerShoot) {
    let rate = 1;
    if (laser) rate = 1.25;
    else if (rapidFireMs > 0) rate = 1.2;
    else if (tripleShotMs > 0 || spreadShotMs > 0) rate = 1.12;
    else if (dualShotMs > 0) rate = 1.05;
    sfxPlayerShoot.play({ volume: SFX_SHOOT_VOLUME, rate });
  }
  return fired;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BOSS_EVERY_N_WAVES,
    FINAL_FLAGSHIP_EVERY_N,
    BOSS_EXTRA_LIFE_CHANCE,
    FINAL_EXTRA_LIFE_CHANCE,
    MAX_PRESENTS_ONSCREEN,
    MAX_BOSS_START_PRESENTS_ONSCREEN,
    BOSS_WEAPON_TYPES,
    PRESENT_FALL_SPEED,
    PRESENT_TYPES,
    durations: {
      dual: DUAL_SHOT_DURATION_MS,
      triple: TRIPLE_SHOT_DURATION_MS,
      rapid: RAPID_FIRE_DURATION_MS,
      spread: SPREAD_SHOT_DURATION_MS,
      laser: LASER_SHOT_DURATION_MS,
      speed: SPEED_BOOST_DURATION_MS,
      shield: SHIELD_DURATION_MS
    },
    bulletCaps: {
      dual: MAX_PLAYER_BULLETS_DUAL,
      triple: MAX_PLAYER_BULLETS_TRIPLE,
      spread: MAX_PLAYER_BULLETS_SPREAD,
      rapid: MAX_PLAYER_BULLETS_RAPID
    },
    isBossWave,
    isFinalFlagshipWave,
    presentDropChanceForEnemy,
    bossMaxHpForWave
  };
}
