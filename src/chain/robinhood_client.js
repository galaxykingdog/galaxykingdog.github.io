// Robinhood Chain EVM adapter. It exposes the same ChainClient API used by the canonical game.
(function () {
  const ZERO_CHAIN = "0".repeat(64);
  const LEDGER_VERSION = "GKD-AUTH-SCORE-LEDGER-v2";
  const PENDING_ENTRY_STORAGE_PREFIX = "gkd_pending_entry_evm_v1";
  const CONTRACT_ABI = [
    "function entryFeeWei() view returns (uint256)",
    "function verifier() view returns (address)",
    "function paused() view returns (bool)",
    "function activeSeasonId() view returns (uint16)",
    "function scoreTarget() view returns (uint256)",
    "function depositEntryFee() payable",
    "event EntryPaid(address indexed player,uint256 amount,uint256 indexed entryBlock,uint256 entryNumber)",
    "function submitVerifiedRun((bytes32 runHash,bytes32 replayHash,bytes32 versionHash,address player,uint16 seasonId,uint256 score,uint256 feeWei,bytes32 entryTxHash,uint256 entryBlock) claim,bytes verifierSignature,bytes16 playerName)",
    "function runs(bytes32) view returns (bytes32 replayHash,bytes32 versionHash,bytes32 entryTxHash,address player,uint16 seasonId,uint256 score,uint256 feeWei,uint256 entryBlock,uint256 submittedAtBlock)",
    "function getLeaderboard() view returns ((uint256 score,address player,bytes16 name)[3] entries,uint8 count)",
    "error ContractPaused()",
    "error InvalidEntryFee()",
    "error InvalidRun()",
    "error InvalidSeason()",
    "error InvalidSignature()",
    "error PlayerMismatch()",
    "error ReplayDetected()",
    "error ScoreBelowTarget()",
  ];
  const V3_CLAIM = "(bytes32 runHash,bytes32 replayHash,bytes32 versionHash,bytes32 entryId,address player,uint16 seasonId,uint256 score,bytes16 playerName)";
  const V3_TYPES = { VerifiedRun: [
    { name: "runHash", type: "bytes32" }, { name: "replayHash", type: "bytes32" },
    { name: "versionHash", type: "bytes32" }, { name: "entryId", type: "bytes32" },
    { name: "player", type: "address" }, { name: "seasonId", type: "uint16" },
    { name: "score", type: "uint256" }, { name: "playerName", type: "bytes16" },
  ] };
  const V3_ABI = [
    "function currentEntryFee() view returns (uint256)",
    "function verifier() view returns (address)", "function paused() view returns (bool)",
    "function activeSeasonId() view returns (uint16)", "function entryTimeout() view returns (uint256)",
    "function seasons(uint16) view returns (uint256 cap,uint256 minted,uint256 baseTarget,uint256 rewardPerRun,uint256 topScore,address champion,uint256 pendingEntries,bool closed)",
    "function entries(bytes32) view returns (address player,uint16 seasonId,uint256 amount,uint256 expiresAt,bool consumed,bool refunded,bool finalHumanPremium,uint256 startedAt)",
    "function depositEntryFee() payable returns (bytes32)",
    "event EntryPaid(bytes32 indexed entryId,address indexed player,uint16 seasonId,uint256 amount,uint256 expiresAt)",
    `function submitVerifiedRun(${V3_CLAIM} claim,bytes signature)`,
    `function runs(bytes32) view returns ((${V3_CLAIM} claim,bool rewardMinted,bool worldRecordBroken))`,
    "function getLeaderboard() view returns ((uint256 score,address player,bytes16 name)[3] entries,uint8 count)",
    "function modeBTarget(uint256 base,uint256 minted,uint256 cap) view returns (uint256)",
    "function token() view returns (address)", "function claimable(address) view returns (uint256)",
    "function mintFarmReward(bytes32 runHash)", "function refundExpiredEntry(bytes32 entryId)",
    "function expireStartedEntry(bytes32 entryId)", "function claimNative(address recipient)",
    "function milestones() view returns (address)",
    "function milestoneRecipient(uint8 kind,uint256 discriminator) view returns (address)",
    "function awardMilestone(uint8 kind,uint256 discriminator) returns (uint256)",
    "function gamePool() view returns (uint256)", "function charityPool() view returns (uint256)",
    "function carriedChaos() view returns (uint256)", "function pendingEscrow() view returns (uint256)",
    "function payoutReserves() view returns (uint256)", "function claimLiabilities() view returns (uint256)",
    "function voteReserves() view returns (uint256)", "function accountedBalance() view returns (uint256)",
    "function buybackReserve() view returns (uint256)", "function buybackExecutor() view returns (address)",
    "function buybackCount() view returns (uint256)",
    "function configurationSealed() view returns (bool)",
    "event BuybackExecuted(uint256 indexed id,address indexed token,address indexed treasury,uint256 nativeSpent,uint256 netTokensReceived,uint256 reserveRemaining)",
    "function charityGateBudgets(uint8) view returns (uint256)", "function lastGateVote(uint8) view returns (uint256)",
    "function CHARITY_POLICY_VERSION() view returns (uint256)", "function owner() view returns (address)",
    "function votes(uint256) view returns (uint8 gate,uint48 snapshot,uint256 endsAt,uint256 budget,uint256 totalVotes,address leader,uint256 leadingVotes,bool tied,bool finalized,bool successful)",
    "function charityDecisions(uint256) view returns (address recipient,bytes32 reasonHash,bool paid)",
    "function setCharityDecision(uint256 id,address recipient,string reason)",
    "function finalizeCharityVote(uint256 id)", "function claimCharity(uint256 id,address expectedRecipient,bytes32 expectedReasonHash)",
    "function openCharityVote(uint8 gate)", "function castCharityVote(uint256 id,address operator)",
    "function whitelistedCharity(address) view returns (bool)", "function voted(uint256,address) view returns (bool)",
    "event CharityDecisionSet(uint256 indexed id,address indexed recipient,string reason)",
    "event CharityPaid(uint256 indexed id,address indexed recipient,uint256 amount)",
    "error CharityDecisionUnavailable()", "error InvalidCharityDecision()", "error CharityPaymentFailed()", "error CharityDecisionChanged()",
    "function recordBreakCount() view returns (uint256)",
    "error ConfigurationLocked()", "error ConfigurationNotSealed()", "error InvalidSealState()",
    "error SeasonPolicyMissing(uint16 seasonId)", "error OwnershipRecoveryPending()",
    "error InvalidSeason()", "error InvalidSeasonPolicy()", "error LockedSeasonTarget()",
    "error PreviousSeasonOpen()", "error HumanCharityUnsettled()",
    "error EntryUnavailable()", "error InvalidFees()",
    "error InvalidBuybackConfiguration()", "error BuybackUnavailable()", "error InvalidCharityRegistry()",
    "error ContractPaused()", "error SeasonUnavailable()", "error WrongEntryFee()",
    "error EntryActive()", "error EntryUnauthorized()", "error EntryExpired()",
    "error MissingRunProof()", "error RunReplay()", "error EntryMismatch()",
    "error InvalidVerifier()", "error InvalidDifficulty()", "error RewardUnavailable()",
    "error RewardCapReached()", "error InsufficientScore()", "error FinalHumanRecordRequired()",
    "error FinalHumanPremiumRequired()", "error SeasonIncomplete()", "error PayoutUnavailable()",
    "error NothingClaimable()", "error NativePaymentFailed()", "error AwardUnavailable()",
    "error GateUnavailable()", "error VoteUnavailable()", "error InvalidCharityVote()",
  ];
  const V3_ERROR_MESSAGES = Object.freeze({
    ConfigurationLocked: "Launch rules are locked and cannot be changed.",
    ConfigurationNotSealed: "Launch rules are not locked yet. Paid play has not opened.",
    InvalidSealState: "Launch configuration cannot be locked in its current state.",
    SeasonPolicyMissing: "All season rules must be prepared before paid play opens.",
    OwnershipRecoveryPending: "The project administrator is retained in this phase; ownership cannot be renounced.",
    InvalidSeason: "This season is unavailable.",
    InvalidSeasonPolicy: "The season rules are invalid.",
    LockedSeasonTarget: "This season has a fixed score target.",
    PreviousSeasonOpen: "The current season must finish before the next one opens.",
    HumanCharityUnsettled: "The Human charity gate must be prepared before Chaos opens.",
    EntryUnavailable: "This entry is no longer available for the requested action.",
    InvalidFees: "The entry fee configuration is invalid.",
    InvalidBuybackConfiguration: "The buyback configuration is unavailable.",
    BuybackUnavailable: "This buyback cannot be executed with the current reserve or configuration.",
    InvalidCharityRegistry: "The charity ballot candidate configuration is invalid.",
    ContractPaused: "Paid play is paused. Try again after the administrator resumes it.",
    SeasonUnavailable: "This season is not open for this action.",
    WrongEntryFee: "The entry payment does not match the current fee. Refresh and try again.",
    EntryActive: "This entry already has an active run.",
    EntryUnauthorized: "This wallet is not authorized for that entry.",
    EntryExpired: "This entry has expired.",
    MissingRunProof: "The run is missing its required verification proof.",
    RunReplay: "This run has already been recorded.",
    EntryMismatch: "The run does not match its paid entry.",
    InvalidVerifier: "The score verifier is invalid or its signature is not accepted.",
    InvalidDifficulty: "The score difficulty parameters are invalid.",
    RewardUnavailable: "This reward is not available to claim.",
    RewardCapReached: "This season has reached its reward limit.",
    InsufficientScore: "The verified score has not reached the reward target.",
    FinalHumanRecordRequired: "The final Human reward requires the qualifying record.",
    FinalHumanPremiumRequired: "This action requires the final Human entry.",
    SeasonIncomplete: "This season has not completed its required conditions.",
    PayoutUnavailable: "This prize allocation is not available.",
    NothingClaimable: "This recipient has no available native-currency credit.",
    NativePaymentFailed: "The recipient rejected payment. Its credit remains available.",
    AwardUnavailable: "This milestone is not available.",
    CharityDecisionUnavailable: "This charity allocation is not ready for that action or has already been paid.",
    CharityDecisionChanged: "The charity decision changed. Refresh and review its destination and public reason before paying.",
    InvalidCharityDecision: "Check the charity destination and public reason of 1–512 UTF-8 bytes.",
    CharityPaymentFailed: "The charity recipient rejected payment. The unpaid decision can be corrected by the administrator.",
    GateUnavailable: "This charity gate is not ready or already has a ballot.",
    VoteUnavailable: "This ballot is unavailable for that action. Refresh to check its deadline and status.",
    InvalidCharityVote: "Voting requires an approved candidate and eligible farmed tokens held at the ballot snapshot.",
  });
  function isV3() { return Number(cfg().contractVersion || 2) === 3; }
  function contractAbi() {
    const version = Number(cfg().contractVersion || 2);
    if (![1, 2, 3].includes(version)) throw new Error("Unsupported Robinhood contract version");
    return version === 3 ? V3_ABI : CONTRACT_ABI;
  }

  const state = {
    connected: false,
    pubkey: "",
    lastEntrySig: "",
    lastEntrySlot: null,
    lastEntry: null,
    lastVerify: null,
    lastSubmitSig: null,
    lastRunRecord: "",
    ledger: {
      active: false,
      finalized: false,
      run_ticket_id: "",
      event_seq: 0,
      accepted_score: 0,
      ledger_root: ZERO_CHAIN,
      challenge: null,
      lastStart: null,
      lastEvent: null,
      lastFinalize: null,
      lastError: "",
      integrityFailed: false,
      scoreIntegrityFailed: false,
      rejectedEvents: [],
      queue: Promise.resolve(),
    },
  };

  let browserProvider = null;
  let readProvider = null;
  let activeWalletProvider = null;
  let walletEventsProvider = null;
  let walletConnectionInProgress = false;
  let walletConnectionPromise = null;
  const announcedWalletProviders = [];
  const walletProviderInfo = new WeakMap();

  function $(id) { return document.getElementById(id); }

  function status(message) {
    try {
      const element = $("chain-status");
      if (element) element.textContent = message;
    } catch (_) {}
    try {
      if (typeof window.__CHAIN_STATUS_CB === "function") window.__CHAIN_STATUS_CB(message);
    } catch (_) {}
  }

  function ethersApi() {
    if (!window.ethers) throw new Error("ethers library is not loaded");
    return window.ethers;
  }

  function providerInfo(provider) {
    return walletProviderInfo.get(provider) || {};
  }

  function isMetaMaskProvider(provider) {
    const info = providerInfo(provider);
    return (provider?.isMetaMask && !provider?.isPhantom)
      || String(info.rdns || "").toLowerCase() === "io.metamask"
      || /^metamask$/i.test(String(info.name || ""));
  }

  function walletProviderPriority(provider) {
    // An announced MetaMask outranks any other extension that merely sets isMetaMask.
    if (String(providerInfo(provider).rdns || "").toLowerCase() === "io.metamask") return -1;
    if (isMetaMaskProvider(provider)) return 0;
    if (provider?.isRabby) return 1;
    if (provider?.isCoinbaseWallet) return 2;
    if (!provider?.isPhantom) return 3;
    return 10;
  }

  function rememberAnnouncedWallet(event) {
    const provider = event?.detail?.provider;
    if (!provider || typeof provider.request !== "function") return;
    if (!announcedWalletProviders.includes(provider)) announcedWalletProviders.push(provider);
    if (event?.detail?.info) walletProviderInfo.set(provider, event.detail.info);
  }

  function requestWalletAnnouncements() {
    try {
      if (typeof window.dispatchEvent === "function" && typeof window.Event === "function") {
        window.dispatchEvent(new window.Event("eip6963:requestProvider"));
      }
    } catch (_) {}
  }

  try {
    if (typeof window.addEventListener === "function") {
      window.addEventListener("eip6963:announceProvider", rememberAnnouncedWallet);
      requestWalletAnnouncements();
    }
  } catch (_) {}

  function walletProviderCandidates() {
    const providers = [];
    const add = (provider) => {
      if (!provider || typeof provider.request !== "function" || providers.includes(provider)) return;
      providers.push(provider);
    };
    announcedWalletProviders.forEach(add);
    if (Array.isArray(window.ethereum?.providers)) window.ethereum.providers.forEach(add);
    add(window.ethereum);
    add(window.phantom?.ethereum);
    return providers.sort((left, right) => walletProviderPriority(left) - walletProviderPriority(right));
  }

  function injectedProvider() {
    if (activeWalletProvider && typeof activeWalletProvider.request === "function") return activeWalletProvider;
    return walletProviderCandidates()[0] || null;
  }

  function walletProviderName(provider = injectedProvider()) {
    const announcedName = String(providerInfo(provider).name || "").trim();
    const announcedRdns = String(providerInfo(provider).rdns || "").toLowerCase();
    if (announcedName && announcedRdns && announcedRdns !== "io.metamask") return announcedName;
    if (isMetaMaskProvider(provider)) return "MetaMask";
    if (provider?.isRabby) return "Rabby";
    if (provider?.isCoinbaseWallet) return "Coinbase Wallet";
    if (provider?.isPhantom) return "Phantom";
    return announcedName || "EVM wallet";
  }

  async function discoverInjectedProvider() {
    requestWalletAnnouncements();
    if (typeof window.setTimeout === "function") {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    } else {
      await Promise.resolve();
    }
    return injectedProvider();
  }

  function normalizedChainId(value) {
    try {
      return `0x${BigInt(String(value)).toString(16)}`;
    } catch (_) {
      return String(value || "").trim().toLowerCase();
    }
  }

  function walletErrorNodes(error) {
    const nodes = [];
    const queue = [error];
    const seen = new Set();
    while (queue.length && nodes.length < 32) {
      const current = queue.shift();
      if (!current || (typeof current !== "object" && typeof current !== "string")) continue;
      if (typeof current === "string") {
        const trimmed = current.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try { queue.push(JSON.parse(trimmed)); } catch (_) {}
        }
        continue;
      }
      if (seen.has(current)) continue;
      seen.add(current);
      nodes.push(current);
      for (const key of ["error", "info", "data", "cause", "originalError"]) {
        if (current[key] != null) queue.push(current[key]);
      }
    }
    return nodes;
  }

  function walletErrorCode(error) {
    const nodes = walletErrorNodes(error);
    for (const node of nodes) {
      const number = Number(node?.code);
      if (Number.isFinite(number)) return number;
    }
    return nodes.find((node) => node?.code != null)?.code;
  }

  function walletErrorMessage(error) {
    const messages = [];
    for (const node of walletErrorNodes(error)) {
      for (const value of [node?.shortMessage, node?.reason, node?.message]) {
        const message = String(value || "").replace(/^Error:\s*/, "").trim();
        if (message && !messages.includes(message)) messages.push(message);
      }
    }
    const useful = messages.find((message) => !/could not coalesce|unknown error|wallet request failed/i.test(message));
    return useful || messages[0] || String(error || "wallet request failed").replace(/^Error:\s*/, "");
  }

  function validWalletAddress(value) {
    try {
      return value && ethersApi().isAddress(value) ? ethersApi().getAddress(value) : "";
    } catch (_) {
      return "";
    }
  }

  async function readAuthorizedAccounts(provider) {
    try {
      const accounts = await provider.request({ method: "eth_accounts", params: [] });
      return Array.isArray(accounts) ? accounts : [];
    } catch (_) {
      return [];
    }
  }

  // MetaMask's side panel can answer -32603 at once while the approval is still open;
  // keep checking long enough for a person to approve instead of failing the connect.
  async function recoverAuthorizedAccounts(provider, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    do {
      const accounts = await readAuthorizedAccounts(provider);
      if (validWalletAddress(accounts[0])) return accounts;
      if (validWalletAddress(provider.selectedAddress)) return [provider.selectedAddress];
      await new Promise((resolve) => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    return [];
  }

  async function requestWalletAccounts(provider) {
    const existing = await readAuthorizedAccounts(provider);
    if (validWalletAddress(existing[0])) return existing;
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts", params: [] });
      return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
      const code = walletErrorCode(error);
      const recoverable = code === -32603 || code === -32002 || /unexpected error|resource not available|request.*pending/i.test(walletErrorMessage(error));
      if (recoverable) {
        status(`ROBINHOOD: approve the connection in ${walletProviderName(provider)}…`);
        const recovered = await recoverAuthorizedAccounts(provider);
        if (validWalletAddress(recovered[0])) return recovered;
      }
      throw error;
    }
  }

  function setConnectButtonBusy(busy) {
    try {
      const button = $("btn-connect");
      if (!button) return;
      button.disabled = busy;
      button.textContent = busy ? "Check wallet…" : "Connect EVM Wallet";
    } catch (_) {}
  }

  function walletConnectionFailureStatus(stage, error, provider = injectedProvider()) {
    const code = walletErrorCode(error);
    const message = walletErrorMessage(error);
    const wallet = walletProviderName(provider);
    if (code === 4001 || /reject|cancel|declin/i.test(message)) return "ROBINHOOD: wallet connection cancelled";
    if (code === -32002) return `ROBINHOOD: finish the open ${wallet} request, then retry`;
    if (code === -32603 || /unexpected error/i.test(message)) {
      return `ROBINHOOD: ${wallet} error at ${stage}${code ? ` (${code})` : ""} — retry Connect`;
    }
    return `ROBINHOOD: ${stage} failed${code ? ` (${code})` : ""} — ${message}`;
  }

  function cfg() {
    return window.CHAIN || {};
  }

  function asInt(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
  }

  function requireSafeInteger(value, label) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} exceeds browser-safe integer range`);
    return number;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function getBackendCfg() {
    const chain = cfg();
    return {
      verifyUrl: chain.verifyUrl || "",
      submitUrl: chain.submitUrl || "",
      runAuthUrl: chain.runAuthUrl || "",
      runStartUrl: chain.runStartUrl || "",
      runEventUrl: chain.runEventUrl || "",
      runFinalizeUrl: chain.runFinalizeUrl || "",
    };
  }

  function contractAddress() {
    const address = String(cfg().contractAddress || "").trim();
    if (!address || !ethersApi().isAddress(address)) throw new Error("Robinhood testnet contract is not deployed/configured yet");
    return ethersApi().getAddress(address);
  }

  function getReadProvider() {
    if (!readProvider) {
      const chain = cfg();
      readProvider = new (ethersApi().JsonRpcProvider)(chain.rpcUrl, Number(chain.chainId), { staticNetwork: true });
    }
    return readProvider;
  }

  function getBrowserProvider() {
    const injected = injectedProvider();
    if (!injected) throw new Error("EVM wallet not found");
    if (!browserProvider) browserProvider = new (ethersApi().BrowserProvider)(injected, "any");
    return browserProvider;
  }

  async function switchToConfiguredNetwork(provider = injectedProvider()) {
    const injected = provider;
    if (!injected) throw new Error("EVM wallet not found");
    const chain = cfg();
    const target = normalizedChainId(chain.chainIdHex || chain.chainId);
    const current = normalizedChainId(await injected.request({ method: "eth_chainId" }));
    if (current === target) return;
    try {
      await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target }] });
    } catch (error) {
      let observed = "";
      try { observed = normalizedChainId(await injected.request({ method: "eth_chainId" })); } catch (_) {}
      if (observed === target) return;
      if (Number(error?.code) !== 4902 && !/unknown chain|unrecognized chain/i.test(String(error?.message || ""))) throw error;
      await injected.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: target,
          chainName: chain.chainName,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [chain.rpcUrl],
          blockExplorerUrls: [chain.explorerUrl],
        }],
      });
    }
    const deadline = Date.now() + 3000;
    let switched = "";
    do {
      switched = normalizedChainId(await injected.request({ method: "eth_chainId" }));
      if (switched === target) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    throw new Error(`wallet is not connected to ${chain.chainName}`);
  }

  function syncPOHPContext() {
    const chain = cfg();
    const entry = isV3() ? state.lastEntry : null;
    const feeUnits = requireSafeInteger(entry?.feeWei ?? chain.feeWei ?? chain.feeLamports ?? 0, "entry fee");
    try {
      if (window.POHP && typeof window.POHP.setSeasonId === "function") {
        window.POHP.setSeasonId(entry?.seasonId || chain.seasonId || 1);
      }
      if (state.pubkey && window.POHP && typeof window.POHP.setPlayerPubkey === "function") {
        window.POHP.setPlayerPubkey(state.pubkey);
      }
      if (window.POHP && typeof window.POHP.setEntryProof === "function") {
        window.POHP.setEntryProof({
          fee_lamports: feeUnits,
          entry_sig: state.lastEntrySig || "",
          entry_slot: state.lastEntrySlot || 0,
          ...(entry ? { entry_id: entry.entryId, contract_version: 3 } : {}),
        });
      }
      const ticketId = state.ledger.run_ticket_id || chain.runTicketId || "";
      if (ticketId && window.POHP && typeof window.POHP.setRunTicket === "function") {
        window.POHP.setRunTicket({ run_ticket_id: ticketId });
      }
    } catch (_) {}
  }

  async function postJSON(url, payload) {
    const routes = getBackendCfg();
    // Only the capability-gated event/finalize endpoints accept identical delivery retries.
    const retryableRoute = !!url && [routes.runEventUrl, routes.runFinalizeUrl].includes(url)
      && ![routes.runAuthUrl, routes.runStartUrl, routes.verifyUrl, routes.submitUrl].includes(url);
    const fixedVerify = url === routes.verifyUrl && cfg().simulationProtocol === 'fixed_step_v1';
    const body = JSON.stringify(payload); // Keep nonce, sequence and challenge bytes unchanged.
    const maxAttempts = retryableRoute ? 3 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let response = null, timer;
      const controller = retryableRoute || fixedVerify ? new AbortController() : null;
      try {
        const request = (async () => {
          response = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" }, body,
            ...(controller ? { signal: controller.signal } : {}),
          });
          let result = null;
          try { result = await response.json(); }
          catch (_) { if (retryableRoute && response.ok) throw new Error("Invalid JSON acknowledgement"); }
          if (!response.ok) throw new Error(result?.error || result?.message || `HTTP ${response.status}`);
          if (retryableRoute && (!result || Array.isArray(result) || typeof result.ok !== "boolean")) {
            throw new Error("Invalid JSON acknowledgement");
          }
          return result;
        })();
        if (!retryableRoute && !fixedVerify) return await request;
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort(); reject(new Error(fixedVerify ? 'Verification timed out. Retry this saved score without paying again.' : "Score service acknowledgement timed out"));
          }, fixedVerify ? 140000 : 8000);
        });
        return await Promise.race([request, deadline]);
      } catch (error) {
        // Never retry a client/auth rejection, including a malformed or stalled 4xx body.
        const transient = !response || response.ok || (response.status >= 500 && response.status <= 599);
        if (!retryableRoute || !transient || attempt + 1 === maxAttempts) throw error;
      } finally { if (timer !== undefined) clearTimeout(timer); }
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  function showWalletHelp() {
    if (typeof document.createElement !== "function" || !document.body) return;
    let panel = $("rh-wallet-help");
    if (!panel) {
      panel = document.createElement("dialog");
      panel.id = "rh-wallet-help";
      panel.setAttribute("aria-labelledby", "rh-wallet-help-title");
      panel.style.cssText = "box-sizing:border-box;width:min(420px,calc(100vw - 24px));max-height:85dvh;overflow:auto;background:#071d1c;color:#ecfff5;border:1px solid #638578;border-radius:18px;padding:24px;font:15px/1.5 system-ui;box-shadow:0 20px 90px #000b";
      const title = document.createElement("h2"); title.id = "rh-wallet-help-title";
      title.textContent = "Open Robin in your wallet"; title.style.cssText = "font-size:22px;margin:0 0 12px";
      const guidance = document.createElement("p");
      guidance.textContent = "On your phone, open this game in MetaMask's browser, then tap Connect wallet again. On a computer, enable an EVM wallet extension for this site.";
      const note = document.createElement("p");
      note.textContent = "Robinhood Testnet only · Use test ETH. Connecting does not pay an entry fee.";
      note.style.color = "#ceef99";
      panel.append(title, guidance, note);
      // Handoff only the page and cosmetic options, never wallet/session/auth query data.
      let target;
      try {
        const current = new URL(window.location.href);
        target = new URL(current.pathname, current.origin);
        for (const name of ["skin", "voice", "controls"]) {
          const value = current.searchParams.get(name);
          if (value && /^[a-zA-Z0-9_-]{1,48}$/.test(value)) target.searchParams.set(name, value);
        }
        if (target.protocol !== "https:" || target.username || target.password) target = null;
      } catch (_) {}
      if (target) {
        const open = document.createElement("a"); open.id = "rh-wallet-open";
        open.textContent = "Open in MetaMask";
        // MetaMask's official dapp link format: metamask.github.io/metamask-deeplinks/.
        open.href = "https://metamask.app.link/dapp/" + target.href.slice(8);
        open.rel = "noreferrer"; open.style.cssText = "display:block;padding:12px;text-align:center;color:#071d1c;background:#ceef99;border-radius:10px;font-weight:700;text-decoration:none";
        const fallback = document.createElement("p");
        fallback.textContent = "If the app opens without the game, paste this address into its browser:";
        const address = document.createElement("input"); address.id = "rh-wallet-address";
        address.readOnly = true; address.value = target.href; address.setAttribute("aria-label", "Game address for wallet browser");
        address.style.cssText = "box-sizing:border-box;width:100%;padding:10px;background:#102c25;color:#fff;border:1px solid #638578;border-radius:8px";
        address.addEventListener("click", () => address.select());
        panel.append(open, fallback, address);
      }
      const close = document.createElement("button"); close.type = "button"; close.textContent = "Close";
      close.style.cssText = "display:block;margin:18px 0 0 auto;padding:10px 20px;color:#ecfff5;background:#173b30;border:1px solid #638578;border-radius:10px;cursor:pointer";
      close.addEventListener("click", () => panel.close()); panel.append(close);
      document.body.appendChild(panel);
    }
    if (!panel.open) panel.showModal();
  }

  async function connectWalletOnce() {
    const injected = await discoverInjectedProvider();
    if (!injected) {
      status("ROBINHOOD: open this game in your wallet's browser, then connect");
      showWalletHelp();
      return false;
    }
    walletConnectionInProgress = true;
    setConnectButtonBusy(true);
    let stage = "authorization";
    try {
      activeWalletProvider = injected;
      browserProvider = null;
      bindWalletEvents(injected);
      status(`ROBINHOOD: connecting ${walletProviderName(injected)}…`);
      const accounts = await requestWalletAccounts(injected);
      const address = validWalletAddress(accounts[0]);
      if (!address) throw new Error("wallet returned no account");
      stage = "network switch";
      await switchToConfiguredNetwork(injected);
      stage = "wallet validation";
      browserProvider = null;
      state.connected = true;
      if (state.pubkey !== address) {
        state.lastEntry = null; state.lastEntrySig = ""; state.lastEntrySlot = null;
        state.lastRunRecord = ""; state.lastVerify = null;
      }
      state.pubkey = address;
      $("rh-wallet-help")?.close?.();
      syncPOHPContext();
      status(`ROBINHOOD: connected ${address.slice(0, 6)}…${address.slice(-4)}`);
      return true;
    } catch (error) {
      console.error(`Robinhood wallet connection failed at ${stage}`, error);
      status(walletConnectionFailureStatus(stage, error, injected));
      return false;
    } finally {
      walletConnectionInProgress = false;
      setConnectButtonBusy(false);
    }
  }

  function connectWallet() {
    if (walletConnectionPromise) {
      status("ROBINHOOD: finish the open wallet request…");
      return walletConnectionPromise;
    }
    walletConnectionPromise = connectWalletOnce().finally(() => {
      walletConnectionPromise = null;
    });
    return walletConnectionPromise;
  }

  async function inspectContract() {
    const address = contractAddress();
    const provider = getReadProvider();
    const code = await provider.getCode(address);
    if (code === "0x") throw new Error(`game contract is not deployed on ${cfg().chainName}`);
    const contract = new (ethersApi().Contract)(address, contractAbi(), provider);
    const [feeWei, verifier, paused, seasonId, scoreTarget] = await Promise.all([
      isV3() ? contract.currentEntryFee() : contract.entryFeeWei(),
      contract.verifier(),
      contract.paused(),
      contract.activeSeasonId(),
      isV3() ? Promise.resolve(0n) : contract.scoreTarget(),
    ]);
    const feeNumber = requireSafeInteger(feeWei, "entry fee");
    if (feeNumber <= 0) throw new Error("on-chain entry fee is invalid");
    if (paused) throw new Error("Robinhood game contract is paused");
    if (!isV3() && Number(seasonId) !== Number(cfg().seasonId || 1)) throw new Error("Robinhood season does not match this client");
    const season = isV3() ? await contract.seasons(seasonId) : null;
    if (isV3()) cfg().seasonId = Number(seasonId);
    const configuredVerifier = String(cfg().verifierAddress || "");
    if (configuredVerifier && ethersApi().getAddress(configuredVerifier) !== ethersApi().getAddress(verifier)) {
      throw new Error("configured verifier does not match the Robinhood contract");
    }
    cfg().feeWei = feeWei.toString();
    cfg().feeLamports = feeNumber;
    syncPOHPContext();
    return {
      address,
      contract,
      feeWei: BigInt(feeWei),
      feeNumber,
      verifier: ethersApi().getAddress(verifier),
      seasonId: Number(seasonId),
      scoreTarget: BigInt(season?.baseTarget ?? scoreTarget),
      season,
    };
  }

  function pendingEntryStorageKey() {
    return `${PENDING_ENTRY_STORAGE_PREFIX}:${Number(cfg().chainId)}:${String(cfg().contractAddress || "").toLowerCase()}:${state.pubkey.toLowerCase()}`;
  }

  function entrySignatureFromUrl() {
    try {
      const signature = new URLSearchParams(window.location?.search || "").get("entry_sig") || "";
      return /^0x[0-9a-fA-F]{64}$/.test(signature) ? signature.toLowerCase() : "";
    } catch (_) {
      return "";
    }
  }

  function clearEntrySignatureFromUrl() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("entry_sig")) return;
      url.searchParams.delete("entry_sig");
      window.history.replaceState({}, "", url.toString());
    } catch (_) {}
  }

  function readPendingEntry(feeWei) {
    const fromUrl = entrySignatureFromUrl();
    if (fromUrl) return { hash: fromUrl, feeWei: feeWei.toString(), createdAt: 0, source: "url" };
    try {
      const raw = localStorage.getItem(pendingEntryStorageKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(parsed.hash || ""))) return null;
      if (!isV3() && String(parsed.feeWei || "") !== feeWei.toString()) return null;
      return { ...parsed, hash: String(parsed.hash).toLowerCase(), source: "storage" };
    } catch (_) {
      return null;
    }
  }

  function writePendingEntry(entry) {
    try {
      localStorage.setItem(pendingEntryStorageKey(), JSON.stringify({
        hash: String(entry.hash || "").toLowerCase(),
        feeWei: String(entry.feeWei || ""),
        ...(entry.entryId ? { entryId: entry.entryId } : {}),
        createdAt: asInt(entry.createdAt, Date.now()),
      }));
    } catch (_) {}
  }

  function clearPendingEntry() {
    try { localStorage.removeItem(pendingEntryStorageKey()); } catch (_) {}
    clearEntrySignatureFromUrl();
  }

  async function landedEntry(provider, hash, feeWei, allowConsumed = false) {
    const receipt = await provider.getTransactionReceipt(hash);
    if (!receipt) return null;
    if (Number(receipt.status) !== 1) throw new Error("saved Robinhood entry transaction reverted");
    const transaction = await provider.getTransaction(hash);
    if (!transaction) throw new Error("saved Robinhood entry transaction is unavailable");
    if (ethersApi().getAddress(transaction.from) !== state.pubkey) throw new Error("saved entry belongs to another wallet");
    if (!transaction.to || ethersApi().getAddress(transaction.to) !== contractAddress()) throw new Error("saved entry targeted another contract");
    if (!isV3() && BigInt(transaction.value) !== feeWei) throw new Error("saved entry amount does not match the current fee");
    const selector = ethersApi().id("depositEntryFee()").slice(0, 10).toLowerCase();
    if (String(transaction.data || "0x").slice(0, 10).toLowerCase() !== selector) throw new Error("saved entry did not call depositEntryFee");

    const entryInterface = new (ethersApi().Interface)(contractAbi());
    if (isV3()) {
      const events = (receipt.logs || []).filter(log => validWalletAddress(log.address) === contractAddress())
        .map(log => { try { return entryInterface.parseLog(log); } catch (_) { return null; } })
        .filter(event => event?.name === "EntryPaid");
      if (events.length !== 1) throw new Error("saved entry is missing one canonical EntryPaid event");
      const event = events[0].args;
      const contract = new (ethersApi().Contract)(contractAddress(), V3_ABI, provider);
      const [entry, timeout, block] = await Promise.all([
        contract.entries(event.entryId), contract.entryTimeout(), provider.getBlock("latest"),
      ]);
      if (validWalletAddress(event.player) !== state.pubkey || validWalletAddress(entry.player) !== state.pubkey
          || BigInt(event.amount) !== BigInt(transaction.value) || BigInt(entry.amount) !== BigInt(event.amount)
          || BigInt(entry.expiresAt) !== BigInt(event.expiresAt) || Number(entry.seasonId) !== Number(event.seasonId)) {
        throw new Error("saved entry receipt does not match the contract entry");
      }
      const startedAt = requireSafeInteger(entry.startedAt, "entry start time");
      const expiresAt = requireSafeInteger(startedAt ? entry.startedAt + timeout : entry.expiresAt, "entry deadline");
      if (entry.refunded) throw new Error("saved entry was refunded");
      if (!allowConsumed && (entry.consumed || Number(block.timestamp) > expiresAt)) {
        throw new Error(entry.consumed ? "saved entry was already consumed" : "saved entry expired; recover it from Account before paying again");
      }
      return { hash: hash.toLowerCase(), block: requireSafeInteger(receipt.blockNumber, "entry block"),
        l2Block: Number(receipt.blockNumber), feeWei: BigInt(entry.amount), entryId: String(event.entryId).toLowerCase(),
        seasonId: Number(entry.seasonId), startedAt, expiresAt, consumed: entry.consumed,
        finalHumanPremium: entry.finalHumanPremium };
    }
    let canonicalEntryBlock = 0;
    for (const log of receipt.logs || []) {
      try {
        if (ethersApi().getAddress(log.address) !== contractAddress()) continue;
        const parsed = entryInterface.parseLog(log);
        if (parsed?.name !== "EntryPaid") continue;
        if (ethersApi().getAddress(parsed.args.player) !== state.pubkey) continue;
        if (BigInt(parsed.args.amount) !== feeWei) continue;
        canonicalEntryBlock = requireSafeInteger(parsed.args.entryBlock, "entry event block");
        if (canonicalEntryBlock <= 0) throw new Error("entry event block is invalid");
        requireSafeInteger(parsed.args.entryNumber, "entry number");
        break;
      } catch (_) {}
    }
    if (!canonicalEntryBlock) throw new Error("saved entry is missing the canonical EntryPaid event");
    return {
      hash: hash.toLowerCase(),
      block: canonicalEntryBlock,
      l2Block: requireSafeInteger(receipt.blockNumber, "receipt block"),
      feeWei,
    };
  }

  async function recoverPendingEntry(provider, feeWei) {
    const pending = readPendingEntry(feeWei);
    if (!pending) return null;
    status("ROBINHOOD: checking previous paid entry…");
    try {
      const landed = await landedEntry(provider, pending.hash, feeWei);
      if (!landed) throw new Error("previous entry is still awaiting chain confirmation; no new payment was requested");
      writePendingEntry({ ...landed, feeWei: landed.feeWei.toString(), createdAt: pending.createdAt || Date.now() });
      state.lastEntrySig = landed.hash;
      state.lastEntrySlot = landed.block;
      state.lastEntry = landed;
      syncPOHPContext();
      status(`ROBINHOOD: paid entry recovered ✓ ${landed.hash.slice(0, 8)}…${landed.hash.slice(-6)}`);
      return { sig: landed.hash, slot: landed.block, feeLamports: requireSafeInteger(landed.feeWei, "entry fee"),
        feeWei: landed.feeWei.toString(), entry_id: landed.entryId, season_id: landed.seasonId };
    } catch (error) {
      if (/reverted|already consumed|was refunded/i.test(String(error?.message || ""))) clearPendingEntry();
      throw error;
    }
  }

  function entryFailureMessage(error) {
    const code = walletErrorCode(error);
    if (code === 4001 || error?.code === "ACTION_REJECTED") return "wallet request cancelled";
    if (code === -32002) return `finish the open ${walletProviderName()} request, then retry`;
    if (code === -32603 && injectedProvider()?.isPhantom) {
      return "Phantom rejected Robinhood Chain submission — use MetaMask or Robinhood Wallet";
    }
    const message = walletErrorMessage(error);
    if (/insufficient funds/i.test(message) && state.pubkey) {
      const entryFee = ethersApi().formatEther(BigInt(cfg().feeWei || 0));
      return `insufficient test ETH — fund ${state.pubkey} (entry ${entryFee} ETH + gas)`;
    }
    return message;
  }

  function contractFailureMessage(error) {
    const explain = name => isV3() && V3_ERROR_MESSAGES[name] || String(name);
    if (error?.revert?.name) return explain(error.revert.name);
    const candidates = [
      error?.data,
      error?.info?.error?.data,
      error?.error?.data,
      error?.info?.error?.error?.data,
    ];
    const contractInterface = new (ethersApi().Interface)(contractAbi());
    for (const candidate of candidates) {
      // eth_estimateGas providers wrap EVM revert bytes differently. Read only
      // structured hex data, never a provider's arbitrary error message as code.
      for (const data of [candidate, candidate?.data, candidate?.result]) {
        if (typeof data !== "string" || data.length > 8194 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(data)) continue;
        try {
          const decoded = contractInterface.parseError(data);
          if (decoded?.name) return explain(decoded.name);
        } catch (_) {}
      }
    }
    return entryFailureMessage(error);
  }

  function walletTransactionIntent() {
    const from = validWalletAddress(state.pubkey);
    const chainId = normalizedChainId(cfg().chainIdHex || cfg().chainId);
    if (!from || !/^0x[0-9a-f]+$/.test(chainId) || BigInt(chainId) <= 0n) throw new Error("Invalid wallet transaction context");
    return Object.freeze({ from, chainId, provider: injectedProvider() });
  }

  function assertWalletIntent(intent) {
    if (!intent?.provider || intent.provider !== injectedProvider()
        || validWalletAddress(state.pubkey) !== intent.from) throw new Error("connected account changed; review the action again");
    if (normalizedChainId(cfg().chainIdHex || cfg().chainId) !== intent.chainId) throw new Error("configured chain changed; review the action again");
  }

  async function preflightContractTransaction(request, label, walletIntent = walletTransactionIntent()) {
    try {
      assertWalletIntent(walletIntent);
      if (validWalletAddress(request.from) !== walletIntent.from) throw new Error("connected account changed");
      const estimatedGas = await getReadProvider().estimateGas(request);
      const gasLimit = estimatedGas + (estimatedGas / 3n) + 30000n;
      if (gasLimit <= 0n || gasLimit > 2000000n) throw new Error(`${label} gas estimate is outside the safe range`);
      assertWalletIntent(walletIntent);
      return { estimatedGas, gasLimit, walletIntent };
    } catch (error) {
      throw new Error(`on-chain preflight rejected: ${contractFailureMessage(error)}`);
    }
  }

  async function sendWalletTransaction({ to, data, value = 0n, gasLimit, walletIntent }) {
    assertWalletIntent(walletIntent);
    const provider = walletIntent.provider;
    const rpcProvider = getReadProvider();
    const feeData = await rpcProvider.getFeeData();
    let gasPrice = feeData.gasPrice;
    if (gasPrice == null) {
      const rpcGasPrice = await rpcProvider.send("eth_gasPrice", []);
      gasPrice = BigInt(rpcGasPrice);
    }
    if (gasPrice <= 0n) throw new Error("RPC did not return a usable gas price");
    // Recheck after all gas/fee awaits. Never substitute a newly selected account.
    const [chainId, accounts] = await Promise.all([
      provider.request({ method: "eth_chainId" }), readAuthorizedAccounts(provider),
    ]);
    assertWalletIntent(walletIntent);
    if (normalizedChainId(chainId) !== walletIntent.chainId) throw new Error("wallet chain changed; review the action again");
    if (validWalletAddress(accounts[0]) !== walletIntent.from) throw new Error("connected account changed; review the action again");
    const rpcTransaction = {
      from: walletIntent.from,
      chainId: walletIntent.chainId,
      to,
      data,
      value: ethersApi().toQuantity(value),
      gasPrice: ethersApi().toQuantity(gasPrice),
      type: "0x0",
    };
    if (provider.isPhantom) rpcTransaction.gasLimit = ethersApi().toQuantity(gasLimit);
    else rpcTransaction.gas = ethersApi().toQuantity(gasLimit);

    const submitted = await provider.request({
      method: "eth_sendTransaction",
      params: [rpcTransaction],
    });
    const hash = typeof submitted === "string" ? submitted : submitted?.hash;
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(hash || ""))) throw new Error("wallet returned an invalid transaction hash");
    return String(hash).toLowerCase();
  }

  async function waitForWalletReceipt(hash, timeoutMs = 90000) {
    const receipt = await getReadProvider().waitForTransaction(hash, 1, timeoutMs);
    if (!receipt) throw new Error(`transaction confirmation timed out — check ${hash}`);
    return receipt;
  }

  async function preflightVerifiedRun(pool, claim, verifierSignature, playerName, walletIntent) {
    const contractInterface = new (ethersApi().Interface)(contractAbi());
    const data = contractInterface.encodeFunctionData("submitVerifiedRun", isV3() ? [claim, verifierSignature] : [claim, verifierSignature, playerName]);
    const request = { from: state.pubkey, to: pool.address, data };
    const gas = await preflightContractTransaction(request, "leaderboard", walletIntent);
    return { ...gas, data };
  }

  async function payEntryFee(extra = {}) {
    try {
      let walletIntent = state.connected ? walletTransactionIntent() : null;
      if (!window.GKDWeb3Preflight?.ensure) throw new Error('Secure entry check is unavailable.');
      await window.GKDWeb3Preflight.ensure(cfg(), extra);
      const pool = await inspectContract();
      if (!state.connected) {
        const connected = await connectWallet();
        if (!connected) return null;
      }
      walletIntent ||= walletTransactionIntent();
      await switchToConfiguredNetwork();
      const recovered = await recoverPendingEntry(getReadProvider(), pool.feeWei);
      if (recovered) return recovered;

      const contractInterface = new (ethersApi().Interface)(contractAbi());
      const data = contractInterface.encodeFunctionData("depositEntryFee", []);
      status("ROBINHOOD: preflighting entry payment…");
      const { gasLimit } = await preflightContractTransaction({
        from: state.pubkey,
        to: pool.address,
        data,
        value: pool.feeWei,
      }, "entry", walletIntent);
      status("ROBINHOOD: review entry payment in wallet…");
      const transactionHash = await sendWalletTransaction({
        to: pool.address,
        data,
        value: pool.feeWei,
        gasLimit,
        walletIntent,
      });
      writePendingEntry({ hash: transactionHash, feeWei: pool.feeWei.toString(), createdAt: Date.now() });
      status("ROBINHOOD: confirming entry transaction…");
      let receipt;
      try {
        receipt = await waitForWalletReceipt(transactionHash);
      } catch (waitError) {
        receipt = await getReadProvider().getTransactionReceipt(transactionHash);
        if (!receipt) throw new Error("entry confirmation timed out; the paid transaction was saved — do not approve another payment yet");
        if (Number(receipt.status) !== 1) {
          clearPendingEntry();
          throw waitError;
        }
      }
      if (!receipt || Number(receipt.status) !== 1) {
        clearPendingEntry();
        throw new Error("entry transaction reverted");
      }

      const landed = await landedEntry(getReadProvider(), transactionHash, pool.feeWei);
      if (!landed) throw new Error("confirmed entry transaction is unavailable");
      state.lastEntrySig = landed.hash;
      state.lastEntrySlot = landed.block;
      state.lastEntry = landed;
      writePendingEntry({ ...landed, feeWei: landed.feeWei.toString(), createdAt: Date.now() });
      syncPOHPContext();
      status(`ROBINHOOD: entry paid ✓ ${transactionHash.slice(0, 8)}…${transactionHash.slice(-6)}`);
      return {
        sig: state.lastEntrySig,
        slot: state.lastEntrySlot,
        feeLamports: pool.feeNumber,
        feeWei: pool.feeWei.toString(),
        entry_id: landed.entryId,
        season_id: landed.seasonId,
      };
    } catch (error) {
      console.error("Robinhood entry fee failed", error);
      status(`ROBINHOOD: entry blocked — ${entryFailureMessage(error)}`);
      return null;
    }
  }

  function cleanLedgerEvent(raw = {}) {
    return {
      event_seq: asInt(raw.event_seq, state.ledger.event_seq + 1),
      type: String(raw.type || ""),
      frame: asInt(raw.frame, 0),
      wave: Math.max(1, asInt(raw.wave, 1)),
      lives: asInt(raw.lives, 0),
      enemy_id: String(raw.enemy_id || ""),
      enemy_type: String(raw.enemy_type || ""),
      enemy_state: String(raw.enemy_state || ""),
      points: asInt(raw.points, 0),
      client_score: asInt(raw.client_score, raw.score ?? -1),
      client_event_hash: String(raw.client_event_hash || ""),
    };
  }

  async function computeChallengeResponse(event) {
    const clean = cleanLedgerEvent(event);
    const challenge = state.ledger.challenge || {};
    return sha256Hex(stableStringify({
      v: LEDGER_VERSION,
      ticket_id: String(state.ledger.run_ticket_id || ""),
      challenge_nonce: String(challenge.nonce || ""),
      prev_event_chain: String(state.ledger.ledger_root || ZERO_CHAIN),
      event_seq: clean.event_seq,
      type: clean.type,
      frame: clean.frame,
      wave: clean.wave,
      lives: clean.lives,
      enemy_id: clean.enemy_id,
      enemy_type: clean.enemy_type,
      enemy_state: clean.enemy_state,
      points: clean.points,
      client_score: clean.client_score,
      client_event_hash: clean.client_event_hash,
    }));
  }

  async function startLedgerRun(extra = {}) {
    const { runAuthUrl, runStartUrl } = getBackendCfg();
    const chain = cfg();
    if (!chain.enabled || !runStartUrl) return null;
    if (!state.connected) {
      const connected = await connectWallet();
      if (!connected) return null;
    }
    if (!runAuthUrl) throw new Error("run authentication endpoint is missing");
    if (!state.lastEntrySig) throw new Error("paid entry transaction is missing");

    status("ROBINHOOD: preparing free run authorization…");
    const authChallenge = await postJSON(runAuthUrl, {
      chain_kind: "robinhood",
      chain_id: Number(chain.chainId),
      player_pubkey: state.pubkey,
      entry_sig: state.lastEntrySig,
    });
    if (!authChallenge || authChallenge.ok !== true) throw new Error(authChallenge?.error || "run authentication challenge failed");
    if (ethersApi().getAddress(authChallenge.player_pubkey) !== state.pubkey) throw new Error("run authentication wallet mismatch");
    if (String(authChallenge.entry_sig || "").toLowerCase() !== state.lastEntrySig) throw new Error("run authentication entry mismatch");
    if (Number(authChallenge.chain_id) !== Number(chain.chainId)) throw new Error("run authentication chain mismatch");
    const authMaterial = String(authChallenge.material || "");
    const authChallengeId = String(authChallenge.challenge_id || "");
    if (!authMaterial || !authChallengeId) throw new Error("run authentication challenge is incomplete");

    status("ROBINHOOD: sign free run authorization in wallet…");
    const signer = await getBrowserProvider().getSigner();
    const authSignature = await signer.signMessage(authMaterial);
    const payload = {
      chain_kind: "robinhood",
      chain_id: Number(chain.chainId),
      player_pubkey: state.pubkey,
      game_id: chain.gameId || extra.game_id || "420_HIGH_SCORE_GALAXIAN",
      season_id: (isV3() ? state.lastEntry?.seasonId : null) || chain.seasonId || 1,
      client_ruleset: extra.client_ruleset || extra.game_version || "",
      client_capabilities: ['wave_roster_v1', ...(chain.simulationProtocol ? ['fixed_step_v1'] : [])],
      ...(chain.simulationProtocol ? { simulation_play_mode: window.GKD_WEB3_MOBILE ? 'mobile_analog_v1' : 'pc_keys_v1', simulation_ruleset_hash: chain.simulationRulesetHash } : {}),
      lives: asInt(extra.lives, 3),
      entry_sig: state.lastEntrySig,
      entry_slot: asInt(state.lastEntrySlot, 0),
      fee_lamports: requireSafeInteger(isV3() ? state.lastEntry?.feeWei : chain.feeWei, "entry fee"),
      ...(isV3() ? { entry_id: state.lastEntry?.entryId, contract_version: 3 } : {}),
      auth_challenge_id: authChallengeId,
      auth_signature: authSignature,
    };

    status("ROBINHOOD: starting live ledger…");
    const started = await postJSON(runStartUrl, payload);
    if (!started || started.ok !== true) throw new Error(started?.error || "run/start failed");
    if (isV3()) {
      if (String(started.entry_id || "").toLowerCase() !== state.lastEntry.entryId
          || Number(started.season_id) !== state.lastEntry.seasonId || Number(started.event_seq) !== 0
          || Number(started.entry_started_at) <= 0) throw new Error("run start did not confirm this new V3 entry");
      // Confirm the committed fee on-chain before permitting gameplay; a lost acknowledgement
      // retains the same pending entry and must retry the server's durable seq-0 reservation.
      const committed = await landedEntry(getReadProvider(), state.lastEntrySig, state.lastEntry.feeWei);
      if (!committed?.startedAt || committed.startedAt !== Number(started.entry_started_at)) {
        throw new Error("V3 entry start is not confirmed on-chain");
      }
      state.lastEntry = committed;
    }
    state.lastEntrySlot = requireSafeInteger(started.entry_slot ?? state.lastEntrySlot, "canonical entry block");
    if (state.lastEntrySlot <= 0) throw new Error("canonical entry block is missing");
    if (chain.simulationProtocol) {
      const simulation = started.simulation;
      if (!simulation || simulation.protocol !== chain.simulationProtocol || simulation.ruleset_hash !== chain.simulationRulesetHash
        || simulation.play_mode !== payload.simulation_play_mode || simulation.tick_ms !== 16 || simulation.initial_state !== 'fresh_run_v1'
        || !Number.isInteger(simulation.seed) || simulation.seed < 0 || simulation.seed > 0xffffffff || !window.POHP?.setSimulationSession) throw new Error('Server simulation session is missing or incompatible.');
      window.POHP.setSimulationSession(simulation);
    } else if (started.simulation) throw new Error('This game build cannot use the returned simulation session.');
    state.ledger.active = true;
    state.ledger.finalized = false;
    state.ledger.run_ticket_id = String(started.run_ticket_id || "");
    state.ledger.event_seq = asInt(started.event_seq, 0);
    state.ledger.accepted_score = asInt(started.accepted_score, 0);
    state.ledger.ledger_root = String(started.ledger_root || ZERO_CHAIN);
    state.ledger.challenge = started.challenge || null;
    state.ledger.lastStart = started;
    state.ledger.lastEvent = null;
    state.ledger.lastFinalize = null;
    state.ledger.lastError = "";
    state.ledger.integrityFailed = false;
    state.ledger.scoreIntegrityFailed = false;
    state.ledger.rejectedEvents = [];
    state.ledger.queue = Promise.resolve();
    syncPOHPContext();
    status("ROBINHOOD: live ledger started ✅");
    return started;
  }

  async function ensureEntryPaid(extra = {}) {
    syncPOHPContext();
    if (!cfg().enabled) return true;
    const entry = await payEntryFee(extra);
    if (!entry) return false;
    try {
      const started = await startLedgerRun(extra);
      if (started) clearPendingEntry();
      return !!started;
    } catch (error) {
      if (/already bound to another run/i.test(String(error?.message || ""))) clearPendingEntry();
      status(`ROBINHOOD: run ledger start blocked — ${String(error?.message || error)}`);
      return false;
    }
  }

  function enqueueLedgerTask(task) {
    const run = state.ledger.queue.then(task, task);
    state.ledger.queue = run.catch(() => {});
    return run;
  }

  async function submitLedgerEvent(event = {}) {
    const { runEventUrl } = getBackendCfg();
    if (!state.ledger.active || state.ledger.finalized || !runEventUrl) return null;
    if (!state.ledger.run_ticket_id || !state.ledger.challenge) return null;
    return enqueueLedgerTask(async () => {
      const clean = cleanLedgerEvent({ ...event, event_seq: state.ledger.event_seq + 1 });
      const scoreBefore = state.ledger.accepted_score;
      const payload = {
        run_ticket_id: state.ledger.run_ticket_id,
        ...clean,
        challenge_response: await computeChallengeResponse(clean),
      };
      const accepted = await postJSON(runEventUrl, payload);
      if (!accepted || accepted.ok !== true) throw new Error(accepted?.error || "run/event failed");
      state.ledger.event_seq = asInt(accepted.event_seq, state.ledger.event_seq + 1);
      state.ledger.accepted_score = asInt(accepted.accepted_score, state.ledger.accepted_score);
      state.ledger.ledger_root = String(accepted.ledger_root || state.ledger.ledger_root || ZERO_CHAIN);
      state.ledger.challenge = accepted.next_challenge || null;
      state.ledger.lastEvent = accepted;
      const expectedScore = scoreBefore + Math.max(0, clean.points);
      if (clean.points > 0 && state.ledger.accepted_score !== expectedScore) {
        throw new Error(`Score acknowledgement mismatch for ${clean.type}: expected ${expectedScore}, got ${state.ledger.accepted_score}`);
      }
      return accepted;
    }).catch((error) => {
      const message = String(error?.message || error);
      state.ledger.lastError = message;
      state.ledger.integrityFailed = true;
      if (Math.max(0, asInt(event.points, 0)) > 0) state.ledger.scoreIntegrityFailed = true;
      const rejected = {
        type: String(event.type || "unknown"),
        frame: asInt(event.frame, 0),
        wave: asInt(event.wave, 0),
        points: asInt(event.points, 0),
        error: message,
      };
      state.ledger.rejectedEvents.push(rejected);
      try { localStorage.setItem("GKD_LEDGER_ERRORS", JSON.stringify(state.ledger.rejectedEvents)); } catch (_) {}
      status(`LEDGER: ${rejected.type} rejected — ${message}`);
      return null;
    });
  }

  async function finalizeLedgerRun(finalInput = {}) {
    const { runFinalizeUrl } = getBackendCfg();
    if (!state.ledger.active || state.ledger.finalized || !runFinalizeUrl) return null;
    if (!state.ledger.run_ticket_id || !state.ledger.challenge) return null;
    return enqueueLedgerTask(async () => {
      // A rejected zero-point event (heartbeat, shot, checkpoint) never changed the verifier's
      // state and the events after it were still accepted, so the run finalizes at the score
      // the verifier accepted. A rejected scoring event means the scores diverged: stop here.
      if (state.ledger.scoreIntegrityFailed) {
        const failed = state.ledger.rejectedEvents.find(event => event.points > 0) || state.ledger.rejectedEvents[0];
        throw new Error(`Ledger event ${failed?.type || "unknown"} was rejected at wave ${failed?.wave || 0}, frame ${failed?.frame || 0}: ${failed?.error || state.ledger.lastError}`);
      }
      const clean = cleanLedgerEvent({
        type: "finalize",
        event_seq: state.ledger.event_seq + 1,
        frame: asInt(finalInput.frame, 0),
        wave: asInt(finalInput.wave, 1),
        lives: asInt(finalInput.lives, 0),
        points: 0,
        client_score: asInt(finalInput.client_score, finalInput.final_score ?? state.ledger.accepted_score),
        client_event_hash: String(finalInput.client_event_hash || ""),
      });
      const payload = {
        run_ticket_id: state.ledger.run_ticket_id,
        ...clean,
        challenge_response: await computeChallengeResponse(clean),
      };
      status("ROBINHOOD: finalizing score ledger…");
      const finalized = await postJSON(runFinalizeUrl, payload);
      if (!finalized || finalized.ok !== true) throw new Error(finalized?.error || "run/finalize failed");
      state.ledger.finalized = true;
      state.ledger.active = false;
      state.ledger.event_seq = asInt(finalized.event_seq, state.ledger.event_seq + 1);
      state.ledger.accepted_score = asInt(finalized.accepted_score, state.ledger.accepted_score);
      state.ledger.ledger_root = String(finalized.ledger_root || state.ledger.ledger_root || ZERO_CHAIN);
      state.ledger.lastFinalize = finalized;
      state.ledger.lastError = "";
      status(`ROBINHOOD: ledger finalized ✅ score ${state.ledger.accepted_score}`);
      return finalized;
    }).catch((error) => {
      const message = String(error?.message || error);
      state.ledger.lastError = message;
      status(`LEDGER: finalize rejected — ${message}`);
      throw error;
    });
  }

  async function verifyRun(runPackage) {
    const { verifyUrl } = getBackendCfg();
    if (!verifyUrl) throw new Error("Missing CHAIN.verifyUrl");
    if (isV3()) {
      // Persist the exact signed display name with the retryable run package.
      let priorName = "";
      const nameKey = `${pendingEntryStorageKey()}:run-name:${expectedHex32(runPackage.run_hash, "run hash")}`;
      try { priorName = localStorage.getItem(nameKey) || ""; } catch (_) {}
      if (priorName && runPackage.player_name && priorName !== runPackage.player_name) throw new Error("This run already has a signed player name");
      runPackage.player_name = priorName || runPackage.player_name || playerNameBytes16();
      const entry = await landedEntry(getReadProvider(), runPackage.entry_sig, 0n, true);
      if (!entry || !entry.startedAt) throw new Error("V3 paid run has not started");
      if (runPackage.entry_id && String(runPackage.entry_id).toLowerCase() !== entry.entryId) throw new Error("V3 entry id mismatch");
      if (Number(runPackage.season_id) !== entry.seasonId || BigInt(runPackage.fee_lamports) !== entry.feeWei
          || Number(runPackage.entry_slot) !== entry.block) throw new Error("V3 run does not match its paid entry snapshot");
      runPackage.entry_id = entry.entryId;
      runPackage.contract_version = 3;
      try { localStorage.setItem(nameKey, runPackage.player_name); } catch (_) {}
    }
    status("ROBINHOOD: verifying…");
    const verified = await postJSON(verifyUrl, {
      ...runPackage,
      chain_kind: "robinhood",
      chain_id: Number(cfg().chainId),
    });
    if (!verified || verified.ok !== true) throw new Error(verified?.error || "verify failed");
    state.lastVerify = verified;
    try { localStorage.setItem("GKD_LAST_VERIFY_ROBINHOOD", JSON.stringify(verified)); } catch (_) {}
    status("ROBINHOOD: verified ✅");
    return verified;
  }

  function expectedHex32(value, label) {
    const text = String(value || "").replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${label} is not a 32-byte hash`);
    return `0x${text}`;
  }

  function playerNameBytes16() {
    const name = String(localStorage.getItem("gkd_playerName_v1") || "ANON");
    const encoded = new TextEncoder().encode(name);
    const output = new Uint8Array(16);
    output.set(encoded.slice(0, 16));
    return ethersApi().hexlify(output);
  }

  function decodePlayerName(value) {
    try {
      const bytes = ethersApi().getBytes(value);
      let end = bytes.indexOf(0);
      if (end < 0) end = bytes.length;
      return new TextDecoder().decode(bytes.slice(0, end)).trim();
    } catch (_) {
      return "";
    }
  }

  function rememberSubmission(transactionHash, runHash) {
    const receipt = { outcome: "recorded", submit_sig: transactionHash, run_record: runHash, run_hash: runHash,
      chain_kind: "robinhood", chain_id: Number(cfg().chainId), contract_address: contractAddress(),
      contract_version: Number(cfg().contractVersion || 2), player: state.pubkey, player_pubkey: state.pubkey };
    try { localStorage.setItem("GKD_LAST_SUBMIT_ROBINHOOD", JSON.stringify(receipt)); } catch (_) {}
    window.GKDRunReceipts?.rememberReceipt(receipt);
  }

  function recordedClaimMatches(record, claim) {
    if (isV3()) return ethersApi().TypedDataEncoder.hashStruct("VerifiedRun", V3_TYPES, record.claim)
      === ethersApi().TypedDataEncoder.hashStruct("VerifiedRun", V3_TYPES, claim);
    return validWalletAddress(record.player) === validWalletAddress(claim.player)
      && ["replayHash", "versionHash", "entryTxHash"].every(key => String(record[key]).toLowerCase() === String(claim[key]).toLowerCase())
      && ["seasonId", "score", "feeWei", "entryBlock"].every(key => BigInt(record[key]) === BigInt(claim[key]));
  }

  async function recoverRecordedRun(runPackage) {
    if (!isV3()) return null;
    if (!cfg().enabled) throw new Error("chain mode is disabled");
    if (!state.connected && !await connectWallet()) throw new Error("wallet connection is required");
    const identity = { player: state.pubkey, chainId: Number(cfg().chainId),
      contract: contractAddress(), rpcUrl: cfg().rpcUrl };
    const scope = runPackage?.chain_scope;
    if (!scope || scope.schema !== 1 || scope.chain_kind !== "robinhood"
        || scope.chain_id !== identity.chainId || scope.contract_version !== 3
        || validWalletAddress(scope.contract_address) !== identity.contract
        || validWalletAddress(scope.player_pubkey) !== identity.player
        || validWalletAddress(runPackage.player_pubkey) !== identity.player
        || runPackage.chain_kind !== "robinhood" || Number(runPackage.chain_id) !== identity.chainId
        || (runPackage.contract_version != null && Number(runPackage.contract_version) !== 3)) {
      throw new Error("Saved run does not belong to this wallet and deployment");
    }
    const runHash = expectedHex32(runPackage.run_hash, "run hash");
    const provider = getReadProvider();
    function assertIdentity() {
      if (!state.connected || state.pubkey !== identity.player || !cfg().enabled || !isV3()
          || Number(cfg().chainId) !== identity.chainId || contractAddress() !== identity.contract
          || cfg().rpcUrl !== identity.rpcUrl) throw new Error("Wallet or deployment changed during run recovery");
    }
    async function assertNetwork() {
      // getNetwork() is cached with staticNetwork:true; ask the actual RPC instead.
      const chainId = await provider.send("eth_chainId", []);
      assertIdentity();
      if (BigInt(chainId) !== BigInt(identity.chainId)) throw new Error("Recovery RPC returned another chain");
    }
    await assertNetwork();
    const contract = new (ethersApi().Contract)(identity.contract, V3_ABI, provider);
    const record = await contract.runs(runHash);
    assertIdentity();
    if (validWalletAddress(record.claim.player) === ethersApi().ZeroAddress) {
      await assertNetwork();
      return null;
    }
    // Settlement recovery uses the immutable record and original deposit. Pauses,
    // later seasons or verifier rotation cannot invalidate a completed record.
    const finalScore = runPackage.final_score;
    if (!Number.isSafeInteger(finalScore) || finalScore < 0
        || (runPackage.accepted_score != null && runPackage.accepted_score !== finalScore)) {
      throw new Error("Recorded run score does not match the saved final score");
    }
    let savedName = "";
    try { savedName = localStorage.getItem(`${pendingEntryStorageKey()}:run-name:${runHash}`) || ""; } catch (_) {}
    if (savedName && runPackage.player_name && savedName !== runPackage.player_name) {
      throw new Error("Recorded run player name differs from its saved signed name");
    }
    const playerName = savedName || runPackage.player_name;
    if (!/^0x[0-9a-fA-F]{32}$/.test(String(playerName || ""))) throw new Error("Saved signed player name is unavailable for run recovery");
    const entry = await landedEntry(provider, runPackage.entry_sig, 0n, true);
    assertIdentity();
    if (!entry || !entry.startedAt || !entry.consumed
        || (runPackage.entry_id && String(runPackage.entry_id).toLowerCase() !== entry.entryId)
        || entry.seasonId !== Number(runPackage.season_id) || entry.block !== Number(runPackage.entry_slot)
        || entry.feeWei !== BigInt(runPackage.fee_lamports)) {
      throw new Error("Recorded run does not match its paid entry snapshot");
    }
    const expected = { runHash, replayHash: expectedHex32(runPackage.replay_hash, "replay hash"),
      versionHash: expectedHex32(runPackage.version_hash, "version hash"), entryId: entry.entryId,
      player: identity.player, seasonId: entry.seasonId, score: finalScore, playerName };
    if (!recordedClaimMatches(record, expected)) throw new Error("Recorded run differs from the saved run package");
    await assertNetwork();
    state.lastRunRecord = runHash;
    rememberSubmission("", runHash);
    status("ROBINHOOD: confirmed existing score recovered ✅");
    return { already_recorded: true, recovered: true, run_record: runHash, submit_sig: "", score: finalScore };
  }

  async function submitVerifiedRun(runPackage, verifiedResult) {
    const chain = cfg();
    let walletIntent = state.connected ? walletTransactionIntent() : null;
    const verified = verifiedResult || state.lastVerify;
    if (!chain.enabled) throw new Error("chain mode is disabled");
    if (!verified || verified.ok !== true) throw new Error("run has not been verified");
    if (verified.chain_kind !== "robinhood" || Number(verified.chain_id) !== Number(chain.chainId)) {
      throw new Error("verifier returned proof for another chain");
    }
    if (!verified.evm_claim || !verified.evm_domain || !verified.evm_types || !verified.evm_signature) {
      throw new Error("verifier did not return the required EIP-712 proof");
    }
    if (!state.connected) {
      const connected = await connectWallet();
      if (!connected) throw new Error("wallet connection is required");
    }
    walletIntent ||= walletTransactionIntent();
    await switchToConfiguredNetwork();
    const pool = await inspectContract();
    const claim = verified.evm_claim;
    const runHash = expectedHex32(verified.run_hash || runPackage?.run_hash, "run_hash");
    const replayHash = expectedHex32(verified.replay_hash || runPackage?.replay_hash, "replay_hash");
    const versionHash = expectedHex32(runPackage?.version_hash, "version_hash");
    const player = ethersApi().getAddress(claim.player);
    if (player !== state.pubkey || ethersApi().getAddress(runPackage?.player_pubkey) !== state.pubkey) {
      throw new Error("connected wallet does not own this run");
    }
    if (String(claim.runHash).toLowerCase() !== runHash) throw new Error("EIP-712 run hash mismatch");
    if (String(claim.replayHash).toLowerCase() !== replayHash) throw new Error("EIP-712 replay hash mismatch");
    if (String(claim.versionHash).toLowerCase() !== versionHash) throw new Error("EIP-712 version hash mismatch");
    if (!isV3() && String(claim.entryTxHash).toLowerCase() !== String(runPackage?.entry_sig || "").toLowerCase()) throw new Error("EIP-712 entry transaction mismatch");
    if (!isV3() && Number(claim.entryBlock) !== asInt(runPackage?.entry_slot, -1)) throw new Error("EIP-712 entry block mismatch");
    if (Number(claim.seasonId) !== asInt(runPackage?.season_id, -1)) throw new Error("EIP-712 season mismatch");
    if (Number(claim.score) !== asInt(runPackage?.accepted_score, -1)) throw new Error("EIP-712 verified score mismatch");
    if (isV3()) {
      const entry = await landedEntry(getReadProvider(), runPackage?.entry_sig, 0n, true);
      if (!entry || !entry.startedAt || String(claim.entryId).toLowerCase() !== entry.entryId
          || (runPackage.entry_id && String(runPackage.entry_id).toLowerCase() !== entry.entryId)
          || entry.seasonId !== Number(claim.seasonId) || entry.block !== Number(runPackage.entry_slot)
          || entry.feeWei !== BigInt(runPackage.fee_lamports)) throw new Error("EIP-712 V3 paid entry snapshot mismatch");
      if (String(claim.playerName).toLowerCase() !== String(runPackage.player_name || playerNameBytes16()).toLowerCase()) {
        throw new Error("EIP-712 signed player name mismatch");
      }
      if (stableStringify(verified.evm_types) !== stableStringify(V3_TYPES)) throw new Error("EIP-712 V3 types mismatch");
      if (verified.evm_domain.name !== "Galaxy King Dog" || verified.evm_domain.version !== "3") throw new Error("EIP-712 V3 domain version/name mismatch");
    } else {
      if (BigInt(claim.feeWei) !== BigInt(runPackage?.fee_lamports ?? -1)) throw new Error("EIP-712 entry fee mismatch");
      if (BigInt(claim.feeWei) !== pool.feeWei) throw new Error("verified fee does not match the contract");
      if (BigInt(claim.score) < pool.scoreTarget) throw new Error("verified score is below the on-chain target");
    }

    const domain = verified.evm_domain;
    if (Number(domain.chainId) !== Number(chain.chainId)) throw new Error("EIP-712 domain chain mismatch");
    if (ethersApi().getAddress(domain.verifyingContract) !== pool.address) throw new Error("EIP-712 contract mismatch");
    const recoveredVerifier = ethersApi().getAddress(ethersApi().verifyTypedData(
      isV3() ? { name: "Galaxy King Dog", version: "3", chainId: Number(chain.chainId), verifyingContract: pool.address } : domain,
      isV3() ? V3_TYPES : verified.evm_types,
      claim,
      verified.evm_signature
    ));
    if (recoveredVerifier !== pool.verifier) throw new Error("verifier signature does not match the contract");

    const existing = await pool.contract.runs(runHash);
    if (ethersApi().getAddress(isV3() ? existing.claim.player : existing.player) !== ethersApi().ZeroAddress) {
      if (!recordedClaimMatches(existing, claim)) throw new Error("Recorded run differs from the signed claim");
      state.lastRunRecord = runHash;
      rememberSubmission("", runHash);
      status("ROBINHOOD: run already recorded ✅");
      return { already_recorded: true, run_record: runHash, submit_sig: "" };
    }

    const playerName = isV3() ? claim.playerName : playerNameBytes16();
    const { submitUrl } = getBackendCfg();
    if (submitUrl) {
      status("ROBINHOOD: securely relaying leaderboard record…");
      const relayed = await postJSON(submitUrl, {
        chain_kind: "robinhood",
        chain_id: Number(chain.chainId),
        evm_claim: claim,
        evm_signature: verified.evm_signature,
        player_name: playerName,
      });
      if (!relayed || relayed.ok !== true) throw new Error(relayed?.error || "secure relay failed");
      if (String(relayed.run_record || "").toLowerCase() !== runHash) {
        throw new Error("relay returned another run record");
      }
      if (!recordedClaimMatches(await pool.contract.runs(runHash), claim)) {
        throw new Error("Relay acknowledgement is not confirmed by the on-chain run; retry this score before paying again");
      }
      const transactionHash = String(relayed.submit_sig || "");
      state.lastSubmitSig = transactionHash;
      state.lastRunRecord = runHash;
      rememberSubmission(transactionHash, runHash);
      status(relayed.already_recorded
        ? "ROBINHOOD: run already recorded ✅"
        : `ROBINHOOD: score relayed on-chain ✅ ${transactionHash.slice(0, 8)}…${transactionHash.slice(-6)}`);
      await refreshLeaderboard();
      return {
        already_recorded: relayed.already_recorded === true,
        submit_sig: transactionHash,
        run_record: runHash,
        score: Number(claim.score),
        relayer: String(relayed.relayer || ""),
      };
    }

    status("ROBINHOOD: preflighting leaderboard record…");
    const { gasLimit, data } = await preflightVerifiedRun(pool, claim, verified.evm_signature, playerName, walletIntent);
    status("ROBINHOOD: sign leaderboard record in wallet…");
    let transactionHash;
    try {
      transactionHash = await sendWalletTransaction({ to: pool.address, data, gasLimit, walletIntent });
    } catch (error) {
      const code = walletErrorCode(error);
      if (code === 4001 || error?.code === "ACTION_REJECTED") throw new Error("wallet request cancelled");
      if (code === -32002) throw new Error("finish the open Phantom request, then use Retry Last Score");
      if (code === -32603 || /unexpected error/i.test(walletErrorMessage(error))) {
        throw new Error("Phantom submission error after successful preflight — close the popup and use Retry Last Score");
      }
      throw error;
    }
    status("ROBINHOOD: confirming leaderboard record…");
    const receipt = await waitForWalletReceipt(transactionHash);
    if (!receipt || Number(receipt.status) !== 1) throw new Error("submitVerifiedRun reverted");
    state.lastSubmitSig = transactionHash;
    state.lastRunRecord = runHash;
    rememberSubmission(transactionHash, runHash);
    status(`ROBINHOOD: score recorded on-chain ✅ ${transactionHash.slice(0, 8)}…${transactionHash.slice(-6)}`);
    await refreshLeaderboard();
    return {
      already_recorded: false,
      submit_sig: transactionHash,
      run_record: runHash,
      score: Number(claim.score),
    };
  }

  async function fetchLeaderboard() {
    if (!cfg().contractAddress) return null;
    try {
      const contract = new (ethersApi().Contract)(contractAddress(), contractAbi(), getReadProvider());
      const [entries, count] = await contract.getLeaderboard();
      return entries.slice(0, Number(count)).map((entry) => ({
        score: Number(entry.score),
        player: ethersApi().getAddress(entry.player),
        name: decodePlayerName(entry.name),
      }));
    } catch (error) {
      console.warn("Robinhood leaderboard read failed", error);
      return null;
    }
  }

  function escapeLeaderboardText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function renderLeaderboard(entries) {
    // The game's HI-SCORE on web3 pages is the best recorded on-chain score.
    window.GKDSetChainHighScore?.(entries?.length ? Number(entries[0].score) : 0);
    let element = $("gkd-leaderboard");
    // On the desktop page the list lives in the header's status box: as a floating panel it
    // covered the game's own SCORE and WAVE text. The phone page keeps the floating panel.
    const headerBox = document.body?.classList?.contains?.("web3-mobile") || typeof document.querySelector !== "function"
      ? null : document.querySelector("#chain-ui .box");
    if (!element) {
      element = document.createElement("div");
      element.id = "gkd-leaderboard";
      if (headerBox) {
        element.style.cssText = "flex-basis:100%;color:#35ff9a;font:12px 'Courier New',monospace;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;pointer-events:none";
        headerBox.style.flexWrap = "wrap";
        headerBox.appendChild(element);
      } else {
        element.style.cssText = "position:fixed;top:143px;left:10px;z-index:9998;background:rgba(0,0,0,.72);border:1px solid rgba(0,255,150,.28);border-radius:10px;padding:8px 12px;color:#35ff9a;font:12px 'Courier New',monospace;line-height:1.45;min-width:210px;pointer-events:none";
        document.body.appendChild(element);
      }
    }
    const medals = ["🥇", "🥈", "🥉"];
    if (element.parentElement !== document.body) {
      const line = entries?.length
        ? entries.map((entry, index) => `${medals[index] || `${index + 1}.`} ${entry.score} ${escapeLeaderboardText(entry.name || (entry.player ? `${entry.player.slice(0, 6)}…${entry.player.slice(-4)}` : ""))}`).join(" · ")
        : "no scores yet";
      element.innerHTML = `🏆 TOP 3 · ${line}`;
      return;
    }
    const rows = entries?.length
      ? entries.map((entry, index) => {
          const wallet = entry.player ? `${entry.player.slice(0, 6)}…${entry.player.slice(-4)}` : "";
          const who = escapeLeaderboardText(entry.name ? `${entry.name} (${wallet})` : wallet);
          return `<div>${medals[index] || `${index + 1}.`} ${entry.score} <span style="opacity:.85">${who}</span></div>`;
        }).join("")
      : "<div style='opacity:.7'>(no scores yet)</div>";
    element.innerHTML = `<div style="opacity:.9;margin-bottom:4px;letter-spacing:1px">🏆 ROBINHOOD TOP 3</div>${rows}`;
  }

  async function refreshLeaderboard() {
    const entries = await fetchLeaderboard();
    if (entries) renderLeaderboard(entries);
    return entries;
  }

  // Read-only account discovery never requests accounts, signatures, refunds or reward claims.
  async function getAccountStatus({ runHash, entryId } = {}) {
    if (!isV3()) return { supported: false, contractVersion: Number(cfg().contractVersion || 2),
      reason: "This deployment records scores; V3 rewards have not been migrated." };
    if (!state.connected || !state.pubkey) return { supported: true, contractVersion: 3, connected: false };
    const contract = new (ethersApi().Contract)(contractAddress(), V3_ABI, getReadProvider());
    const [seasonId, tokenAddress, nativeClaimable, paused, timeout, block] = await Promise.all([
      contract.activeSeasonId(), contract.token(), contract.claimable(state.pubkey),
      contract.paused(), contract.entryTimeout(), getReadProvider().getBlock("latest"),
    ]);
    const token = new (ethersApi().Contract)(tokenAddress, ["function balanceOf(address) view returns (uint256)"], getReadProvider());
    const [tokenBalance, season] = await Promise.all([token.balanceOf(state.pubkey), contract.seasons(seasonId)]);
    const targetFor = async value => value.cap > 0n ? contract.modeBTarget(value.baseTarget, value.minted, value.cap) : 0n;
    const output = { supported: true, contractVersion: 3, connected: true, player: state.pubkey,
      address: contractAddress(), tokenAddress, decimals: 9, tokenBalance: tokenBalance.toString(),
      nativeClaimable: nativeClaimable.toString(), paused, season: {
        id: Number(seasonId), cap: season.cap.toString(), minted: season.minted.toString(),
        target: (await targetFor(season)).toString(), closed: season.closed,
      }, entry: null, run: null };
    const pending = readPendingEntry(BigInt(cfg().feeWei || 0));
    let selectedEntry = entryId || state.lastEntry?.entryId || pending?.entryId;
    if (!selectedEntry && pending?.hash) {
      const landed = await landedEntry(getReadProvider(), pending.hash, 0n, true);
      selectedEntry = landed?.entryId;
    }
    if (selectedEntry) {
      const id = expectedHex32(selectedEntry, "entry id");
      const entry = await contract.entries(id);
      if (validWalletAddress(entry.player) === state.pubkey) {
        const startedAt = requireSafeInteger(entry.startedAt, "entry start time");
        const deadline = requireSafeInteger(startedAt ? entry.startedAt + timeout : entry.expiresAt, "entry deadline");
        const expired = Number(block.timestamp) > deadline;
        output.entry = { entryId: id, amount: entry.amount.toString(), seasonId: Number(entry.seasonId),
          startedAt, expiresAt: deadline, consumed: entry.consumed, refunded: entry.refunded,
          canRefund: !startedAt && expired && !entry.consumed && !entry.refunded,
          canExpire: !!startedAt && expired && !entry.consumed && !entry.refunded };
      }
    }
    let savedRun = "";
    try {
      const saved = JSON.parse(localStorage.getItem("GKD_LAST_SUBMIT_ROBINHOOD") || "null");
      if (Number(saved?.chain_id) === Number(cfg().chainId) && validWalletAddress(saved?.contract_address) === contractAddress()
          && validWalletAddress(saved?.player) === state.pubkey) savedRun = saved.run_record;
    } catch (_) {}
    const selectedRun = runHash || state.lastRunRecord || savedRun;
    if (selectedRun) {
      const id = expectedHex32(selectedRun, "run hash");
      const run = await contract.runs(id);
      if (validWalletAddress(run.claim.player) === state.pubkey) {
        const [runSeason, entry] = await Promise.all([contract.seasons(run.claim.seasonId), contract.entries(run.claim.entryId)]);
        const target = await targetFor(runSeason);
        const finalHuman = Number(run.claim.seasonId) === 32 && runSeason.cap - runSeason.minted <= 1000000000n;
        output.run = { runHash: id, score: run.claim.score.toString(), seasonId: Number(run.claim.seasonId),
          rewardMinted: run.rewardMinted, worldRecordBroken: run.worldRecordBroken, target: target.toString(),
          canClaimFarm: !paused && !run.rewardMinted && !runSeason.closed && runSeason.minted < runSeason.cap
            && run.claim.score >= target && (!finalHuman || (run.worldRecordBroken && entry.finalHumanPremium)) };
      }
    }
    return output;
  }

  // Amounts stay decimal strings; every read uses one block so liabilities can be compared.
  async function optionalBuybackRead(call) {
    try { return await call(); }
    catch (error) {
      // Older V3 deployments have no buyback selectors. Network failures must still
      // propagate, rather than presenting an unavailable balance as zero.
      if (error?.code === "CALL_EXCEPTION" && (error.data === "0x" || error.data == null)
          && !error.reason && (!error.action || error.action === "call")) return null;
      throw error;
    }
  }

  async function getPoolStatus() {
    if (!isV3()) return { supported: false, contractVersion: Number(cfg().contractVersion || 2) };
    const provider = getReadProvider();
    const block = await provider.getBlock("latest");
    const at = { blockTag: block.number };
    const contract = new (ethersApi().Contract)(contractAddress(), V3_ABI, provider);
    const names = ["gamePool", "charityPool", "carriedChaos", "pendingEscrow", "payoutReserves", "claimLiabilities", "voteReserves", "accountedBalance"];
    const values = await Promise.all(names.map(name => contract[name](at)));
    const [balance, humanBudget, chaosBudget, humanVote, chaosVote, activeSeasonId, paused, milestonesAddress, recordBreakCount, buybackReserve, configurationSealed] = await Promise.all([
      provider.getBalance(contractAddress(), block.number), contract.charityGateBudgets(0, at), contract.charityGateBudgets(1, at),
      contract.lastGateVote(0, at), contract.lastGateVote(1, at), contract.activeSeasonId(at), contract.paused(at), contract.milestones(at), contract.recordBreakCount(at),
      optionalBuybackRead(() => contract.buybackReserve(at)),
      optionalBuybackRead(() => contract.configurationSealed(at)),
    ]);
    const pools = Object.fromEntries(names.map((name, i) => [name, values[i].toString()]));
    const liabilities = values[7];
    const activeSeason = await contract.seasons(activeSeasonId, at);
    const currentTarget = activeSeason.cap > 0n
      ? await contract.modeBTarget(activeSeason.baseTarget, activeSeason.minted, activeSeason.cap, at) : 0n;
    return { supported: true, contractVersion: 3, address: contractAddress(), chainId: Number(cfg().chainId),
      blockNumber: block.number, nativeDecimals: 18, ...pools, balance: balance.toString(),
      buybackReserve: buybackReserve == null ? null : buybackReserve.toString(),
      configurationSealed: configurationSealed == null ? null : configurationSealed,
      fullyBacked: balance >= liabilities, unassignedSurplus: (balance >= liabilities ? balance - liabilities : 0n).toString(),
      activeSeasonId: Number(activeSeasonId), paused, milestonesAddress, recordBreakCount: recordBreakCount.toString(),
      season: { id: Number(activeSeasonId), cap: activeSeason.cap.toString(), minted: activeSeason.minted.toString(),
        baseTarget: activeSeason.baseTarget.toString(), target: currentTarget.toString(), closed: activeSeason.closed },
      charity: { humanBudget: humanBudget.toString(), chaosBudget: chaosBudget.toString(), humanVoteId: humanVote.toString(), chaosVoteId: chaosVote.toString(), humanFrozen: humanVote > 0n } };
  }

  // A bounded recent-event window and fixed-block state, never a wallet operation.
  async function getBuybackStatus() {
    if (!isV3()) return { supported: false };
    const provider = getReadProvider(), block = await provider.getBlock("latest");
    const at = { blockTag: block.number };
    const contract = new (ethersApi().Contract)(contractAddress(), V3_ABI, provider);
    const [reserve, executorAddress, count] = await Promise.all([
      optionalBuybackRead(() => contract.buybackReserve(at)),
      optionalBuybackRead(() => contract.buybackExecutor(at)),
      optionalBuybackRead(() => contract.buybackCount(at)),
    ]);
    if (reserve == null) return { supported: false };
    const result = { supported: true, configured: false, blockNumber: block.number, reserveWei: reserve.toString(),
      count: count == null ? null : count.toString(), history: [], historyFromBlock: Math.max(0, block.number - 499), historyToBlock: block.number };
    if (!executorAddress || /^0x0{40}$/i.test(executorAddress)) return result;
    const executor = new (ethersApi().Contract)(executorAddress,
      ["function token() view returns(address)", "function treasury() view returns(address)", "function game() view returns(address)"], provider);
    const [tokenAddress, treasuryAddress, boundGame] = await Promise.all([executor.token(at), executor.treasury(at), executor.game(at)]);
    if (validWalletAddress(boundGame) !== validWalletAddress(contractAddress()) || !validWalletAddress(tokenAddress)
        || !validWalletAddress(treasuryAddress) || /^0x0{40}$/i.test(tokenAddress) || /^0x0{40}$/i.test(treasuryAddress)) throw new Error("Invalid buyback binding");
    const token = new (ethersApi().Contract)(tokenAddress,
      ["function balanceOf(address) view returns(uint256)", "function decimals() view returns(uint8)"], provider);
    const [treasuryBalance, decimals, logs] = await Promise.all([
      token.balanceOf(treasuryAddress, at), token.decimals(at),
      contract.queryFilter(contract.filters.BuybackExecuted(), result.historyFromBlock, block.number),
    ]);
    result.history = logs.slice(-20).reverse().map(log => ({ id: log.args.id.toString(), token: validWalletAddress(log.args.token),
      treasury: validWalletAddress(log.args.treasury), nativeSpentWei: log.args.nativeSpent.toString(),
      netTokensReceived: log.args.netTokensReceived.toString(), reserveRemainingWei: log.args.reserveRemaining.toString(),
      transactionHash: expectedHex32(log.transactionHash, "buyback transaction"), blockNumber: log.blockNumber }));
    if (result.history.some(row => row.token !== validWalletAddress(tokenAddress) || row.treasury !== validWalletAddress(treasuryAddress))) throw new Error("Inconsistent buyback receipt");
    return { ...result, configured: true, executorAddress: validWalletAddress(executorAddress),
      tokenAddress: validWalletAddress(tokenAddress), treasuryAddress: validWalletAddress(treasuryAddress),
      tokenDecimals: Number(decimals), treasuryBalance: treasuryBalance.toString() };
  }

  function charityVoteId(value) {
    if ((typeof value === "number" && !Number.isSafeInteger(value)) || !/^[1-9][0-9]*$/.test(String(value))
        || BigInt(value) >= (1n << 256n)) throw new Error("Invalid charity ballot number");
    return String(value);
  }

  // The policy getter, never a version label in browser configuration, identifies this mode.
  // All state reads share a block. Optional recent reason text must match the stored hash.
  async function getCharityStatus({ voteId, candidateAddress } = {}) {
    if (!isV3()) return { supported: false, mode: "unavailable" };
    if (voteId != null && voteId !== "") voteId = charityVoteId(voteId);
    const provider = getReadProvider(), block = await provider.getBlock("latest");
    const at = { blockTag: block.number }, contract = new (ethersApi().Contract)(contractAddress(), V3_ABI, provider);
    const policy = await optionalBuybackRead(() => contract.CHARITY_POLICY_VERSION(at));
    if (policy == null) return { supported: false, mode: "legacy", blockNumber: block.number };
    if (policy !== 2n) return { supported: false, mode: "unavailable", policyVersion: policy.toString() };
    const [owner, humanId, chaosId, humanBudget, chaosBudget, humanSeason, chaosSeason, payoutReserves] = await Promise.all([
      contract.owner(at), contract.lastGateVote(0, at), contract.lastGateVote(1, at),
      contract.charityGateBudgets(0, at), contract.charityGateBudgets(1, at),
      contract.seasons(32, at), contract.seasons(33, at), contract.payoutReserves(at),
    ]);
    const selectedId = voteId || (chaosId > 0n ? chaosId.toString() : humanId > 0n ? humanId.toString() : null);
    const ids = [...new Set([humanId.toString(), chaosId.toString(), selectedId].filter(id => id && id !== "0"))];
    const rows = await Promise.all(ids.map(async id => {
      const [vote, decision] = await Promise.all([contract.votes(id, at), contract.charityDecisions(id, at)]);
      if (vote.endsAt === 0n) return [id, null];
      const recipient = validWalletAddress(decision.recipient), decided = recipient !== ethersApi().ZeroAddress;
      return [id, { id, gate: Number(vote.gate), snapshot: vote.snapshot.toString(), budgetWei: vote.budget.toString(), endsAt: vote.endsAt.toString(),
        totalVotes: vote.totalVotes.toString(), leader: validWalletAddress(vote.leader), leadingVotes: vote.leadingVotes.toString(),
        tied: vote.tied, finalized: vote.finalized, successful: vote.successful,
        canFinalize: !vote.finalized && BigInt(block.timestamp) >= vote.endsAt,
        canDecide: vote.finalized && vote.budget > 0n && !decision.paid,
        canPay: vote.finalized && vote.budget > 0n && decided && !decision.paid,
        canVote: false, voteWeight: "0", hasVoted: false,
        decision: { recipient, decided, reasonHash: decision.reasonHash, paid: decision.paid, reason: null } }];
    }));
    const byId = Object.fromEntries(rows), selected = selectedId ? byId[selectedId] : null;
    candidateAddress = validWalletAddress(candidateAddress);
    const candidateApproved = !!candidateAddress && candidateAddress !== ethersApi().ZeroAddress
      && await contract.whitelistedCharity(candidateAddress, at);
    if (selected && state.connected && state.pubkey && !selected.finalized && BigInt(block.timestamp) < BigInt(selected.endsAt)) {
      const tokenAddress = await contract.token(at);
      const token = new (ethersApi().Contract)(tokenAddress, [
        "function pastFarmed(address,uint48) view returns (uint256)", "function pastBalance(address,uint48) view returns (uint256)",
      ], provider);
      const [hasVoted, farmed, balance] = await Promise.all([contract.voted(selected.id, state.pubkey, at),
        token.pastFarmed(state.pubkey, selected.snapshot, at), token.pastBalance(state.pubkey, selected.snapshot, at)]);
      selected.hasVoted = hasVoted; selected.voteWeight = (balance / 1000000000n).toString();
      selected.canVote = !hasVoted && farmed >= 1000000000n && balance >= 1000000000n;
    }
    if (selected?.decision.decided) {
      try {
        const logs = await contract.queryFilter(contract.filters.CharityDecisionSet(selectedId), Math.max(0, block.number - 499), block.number);
        const latest = logs[logs.length - 1];
        if (latest && validWalletAddress(latest.args.recipient) === selected.decision.recipient
            && ethersApi().keccak256(ethersApi().toUtf8Bytes(latest.args.reason)) === selected.decision.reasonHash) {
          selected.decision.reason = latest.args.reason;
        }
      } catch (_) { /* A missing event window never invents or trusts an unverified reason. */ }
    }
    const humanBallot = byId[humanId.toString()] || null, chaosBallot = byId[chaosId.toString()] || null;
    const latestBallot = chaosId > 0n ? chaosBallot : humanBallot;
    const canOpen = payoutReserves === 0n && (!latestBallot || latestBallot.finalized);
    return { supported: true, mode: "admin", policyVersion: "2", blockNumber: block.number,
      owner: validWalletAddress(owner), isOwner: !!state.connected && validWalletAddress(owner) === state.pubkey,
      connected: !!state.connected, candidateAddress, candidateApproved,
      gates: [{ label: "Human", unallocatedWei: humanBudget.toString(), ballot: humanBallot,
        canOpen: canOpen && humanSeason.closed && humanId === 0n },
        { label: "Chaos", unallocatedWei: chaosBudget.toString(), ballot: chaosBallot,
          canOpen: canOpen && chaosSeason.closed && chaosId === 0n && !!humanBallot?.finalized }],
      selectedId, selected };
  }

  let charityTransactionPending = false;
  async function charityTransaction(method, id, recipient, reason) {
    if (charityTransactionPending) throw new Error("A charity transaction is already pending");
    charityTransactionPending = true;
    try {
      let walletIntent = state.connected ? walletTransactionIntent() : null;
      const opening = method === "openCharityVote";
      if (opening) { if (id !== 0 && id !== 1) throw new Error("Invalid charity gate"); }
      else id = charityVoteId(id);
      if (!cfg().enabled) throw new Error("chain mode is disabled");
      const paying = method === "claimCharity";
      if (paying) {
        recipient = validWalletAddress(recipient);
        if (!recipient || recipient === ethersApi().ZeroAddress) throw new Error("A reviewed charity recipient is required");
        reason = expectedHex32(reason, "reviewed charity reason hash");
      }
      if (method === "setCharityDecision") {
        recipient = validWalletAddress(recipient);
        if (!recipient || recipient === ethersApi().ZeroAddress || typeof reason !== "string"
            || !reason.trim() || ethersApi().toUtf8Bytes(reason).length > 512) throw new Error("Enter a recipient and a public reason of 1–512 UTF-8 bytes");
      }
      if (method === "castCharityVote") {
        recipient = validWalletAddress(recipient);
        if (!recipient || recipient === ethersApi().ZeroAddress) throw new Error("Enter an approved charity candidate address");
      }
      const selection = { voteId: opening ? undefined : id, candidateAddress: method === "castCharityVote" ? recipient : undefined };
      let current = await getCharityStatus(selection);
      const assertReviewedDecision = () => {
        if (paying && current.supported && current.selected && (current.selected.id !== id
            || current.selected.decision.recipient !== recipient
            || String(current.selected.decision.reasonHash).toLowerCase() !== reason)) {
          throw new Error(V3_ERROR_MESSAGES.CharityDecisionChanged);
        }
      };
      const allowed = () => current.supported && current.mode === "admin" && (opening ? current.gates[id]?.canOpen : current.selected
        && (method === "setCharityDecision" ? current.isOwner && current.selected.canDecide
          : method === "finalizeCharityVote" ? current.selected.canFinalize
            : method === "castCharityVote" ? current.selected.canVote && current.candidateApproved : method === "claimCharity" && current.selected.canPay));
      if (!allowed()) throw new Error("This charity action is unavailable to this wallet or deployment");
      assertReviewedDecision();
      if (!state.connected && !await connectWallet()) throw new Error("wallet connection is required");
      walletIntent ||= walletTransactionIntent();
      await switchToConfiguredNetwork();
      current = await getCharityStatus(selection);
      if (!allowed()) throw new Error("The charity ballot or administrator changed; refresh before continuing");
      assertReviewedDecision();
      const to = contractAddress(), contract = new (ethersApi().Contract)(to, V3_ABI, getReadProvider());
      const args = method === "setCharityDecision" || paying ? [id, recipient, reason] : method === "castCharityVote" ? [id, recipient] : [id];
      const data = contract.interface.encodeFunctionData(method, args);
      const { gasLimit } = await preflightContractTransaction({ from: walletIntent.from, to, data }, "charity action", walletIntent);
      if (paying) {
        current = await getCharityStatus(selection);
        if (!allowed()) throw new Error("This charity payment is no longer available; refresh before continuing");
        assertReviewedDecision();
      }
      const transactionHash = await sendWalletTransaction({ to, data, gasLimit, walletIntent });
      const receipt = await waitForWalletReceipt(transactionHash);
      if (Number(receipt.status) !== 1) throw new Error("Charity transaction reverted");
      return { transactionHash, submit_sig: transactionHash };
    } finally { charityTransactionPending = false; }
  }
  function setCharityDecision(id, recipient, reason) { return charityTransaction("setCharityDecision", id, recipient, reason); }
  function finalizeCharityVote(id) { return charityTransaction("finalizeCharityVote", id); }
  function claimCharity(id, expectedRecipient, expectedReasonHash) { return charityTransaction("claimCharity", id, expectedRecipient, expectedReasonHash); }
  function openCharityVote(gate) { return charityTransaction("openCharityVote", gate); }
  function castCharityVote(id, candidate) { return charityTransaction("castCharityVote", id, candidate); }

  function milestoneSelection(kind, discriminator) {
    kind = requireSafeInteger(kind, "milestone kind");
    if (kind > 4 || (typeof discriminator === "number" && !Number.isSafeInteger(discriminator))
        || !/^(0|[1-9][0-9]*)$/.test(String(discriminator))) throw new Error("Invalid milestone selection");
    const value = BigInt(discriminator);
    if (value >= (1n << 256n) || (kind === 0 && value !== 0n) || (kind === 1 && (value < 1n || value > 31n))
        || (kind === 2 && value < 1n) || (kind === 3 && value !== 32n) || (kind === 4 && value !== 33n)) throw new Error("Invalid milestone selection");
    return [kind, value.toString()];
  }

  async function getMilestoneStatus({ kind, discriminator } = {}) {
    if (!isV3()) return { supported: false, contractVersion: Number(cfg().contractVersion || 2) };
    const selected = milestoneSelection(kind, discriminator);
    const provider = getReadProvider();
    const block = await provider.getBlock("latest");
    const at = { blockTag: block.number };
    const contract = new (ethersApi().Contract)(contractAddress(), V3_ABI, provider);
    const [nftAddress, recipient] = await Promise.all([contract.milestones(at), contract.milestoneRecipient(...selected, at)]);
    const nft = new (ethersApi().Contract)(nftAddress, ["function awardStatus(uint8 kind,uint256 discriminator) view returns (uint256 id,address owner,address originalRecipient,string uri)"], provider);
    const award = await nft.awardStatus(...selected, at);
    const zero = ethersApi().ZeroAddress;
    const eligible = recipient !== zero;
    return { supported: true, kind: selected[0], discriminator: selected[1], blockNumber: block.number,
      collectionAddress: nftAddress, tokenId: award.id.toString(), recipient, owner: award.owner,
      originalRecipient: award.originalRecipient, metadataURI: award.uri, eligible, minted: award.owner !== zero,
      canClaim: eligible && award.owner === zero && !!state.connected && validWalletAddress(recipient) === state.pubkey };
  }

  async function accountTransaction(method, args, label) {
    let walletIntent = state.connected ? walletTransactionIntent() : null;
    if (!isV3()) throw new Error("V3 account actions are unavailable on this deployment");
    if (!cfg().enabled) throw new Error("chain mode is disabled");
    if (!state.connected && !await connectWallet()) throw new Error("wallet connection is required");
    walletIntent ||= walletTransactionIntent();
    await switchToConfiguredNetwork();
    const contract = new (ethersApi().Contract)(contractAddress(), V3_ABI, getReadProvider());
    if (method === "mintFarmReward") {
      const run = await contract.runs(args[0]);
      if (validWalletAddress(run.claim.player) !== state.pubkey) throw new Error("This reward belongs to another wallet");
    } else if (method === "refundExpiredEntry" || method === "expireStartedEntry") {
      const entry = await contract.entries(args[0]);
      if (validWalletAddress(entry.player) !== state.pubkey) throw new Error("This entry belongs to another wallet");
    } else if (method === "claimNative") args = [state.pubkey];
    else if (method === "awardMilestone") {
      const award = await getMilestoneStatus({ kind: args[0], discriminator: args[1] });
      if (!award.canClaim) throw new Error("This milestone is unavailable or belongs to another wallet");
    }
    else throw new Error("Unknown account action");
    const data = contract.interface.encodeFunctionData(method, args);
    const { gasLimit } = await preflightContractTransaction({ from: state.pubkey, to: contractAddress(), data }, label, walletIntent);
    status(`ROBINHOOD: review ${label} in wallet…`);
    const transactionHash = await sendWalletTransaction({ to: contractAddress(), data, gasLimit, walletIntent });
    const receipt = await waitForWalletReceipt(transactionHash);
    if (Number(receipt.status) !== 1) throw new Error(`${label} reverted`);
    if (method === "refundExpiredEntry" || method === "expireStartedEntry") {
      const pending = readPendingEntry(BigInt(cfg().feeWei || 0));
      if (String(pending?.entryId || state.lastEntry?.entryId).toLowerCase() === args[0]) clearPendingEntry();
      if (state.lastEntry?.entryId === args[0]) { state.lastEntry = null; state.lastEntrySig = ""; state.lastEntrySlot = null; }
    }
    status(`ROBINHOOD: ${label} confirmed ✅`);
    return { submit_sig: transactionHash, transactionHash };
  }
  function claimFarmReward(runHash) { return accountTransaction("mintFarmReward", [expectedHex32(runHash, "run hash")], "token reward"); }
  function refundExpiredEntry(entryId) { return accountTransaction("refundExpiredEntry", [expectedHex32(entryId, "entry id")], "unused entry refund"); }
  function expireStartedEntry(entryId) { return accountTransaction("expireStartedEntry", [expectedHex32(entryId, "entry id")], "expired run settlement"); }
  function claimNative() { return accountTransaction("claimNative", [], "native credit claim"); }
  function claimMilestone(kind, discriminator) { return accountTransaction("awardMilestone", milestoneSelection(kind, discriminator), "milestone NFT claim"); }

  async function finalizeRun(runPackage) {
    syncPOHPContext();
    // A successful relay can lose its HTTP acknowledgement. Checking the chain
    // first also works after reload, when /verify rejects the consumed entry.
    const recovered = await recoverRecordedRun(runPackage);
    if (recovered) return { ledger: null, verify: null, submit: recovered };
    let ledgerFinal = null;
    if (state.ledger.run_ticket_id && !state.ledger.finalized) {
      const lastCheckpoint = runPackage?.last_checkpoint || {};
      ledgerFinal = await finalizeLedgerRun({
        frame: asInt(runPackage?.masks_len, lastCheckpoint.frame || 0),
        wave: asInt(runPackage?.final_wave, lastCheckpoint.final_wave || 1),
        lives: asInt(lastCheckpoint.lives, 0),
        final_score: asInt(runPackage?.final_score, 0),
        client_score: asInt(runPackage?.final_score, 0),
        client_event_hash: String(runPackage?.run_hash || ""),
      });
      if (ledgerFinal && runPackage) {
        runPackage.accepted_score = ledgerFinal.accepted_score;
        runPackage.ledger_root = ledgerFinal.ledger_root;
        runPackage.ledger_final_hash = ledgerFinal.final_hash;
        runPackage.ledger_memoText = ledgerFinal.memoText;
        runPackage.ledger_verifier_sig = ledgerFinal.verifier_sig;
      }
    }
    if (state.ledger.run_ticket_id && !state.ledger.finalized) {
      throw new Error(state.ledger.lastError || "Run ledger is not finalized; press B to retry.");
    }
    const verified = await verifyRun(runPackage);
    const submitted = await submitVerifiedRun(runPackage, verified);
    return { ledger: ledgerFinal, verify: verified, submit: submitted };
  }

  function bindWalletEvents(provider = injectedProvider()) {
    const injected = provider;
    if (!injected || walletEventsProvider === injected || typeof injected.on !== "function") return;
    walletEventsProvider = injected;
    injected.on("accountsChanged", (accounts) => {
      const next = accounts?.[0] && ethersApi().isAddress(accounts[0]) ? ethersApi().getAddress(accounts[0]) : "";
      state.connected = !!next;
      state.pubkey = next;
      state.lastEntrySig = "";
      state.lastEntrySlot = null;
      state.lastEntry = null;
      state.lastRunRecord = "";
      state.lastVerify = null;
      syncPOHPContext();
      status(next ? `ROBINHOOD: account changed ${next.slice(0, 6)}…${next.slice(-4)}` : "ROBINHOOD: wallet disconnected");
    });
    injected.on("chainChanged", (chainId) => {
      browserProvider = null;
      if (walletConnectionInProgress) return;
      const target = normalizedChainId(cfg().chainIdHex || cfg().chainId);
      if (normalizedChainId(chainId) === target) {
        state.connected = !!state.pubkey;
        status(state.pubkey
          ? `ROBINHOOD: connected ${state.pubkey.slice(0, 6)}…${state.pubkey.slice(-4)}`
          : "ROBINHOOD: network ready — connect wallet");
        return;
      }
      state.connected = false;
      status(`ROBINHOOD: switch to ${cfg().chainName}`);
    });
  }

  function init() {
    syncPOHPContext();
    try {
      const button = $("btn-connect");
      if (button) button.addEventListener("click", connectWallet);
    } catch (_) {}
    bindWalletEvents();
    if (cfg().showLeaderboard !== false && cfg().contractAddress) {
      refreshLeaderboard();
      setInterval(refreshLeaderboard, 30000);
    }
    if (!cfg().enabled) {
      status("ROBINHOOD: disabled (config)");
      return;
    }
    if (!cfg().contractAddress) {
      status("ROBINHOOD: adapter ready — testnet contract deployment pending");
      return;
    }
    if (!injectedProvider()) {
      status("ROBINHOOD: tap Connect wallet for phone or desktop setup");
      return;
    }
    status(`ROBINHOOD: ready (${cfg().chainName})`);
  }

  window.ChainClient = {
    init,
    connectWallet,
    payEntryFee,
    ensureEntryPaid,
    startLedgerRun,
    submitLedgerEvent,
    finalizeLedgerRun,
    verifyRun,
    submitVerifiedRun,
    finalizeRun,
    fetchLeaderboard,
    refreshLeaderboard,
    getAccountStatus,
    getPoolStatus,
    getBuybackStatus,
    getCharityStatus,
    setCharityDecision,
    finalizeCharityVote,
    claimCharity,
    openCharityVote,
    castCharityVote,
    getMilestoneStatus,
    claimMilestone,
    claimFarmReward,
    refundExpiredEntry,
    expireStartedEntry,
    claimNative,
    syncPOHPContext,
    _state: state,
  };
})();
