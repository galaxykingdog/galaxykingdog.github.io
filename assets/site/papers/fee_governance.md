> Historical Solana design and dated development notes. These rules and deployment statements are not the current RH policy or a live-status report. The current whitepaper takes precedence for RH fees, charity, buyback, administrator control and mainnet readiness.

[Current whitepaper](../../../whitepaper.html)

# Fee Governance — weekly $0.10 peg + 2/3 multisig

The entry fee targets **~$0.10** and is **re-pegged weekly** from the live SOL/USD price via a
permissionless Pyth-backed crank. A 2/3 multisig can additionally override the fee and pause/unpause,
but neither path can **ever** withdraw pool funds. **Not yet deployed.**

## Rules

- Fee target: **$0.10** (`FEE_TARGET_USD_MICROS = 100_000`, stored in `FeeGov.target_usd_micros`).
- **Weekly** repeg from SOL/USD (`FEE_UPDATE_MIN_INTERVAL_SECONDS = 7 days`), permissionless crank.
- Default bootstrap fee: **270,000 lamports** (≈ $0.10 at ~$370/SOL); the enforced hard floor is a
  tiny dust guard (`FEE_ABSOLUTE_MIN_LAMPORTS = 1_000`) so the peg can move down if SOL appreciates.
- Multisig (**2/3**) may override the fee and pause/unpause; **cannot** withdraw pool funds.

## Weekly auto-repeg — `refresh_fee`

`refresh_fee(ctx)` is permissionless: anyone may crank it once the weekly cadence elapses. It reads
the SOL/USD **Pyth** price account (validated against `FeeGov.pyth_sol_usd`, max age 1h) and sets

```
normal_fee_lamports = target_usd_micros · 10^(-expo) · 1000 / price   (clamped to the dust floor)
```

e.g. target $0.10, SOL = $370 (price 37_000_000_000, expo −8) → ~270,270 lamports. The fee account
(`config.normal_fee_lamports`) is what `deposit_entry_fee` enforces, so the whole game pays the
current pegged price. `initialize_fee_gov(..., pyth_sol_usd)` records which price account to trust.

> Oracle note: built against `pyth-sdk-solana` (legacy price-account format). For mainnet, point
> `pyth_sol_usd` at the correct SOL/USD feed; migrating to the Pyth pull receiver (`PriceUpdateV2`)
> is a clean future hardening if using sponsored pull feeds.

## State

- `FeeGov` — `["fee_gov"]`: `members[3]`, `threshold`, `target_usd_micros`, `last_fee_update_ts`,
  `proposal_count`.
- `FeeProposal` — `["fee_proposal", nonce]`: `new_fee_lamports`, `approved_mask` (member bitmap),
  `approvals`, `executed`.

## Instructions

| Instruction | Who | What |
|---|---|---|
| `initialize_fee_gov(members, threshold, target_usd_micros, pyth_sol_usd)` | admin | Installs the multisig + the trusted SOL/USD oracle. |
| `refresh_fee()` | anyone | **Weekly** re-peg of the fee to $0.10 from the Pyth SOL/USD price. |
| `propose_fee_update(nonce, new_fee_lamports)` | member | Manual override proposal; proposer auto-approves. |
| `approve_fee_update(nonce)` | member | Adds an approval (idempotent per member via bitmap). |
| `execute_fee_update(nonce)` | anyone | Applies the override once `approvals ≥ threshold` **and** ≥ 7 days since the last update. |
| `multisig_set_paused(paused)` | member | Emergency pause/unpause. |

## Front-end wiring (autopool)

The browser entry payment now invokes `deposit_entry_fee` so the fee lands in the **program-owned
Game Pool PDA** (the autopool), not a placeholder wallet. See [POOL_MECHANISM.md](POOL_MECHANISM.md)
for the deposit instruction; `src/chain/chain_config.js` exposes `programId` + `usePoolProgram`, and
`src/chain/chain_client.js` builds the instruction (PDA derivation + Anchor discriminator) in-browser.
It activates once the program is deployed on the active cluster; set `usePoolProgram=false` to fall
back to a plain transfer for pre-deploy testing.

`deposit_entry_fee` now requires `amount ≥ config.normal_fee_lamports` (the current multisig-set
fee), which is always ≥ the hard floor.

## Price oracle — intentionally off-chain

The whitepaper lists Pyth SOL/USD, Switchboard SOL/USD, **and a Coinbase/Kraken human verification
log** as price sources. The USD→lamports targeting is therefore performed by the multisig members
off-chain (per the human verification log) when they propose a fee; the program enforces what it
can on-chain: the **hard floor**, the **monthly cadence**, and the **2/3 threshold**. Adding a live
Pyth/Switchboard feed read as an extra on-chain guard is a possible future hardening step.

## "No pool withdrawal" guarantee

There is no instruction that lets the multisig (or anyone) move Game Pool funds outside the locked
checkpoint rules — the only outflows are the checkpoint payouts and the governance-directed charity
routing. The multisig's powers are limited to the fee value and the pause flag.
