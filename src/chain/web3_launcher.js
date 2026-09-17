(function (root) {
  'use strict';
  const skins = ['robin-cat-v6','robin-hood','robin-moon','robin-sailor-smoon','robin-ginger','robin-frost'];
  function destination(network, mode, skin) {
    if (!['solana','robinhood'].includes(network) || !['desktop','mobile'].includes(mode)) throw new Error('Choose a network and controls.');
    const path = mode === 'mobile' ? `web3/${network}-mobile.html` : `${network}.html`;
    return `${path}?skin=${encodeURIComponent(skins.includes(skin) ? skin : skins[0])}&voice=1`;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { skins, destination }; return; }
  const form = document.getElementById('web3-choice');
  if (!form) return;
  const params = new URLSearchParams(location.search);
  const getStored = key => { try { return localStorage.getItem(key); } catch (_) { return ''; } };
  const savedNetwork = params.get('network') || getStored('gkd_web3_network');
  if (['solana','robinhood'].includes(savedNetwork)) form.elements.network.value = savedNetwork;
  const skin = params.get('skin') || getStored('gkd_player_skin_v1');
  if (skins.includes(skin)) form.elements.skin.value = skin;
  const mobile = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 1 && /Mac|Android|iPhone|iPad/i.test(navigator.platform + navigator.userAgent);
  form.elements.mode.value = params.get('mode') === 'desktop' ? 'desktop' : params.get('mode') === 'mobile' || mobile ? 'mobile' : 'desktop';
  form.addEventListener('submit', event => {
    event.preventDefault();
    const network = form.elements.network.value, mode = form.elements.mode.value, selectedSkin = form.elements.skin.value;
    // The desktop game pages send phones to the mobile edition unless desktop was chosen here.
    try { localStorage.setItem('gkd_web3_network', network); localStorage.setItem('gkd_player_skin_v1', selectedSkin); localStorage.setItem('gkd_web3_mode', mode); } catch (_) {}
    location.assign(new URL(destination(network, mode, selectedSkin), document.baseURI).href);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
