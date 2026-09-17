(function (root) {
  'use strict';
  function init() {
    const $ = id => document.getElementById(id);
    const panel = $('rh-pool-nft'), refresh = $('rh-pool-refresh'), output = $('rh-pool-status');
    if (!panel || !refresh || !output || root.CHAIN?.chainKind !== 'robinhood') return;
    const balanceNames = ['gamePool', 'pendingEscrow', 'payoutReserves', 'claimLiabilities', 'charityPool', 'voteReserves'];
    const cards = [0,1,2,3,4].map(kind => ({ kind, output: $('rh-award-status-' + kind),
      claim: $('rh-award-claim-' + kind), choice: $('rh-award-choice-' + kind), current: null }));
    const balances = $('rh-pool-balances');
    const buybackPanel = $('rh-buyback'), buybackOutput = $('rh-buyback-status');
    const charityPanel = $('rh-charity'), charityOutput = $('rh-charity-status');
    const charityVote = $('rh-charity-vote'), charityRecipient = $('rh-charity-recipient'), charityReason = $('rh-charity-reason');
    const charityCandidate = $('rh-charity-candidate');
    let charityCurrent = null;
    let busy = false, loaded = false, revision = 0;
    function format(value, decimals) {
      const n = BigInt(value), unit = 10n ** BigInt(decimals);
      if (n < 0n) throw new Error('Invalid amount');
      const fraction = (n % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
      return (n / unit).toString() + (fraction ? '.' + fraction : '');
    }
    function selected(card) {
      const value = card.choice ? String(card.choice.value).trim() : String([0,0,0,32,33][card.kind]);
      if (!/^(0|[1-9][0-9]*)$/.test(value) || (card.kind === 1 && (BigInt(value) < 1n || BigInt(value) > 31n))
          || (card.kind === 2 && (BigInt(value) < 1n || BigInt(value) >= (1n << 256n)))) throw new Error('Invalid award number');
      return { kind: card.kind, discriminator: value };
    }
    function invalidate() { cards.forEach(card => { card.current = null; card.claim.disabled = true; }); }
    function setBusy(value) {
      busy = value; refresh.disabled = value; panel.setAttribute('aria-busy', String(value));
      cards.forEach(card => { if (card.choice) card.choice.disabled = value; card.claim.disabled = value || !card.current?.canClaim; });
      charityControls();
    }
    function showAward(card, award) {
      card.current = award?.supported ? award : null;
      card.claim.disabled = busy || !card.current?.canClaim;
      if (!award?.supported) card.output.textContent = 'Achievements will open with the new deployment.';
      else if (award.minted) card.output.textContent = award.owner !== award.originalRecipient ? 'Collected · now held by another wallet.' : 'Collected.';
      else if (award.canClaim) card.output.textContent = 'Earned by your wallet. Ready to collect.';
      else if (award.eligible) card.output.textContent = 'Earned. Connect the winning wallet to collect.';
      else card.output.textContent = 'Not earned yet.';
    }
    function showPools(pool) {
      if (!pool?.supported) { balances.hidden = true; output.textContent = 'Pool and achievements will open with the new deployment.'; return; }
      for (const name of balanceNames) $('rh-pool-' + name).textContent = format(pool[name], 18) + ' ETH';
      if ($('rh-pool-buybackReserve')) $('rh-pool-buybackReserve').textContent = pool.buybackReserve == null ? 'Unavailable' : format(pool.buybackReserve, 18) + ' ETH';
      if ($('rh-launch-rules')) $('rh-launch-rules').textContent = pool.configurationSealed === true
        ? 'Entry fees, season rewards and charity ballot candidates are locked. The administrator can still pause play and change the score verifier.'
        : pool.configurationSealed === false ? 'Launch rules are still being prepared. Paid play has not opened.'
        : 'Launch lock status is unavailable for this deployment.';
      const season = pool.season;
      const progress = $('rh-season-progress');
      if (season && BigInt(season.cap) > 0n) {
        const cap = BigInt(season.cap), minted = BigInt(season.minted);
        if (minted < 0n || minted > cap) throw new Error('Invalid season progress');
        progress.hidden = false; progress.value = Number(minted * 10000n / cap);
        $('rh-season-label').textContent = `Season ${season.id}${season.closed ? ' · complete' : ''}`;
        $('rh-season-detail').textContent = `${format(minted, 9)} / ${format(cap, 9)} $420POP awarded`;
      } else {
        progress.hidden = true; $('rh-season-label').textContent = 'Next season is being prepared.';
        $('rh-season-detail').textContent = '';
      }
      balances.hidden = false;
      const network = Number(root.CHAIN.chainId) === 46630 ? 'Testnet · ' : '';
      output.textContent = !pool.fullyBacked ? 'Pool balances need review. New claims are unavailable here.'
        : `${network}${pool.paused ? 'Game entries are paused. ' : ''}Updated. Refresh for the latest balances.`;
    }
    function showBuyback(value) {
      if (!buybackPanel || !buybackOutput) return;
      buybackPanel.hidden = false;
      const info = $('rh-buyback-info'), history = $('rh-buyback-history');
      info.hidden = true; history.replaceChildren();
      if (!value?.supported) { buybackOutput.textContent = 'Buyback details are unavailable for this deployment.'; return; }
      if (!value.configured) {
        buybackOutput.textContent = `Reserved for buyback: ${format(value.reserveWei, 18)} ETH. Purchases are not configured yet.`;
        return;
      }
      if (!Number.isInteger(value.tokenDecimals) || value.tokenDecimals < 0 || value.tokenDecimals > 255) throw new Error('Invalid token decimals');
      $('rh-buyback-token').textContent = value.tokenAddress;
      $('rh-buyback-treasury').textContent = value.treasuryAddress;
      $('rh-buyback-balance').textContent = format(value.treasuryBalance, value.tokenDecimals) + ' tokens';
      $('rh-buyback-window').textContent = `Latest purchases in blocks ${value.historyFromBlock}–${value.historyToBlock}. Up to 20 receipts.`;
      for (const item of value.history) {
        const row = document.createElement('li');
        row.textContent = `#${item.id} · ${format(item.nativeSpentWei, 18)} ETH → ${format(item.netTokensReceived, value.tokenDecimals)} tokens received. `;
        const explorer = Number(root.CHAIN.chainId) === 46630 ? 'https://explorer.testnet.chain.robinhood.com'
          : Number(root.CHAIN.chainId) === 4663 ? 'https://robinhoodchain.blockscout.com' : '';
        if (explorer && /^0x[0-9a-fA-F]{64}$/.test(item.transactionHash)) {
          const link = document.createElement('a'); link.href = explorer + '/tx/' + item.transactionHash;
          link.textContent = 'View transaction'; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.appendChild(link);
        }
        history.appendChild(row);
      }
      info.hidden = false;
      buybackOutput.textContent = `${value.count} completed purchases. Reserved for the next buyback: ${format(value.reserveWei, 18)} ETH.`;
    }
    function buybackFailure() {
      if (!buybackPanel || !buybackOutput) return;
      buybackPanel.hidden = false; $('rh-buyback-info').hidden = true; $('rh-buyback-history').replaceChildren();
      buybackOutput.textContent = 'Could not check buybacks. Refresh to try again.';
    }
    function charitySelection() {
      const value = String(charityVote?.value || '').trim();
      if (value && (!/^[1-9][0-9]*$/.test(value) || BigInt(value) >= (1n << 256n))) throw new Error('Invalid ballot number');
      return value;
    }
    function charityControls() {
      if (!charityPanel) return;
      const selected = charityCurrent?.selected, ready = !busy && charityCurrent?.mode === 'admin';
      charityVote.disabled = busy; charityCandidate.disabled = busy || !ready;
      for (const input of [charityRecipient, charityReason]) input.disabled = busy || !ready || !charityCurrent?.isOwner;
      const bytes = new TextEncoder().encode(charityReason.value).length;
      const valid = /^0x[0-9a-fA-F]{40}$/.test(charityRecipient.value.trim()) && !/^0x0{40}$/i.test(charityRecipient.value.trim())
        && charityReason.value.trim().length > 0 && bytes <= 512;
      $('rh-charity-save').disabled = !ready || !charityCurrent.isOwner || !selected?.canDecide || !valid;
      $('rh-charity-finalize').disabled = !ready || !selected?.canFinalize;
      $('rh-charity-pay').disabled = !ready || !selected?.canPay;
      $('rh-charity-cast').disabled = !ready || !selected?.canVote || !charityCurrent.candidateApproved;
      for (const gate of [0, 1]) $('rh-charity-open-' + gate).disabled = !ready || !charityCurrent.gates?.[gate]?.canOpen;
      $('rh-charity-preview').textContent = selected && ready
        ? `Ballot #${selected.id} · ${format(selected.budgetWei, 18)} ETH. Saving authorizes anyone to pay this destination immediately. A revision only takes effect if confirmed before payment. Pay uses the destination and reason you reviewed.`
        : 'Choose a ballot and refresh to preview its charity budget.';
      $('rh-charity-reason-count').textContent = `${bytes} / 512 UTF-8 bytes. This reason is public.`;
    }
    function clearCharity() {
      charityCurrent = null;
      if (!charityPanel) return;
      $('rh-charity-info').hidden = true;
      $('rh-charity-gates').replaceChildren(); $('rh-charity-decision').textContent = '';
      $('rh-charity-reason-text').textContent = ''; $('rh-charity-owner').textContent = '';
      $('rh-charity-holder-status').textContent = 'Connect a holder wallet and refresh to check voting eligibility. Enter an approved candidate address and refresh before voting.';
      charityControls();
    }
    function showCharity(value) {
      if (!charityPanel) return;
      clearCharity(); charityPanel.hidden = false;
      if (!value?.supported || value.mode !== 'admin') {
        charityOutput.textContent = value?.mode === 'legacy'
          ? 'Legacy charity policy detected. This deployment does not support administrator decisions; these actions are unavailable.'
          : 'Charity policy could not be identified for this deployment. Administrator actions are unavailable.';
        return;
      }
      charityCurrent = value;
      $('rh-charity-info').hidden = false;
      $('rh-charity-owner').textContent = `Administrator: ${value.owner}. ${value.isOwner ? 'Your connected wallet can save an allocation decision.' : 'Connect the administrator wallet using Wallet & rewards, then refresh to save a decision.'}`;
      for (const gate of value.gates) {
        const row = document.createElement('li'), vote = gate.ballot;
        row.textContent = vote ? `${gate.label} ballot #${vote.id}: ${format(vote.budgetWei, 18)} ETH. `
          + (vote.budgetWei === '0' ? 'Empty gate; no payment. ' : `${vote.finalized ? 'Advisory result recorded' : 'Advisory voting'}; ${vote.totalVotes} votes. `
            + (vote.tied ? 'Tied advisory leaders. ' : /^0x0{40}$/i.test(vote.leader) ? 'No advisory leader. ' : `Advisory leader: ${vote.leader} (${vote.leadingVotes} votes). `)
            + (vote.finalized ? vote.successful ? 'Advisory quorum met. ' : 'No qualifying advisory winner; the administrator can still decide. ' : ''))
          + (vote.decision.paid ? `Paid to ${vote.decision.recipient}.` : vote.decision.decided ? `Unpaid decision: ${vote.decision.recipient}.` : 'No administrator allocation decision.')
          : `${gate.label}: no ballot yet. Unallocated charity budget: ${format(gate.unallocatedWei, 18)} ETH.`;
        $('rh-charity-gates').appendChild(row);
      }
      const selected = value.selected;
      if (selected) {
        $('rh-charity-decision').textContent = `Selected ballot #${selected.id}: ${format(selected.budgetWei, 18)} ETH. `
          + (selected.decision.paid ? `Paid to ${selected.decision.recipient}. Destination is final.`
            : selected.decision.decided ? `Administrator decision: ${selected.decision.recipient}. Unpaid and payable by anyone now. A revision must be confirmed before payment.`
            : 'No administrator allocation decision yet.')
          + (!selected.finalized ? ' Ballot must be finalized before a decision can be saved.' : '');
        $('rh-charity-reason-text').textContent = selected.decision.reason != null ? `Verified public reason: ${selected.decision.reason}`
          : selected.decision.decided ? `Public reason text unavailable in the latest 500 blocks. On-chain reason hash: ${selected.decision.reasonHash}` : '';
        const deadline = Number(selected.endsAt) * 1000;
        $('rh-charity-holder-status').textContent = selected.finalized ? 'This advisory ballot is finalized.'
          : (Number.isSafeInteger(deadline) ? `Voting deadline: ${new Date(deadline).toLocaleString()}. ` : '')
            + (selected.hasVoted ? 'Your wallet has already voted.' : !value.connected ? 'Connect a holder wallet, then refresh to check eligibility.'
              : selected.canVote ? `Your snapshot voting weight: ${selected.voteWeight}. `
                + (value.candidateApproved ? 'This address is an approved ballot candidate. Your vote is advisory.' : 'Enter an approved candidate address and refresh to enable voting.')
                : 'This wallet cannot vote in this ballot. Voting needs at least 1 farmed token and 1 held token at its snapshot, during the voting window.')
            + (charityCandidate.value.trim() && !value.candidateApproved ? ' Candidate is not confirmed as approved.' : '');
      } else $('rh-charity-decision').textContent = value.selectedId ? 'This ballot does not exist. Check its number and refresh.' : 'No ballot is available yet.';
      charityOutput.textContent = 'Holder votes are advisory. The administrator authorizes the final charity allocation; anyone may pay it immediately. A revision must be confirmed before payment. Admin-managed, not DAO.';
      charityControls();
    }
    function charityFailure() {
      if (!charityPanel) return;
      clearCharity(); charityPanel.hidden = false;
      charityOutput.textContent = 'Could not check charity decisions. Check the ballot number and refresh to try again.';
    }
    function api() {
      const value = root.ChainClient;
      if (!value?.getPoolStatus || !value.getMilestoneStatus) throw new Error('Pool unavailable');
      return value;
    }
    async function refreshAll() {
      if (busy) return;
      const serial = ++revision;
      invalidate(); setBusy(true); balances.hidden = true; output.textContent = 'Checking pool and achievements…';
      if (buybackPanel) buybackPanel.hidden = true;
      clearCharity(); if (charityPanel) charityPanel.hidden = true;
      try {
        const client = api();
        const results = await Promise.allSettled([client.getPoolStatus(), ...cards.map(async card => client.getMilestoneStatus(selected(card))),
          client.getBuybackStatus ? client.getBuybackStatus() : Promise.resolve({ supported: false }),
          charityPanel && client.getCharityStatus ? Promise.resolve().then(() => client.getCharityStatus({ voteId: charitySelection(), candidateAddress: charityCandidate.value.trim() })) : Promise.resolve({ supported: false })]);
        if (serial !== revision) return;
        let failed = false;
        try { if (results[0].status !== 'fulfilled') throw results[0].reason; showPools(results[0].value); }
        catch (_) { balances.hidden = true; failed = true; }
        cards.forEach((card, index) => {
          const result = results[index + 1];
          if (result.status === 'fulfilled') showAward(card, result.value);
          else { card.current = null; card.output.textContent = 'Could not check this award. Check the number and refresh.'; failed = true; }
        });
        try { if (results[6].status !== 'fulfilled') throw results[6].reason; showBuyback(results[6].value); }
        catch (_) { buybackFailure(); }
        try { if (results[7].status !== 'fulfilled') throw results[7].reason; showCharity(results[7].value); }
        catch (_) { charityFailure(); }
        if (failed) output.textContent = 'Some progress could not be checked. Refresh to try again.';
        if (results[0].status !== 'fulfilled' || !results[0].value?.fullyBacked) invalidate();
        loaded = true;
      } catch (_) { invalidate(); output.textContent = 'Could not check progress. Refresh to try again.'; }
      finally { setBusy(false); }
    }
    async function charityAction(method, gate) {
      const opening = method === 'openCharityVote';
      if (busy || (!opening && !charityCurrent?.selected)) return;
      const button = $(opening ? 'rh-charity-open-' + gate : method === 'castCharityVote' ? 'rh-charity-cast'
        : method === 'setCharityDecision' ? 'rh-charity-save' : method === 'claimCharity' ? 'rh-charity-pay' : 'rh-charity-finalize');
      if (button.disabled) return;
      const id = opening ? gate : charityCurrent.selected.id, recipient = charityRecipient.value.trim(), reason = charityReason.value;
      const candidate = charityCandidate.value.trim();
      // Capture the displayed payment intent before the first asynchronous read.
      const reviewed = method === 'claimCharity' ? Object.freeze({ id: charityCurrent.selected.id,
        budgetWei: charityCurrent.selected.budgetWei, recipient: charityCurrent.selected.decision.recipient,
        reasonHash: charityCurrent.selected.decision.reasonHash }) : null;
      const selection = { voteId: opening ? undefined : id, candidateAddress: candidate };
      setBusy(true); charityOutput.textContent = 'Checking this charity action before opening the wallet…';
      let message;
      try {
        const client = api(), current = await client.getCharityStatus(selection);
        const allowed = current.supported && current.mode === 'admin' && (opening ? current.gates[gate]?.canOpen : current.selected
          && (method === 'setCharityDecision' ? current.isOwner && current.selected.canDecide
            : method === 'claimCharity' ? current.selected.canPay : method === 'castCharityVote'
              ? current.selected.canVote && current.candidateApproved : current.selected.canFinalize));
        if (!allowed || typeof client[method] !== 'function') throw new Error('Unavailable');
        if (reviewed && (current.selected.id !== reviewed.id || current.selected.budgetWei !== reviewed.budgetWei
            || current.selected.decision.recipient?.toLowerCase() !== reviewed.recipient?.toLowerCase()
            || current.selected.decision.reasonHash?.toLowerCase() !== reviewed.reasonHash?.toLowerCase())) {
          throw new Error('Reviewed charity decision changed');
        }
        charityOutput.textContent = 'Review the charity transaction in your wallet…';
        if (method === 'setCharityDecision') await client[method](id, recipient, reason);
        else if (reviewed) await client[method](reviewed.id, reviewed.recipient, reviewed.reasonHash);
        else if (method === 'castCharityVote') await client[method](id, candidate); else await client[method](id);
        message = method === 'setCharityDecision' ? 'Administrator decision saved. Anyone can pay it immediately. A revision must be confirmed before payment.'
          : method === 'claimCharity' ? 'Charity payment confirmed.' : opening ? 'Charity gate opened. Refresh to see the latest ballot.'
            : method === 'castCharityVote' ? 'Your advisory vote is recorded.' : 'Advisory ballot finalized. The administrator can now record a decision.';
      } catch (error) {
        message = error?.code === 4001 || error?.code === 'ACTION_REJECTED' ? 'Charity transaction cancelled.'
          : 'Charity action was not completed. Refresh to check the latest decision.';
      }
      try { showCharity(await api().getCharityStatus(selection)); charityOutput.textContent += ' ' + message; }
      catch (_) { charityFailure(); }
      finally { setBusy(false); }
    }
    async function claim(card) {
      if (busy) return;
      let choice;
      try { choice = selected(card); } catch (_) { card.claim.disabled = true; card.output.textContent = 'Enter a valid award number and refresh.'; return; }
      const serial = ++revision;
      let backed = false;
      invalidate(); setBusy(true); output.textContent = 'Checking your award before opening the wallet…';
      try {
        const client = api();
        const [pool, current] = await Promise.all([client.getPoolStatus(), client.getMilestoneStatus(choice)]);
        if (serial !== revision || selected(card).discriminator !== choice.discriminator) return;
        showAward(card, current);
        backed = !!pool?.fullyBacked;
        if (!pool?.fullyBacked || !current?.canClaim || !client.claimMilestone) {
          output.textContent = current?.minted ? 'This award has already been collected.' : 'This award is not available to this wallet. Refresh to check progress.';
          return;
        }
        output.textContent = 'Review the NFT claim in your wallet…';
        await client.claimMilestone(choice.kind, choice.discriminator);
        card.current = null;
        const result = await client.getMilestoneStatus(choice);
        showAward(card, result);
        output.textContent = result.minted ? 'Achievement collected.' : 'Claim sent. Refresh to check confirmation.';
      } catch (error) {
        card.current = null;
        const cancelled = error?.code === 4001 || error?.code === 'ACTION_REJECTED';
        output.textContent = cancelled ? 'Claim cancelled. Refresh when you want to try again.' : 'The claim was not completed. Refresh to check its latest status.';
        // A second caller may have minted the award after our read. Recover display state,
        // but never retry a wallet transaction automatically.
        try { showAward(card, await api().getMilestoneStatus(choice));
          if (card.current?.minted) output.textContent = 'This award has already been collected.'; }
        catch (_) { card.current = null; card.output.textContent = 'Could not check this award. Refresh to try again.'; }
      } finally {
        // A claim locks every card while the wallet is open. Re-read the others so another earned
        // award can be collected without a manual refresh; reads only, never a transaction.
        if (serial === revision && backed) {
          await Promise.allSettled(cards.filter(other => other !== card).map(async other => {
            const status = await api().getMilestoneStatus(selected(other));
            if (serial === revision) showAward(other, status);
          }));
        }
        setBusy(false);
      }
    }
    refresh.addEventListener('click', refreshAll);
    if (charityPanel) {
      charityVote.addEventListener('input', () => { clearCharity(); charityOutput.textContent = 'Refresh to check this ballot.'; });
      charityCandidate.addEventListener('input', () => {
        if (charityCurrent) charityCurrent.candidateApproved = false;
        charityControls(); $('rh-charity-holder-status').textContent = 'Refresh to confirm this candidate and your voting eligibility.';
      });
      charityRecipient.addEventListener('input', charityControls); charityReason.addEventListener('input', charityControls);
      $('rh-charity-save').addEventListener('click', () => charityAction('setCharityDecision'));
      $('rh-charity-finalize').addEventListener('click', () => charityAction('finalizeCharityVote'));
      $('rh-charity-pay').addEventListener('click', () => charityAction('claimCharity'));
      $('rh-charity-cast').addEventListener('click', () => charityAction('castCharityVote'));
      for (const gate of [0, 1]) $('rh-charity-open-' + gate).addEventListener('click', () => charityAction('openCharityVote', gate));
    }
    $('rh-pool-close')?.addEventListener('click', () => {
      panel.open = false;
      const mobileMenu = $('rh-mobile-tools');
      if (mobileMenu) mobileMenu.open = false;
      $(mobileMenu ? 'rh-mobile-tools-summary' : 'rh-pool-summary')?.focus();
    });
    panel.addEventListener('toggle', () => { if (panel.open && !loaded) return refreshAll(); });
    for (const card of cards) {
      card.claim.addEventListener('click', () => claim(card));
      card.choice?.addEventListener('input', () => {
        revision++; card.current = null; card.claim.disabled = true;
        card.output.textContent = 'Refresh to check this award.';
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
