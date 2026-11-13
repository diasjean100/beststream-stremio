// Exercise the URL-only add-on -> source CDN -> audio/video decoder path.
// Never log signed media URLs or source headers.
import {spawn} from 'node:child_process';
import {createAddon} from '../src/addon.js';
import {createServer} from '../src/server.js';
import {BrowserSource} from '../src/browser-source.js';
import {metadata,parseVideo} from '../src/metadata.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {auditFrame} from './audit-segments.js';
const addon=createAddon(),server=createServer(addon);
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
let failed=0;
await mkdir('audit-frames',{recursive:true});
function decode(url,headers={},frameName){return new Promise(resolve=>{
  const extra=Object.keys(headers).length?['-headers',Object.entries(headers).map(([key,value])=>`${key}: ${value}\r\n`).join('')]:[];
  const frame=frameName?['-map','0:v:0','-frames:v','1','-vf','scale=960:-2','-threads','1',`audit-frames/${frameName}.png`]:[];
  const args=['-nostdin','-hide_banner','-loglevel','error','-rw_timeout','140000000',...extra,'-i',url,...frame,'-t','6','-map','0:v:0','-map','0:a:0','-f','null','-'];
  const child=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});
  let stage='decoder';child.stderr.on('data',()=>{stage='decoder-reported-error';});
  const timer=setTimeout(()=>child.kill('SIGKILL'),150000);
  child.once('error',()=>{clearTimeout(timer);resolve({ok:false,stage:'ffmpeg-unavailable'});});
  child.once('exit',code=>{clearTimeout(timer);resolve({ok:code===0,stage:code===0?'audio-video-decoded':stage});});
});}
async function inspectLater(url,headers,id,seconds) {
  try {
    const frame=await auditFrame({url,headers},seconds);
    await writeFile(`audit-frames/${id.replaceAll(':','-')}-${seconds}s.png`,frame.png);
    return {ok:frame.ok,seconds,stage:frame.ok?'frame-inspected':'blocked-slate'};
  } catch(error){return {ok:false,seconds,stage:error.message};}
}
try{
  for(const[type,id]of [['movie','tt0133093'],['movie','tt1375666'],['series','tt1567432:1:1']]){
    const start=Date.now();
    const list=await(await fetch(`${base}/native/stream/${type}/${id}.json`)).json();
    const listedMs=Date.now()-start;
    const selected=list.streams[0];
    const result=selected?await decode(selected.url,selected.behaviorHints?.proxyHeaders?.request||{},id.replaceAll(':','-')):{ok:false,stage:'no-native-source'};
    if(selected)for(const seconds of [60,300]){
      const frame=await inspectLater(selected.url,selected.behaviorHints?.proxyHeaders?.request||{},id,seconds);
      console.log(JSON.stringify({event:'later_frame_check',type,id,...frame}));
      if(!frame.ok)failed++;
    }
    let aliasesDirect=true;
    for(const prefix of ['','/bridge','/bridge/native']){
      const alias=await(await fetch(`${base}${prefix}/stream/${type}/${id}.json`)).json();
      if(!alias.streams.length||alias.streams.some(s=>s.externalUrl||s.url?.startsWith(base)))aliasesDirect=false;
    }
    const diagnostic=await addon.resolve(type,id).catch(()=>({status:'error'}));
    console.log(JSON.stringify({event:'native_bridge_check',type,id,listedMs,elapsedMs:Date.now()-start,...result,aliasesDirect,status:diagnostic.status,attempts:diagnostic.attempts}));
    if(!result.ok||!aliasesDirect)failed++;
  }
  const browser=new BrowserSource();
  try{for(const[type,id]of [['movie','tt0133093'],['series','tt1567432:1:1']]){
    const video=parseVideo(type,id),meta=await metadata(video);
    const result=await browser.resolve({id:'reelix-ac',name:'Reelix'},video,meta);
    const candidate=result.streams[0];
    const playback=candidate?await decode(candidate.url,candidate.headers||{}):null;
    console.log(JSON.stringify({event:'additional_provider_check',provider:'Reelix',type,id,status:result.status,streams:result.streams.length,decoded:playback?.ok||false,stage:result.diagnosticStage}));
    if(candidate&&!playback.ok)failed++;
  }}finally{await browser.close();}
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await addon.close();}
if(failed)process.exitCode=1;
