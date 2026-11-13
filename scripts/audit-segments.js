// Bounded VOD spot checks: select the segment at the requested time instead of
// relying on remote FFmpeg seeking, which some CDN playlists do not support.
import {spawnSync} from 'node:child_process';
import {createDecipheriv} from 'node:crypto';
import {request} from '../src/network.js';
import {validHls,PROBE_BYTES} from '../src/media.js';
import {blockedSlate} from '../src/content-inspector.js';

export async function auditFrame(candidate,seconds,get=request) {
  const headers=candidate.headers||{};
  let url=candidate.url,text='';
  for(let depth=0;depth<4;depth++) {
    const r=await get(url,{headers,maxBytes:1_000_000,timeout:9000});
    if(r.status!==200||!validHls(r.body.toString()))throw Error('playlist-unavailable');
    url=r.url;text=r.body.toString();
    const lines=text.split(/\r?\n/).map(s=>s.trim()),variants=[];
    for(let i=0;i<lines.length-1;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')&&lines[i+1]&&!lines[i+1].startsWith('#')) {
      variants.push({path:lines[i+1],width:Number(lines[i].match(/RESOLUTION=(\d+)x/)?.[1]||0)});
    }
    if(!variants.length)break;
    const variant=variants.filter(v=>v.width).sort((a,b)=>a.width-b.width)[0]||variants[0];
    url=new URL(variant.path,url).href;
  }
  const lines=text.split(/\r?\n/).map(s=>s.trim());
  let elapsed=0,duration=0,index=0,selected=null,keyTag=null,mapTag=null;
  const sequence=BigInt(lines.find(s=>s.startsWith('#EXT-X-MEDIA-SEQUENCE:'))?.split(':')[1]||0);
  for(const line of lines) {
    if(line.startsWith('#EXTINF:'))duration=Number(line.split(':')[1].split(',')[0]);
    else if(line.startsWith('#EXT-X-KEY:'))keyTag=line;
    else if(line.startsWith('#EXT-X-MAP:'))mapTag=line;
    else if(line&&!line.startsWith('#')) {
      if(elapsed+duration>seconds){selected={path:line,index,keyTag,mapTag};break;}
      elapsed+=duration;index++;
    }
  }
  if(!selected||/#EXT-X-BYTERANGE:/.test(text))throw Error('segment-unavailable');
  const segment=await get(new URL(selected.path,url).href,{headers,maxBytes:PROBE_BYTES,prefixBytes:PROBE_BYTES,timeout:9000});
  if(![200,206].includes(segment.status))throw Error('segment-unavailable');
  let bytes=segment.body;
  if(selected.keyTag&&!/\bMETHOD=NONE(?:,|$)/.test(selected.keyTag)) {
    const uri=selected.keyTag.match(/\bURI="([^"]+)"/)?.[1];
    if(!uri||!selected.keyTag.includes('METHOD=AES-128'))throw Error('unsupported-encryption');
    const key=await get(new URL(uri,url).href,{headers,maxBytes:64,timeout:9000});
    if(key.status!==200||key.body.length!==16)throw Error('key-unavailable');
    const explicit=selected.keyTag.match(/\bIV=0x([a-f0-9]{1,32})(?:,|$)/i)?.[1];
    const iv=explicit?Buffer.from(explicit.padStart(32,'0'),'hex'):Buffer.alloc(16);
    if(!explicit)iv.writeBigUInt64BE(sequence+BigInt(selected.index),8);
    const decipher=createDecipheriv('aes-128-cbc',key.body,iv);decipher.setAutoPadding(false);
    bytes=decipher.update(bytes.subarray(0,Math.floor(bytes.length/16)*16));
  }
  if(selected.mapTag) {
    const uri=selected.mapTag.match(/\bURI="([^"]+)"/)?.[1];
    if(!uri||selected.keyTag||selected.mapTag.includes('BYTERANGE='))throw Error('unsupported-map');
    const init=await get(new URL(uri,url).href,{headers,maxBytes:256*1024,timeout:9000});
    if(init.status!==200)throw Error('map-unavailable');
    bytes=Buffer.concat([init.body,bytes]);
  }
  const decoded=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-filter_threads','1','-protocol_whitelist','pipe','-threads','1','-i','pipe:0',
    '-map','0:v:0','-frames:v','1','-vf','scale=960:-2','-threads','1','-f','image2pipe','-vcodec','png','pipe:1'],{input:bytes,timeout:15000,maxBuffer:2_000_000});
  if(decoded.status!==0||decoded.stdout.length<100)throw Error('frame-decode-failed');
  const ocr=spawnSync('tesseract',['stdin','stdout','-l','eng','--psm','11'],{input:decoded.stdout,timeout:6000,maxBuffer:16000,env:{...process.env,OMP_THREAD_LIMIT:'1'}});
  if(ocr.status!==0)throw Error('frame-ocr-failed');
  return {png:decoded.stdout,ok:!blockedSlate(ocr.stdout.toString())};
}
