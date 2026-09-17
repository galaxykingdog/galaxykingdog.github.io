// Robinhood Chain edition. Mainnet remains intentionally empty until audit and multisig rollout.
const GKD_ROBINHOOD_SPEC = window.GKD_WHITEPAPER_SPEC || {};
const GKD_ROBINHOOD_NETWORK = "testnet";
const GKD_ROBINHOOD_NETWORKS = Object.freeze({
  testnet: Object.freeze({
    chainId: 46630,
    chainName: "Robinhood Chain Testnet",
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
  }),
  mainnet: Object.freeze({
    chainId: 4663,
    chainName: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
  }),
});

const GKD_ROBINHOOD_NETWORK_CONFIG = GKD_ROBINHOOD_NETWORKS[GKD_ROBINHOOD_NETWORK];
const GKD_ROBINHOOD_DEPLOYMENT = window.GKD_ROBINHOOD_DEPLOYMENTS?.[GKD_ROBINHOOD_NETWORK] || {};
const GKD_ROBINHOOD_ENTRY_FEE_WEI = "270000000000000";

window.CHAIN = {
  enabled: true,
  chainKind: "robinhood",
  healthUrl: '/api/verifier/health',
  edition: "robinhood-testnet",

  specVersion: GKD_ROBINHOOD_SPEC.specVersion || "GKD_WHITEPAPER_LOCKED_V1_7",
  gameId: GKD_ROBINHOOD_SPEC.gameId || "420_HIGH_SCORE_GALAXIAN",
  tokenSymbol: GKD_ROBINHOOD_SPEC.token?.symbol || "$420POP",
  tokenDecimals: GKD_ROBINHOOD_SPEC.token?.mintDecimals ?? 9,
  creatorSplitPct: GKD_ROBINHOOD_SPEC.checkpoints?.creatorAutoSplit?.creatorPct ?? 49,
  charitySplitPct: GKD_ROBINHOOD_SPEC.checkpoints?.creatorAutoSplit?.charityPct ?? 51,
  charityDonationRecyclePct: GKD_ROBINHOOD_SPEC.checkpoints?.charityDonationRecyclePct ?? 20,
  totalFarmSeasons: GKD_ROBINHOOD_SPEC.token?.totalFarmSeasons ?? 33,
  humanEmissionEndsAtSeason: GKD_ROBINHOOD_SPEC.token?.humanEmissionEndsAtSeason ?? 32,
  chaosSeason: GKD_ROBINHOOD_SPEC.token?.chaosSeason ?? 33,
  chaosSeasonCapTokens: GKD_ROBINHOOD_SPEC.token?.chaosSeasonCapTokens ?? 300000,

  network: GKD_ROBINHOOD_NETWORK,
  cluster: `robinhood-${GKD_ROBINHOOD_NETWORK}`,
  chainId: GKD_ROBINHOOD_NETWORK_CONFIG.chainId,
  chainIdHex: `0x${GKD_ROBINHOOD_NETWORK_CONFIG.chainId.toString(16)}`,
  chainName: GKD_ROBINHOOD_NETWORK_CONFIG.chainName,
  rpcUrl: GKD_ROBINHOOD_NETWORK_CONFIG.rpcUrl,
  explorerUrl: GKD_ROBINHOOD_NETWORK_CONFIG.explorerUrl,
  nativeCurrency: Object.freeze({ name: "Ether", symbol: "ETH", decimals: 18 }),

  contractAddress: String(GKD_ROBINHOOD_DEPLOYMENT.contractAddress || ""),
  legacyContractAddress: String(GKD_ROBINHOOD_DEPLOYMENT.legacyContractAddress || ""),
  contractVersion: Number(GKD_ROBINHOOD_DEPLOYMENT.contractVersion || 0),
  deploymentTx: String(GKD_ROBINHOOD_DEPLOYMENT.deploymentTx || ""),
  verifierAddress: String(GKD_ROBINHOOD_DEPLOYMENT.verifierAddress || ""),
  simulationProtocol: String(GKD_ROBINHOOD_DEPLOYMENT.simulationProtocol || ""),
  simulationRulesetHash: String(GKD_ROBINHOOD_DEPLOYMENT.simulationRulesetHash || ""),

  verifyUrl: "/api/verifier/verify",
  submitUrl: "/api/verifier/robinhood/submit",
  runAuthUrl: "/api/verifier/auth/challenge",
  runStartUrl: "/api/verifier/run/start",
  runEventUrl: "/api/verifier/run/event",
  runFinalizeUrl: "/api/verifier/run/finalize",

  seasonId: 1,
  feeWei: GKD_ROBINHOOD_ENTRY_FEE_WEI,
  feeLamports: Number(GKD_ROBINHOOD_ENTRY_FEE_WEI),
  botMultiplier: 10,
  showLeaderboard: true,
  requireWalletToStart: true,
};
