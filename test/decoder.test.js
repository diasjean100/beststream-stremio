import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import http from 'node:http';
import {createAddon} from '../src/addon.js';
import {createServer} from '../src/server.js';
const hasDecoder=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
const run=args=>new Promise((resolve,reject)=>{
  const child=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','error',...args],{stdio:['ignore','ignore','pipe']});let error='';
  child.stderr.on('data',b=>{if(error.length<3000)error+=b.toString().replace(/https?:\/\/\S+/g,'[media]');});
  const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
  child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(error||'Falha do decodificador'));});
});
test('URL-only bridge decodes video and audio directly from the source while the add-on serves only metadata',{skip:!hasDecoder,timeout:30000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'beststream-decoder-'));let server,source;const received=[];
  try{
    await run(['-f','lavfi','-i','testsrc2=size=160x90:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','6','-c:v','libx264','-preset','ultrafast','-g','20','-c:a','aac','-b:a','32k','-f','hls','-hls_time','2','-hls_list_size','0',join(dir,'index.m3u8')]);
    source=http.createServer(async(req,res)=>{received.push(req.url);if(req.headers['x-source-test']!=='required'){res.writeHead(403);res.end();return;}try{res.writeHead(200,{'Content-Type':req.url.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'});res.end(await readFile(join(dir,basename(req.url))));}catch{res.end();}});
    await new Promise(r=>source.listen(0,'127.0.0.1',r));
    const sourceUrl=`http://127.0.0.1:${source.address().port}/index.m3u8`;
    const addon=createAddon({getDirectory:async()=>({sources:[{id:'moviepal-live',name:'Fixture'}]}),getMetadata:async()=>({name:'Fixture',tmdb:42}),browser:{resolve:async()=>({status:'resolved',streams:[{url:sourceUrl,format:'HLS',headers:{'X-Source-Test':'required'}}]}),close:async()=>{}}});
    server=createServer(addon,async()=>({sources:[]}));const addonRequests=[];server.on('request',req=>addonRequests.push(req.url));
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const result=await(await fetch(`http://127.0.0.1:${server.address().port}/bridge/native/stream/movie/tt0133093.json`)).json();
    assert.equal(result.streams[0].url,sourceUrl);
    await run(['-headers','X-Source-Test: required\r\n','-i',result.streams[0].url,'-t','4','-map','0:v:0','-map','0:a:0','-f','null','-']);
    assert.ok(received.some(p=>p.endsWith('.ts')));assert.deepEqual(addonRequests,['/bridge/native/stream/movie/tt0133093.json']);
  }finally{if(server)await new Promise(r=>server.close(r));if(source)await new Promise(r=>source.close(r));await rm(dir,{recursive:true,force:true});}
});
