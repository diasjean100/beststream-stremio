import { Cache } from './cache.js';
import { request } from './network.js';
export const DIRECTORY_URL='https://www.bestfreestreaming.org/';
const snapshot=[
  ['BingeBang','bingebang.st'],['Zoechip','zoechip.bz'],['Nexa','nexa.mov'],['Watched','watched.cx'],['CineBros','cinebros.net'],
  ['AllFlix','allflix.org'],['Fprime','fprime.at'],['FlaxJoy','flaxjoy.app'],['Zenox','zenox.lol'],['Reelix','reelix.ac'],
  ['ZXCStream','zxcstream.com'],['MoviePal','moviepal.live'],['Vexo','vexo.surf'],['Cinejoy','cinejoy.pk'],['FlyStream','flystream.net'],
  ['Nova','novahd.cc'],['Atlantic','atlantic.bz'],['Rivo','rivo.st'],['Cinevu','cinevu.icu'],['FrameXTV','framextv.xyz'],
  ['ZetMoon','zetmoon.live'],['Flickbuff','flickbuff.cc'],['Flaxfer','flaxfer.lol'],['Cineruv','cineruv.website'],['CineHD','cinehd.vc'],
  ['Filmex','filmex.to'],['Dulo','dulo.mov'],['Flixeo','flixeo.tv'],['HydraHD','hydrahd.info'],['Rive','rentry.co'],
  ['Redflix','redflix.one'],['HiMovies','himovies.ac'],['RidoMovies','ridomovies.tv'],['Flixbaba','flixbaba.info'],['StreamingUnity','streamingunity.dog'],
  ['MovieNerds','movienerds.site'],['VidPlay','vidplay.top'],['TheFlixBay','theflixbay.com'],['1Shows','1shows.org'],['NEPU','nepu.io'],
  ['NetPrime','netprime.bz'],['Freekz','freekz.to'],['SolarMovie','solarmovie2.com'],['YesMovies','yesmovies.ag'],['MyFlixer','myflixer.sc'],
  ['2Flix','2flix.lol'],['MoviesJoy','moviesjoy.bz'],['CornClick','cornclick.com'],['Flixer','flixer.gd'],['HDToday','hdtoday.sc'],
  ['Movish','movish.to'],['MooPlay','mooplay.cc'],['BoredFlix','boredflix.to'],['NOXX','noxx.gg'],['AZMovies','azmovies.to']
];
export const BOOTSTRAP=snapshot.map(([name,host],i)=>({id:host.replace(/\W/g,'-'),name,url:host==='rentry.co'?'https://rentry.co/rivestream':`https://${host}/`,rank:i+1,adapter:host==='fprime.at'?'http':['bingebang.st','nexa.mov','moviepal.live','reelix.ac'].includes(host)?'browser':null,availability:'unverified'}));

export function plain(value='') { return value.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim(); }
export function parseDirectory(html) {
  const table=html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if(!table) return [];
  const result=[];
  for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    for(const a of row[1].matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      let url; try { url=new URL(a[1].replace(/&amp;/g,'&')); } catch { continue; }
      if(url.hostname.endsWith('bestfreestreaming.org')||url.username||url.password) continue;
      const name=plain(a[2]); if(!name||name.length>60||/preview|image|sucuri|virustotal|whois/i.test(name)) continue;
      if(result.some(p=>new URL(p.url).hostname===url.hostname)) continue;
      const known=BOOTSTRAP.find(p=>new URL(p.url).hostname===url.hostname);
      // Newly discovered sites are directory links; no automatic execution adapter.
      result.push({...known,id:known?.id||url.hostname.replace(/\W/g,'-'),name:name.replace(/\s*NEW$/i,''),url:url.href,rank:result.length+1,adapter:known?.adapter||null,availability:'unverified'});
      break;
    }
  }
  return result;
}

const cache=new Cache(2);
export async function directory() {
  const hit=cache.get('directory');if(hit)return hit;
  cache.use('directory',12*60*60*1000,async()=> {
    try {
      const r=await request(DIRECTORY_URL);
      const sources=r.status===200?parseDirectory(r.body.toString()):[];
      if(sources.length>=10) return {sources,origin:'live',checkedAt:new Date().toISOString()};
    } catch { /* An outage must not erase the last reviewed source list. */ }
    return {sources:BOOTSTRAP,origin:'snapshot',checkedAt:'2026-11-06',notice:'Lista de referência; atualização ao vivo indisponível.'};
  }).catch(()=>{});
  return {sources:BOOTSTRAP,origin:'snapshot',checkedAt:'2026-11-06',notice:'Atualização em andamento; usando a lista de referência.'};
}
