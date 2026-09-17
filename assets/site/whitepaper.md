# Galaxy King Dog — Whitepaper

## Development update — 13 September 2026

**Robinhood is the development priority. The reward candidate remains local and undeployed; no project mainnet release is deployed or enabled.** Twenty targeted local test suites passed. An actual local HTTP test completed an authenticated test entry, server-issued seed, gameplay replay, signed proof, recorded run and one test-only fixture token. This is local evidence, not a live token launch or an independent audit.

Holders advise through a 99-day ballot. After finalization, the sole project administrator chooses the charity recipient with a public reason. Payment must match the reviewed recipient and reason. An unpaid decision can be corrected before payment confirms; failed transfers leave its allocation reserved. Saving authorizes anyone to pay, and completed transfers cannot be recalled. See [the candidate charity policy](papers/charity_governance.md).

The separate 5% buyback allocation is intended for a meme-token treasury governed by its own community. No production token, treasury or governance addresses are bound yet. NFT artwork and metadata templates are local; publication is pending.

Next: independent contract and replay review, a real hosting rehearsal with Android and wallet checks, verified administrator custody and recipient/token addresses, and NFT publication. The public arcade and historical testnet remain separate from this candidate. The Solana v1.8 material below is historical reference.

![Robin, an orange cat archer in a green hood, draws a cyan arrow above the rain-soaked city.](https://galaxykingdogs.netlify.app/assets/site/robin-whitepaper-hero-v3.png)

## Play

- [Open Game Jolt](https://gamejolt.com/games/galaxy-king-dog/1084669) — visit the game page for its current build and availability.
- [Web desktop arcade](https://galaxykingdogs.netlify.app/galaxian.html?skin=robin-cat-v6&voice=1) — keyboard controls and a choice of Robin costumes.
- [Web mobile arcade](https://galaxykingdogs.netlify.app/mobile/?v=mobile-6) — touch controls, a red FIRE button and expanded view.
- [Existing Robinhood testnet preview](https://galaxykingdogs.netlify.app/robinhood.html?skin=robin-cat-v6&voice=1) — separate from the undeployed reward candidate.

[Find controls for your device](https://galaxykingdogs.netlify.app/play/). If your phone still shows an older version, [update the mobile arcade](https://galaxykingdogs.netlify.app/mobile-refresh/).

## Robin / Robin: Dead Grid

*A fictional prologue.*

The city gave points for everything except fixing it.

Under neon towers, delivery dogs chased green arrows for streaks and badges. The arrows led in circles. Across the canal, a clinic had been dark for three nights.

“Lovely dashboard,” Robin said. “Shame about the lights.”

The cat climbed an abandoned rail gantry with her bow. For six evenings, she practiced sending a thread between two broken pylons. Arrows drowned. Her paws blistered. She learned to loosen her grip and wait out the passing trains.

A terrier mechanic found a working circuit. Two couriers brought cable instead of chasing another bonus.

On the seventh evening, Robin’s arrow crossed the water. The couriers hauled the cable along her thread; the mechanic made the connection.

The clinic lit up.

Their screens offered nothing. From the opposite window, a nurse flashed a lamp twice.

Robin raised two fingers, then passed the bow to the terrier.

![Robin and canine companions beside a rain-soaked canal, with a cyan line reaching a warmly lit clinic.](https://galaxykingdogs.netlify.app/assets/site/robin-dead-grid-v3.png)

*Dead Grid / A light across the canal. A fictional world.*

## Public arcade and historical scope

The arcade links above remain separate from the local Robinhood reward work. Open Game Jolt for that page’s current build and availability. This documentation update does not activate new rewards or replace the existing testnet.

The Solana v1.8 text below records an earlier design. Its economy, governance and security statements are historical reference, not claims about today’s public arcade or the undeployed Robinhood candidate.

[Open the existing testnet prototype](https://galaxykingdogs.netlify.app/robinhood.html?voice=1)

## Original technical whitepaper — v1.8

Historical Solana v1.8 implementation notes, retained for reference. For the frozen numeric constants see
[WHITEPAPER_IMPLEMENTATION_LOCK_V1_7.md](https://galaxykingdogs.netlify.app/assets/site/papers/whitepaper_implementation_lock_v1_7.html); per-subsystem
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

See [ANTI_CHEAT_SCORE.md](https://galaxykingdogs.netlify.app/assets/site/papers/anti_cheat_score.html). A fully independent, bit-for-bit deterministic replay
gate is a **future hardening** (the current resimulation core is schema-2 hash/checkpoint, not a 1:1
replay).

## 4. Entry fee — weekly $0.10 peg

Entry costs a target of **$0.10** in SOL. The fee is stored in lamports and **re-pegged weekly** by a
permissionless crank that reads a Pyth SOL/USD feed (`refresh_fee`), so it tracks the dollar target
as SOL moves. A 2/3 multisig may also override the fee and pause the program, but **cannot withdraw
pool funds** — there is no such instruction. See [FEE_GOVERNANCE.md](https://galaxykingdogs.netlify.app/assets/site/papers/fee_governance.html).

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
share recycles back** into the Game Pool. See [POOL_MECHANISM.md](https://galaxykingdogs.netlify.app/assets/site/papers/pool_mechanism.html).

## 6. Token mining — `$420POP`

`$420POP` (9 decimals) is minted by a program PDA; no human holds mint authority. Emission follows a
Bitcoin-style halving: 33 seasons, ~2.1B tokens across the 32 human seasons and a fixed 300,000 cap
for the Chaos season. Each qualifying run mints a per-season block reward, exact to the season cap.

Difficulty is **proof-of-work-like**: the minimum score required to mint rises with the already-minted
supply (Mode B) and is checked **at mint time** — a run that beat the base minimum but not the current
difficulty can no longer mine. The final human token requires a new world record. See
[TOKEN_MINING.md](https://galaxykingdogs.netlify.app/assets/site/papers/token_mining.html).

## 7. NFTs & marked tokens

True Metaplex NFTs reward milestones — first player (`baby_metatron`, once ever), season champion
(one per season, seasons 1–31), record breaker (one for every new world record), human champion
(`human_metatron`, season 32), and chaos champion (`final_galaxy_metatron_defender`, season 33).
The same milestone can never be awarded twice — a one-time PDA keyed by award kind plus season or record
number blocks duplicates — and every NFT is minted by the program PDA. See [NFT_AWARDS.md](https://galaxykingdogs.netlify.app/assets/site/papers/nft_awards.html).

## 8. Charity Pool & governance

The Charity Pool accumulates the charity share of creator payouts. Its destination is decided by
**token-weighted governance** at two gates only — end of human emission and end of Chaos. Eligibility
requires having farmed ≥ 1 `$420POP`; quorum is 10,000 weighted votes; duration is 99 days; a tie
triggers a re-vote; below quorum the funds remain in the Charity Pool. The winner must be a
whitelisted, verified charity operator. See [CHARITY_GOVERNANCE.md](https://galaxykingdogs.netlify.app/assets/site/papers/charity_governance.html).

## 9. Security & decentralization

- **No withdrawal path**; pool/charity moves are rule-enforced and keep PDAs rent-exempt.
- **Value-conserving splits** and exact-cap minting (unit-tested).
- Known centralization to harden before mainnet: the **admin authority** is a single key (it cannot
  withdraw funds but gates season closing, the verifier key, the whitelist and pause) and the
  **verifier key** is a trusted oracle. Recommended: multisig admin, HSM-held verifier key, a
  governance balance snapshot, and an **independent audit**. See [SECURITY_NOTES.md](https://galaxykingdogs.netlify.app/assets/site/papers/security_notes.html).

## 10. Status

Implemented and tested (off-chain): the full program (27 instructions), the verifier signing path,
and the front-end wiring (entry fee → Pool PDA, on-chain top-3 leaderboard). Pending: program
deployment and the operational hardening above. See [DEPLOY.md](https://galaxykingdogs.netlify.app/assets/site/papers/deploy.html).
