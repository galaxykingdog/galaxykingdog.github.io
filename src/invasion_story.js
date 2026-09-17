/* Presentation-only story beats. No timers, random calls, audio, or gameplay writes.
 *
 * const story = GKDInvasionStory.createDirector({
 *   now: () => scene.time.now,
 *   onTransmission: (message) => renderOrHide(message)
 * });
 * story.reset();                         // each actual run/restart
 * story.emit('run_start', { wave: 1 });   // wave_start 1 is then deduplicated
 * story.emit('wave_start', { wave });
 * story.emit('boss_defeated', { wave });
 * story.emit('wave_clear', { wave });     // 'clear' is an alias
 * story.tick();                         // every scene update; no gameplay pause
 *
 * onTransmission receives a frozen message, or null to hide the panel.
 * Render briefly in the upper safe area, clear it on null, and let tick() own
 * expiry. Defeat messages hold the panel while the next wave is queued, so a
 * wave 11 start cannot erase the wave 10 chapter ending. If rendering also uses
 * a timeout, compare message.id before hiding: an old expiry must not hide a
 * newer message. The now() clock and an optional tick(time) must share units
 * (milliseconds). A restart increments the id generation and discards queues.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GKDInvasionStory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CHAPTER = 'BREAK THE LEASH';
  const WAVE_DURATION_MS = 5600;
  const DEFEAT_DURATION_MS = 4600;
  const COMPLETION_DURATION_MS = 6800;
  const OPENING = Object.freeze([
    ['SKY GOES RED', 'NEON WATCH', 'Alien hound-ships darken Neon Ward. One obedience signal commands them all.'],
    ['A CAT IN THE CIRCUIT', 'ROBIN', 'Metal jaws. Remote orders. This cat brought arrows to a dogfight.'],
    ['FERAL FREQUENCY', 'NEON WATCH', 'Every hound has a receiver. Follow its pulse to the alien command ship.'],
    ['SIGNAL HUNT', 'ROBIN', 'A rooftop relay. Stay out of my whiskers. I have the shot.'],
    ['WARDEN AT THE GATE', 'INTERCEPT', 'A Warden guards the relay. Its crown matches the alien command ship.'],
    ['STOLEN VOICES', 'NEON WATCH', 'The relay cracks. Under the orders, the hounds are calling for help.'],
    ['OPEN THE CAGES', 'ROBIN', 'Their collars carry the signal. Break the receivers. Give the pack its voice back.'],
    ['CROWN IN ORBIT', 'NEON WATCH', 'The carrier descends. Its crown antenna locks every receiver in Neon Ward.'],
    ['LAST RELAY', 'ROBIN', 'One relay left. Neon Ward, keep your lights on. We are close.'],
    ['BREAK THE LEASH', 'NEON WATCH', "The Crown Carrier is here. Destroy it to end Neon Ward's obedience signal."]
  ].map(function (entry) { return Object.freeze(entry); }));

  function normalizeWave(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;
    return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number)));
  }

  function beat(value) {
    const wave = normalizeWave(value);
    const sector = Math.floor((wave - 1) / 10) + 1;
    const step = ((wave - 1) % 10) + 1;
    let entry = OPENING[step - 1];
    if (sector > 1) {
      const district = 'District ' + sector;
      const previous = sector === 2 ? 'Neon Ward' : 'District ' + (sector - 1);
      const continuation = [
        ['THE NEXT SIGNAL', 'NEON WATCH', previous + ' is free. ' + district + ' calls for help.'],
        ['NEW STREETS, SAME CROWN', 'ROBIN', 'Fresh armor. Same alien signal. New tricks? This cat has nine lives.'],
        ['VOICES UNDER STATIC', 'NEON WATCH', district + ' receivers echo the carrier pulse. Trace it through the fleet.'],
        ['RELAY APPROACH', 'ROBIN', 'Another rooftop relay. Clear its guards and open a path to the carrier.'],
        ['THE DISTRICT WARDEN', 'INTERCEPT', 'A new Warden shields the relay. ' + district + ' is still on the leash.'],
        ['A CRACK IN THE SIGNAL', 'NEON WATCH', 'The relay is failing. ' + district + ' can hear us. Keep pushing.'],
        ['LET THE PACK ANSWER', 'ROBIN', 'Break the receivers. Give those voices back. Nobody belongs to that crown.'],
        ['ANOTHER CROWN DESCENDS', 'NEON WATCH', 'The carrier descends over ' + district + '. Its antenna controls the pack.'],
        ['THE LAST APPROACH', 'ROBIN', 'One last relay. Clear it and give this district its sky back.'],
        ['BREAK ANOTHER LEASH', 'NEON WATCH', 'Destroy the Crown Carrier. End the obedience signal over ' + district + '.']
      ];
      entry = continuation[step - 1];
    }
    return Object.freeze({
      wave: wave, sector: sector, step: step, chapter: CHAPTER,
      title: entry[0], speaker: entry[1], text: entry[2]
    });
  }

  function title(wave) { return beat(wave).title; }

  function createDirector(options) {
    options = options || {};
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const render = typeof options.onTransmission === 'function' ? options.onTransmission : function () {};
    let generation = 0;
    let serial = 0;
    let active = null;
    let pending = null;
    let highestWaveStarted = 0;
    let lastBossDefeated = 0;
    let lastSectorCompleted = 0;
    let lastObjectiveCompleted = 0;

    function readTime(value) {
      const time = Number(value === undefined ? now() : value);
      return Number.isFinite(time) ? time : 0;
    }

    function notify(message) {
      // Presentation must not interrupt a run if its renderer has been removed.
      try { render(message); } catch (_) {}
    }

    function show(draft, time) {
      active = Object.freeze(Object.assign({}, draft, {
        id: generation + ':' + (++serial),
        createdAt: time,
        expiresAt: time + draft.durationMs
      }));
      notify(active);
      return active;
    }

    function tick(time) {
      const at = readTime(time);
      if (active && at >= active.expiresAt) {
        active = null;
        if (pending) {
          const next = pending;
          pending = null;
          return show(next, at);
        }
        notify(null);
      }
      return active;
    }

    function reset() {
      generation += 1;
      serial = 0;
      active = null;
      pending = null;
      highestWaveStarted = 0;
      lastBossDefeated = 0;
      lastSectorCompleted = 0;
      lastObjectiveCompleted = 0;
      notify(null);
    }

    function emit(event, detail) {
      detail = detail || {};
      const wave = event === 'run_start' ? 1 : normalizeWave(detail.wave);
      const at = readTime();
      tick(at);
      const data = beat(wave);
      let draft;
      if (event === 'run_start' || event === 'wave_start') {
        if (wave <= highestWaveStarted) return null;
        highestWaveStarted = wave;
        draft = Object.assign({}, data, {
          event: 'wave_start', priority: 1, durationMs: WAVE_DURATION_MS
        });
        if (active && active.priority > draft.priority) {
          pending = draft;
          return null;
        }
        pending = null;
      } else if (event === 'objective_complete') {
        // Only a current, completed receiver objective can interrupt the radio.
        // Boss victories retain their existing, higher-priority chapter endings.
        if (wave !== highestWaveStarted || wave <= lastObjectiveCompleted || wave % 5 === 0 || !detail.text) return null;
        lastObjectiveCompleted = wave;
        if (active && active.priority > 2) return null;
        draft = Object.assign({}, data, {
          event: 'objective_complete', priority: 2, durationMs: 4000,
          title: String(detail.title || 'SIGNAL DOWN').slice(0, 60),
          speaker: String(detail.speaker || 'ROBIN').slice(0, 24),
          text: String(detail.text).slice(0, 130)
        });
      } else if (event === 'boss_defeated' || event === 'wave_clear' || event === 'clear') {
        if (wave % 10 === 0) {
          if (wave <= lastSectorCompleted) return null;
          lastSectorCompleted = wave;
          lastBossDefeated = Math.max(lastBossDefeated, wave);
          draft = Object.assign({}, data, {
            event: 'sector_complete', priority: 3, durationMs: COMPLETION_DURATION_MS,
            title: data.sector === 1 ? 'NEON WARD IS FREE' : 'DISTRICT ' + data.sector + ' IS FREE',
            speaker: 'ROBIN',
            text: data.sector === 1
              ? 'The carrier is down. The hounds choose their own path. One district free. We keep going.'
              : 'District ' + data.sector + ' answers in its own voice. Another carrier is gone. On to District ' + (data.sector + 1) + '.'
          });
        } else if (event === 'boss_defeated' && wave % 5 === 0) {
          if (wave <= lastBossDefeated) return null;
          lastBossDefeated = wave;
          draft = Object.assign({}, data, {
            event: 'warden_defeated', priority: 2, durationMs: DEFEAT_DURATION_MS,
            title: 'THE WARDEN FALLS', speaker: 'ROBIN',
            text: 'The Warden is down. Follow the relay signal. Next stop: the crown.'
          });
        } else {
          return null;
        }
        // A late defeat event can arrive just after the following wave starts.
        // Preserve that next-wave beat behind the chapter payoff in either order.
        if (active && active.priority === 1 && active.wave > wave) {
          pending = active;
        }
      } else {
        return null;
      }
      return show(draft, at);
    }

    return Object.freeze({
      emit: emit, tick: tick, reset: reset,
      current: function () { return active; }
    });
  }

  return Object.freeze({
    CHAPTER: CHAPTER, title: title, beat: beat, createDirector: createDirector
  });
});
