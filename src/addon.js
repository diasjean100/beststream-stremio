import { Cache } from './cache.js';
import { directory } from './directory.js';
import { metadata, parseVideo, search } from './metadata.js';
import { BrowserSource } from './browser-source.js';
import { streamObject } from './media.js';
import {VERSION} from './version.js';
export function manifest(nativeOnly=false) {
  return {id:`br.jean.beststream${nativeOnly?'.native':''}`,version:VERSION,name:nativeOnly?'BestStream • Direto':'BestStream',
    description:'Ponte de reprodução: busca fontes compatíveis ao apertar Play e transmite para o Stremio. Disponibilidade depende das fontes.',
    resources:[{name:'stream',types:['movie','series'],idPrefixes:['tt']},'catalog'],types:['movie','series'],
    catalogs:[{type:'movie',id:'beststream-movies',name:'BestStream • Buscar filmes',extra:[{name:'search',isRequired:true},{name:'skip'}]},
      {type:'series',id:'beststream-series',name:'BestStream • Buscar séries',extra:[{name:'search',isRequired:true},{name:'skip'}]}],behaviorHints:{configurable:true}};
}
export function createAddon({getDirectory=directory,getMetadata=metadata,browser=new BrowserSource(),getSearch=search}={}) {
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
        const order=['fprime-at','nexa-mov','moviepal-live','bingebang-st'];
        const providers=dir.sources.filter(p=>order.includes(p.id)&&(meta.tmdb||p.id==='bingebang-st')).sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
        const attempts=[];
        let latest={streams:[],status:'unavailable',message:'Fonte de reprodução ausente do diretório.'};
        for(const provider of providers){
          let resolved;
          try{resolved=await browser.resolve(provider,video,meta);}catch{resolved={status:'unavailable',streams:[]};}
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
      // The media URL belongs to this add-on. Source discovery starts on Play,
      // outside Stremio's short stream-list timeout. Never return an HTML page.
      return {streams:[{name:'BestStream • Automático',title:'Buscar e reproduzir no Stremio\nDisponibilidade a confirmar ao apertar Play',
        url:`${base}/play/${type}/${encodeURIComponent(id)}`,behaviorHints:{notWebReady:true,bingeGroup:'beststream-auto'}}],cacheMaxAge:0};
    },
    warm:()=>browser.warm?.(),
    close:()=>browser.close?.()
  };
}
