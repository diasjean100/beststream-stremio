import { request } from './network.js';
export function mediaUrl(value) {
  try { const u=new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password && /\.(m3u8|mp4|webm)(?:$|[?#])/i.test(u.href); } catch { return false; }
}
export function validHls(text) {
  return /^\s*#EXTM3U(?:\s|$)/.test(text) && /#EXT(?:INF|-X-STREAM-INF|-X-TARGETDURATION):/.test(text) && !/SAMPLE-AES|KEYFORMAT\s*=|widevine|playready/i.test(text);
}
export async function validateMedia(candidate, get=request) {
  if(!mediaUrl(candidate.url) && candidate.format!=='HLS') return null;
  try {
    const target=new URL(candidate.url);
    if(!['http:','https:'].includes(target.protocol)||target.username||target.password)return null;
    const hls=candidate.format==='HLS'||/\.m3u8(?:$|[?#])/i.test(candidate.url);
    const r=await get(candidate.url,{headers:{...candidate.headers,...(!hls?{Range:'bytes=0-32767'}:{})},maxBytes:hls?1_000_000:65536,timeout:6500});
    if(![200,206].includes(r.status)) return null;
    const contentType=String(r.headers['content-type']||'');
    const binaryVideo=(r.body.subarray(4,8).toString()==='ftyp'||r.body.subarray(0,4).toString('hex')==='1a45dfa3')&&/^video\//i.test(contentType);
    if(hls?!validHls(r.body.toString()):!binaryVideo) return null;
    return {...candidate,url:r.url,format:hls?'HLS':'MP4',validatedAt:new Date().toISOString()};
  } catch { return null; }
}
export function streamObject(candidate, provider) {
  const ext=candidate.format==='HLS'?'m3u8':'mp4';
  const headers=candidate.headers||{};
  return {name:`BestStream • ${provider.name}`,title:`${candidate.format} • fonte verificada no servidor`,url:candidate.url,
    behaviorHints:{notWebReady:true,bingeGroup:`beststream-${provider.id}`,filename:`beststream.${ext}`,...(Object.keys(headers).length?{proxyHeaders:{request:headers}}:{})}};
}

// Read only the site's simple XOR-encoded inline configuration. Never eval remote code.
export function playerIdentity(script) {
  let text=script;
  const encoded=/var k=(\[[\d,]+\]),d=(\[[\d,]+\])/.exec(script);
  if(encoded) {
    try {const key=JSON.parse(encoded[1]),data=JSON.parse(encoded[2]);if(!key.length||key.length>256||data.length>150000)return null;
      text=Buffer.from(data.map((b,i)=>b^key[i%key.length])).toString('utf8');
    } catch { return null; }
  }
  const imdb=/\bimdb\s*:\s*["'](tt\d{5,12})["']/.exec(text)?.[1];
  const season=/\bseason\s*:\s*(\d+)/.exec(text)?.[1];
  const episode=/\bepisode\s*:\s*(\d+)/.exec(text)?.[1];
  return imdb?{imdb,season:Number(season||0),episode:Number(episode||0)}:null;
}
