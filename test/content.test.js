import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createCipheriv} from 'node:crypto';
import {blockedSlate,inspectContent} from '../src/content-inspector.js';
import {validateMedia,validHls,videoPrefix} from '../src/media.js';
import {FprimeSource} from '../src/fprime-source.js';
import {BrowserSource,moviepalServers} from '../src/browser-source.js';
import {createAddon} from '../src/addon.js';
import {createServer} from '../src/server.js';

const warning=await readFile(new URL('./fixtures/atlantic-warning.ts',import.meta.url));
const playlist='#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\n1.ts\n#EXT-X-ENDLIST';
const response=(url,body)=>({url,status:200,headers:{},body:Buffer.isBuffer(body)?body:Buffer.from(body)});
const getWarning=async url=>response(url,url.includes('.m3u8')?playlist:warning);

test('actual Atlantic response is a valid video, but its decoded frame is rejected',async()=>{
  assert.equal(validHls(playlist),true);assert.equal(videoPrefix(warning),true);
  assert.deepEqual(await inspectContent(warning),{ok:false,reason:'blocked-slate'});
  assert.equal(await validateMedia({url:'https://cdn.test/exact-title.m3u8'},getWarning),null);
});

test('notice matching handles punctuation and rejects the reproduced warning text',()=>{
  for(const text of ['atlantic.st','ATLANTIC . ST',"if you are using Cloudflare Warp VPN, please disable it",'use classroom.best instead'])assert.equal(blockedSlate(text),true);
  for(const text of ['The Matrix','Atlantic Ocean','A movie with subtitles',''])assert.equal(blockedSlate(text),false);
});

test('a real decoded control frame is accepted, corrupt MPEG-TS signatures fail closed',async()=>{
  const good=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=10',
    '-t','1','-c:v','libx264','-threads','1','-preset','ultrafast','-f','mpegts','pipe:1'],{maxBuffer:1_000_000});
  assert.equal(good.status,0,'ffmpeg is required for the real content guard regression tests');
  assert.equal((await inspectContent(good.stdout)).ok,true);
  const fake=Buffer.alloc(1024);fake[0]=fake[188]=fake[376]=0x47;
  assert.equal(videoPrefix(fake),true);assert.equal((await inspectContent(fake)).ok,false);
});

test('AES-128 transport encryption cannot hide an Atlantic warning from the frame check',async()=>{
  const key=Buffer.alloc(16,7),iv=Buffer.alloc(16);iv.writeBigUInt64BE(9n,8);
  const cipher=createCipheriv('aes-128-cbc',key,iv),encrypted=Buffer.concat([cipher.update(warning),cipher.final()]);
  const encryptedPlaylist=playlist.replace('#EXTINF:', '#EXT-X-MEDIA-SEQUENCE:9\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:');
  const result=await validateMedia({url:'https://cdn.test/encrypted.m3u8'},async url=>response(url,url.includes('.m3u8')?encryptedPlaylist:url.includes('key.bin')?key:encrypted));
  assert.equal(result,null);
});

test('all installed add-on aliases suppress a decodable blocked video returned by Fprime',async()=>{
  const key='11'.repeat(32),code=`const endpoint="https://source.test/astra",key="${key}",prefix="as_";/* AES-GCM */`;
  const source=new FprimeSource({get:async url=>response(url,
    url==='https://fprime.at/'?'<script src="/assets/index-test.js"></script>':url.endsWith('index-test.js')?'import("./Watch-test.js")':
    url.endsWith('Watch-test.js')?code:url.includes('/astra?')?JSON.stringify({sources:{Astra:{url:'https://cdn.test/title.m3u8'}}}):url.includes('.m3u8')?playlist:warning)});
  const browser=new BrowserSource();browser.fprime=source;
  const dir=async()=>({sources:[{id:'fprime-at',name:'Fprime'}]});
  const addon=createAddon({getDirectory:dir,getMetadata:async()=>({name:'The Matrix',tmdb:603}),browser});
  const server=createServer(addon,dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const prefix of ['','/native','/bridge','/bridge/native']) {
      const data=await(await fetch(`${base}${prefix}/stream/movie/tt0133093.json`)).json();
      assert.deepEqual(data.streams,[],prefix||'root alias');
    }
    const play=await fetch(`${base}/play/movie/tt0133093`,{redirect:'manual'});assert.equal(play.status,503);
  } finally {await new Promise(r=>server.close(r));await addon.close();}
});

test('MoviePal switches server after a rejected video without leaving the selected title page',async()=>{
  const candidates=[{url:'https://cdn.test/warning.m3u8'}],clicked=[];
  const page={getByRole:(_role,{name})=>({first:()=>({isVisible:async()=>true,click:async()=>{clicked.push(name);candidates.push({url:'https://cdn.test/control.m3u8'});}})})};
  const result=await moviepalServers(page,candidates,()=>{candidates.length=0;},{verify:async list=>list.filter(c=>c.url.includes('/control.'))});
  assert.deepEqual(clicked,['Beta']);assert.equal(result[0].url,'https://cdn.test/control.m3u8');
});
