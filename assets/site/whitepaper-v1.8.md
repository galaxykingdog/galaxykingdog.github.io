# Historical Solana whitepaper — v1.8

> Historical Solana design and dated development notes. These rules and deployment statements are not the current RH policy or a live-status report. The current whitepaper takes precedence for RH fees, charity, buyback, administrator control and mainnet readiness.

[Read the current RH-first whitepaper](../../whitepaper.html).

---

# Galaxy King Dog — Whitepaper

Version 1.8 · reflects the **implemented** system. For the frozen numeric constants see
[WHITEPAPER_IMPLEMENTATION_LOCK_V1_7.md](papers/whitepaper_implementation_lock_v1_7.html); per-subsystem
details are linked throughout.

## 1. Overview

Galaxy King Dog is a skill-based arcade space shooter with a non-custodial, rule-enforced economy on
Solana. Players pay a small SOL entry fee, compete for high scores across 33 seasons, farm the
`$420POP` SPL token under a Bitcoin-style halving schedule, and win SOL payouts and NFTs. Every
recorded score and payout is constrained by on-chain rules — there is no admin withdrawal, no hidden
minting, and no discretionary reward.

## 2. Gameplay & determinism

The engine runs at a fixed timestep with seeded RNG (no `Math.random`). Each run records per-frame
inputs, frame deltas, and the seed, and produces a Proof-of-Play package containing:

- a **replay hash** (inputs + seed + checkpoints),
- a **version hash** (the exact game build/ruleset),
- a **run hash** binding player, season, fee, ticket and result.

This makes a run reproducible and its identity tamper-evident.

## 3. Trust model (as implemented)

Gameplay is client-side and skill-based; trust in the *score* is established in two layers:

1. **Off-chain authority — live anti-cheat ledger.** The verifier validates each scoring event as it
   occurs (challenge–response, hash-chained events, rate/plausibility limits) and produces the
   authoritative `accepted_score`. The client never simply asserts a score.
2. **On-chain enforcement — verifier signature.** The verifier signs a canonical, score-bound
   message; `submit_verified_run` verifies that ed25519 signature against the trusted verifier key
   using the Solana Ed25519 precompile. Only a verifier-signed score can be recorded on-chain.

See [ANTI_CHEAT_SCORE.md](papers/anti_cheat_score.html). A fully independent, bit-for-bit deterministic replay
gate is a **future hardening** (the current resimulation core is schema-2 hash/checkpoint, not a 1:1
replay).

## 4. Entry fee — weekly $0.10 peg

Entry costs a target of **$0.10** in SOL. The fee is stored in lamports and **re-pegged weekly** by a
permissionless crank that reads a Pyth SOL/USD feed (`refresh_fee`), so it tracks the dollar target
as SOL moves. A 2/3 multisig may also override the fee and pause the program, but **cannot withdraw
pool funds** — there is no such instruction. See [FEE_GOVERNANCE.md](papers/fee_governance.html).

## 5. Game Pool & checkpoint payouts

All entry fees flow into a program-owned **Game Pool PDA** (`deposit_entry_fee`). Funds leave only
through permissionless, one-time checkpoints, each splitting the distributable balance by locked
rules:

| Checkpoint | Split |
|---|---|
| Farm season end | 70% retained · 20% champion · 10% creator payout |
| World record break | 70% retained · 20% breaker · 10% creator payout (every break) |
| Human season end (S32) | 30% carried to Chaos · 40% human champion · 30% creator payout |
| Chaos season end (S33) | 67% chaos champion · 33% creator payout |

Every **creator payout** is auto-split **49% creator / 51% Charity Pool**, and **20% of the charity
share recycles back** into the Game Pool. See [POOL_MECHANISM.md](papers/pool_mechanism.html).

## 6. Token mining — `$420POP`

`$420POP` (9 decimals) is minted by a program PDA; no human holds mint authority. Emission follows a
Bitcoin-style halving: 33 seasons, ~2.1B tokens across the 32 human seasons and a fixed 300,000 cap
for the Chaos season. Each qualifying run mints a per-season block reward, exact to the season cap.

Difficulty is **proof-of-work-like**: the minimum score required to mint rises with the already-minted
supply (Mode B) and is checked **at mint time** — a run that beat the base minimum but not the current
difficulty can no longer mine. The final human token requires a new world record. See
[TOKEN_MINING.md](papers/token_mining.html).

## 7. NFTs & marked tokens

True Metaplex NFTs reward milestones — first player (`baby_metatron`, once ever), season champion
(one per season, seasons 1–31), record breaker (one for every new world record), human champion
(`human_metatron`, season 32), and chaos champion (`final_galaxy_metatron_defender`, season 33).
The same milestone can never be awarded twice — a one-time PDA keyed by award kind plus season or record
number blocks duplicates — and every NFT is minted by the program PDA. See [NFT_AWARDS.md](papers/nft_awards.html).

## 8. Charity Pool & governance

The Charity Pool accumulates the charity share of creator payouts. Its destination is decided by
**token-weighted governance** at two gates only — end of human emission and end of Chaos. Eligibility
requires having farmed ≥ 1 `$420POP`; quorum is 10,000 weighted votes; duration is 99 days; a tie
triggers a re-vote; below quorum the funds remain in the Charity Pool. The winner must be a
whitelisted, verified charity operator. See [CHARITY_GOVERNANCE.md](papers/charity_governance.html).

## 9. Security & decentralization

- **No withdrawal path**; pool/charity moves are rule-enforced and keep PDAs rent-exempt.
- **Value-conserving splits** and exact-cap minting (unit-tested).
- Known centralization to harden before mainnet: the **admin authority** is a single key (it cannot
  withdraw funds but gates season closing, the verifier key, the whitelist and pause) and the
  **verifier key** is a trusted oracle. Recommended: multisig admin, HSM-held verifier key, a
  governance balance snapshot, and an **independent audit**. See [SECURITY_NOTES.md](papers/security_notes.html).

## 10. Status

Implemented and tested (off-chain): the full program (27 instructions), the verifier signing path,
and the front-end wiring (entry fee → Pool PDA, on-chain top-3 leaderboard). Pending: program
deployment and the operational hardening above. See [DEPLOY.md](papers/deploy.html).
