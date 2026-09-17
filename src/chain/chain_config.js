// src/chain/chain_config.js
// Front-end Chain Wiring
// Reads locked constants from src/chain/gkd_whitepaper_spec.js.

const GKD_SPEC = window.GKD_WHITEPAPER_SPEC || {};
const GKD_CLUSTER = "devnet";
const GKD_PROGRAM_IDS = Object.freeze({
  // Full contract deployed and initialized on 2026-06-29 for devnet validation.
  devnet: "GFbWdPxnUe2SFjXbnjum2Rti33eU58JfGcV4hTTFPwUg",
  // Keep empty until the audited program is deployed and initialized on mainnet.
  "mainnet-beta": "",
});
const GKD_CREATOR_WALLETS = Object.freeze({
  devnet: GKD_SPEC.accounts?.devCreatorWallet || "8qCpYyRjdG8Y1jW5fu77XZ3qkWErgABhscEuuY4mRjnr",
  "mainnet-beta": GKD_SPEC.accounts?.mainnetCreatorWallet || "",
});

window.CHAIN = {
  enabled: true,
  chainKind: "solana",
  programVersion: 1, // Current Devnet ABI. Candidate ABI 2 requires a coordinated migration.
  genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  healthUrl: '/api/verifier/health',
  chainId: 0,

  // Locked whitepaper context
  specVersion: GKD_SPEC.specVersion || "GKD_WHITEPAPER_LOCKED_V1_7",
  gameId: GKD_SPEC.gameId || "420_HIGH_SCORE_GALAXIAN",
  tokenSymbol: GKD_SPEC.token?.symbol || "$420POP",
  tokenDecimals: GKD_SPEC.token?.mintDecimals ?? 9,
  creatorWallet: GKD_CREATOR_WALLETS[GKD_CLUSTER],
  creatorSplitPct: GKD_SPEC.checkpoints?.creatorAutoSplit?.creatorPct ?? 49,
  charitySplitPct: GKD_SPEC.checkpoints?.creatorAutoSplit?.charityPct ?? 51,
  charityDonationRecyclePct: GKD_SPEC.checkpoints?.charityDonationRecyclePct ?? 20,
  totalFarmSeasons: GKD_SPEC.token?.totalFarmSeasons ?? 33,
  humanEmissionEndsAtSeason: GKD_SPEC.token?.humanEmissionEndsAtSeason ?? 32,
  chaosSeason: GKD_SPEC.token?.chaosSeason ?? 33,
  chaosSeasonCapTokens: GKD_SPEC.token?.chaosSeasonCapTokens ?? 300000,

  // Cluster / RPC
  cluster: GKD_CLUSTER, // "devnet" | "mainnet-beta"
  rpcUrl: "",        // optional override. leave "" to use web3 default clusterApiUrl

  // Same-origin gateway endpoints. The verifier key remains server-side and is never shipped
  // to the browser; server.js proxies only these allowlisted routes to the loopback verifier.
  verifyUrl: "/api/verifier/verify",
  submitUrl: "",

  // Gate D v1.0 anti-cheat ledger endpoints.
  // These make the verifier the score authority without requiring 1:1 replay.
  runAuthUrl: "/api/verifier/auth/challenge",
  runStartUrl: "/api/verifier/run/start",
  runEventUrl: "/api/verifier/run/event",
  runFinalizeUrl: "/api/verifier/run/finalize",

  // Season / rule context (used inside run_hash)
  seasonId: 1,

  // Entry fee (lamports). Default: 0.00027 SOL = 270,000 lamports.
  feeLamports: GKD_SPEC.fees?.initialFloorLamports ?? 270000,

  // Bot policy (on-chain later; kept here for UI + package fields)
  botMultiplier: 10,

  // TEMP recipient for entry fee transfer (used only when usePoolProgram is false).
  // DEV-only direct-transfer fallback. It is not used while usePoolProgram is true.
  // Whitepaper target: program-owned Game Pool PDA seed ["pool"].
  poolRecipient: GKD_CREATOR_WALLETS[GKD_CLUSTER],
  poolPdaSeed: GKD_SPEC.accounts?.gamePool?.seed || "pool",

  // gkd_chain on-chain program. When usePoolProgram is true, the entry fee is paid by invoking the
  // program's deposit_entry_fee instruction, which moves the fee into the program-owned Game Pool
  // PDA (the autopool). The id is selected per cluster so a devnet id cannot be reused on mainnet.
  programId: GKD_PROGRAM_IDS[GKD_CLUSTER],
  usePoolProgram: true,

  // Show the on-chain top-3 leaderboard (wallet/name) in a top-left panel. Reads the program's
  // Leaderboard PDA; no-op until the program is deployed on the active cluster.
  showLeaderboard: true,

  // UX policy
  requireWalletToStart: true, // if true: SPACE -> connect + pay -> then start countdown
};
