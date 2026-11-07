// Read public application modules to find documented-in-client playback calls.
// This does not execute downloaded code or submit credentials/security challenges.
import {request} from '../src/network.js';
const root='https://nexa.mov/watch/tmdb-movie/603';
const page=await request(root,{maxBytes:3_000_000});
const html=page.body.toString();
console.log(JSON.stringify({event:'player_document',status:page.status,bytes:page.body.length}));
for(const term of ['m3u8','sources:','/api/']){
 let from=0,count=0;
 while(count++<3){const i=html.indexOf(term,from);if(i<0)break;console.log(JSON.stringify({event:'player_html',term,excerpt:html.slice(Math.max(0,i-100),i+160).replace(/https?:\/\/[^\s"'<>`]+/g,'[public URL]')}));from=i+term.length;}
}
try{
 const response=await request(root+'/__data.json',{maxBytes:3_000_000});
 const data=JSON.parse(response.body.toString());
 console.log(JSON.stringify({event:'player_public_data',status:response.status,keys:Object.keys(data),nodes:data.nodes?.map(n=>({type:n?.type,dataType:typeof n?.data,keys:n?.data?Object.keys(n.data).slice(0,20):[]})),bytes:response.body.length,hasMedia:/m3u8/.test(response.body.toString())}));
}catch{console.log(JSON.stringify({event:'player_public_data',status:'unavailable'}));}
const app=Array.from(html.matchAll(/["']([^"']*_app\/immutable\/entry\/app\.[^"']+\.js)["']/g)).map(m=>new URL(m[1],root).href)[0];
if(!app)throw Error('Public entry module absent');
const entry=await request(app,{maxBytes:2_000_000});
const js=entry.body.toString();
const routeNode=js.match(/\.\.\/nodes\/22\.[A-Za-z0-9_-]+\.js/)?.[0];
if(!routeNode)throw Error('Public watch route module absent');
const queue=[new URL(routeNode,app).href],seen=new Set();
const sanitize=s=>s.replace(/([?&](?:token|key|signature|expires|hash|auth)=)[^&\s"'`]+/gi,'$1[redacted]').replace(/[A-Za-z0-9_-]{60,}/g,'[long literal]');
while(queue.length&&seen.size<64){
 const url=queue.shift();if(seen.has(url))continue;seen.add(url);
 let response;try{response=await request(url,{maxBytes:2_000_000});}catch{continue;}
 if(response.status!==200)continue;
 const code=response.body.toString();
 const imports=Array.from(code.matchAll(/["'`](\.\.?\/[^"'` ]+\.js)["'`]/g)).map(m=>new URL(m[1],url).href);
 queue.push(...imports.filter(p=>new URL(p).origin===new URL(app).origin&&!seen.has(p)));
 const relevant=/\/api\/|m3u8|streamUrl|sources\s*:|fetch\(|resolveSourcesBaseUrl/.test(code);
 if(!relevant)continue;
 if(/CBmKq8ng|Dvvi7yjv|nodes\/22\./.test(url))console.log(JSON.stringify({event:'player_public_module_code',path:new URL(url).pathname,code:sanitize(code.slice(0,18000))}));
 console.log(JSON.stringify({event:'player_module',path:new URL(url).pathname,bytes:code.length,imports:imports.length}));
 for(const term of ['/api/','m3u8','streamUrl','sources:','fetch(','/v1/','resolveSourcesBaseUrl','platform','origin:','backend']){
  let from=0,count=0;
  while(count++<5){const i=code.indexOf(term,from);if(i<0)break;console.log(JSON.stringify({event:'player_api_code',term,path:new URL(url).pathname,excerpt:sanitize(code.slice(Math.max(0,i-170),i+350))}));from=i+term.length;}
 }
}
console.log(JSON.stringify({event:'player_inspection_finished',modules:seen.size}));
