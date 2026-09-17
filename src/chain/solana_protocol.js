(function (root) {
  'use strict';
  const encode = value => new TextEncoder().encode(value);
  function join(parts) { const out = new Uint8Array(parts.reduce((n,p) => n + p.length,0)); let offset=0; for (const p of parts) { out.set(p,offset); offset+=p.length; } return out; }
  function le(value, size) { if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('Unsafe integer');let n=BigInt(value); if(n<0n || n>=(1n<<BigInt(size*8))) throw new Error('Integer out of range'); const out=new Uint8Array(size); for(let i=0;i<size;i++){out[i]=Number(n&255n);n>>=8n;} return out; }
  function u64(bytes, offset) { if(offset<0 || offset+8>bytes.length) throw new Error('Truncated account'); let n=0n; for(let i=7;i>=0;i--) n=(n<<8n)|BigInt(bytes[offset+i]); return n; }
  async function canonicalV2(args) {
    const fields=[args.program,args.genesis,args.runHash,args.replayHash,args.versionHash,args.player];
    if(fields.some(value=>value.length!==32) || args.entrySig.length!==64 || args.playerName.length!==16) throw new Error('Invalid Solana V2 field length');
    const body=join([...fields.slice(2),le(args.seasonId,2),le(args.score,8),le(args.feeLamports,8),le(args.entrySlot,8),args.entrySig,args.playerName]);
    const digest=new Uint8Array(await root.crypto.subtle.digest('SHA-256',body));
    return join([encode('GKD_RUN_V2'),args.program,args.genesis,digest]);
  }
  function decodeRun(bytes) {
    if(bytes.length<337) throw new Error('Truncated run account');
    const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(323,true);
    if(n>240 || bytes.length<337+n) throw new Error('Invalid run URI layout');
    return {runHash:bytes.slice(8,40),player:bytes.slice(104,136),seasonId:bytes[136]|bytes[137]<<8,fee:u64(bytes,138),score:u64(bytes,146),passed:bytes[154]===1,rewardMinted:bytes[335+n]===1};
  }
  function tokens(raw, decimals=9) { const n=BigInt(raw),scale=10n**BigInt(decimals);const fraction=(n%scale).toString().padStart(decimals,'0').replace(/0+$/,'');return (n/scale).toString()+(fraction?'.'+fraction:''); }
  const api=Object.freeze({canonicalV2,decodeRun,u64,tokens});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GKDSolanaProtocol=api;
})(typeof globalThis!=='undefined'?globalThis:this);
