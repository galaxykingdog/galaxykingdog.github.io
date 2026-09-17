(function (root) {
  'use strict';
  // Input is sampled by Scene PRE_UPDATE, before physics. No synthetic keys or timers.
  function createMobileInput() {
    let pointerId = null, centerX = 0, centerY = 0, travelRadius = 1;
    let autoFire = true, manualFire = false, shotMs = 0;
    let canonicalInput = null;
    const sample = { mask: 0, velocityX: 0, axis: 0, shootJust: false, dragging: false };
    const stick = { x: 0, y: 0, axis: 0, active: false };
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const fixedSimulation = () => root.CHAIN?.simulationProtocol === 'fixed_step_v1';

    function moveStick(clientX, clientY) {
      const dx = clientX - centerX, dy = clientY - centerY;
      const distance = Math.hypot(dx, dy);
      const scale = distance > travelRadius ? travelRadius / distance : 1;
      stick.x = dx * scale; stick.y = dy * scale;
      const horizontal = clamp(stick.x / travelRadius, -1, 1);
      // A small horizontal dead zone rejects thumb wobble and vertical pushes.
      // The continuous curve keeps the center precise and reaches full speed
      // at the left/right edge. Positions are CSS pixels, never game coordinates.
      const amount = Math.max(0, (Math.abs(horizontal) - 0.06) / 0.94);
      stick.axis = amount > 0 ? Math.sign(horizontal) * Math.pow(amount, 1.25) : 0;
    }

    function releaseStick() {
      pointerId = null;
      stick.x = 0; stick.y = 0; stick.axis = 0; stick.active = false;
      sample.velocityX = 0; sample.axis = 0; sample.mask &= 4; sample.dragging = false;
    }

    return {
      begin(id, clientX, clientY, baseX, baseY, radius) {
        if (pointerId !== null || id === null || id === undefined
          || ![clientX, clientY, baseX, baseY, radius].every(Number.isFinite) || radius <= 0) return false;
        pointerId = id; centerX = baseX; centerY = baseY; travelRadius = radius;
        stick.active = true;
        moveStick(clientX, clientY);
        return true;
      },
      move(id, clientX, clientY) {
        if (pointerId === null || id !== pointerId || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
        moveStick(clientX, clientY);
        return true;
      },
      end(id) { if (id === pointerId) releaseStick(); },
      clear(options) { releaseStick(); manualFire = false; canonicalInput = null; if (!fixedSimulation() || options?.freshRun) shotMs = 0; sample.mask = 0; sample.shootJust = false; },
      // Independent replay supplies quantized input intent, never velocity,
      // score, collision results, or a caller-selected firing cadence.
      setCanonicalInput(axis, mask) {
        if (root.CHAIN?.simulationProtocol !== 'fixed_step_v1' || !Number.isInteger(axis) || axis < -32767 || axis > 32767
          || !Number.isInteger(mask) || mask < 0 || mask > 7) throw new Error('Invalid canonical mobile input');
        canonicalInput = { axis, mask };
      },
      setAutoFire(value) { autoFire = !!value; if (!fixedSimulation()) shotMs = 0; },
      setManualFire(value) { manualFire = !!value; if (!fixedSimulation() && !value && !autoFire) shotMs = 0; },
      get autoFire() { return autoFire; },
      get activePointer() { return pointerId; },
      step(delta, playerX, maxSpeed, running, rapid, keyboardMask = 0) {
        sample.mask = 0; sample.velocityX = 0; sample.axis = 0; sample.shootJust = false;
        sample.dragging = pointerId !== null;
        if (!running) { shotMs = 0; return sample; }
        // Held deflection requests velocity, not a destination. Use the same
        // delta as variable-step physics when limiting the final step at a wall.
        const seconds = Math.max(0.001, delta / 1000);
        if (canonicalInput) sample.axis = canonicalInput.axis / 32767;
        else if (stick.active) sample.axis = stick.axis;
        else if (keyboardMask & 1) sample.axis = -1;
        else if (keyboardMask & 2) sample.axis = 1;
        if (root.GKD_WEB3_MOBILE === true) sample.axis = Math.round(sample.axis * 32767) / 32767;
        sample.velocityX = sample.axis * maxSpeed;
        if (sample.velocityX > 0) sample.velocityX = Math.min(sample.velocityX, Math.max(0, 784 - playerX) / seconds);
        else if (sample.velocityX < 0) sample.velocityX = Math.max(sample.velocityX, -Math.max(0, playerX - 16) / seconds);
        if (sample.velocityX === 0) sample.velocityX = 0; // Keep wall/neutral samples free of signed zero.
        if (sample.velocityX < 0) sample.mask |= 1;
        if (sample.velocityX > 0) sample.mask |= 2;
        const firing = canonicalInput ? !!(canonicalInput.mask & 4) : autoFire || manualFire || !!(keyboardMask & 4);
        if (firing) {
          sample.mask |= 4;
          shotMs -= Math.max(0, delta);
          if (shotMs <= 0) {
            sample.shootJust = true;
            const period = rapid ? 95 : 165;
            // Keep cadence across 60/90/120 Hz; never release a catch-up burst after a stall.
            shotMs += period;
            if (shotMs <= 0) shotMs = period;
          }
        } else shotMs = 0;
        return sample;
      },
      sample, stick
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createMobileInput };
  else root.GKDMobileInput = createMobileInput();
})(typeof globalThis !== 'undefined' ? globalThis : this);
