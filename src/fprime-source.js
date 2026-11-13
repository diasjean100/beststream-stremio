import {webcrypto} from 'node:crypto';
import {Cache} from './cache.js';
import {request} from './network.js';
import {validateMedia} from './media.js';

// Discover the public playback request used by the site's current frontend.
// Never execute downloaded JavaScript or retain signed media URLs on disk.
export class FprimeSource {
  constructor({get=request,inspect}={}){this.get=get;this.inspect=inspect;this.cache=new Cache(2);}
  async config(){return this.cache.use('config',6*60*60_000,async()=>{
    const read=async url=>{const r=await this.get(url,{maxBytes:2_000_000,timeout:6500});if(r.status!==200)throw Error('Fonte indisponível');return r.body.toString();};
    const html=await read('https://fprime.at/');
    const entry=html.match(/src=["'](\/assets\/index-[^"']+\.js)["']/)?.[1];
    if(!entry)throw Error('Entrada da fonte alterada');
    const app=await read(new URL(entry,'https://fprime.at').href);
    const watch=app.match(/["'`](\.\/Watch-[^"'`]+\.js)["'`]/)?.[1];
    if(!watch)throw Error('Reprodutor da fonte alterado');
    const code=await read(new URL(watch,new URL(entry,'https://fprime.at')).href);
    const config=parseFprimeConfig(code);if(!config)throw Error('Configuração pública da fonte alterada');return config;
  });}
  async resolve(video,meta){
    if(!Number.isSafeInteger(meta.tmdb)||meta.tmdb<1)return{status:'unsupported',streams:[]};
    const params=new URLSearchParams({tmdbId:String(meta.tmdb),type:video.type==='series'?'tv':'movie'});
    if(video.type==='series'){params.set('seasonId',String(video.season));params.set('episodeId',String(video.episode));}
    let stage='public-config';
    try{
      const {endpoint,key}=await this.config();
      stage='source-request';
      const r=await this.get(`${endpoint}?${params}`,{maxBytes:1_000_000,timeout:9000});
      if(r.status!==200)return{status:r.status===403?'blocked':'unavailable',streams:[]};
      const raw=JSON.parse(r.body.toString()).sources?.Astra?.url;
      if(typeof raw!=='string')return{status:'not-found',streams:[]};
      stage='url-data';
      const url=await unwrapPublicUrl(raw,key);
      stage='media-validation';
      const candidate=await validateMedia({url,format:'HLS',headers:{Referer:'https://fprime.at/',Origin:'https://fprime.at'}},this.get,{inspect:this.inspect});
      return{status:candidate?'resolved':'unavailable',streams:candidate?[candidate]:[],message:candidate?'Vídeo verificado na fonte Fprime.':'A fonte não confirmou mídia compatível.'};
    }catch(error){console.warn(JSON.stringify({event:'provider_failure',provider:'fprime-at',stage,error:error.name}));return{status:'unavailable',streams:[],diagnosticStage:stage,message:'A fonte Fprime não concluiu a consulta.'};}
  }
}
export function parseFprimeConfig(code){
  const endpoint=code.match(/["'`](https:\/\/[^"'`\s]+\/astra)["'`]/);
  if(!endpoint)return null;
  const key=code.slice(endpoint.index,endpoint.index+400).match(/["'`]([a-f0-9]{64})["'`]/)?.[1];
  if(!key||!code.includes('AES-GCM')||!code.includes('as_'))return null;
  return{endpoint:endpoint[1],key};
}
export async function unwrapPublicUrl(raw,key){
  if(!raw.startsWith('as_')){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('URL inválida');return u.href;}
  const value=raw.slice(3);if(!/^[a-f0-9]+$/i.test(value)||value.length%2||value.length<56||value.length>16000)throw Error('URL inválida');
  const bytes=Buffer.from(value,'hex');
  const cryptoKey=await webcrypto.subtle.importKey('raw',Buffer.from(key,'hex'),{name:'AES-GCM'},false,['decrypt']);
  const plain=Buffer.from(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},cryptoKey,bytes.subarray(12))).toString('utf8');
  const u=new URL(plain);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('URL inválida');return u.href;
}
