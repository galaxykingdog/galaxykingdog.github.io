# Security notes & risk register — gkd_chain

Honest pre-deploy review of the on-chain program. This is **not** a substitute for an independent
audit; it records what was reviewed, the known risks, and what must happen before mainnet with real
funds. No wallet is required to act on any of this.

## Reviewed & covered (with tests)

- **No fund-withdrawal path.** There is no instruction that moves Game Pool funds outside the locked
  checkpoint rules / governance charity routing. The fee multisig and admin cannot withdraw.
- **Lamport moves stay rent-exempt.** Payouts draw from `distributable_balance = balance − rent_min`
  (and minus the carried-Chaos reserve for non-Chaos checkpoints), so PDAs never drop below rent.
- **Value-conserving splits.** `creator_split_amounts` is unit-tested: `creator + charity_net +
  recycled == amount`, never over-pays. Checkpoint percentages tested to never exceed the
  distributable amount. `pct` is u128-internally and overflow-safe.
- **Exact, Bitcoin-style mining.** Per-epoch cap minting is exact; the minimum score (difficulty)
  rises with minted supply and is enforced at mint time. Unit-tested.
- **Checkpoints are one-time** via claimed flags / `paid_record_breaks`; PDAs (`run`, `award`,
  `vote`) use `init` to prevent duplicates.
- **Score is tamper-proof on-chain.** `submit_verified_run` verifies the verifier's ed25519
  signature over a canonical, score-bound message via the Ed25519 precompile. Replay-safe (the
  message binds the unique `run_hash`, and the run PDA is single-init).

## Risks & required hardening

| # | Sev | Risk | Mitigation |
|---|-----|------|------------|
| 1 | **High (ops)** | `authority` (admin) is one key with broad powers: closes seasons (gates payouts), sets verifier, whitelists charities, pauses, runs all init. It cannot withdraw funds, but it is a central point. | Make `authority` a **multisig (Squads)** before mainnet. |
| 2 | **High (ops)** | The **verifier key** is a trusted oracle — the on-chain score is whatever it signs. A leaked key ⇒ forged scores/rewards. | Keep the verifier key in an HSM / hardened host; rotate via `set_verifier`. |
| 3 | **High (anti-cheat)** | The persistent v2 verifier accounts explicit gameplay events and blocks raw score inflation, but it does **not** independently replay Phaser physics. A modified client can attempt to submit a plausible fabricated event stream. | Before mainnet rewards, run gameplay authoritatively on the verifier or add deterministic replay/input attestation that the verifier independently validates. Audit that design. |
| 4 | **High (ops)** | JSON persistence is restart-safe on one machine but is not production-grade coordination, backup, or tamper-resistant storage. | Use a durable transactional database, restricted service identity, backups, monitoring, idempotency, and HSM/KMS-backed signing. |
| 5 | Medium | **Token-weighted voting is snapshot-less** — moving tokens between wallets can multiply voting weight. | Add a balance snapshot or vote-time token lock/escrow before enabling governance. |
| 6 | Medium | **Oracle trust**: built on legacy `pyth-sdk-solana`; a wrong/stale feed mis-prices the fee (fails safe at 1h max age, dust-floor clamp). | Point `pyth_sol_usd` at the correct mainnet SOL/USD feed; consider the Pyth pull receiver (`PriceUpdateV2`). |
| 7 | Low | **Leaderboard name is unsigned** (cosmetic); a submitter could attach any name to a real score. Wallet is authoritative. | Sign the name into the canonical message if display integrity matters. |
| 8 | Low | **Record-breaker NFT** validates the *current* `record_holder` (no per-break history). | Award promptly per break, or store per-break holders. |
| 9 | Low | **Season close is admin-driven** ("condition met" gate). | Acceptable; tighten with time/emission-based auto-close later if desired. |

## Must-do before mainnet with real funds

1. **Independent security audit** of `programs/gkd_chain`.
2. Replace client-trusted event accounting with audited authoritative simulation or independently
   verified deterministic replay before score-derived mainnet rewards are enabled.
3. Complete the remaining live Devnet money-path suite: checkpoint payout, charity governance, NFT
   award, Pyth re-peg, failure recovery, and replay/concurrency tests. Browser entry → ledger →
   verifier signature → on-chain RunRecord → leaderboard is already live-proven on Devnet.
4. Set `authority` to a multisig; use a dedicated production RPC; move verifier signing to HSM/KMS
   and state to a durable database; finalize the mainnet program id and Pyth feed.
5. Re-run `cargo test -p gkd_chain` and a fresh `cargo-build-sbf` from the audited commit.

## What does NOT need a wallet (safe to do now)

- This review + the test suite (done).
- More tests / fuzzing of the money math.
- IDL generation, client integration, front-end polish.
- A devnet dry-run using a **free throwaway devnet keypair** (no founder/real wallet needed; only
  free devnet SOL).
## Robinhood Chain key separation

- The EVM verifier secret is server-only in ignored `verifier/.env`.
- The EVM deployer is a separate encrypted keystore in ignored `secrets/`; it is never embedded in the verifier or browser.
- Browser code contains only chain IDs, public RPC/explorer URLs, contract address, ABI, and verifier address.
- Robinhood V2 score submission is relayed server-side only after the same strict verifier produces and revalidates the EIP-712 proof. The player wallet still owns and signs the paid entry and free run-start authorization.
- The public relay endpoint cannot alter the signed player, run, replay, version, score, fee, entry transaction, or entry block; current and legacy replays are rejected on-chain.
- Robinhood Mainnet stays disabled until independent audit, multisig ownership, production RPC, monitoring, and a fresh deployment.
