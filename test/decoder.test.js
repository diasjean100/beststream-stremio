import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {Readable} from 'node:stream';
import {MediaRelay} from '../src/relay.js';
import {createServer} from '../src/server.js';
const hasDecoder=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
const run=args=>new Promise((resolve,reject)=>{
  const child=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','error',...args],{stdio:['ignore','ignore','pipe']});let error='';
  child.stderr.on('data',b=>{if(error.length<3000)error+=b.toString().replace(/https?:\/\/\S+/g,'[media]');});
  const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
  child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(error||'Falha do decodificador'));});
});
test('native relay feeds decodable video and audio to FFmpeg, including HLS segment filenames',{skip:!hasDecoder,timeout:30000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'beststream-decoder-'));let server;
  try{
    await run(['-f','lavfi','-i','testsrc2=size=160x90:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','6','-c:v','libx264','-preset','ultrafast','-g','20','-c:a','aac','-b:a','32k','-f','hls','-hls_time','2','-hls_list_size','0',join(dir,'index.m3u8')]);
    const relay=new MediaRelay({open:async url=>({status:200,url,headers:{},body:Readable.from([await readFile(join(dir,basename(new URL(url).pathname)))])})});
    const fake={resolve:async()=>({streams:[{url:'https://fixture.test/index.m3u8',behaviorHints:{filename:'fixture.m3u8'}}]}),close:async()=>{}};
    server=createServer(fake,async()=>({sources:[]}),{relay});await new Promise(r=>server.listen(0,'127.0.0.1',r));
    await run(['-i',`http://127.0.0.1:${server.address().port}/bridge/play/movie/tt0133093`,'-t','4','-map','0:v:0','-map','0:a:0','-f','null','-']);
    assert.equal(relay.sessions.size,1);
  }finally{if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
