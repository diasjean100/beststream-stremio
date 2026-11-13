import test from 'node:test';
import assert from 'node:assert/strict';
import {Cache} from '../src/cache.js';
import {publicAddress,publicTarget} from '../src/network.js';
import {parseVideo,metadata} from '../src/metadata.js';
import {BOOTSTRAP,parseDirectory} from '../src/directory.js';
import {validHls,mediaUrl,validateMedia,playerIdentity,streamObject,videoPrefix} from '../src/media.js';
import {sameIdentity,hasChallenge,nexaPlaybackUrl,nexaEpisodeConfirmed,normalize} from '../src/browser-source.js';
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
  const ts=Buffer.alloc(1024);ts[0]=ts[188]=ts[376]=0x47;
  const mediaFixture=async url=>({status:200,url,body:url.endsWith('a.ts')?ts:Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\na.ts'),headers:{}});
  const verified=await validateMedia({url:'https://example.com/a.m3u8'},mediaFixture);
  assert.equal(verified.format,'HLS');
  const noExtension=await validateMedia({url:'https://example.com/playlist?token=test',format:'HLS'},mediaFixture);
  assert.equal(noExtension.format,'HLS');
  assert.equal(await validateMedia({url:'file:///etc/passwd',format:'HLS'},async()=>{throw Error('must not fetch')}),null);
  assert.equal(await validateMedia({url:'https://example.com/a.mp4'},async()=>({status:200,body:Buffer.from('<html>blocked</html>'),headers:{'content-type':'video/mp4'}})),null);
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
test('both installed IDs return an immediate native bridge without browser links',async()=>{
  let calls=0;
  const addon=createAddon({getMetadata:async()=>{calls++;throw Error('must resolve on Play only');}});
  for(const native of [false,true]){
    const result=await addon.streams('series','tt0903747:1:2','https://addon.test',native,true);
    assert.equal(result.streams.length,1);
    assert.equal(result.streams[0].url,'https://addon.test/bridge/play/series/tt0903747%3A1%3A2');
    assert.equal(result.streams[0].externalUrl,undefined);
    assert.match(result.streams[0].title,/confirmar/);
    assert.equal(result.cacheMaxAge,0);
  }
  assert.equal(calls,0);
  assert.deepEqual(manifest().resources[0].idPrefixes,['tt']);
  assert.equal(manifest().id,'br.jean.beststream');assert.equal(manifest(true).id,'br.jean.beststream.native');
});
test('Play resolution retains only verified video candidates returned by a provider',async()=>{
  const addon=createAddon({getDirectory:async()=>({sources:BOOTSTRAP}),getMetadata:async()=>({name:'Example'}),browser:{resolve:async()=>({status:'resolved',streams:[{url:'https://cdn.test/video.m3u8',format:'HLS',headers:{}}]}),close:async()=>{}}});
  const result=await addon.resolve('series','tt0903747:1:1');
  assert.equal(result.streams[0].url,'https://cdn.test/video.m3u8');assert.equal(result.streams[0].externalUrl,undefined);
});
test('catalog preserves Unicode and encoded search titles',async()=>{
  let captured;
  const addon=createAddon({getSearch:async(type,q,skip)=>{captured={type,q,skip};return [{id:'tt0063350',name:q,type}];}});
  const result=await addon.catalog('movie','beststream-movies',new URLSearchParams('search=Cora%C3%A7%C3%A3o%20%26%20A%C3%A7%C3%A3o&skip=0'));
  assert.deepEqual(captured,{type:'movie',q:'Coração & Ação',skip:0});assert.equal(result.metas[0].name,captured.q);
});
test('HTTP protocol, CORS, install page and error states',async()=>{
  let httpSearch;
  const fake=createAddon({getDirectory:async()=>({sources:BOOTSTRAP}),getMetadata:async()=>({name:'Example'}),getSearch:async(_type,q)=>{httpSearch=q;return [];},browser:{resolve:async()=>({status:'not-found',streams:[]}),close:async()=>{}}});
  const server=createServer(fake,async()=>({sources:BOOTSTRAP,origin:'snapshot'}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const m=await fetch(`${base}/manifest.json`,{headers:{Host:'untrusted.test','X-Forwarded-Host':'evil.test'}});assert.equal(m.status,200);assert.equal(m.headers.get('access-control-allow-origin'),'*');
    assert.equal((await m.json()).id,'br.jean.beststream');
    assert.equal((await (await fetch(`${base}/native/manifest.json`)).json()).id,'br.jean.beststream.native');
    const s=await (await fetch(`${base}/stream/movie/tt0063350.json`,{headers:{Host:'evil.test'}})).json();assert.deepEqual(s.streams,[]);
    assert.deepEqual((await(await fetch(`${base}/stream/movie/garbage.json`)).json()).streams,[]);
    assert.equal((await fetch(`${base}/api/resolve?type=movie&id=wrong`)).status,400);
    assert.equal((await fetch(`${base}/anything.json`)).status,404);
    assert.equal((await fetch(`${base}/healthz`)).status,200);
    assert.match(await(await fetch(base)).text(),/BestStream/);
    assert.match((await fetch(`${base}/style.css`)).headers.get('content-type'),/text\/css/);
    assert.equal((await fetch(`${base}/api/sources`)).status,200);
    const title='Coração & Ação 100%';
    await fetch(`${base}/catalog/movie/beststream-movies/search=${encodeURIComponent(title)}.json`);
    assert.equal(httpSearch,title);
    assert.equal((await fetch(`${base}/manifest.json`,{method:'OPTIONS'})).status,204);
    assert.equal((await fetch(`${base}/manifest.json`,{method:'POST'})).status,405);
  }finally{await new Promise(r=>server.close(r));}
});

test('provider security challenges are reported before attempting playback',()=>{
  assert.equal(hasChallenge('Just a moment...', 'Performing security verification'),true);
  assert.equal(hasChallenge('BingeBang','This website uses a security service to protect against malicious bots.'),true);
  assert.equal(hasChallenge('BingeBang','Search movies and TV shows'),false);
  assert.equal(hasChallenge('Verifying your browser - NOXX',''),true);
});
test('Cinemeta supplies the TMDB mapping instead of guessing by title',async()=>{
  assert.equal(normalize('Coração & Ação'),'coracao acao');
  assert.notEqual(normalize('你好'),normalize('再见'));
  const meta=await metadata(parseVideo('movie','tt0133093'),async()=>({meta:{id:'tt0133093',name:'The Matrix',type:'movie',moviedb_id:603,year:'1999'}}));
  assert.equal(meta.tmdb,603);assert.equal(meta.name,'The Matrix');
  assert.equal(nexaPlaybackUrl(parseVideo('movie','tt0133093'),meta),'https://nexa.mov/watch/tmdb-movie/603');
  assert.equal(nexaPlaybackUrl(parseVideo('series','tt0903747:1:1'),{tmdb:1396}),'https://nexa.mov/watch/tmdb-tv/1396/s1-e1');
  assert.equal(nexaPlaybackUrl(parseVideo('series','tt0903747:0:1'),{tmdb:1396}),null);
  assert.equal(nexaPlaybackUrl(parseVideo('movie','tt0133093'),{tmdb:'https://attacker.test'}),null);
});
test('second provider requires the requested episode in its visible player',()=>{
  const ep=parseVideo('series','tt0903747:1:2');
  assert.equal(nexaEpisodeConfirmed('Breaking Bad S01 · E02',ep),true);
  assert.equal(nexaEpisodeConfirmed('Breaking Bad Season 1 Episode 2',ep),true);
  assert.equal(nexaEpisodeConfirmed('Breaking Bad 1x2',ep),true);
  assert.equal(nexaEpisodeConfirmed('Breaking Bad S01 E20',ep),false);
  assert.equal(nexaEpisodeConfirmed('Breaking Bad S01 E01',ep),false);
  assert.equal(nexaEpisodeConfirmed('Breaking Bad',ep),false);
});
test('source failures fall through in order without losing the requested title and episode',async()=>{
  const calls=[];
  const addon=createAddon({getDirectory:async()=>({sources:BOOTSTRAP}),getMetadata:async()=>({name:'The Matrix',tmdb:603}),browser:{resolve:async(p,v)=>{calls.push(p.id);assert.equal(v.id,'tt0133093');if(p.id==='fprime-at')throw Error('source offline');return p.id==='nexa-mov'?{status:'web-only',streams:[],pageUrl:'https://nexa.mov/watch/tmdb-movie/603'}:{status:'blocked',streams:[]};},close:async()=>{}}});
  const r=await addon.resolve('movie','tt0133093');
  assert.deepEqual(calls,['fprime-at','moviepal-live','nexa-mov','bingebang-st']);
  assert.equal(r.pageUrl,'https://nexa.mov/watch/tmdb-movie/603');assert.deepEqual(r.streams,[]);
  assert.equal(r.attempts.length,4);
});
test('slow providers never block the Stremio stream list',async()=>{
  const addon=createAddon({getMetadata:()=>new Promise(()=>{}),getDirectory:()=>new Promise(()=>{})});
  const result=await Promise.race([addon.streams('movie','tt0063350','https://addon.test',true,true),new Promise((_,reject)=>setTimeout(()=>reject(Error('stream list stalled')),100))]);
  assert.equal(result.streams[0].url,'https://addon.test/bridge/play/movie/tt0063350');
});
test('an unavailable source is reported by Play resolution and never replaced with HTML',async()=>{
  const addon=createAddon({getDirectory:async()=>({sources:BOOTSTRAP}),getMetadata:async()=>({name:'Breaking Bad',tmdb:1396}),browser:{resolve:async()=>({status:'blocked',streams:[]}),close:async()=>{}}});
  const result=await addon.resolve('series','tt0903747:2:3');assert.deepEqual(result.streams,[]);
  for(const native of [false,true]){
    const r=await addon.streams('series','tt0903747:2:3','https://addon.test',native);
    assert.deepEqual(r.streams,[]);
  }
});
test('identical concurrent Play resolutions share the same provider work',async()=>{
  let count=0;
  const addon=createAddon({getDirectory:async()=>({sources:BOOTSTRAP}),getMetadata:async()=>({name:'Example'}),browser:{resolve:async()=>{
    count++;await new Promise(resolve=>setTimeout(resolve,10));return{status:'resolved',streams:[{url:'https://cdn.test/movie.m3u8',format:'HLS',headers:{}}]};
  },close:async()=>{}}});
  const [first,second]=await Promise.all([addon.resolve('movie','tt0133093'),addon.resolve('movie','tt0133093')]);
  assert.equal(count,1);assert.equal(first.streams[0].url,second.streams[0].url);
});

test('HLS requires a real video segment, including disguised image paths',async()=>{
  const ts=Buffer.alloc(1024);ts[0]=ts[188]=ts[376]=0x47;
  assert.equal(videoPrefix(ts),true);
  assert.equal(videoPrefix(Buffer.alloc(1024)),false);
  const playlist=Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nsegment.png');
  const candidate={url:'https://media.test/title.m3u8',headers:{Origin:'https://source.test'}};
  for(const status of [403,404])assert.equal(await validateMedia(candidate,async url=>({status:url.endsWith('.png')?status:200,url,headers:{},body:playlist})),null);
  const calls=[];
  const result=await validateMedia(candidate,async(url,options)=>{calls.push({url,options});return {status:200,url,headers:{},body:url.endsWith('.png')?ts:playlist};});
  assert.ok(result);assert.equal(calls[1].options.prefixBytes,65536);assert.equal(calls[1].options.headers.Origin,'https://source.test');
  assert.equal(calls[1].options.headers.Range,undefined);
});

test('HLS master validation follows its variant and rejects a non-video segment',async()=>{
  const master=Buffer.from('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\n720/index.m3u8');
  const media=Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\n1.ts');
  const paths=[];
  const result=await validateMedia({url:'https://media.test/master.m3u8'},async url=>{paths.push(url);return {status:200,url,headers:{},body:url.endsWith('master.m3u8')?master:url.endsWith('index.m3u8')?media:Buffer.alloc(1024)};});
  assert.equal(result,null);assert.deepEqual(paths,['https://media.test/master.m3u8','https://media.test/720/index.m3u8','https://media.test/720/1.ts']);
});
