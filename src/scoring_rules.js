(function installGkdScoringRules(root, factory) {
  const rules = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = rules;
  if (root) root.GKD_SCORING_RULES = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGkdScoringRules() {
  const ENEMY_SCORES = Object.freeze({
    flagship: 60,
    red: 60,
    purple: 50,
    blue: 30,
    boss: 800,
    final_flagship: 2500,
  });

  const FLAGSHIP_DIVE_BONUS = Object.freeze({ 0: 150, 1: 200, 2: 800 });
  const BONUS_LIFE_SCORE = 7000;
  const BOMB_GIFT_POINTS = 100;
  const BONE_GIFT_VARIANCE = 100;

  function normalizedWave(value) {
    const wave = Number(value);
    return Number.isFinite(wave) ? Math.max(1, Math.trunc(wave)) : 1;
  }

  function isDiving(enemyState) {
    return enemyState === "diveLoop" || enemyState === "diveStraight";
  }

  function bossKillBonus(enemyType, wave) {
    const currentWave = normalizedWave(wave);
    if (enemyType === "final_flagship") return 1200 + currentWave * 80;
    if (enemyType === "boss") return 400 + currentWave * 40;
    return 0;
  }

  function enemyKillPointOptions(enemyType, enemyState, wave) {
    const base = ENEMY_SCORES[enemyType];
    if (!base) return [];
    if (enemyType === "boss" || enemyType === "final_flagship") {
      const diveBonus = isDiving(enemyState) ? Math.floor(base * 0.35) : 0;
      return [base + diveBonus + bossKillBonus(enemyType, wave)];
    }
    if (enemyType === "flagship" && isDiving(enemyState)) return Object.values(FLAGSHIP_DIVE_BONUS);
    return [isDiving(enemyState) ? base * 2 : base];
  }

  function enemyKillPoints(enemyType, enemyState, wave, flagshipEscortsKilled = 0) {
    if (enemyType === "flagship" && isDiving(enemyState)) {
      const escorts = Math.max(0, Math.min(2, Math.trunc(Number(flagshipEscortsKilled) || 0)));
      return FLAGSHIP_DIVE_BONUS[escorts];
    }
    return enemyKillPointOptions(enemyType, enemyState, wave)[0] ?? null;
  }

  function waveClearPoints(wave) {
    const currentWave = normalizedWave(wave);
    return currentWave % 5 === 0 ? 600 + currentWave * 50 : 250 + currentWave * 25;
  }

  function bossMaxHp(enemyType, wave) {
    const currentWave = normalizedWave(wave);
    if (enemyType === "final_flagship") {
      return 28 + Math.floor(currentWave * 1.8) + Math.floor(currentWave / 10) * 6;
    }
    return 14 + Math.floor(currentWave * 1.1);
  }

  function bossHitPoints(enemyType, damage) {
    const units = Math.max(0, Math.trunc(Number(damage) || 0));
    return (enemyType === "final_flagship" ? 25 : 15) * units;
  }

  function bombKillPoints(enemyType) {
    const base = ENEMY_SCORES[enemyType];
    if (!base) return null;
    return Math.floor(base * 0.6) + ((enemyType === "boss" || enemyType === "final_flagship") ? 200 : 0);
  }

  function boneGiftMinimum(wave) {
    return 150 + normalizedWave(wave) * 25;
  }

  function boneGiftMaximum(wave) {
    return boneGiftMinimum(wave) + BONE_GIFT_VARIANCE;
  }

  return Object.freeze({
    VERSION: "GKD-SCORING-v1.7.2",
    ENEMY_SCORES,
    FLAGSHIP_DIVE_BONUS,
    BONUS_LIFE_SCORE,
    BOMB_GIFT_POINTS,
    BONE_GIFT_VARIANCE,
    isDiving,
    bossKillBonus,
    enemyKillPointOptions,
    enemyKillPoints,
    waveClearPoints,
    bossMaxHp,
    bossHitPoints,
    bombKillPoints,
    boneGiftMinimum,
    boneGiftMaximum,
  });
});
