(function (root) {
  'use strict';
  const REQUIRED = Object.freeze(['boss_supply_v1', 'wave_roster_v1', 'server_elapsed_v1', 'idempotent_event_v1']);
  function validate(health, cfg) {
    const fail = reason => { throw new Error(reason); };
    if (!health || health.ok !== true) fail('Score service is unavailable. No new entry was requested.');
    for (const flag of ['strict_gate_d', 'require_entry_tx', 'persistent_ledger', 'run_start_auth']) {
      if (health[flag] !== true) fail('Score service is not ready for paid entries.');
    }
    if (!REQUIRED.every(value => health.ledger_capabilities?.includes(value))) fail('Game and score service versions must be updated together.');
    if (health.authoritative_gameplay !== false || health.real_value_rewards !== false || health.validation_mode !== 'testnet_event_ledger') {
      fail('This release supports testnet evaluation only.');
    }
    const kind = cfg.chainKind;
    const network = health.chains?.[kind];
    if (!network?.enabled) fail('Selected network is not enabled by the score service.');
    if (kind === 'solana') {
      if (cfg.cluster !== 'devnet' || network.cluster !== 'devnet') fail('Solana Devnet is required for this release.');
      if (!cfg.programId || network.program_id !== cfg.programId) fail('Solana program does not match the score service.');
      if (!network.verifier_pubkey) fail('Solana score signer is unavailable.');
      if (Number(network.program_version || 1) !== Number(cfg.programVersion || 1)) fail('Solana program versions do not match.');
      if (Number(cfg.programVersion || 1) === 2 && network.genesis_domain !== cfg.genesisHash) fail('Solana signature network does not match.');
    } else if (kind === 'robinhood') {
      if (cfg.network !== 'testnet' || Number(cfg.chainId) !== 46630 || Number(network.chain_id) !== 46630) fail('Robinhood Testnet is required for this release.');
      if (!cfg.contractAddress || network.contract_address?.toLowerCase() !== cfg.contractAddress.toLowerCase()) fail('Robinhood contract does not match the score service.');
      if (!cfg.verifierAddress || network.verifier_address?.toLowerCase() !== cfg.verifierAddress.toLowerCase()) fail('Robinhood score signer does not match.');
      if (Number(network.contract_version || 2) !== Number(cfg.contractVersion)) fail('Robinhood contract versions do not match.');
      if (!!cfg.simulationProtocol !== !!health.independent_replay_candidate) fail('Game and independent replay service must be updated together.');
      if (cfg.simulationProtocol) {
        const simulation = health.simulation_manifest;
        if (cfg.simulationProtocol !== 'fixed_step_v1' || cfg.contractVersion !== 3 || !health.ledger_capabilities?.includes('fixed_step_v1')
          || !simulation || simulation.protocol !== cfg.simulationProtocol || simulation.tick_ms !== 16 || simulation.initial_state !== 'fresh_run_v1'
          || health.replay_runtime?.ready !== true || health.replay_runtime?.ruleset_hash !== simulation.ruleset_hash
          || !/^[a-f0-9]{64}$/.test(cfg.simulationRulesetHash || '') || cfg.simulationRulesetHash !== simulation.ruleset_hash) fail('Independent replay engine versions do not match.');
      }
    } else fail('Unsupported network.');
    return health;
  }
  async function ensure(cfg, extra = {}) {
    if (!cfg?.enabled) return null;
    for (const key of ['runAuthUrl', 'runStartUrl', 'runEventUrl', 'runFinalizeUrl', 'verifyUrl']) {
      if (!cfg[key]) throw new Error('Secure run service is not configured.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await root.fetch(cfg.healthUrl || '/api/verifier/health', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Score service is unavailable. No new entry was requested.');
      const health = validate(await response.json(), cfg);
      if (extra.client_ruleset && health.expected_client_ruleset !== extra.client_ruleset) throw new Error('Game rules and score service versions do not match.');
      return health;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Score service did not respond. No new entry was requested.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  const api = Object.freeze({ REQUIRED, validate, ensure });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GKDWeb3Preflight = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
