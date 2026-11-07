import { request } from './network.js';
export function mediaUrl(value) {
  try { const u=new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password && /\.(m3u8|mp4|webm)(?:$|[?#])/i.test(u.href); } catch { return false; }
}
export function validHls(text) {
  return /^\s*#EXTM3U(?:\s|$)/.test(text) && /#EXT(?:INF|-X-STREAM-INF|-X-TARGETDURATION):/.test(text) && !/SAMPLE-AES|KEYFORMAT\s*=|widevine|playready/i.test(text);
}
export function videoPrefix(body) {
  if(['ftyp','styp','moof','moov'].includes(body.subarray(4,8).toString())||body.subarray(0,4).toString('hex')==='1a45dfa3')return true;
  // Several CDNs use image extensions for MPEG-TS. Inspect bytes, not extensions.
  for(let i=0;i<Math.min(2048,body.length-376);i++)if(body[i]===0x47&&body[i+188]===0x47&&body[i+376]===0x47)return true;
  return false;
}
async function playableHls(text,url,headers,get,depth=0) {
  if(!validHls(text)||depth>2)return false;
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const variant=lines.findIndex(s=>s.startsWith('#EXT-X-STREAM-INF:'));
  if(variant>=0) {
    const path=lines[variant+1];if(!path||path.startsWith('#'))return false;
    const r=await get(new URL(path,url).href,{headers,maxBytes:1_000_000,timeout:6500});
    return r.status===200&&playableHls(r.body.toString(),r.url,headers,get,depth+1);
  }
  const segment=lines.find(s=>!s.startsWith('#'));if(!segment)return false;
  const r=await get(new URL(segment,url).href,{headers,maxBytes:65536,prefixBytes:65536,timeout:6500});
  if(![200,206].includes(r.status)||r.body.length<564)return false;
  if(/<\s*(?:!doctype|html)|^\s*\{/.test(r.body.subarray(0,100).toString()))return false;
  const key=/#EXT-X-KEY:[^\n]*METHOD=AES-128[^\n]*URI="([^"]+)"/.exec(text);
  if(key) {
    const k=await get(new URL(key[1],url).href,{headers,maxBytes:64,timeout:6500});
    return k.status===200&&k.body.length===16;
  }
  return videoPrefix(r.body);
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
    if(hls?!await playableHls(r.body.toString(),r.url,candidate.headers||{},get):!binaryVideo) return null;
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
