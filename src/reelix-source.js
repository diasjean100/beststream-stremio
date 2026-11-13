import {json} from './network.js';
const normalize=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

// The search endpoint and watch links are published by Reelix's own frontend.
// A title match alone is insufficient: require the same type and TMDB ID.
export async function reelixPlaybackUrl(video,meta,getJson=json){
  if(!Number.isSafeInteger(meta.tmdb)||meta.tmdb<1||!meta.name)return null;
  if(video.type==='series'&&(!video.season||!video.episode))return null;
  const type=video.type==='series'?'tv':'movie';
  const data=await getJson(`https://reelix.ac/api/search?q=${encodeURIComponent(meta.name)}`);
  const title=(data.titles||[]).find(t=>t.id===meta.tmdb&&t.type===type&&normalize(t.title)===normalize(meta.name)&&(!meta.year||!t.year||String(t.year)===String(meta.year)));
  if(!title||typeof title.slug!=='string'||!/^[a-zA-Z0-9-]{1,180}$/.test(title.slug))return null;
  return `https://reelix.ac/watch/${type}/${title.slug}${video.type==='series'?`?season=${video.season}&episode=${video.episode}`:''}`;
}

export function reelixIdentity(identity,video,meta){
  return identity&&Number(identity.id)===meta.tmdb&&identity.type===(video.type==='series'?'tv':'movie')&&normalize(identity.title)===normalize(meta.name)&&
    (video.type==='movie'||(Number(identity.season)===video.season&&Number(identity.episode)===video.episode));
}
