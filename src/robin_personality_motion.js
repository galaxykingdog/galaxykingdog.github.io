(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GKDRobinPersonalityMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Presentation only. The caller supplies measured position differences after
  // physics, never requested velocity: pushing against a wall earns no steps.
  // At 300 px/s, 36 px is one 120 ms footfall in the existing gait.
  const SETTINGS = Object.freeze({
    stepDistance: 36,
    stepsBeforeRoll: 3,
    rollDurationMs: 420,
    rollCooldownMs: 6000,
    hopHeight: 4,
    maxFrameMs: 100,
    maxTravelSpeed: 1200,
    firstGlanceWaitMs: 3200,
    glanceDurationMs: 1100,
    glanceEaseMs: 250,
    glanceWaitMs: Object.freeze([5200, 6400, 5800]),
  });
  const EPSILON = 0.001;

  function neutralPose() {
    return {
      rollActive: false, rollAngle: 0, hopOffset: 0,
      glanceActive: false, glanceAmount: 0, glanceDirection: 1,
    };
  }

  function createState() {
    return {
      travelDistance: 0, travelX: 0, travelY: 0,
      rollElapsedMs: -1, rollDirection: 1, cooldownMs: 0,
      glanceWaitElapsedMs: 0, glanceWaitMs: SETTINGS.firstGlanceWaitMs,
      glanceElapsedMs: -1, glanceIndex: 0,
      pose: neutralPose(),
    };
  }

  function cancelMovement(state) {
    state.travelDistance = 0;
    state.travelX = 0;
    state.travelY = 0;
  }

  function cancelGlance(state) {
    state.glanceWaitElapsedMs = 0;
    state.glanceElapsedMs = -1;
  }

  function interrupt(previous) {
    const next = { ...previous, pose: neutralPose() };
    cancelMovement(next);
    cancelGlance(next);
    next.rollElapsedMs = -1;
    return next;
  }

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  /**
   * Pure update: neither previous nor input is mutated, and no game object is
   * accepted or touched. Apply pose only to costume layers, around the existing
   * body-centre origin; do not add these offsets to the physics player.
   *
   * input: {deltaMs, dx, dy, shot, blocked, hidden, invulnerable, hit, reset}
   * dx/dy are actual displacement since the immediately preceding visible frame.
   * Head turns follow visible play time, including continuous movement/fire.
   * The renderer combines the head turn with the current walk/attack body pose.
   * Cartwheels interrupt active glances and pause a pending glance wait; pausing
   * prevents frequent cartwheels from indefinitely postponing the longer waits.
   * Cooldown measures visible, uninterrupted simulation time, not wall time.
   * Invalid/large frames, implausible jumps and blocked states cancel/reseed
   * motion so background tabs, respawns and teleports cannot bank extra steps.
   */
  function update(previous, input) {
    const before = previous || createState();
    const sample = input || {};
    if (sample.reset) return createState();
    const dt = Number(sample.deltaMs);
    const dx = sample.dx === undefined ? 0 : Number(sample.dx);
    const dy = sample.dy === undefined ? 0 : Number(sample.dy);
    if (!Number.isFinite(dt) || dt <= 0 || dt > SETTINGS.maxFrameMs
      || !Number.isFinite(dx) || !Number.isFinite(dy)
      || sample.blocked || sample.hidden || sample.invulnerable || sample.hit) {
      return interrupt(before);
    }

    const distance = Math.hypot(dx, dy);
    if (distance > SETTINGS.maxTravelSpeed * dt / 1000 + 1) return interrupt(before);
    const next = { ...before, pose: neutralPose() };
    next.cooldownMs = Math.max(0, before.cooldownMs - dt);
    const moving = distance > EPSILON;
    const directionX = moving ? dx / distance : 0;
    const directionY = moving ? dy / distance : 0;
    const reversed = moving && before.travelDistance > 0
      && directionX * before.travelX + directionY * before.travelY < 0;

    if (before.rollElapsedMs >= 0) {
      // Completing the visual turn never locks movement or shooting. Its turn
      // direction stays fixed if the user reverses midway through the roll.
      next.rollElapsedMs = before.rollElapsedMs + dt;
      cancelMovement(next);
      if (before.glanceElapsedMs >= 0) cancelGlance(next);
      if (next.rollElapsedMs >= SETTINGS.rollDurationMs) next.rollElapsedMs = -1;
    } else {
      if (!moving || reversed || next.cooldownMs > 0) cancelMovement(next);
      if (moving && next.cooldownMs === 0) {
        next.travelDistance += distance;
        next.travelX = directionX;
        next.travelY = directionY;
        if (next.travelDistance + EPSILON >= SETTINGS.stepDistance * SETTINGS.stepsBeforeRoll) {
          next.rollElapsedMs = 0;
          next.rollDirection = Math.abs(dx) > EPSILON ? Math.sign(dx) : (dy < 0 ? -1 : 1);
          next.cooldownMs = SETTINGS.rollCooldownMs;
          cancelMovement(next);
          if (before.glanceElapsedMs >= 0) cancelGlance(next);
        }
      }

      if (next.rollElapsedMs >= 0) {
        // A turn owns the silhouette. Leave an inactive wait paused, while an
        // active head turn was already cancelled at cartwheel takeoff above.
      } else if (before.glanceElapsedMs >= 0) {
        next.glanceElapsedMs = before.glanceElapsedMs + dt;
        if (next.glanceElapsedMs + EPSILON >= SETTINGS.glanceDurationMs) {
          cancelGlance(next);
          next.glanceIndex = (before.glanceIndex + 1) % (SETTINGS.glanceWaitMs.length * 2);
          next.glanceWaitMs = SETTINGS.glanceWaitMs[
            (next.glanceIndex + SETTINGS.glanceWaitMs.length - 1) % SETTINGS.glanceWaitMs.length];
        }
      } else {
        next.glanceWaitElapsedMs += dt;
        if (next.glanceWaitElapsedMs + EPSILON >= next.glanceWaitMs) {
          next.glanceElapsedMs = 0;
          next.glanceWaitElapsedMs = 0;
        }
      }
    }

    if (next.rollElapsedMs >= 0) {
      const progress = next.rollElapsedMs / SETTINGS.rollDurationMs;
      next.pose.rollActive = true;
      next.pose.rollAngle = progress === 0 ? 0 : next.rollDirection * 360 * smoothstep(progress);
      next.pose.hopOffset = progress === 0 ? 0 : -Math.sin(progress * Math.PI) * SETTINGS.hopHeight;
    }
    if (next.glanceElapsedMs >= 0) {
      const elapsed = next.glanceElapsedMs;
      const fade = Math.min(1, elapsed / SETTINGS.glanceEaseMs,
        (SETTINGS.glanceDurationMs - elapsed) / SETTINGS.glanceEaseMs);
      next.pose.glanceActive = true;
      next.pose.glanceAmount = smoothstep(Math.max(0, fade));
      next.pose.glanceDirection = next.glanceIndex % 2 === 0 ? 1 : -1;
    }
    return next;
  }

  return Object.freeze({ SETTINGS, createState, update });
});
