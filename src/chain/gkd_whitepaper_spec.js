// src/chain/gkd_whitepaper_spec.js
// Galaxy King Dog Whitepaper v1.7 locked implementation constants.
// Gameplay must not import this for tuning; this file is for chain/verifier/policy wiring only.
(function (root, factory) {
  const spec = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = spec;
  if (root) root.GKD_WHITEPAPER_SPEC = spec;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEV_CREATOR_WALLET = "8qCpYyRjdG8Y1jW5fu77XZ3qkWErgABhscEuuY4mRjnr";
  const HUMAN_SEASON_CAPS = [
    1050000013, 525000000, 262500000, 131250000, 65625000, 32812500,
    16406250, 8203125, 4101562, 2050781, 1025390, 512695,
    256347, 128173, 64086, 32043, 16021, 8010,
    4005, 2002, 1001, 500, 250, 125,
    62, 31, 15, 7, 3, 1, 1, 1
  ];

  const MODE_A_TARGETS = {
    1: 2000,
    2: 2300,
    3: 2700,
    4: 3200,
    5: 3800,
    6: 4500,
    7: 5300,
    8: 6200,
    9: 7200,
    10: 8400
  };

  function modeBMultiplier(progress) {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    if (p <= 0.80) return 1.0;
    if (p <= 0.95) return 1.0 + ((p - 0.80) / 0.15) * 0.15;
    return 1.15 + ((p - 0.95) / 0.05) * 0.20;
  }

  function modeBTarget(baseTarget, mintedInSeason, seasonCap) {
    const cap = Math.max(1, Number(seasonCap) || 1);
    const p = Math.max(0, Math.min(1, (Number(mintedInSeason) || 0) / cap));
    return Math.ceil((Number(baseTarget) || 0) * modeBMultiplier(p));
  }

  const spec = {
    specVersion: "GKD_WHITEPAPER_LOCKED_V1_7",
    lockedAt: "2025-12-17",
    gameId: "420_HIGH_SCORE_GALAXIAN",

    token: {
      symbol: "$420POP",
      mintDecimals: 9,
      humanEmissionTokens: 2100000000,
      chaosSeasonCapTokens: 300000,
      humanSeasonCaps: HUMAN_SEASON_CAPS,
      totalFarmSeasons: 33,
      humanEmissionEndsAtSeason: 32,
      chaosSeason: 33
    },

    accounts: {
      gamePool: { type: "program-owned PDA", seed: "pool" },
      charityPool: { type: "program-owned PDA" },
      devCreatorWallet: DEV_CREATOR_WALLET,
      creatorWallet: DEV_CREATOR_WALLET,
      creatorWalletNetwork: "devnet",
      mainnetCreatorWallet: "",
      seasonState: "program account",
      recordState: "program account"
    },

    proofOfPlay: {
      schema: 2,
      requiredFields: [
        "player_pubkey",
        "fee_lamports",
        "entry_sig",
        "entry_slot",
        "final_score",
        "season_id",
        "replay_hash",
        "version_hash",
        "run_hash"
      ],
      minimalOnChainRecord: [
        "run_hash",
        "replay_hash",
        "version_hash",
        "player_pubkey",
        "season_id",
        "fee_lamports",
        "score",
        "passed",
        "entry_sig",
        "entry_slot",
        "run_package_uri"
      ],
      runHashOrder: [
        "player_pubkey",
        "game_id",
        "season_id",
        "fee_lamports",
        "entry_sig",
        "entry_slot",
        "run_ticket_id",
        "final_score",
        "replay_hash",
        "version_hash"
      ],
      replayGateMode: "schema2_hash_checkpoint"
    },

    seasons: {
      modeAInitialTargets: MODE_A_TARGETS,
      modeALastTarget: 40000,
      modeB: {
        progress80Multiplier: 1.0,
        progress95Multiplier: 1.15,
        progress100Multiplier: 1.35,
        targetFormula: "ceil(T_base * m(p))"
      },
      finalHumanTokenRequiresWorldRecord: true,
      finalHumanTokenEntryFeeUsdTarget: 1.0
    },

    fees: {
      normalTargetUsdMax: 0.10,
      initialFloorLamports: 270000,
      monthlyUpdateAuthority: "2/3 multisig",
      priceSources: ["Pyth SOL/USD", "Switchboard SOL/USD", "Coinbase/Kraken human verification log"],
      multisigCanWithdrawPoolFunds: false,
      multisigCanPauseUnpause: true
    },

    checkpoints: {
      permissionlessExecution: true,
      oneTimeClaimedFlag: true,
      payoutRules: {
        farmSeasonEnd: { retainedPct: 70, winnerPct: 20, creatorPayoutPct: 10 },
        worldRecordBreak: { retainedPct: 70, winnerPct: 20, creatorPayoutPct: 10, payoutEveryBreak: true },
        humanSeasonEnd: { carryToChaosPct: 30, humanChampionPct: 40, creatorPayoutPct: 30 },
        chaosSeasonEnd: { chaosChampionPct: 67, creatorPayoutPct: 33 }
      },
      creatorAutoSplit: { creatorPct: 49, charityPct: 51 },
      charityDonationRecyclePct: 20
    },

    governance: {
      charityVotesOnlyAt: ["end_human_emission", "end_chaos"],
      eligibility: "farmed >= 1 token",
      tokenWeightedDefault: true,
      quorumVotes: 10000,
      durationDays: 99,
      tie: "re-vote",
      failedQuorum: "funds remain in Charity Pool",
      operatorMustBeWhitelistedCharity: true
    },

    nftFiles: {
      firstPlayer: "baby_metatron.png",
      seasonChampion: "season_champion_metatron.png",
      recordBreaker: "record_breaker_metatron.png",
      humanChampion: "human_metatron.png",
      chaosChampion: "final_galaxy_metatron_defender.png"
    },

    markedTokens: {
      galaxyKing: "Human winner + record",
      chaosKing: "Chaos winner + record"
    }
  };

  spec.modeBMultiplier = modeBMultiplier;
  spec.modeBTarget = modeBTarget;
  return Object.freeze(spec);
});
