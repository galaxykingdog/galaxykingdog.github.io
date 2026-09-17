# Automatic Pool Mechanism — `gkd_chain`

On-chain implementation of the locked whitepaper v1.7 pool + checkpoint payout rules.
Builds on Gate E (proof registry). **Not yet deployed** — see "Pending before mainnet".

## Fund accounts (program-owned PDAs, no admin withdraw)

- **Game Pool** — `Account<Pool>`, seeds `["pool"]`. Receives entry fees. Funds can only
  leave through the checkpoint rules below.
- **Charity Pool** — `Account<CharityPool>`, seeds `["charity"]`. Receives the charity share
  of every creator payout.

Both are created once by `initialize_pools` (admin). Lamports move out by direct
program-owned lamport debits (`pay_lamports`), keeping each PDA rent-exempt.

## Money in

`deposit_entry_fee(amount)` — the player signs a `system_program::transfer` of `amount`
(≥ `MIN_FEE_LAMPORTS` = 270_000) into the Game Pool PDA and bumps `pool.total_deposited`.

## Checkpoints (permissionless, one-time)

A season must be `close_season`-d (admin gate = "condition met") before its payout can run.
Anyone can then trigger the payout; it pays exactly once via a claimed flag.

| Instruction | Trigger | Split (of distributable pool) |
|---|---|---|
| `checkpoint_farm_season_end` | season closed | 70% retained · 20% champion · 10% creator payout |
| `checkpoint_world_record` | `record_break_count > paid_record_breaks` | 70% retained · 20% record breaker · 10% creator payout — once **per break** |
| `checkpoint_human_season_end` | season 32 closed | 30% carried to Chaos · 40% Human Champion · 30% creator payout |
| `checkpoint_chaos_season_end` | season 33 closed | 67% Chaos Champion · 33% creator payout (distributes full pool incl. carry) |

"Distributable" = pool lamports − rent-exempt minimum − (for non-Chaos) the `carried_chaos`
reserve. Integer-division remainders stay retained in the pool.

### Creator payout auto-split (applied to every "creator payout" slice)

`distribute_creator_payout(amount)`:
- 49% → creator wallet (`config.creator_wallet`)
- 51% → Charity Pool, but **20% of that** is immediately recycled back to the Game Pool
  (left in the pool by construction), so Charity nets 51% × 80% and the Game Pool keeps
  51% × 20%.

Recipient wallets are validated on-chain: `creator` must equal `config.creator_wallet`,
and `champion`/`record_holder` must equal the stored winner pubkey.

## State additions vs Gate E v0.1

- `SeasonState`: `farm_payout_claimed`, `human_payout_claimed`, `chaos_payout_claimed`.
- `RecordState`: `paid_record_breaks`.
- New `Pool` (`total_deposited`, `total_paid_out`, `carried_chaos`) and `CharityPool`
  (`total_in`, `total_recycled`, `total_out`).

## Build

The bundled SBF cargo (1.82) cannot parse `edition2024` manifests, so `jobserver` is pinned
to `=0.1.32` in `programs/gkd_chain/Cargo.toml` to keep `getrandom 0.3 → wasip2 → wit-bindgen`
out of the tree.

On Windows the Anchor 0.32 CLI mis-proxies the SBF toolchain. Build the `.so` directly:

```bash
rustup toolchain link 1.84.1-sbpf-solana-v1.51 "$HOME/.cache/solana/v1.51/platform-tools/rust"
export PATH="$HOME/.cargo/bin:$PATH"   # rustup proxy cargo must precede any standalone cargo
cd programs/gkd_chain && cargo-build-sbf --skip-tools-install
```

Host type-check (no SBF toolchain needed): `cargo check -p gkd_chain`.

## Pending before mainnet (deferred — do not deploy yet)

1. **Founder/creator wallet** — supplied by the owner. Set it as `creator_wallet` in
   `initialize_config` and update the front-end `chain_config.js` / whitepaper spec.
2. **Program id** — generate the real program keypair, sync `declare_id!` + `Anchor.toml`
   (current `target/deploy` keypair is a throwaway and differs from the source id).
3. **Cluster** — switch `Anchor.toml [provider]` and `chain_config.js` to `mainnet-beta`,
   fund the deploy keypair with real SOL.
4. **Front-end wiring** — replace the raw `poolRecipient` transfer in `chain_client.js`
   with a `deposit_entry_fee` instruction call against the deployed program + IDL.
5. **Audit** — independent review of pool/checkpoint math before real funds.
