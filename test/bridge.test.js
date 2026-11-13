import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {webcrypto} from 'node:crypto';
import {MediaRelay} from '../src/relay.js';
import {openResponse} from '../src/network.js';
import {createAddon} from '../src/addon.js';
import {createServer} from '../src/server.js';
import {BrowserSource} from '../src/browser-source.js';
import {FprimeSource,parseFprimeConfig,unwrapPublicUrl} from '../src/fprime-source.js';

const fixtureDirectory=async()=>({sources:[{id:'fprime-at',name:'Fprime'}]});
const listen=async server=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;};
const close=server=>new Promise(r=>server.close(r));
const ts=Buffer.alloc(1024);ts[0]=ts[188]=ts[376]=0x47;
const playlist='#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nsegment.ts?token=private\n#EXT-X-ENDLIST';

test('full HTTP path goes from stream selection to native playlist and video bytes with source headers',async()=>{
  const calls=[];
  const addon=createAddon({getDirectory:fixtureDirectory,getMetadata:async()=>({name:'Fixture',tmdb:42}),browser:{resolve:async()=>({status:'resolved',streams:[{url:'https://cdn.test/master.m3u8',format:'HLS',headers:{Referer:'https://fprime.at/',Origin:'https://fprime.at'}}]}),close:async()=>{}}});
  const relay=new MediaRelay({open:async(url,options)=>{calls.push({url,options});return {status:200,url,headers:{'content-type':url.includes('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'},body:Readable.from([url.includes('.m3u8')?Buffer.from(playlist):ts])};}});
  const server=createServer(addon,fixtureDirectory,{relay});const base=await listen(server);
  try{
    const data=await(await fetch(`${base}/native/stream/movie/tt0133093.json`)).json();
    const play=await fetch(data.streams[0].url,{redirect:'manual'});assert.equal(play.status,307);
    const media=await fetch(new URL(play.headers.get('location'),base));assert.match(media.headers.get('content-type'),/mpegurl/);
    const text=await media.text();assert.ok(!text.includes('cdn.test'));assert.ok(!text.includes('token=private'));
    const segment=text.split('\n').find(x=>x.startsWith('/relay/'));
    assert.deepEqual(Buffer.from(await(await fetch(base+segment)).arrayBuffer()),ts);
    assert.equal(calls.length,2);for(const call of calls)assert.equal(call.options.headers.Referer,'https://fprime.at/');
  }finally{await close(server);}
});

test('relay rewrites variants, audio, subtitles, keys and initialization fragments relative to the final playlist URL',()=>{
  const relay=new MediaRelay();const path=relay.register({url:'https://cdn.test/start.m3u8',format:'HLS'});
  const token=path.split('/')[2],session=relay.sessions.get(token);
  const text='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="../audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\n720/main?x=1\n#EXT-X-KEY:METHOD=AES-128,URI="key?x=2"\n#EXT-X-MAP:URI="init.mp4"';
  const rewritten=relay.rewrite(text,'https://cdn.test/final/master.m3u8',session,token);
  assert.ok(!rewritten.includes('https://'));assert.equal(session.urls.length,5);
  assert.equal(session.urls[1].url,'https://cdn.test/audio.m3u8');assert.equal(session.urls[2].playlist,true);
  assert.equal(session.urls[3].url,'https://cdn.test/final/key?x=2');assert.equal(session.urls[4].playlist,false);
  assert.throws(()=>relay.rewrite('<html>blocked</html>','https://cdn.test/',session,token));
  assert.throws(()=>relay.rewrite('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES\n#EXTINF:4,\na.ts','https://cdn.test/',session,token));
});

test('relay supports seeking, rejects expired/unknown sessions and never accepts an arbitrary URL parameter',async()=>{
  let now=100,calls=0,receivedRange;
  const relay=new MediaRelay({now:()=>now,ttl:100,open:async(url,options)=>{calls++;receivedRange=options.headers.Range;return{status:206,url,headers:{'content-length':'3','content-range':'bytes 2-4/10','accept-ranges':'bytes'},body:Readable.from([Buffer.from('234')])};}});
  const path=relay.register({url:'https://cdn.test/movie.mp4',format:'MP4'});
  const server=createServer(undefined,fixtureDirectory,{relay}),base=await listen(server);
  try{
    const r=await fetch(base+path,{headers:{Range:'bytes=2-4'}});assert.equal(r.status,206);assert.equal(await r.text(),'234');assert.equal(r.headers.get('content-range'),'bytes 2-4/10');assert.equal(receivedRange,'bytes=2-4');
    assert.equal((await fetch(`${base}/relay/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/0.bin?url=http://127.0.0.1/`)).status,410);
    now=201;assert.equal((await fetch(base+path)).status,410);assert.equal(calls,1);
  }finally{await close(server);}
  await assert.rejects(openResponse('http://127.0.0.1/'));
  await assert.rejects(openResponse('file:///etc/passwd'));
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

test('Fprime discovers its current public endpoint and validates the requested exact episode without executing scripts',async()=>{
  const key='11'.repeat(32),sourceCode=`const endpoint="https://source.test/astra",key="${key}",prefix="as_";/* AES-GCM */throw Error("remote code must never execute");`;
  const calls=[];
  const source=new FprimeSource({get:async(url,options)=>{
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
