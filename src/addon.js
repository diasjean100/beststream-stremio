import { Cache } from './cache.js';
import { directory } from './directory.js';
import { metadata, parseVideo, search } from './metadata.js';
import { BrowserSource,nexaPlaybackUrl } from './browser-source.js';
import { streamObject } from './media.js';
export function manifest(nativeOnly=false) {
  return {id:`br.jean.beststream${nativeOnly?'.native':''}`,version:'0.3.1',name:nativeOnly?'BestStream • Direto':'BestStream',
    description:nativeOnly?'Somente vídeos diretos identificados e verificados. Cobertura experimental.':'Busca filmes e séries pelo IMDb. Vídeos diretos quando confirmados e acesso às fontes do BestFreeStreaming pelo navegador.',
    resources:[{name:'stream',types:['movie','series'],idPrefixes:['tt']},'catalog'],types:['movie','series'],
    catalogs:[{type:'movie',id:'beststream-movies',name:'BestStream • Buscar filmes',extra:[{name:'search',isRequired:true},{name:'skip'}]},
      {type:'series',id:'beststream-series',name:'BestStream • Buscar séries',extra:[{name:'search',isRequired:true},{name:'skip'}]}],behaviorHints:{configurable:true}};
}
export function createAddon({getDirectory=directory,getMetadata=metadata,browser=new BrowserSource(),getSearch=search,streamWaitMs=22_000}={}) {
  const cache=new Cache(120);
  const getMeta=video=>cache.use(`meta:${video.type}:${video.imdb}`,6*60*60*1000,()=>getMetadata(video));
  return {
    manifest,
    catalog:async(type,id,extra)=>({metas:id===`beststream-${type==='movie'?'movies':'series'}`?await getSearch(type,extra.get('search')||'',Number(extra.get('skip')||0)):[],cacheMaxAge:300}),
    async resolve(type,id) {
      const video=parseVideo(type,id);
      if(!video)return {video:null,streams:[],status:'invalid',message:'Use o IMDb do filme ou IMDb:temporada:episódio da série.'};
      const key=`${type}:${id}`;
      return cache.use(key,value=>value.streams.length?120_000:12_000,async()=>{
        const [meta,dir]=await Promise.all([getMeta(video),getDirectory()]);
        const providers=dir.sources.filter(p=>p.id==='bingebang-st'||(p.id==='nexa-mov'&&meta.tmdb)).sort((a,b)=>a.id==='nexa-mov'?-1:b.id==='nexa-mov'?1:0);
        const attempts=[];
        let latest={streams:[],status:'unavailable',message:'Fonte de reprodução ausente do diretório.'};
        for(const provider of providers){
          const resolved=await browser.resolve(provider,video,meta);
          attempts.push({provider:provider.name,status:resolved.status,...(resolved.diagnosticStage?{stage:resolved.diagnosticStage}:{})});
          if(!latest.pageUrl||resolved.pageUrl)latest={...resolved,provider:provider.name};
          if(resolved.streams.length)return {...resolved,provider:provider.name,video,meta,attempts,streams:resolved.streams.map(s=>streamObject(s,provider))};
        }
        return {...latest,video,meta,attempts,streams:[]};
      });
    },
    async streams(type,id,base,nativeOnly=false) {
      const video=parseVideo(type,id);
      if(!video)return {streams:[],cacheMaxAge:10};
      let result;
      if(!nativeOnly) {
        result=cache.get(`${type}:${id}`);
        if(!result) {
          let timer;
          // Give the resolver time to return native video in this first Stremio
          // request. Keep an external fallback if the provider takes too long.
          result=await Promise.race([
            this.resolve(type,id).catch(()=>({streams:[],status:'unavailable'})),
            new Promise(resolve=>{timer=setTimeout(()=>resolve({streams:[],status:'checking'}),streamWaitMs);})
          ]);
          clearTimeout(timer);
        }
      } else {
        try {result=await this.resolve(type,id);} catch {result={streams:[],status:'metadata-unavailable'};}
      }
      const streams=[...result.streams];
      if(!nativeOnly&&result.pageUrl)streams.push({name:`BestStream • ${result.provider||'Fonte'} no navegador`,title:'Página do título • abre no navegador',externalUrl:result.pageUrl});
      if(!nativeOnly&&!result.pageUrl) {
        let timer;
        const meta=await Promise.race([getMeta(video).catch(()=>null),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1200);})]);
        clearTimeout(timer);
        const pageUrl=meta?nexaPlaybackUrl(video,meta):null;
        if(pageUrl)streams.push({name:'BestStream • Nexa no navegador',title:'Consultar título no site • disponibilidade não confirmada',externalUrl:pageUrl});
      }
      if(!nativeOnly) streams.push({name:'BestStream • Abrir fontes',title:'Abre no navegador • disponibilidade por site não confirmada',externalUrl:`${base}/watch/${type}/${encodeURIComponent(id)}`});
      return {streams,cacheMaxAge:streams.some(s=>s.url)?60:10};
    },
    warm:()=>browser.warm?.(),
    close:()=>browser.close?.()
  };
}
