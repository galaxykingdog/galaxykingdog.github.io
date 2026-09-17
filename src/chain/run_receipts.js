// Local recovery bookkeeping only. Chain adapters still verify receipts, signatures and ownership.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GKDRunReceipts = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const PREFIX = "gkd_web3_recovery_v1";
  const HASH = /^(?:0x)?[0-9a-fA-F]{64}$/;
  const EVM = /^0x[0-9a-fA-F]{40}$/;
  const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  function runHash(value) { return HASH.test(String(value || "")) ? String(value).replace(/^0x/i, "").toLowerCase() : ""; }
  function positive(value) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0; }
  function storageOrDefault(storage) { try { return storage || globalThis.localStorage; } catch (_) { return null; } }
  function read(storage, key) { try { return JSON.parse(storage?.getItem(key) || "null"); } catch (_) { return null; } }
  function write(storage, key, value) { try { storage?.setItem(key, JSON.stringify(value)); return !!storage; } catch (_) { return false; } }

  function captureScope(chain, wallet) {
    if (!chain || chain.enabled !== true) return null;
    const kind = String(chain.chainKind || "solana").toLowerCase();
    const player = String(wallet || "");
    if (kind === "robinhood") {
      if (!EVM.test(player) || !EVM.test(String(chain.contractAddress || "")) || !positive(chain.chainId)) return null;
      return { schema: 1, chain_kind: kind, chain_id: Number(chain.chainId),
        contract_address: chain.contractAddress.toLowerCase(), contract_version: positive(chain.contractVersion || 2),
        player_pubkey: player.toLowerCase() };
    }
    if (kind === "solana") {
      if (!SOL.test(player) || !SOL.test(String(chain.programId || "")) || !SOL.test(String(chain.genesisHash || "")) || !chain.cluster) return null;
      return { schema: 1, chain_kind: kind, chain_id: 0, cluster: String(chain.cluster),
        genesis_hash: String(chain.genesisHash), program_id: String(chain.programId),
        program_version: positive(chain.programVersion || 1), player_pubkey: player };
    }
    return null;
  }
  function normalizeScope(scope) {
    if (!scope || Number(scope.schema) !== 1) return null;
    const normalized = captureScope({ enabled: true, chainKind: scope.chain_kind, chainId: scope.chain_id,
      contractAddress: scope.contract_address, contractVersion: scope.contract_version,
      cluster: scope.cluster, genesisHash: scope.genesis_hash, programId: scope.program_id,
      programVersion: scope.program_version }, scope.player_pubkey);
    if (!normalized || (normalized.chain_kind === "robinhood" ? !positive(scope.contract_version) : !positive(scope.program_version))) return null;
    return normalized;
  }
  function scopeKey(scope) { const normalized = normalizeScope(scope); return normalized ? `${PREFIX}:${encodeURIComponent(JSON.stringify(normalized))}` : ""; }
  function sameScope(a, b) { const key = scopeKey(a); return !!key && key === scopeKey(b); }
  function isPaidPackage(pkg) {
    return !!(pkg && runHash(pkg.run_hash) && pkg.entry_sig && positive(pkg.entry_slot)
      && positive(pkg.fee_lamports) && pkg.player_pubkey);
  }
  function packageMatches(pkg, scope) {
    if (!isPaidPackage(pkg) || !sameScope(pkg.chain_scope, scope)) return false;
    const normalized = normalizeScope(scope);
    const player = normalized.chain_kind === "robinhood" ? String(pkg.player_pubkey).toLowerCase() : pkg.player_pubkey;
    return player === normalized.player_pubkey && String(pkg.chain_kind) === normalized.chain_kind
      && Number(pkg.chain_id || 0) === normalized.chain_id;
  }
  function quarantine(pkg, storage) {
    if (!isPaidPackage(pkg) || normalizeScope(pkg.chain_scope)) return;
    write(storage, `${PREFIX}:unscoped:${runHash(pkg.run_hash)}`, { state: "requires_chain_review",
      reason: "Historical package has no verified network/program/contract scope; never auto-adopted.", package: pkg });
  }
  function listQuarantined(storage) {
    const db = storageOrDefault(storage), items = [];
    try {
      for (let i = 0; i < db.length; i++) {
        const key = db.key(i);
        if (String(key).startsWith(`${PREFIX}:unscoped:`)) { const item = read(db, key); if (item?.package) items.push(item); }
      }
    } catch (_) {}
    return items;
  }
  function rememberPackage(pkg, storage) {
    const db = storageOrDefault(storage), scope = normalizeScope(pkg?.chain_scope);
    if (!scope || !packageMatches(pkg, scope)) { quarantine(pkg, db); return false; }
    return write(db, `${scopeKey(scope)}:package`, pkg);
  }
  function receiptScope(receipt) {
    if (receipt?.chain_scope) return normalizeScope(receipt.chain_scope);
    return normalizeScope({ schema: 1, ...receipt,
      player_pubkey: receipt?.player_pubkey || receipt?.player });
  }
  function validReceipt(receipt, scope, hash) {
    if (!receipt || !sameScope(receiptScope(receipt), scope)) return false;
    // A Solana run_record is a PDA address, never a run hash. Only explicit run_hash settles it.
    const recordedHash = runHash(receipt.run_hash || (scope.chain_kind === "robinhood" ? receipt.run_record : ""));
    if (!recordedHash || recordedHash !== runHash(hash)) return false;
    if (receipt.outcome === "below_target") {
      return scope.chain_kind === "solana" && scope.program_version === 1
        && Number.isSafeInteger(receipt.score) && receipt.score >= 0 && positive(receipt.target)
        && receipt.score < receipt.target;
    }
    return receipt.outcome === "recorded" && !!receipt.run_record;
  }
  function rememberReceipt(receipt, storage) {
    const db = storageOrDefault(storage), scope = receiptScope(receipt);
    const hash = runHash(receipt?.run_hash || (scope?.chain_kind === "robinhood" ? receipt?.run_record : ""));
    if (!scope || !validReceipt(receipt, scope, hash)) return false;
    return write(db, `${scopeKey(scope)}:receipt:${hash}`, { ...receipt, run_hash: hash, chain_scope: scope });
  }
  function selectLatest({ chain, wallet, memory, legacy, storage } = {}) {
    const db = storageOrDefault(storage), scope = captureScope(chain, wallet);
    // Preserve old paid evidence before a subsequent run replaces the legacy global slot.
    quarantine(legacy, db); quarantine(memory, db);
    if (!scope) return null;
    const saved = read(db, `${scopeKey(scope)}:package`);
    const candidates = [memory, saved, legacy].filter(pkg => packageMatches(pkg, scope));
    candidates.sort((a, b) => Number(b.end_ts || 0) - Number(a.end_ts || 0));
    const selected = candidates[0] || null;
    if (selected) rememberPackage(selected, db);
    return selected;
  }
  // The verifier deletes a ticket for good once it expires or is voided. Retrying
  // such a run can never settle it, so it is closed locally and kept as evidence.
  const LOST_TICKET = /^(?:Unknown or expired run_ticket_id|Run ticket expired)\.?$/;
  function isLostTicketError(message) { return LOST_TICKET.test(String(message || "").trim()); }
  // Also unsettleable from this page: the verifier keeps the ticket open but this client
  // holds no ticket after a reload, or the client already rejected the run's ledger.
  const UNFINALIZABLE = /^(?:Run ticket is not finalized\.?|Ledger event [a-z_]+ was rejected at wave \d+, frame \d+: .+)$/;
  function isUnsettleableRunError(message) {
    const text = String(message || "").trim();
    return isLostTicketError(text) || UNFINALIZABLE.test(text);
  }
  function markExpired(pkg, reason, storage) {
    const db = storageOrDefault(storage), scope = normalizeScope(pkg?.chain_scope);
    if (!scope || !packageMatches(pkg, scope) || !isUnsettleableRunError(reason)) return false;
    return write(db, `${scopeKey(scope)}:expired:${runHash(pkg.run_hash)}`, { state: "expired",
      kind: isLostTicketError(reason) ? "lost_ticket" : "unfinalizable",
      reason: String(reason).trim(), run_hash: runHash(pkg.run_hash), entry_sig: String(pkg.entry_sig || ""), at: Date.now() });
  }
  function isSettled(pkg, storage) {
    const db = storageOrDefault(storage), scope = normalizeScope(pkg?.chain_scope);
    if (!scope || !packageMatches(pkg, scope)) return false;
    const hash = runHash(pkg.run_hash);
    if (read(db, `${scopeKey(scope)}:expired:${hash}`)?.state === "expired") return true;
    const receipts = [read(db, `${scopeKey(scope)}:receipt:${hash}`),
      read(db, scope.chain_kind === "robinhood" ? "GKD_LAST_SUBMIT_ROBINHOOD" : "GKD_LAST_SUBMIT")];
    const receipt = receipts.find(value => validReceipt(value, scope, hash));
    if (!receipt) return false;
    rememberReceipt(receipt, db);
    return true;
  }
  return { captureScope, normalizeScope, scopeKey, sameScope, packageMatches, rememberPackage,
    rememberReceipt, selectLatest, isSettled, listQuarantined, isLostTicketError, isUnsettleableRunError, markExpired };
});
