# Anti-cheat: strict verifier-signed on-chain score

Goal: **the final score recorded on-chain is exactly what the configured verifier accepted.** The
chain signature guarantee is cryptographic. The current off-chain gameplay guarantee is a strict,
persistent event ledger with bounded validation; it is not yet a full authoritative physics replay.

## Trust model (two layers)

1. **Off-chain authority — the live anti-cheat ledger (Gate D).** Ledger v2 explicitly accounts for
   kills, Galaxian dive values, boss-hit points, wave bonuses, gifts, bombs and extra lives. It
   rejects any checkpoint/final score that differs from its event total, permanently binds one
   verified entry transaction to one run ticket, and persists active/finalized sessions across
   restarts. A modified client can still fabricate a plausible event stream; authoritative replay or
   server-hosted simulation is required before real-value Mainnet rewards.

All score-producing gameplay paths and verifier checks consume `src/scoring_rules.js`. The browser
has one score mutation entrypoint, and that entrypoint emits the corresponding ledger event. Burst
limits accept a complete 48-enemy carried formation in one frame and reset at each canonical wave,
while duplicate enemy ids, per-wave budgets, exact point values and final score equality remain
strict. Any rejected event invalidates browser finalization and reports the first rejected type,
wave and frame instead of allowing a later generic score mismatch.
2. **On-chain enforcement — verifier ed25519 signature.** `submit_verified_run` requires the verifier
   to have signed the exact score being recorded, so even though anyone may *send* the submit
   transaction, only a verifier-signed score is accepted.

## How the on-chain check works

- `set_verifier(pubkey)` (admin) stores the trusted verifier ed25519 key in `config.verifier_pubkey`.
  Once set (non-default), enforcement is mandatory.
- The verifier signs a canonical, fixed-layout message bound to the run:

  ```
  "GKD_RUN_V1" | run_hash(32) | player(32) | season_id(2 LE) | score(8 LE) | fee(8 LE) | entry_slot(8 LE)
  ```

- The submit transaction includes a self-contained **Solana Ed25519 precompile** instruction over
  `(verifier_pubkey, canonical_message, signature)` before `submit_verified_run`. The runtime rejects
  the whole tx if that signature is invalid.
- `submit_verified_run` scans only earlier, already-executed instructions. This safely tolerates
  wallet-added ComputeBudget instructions while still requiring an exact binding to
  `config.verifier_pubkey` and the canonical message rebuilt from the submit args. Mismatched
  pubkey/message ⇒ `WrongVerifier` / `VerifierMsgMismatch`.

Result: to record a score on-chain you need the verifier's private key over *that* score — which a
cheating client does not have. Changing any signed field (score, player, run, fee, slot) invalidates
the signature.

## Cross-component layout (must stay in sync)

| Piece | Location |
|---|---|
| canonical message + ed25519 introspection | `programs/gkd_chain/src/lib.rs` (`canonical_run_message`, `verify_verifier_signature`) |
| verifier signs canonical message | `verifier/server.js` (`buildChainMessage`, `/verify` → `chain_msg_b64` / `chain_sig_b64`) |
| browser submit tx attaches Ed25519 ix + sysvar | `src/chain/chain_client.js` (`submitVerifiedRun`) |
| CLI submit parity | `tools/gate_e_submit_run.js` |

The Ed25519 instruction byte layout was verified to match the on-chain parser (pubkey @ offset 16,
message @ offset 112). The signed score is the **ledger-accepted** score, so on-chain == validated.

## Deploy checklist

1. Generate the ignored local key with `npm run verifier:key:init`; strict/production startup fails
   closed if `VERIFIER_SECRET_KEY_B64` is absent.
2. Keep `REQUIRE_ENTRY_TX=true`, `STRICT_GATE_D=true`, `ALLOW_BROWSER_COMPAT=false`, and durable
   `LEDGER_STATE_FILE` storage.
3. Call `set_verifier(<verifier pubkey>)` after `initialize_config`.
4. Keep the legacy memo relay disabled; the player wallet submits the signed RunRecord transaction.
5. For Mainnet, move the verifier key to HSM/KMS-backed signing and replace the single-host JSON
   state file with an operationally durable database/replicated store.

## Top-3 leaderboard (matches on-chain by construction)

`submit_verified_run` also feeds the verified score into a global `Leaderboard` PDA
(`["leaderboard"]`, top-3, sorted descending) via `lb_insert`. Because it uses the **same signed
score** that is recorded, the displayed leaderboard can never disagree with the on-chain record.
Each entry stores `{ score, player (wallet), name[16] }`. The front-end reads and renders it in a
top-left panel (`ChainClient.fetchLeaderboard` / `refreshLeaderboard` in
`src/chain/chain_client.js`; `showLeaderboard` in `chain_config.js`). The name is a cosmetic,
unsigned display field; the wallet is the authoritative (signed) identifier.

## Remaining anti-cheat boundary

The schema-2 replay verifier currently proves package/hash/checkpoint consistency; it does not
independently execute Phaser physics. The event ledger prevents raw score injection and catches
duplicate/impossible accounting, but a custom client can manufacture plausible timed events. Do not
enable real-value Mainnet mining until an independent audit approves either a deterministic
authoritative simulation, a server-hosted gameplay authority, or an equivalent anti-bot design.
