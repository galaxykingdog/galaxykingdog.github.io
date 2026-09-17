# Galaxy King Dog — Whitepaper Implementation Lock v1.7

Locked date: 2025-12-17  
Source: Galaxy King Dog Whitepaper v1.6 + v1.7 addendum. The addendum is authoritative where season/supply notes conflict.

> **v1.8 addendum (implemented).** Two clarifications now reflect the built program — see
> [WHITEPAPER.md](WHITEPAPER.md):
> - **Entry fee:** targets **$0.10** and is **re-pegged weekly** from a Pyth SOL/USD feed
>   (permissionless crank). 270,000 lamports below is the bootstrap value / dust floor, not a fixed
>   price; the 2/3 multisig may override but can never withdraw pool funds.
> - **Trust model:** the on-chain score is enforced by the **verifier's ed25519 signature** (Ed25519
>   precompile) over the ledger-accepted score, not by independent replay. Full bit-for-bit
>   resimulation remains a future hardening (see the verifier-mode note below).

## Implemented in repo

- `src/chain/gkd_whitepaper_spec.js` is the canonical implementation constants file.
- `src/chain/chain_config.js` reads the locked spec for token, creator wallet, season, split, fee, and pool context.
- `index.html` loads the spec before chain config and chain client.
- `verifier/test_whitepaper_spec.js` locks the constants with tests.

## Locked chain constants

- Token: `$420POP`
- Decimals: `9`
- Devnet creator wallet: `8qCpYyRjdG8Y1jW5fu77XZ3qkWErgABhscEuuY4mRjnr`
- Mainnet creator wallet: unset until the audited mainnet deployment is initialized
- Game Pool target: program-owned PDA, seed `pool`
- Human emission ends at Season `32`
- Season `33` is Chaos
- Chaos cap: `300,000 $420POP`
- Initial fee floor: `270,000` lamports

## Locked proof-of-play fields

The browser run package and verifier already use schema `2` with:

- `player_pubkey`
- `fee_lamports`
- `entry_sig`
- `entry_slot`
- `final_score`
- `season_id`
- `replay_hash`
- `version_hash`
- `run_hash`
- `checkpoint_chain_final`
- `last_checkpoint`

Verifier mode remains `schema2_hash_checkpoint` until full Phaser-identical strict resimulation is implemented.

## Locked split rules

- Creator payout auto-split: `49%` creator wallet / `51%` Charity Pool.
- Charity Pool donation recycle: `20%` back to Game Pool.
- Farm season end: `70%` retained / `20%` season winner / `10%` creator payout.
- World record break: `70%` retained / `20%` record breaker / `10%` creator payout, paid on every world-record break.
- Human season end: `30%` carried to Chaos / `40%` Human Champion / `30%` creator payout.
- Chaos end: `67%` Chaos Champion / `33%` creator payout.

## Locked governance

- Charity vote only twice: end Human emission and end Chaos.
- Eligibility: farmed at least one `$420POP`.
- Quorum: `10,000` votes.
- Duration: `99` days.
- Tie: re-vote.
- Failed quorum: funds remain in Charity Pool.
- Chosen operator must be a whitelisted verified charity organization.

## Locked NFT file names

- `baby_metatron.png`
- `season_champion_metatron.png`
- `record_breaker_metatron.png`
- `human_metatron.png`
- `final_galaxy_metatron_defender.png`

## Local check

Run:

```powershell
cd "C:\Users\spirc\Desktop\dogww"
node verifier/test_whitepaper_spec.js
npm.cmd run test:verifier
```
