import { Cache } from './cache.js';
import { directory } from './directory.js';
import { metadata, parseVideo, search } from './metadata.js';
import { BrowserSource } from './browser-source.js';
import { streamObject } from './media.js';
export function manifest(nativeOnly=false) {
  return {id:`br.jean.beststream${nativeOnly?'.native':''}`,version:'0.1.0',name:nativeOnly?'BestStream • Direto':'BestStream • Fontes',
    description:nativeOnly?'Somente vídeos diretos identificados e verificados. Cobertura experimental.':'Busca filmes e séries pelo IMDb. Vídeos diretos quando confirmados e acesso às fontes do BestFreeStreaming pelo navegador.',
    resources:[{name:'stream',types:['movie','series'],idPrefixes:['tt']},'catalog'],types:['movie','series'],
    catalogs:[{type:'movie',id:'beststream-movies',name:'BestStream • Buscar filmes',extra:[{name:'search',isRequired:true},{name:'skip'}]},
      {type:'series',id:'beststream-series',name:'BestStream • Buscar séries',extra:[{name:'search',isRequired:true},{name:'skip'}]}],behaviorHints:{configurable:true}};
}
export function createAddon({getDirectory=directory,getMetadata=metadata,browser=new BrowserSource(),getSearch=search}={}) {
  const cache=new Cache(120);
  return {
    manifest,
    catalog:async(type,id,extra)=>({metas:id===`beststream-${type==='movie'?'movies':'series'}`?await getSearch(type,extra.get('search')||'',Number(extra.get('skip')||0)):[],cacheMaxAge:300}),
    async resolve(type,id) {
      const video=parseVideo(type,id);
      if(!video)return {video:null,streams:[],status:'invalid',message:'Use o IMDb do filme ou IMDb:temporada:episódio da série.'};
      const key=`${type}:${id}`;
      return cache.use(key,value=>value.streams.length?120_000:12_000,async()=>{
        const [meta,dir]=await Promise.all([getMetadata(video),getDirectory()]);
        const provider=dir.sources.find(p=>p.id==='bingebang-st');
        const resolved=provider?await browser.resolve(provider,video,meta):{streams:[],status:'unavailable',message:'Fonte de reprodução ausente do diretório.'};
        return {...resolved,video,meta,streams:resolved.streams.map(s=>streamObject(s,provider))};
      });
    },
    async streams(type,id,base,nativeOnly=false) {
      const video=parseVideo(type,id);
      if(!video)return {streams:[],cacheMaxAge:10};
      let result;
      try {result=await this.resolve(type,id);} catch {result={streams:[],status:'metadata-unavailable'};}
      const streams=[...result.streams];
      if(!nativeOnly) streams.push({name:'BestStream • Abrir fontes',title:'Abre no navegador • disponibilidade por site não confirmada',externalUrl:`${base}/watch/${type}/${encodeURIComponent(id)}`});
      return {streams,cacheMaxAge:streams.some(s=>s.url)?60:10};
    },
    close:()=>browser.close?.()
  };
}
