(function (root) {
  'use strict';
  function init() {
    const $ = id => document.getElementById(id);
    const output = $('web3-account-status'), refresh = $('web3-refresh');
    const claim = $('web3-claim'), native = $('web3-native');
    const refund = $('web3-refund'), expire = $('web3-expire');
    if (!output || !refresh || !claim) return;
    const actions = [claim, native, refund, expire].filter(Boolean);
    let busy = false;
    const format = (value, decimals = 9) => {
      const n = BigInt(value || 0), scale = 10n ** BigInt(decimals);
      const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
      return (n / scale).toString() + (fraction ? '.' + fraction : '');
    };
    function clearActions() {
      actions.forEach(button => { button.disabled = true; });
      [native, refund, expire].filter(Boolean).forEach(button => { button.hidden = true; });
    }
    async function snapshot() {
      if (!root.ChainClient?.getAccountStatus) throw new Error('Account status is not available in this release.');
      const result = await root.ChainClient.getAccountStatus();
      if (!result) throw new Error('Account status could not be read.');
      return { ...result, season: result.season && typeof result.season === 'object' ? result.season.id : result.season,
        runHash: result.run?.runHash || result.runHash, rewardReady: result.run?.canClaimFarm ?? result.rewardReady };
    }
    function show(result) {
      clearActions();
      if (!result.supported) {
        output.textContent = 'This contract records scores. Reward claims require the upcoming contract migration.';
        return;
      }
      if (result.connected === false) { output.textContent = 'Connect your wallet first, then refresh status.'; return; }
      claim.disabled = !result.rewardReady;
      for (const [button, available] of [
        [native, BigInt(result.nativeClaimable || 0) > 0n && root.ChainClient.claimNative],
        [refund, result.entry?.canRefund && root.ChainClient.refundExpiredEntry],
        [expire, result.entry?.canExpire && root.ChainClient.expireStartedEntry]
      ]) if (button) { button.hidden = !available; button.disabled = !available; }
      output.textContent = `Test $420POP: ${format(result.tokenBalance, result.decimals || 9)}${result.season ? ' · Season ' + result.season : ''}. ${result.detail || ''}`;
      if (result.entry?.canRefund) output.textContent += ' Your unused expired entry can be refunded to this wallet.';
      if (result.entry?.canExpire) output.textContent += ' This started run has expired. Closing it does not refund its entry fee.';
    }
    async function action(kind) {
      if (busy) return;
      busy = true; refresh.disabled = true; clearActions();
      try {
        const current = await snapshot();
        if (kind) {
          if (!current.supported || current.connected === false) throw new Error('Connect the wallet for this deployment first.');
          const api = root.ChainClient;
          if (kind === 'reward' && current.rewardReady && api.claimFarmReward) {
            output.textContent = 'Review the test reward transaction in your wallet…';
            await api.claimFarmReward(current.runHash);
          } else if (kind === 'native' && BigInt(current.nativeClaimable || 0) > 0n && api.claimNative) {
            output.textContent = 'Review the payout transaction in your wallet…';
            await api.claimNative();
          } else if (kind === 'refund' && current.entry?.canRefund && api.refundExpiredEntry) {
            output.textContent = 'Review the unused entry refund in your wallet…';
            await api.refundExpiredEntry(current.entry.entryId);
          } else if (kind === 'expire' && current.entry?.canExpire && api.expireStartedEntry) {
            output.textContent = 'Review closure of the expired run. Its entry fee is not refunded.';
            await api.expireStartedEntry(current.entry.entryId);
          } else throw new Error('This action is no longer available. Refresh to see the current state.');
          show(await snapshot());
        } else show(current);
      } catch (error) { clearActions(); output.textContent = String(error?.message || error); }
      finally { busy = false; refresh.disabled = false; }
    }
    refresh.addEventListener('click', () => action());
    claim.addEventListener('click', () => action('reward'));
    native?.addEventListener('click', () => action('native'));
    refund?.addEventListener('click', () => action('refund'));
    expire?.addEventListener('click', () => action('expire'));
    const params = new URLSearchParams(location.search), mode = $('mode-switch');
    if (mode) {
      const url = new URL('web3/index.html', document.baseURI);
      url.searchParams.set('network', root.CHAIN.chainKind);
      url.searchParams.set('mode', root.GKD_WEB3_MOBILE ? 'mobile' : 'desktop');
      if (params.get('skin')) url.searchParams.set('skin', params.get('skin'));
      mode.href = url.href;
    }
    if (root.GKD_WEB3_MOBILE) {
      $('mobile-help')?.setAttribute('hidden', ''); $('mobile-install')?.setAttribute('hidden', '');
      // Put rankings behind Wallet & rewards so they never cover touch controls.
      const slot = $('web3-score-slot');
      const placeLeaderboard = () => {
        const leaderboard = $('gkd-leaderboard');
        if (!slot || !leaderboard) return false;
        slot.hidden = false;
        if (leaderboard.parentElement !== slot) slot.appendChild(leaderboard);
        return true;
      };
      if (!placeLeaderboard() && slot && root.MutationObserver) {
        const observer = new root.MutationObserver(() => { if (placeLeaderboard()) observer.disconnect(); });
        observer.observe(document.body, { childList: true });
      }
      const original = root.__CHAIN_STATUS_CB;
      root.__CHAIN_STATUS_CB = message => {
        if (typeof original === 'function') original(message);
        const el = $('chain-status'); if (el) el.textContent = message;
      };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
