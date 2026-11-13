import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createAddon} from '../src/addon.js';
import {createServer} from '../src/server.js';
import {BrowserSource} from '../src/browser-source.js';
import {FprimeSource,parseFprimeConfig,unwrapPublicUrl} from '../src/fprime-source.js';

const fixtureDirectory=async()=>({sources:[{id:'moviepal-live',name:'Fixture'}]});
const listen=async server=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;};
const close=server=>new Promise(r=>server.close(r));
const ts=Buffer.alloc(1024);ts[0]=ts[188]=ts[376]=0x47;
const playlist='#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nsegment.ts?token=private\n#EXT-X-ENDLIST';

test('all installed HTTP aliases give the source URL and legacy Play redirects without relaying video',async()=>{
  const addon=createAddon({getDirectory:fixtureDirectory,getMetadata:async()=>({name:'Fixture',tmdb:42}),browser:{resolve:async()=>({status:'resolved',streams:[{url:'https://cdn.test/movie.m3u8',format:'HLS',headers:{Origin:'https://source.test'}}]}),close:async()=>{}}});
  const server=createServer(addon,fixtureDirectory),base=await listen(server);
  try{
    for(const prefix of ['','/native','/bridge','/bridge/native']){
      const result=await(await fetch(`${base}${prefix}/stream/movie/tt0133093.json`)).json();
      assert.equal(result.streams[0].url,'https://cdn.test/movie.m3u8');assert.equal(result.streams[0].externalUrl,undefined);
      assert.equal(result.streams[0].behaviorHints.proxyHeaders.request.Origin,'https://source.test');
    }
    const play=await fetch(`${base}/bridge/play/movie/tt0133093`,{redirect:'manual'});
    assert.equal(play.status,307);assert.equal(play.headers.get('location'),'https://cdn.test/movie.m3u8');assert.equal(await play.text(),'');
    assert.equal((await fetch(`${base}/relay/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/0.ts?url=https://cdn.test/movie.m3u8`)).status,410);
    const page=await(await fetch(base)).text();assert.doesNotMatch(page,/Abrir site|bridge-mode/);
  }finally{await close(server);}
});

test('Play reports unavailable and bounded timeout failures without pretending a video was found',async()=>{
  for(const resolve of [async()=>({streams:[]}),()=>new Promise(()=>{})]){
    const fake={manifest:()=>({}),resolve,close:async()=>{}};
    const server=createServer(fake,fixtureDirectory,{playTimeoutMs:10}),base=await listen(server);
    try{const r=await fetch(`${base}/play/series/tt1567432:1:1`);assert.equal(r.status,503);assert.equal(r.headers.get('content-type'),'application/json; charset=utf-8');}
    finally{await close(server);}
  }
});

test('different browser queries are queued instead of cached as empty busy results',async()=>{
  const browser=new BrowserSource();let active=0,peak=0;const visited=[];
  browser.resolveInBrowser=async(_provider,video)=>{active++;peak=Math.max(peak,active);visited.push(video.id);await new Promise(r=>setTimeout(r,5));active--;return{status:'not-found',streams:[]};};
  const values=await Promise.all(['tt0133093','tt1375666'].map(id=>browser.resolve({id:'nexa-mov'},{id},{})));
  assert.equal(peak,1);assert.deepEqual(visited,['tt0133093','tt1375666']);assert.ok(values.every(x=>x.status==='not-found'));
});

test('a queued query that has expired never starts another browser job',async()=>{
  const browser=new BrowserSource(),visited=[];let release;
  const hold=new Promise(resolve=>{release=resolve;});
  browser.resolveInBrowser=async(_provider,video)=>{visited.push(video.id);if(video.id==='first')await hold;return{status:'not-found',streams:[]};};
  const first=browser.resolve({id:'moviepal-live'},{id:'first'},{});await Promise.resolve();
  const stale=browser.resolve({id:'moviepal-live'},{id:'stale'},{},{deadline:Date.now()+5});
  await new Promise(resolve=>setTimeout(resolve,15));release();await first;
  assert.equal((await stale).status,'timeout');assert.deepEqual(visited,['first']);
});

test('Fprime discovers its current public endpoint and validates the requested exact episode without executing scripts',async()=>{
  const key='11'.repeat(32),sourceCode=`const endpoint="https://source.test/astra",key="${key}",prefix="as_";/* AES-GCM */throw Error("remote code must never execute");`;
  const calls=[];
  const source=new FprimeSource({inspect:async()=>({ok:true,method:'unit-structural-fixture'}),get:async(url,options)=>{
    calls.push({url,options});
    const body=url==='https://fprime.at/'?'<script src="/assets/index-current.js"></script>':url.endsWith('index-current.js')?'import("./Watch-current.js")':url.endsWith('Watch-current.js')?sourceCode:url.includes('/astra?')?JSON.stringify({sources:{Astra:{url:'https://cdn.test/episode.m3u8'}}}):url.includes('episode.m3u8')?playlist:ts;
    return {url,status:200,headers:{},body:Buffer.isBuffer(body)?body:Buffer.from(body)};
  }});
  const result=await source.resolve({type:'series',season:2,episode:3},{tmdb:1396});
  assert.equal(result.status,'resolved');assert.equal(result.streams.length,1);
  const requested=new URL(calls.find(c=>c.url.includes('/astra?')).url);
  assert.equal(requested.searchParams.get('type'),'tv');assert.equal(requested.searchParams.get('seasonId'),'2');assert.equal(requested.searchParams.get('episodeId'),'3');
  assert.equal(calls.at(-1).options.headers.Origin,'https://fprime.at');
  assert.equal(parseFprimeConfig('arbitrary script'),null);
  const bad=new FprimeSource({get:async()=>({status:403})});assert.deepEqual((await bad.resolve({type:'movie'},{tmdb:42})).streams,[]);
});

test('public URL wrapping is decoded independently and malformed or private-scheme payloads are rejected',async()=>{
  const keyBytes=Buffer.alloc(32,4),iv=Buffer.alloc(12,5),key=await webcrypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['encrypt']);
  const wrapped=Buffer.from(await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,Buffer.from('https://cdn.test/video.m3u8')));
  const raw='as_'+Buffer.concat([iv,wrapped]).toString('hex');
  assert.equal(await unwrapPublicUrl(raw,keyBytes.toString('hex')),'https://cdn.test/video.m3u8');
  await assert.rejects(unwrapPublicUrl('as_deadbeef',keyBytes.toString('hex')));
  await assert.rejects(unwrapPublicUrl(raw,'00'.repeat(32)));
});
