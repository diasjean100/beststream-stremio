import { Cache } from './cache.js';
import { json } from './network.js';
const cache = new Cache(400);
export const CINEMETA = 'https://v3-cinemeta.strem.io';

export function parseVideo(type, id) {
  if(!['movie','series'].includes(type) || typeof id!=='string' || id.length>70) return null;
  const m = /^(tt\d{5,12})(?::(\d{1,3}):(\d{1,5}))?$/.exec(id);
  if(!m || (type==='movie' && m[2]!==undefined) || (type==='series' && (!m[2] || Number(m[3])<1))) return null;
  return {type,id,imdb:m[1],season:type==='series'?Number(m[2]):0,episode:type==='series'?Number(m[3]):0};
}

export async function metadata(video, getJson=json) {
  return cache.use(`${video.type}:${video.imdb}`, 6*60*60*1000, async()=> {
    const {meta}=await getJson(`${CINEMETA}/meta/${video.type}/${video.imdb}.json`);
    if(!meta || meta.id!==video.imdb || !meta.name || (meta.type && meta.type!==video.type)) throw new Error('Título não identificado pelo Cinemeta');
    const tmdb=Number(meta.moviedb_id);
    return {name:meta.name,year:String(meta.releaseInfo||meta.year||'').match(/\d{4}/)?.[0]||'',poster:meta.poster||'',description:meta.description||'',...(Number.isSafeInteger(tmdb)&&tmdb>0?{tmdb}:{})};
  });
}

export async function search(type, query, skip=0) {
  if(!['movie','series'].includes(type) || !query.trim() || query.length>150 || !Number.isInteger(skip)||skip<0||skip>1000) return [];
  const extra=new URLSearchParams({search:query.trim(),skip:String(skip)}).toString();
  return cache.use(`search:${type}:${extra}`, 300_000, async()=> {
    const data=await json(`${CINEMETA}/catalog/${type}/top/${extra}.json`);
    return (data.metas||[]).filter(m=>/^tt\d{5,12}$/.test(m.id) && m.name).slice(0,100).map(m=>({...m,type}));
  });
}
