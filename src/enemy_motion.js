(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GKDEnemyMotion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function finiteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function createDiveArc(startX, startY, requestedRadius, worldWidth, marginX, direction, minimumLeadEndY) {
    const width = Math.max(1, finiteNumber(worldWidth, 800));
    const margin = clamp(finiteNumber(marginX, 40), 0, width * 0.5);
    const x = finiteNumber(startX, width * 0.5);
    const y = finiteNumber(startY, 0);
    const radius = Math.min(Math.max(1, finiteNumber(requestedRadius, 85)), Math.max(1, (width - margin * 2) * 0.5));
    const dir = direction < 0 ? -1 : 1;
    const leadEndX = clamp(x + dir * Math.min(25, radius * 0.3), margin, width - margin);
    const defaultLeadEndY = y + Math.min(38, radius * 0.5);
    const leadEndY = Math.max(defaultLeadEndY, finiteNumber(minimumLeadEndY, defaultLeadEndY));

    return {
      startX: x,
      startY: y,
      leadEndX,
      leadEndY,
      centerX: leadEndX,
      centerY: leadEndY + radius,
      radiusX: radius,
      radiusY: radius,
      leadInProgress: 0.32,
      leadXProgress: 0.09,
      leadYStartProgress: 0.07,
      minimumX: margin,
      maximumX: width - margin,
    };
  }

  function diveArcPoint(arc, progress, direction, sweepRadians) {
    const t = clamp(finiteNumber(progress, 0), 0, 1);
    const dir = direction < 0 ? -1 : 1;
    const leadInProgress = clamp(finiteNumber(arc.leadInProgress, 0.32), 0.01, 0.5);
    if (t <= leadInProgress) {
      const leadXDuration = clamp(finiteNumber(arc.leadXProgress, 0.09), 0.01, leadInProgress);
      const leadYStart = clamp(finiteNumber(arc.leadYStartProgress, 0.07), 0, leadInProgress - 0.01);
      const leadXProgress = smoothRamp(t, leadXDuration);
      const leadYProgress = smoothRamp(t - leadYStart, leadInProgress - leadYStart);
      return {
        x: clamp(arc.startX + (arc.leadEndX - arc.startX) * leadXProgress, arc.minimumX, arc.maximumX),
        y: arc.startY + (arc.leadEndY - arc.startY) * leadYProgress,
      };
    }
    const arcProgress = (t - leadInProgress) / (1 - leadInProgress);
    const eased = 0.5 - Math.cos(Math.PI * arcProgress) * 0.5;
    const sweep = Math.max(0, finiteNumber(sweepRadians, Math.PI * 1.4));
    const angle = -Math.PI / 2 + dir * sweep * eased;
    const rawX = arc.centerX + Math.cos(angle) * arc.radiusX;
    const rawY = arc.centerY + Math.sin(angle) * arc.radiusY;

    return {
      x: clamp(rawX, arc.minimumX, arc.maximumX),
      y: rawY,
    };
  }

  function smoothRamp(elapsedSeconds, durationSeconds) {
    const duration = Math.max(0.0001, finiteNumber(durationSeconds, 1));
    const t = clamp(finiteNumber(elapsedSeconds, 0) / duration, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function approach(current, target, maximumDelta) {
    const from = finiteNumber(current, 0);
    const to = finiteNumber(target, from);
    const step = Math.max(0, finiteNumber(maximumDelta, 0));
    if (Math.abs(to - from) <= step) return to;
    return from + Math.sign(to - from) * step;
  }

  function damp(current, target, responsePerSecond, deltaSeconds) {
    const from = finiteNumber(current, 0);
    const to = finiteNumber(target, from);
    const response = Math.max(0, finiteNumber(responsePerSecond, 0));
    const dt = clamp(finiteNumber(deltaSeconds, 0), 0, 0.1);
    const blend = 1 - Math.exp(-response * dt);
    return from + (to - from) * blend;
  }

  function cubicBezierPoint(start, firstControl, secondControl, end, progress) {
    const t = clamp(finiteNumber(progress, 0), 0, 1);
    const inverse = 1 - t;
    const startWeight = inverse * inverse * inverse;
    const firstWeight = 3 * inverse * inverse * t;
    const secondWeight = 3 * inverse * t * t;
    const endWeight = t * t * t;
    return {
      x: finiteNumber(start && start.x, 0) * startWeight +
        finiteNumber(firstControl && firstControl.x, 0) * firstWeight +
        finiteNumber(secondControl && secondControl.x, 0) * secondWeight +
        finiteNumber(end && end.x, 0) * endWeight,
      y: finiteNumber(start && start.y, 0) * startWeight +
        finiteNumber(firstControl && firstControl.y, 0) * firstWeight +
        finiteNumber(secondControl && secondControl.y, 0) * secondWeight +
        finiteNumber(end && end.y, 0) * endWeight,
    };
  }

  return Object.freeze({
    createDiveArc,
    diveArcPoint,
    smoothRamp,
    approach,
    damp,
    cubicBezierPoint,
  });
});
