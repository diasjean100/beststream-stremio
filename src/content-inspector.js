import {spawn} from 'node:child_process';

// The CDN can return a perfectly decodable movie-length video containing only
// a block notice. Container signatures and HTTP 200 do not detect that case.
export function blockedSlate(text) {
  const words=String(text).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  return /\batlantic st\b|\bclassroom best\b|\bcloudflare warp\b|\bunblocked school proxy\b|\b(?:disable|turn off) (?:your )?vpn\b/.test(words);
}

function processBytes(binary,args,input,maxBytes,timeout=6000) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:['pipe','pipe','ignore'],env:{...process.env,OMP_THREAD_LIMIT:'1'}});
    const chunks=[];let bytes=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('inspection-timeout'));},timeout);
    child.on('error',()=>finish(Error('inspector-unavailable')));
    child.stdout.on('data',chunk=>{
      bytes+=chunk.length;
      if(bytes>maxBytes){child.kill('SIGKILL');finish(Error('inspection-output-limit'));}
      else chunks.push(chunk);
    });
    child.stdin.on('error',()=>{});
    child.on('close',code=>finish(code===0?null:Error('inspection-decode-failed'),Buffer.concat(chunks)));
    child.stdin.end(input);
  });
}

let queue=Promise.resolve();
export async function inspectContent(bytes) {
  // Keep the decoder/OCR memory bounded alongside Chromium on the free host.
  const task=queue.then(async()=>{
    try {
      const frame=await processBytes('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','pipe',
        '-probesize','1048576','-analyzeduration','2000000','-threads','1','-i','pipe:0','-map','0:v:0',
        '-frames:v','1','-vf','scale=min(960\\,iw):-2','-threads','1','-f','image2pipe','-vcodec','png','pipe:1'],bytes,2_000_000);
      if(frame.length<100)return {ok:false,reason:'unverified-frame'};
      const text=await processBytes('tesseract',['stdin','stdout','-l','eng','--psm','11'],frame,16000);
      return blockedSlate(text.toString())?{ok:false,reason:'blocked-slate'}:{ok:true,method:'frame-and-ocr'};
    } catch(error) {return {ok:false,reason:error.message};}
  });
  queue=task.catch(()=>{});
  return task;
}
