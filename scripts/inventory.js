import {directory,plain} from '../src/directory.js';
import {request,json} from '../src/network.js';
import {hasChallenge} from '../src/browser-source.js';
const dir=await directory();
const queue=[...dir.sources];
console.log(JSON.stringify({event:'inventory_start',sources:queue.length,origin:dir.origin}));
try {
  const d=await json('https://v3-cinemeta.strem.io/meta/movie/tt0133093.json');
  console.log(JSON.stringify({event:'metadata_schema',keys:Object.keys(d.meta||{}),tmdb:d.meta?.moviedb_id||d.meta?.tmdb_id||null}));
}catch(e){console.log(JSON.stringify({event:'metadata_schema',error:e.message}));}
async function worker(){
  while(queue.length){
    const source=queue.shift();
    if(source.id==='bingebang-st'){console.log(JSON.stringify({event:'inventory',name:source.name,status:'skipped-known-challenge'}));continue;}
    try{
      const r=await request(source.url,{timeout:6500,maxBytes:1_000_000});
      const html=r.body.toString();
      const title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
      const challenged=hasChallenge(title,plain(html).slice(0,1800));
      const scripts=Array.from(html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)).map(m=>{try{return new URL(m[1],r.url).pathname;}catch{return null;}}).filter(Boolean).slice(0,8);
      const forms=Array.from(html.matchAll(/<form\b([^>]*)>[\s\S]*?<\/form>/gi)).slice(0,3).map(m=>({action:m[1].match(/action=["']([^"']*)["']/i)?.[1]?.split('?')[0]||null,inputs:Array.from(m[0].matchAll(/<input\b[^>]*(?:name|placeholder)=["']([^"']+)["']/gi)).map(x=>x[1]).slice(0,4)}));
      console.log(JSON.stringify({event:'inventory',name:source.name,status:r.status,title,challenge:challenged,scripts:challenged?[]:scripts,forms:challenged?[]:forms,apiHints:challenged?[]:[...new Set(Array.from(html.matchAll(/["'](\/api\/[a-z0-9_/-]+)["'?]/gi)).map(m=>m[1]))].slice(0,6)}));
    }catch(e){console.log(JSON.stringify({event:'inventory',name:source.name,error:e.message}));}
  }
}
await Promise.all(Array.from({length:4},()=>worker()));
