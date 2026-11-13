// Verify the deployed add-on and fetch actual video prefixes from a second host.
// Signed media URLs and source headers are deliberately not logged.
import {json} from '../src/network.js';
import {validateMedia} from '../src/media.js';
import {VERSION} from '../src/version.js';
const base='https://beststream-stremio-jean.onrender.com';
const expected=process.env.GITHUB_SHA;
const until=Date.now()+4*60_000;
let ready=false;
console.log(JSON.stringify({event:'waiting_for_release',expected:expected||null}));
while(Date.now()<until){
  try{
    const health=await json(base+'/healthz',{timeout:10_000});
    if(health.version===VERSION&&(!expected||health.commit===expected)){ready=true;console.log(JSON.stringify({event:'release_ready',version:health.version,commit:health.commit}));break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,3000));
}
if(!ready)throw Error('The intended release did not become ready within four minutes');
for(const prefix of ['','/native','/bridge','/bridge/native']){
  const manifest=await json(`${base}${prefix}/manifest.json`);
  if(manifest.version!==VERSION)throw Error('An older installation path did not receive this release');
}
const retired=await fetch(`${base}/relay/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/0.ts`);
if(retired.status!==410)throw Error('The obsolete video relay is still exposed');
let failures=0;
for(const [type,id] of [['movie','tt0133093'],['movie','tt1375666'],['series','tt1567432:1:1']]) {
  const started=Date.now();
  try{
    const data=await json(`${base}/native/stream/${type}/${id}.json`,{timeout:80_000});
    const streams=(data.streams||[]).filter(s=>s.url);
    if(streams.some(s=>s.url.startsWith(base)||s.externalUrl))throw Error('Expected direct source URLs only');
    let verified=0;
    for(const s of streams.slice(0,2)){
      const candidate={url:s.url,format:'HLS',headers:s.behaviorHints?.proxyHeaders?.request||{}};
      if(await validateMedia(candidate))verified++;
    }
    console.log(JSON.stringify({event:'hosted_video_check',type,id,streams:streams.length,verifiedFromSecondHost:verified,elapsedMs:Date.now()-started}));
    if(!verified)failures++;
  }catch(error){
    console.log(JSON.stringify({event:'hosted_video_check',type,id,error:error.name,elapsedMs:Date.now()-started}));failures++;
  }
}
if(failures)process.exitCode=1;
