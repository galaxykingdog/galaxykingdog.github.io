// src/chain/chain_client.js
// Front-end Chain Wiring
// - Wallet connect (Phantom)
// - Entry fee deposit into the program-owned Pool PDA
// - Feeds chain fields into the POHP runPackage builder (player_pubkey, fee_lamports, entry_sig, entry_slot)
// - Persistent strict verifier wiring: /run/start + /run/event + /run/finalize + /verify
// - Direct wallet submission of verifier-approved runs to submit_verified_run

(function () {
  function $(id) { return document.getElementById(id); }

  const ZERO_CHAIN = "0".repeat(64);
  const LEDGER_VERSION = "GKD-AUTH-SCORE-LEDGER-v2";
  const PENDING_ENTRY_STORAGE_PREFIX = "gkd_pending_entry_v1";

  const state = {
    connected: false,
    pubkey: "",
    lastEntrySig: "",
    lastEntrySlot: null,

    lastVerify: null,
    lastSubmitSig: null,
    lastRunRecord: "",

    ledger: {
      active: false,
      finalized: false,
      run_ticket_id: "",
      event_seq: 0,
      accepted_score: 0,
      ledger_root: ZERO_CHAIN,
      challenge: null,
      lastStart: null,
      lastEvent: null,
      lastFinalize: null,
      lastError: "",
      integrityFailed: false,
      scoreIntegrityFailed: false,
      rejectedEvents: [],
      queue: Promise.resolve(),
    },
  };

  function status(msg) {
    try {
      const el = $("chain-status");
      if (el) el.textContent = msg;
    } catch (_) {}
    try {
      if (typeof window.__CHAIN_STATUS_CB === "function") window.__CHAIN_STATUS_CB(msg);
    } catch (_) {}
  }

  function getConnection() {
    const rpc = (window.CHAIN && window.CHAIN.rpcUrl) ? window.CHAIN.rpcUrl : "";
    const url = rpc && rpc.length ? rpc : solanaWeb3.clusterApiUrl(window.CHAIN?.cluster || "devnet");
    return new solanaWeb3.Connection(url, "processed");
  }

  function getBackendCfg() {
    const cfg = window.CHAIN || {};
    return {
      verifyUrl: cfg.verifyUrl || "",
      submitUrl: cfg.submitUrl || "",
      runAuthUrl: cfg.runAuthUrl || "",
      runStartUrl: cfg.runStartUrl || "",
      runEventUrl: cfg.runEventUrl || "",
      runFinalizeUrl: cfg.runFinalizeUrl || "",
    };
  }

  function syncPOHPContext() {
    const cfg = window.CHAIN || {};
    try {
      if (window.POHP && typeof window.POHP.setSeasonId === "function") {
        window.POHP.setSeasonId(cfg.seasonId || 1);
      }
      if (state.pubkey && window.POHP && typeof window.POHP.setPlayerPubkey === "function") {
        window.POHP.setPlayerPubkey(state.pubkey);
      }
      if (window.POHP && typeof window.POHP.setEntryProof === "function") {
        window.POHP.setEntryProof({
          fee_lamports: Number(cfg.feeLamports || 0),
          entry_sig: state.lastEntrySig || "",
          entry_slot: state.lastEntrySlot || 0,
        });
      }
      const ticketId = state.ledger.run_ticket_id || cfg.runTicketId || "";
      if (window.POHP && typeof window.POHP.setRunTicket === "function" && ticketId) {
        window.POHP.setRunTicket({ run_ticket_id: String(ticketId || "") });
      }
    } catch (_) {}
  }

  async function sha256Hex(value) {
    const msg = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest("SHA-256", msg);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function stableStringify(obj) {
    if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }

  function asInt(n, def = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? Math.trunc(x) : def;
  }

  // --- on-chain program (deposit_entry_fee -> Game Pool PDA / autopool) ---

  function getProgramId() {
    const id = window.CHAIN && window.CHAIN.programId;
    return id ? new solanaWeb3.PublicKey(id) : null;
  }

  function findPda(seeds, programId) {
    return solanaWeb3.PublicKey.findProgramAddressSync(seeds, programId)[0];
  }

  function pda(seedStr, programId) {
    return findPda([new TextEncoder().encode(seedStr)], programId);
  }

  // Anchor instruction discriminator: first 8 bytes of sha256("global:<name>").
  async function anchorDiscriminator(name) {
    const data = new TextEncoder().encode("global:" + name);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(hash).slice(0, 8);
  }

  function u64Le(value) {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, BigInt(value), true);
    return buf;
  }

  function u16Le(value) {
    const buffer = new Uint8Array(2);
    new DataView(buffer.buffer).setUint16(0, Number(value), true);
    return buffer;
  }

  function u32Le(value) {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setUint32(0, Number(value), true);
    return buffer;
  }

  function concatBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function hex32(name, value) {
    const clean = String(value || "").trim();
    if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error(`${name} must be a 32-byte hex string`);
    const output = new Uint8Array(32);
    for (let index = 0; index < 32; index++) output[index] = parseInt(clean.slice(index * 2, index * 2 + 2), 16);
    return output;
  }

  function base64Bytes(name, value, expectedLength) {
    let binary;
    try { binary = atob(String(value || "")); } catch (_) { throw new Error(`${name} is not valid base64`); }
    const output = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (expectedLength != null && output.length !== expectedLength) throw new Error(`${name} must decode to ${expectedLength} bytes`);
    return output;
  }

  function base58Bytes(name, value, expectedLength) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const source = String(value || "");
    if (!source) return new Uint8Array(expectedLength || 0);
    const bytes = [0];
    for (const character of source) {
      const digit = alphabet.indexOf(character);
      if (digit < 0) throw new Error(`${name} is not valid base58`);
      let carry = digit;
      for (let index = 0; index < bytes.length; index++) {
        carry += bytes[index] * 58;
        bytes[index] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    for (let index = 0; index < source.length - 1 && source[index] === "1"; index++) bytes.push(0);
    const output = Uint8Array.from(bytes.reverse());
    if (expectedLength != null && output.length !== expectedLength) throw new Error(`${name} must decode to ${expectedLength} bytes`);
    return output;
  }

  function fixedNameBytes(value) {
    const clean = String(value || "ANON").replace(/[^a-zA-Z0-9_\-. ]/g, "").trim().slice(0, 16) || "ANON";
    const encoded = new TextEncoder().encode(clean);
    const output = new Uint8Array(16);
    output.set(encoded.slice(0, 16));
    return output;
  }

  function stringBytes(value) {
    const encoded = new TextEncoder().encode(String(value || ""));
    return concatBytes([u32Le(encoded.length), encoded]);
  }

  function equalBytes(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
    return true;
  }

  function rememberSolanaOutcome(runHash, programId, player, details) {
    const cfg=window.CHAIN;
    const receipt={chain_kind:'solana',cluster:cfg.cluster,genesis_hash:cfg.genesisHash,program_id:programId.toBase58(),program_version:Number(cfg.programVersion||1),
      player_pubkey:player.toBase58(),run_hash:Array.from(runHash,b=>b.toString(16).padStart(2,'0')).join(''),...details};
    window.GKDRunReceipts?.rememberReceipt(receipt);
    try { localStorage.setItem('GKD_LAST_SUBMIT',JSON.stringify(receipt)); } catch (_) {}
    return receipt;
  }

  // Builds the gkd_chain deposit_entry_fee instruction. Account order must match the
  // DepositEntryFee context: config (ro), pool (w), player (signer/w), system_program (ro).
  async function buildDepositEntryFeeIx(programId, player, lamports) {
    const configPda = pda("config", programId);
    const poolPda = pda("pool", programId);
    const disc = await anchorDiscriminator("deposit_entry_fee");
    const data = new Uint8Array(disc.length + 8);
    data.set(disc, 0);
    data.set(u64Le(lamports), disc.length);
    return new solanaWeb3.TransactionInstruction({
      programId,
      keys: [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: player, isSigner: true, isWritable: true },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  function buildCanonicalRunMessage(args) {
    return concatBytes([
      new TextEncoder().encode("GKD_RUN_V1"),
      args.runHash,
      args.player.toBytes(),
      u16Le(args.seasonId),
      u64Le(args.score),
      u64Le(args.feeLamports),
      u64Le(args.entrySlot),
    ]);
  }

  async function buildSubmitVerifiedRunIx(programId, accounts, args) {
    const discriminator = await anchorDiscriminator("submit_verified_run");
    const data = concatBytes([
      discriminator,
      args.runHash,
      args.replayHash,
      args.versionHash,
      args.player.toBytes(),
      u16Le(args.seasonId),
      u64Le(args.feeLamports),
      u64Le(args.score),
      new Uint8Array([1]),
      args.entrySig,
      u64Le(args.entrySlot),
      args.verifier.toBytes(),
      args.verifierSig,
      stringBytes(args.runPackageUri),
      args.playerNameRaw || fixedNameBytes(args.playerName),
    ]);
    return new solanaWeb3.TransactionInstruction({
      programId,
      keys: [
        { pubkey: accounts.configPda, isSigner: false, isWritable: true },
        { pubkey: accounts.seasonPda, isSigner: false, isWritable: true },
        { pubkey: accounts.recordPda, isSigner: false, isWritable: true },
        { pubkey: accounts.runPda, isSigner: false, isWritable: true },
        ...(Number(window.CHAIN?.programVersion || 1) === 2 ? [{ pubkey: findPda([new TextEncoder().encode('run_achievement'), args.runHash], programId), isSigner: false, isWritable: true }] : []),
        ...(Number(window.CHAIN?.programVersion || 1) === 2 ? [{ pubkey: findPda([new TextEncoder().encode('entry_use'), new Uint8Array(await crypto.subtle.digest('SHA-256',args.entrySig))], programId), isSigner: false, isWritable: true }] : []),
        { pubkey: accounts.leaderboardPda, isSigner: false, isWritable: true },
        { pubkey: accounts.payer, isSigner: true, isWritable: true },
        { pubkey: solanaWeb3.SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  // --- on-chain top-3 leaderboard (matches the recorded score, top-left UI) ---

  function u64LeToNumber(bytes, off) {
    let v = 0n;
    for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[off + i] & 0xff);
    return Number(v);
  }

  function shortPubkey(pubkey) {
    const value = pubkey?.toBase58?.() || String(pubkey || "");
    return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
  }

  function samePubkey(left, right) {
    return left?.toBase58?.() === right?.toBase58?.();
  }

  async function inspectPoolProgram(connection, programId, serviceVerifier) {
    const configPda = pda("config", programId);
    const poolPda = pda("pool", programId);
    const seasonId = Number(window.CHAIN?.seasonId ?? 1);
    if (!Number.isSafeInteger(seasonId) || seasonId < 1 || seasonId > 65535) {
      throw new Error("configured season id is invalid");
    }
    const seasonPda = findPda([new TextEncoder().encode("season"), u16Le(seasonId)], programId);
    const [programInfo, configInfo, poolInfo, seasonInfo] = await connection.getMultipleAccountsInfo(
      [programId, configPda, poolPda, seasonPda],
      "processed"
    );
    const cluster = window.CHAIN?.cluster || "devnet";

    if (!programInfo || !programInfo.executable) {
      throw new Error(`program ${shortPubkey(programId)} is not deployed on ${cluster}`);
    }
    for (const [label, info, name, minLength] of [
      ["program config", configInfo, "GameConfig", 187],
      ["game pool", poolInfo, "Pool", 33],
      ["selected season", seasonInfo, "SeasonState", 87],
    ]) {
      if (!info || !samePubkey(info.owner, programId) || !info.data || info.data.length < minLength) {
        throw new Error(`${label} is missing or incompatible on ${cluster}`);
      }
      const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`account:${name}`))).slice(0, 8);
      if (!equalBytes(new Uint8Array(info.data).slice(0, 8), expected)) {
        throw new Error(`${label} account discriminator is invalid`);
      }
    }

    const configuredVerifier = new solanaWeb3.PublicKey(configInfo.data.slice(154, 186));
    if (!serviceVerifier || samePubkey(configuredVerifier, solanaWeb3.SystemProgram.programId)) {
      throw new Error("score verifier is unavailable; no new entry was requested");
    }
    if (!samePubkey(configuredVerifier, new solanaWeb3.PublicKey(serviceVerifier))) {
      throw new Error("score service verifier does not match the on-chain config; no new entry was requested");
    }

    const seasonBytes = new Uint8Array(seasonInfo.data);
    if ((seasonBytes[8] | (seasonBytes[9] << 8)) !== seasonId) {
      throw new Error("selected season account contains a different season id");
    }
    if (seasonBytes[82] !== 0) throw new Error("selected season is closed; no new entry was requested");
    const seasonView = new DataView(seasonBytes.buffer, seasonBytes.byteOffset, seasonBytes.byteLength);
    if (seasonView.getBigUint64(18, true) >= seasonView.getBigUint64(10, true)) {
      throw new Error("selected season has no rewards remaining; no new entry was requested");
    }

    const feeLamports = u64LeToNumber(configInfo.data, 72);
    if (!Number.isSafeInteger(feeLamports) || feeLamports <= 0) {
      throw new Error("on-chain entry fee is invalid");
    }
    if (configInfo.data[80] !== 0) {
      throw new Error(`program is paused on ${cluster}`);
    }

    return { configPda, poolPda, seasonPda, feeLamports };
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function simulationFailureMessage(value, cluster) {
    const logs = Array.isArray(value?.logs) ? value.logs : [];
    const anchorError = logs.find((line) => line.includes("AnchorError"));
    if (anchorError) return anchorError.replace(/^Program log:\s*/, "");

    const detail = JSON.stringify(value?.err || "simulation failed");
    if (/insufficient funds|insufficient lamports|InsufficientFundsForFee/i.test(detail + logs.join(" "))) {
      return `not enough SOL on ${cluster}`;
    }
    if (/AccountNotFound/i.test(detail)) {
      return `wallet is not funded on ${cluster}`;
    }
    return `transaction simulation failed on ${cluster}: ${detail}`;
  }

  async function simulateUnsignedTransaction(connection, tx) {
    const wire = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: [bytesToBase64(wire), {
          encoding: "base64",
          sigVerify: false,
          replaceRecentBlockhash: true,
          commitment: "processed",
        }],
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error || !payload?.result?.value) {
      const detail = payload?.error?.message || `RPC HTTP ${response.status}`;
      throw new Error(`transaction preflight unavailable: ${detail}`);
    }
    if (payload.result.value.err) {
      throw new Error(simulationFailureMessage(payload.result.value, window.CHAIN?.cluster || "devnet"));
    }
  }

  function entryFailureMessage(error, cluster) {
    if (error?.code === 4001) return "wallet request cancelled";
    const message = String(error?.message || error || "entry transaction failed");
    if (/rejected|cancelled|canceled|declined/i.test(message)) return "wallet request cancelled";
    return message.replace(/^Error:\s*/, "") || `entry transaction failed on ${cluster}`;
  }

  function pendingEntryStorageKey(cluster, programId, playerPubkey) {
    const program = programId?.toBase58?.() || String(programId || "direct");
    return `${PENDING_ENTRY_STORAGE_PREFIX}:${cluster}:${program}:${playerPubkey}`;
  }

  function entrySignatureFromUrl() {
    try {
      const signature = new URLSearchParams(window.location?.search || "").get("entry_sig") || "";
      return /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature) ? signature : "";
    } catch (_) {
      return "";
    }
  }

  function removeEntrySignatureFromUrl() {
    try {
      if (!window.location || !window.history || typeof window.history.replaceState !== "function") return;
      const url = new URL(window.location.href);
      if (!url.searchParams.has("entry_sig")) return;
      url.searchParams.delete("entry_sig");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {}
  }

  function readPendingEntry(cluster, programId, feeLamports) {
    const signatureFromUrl = entrySignatureFromUrl();
    if (signatureFromUrl) {
      return {
        sig: signatureFromUrl,
        cluster,
        programId: programId?.toBase58?.() || "",
        playerPubkey: state.pubkey,
        feeLamports,
        lastValidBlockHeight: 0,
        createdAt: Date.now(),
      };
    }
    try {
      const key = pendingEntryStorageKey(cluster, programId, state.pubkey);
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      if (!parsed || !/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(String(parsed.sig || ""))) return null;
      if (String(parsed.cluster || "") !== cluster) return null;
      if (String(parsed.playerPubkey || "") !== state.pubkey) return null;
      if (String(parsed.programId || "") !== (programId?.toBase58?.() || "")) return null;
      if (asInt(parsed.feeLamports, 0) !== asInt(feeLamports, 0)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writePendingEntry(cluster, programId, entry) {
    try {
      const key = pendingEntryStorageKey(cluster, programId, state.pubkey);
      localStorage.setItem(key, JSON.stringify({
        sig: String(entry.sig || ""),
        cluster,
        programId: programId?.toBase58?.() || "",
        playerPubkey: state.pubkey,
        feeLamports: asInt(entry.feeLamports, 0),
        blockhash: String(entry.blockhash || ""),
        lastValidBlockHeight: asInt(entry.lastValidBlockHeight, 0),
        createdAt: asInt(entry.createdAt, Date.now()),
      }));
    } catch (_) {}
  }

  function clearPendingEntry(cluster, programId) {
    try {
      localStorage.removeItem(pendingEntryStorageKey(cluster, programId, state.pubkey));
    } catch (_) {}
    removeEntrySignatureFromUrl();
  }

  async function landedEntryStatus(connection, signature) {
    try {
      const statusResponse = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
      const value = statusResponse?.value;
      if (value) {
        if (value.err) throw new Error(`entry transaction failed: ${JSON.stringify(value.err)}`);
        return { sig: signature, slot: value.slot ?? null };
      }
    } catch (error) {
      if (/entry transaction failed:/i.test(String(error?.message || ""))) throw error;
    }
    try {
      const txInfo = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (txInfo) {
        if (txInfo.meta?.err) throw new Error(`entry transaction failed: ${JSON.stringify(txInfo.meta.err)}`);
        return { sig: signature, slot: txInfo.slot ?? null };
      }
    } catch (error) {
      if (/entry transaction failed:/i.test(String(error?.message || ""))) throw error;
    }
    return null;
  }

  async function recoverPendingEntry(connection, cluster, programId, feeLamports) {
    const pending = readPendingEntry(cluster, programId, feeLamports);
    if (!pending) return null;
    status("CHAIN: checking previous paid entry…");
    const landed = await landedEntryStatus(connection, pending.sig);
    if (landed) {
      const recovered = { ...pending, ...landed, feeLamports };
      writePendingEntry(cluster, programId, recovered);
      state.lastEntrySig = recovered.sig;
      state.lastEntrySlot = recovered.slot;
      syncPOHPContext();
      status("CHAIN: paid entry recovered ✓ " + recovered.sig.slice(0, 6) + "…" + recovered.sig.slice(-6));
      return recovered;
    }

    const lastValidBlockHeight = asInt(pending.lastValidBlockHeight, 0);
    if (lastValidBlockHeight > 0) {
      try {
        const currentBlockHeight = await connection.getBlockHeight("processed");
        if (currentBlockHeight > lastValidBlockHeight) {
          clearPendingEntry(cluster, programId);
          return null;
        }
      } catch (_) {}
    }
    throw new Error("previous entry is still awaiting chain confirmation; no new payment was requested — press SPACE again shortly");
  }

  // Reads the Leaderboard PDA and parses its fixed layout:
  // 8 disc | count u8 | 3 x { score u64, player [32], name [16] } | bump u8
  async function fetchLeaderboard() {
    const programId = getProgramId();
    if (!programId) return null;
    try {
      const connection = getConnection();
      const lbPda = pda("leaderboard", programId);
      const info = await connection.getAccountInfo(lbPda);
      if (!info || !info.data) return null;
      const b = info.data instanceof Uint8Array ? info.data : new Uint8Array(info.data);
      let o = 8;
      const count = b[o]; o += 1;
      const out = [];
      for (let i = 0; i < 3; i++) {
        const score = u64LeToNumber(b, o); o += 8;
        const playerBytes = b.slice(o, o + 32); o += 32;
        const nameBytes = b.slice(o, o + 16); o += 16;
        if (i < count) {
          const player = new solanaWeb3.PublicKey(playerBytes).toBase58();
          const name = new TextDecoder().decode(nameBytes).replace(/\0+$/g, "").trim();
          out.push({ score, player, name });
        }
      }
      return out;
    } catch (_) {
      return null;
    }
  }

  function escapeLeaderboardText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function renderLeaderboard(list) {
    let el = document.getElementById("gkd-leaderboard");
    if (!el) {
      el = document.createElement("div");
      el.id = "gkd-leaderboard";
      el.style.cssText = "position:fixed;top:56px;left:10px;z-index:9999;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:8px 12px;font-family:'Courier New',monospace;color:#0f0;font-size:12px;min-width:190px;line-height:1.5;";
      document.body.appendChild(el);
    }
    const medals = ["🥇", "🥈", "🥉"];
    const rows = (list && list.length)
      ? list.map((e, i) => {
          const w = e.player ? (e.player.slice(0, 4) + "…" + e.player.slice(-4)) : "";
          const who = escapeLeaderboardText(e.name ? `${e.name} (${w})` : w);
          return `<div>${medals[i] || (i + 1 + ".")} ${e.score}  <span style="opacity:.85">${who}</span></div>`;
        }).join("")
      : "<div style='opacity:.7'>(no scores yet)</div>";
    el.innerHTML = `<div style="opacity:.85;margin-bottom:4px;letter-spacing:1px;">🏆 TOP 3</div>${rows}`;
  }

  async function refreshLeaderboard() {
    const list = await fetchLeaderboard();
    if (list) renderLeaderboard(list);
    return list;
  }

  function cleanLedgerEvent(raw = {}) {
    return {
      event_seq: asInt(raw.event_seq, state.ledger.event_seq + 1),
      type: String(raw.type || ""),
      frame: asInt(raw.frame, 0),
      wave: Math.max(1, asInt(raw.wave, 1)),
      lives: asInt(raw.lives, 0),
      enemy_id: String(raw.enemy_id || ""),
      enemy_type: String(raw.enemy_type || ""),
      enemy_state: String(raw.enemy_state || ""),
      points: asInt(raw.points, 0),
      client_score: asInt(raw.client_score, raw.score ?? -1),
      client_event_hash: String(raw.client_event_hash || ""),
    };
  }

  async function computeChallengeResponse(event) {
    const e = cleanLedgerEvent(event);
    const challenge = state.ledger.challenge || {};
    const material = stableStringify({
      v: LEDGER_VERSION,
      ticket_id: String(state.ledger.run_ticket_id || ""),
      challenge_nonce: String(challenge.nonce || ""),
      prev_event_chain: String(state.ledger.ledger_root || ZERO_CHAIN),
      event_seq: e.event_seq,
      type: e.type,
      frame: e.frame,
      wave: e.wave,
      lives: e.lives,
      enemy_id: e.enemy_id,
      enemy_type: e.enemy_type,
      enemy_state: e.enemy_state,
      points: e.points,
      client_score: e.client_score,
      client_event_hash: e.client_event_hash,
    });
    return sha256Hex(material);
  }

  async function postJSON(url, payload) {
    const routes = getBackendCfg();
    // Only the capability-gated event/finalize endpoints accept identical delivery retries.
    const retryableRoute = !!url && [routes.runEventUrl, routes.runFinalizeUrl].includes(url)
      && ![routes.runAuthUrl, routes.runStartUrl, routes.verifyUrl, routes.submitUrl].includes(url);
    const body = JSON.stringify(payload); // Keep nonce, sequence and challenge bytes unchanged.
    const maxAttempts = retryableRoute ? 3 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let response = null, timer;
      const controller = retryableRoute ? new AbortController() : null;
      try {
        const request = (async () => {
          response = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" }, body,
            ...(controller ? { signal: controller.signal } : {}),
          });
          let result = null;
          try { result = await response.json(); }
          catch (_) { if (retryableRoute && response.ok) throw new Error("Invalid JSON acknowledgement"); }
          if (!response.ok) throw new Error(result?.error || result?.message || `HTTP ${response.status}`);
          if (retryableRoute && (!result || Array.isArray(result) || typeof result.ok !== "boolean")) {
            throw new Error("Invalid JSON acknowledgement");
          }
          return result;
        })();
        if (!retryableRoute) return await request;
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort(); reject(new Error("Score service acknowledgement timed out"));
          }, 8000);
        });
        return await Promise.race([request, deadline]);
      } catch (error) {
        // Never retry a client/auth rejection, including a malformed or stalled 4xx body.
        const transient = !response || response.ok || (response.status >= 500 && response.status <= 599);
        if (!retryableRoute || !transient || attempt + 1 === maxAttempts) throw error;
      } finally { if (timer !== undefined) clearTimeout(timer); }
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  async function connectWallet() {
    if (!window.solana || !window.solana.isPhantom) {
      status("CHAIN: Phantom wallet not found");
      return false;
    }
    try {
      status("CHAIN: connecting wallet…");
      const resp = await window.solana.connect();
      const pk = resp?.publicKey?.toString?.() || window.solana.publicKey?.toString?.() || "";
      if (!pk) {
        status("CHAIN: wallet connect failed");
        return false;
      }
      state.connected = true;
      state.pubkey = pk;
      syncPOHPContext();
      status("CHAIN: connected " + pk.slice(0, 4) + "…" + pk.slice(-4));
      return true;
    } catch (e) {
      status("CHAIN: wallet connect cancelled");
      return false;
    }
  }

  async function payEntryFee(extra = {}) {
    const cfg = window.CHAIN || {};
    let serviceHealth;
    try {
      if (!window.GKDWeb3Preflight?.ensure) throw new Error('Secure entry check is unavailable.');
      serviceHealth = await window.GKDWeb3Preflight.ensure(cfg, extra);
    } catch (error) { status('CHAIN: ' + String(error?.message || error)); return null; }
    const cluster = cfg.cluster || "devnet";
    let feeLamports = Number(cfg.feeLamports || 0);
    const recipient = cfg.poolRecipient;
    const programId = getProgramId();
    const usePool = !!cfg.usePoolProgram;

    if (!feeLamports || feeLamports <= 0) {
      status("CHAIN: fee is not set");
      return null;
    }
    if (usePool && !programId) {
      status(`CHAIN: no pool program configured for ${cluster}`);
      return null;
    }
    if (!usePool && !recipient) {
      status("CHAIN: poolRecipient missing");
      return null;
    }

    try {
      const connection = getConnection();
      if (cluster !== 'devnet' || !cfg.genesisHash || await connection.getGenesisHash() !== cfg.genesisHash) throw new Error('Browser RPC does not match Solana Devnet. No entry sent.');
      if (usePool) {
        status(`CHAIN: checking ${cluster} pool…`);
        const poolState = await inspectPoolProgram(connection, programId, serviceHealth?.chains?.solana?.verifier_pubkey);
        feeLamports = poolState.feeLamports;
        cfg.feeLamports = feeLamports;
        syncPOHPContext();
      }

      if (!state.connected) {
        const ok = await connectWallet();
        if (!ok) return null;
      }

      const recoveredEntry = await recoverPendingEntry(connection, cluster, programId, feeLamports);
      if (recoveredEntry) return recoveredEntry;

      status("CHAIN: preparing entry tx…");

      const fromPubkey = new solanaWeb3.PublicKey(state.pubkey);

      let tx;
      if (usePool) {
        // Pay into the program-owned Game Pool PDA via deposit_entry_fee (the autopool).
        const ix = await buildDepositEntryFeeIx(programId, fromPubkey, feeLamports);
        tx = new solanaWeb3.Transaction().add(ix);
      } else {
        // Fallback: plain transfer to the temporary recipient (pre-deploy / testing only).
        const toPubkey = new solanaWeb3.PublicKey(recipient);
        tx = new solanaWeb3.Transaction().add(
          solanaWeb3.SystemProgram.transfer({ fromPubkey, toPubkey, lamports: feeLamports })
        );
      }

      tx.feePayer = fromPubkey;
      const simulationBlockhash = await connection.getLatestBlockhash("processed");
      tx.recentBlockhash = simulationBlockhash.blockhash;

      status(`CHAIN: simulating entry tx on ${cluster}…`);
      await simulateUnsignedTransaction(connection, tx);

      const latest = await connection.getLatestBlockhash("processed");
      tx.recentBlockhash = latest.blockhash;

      status(`CHAIN: review ${(feeLamports / solanaWeb3.LAMPORTS_PER_SOL).toFixed(5)} SOL on ${cluster}…`);

      let sig = null;
      if (typeof window.solana.signTransaction === "function") {
        const signed = await window.solana.signTransaction(tx);
        sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "processed" });
      } else if (typeof window.solana.signAndSendTransaction === "function") {
        const sent = await window.solana.signAndSendTransaction(tx);
        sig = sent?.signature || sent;
      } else {
        throw new Error("wallet does not support transaction signing");
      }

      if (!sig) {
        status("CHAIN: entry tx failed");
        return null;
      }

      writePendingEntry(cluster, programId, {
        sig,
        feeLamports,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        createdAt: Date.now(),
      });

      status("CHAIN: confirming entry tx…");
      let slot = null;
      try {
        const confirmation = await connection.confirmTransaction(
          { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
          "confirmed"
        );
        if (confirmation.value.err) {
          clearPendingEntry(cluster, programId);
          throw new Error(`entry transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
      } catch (confirmationError) {
        const landed = await landedEntryStatus(connection, sig);
        if (!landed) {
          throw new Error("entry confirmation timed out; the paid signature was saved and will be recovered automatically — do not approve another transaction yet");
        }
        slot = landed.slot;
      }
      if (slot == null) slot = (await landedEntryStatus(connection, sig))?.slot ?? null;

      state.lastEntrySig = sig;
      state.lastEntrySlot = slot;
      syncPOHPContext();

      status("CHAIN: entry paid ✓ " + sig.slice(0, 6) + "…" + sig.slice(-6));
      return { sig, slot, feeLamports };
    } catch (e) {
      console.error("CHAIN entry fee failed", e);
      status("CHAIN: entry blocked — " + entryFailureMessage(e, cluster));
      return null;
    }
  }

  async function ensureEntryPaid(extra = {}) {
    const cfg = window.CHAIN || {};
    syncPOHPContext();
    if (!cfg.enabled) return true;

    const entry = await payEntryFee(extra);
    if (!entry) return false;
    const { runStartUrl } = getBackendCfg();
    if (!runStartUrl) {
      status("CHAIN: run ledger endpoint is missing");
      return false;
    }
    try {
      const started = await startLedgerRun(extra);
      if (started) clearPendingEntry(cfg.cluster || "devnet", getProgramId());
      return !!started;
    } catch (error) {
      if (/already bound to another run/i.test(String(error?.message || ""))) {
        clearPendingEntry(cfg.cluster || "devnet", getProgramId());
      }
      status("CHAIN: run ledger start blocked — " + String(error?.message || error));
      return false;
    }
  }

  async function startLedgerRun(extra = {}) {
    const { runAuthUrl, runStartUrl } = getBackendCfg();
    const cfg = window.CHAIN || {};
    if (!cfg.enabled || !runStartUrl) return null;
    if (!state.connected) {
      const ok = await connectWallet();
      if (!ok) return null;
    }

    if (!runAuthUrl) throw new Error("run authentication endpoint is missing");
    if (!state.lastEntrySig) throw new Error("paid entry signature is missing");
    if (typeof window.solana?.signMessage !== "function") throw new Error("wallet does not support secure run authorization");

    status("CHAIN: preparing free run authorization…");
    const authChallenge = await postJSON(runAuthUrl, {
      player_pubkey: state.pubkey,
      entry_sig: state.lastEntrySig,
    });
    if (!authChallenge || authChallenge.ok !== true) throw new Error(authChallenge?.error || "run authentication challenge failed");
    if (String(authChallenge.player_pubkey || "") !== state.pubkey) throw new Error("run authentication wallet mismatch");
    if (String(authChallenge.entry_sig || "") !== state.lastEntrySig) throw new Error("run authentication entry mismatch");
    const authMaterial = String(authChallenge.material || "");
    const authChallengeId = String(authChallenge.challenge_id || "");
    if (!authMaterial || !authChallengeId) throw new Error("run authentication challenge is incomplete");

    status("CHAIN: sign free run authorization in wallet…");
    const signedAuth = await window.solana.signMessage(new TextEncoder().encode(authMaterial), "utf8");
    const authSignature = signedAuth?.signature || signedAuth;
    if (!(authSignature instanceof Uint8Array) || authSignature.length !== 64) {
      throw new Error("wallet returned an invalid run authorization signature");
    }

    const payload = {
      player_pubkey: state.pubkey,
      game_id: cfg.gameId || extra.game_id || "420_HIGH_SCORE_GALAXIAN",
      season_id: cfg.seasonId || 1,
      client_ruleset: extra.client_ruleset || extra.game_version || "",
      client_capabilities: ['wave_roster_v1'],
      lives: asInt(extra.lives, 3),
      entry_sig: state.lastEntrySig || "",
      entry_slot: asInt(state.lastEntrySlot, 0),
      fee_lamports: asInt(cfg.feeLamports, 0),
      auth_challenge_id: authChallengeId,
      auth_signature_b64: bytesToBase64(authSignature),
    };

    status("CHAIN: starting live ledger…");
    const j = await postJSON(runStartUrl, payload);
    if (!j || j.ok !== true) throw new Error(j?.error || "run/start failed");

    state.ledger.active = true;
    state.ledger.finalized = false;
    state.ledger.run_ticket_id = String(j.run_ticket_id || "");
    state.ledger.event_seq = asInt(j.event_seq, 0);
    state.ledger.accepted_score = asInt(j.accepted_score, 0);
    state.ledger.ledger_root = String(j.ledger_root || ZERO_CHAIN);
    state.ledger.challenge = j.challenge || null;
    state.ledger.lastStart = j;
    state.ledger.lastEvent = null;
    state.ledger.lastFinalize = null;
    state.ledger.lastError = "";
    state.ledger.integrityFailed = false;
    state.ledger.scoreIntegrityFailed = false;
    state.ledger.rejectedEvents = [];
    state.ledger.queue = Promise.resolve();
    syncPOHPContext();
    status("CHAIN: live ledger started ✅");
    return j;
  }

  function enqueueLedgerTask(fn) {
    const run = state.ledger.queue.then(fn, fn);
    // Keep the queue alive even when one event fails; later events can still show useful errors.
    state.ledger.queue = run.catch(() => {});
    return run;
  }

  async function submitLedgerEvent(event = {}) {
    let attemptedEvent = null;
    return enqueueLedgerTask(async () => {
      const { runEventUrl } = getBackendCfg();
      if (!state.ledger.active || state.ledger.finalized || !runEventUrl) return null;
      if (!state.ledger.run_ticket_id || !state.ledger.challenge) return null;
      if (state.ledger.integrityFailed) return null;

      const e = cleanLedgerEvent({ ...event, event_seq: state.ledger.event_seq + 1 });
      attemptedEvent = e;
      const scoreBefore = state.ledger.accepted_score;
      const challenge_response = await computeChallengeResponse(e);
      const payload = {
        run_ticket_id: state.ledger.run_ticket_id,
        ...e,
        challenge_response,
      };

      const j = await postJSON(runEventUrl, payload);
      if (!j || j.ok !== true) throw new Error(j?.error || "run/event failed");

      state.ledger.event_seq = asInt(j.event_seq, state.ledger.event_seq + 1);
      state.ledger.accepted_score = asInt(j.accepted_score, state.ledger.accepted_score);
      state.ledger.ledger_root = String(j.ledger_root || state.ledger.ledger_root || ZERO_CHAIN);
      state.ledger.challenge = j.next_challenge || null;
      state.ledger.lastEvent = j;
      const expectedScore = scoreBefore + Math.max(0, e.points);
      if (e.points > 0 && state.ledger.accepted_score !== expectedScore) {
        throw new Error(`Score acknowledgement mismatch for ${e.type}: expected ${expectedScore}, got ${state.ledger.accepted_score}`);
      }
      return j;
    }).catch((e) => {
      const message = String(e?.message || e);
      const rejected = {
        event_seq: attemptedEvent?.event_seq || 0,
        type: attemptedEvent?.type || String(event?.type || "unknown"),
        points: attemptedEvent?.points || 0,
        frame: attemptedEvent?.frame || 0,
        wave: attemptedEvent?.wave || 0,
        enemy_id: attemptedEvent?.enemy_id || "",
        enemy_type: attemptedEvent?.enemy_type || "",
        error: message,
      };
      state.ledger.lastError = message;
      state.ledger.rejectedEvents.push(rejected);
      if (state.ledger.rejectedEvents.length > 25) state.ledger.rejectedEvents.shift();
      state.ledger.integrityFailed = true;
      if (rejected.points > 0 || ["kill", "bomb_kill", "boss_hit", "wave_clear", "gift_collect"].includes(rejected.type)) {
        state.ledger.scoreIntegrityFailed = true;
      }
      try { localStorage.setItem("GKD_LEDGER_ERRORS", JSON.stringify(state.ledger.rejectedEvents)); } catch (_) {}
      status(`LEDGER: ${rejected.type} rejected — ${message}`);
      return null;
    });
  }

  async function finalizeLedgerRun(finalInput = {}) {
    const { runFinalizeUrl } = getBackendCfg();
    if (!state.ledger.active || state.ledger.finalized || !runFinalizeUrl) return null;
    if (!state.ledger.run_ticket_id || !state.ledger.challenge) return null;

    return enqueueLedgerTask(async () => {
      if (state.ledger.integrityFailed || state.ledger.scoreIntegrityFailed) {
        const failed = state.ledger.rejectedEvents[0];
        throw new Error(`Ledger event ${failed?.type || "unknown"} was rejected at wave ${failed?.wave || 0}, frame ${failed?.frame || 0}: ${failed?.error || state.ledger.lastError}`);
      }
      const e = cleanLedgerEvent({
        type: "finalize",
        event_seq: state.ledger.event_seq + 1,
        frame: asInt(finalInput.frame, 0),
        wave: asInt(finalInput.wave, 1),
        lives: asInt(finalInput.lives, 0),
        points: 0,
        client_score: asInt(finalInput.client_score, finalInput.final_score ?? state.ledger.accepted_score),
        client_event_hash: String(finalInput.client_event_hash || ""),
      });
      const challenge_response = await computeChallengeResponse(e);
      const payload = {
        run_ticket_id: state.ledger.run_ticket_id,
        ...e,
        challenge_response,
      };

      status("CHAIN: finalizing score ledger…");
      const j = await postJSON(runFinalizeUrl, payload);
      if (!j || j.ok !== true) throw new Error(j?.error || "run/finalize failed");

      state.ledger.finalized = true;
      state.ledger.active = false;
      state.ledger.event_seq = asInt(j.event_seq, state.ledger.event_seq + 1);
      state.ledger.accepted_score = asInt(j.accepted_score, state.ledger.accepted_score);
      state.ledger.ledger_root = String(j.ledger_root || state.ledger.ledger_root || ZERO_CHAIN);
      state.ledger.lastFinalize = j;
      state.ledger.lastError = "";
      status("CHAIN: ledger finalized ✅ score " + state.ledger.accepted_score);
      return j;
    }).catch((e) => {
      const message = String(e?.message || e);
      state.ledger.lastError = message;
      status("LEDGER: finalize rejected — " + message);
      throw e;
    });
  }

  async function verifyRun(runPackage) {
    const { verifyUrl } = getBackendCfg();
    if (!verifyUrl) throw new Error("Missing CHAIN.verifyUrl");

    status("CHAIN: verifying…");
    const named = Number(window.CHAIN?.programVersion || 1) === 2 ? { ...runPackage, player_name: '0x' + Array.from(fixedNameBytes(localStorage.getItem('gkd_playerName_v1') || 'ANON'), b => b.toString(16).padStart(2,'0')).join('') } : runPackage;
    const j = await postJSON(verifyUrl, named);

    if (!j || j.ok !== true) throw new Error(j?.error || "verify failed");

    state.lastVerify = j;
    try { localStorage.setItem("GKD_LAST_VERIFY", JSON.stringify(j)); } catch (_) {}

    status("CHAIN: verified ✅");
    return j;
  }

  async function submitMemo(memoText) {
    const { submitUrl } = getBackendCfg();
    if (!submitUrl) throw new Error("Missing CHAIN.submitUrl");

    status("CHAIN: submitting…");
    const j = await postJSON(submitUrl, { memoText });

    if (!j || j.ok !== true) throw new Error(j?.error || "submit failed");

    state.lastSubmitSig = j.submit_sig || "";
    try { localStorage.setItem("GKD_LAST_SUBMIT", JSON.stringify(j)); } catch (_) {}

    status("CHAIN: submitted ✅ " + (state.lastSubmitSig ? (state.lastSubmitSig.slice(0, 6) + "…" + state.lastSubmitSig.slice(-6)) : ""));
    return j;
  }

  async function submitVerifiedRun(runPackage, verifiedResult) {
    const cfg = window.CHAIN || {};
    const cluster = cfg.cluster || "devnet";
    const verified = verifiedResult || state.lastVerify;
    if (!cfg.enabled) throw new Error("chain mode is disabled");
    if (!verified || verified.ok !== true) throw new Error("run has not been verified");
    if (!verified.chain_msg_b64 || !verified.chain_sig_b64 || !verified.verifier_pubkey) {
      throw new Error("verifier did not return the required on-chain signature");
    }
    if (verified.cluster && verified.cluster !== cluster) throw new Error(`verifier cluster ${verified.cluster} does not match ${cluster}`);
    if (!state.connected) {
      const connected = await connectWallet();
      if (!connected) throw new Error("wallet connection is required");
    }

    const programId = getProgramId();
    if (!programId) throw new Error(`no program id configured for ${cluster}`);
    const payer = new solanaWeb3.PublicKey(state.pubkey);
    const packagePlayer = new solanaWeb3.PublicKey(String(runPackage?.player_pubkey || ""));
    if (!samePubkey(payer, packagePlayer)) throw new Error("connected wallet does not own this run");

    const runHash = hex32("run_hash", verified.run_hash || runPackage?.run_hash);
    const replayHash = hex32("replay_hash", verified.replay_hash || runPackage?.replay_hash);
    const versionHash = hex32("version_hash", runPackage?.version_hash);
    const seasonId = asInt(runPackage?.season_id, 0);
    const score = asInt(verified.chain_score, -1);
    const feeLamports = asInt(verified.chain_fee_lamports, -1);
    const entrySlot = asInt(verified.chain_entry_slot, -1);
    if (seasonId < 1 || seasonId > 0xffff) throw new Error("invalid season id");
    if (!Number.isSafeInteger(score) || score < 0) throw new Error("invalid verified score");
    if (!Number.isSafeInteger(feeLamports) || feeLamports <= 0) throw new Error("invalid verified entry fee");
    if (!Number.isSafeInteger(entrySlot) || entrySlot <= 0) throw new Error("invalid verified entry slot");
    if (score !== asInt(runPackage?.accepted_score, -1)) throw new Error("verified score does not match the finalized ledger");
    if (feeLamports !== asInt(runPackage?.fee_lamports, -1)) throw new Error("verified fee does not match the run package");

    const verifier = new solanaWeb3.PublicKey(verified.verifier_pubkey);
    const protocolV2 = Number(cfg.programVersion || 1) === 2;
    if (protocolV2 && Number(verified.solana_run_protocol) !== 2) throw new Error('Verifier signature protocol does not match the candidate program');
    const playerNameRaw = protocolV2 ? Uint8Array.from(String(verified.player_name || '').replace(/^0x/,'').match(/.{2}/g) || [], b => parseInt(b,16)) : null;
    const chainMessage = base64Bytes("chain_msg_b64", verified.chain_msg_b64, protocolV2 ? 106 : 100);
    const chainSignature = base64Bytes("chain_sig_b64", verified.chain_sig_b64, 64);
    const expectedMessage = protocolV2 ? await window.GKDSolanaProtocol.canonicalV2({
      program: programId.toBytes(), genesis: new solanaWeb3.PublicKey(cfg.genesisHash).toBytes(),
      runHash, replayHash, versionHash, player: payer.toBytes(), seasonId, score, feeLamports, entrySlot,
      entrySig: base58Bytes('entry_sig',runPackage?.entry_sig,64), playerName: playerNameRaw
    }) : buildCanonicalRunMessage({ runHash, player: payer, seasonId, score, feeLamports, entrySlot });
    if (!equalBytes(chainMessage, expectedMessage)) throw new Error("verifier chain message does not match this run");

    const configPda = pda("config", programId);
    const seasonPda = findPda([new TextEncoder().encode("season"), u16Le(seasonId)], programId);
    const recordPda = pda("record", programId);
    const runPda = findPda([new TextEncoder().encode("run"), runHash], programId);
    const leaderboardPda = pda("leaderboard", programId);
    const connection = getConnection();
    if (cluster !== 'devnet' || !cfg.genesisHash || await connection.getGenesisHash() !== cfg.genesisHash) throw new Error('Browser RPC does not match Solana Devnet. No record submitted.');
    const accountInfos = await connection.getMultipleAccountsInfo(
      [configPda, seasonPda, recordPda, leaderboardPda, runPda],
      "processed"
    );
    const [configInfo, seasonInfo, recordInfo, leaderboardInfo, runInfo] = accountInfos;
    if (runInfo) {
      const bytes=new Uint8Array(runInfo.data);
      const expectedDiscriminator=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('account:RunRecord'))).slice(0,8);
      if (!samePubkey(runInfo.owner,programId) || !equalBytes(bytes.slice(0,8),expectedDiscriminator)) throw new Error('Existing run account is not a valid program record.');
      const recorded=window.GKDSolanaProtocol.decodeRun(bytes);
      if (!equalBytes(recorded.runHash,runHash) || !equalBytes(recorded.player,payer.toBytes()) || !equalBytes(bytes.slice(40,72),replayHash) || !equalBytes(bytes.slice(72,104),versionHash) || recorded.score!==BigInt(score) || recorded.seasonId!==seasonId) throw new Error('Existing run record does not match this verified run.');
      state.lastRunRecord = runPda.toBase58();
      rememberSolanaOutcome(runHash,programId,payer,{outcome:'recorded',run_record:state.lastRunRecord,submit_sig:''});
      status("CHAIN: run already recorded ✅");
      return { already_recorded: true, run_record: state.lastRunRecord, submit_sig: "" };
    }
    for (const [label, info] of [["config", configInfo], ["season", seasonInfo], ["record", recordInfo], ["leaderboard", leaderboardInfo]]) {
      if (!info || !samePubkey(info.owner, programId)) throw new Error(`${label} PDA is missing or owned by another program`);
    }
    const configBytes = configInfo.data instanceof Uint8Array ? configInfo.data : new Uint8Array(configInfo.data);
    const seasonBytes = seasonInfo.data instanceof Uint8Array ? seasonInfo.data : new Uint8Array(seasonInfo.data);
    if (configBytes.length < 187 || seasonBytes.length < 83) throw new Error("on-chain account layout is incompatible");
    if (configBytes[80] !== 0) throw new Error("the game program is paused");
    const configuredVerifier = new solanaWeb3.PublicKey(configBytes.slice(154, 186));
    if (!samePubkey(configuredVerifier, verifier)) throw new Error("verifier key does not match the on-chain config");
    const onChainSeason = seasonBytes[8] | (seasonBytes[9] << 8);
    if (onChainSeason !== seasonId) throw new Error("season PDA contains a different season id");
    if (seasonBytes[82] !== 0) throw new Error("season is closed");
    const scoreTarget = u64LeToNumber(seasonBytes, 26);
    if (!protocolV2 && score < scoreTarget) {
      const verifierKey=await crypto.subtle.importKey('raw',verifier.toBytes(),{name:'Ed25519'},false,['verify']);
      if (!await crypto.subtle.verify({name:'Ed25519'},verifierKey,chainSignature,chainMessage)) throw new Error('Invalid verifier signature for this completed attempt.');
      rememberSolanaOutcome(runHash,programId,payer,{outcome:'below_target',score,target:scoreTarget,run_record:'',submit_sig:''});
      status(`CHAIN: verified score ${score}; this legacy season needs ${scoreTarget} for an on-chain reward. Run finished.`);
      return {below_target:true,score,target:scoreTarget,run_record:'',submit_sig:''};
    }

    const entrySig = base58Bytes("entry_sig", runPackage?.entry_sig, 64);
    const playerName = localStorage.getItem("gkd_playerName_v1") || runPackage?.player_name || "ANON";
    const args = {
      runHash,
      replayHash,
      versionHash,
      player: payer,
      seasonId,
      feeLamports,
      score,
      entrySig,
      entrySlot,
      verifier,
      verifierSig: chainSignature,
      runPackageUri: `web:${String(verified.run_hash || runPackage?.run_hash)}`,
      playerName,
      playerNameRaw,
    };
    const submitInstruction = await buildSubmitVerifiedRunIx(programId, {
      configPda,
      seasonPda,
      recordPda,
      runPda,
      leaderboardPda,
      payer,
    }, args);
    const ed25519Instruction = solanaWeb3.Ed25519Program.createInstructionWithPublicKey({
      publicKey: verifier.toBytes(),
      message: chainMessage,
      signature: chainSignature,
    });
    const transaction = new solanaWeb3.Transaction().add(ed25519Instruction).add(submitInstruction);
    transaction.feePayer = payer;
    const latest = await connection.getLatestBlockhash("processed");
    transaction.recentBlockhash = latest.blockhash;
    status(`CHAIN: simulating verified score on ${cluster}…`);
    await simulateUnsignedTransaction(connection, transaction);
    status("CHAIN: approve leaderboard record in wallet…");

    let signature;
    if (typeof window.solana.signTransaction === "function") {
      const signed = await window.solana.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "processed" });
    } else if (typeof window.solana.signAndSendTransaction === "function") {
      const sent = await window.solana.signAndSendTransaction(transaction);
      signature = sent?.signature || sent;
    } else {
      throw new Error("wallet does not support transaction signing");
    }
    if (!signature) throw new Error("wallet did not return a transaction signature");
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed"
    );
    if (confirmation.value.err) throw new Error(`submit_verified_run failed: ${JSON.stringify(confirmation.value.err)}`);

    state.lastSubmitSig = signature;
    state.lastRunRecord = runPda.toBase58();
    rememberSolanaOutcome(runHash,programId,payer,{outcome:'recorded',run_record:state.lastRunRecord,submit_sig:signature});
    status("CHAIN: score recorded on-chain ✅ " + signature.slice(0, 6) + "…" + signature.slice(-6));
    await refreshLeaderboard();
    return { already_recorded: false, submit_sig: signature, run_record: state.lastRunRecord, score };
  }

  async function finalizeRun(runPackage) {
    syncPOHPContext();

    let ledgerFinal = null;
    if (state.ledger.run_ticket_id && !state.ledger.finalized) {
      const lastCp = runPackage && runPackage.last_checkpoint ? runPackage.last_checkpoint : {};
      ledgerFinal = await finalizeLedgerRun({
        frame: asInt(runPackage?.masks_len, lastCp.frame || 0),
        wave: asInt(runPackage?.final_wave, lastCp.final_wave || 1),
        lives: asInt(lastCp.lives, 0),
        final_score: asInt(runPackage?.final_score, 0),
        client_score: asInt(runPackage?.final_score, 0),
        client_event_hash: String(runPackage?.run_hash || ""),
      });
      if (ledgerFinal && runPackage) {
        runPackage.accepted_score = ledgerFinal.accepted_score;
        runPackage.ledger_root = ledgerFinal.ledger_root;
        runPackage.ledger_final_hash = ledgerFinal.final_hash;
        runPackage.ledger_memoText = ledgerFinal.memoText;
        runPackage.ledger_verifier_sig = ledgerFinal.verifier_sig;
      }
    }

    if (state.ledger.run_ticket_id && !state.ledger.finalized) {
      throw new Error(state.ledger.lastError || "Run ledger is not finalized; press B to retry.");
    }

    const v = await verifyRun(runPackage);

    const submitted = await submitVerifiedRun(runPackage, v);
    return { ledger: ledgerFinal, verify: v, submit: submitted };
  }

  function lastRecordedRun() {
    if (state.lastRunRecord) return state.lastRunRecord;
    try { return JSON.parse(localStorage.getItem('GKD_LAST_SUBMIT') || '{}').run_record || ''; } catch (_) { return ''; }
  }

  async function getAccountStatus() {
    if (!state.pubkey) throw new Error('Connect your Solana wallet first.');
    const programId = getProgramId(), connection = getConnection();
    const player = new solanaWeb3.PublicKey(state.pubkey);
    const tokenProgram = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const associatedProgram = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const mint = pda('mint',programId), ata = findPda([player.toBytes(),tokenProgram.toBytes(),mint.toBytes()],associatedProgram);
    const account = await connection.getAccountInfo(ata,'confirmed');
    if (account && (!samePubkey(account.owner,tokenProgram) || account.data.length !== 165 || !equalBytes(account.data.slice(0,32),mint.toBytes()) || !equalBytes(account.data.slice(32,64),player.toBytes()))) throw new Error('Token account does not match this wallet and mint.');
    const result = {supported:true,player:state.pubkey,version:Number(window.CHAIN.programVersion || 1),tokenBalance:account ? window.GKDSolanaProtocol.u64(account.data,64).toString() : '0',nativeClaimable:'0',rewardReady:false};
    const address = lastRecordedRun();
    if (!address) return {...result,detail:'Play a verified run to unlock its reward.'};
    const runPda = new solanaWeb3.PublicKey(address), runInfo=await connection.getAccountInfo(runPda,'confirmed');
    if (!runInfo || !samePubkey(runInfo.owner,programId)) return {...result,detail:'No recorded run for this program.'};
    const run = window.GKDSolanaProtocol.decodeRun(new Uint8Array(runInfo.data));
    if (!equalBytes(run.player,player.toBytes())) return {...result,detail:'The last saved run belongs to a different wallet.'};
    const expectedRun = findPda([new TextEncoder().encode('run'),run.runHash],programId);
    if (!samePubkey(runPda,expectedRun)) throw new Error('Run account address does not match its record.');
    const seasonPda=findPda([new TextEncoder().encode('season'),u16Le(run.seasonId)],programId);
    const season=await connection.getAccountInfo(seasonPda,'confirmed');
    if (!season || !samePubkey(season.owner,programId) || season.data.length<87) throw new Error('Season account is unavailable.');
    const bytes=new Uint8Array(season.data), rawCap=window.GKDSolanaProtocol.u64(bytes,10), minted=window.GKDSolanaProtocol.u64(bytes,18);
    const runHash=Array.from(run.runHash,b=>b.toString(16).padStart(2,'0')).join('');
    return {...result,season:run.seasonId,runHash,runAddress:address,rewardReady:run.passed&&!run.rewardMinted&&bytes[82]===0&&minted<rawCap,
      detail:run.rewardMinted?'This run reward was already claimed.':bytes[82]!==0?'This season is closed.':!run.passed?'This run did not meet the reward target.':'Reward eligibility is checked again on-chain before minting.'};
  }

  async function claimFarmReward(runHash) {
    const current=await getAccountStatus();
    if (!current.rewardReady || (runHash && String(runHash).replace(/^0x/,'')!==current.runHash)) throw new Error('No eligible reward for the selected run.');
    const cfg=window.CHAIN, connection=getConnection(), programId=getProgramId();
    if (cfg.cluster!=='devnet' || await connection.getGenesisHash()!==cfg.genesisHash) throw new Error('Wallet rewards are limited to the configured Devnet.');
    const player=new solanaWeb3.PublicKey(state.pubkey), mint=pda('mint',programId);
    const tokenProgram=new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const associatedProgram=new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const key=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
    const runBytes=hex32('runHash',current.runHash);
    const keys=[key(pda('config',programId)),key(findPda([new TextEncoder().encode('season'),u16Le(current.season)],programId),true),key(new solanaWeb3.PublicKey(current.runAddress),true)];
    if(current.version===2) keys.push(key(findPda([new TextEncoder().encode('run_achievement'),runBytes],programId)));
    keys.push(key(mint,true),key(pda('mint_authority',programId)),key(player));
    if(current.version===2) keys.push(key(findPda([new TextEncoder().encode('farmer'),player.toBytes()],programId),true));
    keys.push(key(findPda([player.toBytes(),tokenProgram.toBytes(),mint.toBytes()],associatedProgram),true),key(player,true,true),key(tokenProgram),key(associatedProgram),key(solanaWeb3.SystemProgram.programId),key(solanaWeb3.SYSVAR_RENT_PUBKEY));
    const ix=new solanaWeb3.TransactionInstruction({programId,keys,data:await anchorDiscriminator('mint_farm_reward')});
    const tx=new solanaWeb3.Transaction().add(ix);tx.feePayer=player;
    const latest=await connection.getLatestBlockhash('confirmed');tx.recentBlockhash=latest.blockhash;
    await simulateUnsignedTransaction(connection,tx);
    status('CHAIN: review the test token reward in your wallet…');
    const signed=await window.solana.signTransaction(tx);
    const signature=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false});
    const result=await connection.confirmTransaction({signature,...latest},'confirmed');
    if(result.value.err) throw new Error('Reward transaction failed. Refresh status before trying again.');
    status('CHAIN: test token reward claimed.');
    return {signature};
  }

  function init() {
    syncPOHPContext();

    try {
      const btn = $("btn-connect");
      if (btn) {
        btn.addEventListener("click", async () => { await connectWallet(); });
      }
    } catch (_) {}

    // Top-left on-chain top-3 leaderboard (refreshes periodically; no-op until program is deployed).
    try {
      const cfg = window.CHAIN || {};
      if (cfg.showLeaderboard !== false && getProgramId()) {
        refreshLeaderboard();
        setInterval(refreshLeaderboard, 30000);
      }
    } catch (_) {}

    if (!window.CHAIN?.enabled) {
      status("CHAIN: disabled (config)");
      return;
    }
    if (!window.solana || !window.solana.isPhantom) {
      status("CHAIN: Phantom not detected (install wallet)");
      return;
    }

    const { verifyUrl } = getBackendCfg();
    if (!verifyUrl) {
      status("CHAIN: pending (set verifyUrl)");
      return;
    }

    const cluster = window.CHAIN?.cluster || "devnet";
    const walletHint = cluster === "devnet" ? " • Phantom Testnet Mode: Solana Devnet" : "";
    status(`CHAIN: ready (${cluster}${walletHint})`);
  }

  window.ChainClient = {
    init,
    connectWallet,
    payEntryFee,
    ensureEntryPaid,
    startLedgerRun,
    submitLedgerEvent,
    finalizeLedgerRun,
    verifyRun,
    submitMemo,
    submitVerifiedRun,
    finalizeRun,
    fetchLeaderboard,
    refreshLeaderboard,
    getAccountStatus,
    claimFarmReward,
    syncPOHPContext,
    _state: state
  };
})();
