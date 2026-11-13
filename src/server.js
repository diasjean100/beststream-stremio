import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createAddon} from './addon.js';
import {directory} from './directory.js';
import {parseVideo} from './metadata.js';
import {MediaRelay} from './relay.js';
import {VERSION} from './version.js';
const assets=new Map();
const allowedAssets=new Map([['/','index.html'],['/configure','index.html'],['/app.js','app.js'],['/style.css','style.css']]);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};

export function createServer(addon=createAddon(),getDirectory=directory,{relay=new MediaRelay(),playTimeoutMs=110_000}={}) {
  const limits=new Map();
  const server=http.createServer(async(req,res)=> {
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Range');res.setHeader('Access-Control-Expose-Headers','Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(status,value,contentType='application/json; charset=utf-8')=>{
      res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value)));
    };
    if(req.method==='OPTIONS') {res.writeHead(204);res.end();return;}
    if(!['GET','HEAD'].includes(req.method))return send(405,{error:'Método não permitido'});
    if((req.url||'').length>1500)return send(414,{error:'URL longa demais'});
    const url=new URL(req.url,'http://localhost');
    const rawPath=url.pathname;
    let path;try{path=decodeURIComponent(rawPath);}catch{return send(400,{error:'URL inválida'});}
    const nativeOnly=path.startsWith('/native/');if(nativeOnly)path=path.slice(7);
    try {
      if(path==='/healthz')return send(200,{ok:true,name:'BestStream',version:VERSION,commit:process.env.RENDER_GIT_COMMIT||null});
      if(path==='/manifest.json')return send(200,addon.manifest(nativeOnly));
      if(path==='/api/sources')return send(200,await getDirectory());
      // PUBLIC_BASE_URL or Render's trusted canonical URL prevents forwarded-host poisoning.
      const localPort=server.address()?.port;
      const base=process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL||`http://127.0.0.1:${localPort}`;
      if(path.startsWith('/relay/')){await relay.serve(path,req,res);return;}
      const stream=/^\/stream\/(movie|series)\/([^/]+)\.json$/.exec(path);
      const play=/^\/play\/(movie|series)\/([^/]+)$/.exec(path);
      const resolve=path==='/api/resolve';
      const video=stream?{type:stream[1],id:stream[2]}:play?{type:play[1],id:play[2]}:resolve?{type:url.searchParams.get('type'),id:url.searchParams.get('id')}:null;
      if(video) {
        if(!parseVideo(video.type,video.id))return resolve?send(400,{error:'Identificador de vídeo inválido'}):send(200,{streams:[],cacheMaxAge:10});
        const now=Date.now(),key=req.socket.remoteAddress;
        const rate=limits.get(key)||{until:now+60_000,count:0};
        if(rate.until<now){rate.until=now+60_000;rate.count=0;}
        rate.count++;limits.set(key,rate);
        if(limits.size>1000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);
        if(rate.count>20)return send(429,{error:'Aguarde um minuto antes de consultar mais títulos.'});
        if(play) {
          let timer;
          try {
            const result=await Promise.race([addon.resolve(video.type,video.id),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Tempo de busca esgotado')),playTimeoutMs);})]);
            const selected=result.streams?.find(s=>s.url);
            if(!selected)return send(503,{error:'Nenhuma fonte compatível respondeu para este título ou episódio. Tente novamente mais tarde.'});
            const location=relay.register({url:selected.url,format:selected.behaviorHints?.filename?.endsWith('.m3u8')?'HLS':'MP4',headers:selected.behaviorHints?.proxyHeaders?.request||{}});
            res.writeHead(307,{Location:location,'Cache-Control':'no-store'});res.end();return;
          } finally {clearTimeout(timer);}
        }
        return send(200,stream?await addon.streams(video.type,video.id,base,nativeOnly):await addon.resolve(video.type,video.id));
      }
      // Preserve percent encoding until URLSearchParams parses the extra fields, including literal '&'.
      const catalog=/^\/catalog\/(movie|series)\/([\w-]+)(?:\/([^/]*))?\.json$/.exec(nativeOnly?rawPath.slice(7):rawPath);
      if(catalog)return send(200,await addon.catalog(catalog[1],catalog[2],new URLSearchParams(catalog[3]||'')));
      if(/^\/watch\/(movie|series)\/tt\d{5,12}(?::\d{1,3}:\d{1,5})?$/.test(path)||allowedAssets.has(path)) {
        const name=allowedAssets.get(path)||'index.html';
        if(name==='index.html')Promise.resolve(addon.warm?.()).catch(()=>{});
        if(!assets.has(name))assets.set(name,await readFile(new URL(`../public/${name}`,import.meta.url)));
        return send(200,assets.get(name),types[name.slice(name.lastIndexOf('.'))]);
      }
      return send(404,{error:'Rota não encontrada'});
    } catch(error) {
      console.error(JSON.stringify({event:'request_failed',path:path.split('/').slice(0,3).join('/'),error:error.message.replace(/https?:\/\/\S+/g,'[source]')}));
      return send(503,{error:'A fonte não respondeu. Tente novamente em instantes.'});
    }
  });
  server.requestTimeout=35_000;server.headersTimeout=10_000;
  server.on('close',()=>addon.close?.());
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const server=createServer();server.listen(Number(process.env.PORT)||7000,'0.0.0.0',()=>console.log('BestStream is listening'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close();setTimeout(()=>process.exit(0),8000).unref();});
}
