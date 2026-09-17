// src/main_runtime_patch.js
// Runtime compatibility shim for imported gameplay builds.
// Keeps gameplay/replay material untouched; it only prevents startup crashes from older build assumptions
// and wires anti-cheat ledger hooks around existing gameplay functions.

var playerX = 400;

(function () {
  let ledgerHooksInstalled = false;
  let suppressLedgerCheckpoint = false;
  let ledgerFinalizeStarted = false;
  // Paying opens the ticket before the countdown, while wave and frame still hold the
  // previous run. Periodic events wait until this ticket's wave_start has been sent.
  let ledgerLiveTicket = "";

  function safeFrame() {
    try { return (typeof POHP_record !== "undefined" && POHP_record) ? (POHP_record.frame | 0) : 0; }
    catch (_) { return 0; }
  }

  function safeScore() {
    try { return (typeof score !== "undefined") ? (score | 0) : 0; }
    catch (_) { return 0; }
  }

  function safeWave() {
    try { return Math.max(1, (typeof wave !== "undefined") ? (wave | 0) : 1); }
    catch (_) { return 1; }
  }

  function safeLives() {
    try { return Math.max(0, (typeof lives !== "undefined") ? (lives | 0) : 0); }
    catch (_) { return 0; }
  }

  function ledgerEnabled() {
    try {
      return !!(window.CHAIN && window.CHAIN.enabled && window.ChainClient && window.ChainClient.submitLedgerEvent);
    } catch (_) { return false; }
  }

  function isReplayLiveBlocked() {
    try { return !!(typeof POHP_replay !== "undefined" && POHP_replay && POHP_replay.enabled && POHP_replay.loaded); }
    catch (_) { return false; }
  }

  function ledgerIsActive() {
    try {
      const st = window.ChainClient && window.ChainClient._state && window.ChainClient._state.ledger;
      return !!(st && st.active && !st.finalized && st.run_ticket_id);
    } catch (_) { return false; }
  }

  function activeLedgerTicket() {
    try { return String(window.ChainClient?._state?.ledger?.run_ticket_id || ""); }
    catch (_) { return ""; }
  }

  function ledgerRunLive() {
    return ledgerIsActive() && !!ledgerLiveTicket && activeLedgerTicket() === ledgerLiveTicket;
  }

  function ledgerEvent(type, extra) {
    try {
      if (!ledgerEnabled() || isReplayLiveBlocked()) return;
      if (suppressLedgerCheckpoint && type === "checkpoint") return;
      window.ChainClient.submitLedgerEvent({
        type,
        frame: safeFrame(),
        wave: safeWave(),
        lives: safeLives(),
        client_score: -1,
        client_event_hash: type + "|" + safeFrame() + "|" + safeScore() + "|" + safeWave() + "|" + safeLives(),
        ...(extra || {})
      });
    } catch (_) {}
  }

  window.__GKD_LEDGER_ARCADE_EVENT = function gkdLedgerArcadeEvent(type, extra) {
    ledgerEvent(type, extra);
  };

  function enemyLedgerId(enemy, type) {
    try {
      if (!enemy || typeof enemy.getData !== "function") return String(type || "enemy") + ":unknown";
      const slot = enemy.getData("slotKey");
      if (slot) return String(slot);
      const row = enemy.getData("row");
      const col = enemy.getData("col");
      if (row !== undefined || col !== undefined) return "r" + String(row ?? "?") + "c" + String(col ?? "?") + ":" + String(type || "enemy");
      return String(type || "enemy") + ":" + Math.round(enemy.x || 0) + ":" + Math.round(enemy.y || 0);
    } catch (_) {
      return String(type || "enemy") + ":unknown";
    }
  }

  function installLedgerHooks() {
    if (ledgerHooksInstalled) return;
    if (!window.ChainClient) return;

    try {
      if (typeof beginGame === "function" && !beginGame.__gkdLedgerWrapped) {
        const originalBeginGame = beginGame;
        beginGame = function gkdLedgerBeginGame(...args) {
          ledgerLiveTicket = "";
          const out = originalBeginGame.apply(this, args);
          ledgerFinalizeStarted = false;
          suppressLedgerCheckpoint = false;
          try {
            if (!isReplayLiveBlocked() && window.CHAIN?.enabled && window.ChainClient?.startLedgerRun) {
              if (ledgerIsActive()) {
                ledgerEvent("wave_start", { wave: safeWave(), lives: safeLives(), client_score: 0 });
                ledgerLiveTicket = activeLedgerTicket();
              } else {
                window.ChainClient.startLedgerRun({
                  game_id: (typeof POHP_GAME_ID !== "undefined") ? POHP_GAME_ID : "420_HIGH_SCORE_GALAXIAN",
                  client_ruleset: (typeof POHP_GAME_VERSION !== "undefined") ? POHP_GAME_VERSION : "",
                  lives: safeLives(),
                }).then(() => {
                  ledgerEvent("wave_start", { wave: safeWave(), lives: safeLives(), client_score: 0 });
                  ledgerLiveTicket = activeLedgerTicket();
                }).catch(() => {});
              }
            }
          } catch (_) {}
          return out;
        };
        beginGame.__gkdLedgerWrapped = true;
      }
    } catch (_) {}

    try {
      if (typeof POHP_recordCheckpoint === "function" && !POHP_recordCheckpoint.__gkdLedgerWrapped) {
        const originalCheckpoint = POHP_recordCheckpoint;
        POHP_recordCheckpoint = function gkdLedgerCheckpoint(force) {
          const beforeFrame = safeFrame();
          const out = originalCheckpoint.apply(this, arguments);
          try {
            if (!suppressLedgerCheckpoint && ledgerRunLive() && (force || safeFrame() !== beforeFrame)) {
              ledgerEvent("checkpoint", {
                wave: safeWave(),
                lives: safeLives(),
                points: 0,
                client_score: safeScore(),
                client_event_hash: "checkpoint|" + safeFrame() + "|" + safeScore() + "|" + safeWave() + "|" + safeLives(),
              });
            }
          } catch (_) {}
          return out;
        };
        POHP_recordCheckpoint.__gkdLedgerWrapped = true;
      }
    } catch (_) {}

    try {
      if (typeof POHP_finalizeRunPackageOnGameOver === "function" && !POHP_finalizeRunPackageOnGameOver.__gkdLedgerWrapped) {
        const originalFinalizePackage = POHP_finalizeRunPackageOnGameOver;
        POHP_finalizeRunPackageOnGameOver = async function gkdLedgerFinalizePackage(finalScore, finalWave) {
          // originalFinalizePackage() creates the final runPackage and may force a local POHP checkpoint.
          // We suppress only the live-ledger checkpoint during this call so the final ledger event is single/authoritative.
          let pkg = null;
          try {
            suppressLedgerCheckpoint = true;
            pkg = await originalFinalizePackage.apply(this, arguments);
          } finally {
            suppressLedgerCheckpoint = false;
          }

          try {
            if (!ledgerFinalizeStarted && !isReplayLiveBlocked() && window.ChainClient?.finalizeLedgerRun) {
              ledgerFinalizeStarted = true;
              ledgerLiveTicket = "";
              const ledgerFinal = await window.ChainClient.finalizeLedgerRun({
                frame: safeFrame(),
                wave: finalWave | 0,
                lives: safeLives(),
                final_score: finalScore | 0,
                client_score: finalScore | 0,
                client_event_hash: (pkg && pkg.run_hash) ? String(pkg.run_hash) : "",
              });
              if (ledgerFinal && pkg) {
                pkg.accepted_score = ledgerFinal.accepted_score;
                pkg.ledger_root = ledgerFinal.ledger_root;
                pkg.ledger_final_hash = ledgerFinal.final_hash;
                pkg.ledger_memoText = ledgerFinal.memoText;
                pkg.ledger_verifier_sig = ledgerFinal.verifier_sig;
                try {
                  if (typeof POHP_lastPackage !== "undefined") POHP_lastPackage = pkg;
                  if (typeof POHP_lastPackageName !== "undefined" && POHP_lastPackageName) {
                    localStorage.setItem("pohp_last_runPackage_json", JSON.stringify(pkg));
                  }
                } catch (_) {}
              }
            }
          } catch (error) {
            const message = String(error?.message || error);
            if (pkg) pkg.ledger_finalize_error = message;
            try {
              if (typeof POHP_lastPackageName !== "undefined" && POHP_lastPackageName && pkg) {
                localStorage.setItem("pohp_last_runPackage_json", JSON.stringify(pkg));
              }
            } catch (_) {}
          }
          return pkg;
        };
        POHP_finalizeRunPackageOnGameOver.__gkdLedgerWrapped = true;
      }
    } catch (_) {}

    try {
      setInterval(() => {
        try {
          if (!ledgerRunLive() || isReplayLiveBlocked()) return;
          ledgerEvent("heartbeat", {
            points: 0,
            client_score: -1,
            client_event_hash: "heartbeat|" + safeFrame() + "|" + safeWave() + "|" + safeLives(),
          });
        } catch (_) {}
      }, 5000);
    } catch (_) {}

    ledgerHooksInstalled = true;
  }

  // Some uploaded main.js builds assume `enemies` was created before createEnemyFormation().
  // The current imported file calls createEnemyFormation() before assigning the group, which freezes
  // the screen after drawing only the background/player. Wrap Phaser.Game before main.js constructs it.
  try {
    if (typeof Phaser !== "undefined" && Phaser.Game && !Phaser.Game.__gkdWrapped) {
      const OriginalGame = Phaser.Game;
      const WrappedGame = function GKDWrappedGame(config) {
        try {
          if (config && config.scene && typeof config.scene.create === "function" && !config.scene.__gkdCreateWrapped) {
            const originalCreate = config.scene.create;
            config.scene.create = function gkdCreatePatched(...args) {
              try {
                // `enemies` is a top-level lexical binding declared in main.js; by create-time it exists.
                if (typeof enemies !== "undefined" && !enemies && this.physics && this.physics.add) {
                  enemies = this.physics.add.group();
                }
              } catch (_) {}
              const out = originalCreate.apply(this, args);
              try { installLedgerHooks(); } catch (_) {}
              return out;
            };
            config.scene.__gkdCreateWrapped = true;
          }
        } catch (_) {}
        return new OriginalGame(config);
      };
      WrappedGame.prototype = OriginalGame.prototype;
      Object.setPrototypeOf(WrappedGame, OriginalGame);
      WrappedGame.__gkdWrapped = true;
      Phaser.Game = WrappedGame;
    }
  } catch (_) {}

  function tickPlayerX() {
    try {
      if (typeof player !== "undefined" && player && player.active && Number.isFinite(player.x)) {
        playerX = player.x;
      }
    } catch (_) {
      playerX = 400;
    }
    try { requestAnimationFrame(tickPlayerX); }
    catch (_) { setTimeout(tickPlayerX, 16); }
  }
  tickPlayerX();
})();
