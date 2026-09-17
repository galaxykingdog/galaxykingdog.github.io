// Time conversions for the separate Free Mobile mode. No timers or game state.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GKD_MobilePerformance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const REFERENCE_FRAME_MS = 1000 / 60;

  function frames(deltaMs) {
    return Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs / REFERENCE_FRAME_MS : 0;
  }

  // Preserve the 60 Hz response over equal elapsed time at any refresh rate.
  function frameBlend(alphaAt60Hz, deltaMs) {
    const count = frames(deltaMs);
    if (!count) return 0;
    const alpha = Math.max(0, Math.min(1, Number(alphaAt60Hz) || 0));
    return 1 - Math.pow(1 - alpha, count);
  }

  function frameStep(pixelsAt60Hz, deltaMs) {
    return (Number(pixelsAt60Hz) || 0) * frames(deltaMs);
  }

  function referenceDisplacement(displacement, deltaMs) {
    const count = frames(deltaMs);
    return count ? (Number(displacement) || 0) / count : 0;
  }

  return Object.freeze({ REFERENCE_FRAME_MS, frameBlend, frameStep, referenceDisplacement });
});
