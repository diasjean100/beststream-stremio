import {request,json} from '../src/network.js';
import {plain} from '../src/directory.js';
import {hasChallenge} from '../src/browser-source.js';
const root='https://nexa.mov/';
const r=await request(root,{maxBytes:3_000_000});
const html=r.body.toString();
const title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
console.log(JSON.stringify({event:'nexa_home',status:r.status,title,bytes:r.body.length,challenge:hasChallenge(title,plain(html).slice(0,1500))}));
if(r.status!==200||hasChallenge(title,plain(html).slice(0,1500)))process.exit(1);
for(const term of ['tmdb-movie','tmdb-tv','/watch/','/api/stream','/api/play','/api/sources','season=','episode=','sources','m3u8']){
 let from=0;let count=0;
 while(count<4){const i=html.indexOf(term,from);if(i<0)break;console.log(JSON.stringify({event:'nexa_code',term,excerpt:html.slice(Math.max(0,i-180),i+360)}));from=i+term.length;count++;}
}
for(const type of ['movie','series']){
 const id=type==='movie'?'tt0133093':'tt0903747';
 const d=await json(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`);
 console.log(JSON.stringify({event:'nexa_id_mapping',type,id,tmdb:d.meta.moviedb_id,name:d.meta.name}));
}
const entries=[...new Set(Array.from(html.matchAll(/["']([^"']*_app\/immutable\/entry\/[^"']+\.js)["']/g)).map(m=>new URL(m[1],root).href))];
console.log(JSON.stringify({event:'nexa_entries',paths:entries.map(u=>new URL(u).pathname)}));
for(const entry of entries.filter(u=>u.includes('/app.')).slice(0,1)){
 const asset=await request(entry,{maxBytes:1_500_000});const code=asset.body.toString();
 console.log(JSON.stringify({event:'nexa_app',status:asset.status,bytes:asset.body.length,code:code.slice(0,22000)}));
 const paths=[...new Set(Array.from(code.matchAll(/\.\.\/(?:nodes\/22\.[a-zA-Z0-9_-]+|chunks\/CpI1V2AI)\.js/g)).map(m=>new URL(m[0],entry).href))];
 for(const path of paths){
  const source=await request(path,{maxBytes:2_000_000});const js=source.body.toString();
  console.log(JSON.stringify({event:'nexa_route_module',path:new URL(path).pathname,status:source.status,bytes:source.body.length}));
  for(const term of ['epSlug','tmdb-tv','tmdb-movie','/watch/','season','episode']){
   let from=0,count=0;
   while(count<4){const i=js.indexOf(term,from);if(i<0)break;console.log(JSON.stringify({event:'nexa_route_code',term,path:new URL(path).pathname,excerpt:js.slice(Math.max(0,i-170),i+400)}));from=i+term.length;count++;}
  }
 }
}
