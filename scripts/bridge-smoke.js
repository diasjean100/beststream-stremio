// Exercise the complete add-on -> Play -> relay -> audio/video decoder path.
// Never log signed media URLs, source headers or relay session identifiers.
import {spawn} from 'node:child_process';
import {createAddon} from '../src/addon.js';
import {createServer} from '../src/server.js';
const addon=createAddon(),server=createServer(addon);
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
let failed=0;
function decode(url,headers={}){return new Promise(resolve=>{
  const extra=Object.keys(headers).length?['-headers',Object.entries(headers).map(([key,value])=>`${key}: ${value}\r\n`).join('')]:[];
  const args=['-nostdin','-hide_banner','-loglevel','error','-rw_timeout','140000000',...extra,'-i',url,'-t','6','-map','0:v:0','-map','0:a:0','-f','null','-'];
  const child=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});
  let stage='decoder';child.stderr.on('data',()=>{stage='decoder-reported-error';});
  const timer=setTimeout(()=>child.kill('SIGKILL'),150000);
  child.once('error',()=>{clearTimeout(timer);resolve({ok:false,stage:'ffmpeg-unavailable'});});
  child.once('exit',code=>{clearTimeout(timer);resolve({ok:code===0,stage:code===0?'audio-video-decoded':stage});});
});}
try{
  for(const[type,id]of [['movie','tt0133093'],['movie','tt1375666'],['series','tt1567432:1:1']]){
    const start=Date.now();
    const list=await(await fetch(`${base}/native/stream/${type}/${id}.json`)).json();
    const listedMs=Date.now()-start;
    const selected=list.streams[0];
    const result=selected?await decode(selected.url,selected.behaviorHints?.proxyHeaders?.request||{}):{ok:false,stage:'no-native-source'};
    const bridged=await(await fetch(`${base}/bridge/native/stream/${type}/${id}.json`)).json();
    const bridge=await decode(bridged.streams[0].url);
    const diagnostic=await addon.resolve(type,id).catch(()=>({status:'error'}));
    console.log(JSON.stringify({event:'native_bridge_check',type,id,listedMs,elapsedMs:Date.now()-start,...result,bridgeDecoded:bridge.ok,status:diagnostic.status,attempts:diagnostic.attempts}));
    if(!result.ok||!bridge.ok)failed++;
  }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await addon.close();}
if(failed)process.exitCode=1;
