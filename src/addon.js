import { Cache } from './cache.js';
import { directory } from './directory.js';
import { metadata, parseVideo, search } from './metadata.js';
import { BrowserSource } from './browser-source.js';
import { streamObject } from './media.js';
import {VERSION} from './version.js';
export function manifest(nativeOnly=false,bridgeMode=false) {
  return {id:`br.jean.beststream${nativeOnly?'.native':''}${bridgeMode?'.bridge':''}`,version:VERSION,name:bridgeMode||nativeOnly?'BestStream • Ponte':'BestStream',
    description:'Ponte de links: encontra mídia compatível e entrega a URL ao Stremio. O vídeo é recebido diretamente da fonte, sem retransmissão pela hospedagem.',
    resources:[{name:'stream',types:['movie','series'],idPrefixes:['tt']},'catalog'],types:['movie','series'],
    catalogs:[{type:'movie',id:'beststream-movies',name:'BestStream • Buscar filmes',extra:[{name:'search',isRequired:true},{name:'skip'}]},
      {type:'series',id:'beststream-series',name:'BestStream • Buscar séries',extra:[{name:'search',isRequired:true},{name:'skip'}]}],behaviorHints:{configurable:true}};
}
export function createAddon({getDirectory=directory,getMetadata=metadata,browser=new BrowserSource(),getSearch=search,streamWaitMs=55_000}={}) {
  const cache=new Cache(120);
  const getMeta=video=>cache.use(`meta:${video.type}:${video.imdb}`,6*60*60*1000,()=>getMetadata(video));
  return {
    manifest,
    catalog:async(type,id,extra)=>({metas:id===`beststream-${type==='movie'?'movies':'series'}`?await getSearch(type,extra.get('search')||'',Number(extra.get('skip')||0)):[],cacheMaxAge:300}),
    async resolve(type,id) {
      const video=parseVideo(type,id);
      if(!video)return {video:null,streams:[],status:'invalid',message:'Use o IMDb do filme ou IMDb:temporada:episódio da série.'};
      const key=`${type}:${id}`;
      return cache.use(key,value=>value.attempts?.some(a=>a.status==='busy')?0:value.streams.length?90_000:12_000,async()=>{
        const [meta,dir]=await Promise.all([getMeta(video),getDirectory()]);
        const order=['moviepal-live','reelix-ac','nexa-mov','fprime-at','bingebang-st'];
        const providers=dir.sources.filter(p=>order.includes(p.id)&&(meta.tmdb||p.id==='bingebang-st')).sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
        const attempts=[];
        let winner=null;
        let latest={streams:[],status:'unavailable',message:'Fonte de reprodução ausente do diretório.'};
        // One HTTP source and one browser source may progress together. Browser
        // jobs themselves are serialized to keep memory use bounded.
        const groups=[providers.filter(p=>p.id==='fprime-at'),providers.filter(p=>p.id!=='fprime-at')].filter(g=>g.length);
        const tasks=groups.map(async group=>{
          for(const provider of group){
            if(winner)break;
            let resolved;
            try{resolved=await browser.resolve(provider,video,meta);}catch{resolved={status:'unavailable',streams:[]};}
            attempts.push({provider:provider.name,status:resolved.status,...(resolved.diagnosticStage?{stage:resolved.diagnosticStage}:{})});
            if(!latest.pageUrl||resolved.pageUrl)latest={...resolved,provider:provider.name};
            if(resolved.streams.length){
              winner={...resolved,provider:provider.name,video,meta,attempts:[...attempts],streams:resolved.streams.map(s=>streamObject(s,provider))};return winner;
            }
          }
          throw Error('Nenhuma mídia compatível nesta fonte');
        });
        try{return await Promise.any(tasks);}catch{/* Preserve diagnostics when every adapter failed. */}
        return {...latest,video,meta,attempts,streams:[]};
      });
    },
    async streams(type,id,base,nativeOnly=false,bridgeMode=false) {
      const video=parseVideo(type,id);
      if(!video)return {streams:[],cacheMaxAge:10};
      // All previous installation IDs now use the same URL-only bridge. HTML
      // pages, browser links and cloud relay URLs never become stream choices.
      let timer;
      try{
        const result=await Promise.race([this.resolve(type,id).catch(()=>({streams:[]})),new Promise(resolve=>{timer=setTimeout(()=>resolve({streams:[]}),streamWaitMs);})]);
        return{streams:result.streams,cacheMaxAge:result.streams.length?30:5};
      }finally{clearTimeout(timer);}
    },
    warm:()=>browser.warm?.(),
    close:()=>browser.close?.()
  };
}
