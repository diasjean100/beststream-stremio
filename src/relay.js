import {randomBytes} from 'node:crypto';
import {openResponse} from './network.js';
import {validHls} from './media.js';

// Only URLs discovered in a verified provider playlist can be relayed. A caller
// cannot supply a destination, headers or a URL encoded in a query parameter.
export class MediaRelay {
  constructor({open=openResponse,now=Date.now,limit=32,ttl=6*60*60_000}={}) {
    this.open=open;this.now=now;this.limit=limit;this.ttl=ttl;this.sessions=new Map();
  }
  register(candidate) {
    for(const [key,s] of this.sessions)if(s.until<=this.now())this.sessions.delete(key);
    if(this.sessions.size>=this.limit)throw Error('Limite de reproduções simultâneas atingido');
    const token=randomBytes(24).toString('base64url');
    const s={until:this.now()+this.ttl,headers:candidate.headers||{},urls:[],index:new Map()};
    this.sessions.set(token,s);
    const path=this.resource(s,token,candidate.url,candidate.format==='HLS',candidate.format==='MP4'?'mp4':undefined);
    if(candidate.format==='MP4')s.urls[0].mp4=true;
    return path;
  }
  resource(session,token,value,playlist=false,hint) {
    const u=new URL(value);
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Recurso inválido');
    let index=session.index.get(u.href);
    if(index===undefined) {
      if(session.urls.length>=16000)throw Error('Playlist excede o limite de recursos');
      const ext=hint||/\.(ts|m4s|mp4|webm|vtt|aac|mp3|key)$/i.exec(u.pathname)?.[1].toLowerCase()||'ts';
      index=session.urls.length;session.urls.push({url:u.href,playlist,ext});session.index.set(u.href,index);
    } else if(playlist)session.urls[index].playlist=true;
    return `/relay/${token}/${index}.${session.urls[index].playlist?'m3u8':session.urls[index].ext}`;
  }
  rewrite(text,url,session,token) {
    if(!validHls(text))throw Error('A fonte não forneceu uma playlist de vídeo compatível');
    let variant=false;
    return text.split(/\r?\n/).map(line=>{
      const trimmed=line.trim();
      if(!trimmed)return line;
      if(trimmed.startsWith('#')) {
        const playlist=/^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF):/.test(trimmed);
        const hint=/^#EXT-X-(?:SESSION-)?KEY:/.test(trimmed)?'key':/^#EXT-X-MAP:/.test(trimmed)?'mp4':undefined;
        const result=line.replace(/URI="([^"]+)"/g,(_match,uri)=>`URI="${this.resource(session,token,new URL(uri,url).href,playlist,hint)}"`);
        if(trimmed.startsWith('#EXT-X-STREAM-INF:'))variant=true;
        return result;
      }
      const result=this.resource(session,token,new URL(trimmed,url).href,variant||/\.m3u8(?:$|[?#])/i.test(trimmed));
      variant=false;return result;
    }).join('\n');
  }
  async serve(path,req,res) {
    const match=/^\/relay\/([A-Za-z0-9_-]{32})\/(\d{1,5})\.(?:m3u8|bin|ts|m4s|mp4|webm|vtt|aac|mp3|key)$/.exec(path);
    const session=match&&this.sessions.get(match[1]);
    const entry=session?.urls[Number(match?.[2])];
    if(!session||!entry||session.until<=this.now()) {
      if(match)this.sessions.delete(match[1]);
      res.writeHead(410,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify({error:'Reprodução expirada. Abra o vídeo novamente no Stremio.'}));return;
    }
    const abort=new AbortController();
    res.once('close',()=>abort.abort());
    let upstream;
    try {
      const range=req.headers.range;
      if(range&&!/^bytes=\d*-\d*$/.test(range))throw Error('Intervalo inválido');
      upstream=await this.open(entry.url,{headers:{...session.headers,...(range?{Range:range}:{})},signal:abort.signal,method:req.method==='HEAD'?'HEAD':'GET'});
      if(![200,206].includes(upstream.status)) {
        upstream.body.destroy();res.writeHead(upstream.status===416?416:502,{'Cache-Control':'no-store'});
        res.end();return;
      }
      const hls=entry.playlist||/application\/(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(String(upstream.headers['content-type']||''));
      if(hls&&req.method!=='HEAD') {
        const chunks=[];let bytes=0;
        for await(const chunk of upstream.body){bytes+=chunk.length;if(bytes>2_000_000)throw Error('Playlist excede o limite');chunks.push(chunk);}
        const text=this.rewrite(Buffer.concat(chunks).toString('utf8'),upstream.url,session,match[1]);
        res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});res.end(text);return;
      }
      const mime={ts:'video/mp2t',m4s:'video/iso.segment',mp4:'video/mp4',webm:'video/webm',vtt:'text/vtt',aac:'audio/aac',mp3:'audio/mpeg'};
      const headers={'Content-Type':hls?'application/vnd.apple.mpegurl':entry.mp4?'video/mp4':mime[entry.ext]||'application/octet-stream','Cache-Control':'no-store'};
      for(const key of ['content-length','content-range','accept-ranges'])if(upstream.headers[key])headers[key]=upstream.headers[key];
      res.writeHead(upstream.status,headers);
      if(req.method==='HEAD'){upstream.body.destroy();res.end();return;}
      upstream.body.on('error',()=>res.destroy());
      upstream.body.pipe(res);
    } catch(error) {
      upstream?.body.destroy();
      if(abort.signal.aborted)return;
      if(res.headersSent){res.destroy();return;}
      res.writeHead(502,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify({error:'A fonte de vídeo não respondeu. Abra a reprodução novamente.'}));
    }
  }
}
