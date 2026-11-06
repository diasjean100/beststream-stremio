import test from 'node:test';
import assert from 'node:assert/strict';
import {Cache} from '../src/cache.js';
import {publicAddress,publicTarget} from '../src/network.js';
import {parseVideo} from '../src/metadata.js';
import {BOOTSTRAP,parseDirectory} from '../src/directory.js';
import {validHls,mediaUrl,validateMedia,playerIdentity,streamObject} from '../src/media.js';
import {sameIdentity} from '../src/browser-source.js';
import {createAddon,manifest} from '../src/addon.js';
import {createServer} from '../src/server.js';

test('IMDb movie and exact series episode are distinct',()=>{
  assert.equal(parseVideo('movie','tt0063350').imdb,'tt0063350');
  assert.deepEqual(parseVideo('series','tt0903747:0:1'),{type:'series',id:'tt0903747:0:1',imdb:'tt0903747',season:0,episode:1});
  for(const [type,id]of [['movie','tt0063350:1:1'],['series','tt0903747'],['series','tt0903747:1:0'],['movie','http://127.0.0.1'],['tv','tt0063350']])assert.equal(parseVideo(type,id),null);
});
test('network guard rejects local, metadata, reserved and mapped addresses',async()=>{
  for(const ip of ['127.0.0.1','0.0.0.0','10.1.2.3','172.31.1.1','192.168.1.1','169.254.169.254','100.64.0.1','198.18.1.2','224.1.1.1','::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
  for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);
  for(const url of ['file:///etc/passwd','http://127.1/','http://user:pass@site.test/','https://example.com:8443/'])await assert.rejects(publicTarget(url,async()=>[{address:'1.1.1.1',family:4}]));
  await assert.rejects(publicTarget('https://site.test',async()=>[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}]));
});
test('cache deduplicates in-flight calls, evicts entries and does not cache errors',async()=>{
  const c=new Cache(1);let n=0;const fn=async()=>++n;
  assert.deepEqual(await Promise.all([c.use('a',1000,fn),c.use('a',1000,fn)]),[1,1]);
  c.set('b',2,1000);assert.equal(c.get('a'),undefined);
  await assert.rejects(c.use('fail',1000,async()=>{throw Error('fail')}));
  assert.equal(await c.use('fail',1000,async()=>3),3);
  c.set('old',0,-1);assert.equal(c.get('old'),undefined);
});
test('directory extracts ranking sources and ignores navigation and audit links',()=>{
  const sources=parseDirectory('<a href="https://ads.test">Ad</a><table><tr><th>Rank</th></tr><tr><td><a href="https://bingebang.st/">BingeBang</a></td></tr><tr><td><a href="https://nexa.mov/">Nexa <span>NEW</span></a></td></tr><tr><td><a href="https://nexa.mov/">Duplicate</a></td></tr></table>');
  assert.equal(sources.length,2);assert.equal(sources[0].adapter,'browser');assert.equal(sources[1].name,'Nexa');
  assert.equal(BOOTSTRAP.length,55);assert.equal(new Set(BOOTSTRAP.map(p=>p.id)).size,55);
});
test('HTML, iframe pages, DRM and fake playlists are never direct streams',async()=>{
  assert.equal(mediaUrl('https://example.com/embed/123'),false);
  assert.equal(mediaUrl('https://example.com/movie.m3u8?token=abc'),true);
  assert.equal(validHls('<html>#EXTM3U</html>'),false);
  assert.equal(validHls('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES\n#EXTINF:4\na.ts'),false);
  assert.equal(await validateMedia({url:'https://example.com/a.m3u8'},async()=>({status:200,body:Buffer.from('<html>blocked</html>'),headers:{}})),null);
  assert.equal(await validateMedia({url:'https://example.com/a.mp4'},async()=>({status:403,body:Buffer.from('denied'),headers:{}})),null);
  const verified=await validateMedia({url:'https://example.com/a.m3u8'},async()=>({status:200,url:'https://example.com/a.m3u8',body:Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\na.ts'),headers:{}}));
  assert.equal(verified.format,'HLS');
  const stream=streamObject({...verified,headers:{Referer:'https://bingebang.st/'}},BOOTSTRAP[0]);
  assert.equal(stream.behaviorHints.notWebReady,true);assert.equal(stream.behaviorHints.proxyHeaders.request.Referer,'https://bingebang.st/');
});
test('inline player identity decoding executes no remote JavaScript',()=>{
  const text='window.__BB_PLAYER__={imdb:"tt0903747",season:1,episode:2};';
  const key=[23,31,11],bytes=[...Buffer.from(text)].map((b,i)=>b^key[i%key.length]);
  const encoded=`(function(){var k=${JSON.stringify(key)},d=${JSON.stringify(bytes)};throw new Error("must not execute");})()`;
  const id=playerIdentity(encoded);assert.deepEqual(id,{imdb:'tt0903747',season:1,episode:2});
  assert.equal(sameIdentity(id,parseVideo('series','tt0903747:1:1')),false);
  assert.equal(sameIdentity(id,parseVideo('series','tt0903747:1:2')),true);
});
test('IMDb streams can be requested from other catalogs and native mode has no browser substitute',async()=>{
  let calls=0;
  const addon=createAddon({getDirectory:async()=>({sources:BOOTSTRAP}),getMetadata:async()=>({name:'Example',year:'2020'}),browser:{resolve:async()=>{calls++;return {streams:[],status:'not-found'};},close:async()=>{}}});
  const standard=await addon.streams('movie','tt0063350','https://addon.test');
  assert.equal(standard.streams.length,1);assert.ok(standard.streams[0].externalUrl);assert.equal(standard.streams[0].url,undefined);
  const native=await addon.streams('movie','tt0063350','https://addon.test',true);
  assert.deepEqual(native.streams,[]);assert.equal(calls,1);
  assert.deepEqual(manifest().resources[0].idPrefixes,['tt']);assert.notEqual(manifest(true).id,manifest().id);
});
test('native results contain real validated candidates, not directory homepages',async()=>{
  const addon=createAddon({getDirectory:async()=>({sources:BOOTSTRAP}),getMetadata:async()=>({name:'Example'}),browser:{resolve:async()=>({status:'resolved',streams:[{url:'https://cdn.test/video.m3u8',format:'HLS',headers:{}}]}),close:async()=>{}}});
  const result=await addon.streams('series','tt0903747:1:1','https://addon.test',true);
  assert.equal(result.streams.length,1);assert.equal(result.streams[0].url,'https://cdn.test/video.m3u8');assert.equal(result.streams[0].externalUrl,undefined);
});
test('catalog preserves Unicode and encoded search titles',async()=>{
  let captured;
  const addon=createAddon({getSearch:async(type,q,skip)=>{captured={type,q,skip};return [{id:'tt0063350',name:q,type}];}});
  const result=await addon.catalog('movie','beststream-movies',new URLSearchParams('search=Cora%C3%A7%C3%A3o%20%26%20A%C3%A7%C3%A3o&skip=0'));
  assert.deepEqual(captured,{type:'movie',q:'Coração & Ação',skip:0});assert.equal(result.metas[0].name,captured.q);
});
test('HTTP protocol, CORS, install page and error states',async()=>{
  const fake=createAddon({getDirectory:async()=>({sources:BOOTSTRAP}),getMetadata:async()=>({name:'Example'}),getSearch:async()=>[],browser:{resolve:async()=>({status:'not-found',streams:[]}),close:async()=>{}}});
  const server=createServer(fake,async()=>({sources:BOOTSTRAP,origin:'snapshot'}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const m=await fetch(`${base}/manifest.json`,{headers:{Host:'untrusted.test','X-Forwarded-Host':'evil.test'}});assert.equal(m.status,200);assert.equal(m.headers.get('access-control-allow-origin'),'*');
    assert.equal((await m.json()).id,'br.jean.beststream');
    assert.equal((await (await fetch(`${base}/native/manifest.json`)).json()).id,'br.jean.beststream.native');
    const s=await (await fetch(`${base}/stream/movie/tt0063350.json`,{headers:{Host:'evil.test'}})).json();assert.ok(s.streams[0].externalUrl.startsWith(base));
    assert.deepEqual((await(await fetch(`${base}/stream/movie/garbage.json`)).json()).streams,[]);
    assert.equal((await fetch(`${base}/api/resolve?type=movie&id=wrong`)).status,400);
    assert.equal((await fetch(`${base}/anything.json`)).status,404);
    assert.equal((await fetch(`${base}/healthz`)).status,200);
    assert.match(await(await fetch(base)).text(),/BestStream/);
    assert.match((await fetch(`${base}/style.css`)).headers.get('content-type'),/text\/css/);
    assert.equal((await fetch(`${base}/api/sources`)).status,200);
    assert.equal((await fetch(`${base}/manifest.json`,{method:'OPTIONS'})).status,204);
    assert.equal((await fetch(`${base}/manifest.json`,{method:'POST'})).status,405);
  }finally{await new Promise(r=>server.close(r));}
});
