import { request } from './network.js';
import {createDecipheriv} from 'node:crypto';
import {inspectContent} from './content-inspector.js';
import {VERSION} from './version.js';
export const PROBE_BYTES=1024*1024;
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
  if(!validHls(text)||depth>2)return null;
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const variant=lines.findIndex(s=>s.startsWith('#EXT-X-STREAM-INF:'));
  if(variant>=0) {
    const path=lines[variant+1];if(!path||path.startsWith('#'))return null;
    const r=await get(new URL(path,url).href,{headers,maxBytes:1_000_000,timeout:6500});
    return r.status===200?playableHls(r.body.toString(),r.url,headers,get,depth+1):null;
  }
  const segmentIndex=lines.findIndex(s=>!s.startsWith('#'));
  const segment=lines[segmentIndex];if(!segment||/#EXT-X-BYTERANGE:/.test(text))return null;
  const tags=lines.slice(0,segmentIndex);
  const r=await get(new URL(segment,url).href,{headers,maxBytes:PROBE_BYTES,prefixBytes:PROBE_BYTES,timeout:6500});
  if(![200,206].includes(r.status)||r.body.length<564)return null;
  if(/<\s*(?:!doctype|html)|^\s*\{/.test(r.body.subarray(0,100).toString()))return null;
  let bytes=r.body;
  const keyTag=tags.findLast(s=>s.startsWith('#EXT-X-KEY:'));
  if(keyTag&&!/\bMETHOD=NONE(?:,|$)/.test(keyTag)) {
    const keyUri=keyTag.match(/\bURI="([^"]+)"/)?.[1];
    if(!/\bMETHOD=AES-128(?:,|$)/.test(keyTag)||!keyUri)return null;
    const k=await get(new URL(keyUri,url).href,{headers,maxBytes:64,timeout:6500});
    if(k.status!==200||k.body.length!==16)return null;
    const explicit=keyTag.match(/\bIV=0x([a-f0-9]{1,32})(?:,|$)/i)?.[1];
    const iv=explicit?Buffer.from(explicit.padStart(32,'0'),'hex'):Buffer.alloc(16);
    if(!explicit)iv.writeBigUInt64BE(BigInt(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]||0),8);
    const decipher=createDecipheriv('aes-128-cbc',k.body,iv);decipher.setAutoPadding(false);
    bytes=decipher.update(bytes.subarray(0,Math.floor(bytes.length/16)*16));
  }
  const mapTag=tags.findLast(s=>s.startsWith('#EXT-X-MAP:'));
  if(mapTag) {
    const mapUri=mapTag.match(/\bURI="([^"]+)"/)?.[1];
    if(!mapUri||/BYTERANGE=/.test(mapTag))return null;
    const init=await get(new URL(mapUri,url).href,{headers,maxBytes:256*1024,timeout:6500});
    if(init.status!==200||!videoPrefix(init.body))return null;
    bytes=Buffer.concat([init.body,bytes]);
  }
  return videoPrefix(bytes)?bytes:null;
}
export async function validateMedia(candidate, get=request, {inspect=inspectContent}={}) {
  if(!mediaUrl(candidate.url) && candidate.format!=='HLS') return null;
  try {
    const target=new URL(candidate.url);
    if(!['http:','https:'].includes(target.protocol)||target.username||target.password)return null;
    const hls=candidate.format==='HLS'||/\.m3u8(?:$|[?#])/i.test(candidate.url);
    const r=await get(candidate.url,{headers:candidate.headers||{},maxBytes:hls?1_000_000:PROBE_BYTES,...(!hls?{prefixBytes:PROBE_BYTES}:{}),timeout:6500});
    if(![200,206].includes(r.status)) return null;
    const contentType=String(r.headers['content-type']||'');
    const binaryVideo=(r.body.subarray(4,8).toString()==='ftyp'||r.body.subarray(0,4).toString('hex')==='1a45dfa3')&&/^video\//i.test(contentType);
    const bytes=hls?await playableHls(r.body.toString(),r.url,candidate.headers||{},get):binaryVideo?r.body:null;
    if(!bytes)return null;
    const inspection=await inspect(bytes);
    if(!inspection.ok){console.info(JSON.stringify({event:'media_rejected',reason:inspection.reason||'unverified-frame'}));return null;}
    return {...candidate,url:r.url,format:hls?'HLS':'MP4',validatedAt:new Date().toISOString(),inspection:inspection.method||'frame-and-ocr'};
  } catch { return null; }
}
export function streamObject(candidate, provider) {
  const ext=candidate.format==='HLS'?'m3u8':'mp4';
  const headers=candidate.headers||{};
  return {name:`BestStream ${VERSION} • ${provider.name}`,title:`${candidate.format} • quadro inicial verificado`,url:candidate.url,
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
