> Historical Solana design and dated development notes. These rules and deployment statements are not the current RH policy or a live-status report. The current whitepaper takes precedence for RH fees, charity, buyback, administrator control and mainnet readiness.

[Current whitepaper](../../../whitepaper.html)

# Charity Governance — RH candidate and historical Solana design

## RH candidate status — 13 September 2026 — not deployed

Robinhood is the development priority, but this reward candidate remains local and undeployed. No project mainnet release is deployed or enabled. Twenty targeted local suites passed, including an actual local HTTP flow from authenticated test entry and server-issued seed through replay, signed proof, recorded run and one test-only fixture token. These results are not an independent audit or a live rollout.

Holders advise through one 99-day ballot at each Human or Chaos gate. After finalization, the sole project administrator reviews the visible result and chooses the final charity recipient with a public reason. Ties or insufficient quorum do not require another ballot. Ballot candidates are sealed, while the administrator may choose a recipient outside that list. The contract does not establish an organization's charitable identity.

Saving a decision authorizes anyone to pay its original charity allocation. Payment must match the reviewed recipient and reason. An unpaid decision may be corrected before payment confirms. Failed transfers leave the allocation unpaid and reserved, separate from player and creator credits; completed payments cannot be recalled. No holder committee, extra timelock or automatic DAO transition is included.

The separate 5% buyback allocation is intended for a meme-token treasury governed by its own community. No production token, treasury or governance addresses are bound yet. This treasury is separate from the administrator's charity decisions. NFT artwork and metadata templates remain local and unpublished.

Before launch: independent contract and replay review, a real hosting rehearsal with Android and wallet checks, verified administrator custody and charity/token addresses, and NFT publication. The public arcade and existing testnet are separate from this candidate. The Solana v1.7 material below is preserved historical design, not the current RH charity policy.

## Historical Solana v1.7 design

On-chain implementation of the whitepaper v1.7 charity governance: token-weighted votes that
direct the Charity Pool to a whitelisted charity operator. **Not yet deployed.**

## Locked rules (v1.7)

- Votes happen at **two gates only**: `end_human_emission` (gate 0, after season 32 closes) and
  `end_chaos` (gate 1, after season 33 closes).
- **Eligibility**: voter must hold ≥ 1 whole $420POP.
- **Token-weighted**: vote weight = the voter's whole-token $420POP balance.
- **Quorum**: 10,000 total weighted votes.
- **Duration**: 99 days.
- **Tie**: re-vote (admin opens a new `round`).
- **Failed quorum**: funds remain in the Charity Pool.
- **Operator** must be a whitelisted verified charity.

## Instructions

| Instruction | Who | What |
|---|---|---|
| `whitelist_charity(operator, name)` | admin | Adds a verified operator (`["charity_op", operator]` PDA). |
| `open_charity_vote(gate, round)` | admin | Opens a 99-day vote; requires the gate's season closed. Quorum = 10k. |
| `cast_charity_vote()` | any eligible holder | One token-weighted vote per wallet per proposal. |
| `finalize_charity_vote()` | permissionless | After close: routes Charity Pool to the winner, or marks failed-quorum / tie. |

## Accounts / PDAs

- `CharityProposal` — `["proposal", gate, round]`. Tracks window, quorum, `total_votes`, and the
  **top-two** tallies (`leading_votes` / `second_votes`) so an exact tie is detectable at finalize.
- `OperatorTally` — `["tally", proposal, operator]`. Accumulated weight per operator (`init_if_needed`).
- `VoteReceipt` — `["vote", proposal, voter]`. `init` ⇒ one vote per wallet per proposal.
- `WhitelistedCharity` — `["charity_op", operator]`. Operator + active flag + name.

## Voting & finalize

`cast_charity_vote` reads the voter's $420POP token account (mint must equal `config.mint`, owner
must be the voter), computes `weight = amount / 10⁹`, requires `weight ≥ 1`, writes a `VoteReceipt`,
adds the weight to the operator's tally and the proposal total, and updates the top-two tracker.

`finalize_charity_vote` (after `end_ts`):
- `total_votes < quorum` → `failed_quorum = true`, funds stay in the Charity Pool;
- `leading_votes == second_votes` → `tie = true`, admin must `open_charity_vote` with a new `round`;
- otherwise the winner = `leading_operator` (re-checked against the passed operator + whitelist) and
  the Charity Pool's distributable balance is transferred to the operator wallet.

## Known limitations (documented, pre-audit)

- **Snapshot-less weighting**: weight is the *current* balance, so tokens moved between wallets can
  be re-used to vote from multiple wallets. A balance snapshot or vote-time token lock/escrow is the
  hardening step before mainnet.
- Quorum unit is whole-token weight (10,000), matching the token-weighted default; confirm against
  the whitepaper if a one-wallet-one-vote interpretation was intended instead.
