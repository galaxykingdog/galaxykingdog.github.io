> Historical Solana design and dated development notes. These rules and deployment statements are not the current RH policy or a live-status report. The current whitepaper takes precedence for RH fees, charity, buyback, administrator control and mainnet readiness.

[Current whitepaper](../../../whitepaper.html)

# On-chain Token Mining — $420POP emission

On-chain implementation of the whitepaper v1.7 farming/emission ("mining") of the `$420POP`
SPL token. Builds on the proof registry (Gate E) and the pool mechanism. **Not yet deployed.**

## Mint

`initialize_token` (admin, once) creates the `$420POP` SPL mint as a PDA (`seeds = ["mint"]`,
`decimals = 9`) whose **mint authority is the `["mint_authority"]` PDA**. No human ever holds
mint authority — tokens can only be issued by `mint_farm_reward` under the locked caps. The mint
pubkey is stored in `GameConfig.mint`.

## Units

`mint_cap`, `minted_count`, and `reward_per_run` are all in **base units** (whole tokens ×
10⁹). When seeding a season from the whitepaper caps (e.g. `HUMAN_SEASON_CAPS[0] = 1_050_000_013`
tokens), multiply by 10⁹ before passing to `initialize_season`.

## Emission flow

```
verified run (RunRecord, score >= Mode-B target)  ->  mint_farm_reward  ->  $420POP to player ATA
```

`mint_farm_reward(ctx)` — permissionless (anyone may relay/pay fees), but tokens always go to the
run's recorded `player`:
- requires `run.passed`, `!run.reward_minted`, matching season, and `player == run_record.player`;
- mints `min(season.reward_per_run, mint_cap − minted_count)` so the cap is **exact**;
- increments `minted_count`, sets `run.reward_minted = true` (one reward per run);
- mints into the player's associated token account (created on demand by the payer).

### Halving schedule

Each season's total emission is bounded by its `mint_cap`. Seeding the 32 Human seasons from
`HUMAN_SEASON_CAPS` (a Bitcoin-style halving curve summing to 2.1B tokens) and season 33 from the
Chaos cap (300,000 tokens) reproduces the locked emission. The program enforces "never exceed the
cap"; the curve itself lives in the per-season `mint_cap` values the admin sets.

### Mode B dynamic difficulty (Bitcoin-style)

The minimum score behaves like mining difficulty: it rises as the epoch's supply mints out, and the
check happens **at mint time**, against the supply *now* — mirroring proof-of-work:

- **Recording gate** — `submit_verified_run` requires `score ≥ season.score_target` (the epoch's
  base minimum) so a run is valid / eligible for the leaderboard and records.
- **Mining gate** — `mint_farm_reward` requires `run.score ≥ mode_b_target(score_target,
  minted_count, mint_cap)`, evaluated against the **current** `minted_count`. An integer
  reimplementation of the locked `ceil(T_base · m(progress))` curve: 1.0× up to 80% minted, ramping
  to 1.15× at 95%, 1.35× at 100%.

So a run that beat the base minimum (and is recorded) may still be unable to mint if the epoch has
filled further and difficulty rose past its score — exactly like a block that no longer meets the
current difficulty. Difficulty resets per epoch via each season's `score_target` + `mint_cap`.

Unit tests in `programs/gkd_chain/src/lib.rs` (`cargo test -p gkd_chain`) prove the difficulty curve,
exact-cap minting, and that the mining gate enforces current difficulty.

## Parameter that still needs a whitepaper/founder lock

`reward_per_run` (the per-qualifying-run block reward) is **not** pinned in the spec files we have,
so it is a **per-season parameter** set at `initialize_season` (env `GKD_SEASON_REWARD` in
`tools/gate_e_submit_run.js`). The program guarantees the cap regardless of its value; the exact
economic figure should be confirmed against the whitepaper before mainnet.

## Not yet implemented (future steps)

- "Final Human token requires a new World Record" special-case gating.
- NFTs / marked tokens for first player, champions, record breakers, final winner.
- Charity governance voting (eligibility = farmed ≥ 1 token).

## Build / verify

Same workaround as the pool mechanism (see [POOL_MECHANISM.md](POOL_MECHANISM.md)). After adding
`anchor-spl`, both `cargo check -p gkd_chain` (host) and `cargo-build-sbf --skip-tools-install`
(SBF `.so`) pass.
