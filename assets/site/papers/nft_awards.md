# On-chain NFT Awards — metatron set

On-chain minting of the whitepaper-locked award NFTs, as true Metaplex NFTs (SPL mint, supply 1,
0 decimals, metadata + master edition). Builds on the token-mining work. **Not yet deployed.**

## Award kinds

| kind | const | NFT image (whitepaper) | recipient validated against |
|---|---|---|---|
| 0 | `AWARD_FIRST_PLAYER` | `baby_metatron.png` | `config.first_player` (first verified player) |
| 1 | `AWARD_SEASON_CHAMPION` | `season_champion_metatron.png` | closed farm season `champion_wallet` (seasons 1–31) |
| 2 | `AWARD_RECORD_BREAKER` | `record_breaker_metatron.png` | `record_state.record_holder` |
| 3 | `AWARD_HUMAN_CHAMPION` | `human_metatron.png` | season 32 `champion_wallet` |
| 4 | `AWARD_CHAOS_CHAMPION` | `final_galaxy_metatron_defender.png` | season 33 `champion_wallet` |

## `award_nft(kind, discriminator, name, symbol, uri)`

Permissionless (anyone may relay/pay) — the recipient is always the on-chain-recorded winner for
the given `kind`. The `["award", kind, discriminator]` PDA (`AwardRecord`) is `init`-ed each call,
so every award can be minted **at most once**:

- season/human/chaos champion → `discriminator = season_id`, requires `season.is_closed`;
- record breaker → `discriminator` is the 1-based break index (`1..=record_break_count`);
- first player → `discriminator = 0`.

The mint authority is the `["mint_authority"]` PDA (shared with $420POP), so no human can mint or
alter these NFTs. The PDA signs `mint_to`, `create_metadata_accounts_v3`, and
`create_master_edition_v3` (max_supply 0 ⇒ non-fungible).

### Client responsibility: pre-create the NFT mint

To keep the instruction's BPF stack frame under the 4 KB limit, the program does **not** `init`
the mint. The client creates a fresh mint first (decimals 0, supply 0, mint & freeze authority =
the `mint_authority` PDA) and passes it in; the program validates those properties, mints 1 to the
recipient's ATA, then attaches metadata + master edition. A typical client tx:

1. `SystemProgram.createAccount` + `Token.initializeMint2` (authority = mint_authority PDA),
2. `award_nft(...)` against the program.

## Parameter that needs an ops decision

`name` / `symbol` / `uri` are passed in because the off-chain metadata JSON + image hosting
(Arweave/IPFS for the metatron PNGs in [src/assets](../src/assets)) is an ops decision, exactly like
`reward_per_run`. The program enforces *who* receives *which* award; the artwork URI is supplied at
call time.

## Known limitation

The record-breaker award is validated against the **current** `record_state.record_holder`. Per-break
holder history is not stored, so awarding an old break to a since-superseded holder is not supported.
Award record breaks promptly (one NFT per `record_break_count` value).
