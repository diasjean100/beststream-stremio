import { publicTarget } from './network.js';
import { mediaUrl, playerIdentity, validateMedia } from './media.js';
import {FprimeSource} from './fprime-source.js';
import {reelixPlaybackUrl,reelixIdentity} from './reelix-source.js';

const TIMEOUT=50_000;
export const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function sameIdentity(identity, video) {
  return identity?.imdb===video.imdb && (video.type==='movie'?identity.season===0&&identity.episode===0:identity.season===video.season&&identity.episode===video.episode);
}
export function nexaPlaybackUrl(video,meta) {
  if(!Number.isSafeInteger(meta.tmdb)||meta.tmdb<1)return null;
  if(video.type==='movie')return `https://nexa.mov/watch/tmdb-movie/${meta.tmdb}`;
  if(video.type==='series'&&video.season>=1&&video.episode>=1&&video.episode<=9999)return `https://nexa.mov/watch/tmdb-tv/${meta.tmdb}/s${video.season}-e${video.episode}`;
  return null;
}
export function nexaEpisodeConfirmed(text,video) {
  if(video.type==='movie')return true;
  const s=video.season,e=video.episode;
  return new RegExp(`(?:\\bs0?${s}\\s*[-:•·]?\\s*e0?${e}\\b|\\b${s}\\s*[x×]\\s*${e}\\b|\\bseason\\s+${s}\\s*[,•·-]?\\s*episode\\s+${e}\\b)`,'i').test(text);
}

export class BrowserSource {
  constructor() { this.running=false; this.instance=null; this.launching=null; this.idleTimer=null; this.lastUsed=0; this.checked=new Map();this.queue=Promise.resolve();this.waiting=0;this.fprime=new FprimeSource(); }
  async browser() {
    clearTimeout(this.idleTimer);
    if(this.instance?.isConnected()) return this.instance;
    if(!this.launching)this.launching=(async()=>{
      const {chromium}=await import('playwright');
      this.instance=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--disable-background-networking','--js-flags=--max-old-space-size=128']});
      return this.instance;
    })().finally(()=>{this.launching=null;});
    return this.launching;
  }
  releaseIdle() { clearTimeout(this.idleTimer);this.idleTimer=setTimeout(()=>{if(!this.running)this.close().catch(()=>{});},45_000);this.idleTimer.unref(); }
  async warm() { await this.browser();if(!this.running)this.releaseIdle(); }
  async close() { clearTimeout(this.idleTimer);await this.launching?.catch(()=>{});const b=this.instance;this.instance=null;await b?.close(); }
  async resolve(provider,video,meta) {
    if(provider.id==='fprime-at')return this.fprime.resolve(video,meta);
    if(this.waiting>=4)return {status:'busy',streams:[],message:'Aguarde a consulta em andamento e tente novamente.'};
    this.waiting++;
    const task=this.queue.then(()=>this.resolveInBrowser(provider,video,meta));
    this.queue=task.catch(()=>{});
    try{return await task;}finally{this.waiting--;}
  }
  async resolveInBrowser(provider,video,meta) {
    if(!['bingebang-st','nexa-mov','moviepal-live','reelix-ac'].includes(provider.id)) return {status:'unsupported',streams:[],message:'Fonte sem adaptador de reprodução.'};
    if(provider.id==='nexa-mov'&&!nexaPlaybackUrl(video,meta))return {status:'unsupported',streams:[],message:'O identificador desta fonte não foi confirmado para este vídeo.'};
    if(provider.id==='moviepal-live'&&(!Number.isSafeInteger(meta.tmdb)||meta.tmdb<1))return{status:'unsupported',streams:[]};
    this.running=true;
    let context;
    const candidates=[];
    let generation=0;
    const requestGeneration=new WeakMap();
    let page;
    let timer;
    let stage='browser-start';
    try {
      const browser=await this.browser();
      context=await browser.newContext({viewport:{width:1280,height:720},locale:'en-US',permissions:[],serviceWorkers:'block',acceptDownloads:false});
      await context.route('**/*',async route=> {
        const req=route.request();
        if(['font','image','media'].includes(req.resourceType()) && !mediaUrl(req.url())) return route.abort();
        if(/googletagmanager|google-analytics|doubleclick|facebook\.net/i.test(req.url())) return route.abort();
        try {
          const u=new URL(req.url());
          if(['data:','blob:'].includes(u.protocol)) return route.continue();
          if(!this.checked.has(u.hostname) || this.checked.get(u.hostname)<Date.now()) {
            await publicTarget(u);this.checked.set(u.hostname,Date.now()+60_000);
            if(this.checked.size>200)this.checked.delete(this.checked.keys().next().value);
          }
          // Browser automation captures URLs only. A separate bounded probe
          // decodes a frame before a candidate can become a Stremio source.
          if(/\.(ts|m4s|mp4|webm|aac|mp3|png|jpe?g|webp)(?:$|[?#])/i.test(u.href)) return route.abort();
          return route.continue();
        } catch {return route.abort();}
      });
      page=await context.newPage();
      page.setDefaultTimeout(5000);
      page.setDefaultNavigationTimeout(10_000);
      timer=setTimeout(()=>context?.close().catch(()=>{}),TIMEOUT);
      page.on('popup',p=>p.close().catch(()=>{}));
      const capture=(url,headers={},format)=>{
        if((mediaUrl(url)||format==='HLS')&&!/trailer|preview|youtube|introdb/i.test(url)&&!candidates.some(c=>c.url===url))candidates.push({url,...(format?{format}:{}),headers:{...(headers.referer?{Referer:headers.referer}:{}),...(headers.origin?{Origin:headers.origin}:{}),...(headers['user-agent']?{'User-Agent':headers['user-agent']}:{} )}});
      };
      page.on('request',r=>{requestGeneration.set(r,generation);if(mediaUrl(r.url()))capture(r.url(),r.headers());});
      page.on('response', response=> {
        if(requestGeneration.get(response.request())!==generation)return;
        const url=response.url();
        if(response.status()>=400){const index=candidates.findIndex(c=>c.url===url);if(index>=0)candidates.splice(index,1);return;}
        const mime=String(response.headers()['content-type']||'');
        const hls=/application\/(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(mime);
        if(response.status()<400 && (mediaUrl(url)||hls) && !/trailer|preview|youtube/i.test(url) && !candidates.some(c=>c.url===url)) {
          const requestHeaders=response.request().headers();
          candidates.push({url,...(hls?{format:'HLS'}:{}),headers:{...(requestHeaders.referer?{Referer:requestHeaders.referer}:{}),...(requestHeaders.origin?{Origin:requestHeaders.origin}:{}),...(requestHeaders['user-agent']?{'User-Agent':requestHeaders['user-agent']}:{})}});
        }
      });
      if(provider.id==='reelix-ac') {
        stage='reelix-search';
        const playerUrl=await reelixPlaybackUrl(video,meta);
        if(!playerUrl)return{status:'not-found',streams:[]};
        stage='reelix-player';
        await page.goto(playerUrl,{waitUntil:'domcontentloaded',timeout:10000});
        if(await challenge(page))return{status:'blocked',streams:[]};
        const identity=await page.locator('[data-watch-page]').first().evaluate(el=>({...el.dataset})).catch(()=>null);
        if(page.url()!==playerUrl||!reelixIdentity(identity,video,meta))return{status:'not-found',streams:[]};
        stage='reelix-play';
        for(let pass=0;pass<3&&!candidates.length;pass++) {
          for(const frame of page.frames()) {
            const play=frame.getByRole('button',{name:/^(play|play video|watch now|resume)$/i}).first();
            if(await play.isVisible().catch(()=>false))await play.click({timeout:1500,noWaitAfter:true}).catch(()=>{});
          }
          await page.waitForResponse(r=>mediaUrl(r.url()),{timeout:4000}).catch(()=>{});
        }
        const verified=await verifyCandidates(candidates,page);
        return{status:verified.length?'resolved':'unavailable',streams:verified,pageUrl:playerUrl};
      }
      if(provider.id==='moviepal-live') {
        stage='moviepal-player';
        const playerUrl=`https://moviepal.live/${video.type==='series'?'tv':'movie'}/watch/${meta.tmdb}${video.type==='series'?`?season=${video.season}&episode=${video.episode}`:''}`;
        await page.goto(playerUrl,{waitUntil:'domcontentloaded',timeout:10000});
        if(await challenge(page))return{status:'blocked',streams:[]};
        await page.waitForFunction(name=>document.body.innerText.toLowerCase().includes(name.toLowerCase()),meta.name,{timeout:10000});
        const current=new URL(page.url()),expected=new URL(playerUrl);
        if(current.pathname!==expected.pathname||current.search!==expected.search)return{status:'not-found',streams:[]};
        if(video.type==='series'&&!nexaEpisodeConfirmed(await page.locator('body').innerText(),video))return{status:'not-found',streams:[]};
        stage='moviepal-play';
        const verified=await moviepalServers(page,candidates,()=>{generation++;candidates.length=0;});
        return{status:verified.length?'resolved':'unavailable',streams:verified,pageUrl:playerUrl};
      }
      if(provider.id==='nexa-mov') {
        stage='nexa-navigation';
        const playerUrl=nexaPlaybackUrl(video,meta);
        // Streaming pages can keep a parser-blocking resource pending even after
        // their player is usable. Wait for the response, then the exact title,
        // instead of using DOMContentLoaded/load as a playback readiness signal.
        await page.goto(playerUrl,{waitUntil:'commit',timeout:5000}).catch(error=>{
          // Chromium on small hosts can miss/delay the navigation event while
          // already rendering the requested document. The exact title and
          // episode checks below remain mandatory before returning any media.
          if(error.name!=='TimeoutError'||page.url()!==playerUrl)throw error;
        });
        const dialog=page.getByRole('dialog');
        if(await dialog.count()) {
          const close=dialog.getByRole('button',{name:/^(Close|Got it|Dismiss|OK)$/i}).first();
          if(await close.isVisible().catch(()=>false))await close.click();
        }
        stage='nexa-title';
        // Player controls can auto-hide. Verify their DOM title without requiring the HUD to remain visible.
        await page.waitForFunction(name=>{
          const clean=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
          return Array.from(document.querySelectorAll('h1')).some(h=>clean(h.textContent||h.querySelector('img')?.alt||'')===clean(name));
        },video.type==='series'?`${meta.name} S${video.season} E${video.episode}`:meta.name,{timeout:20_000});
        if(await challenge(page))return {status:'blocked',streams:[],message:'O site exige verificação manual.'};
        stage='nexa-play';
        const play=page.getByRole('button',{name:'Play',exact:true}).first();
        if(await play.isVisible().catch(()=>false))await play.click({noWaitAfter:true,timeout:2500}).catch(async error=>{
          // A successful Play click can turn into Pause while Chromium is still
          // waiting for a page event. Confirm the result instead of discarding it.
          if(error.name!=='TimeoutError')throw error;
          const playing=await page.getByRole('button',{name:'Pause',exact:true}).isVisible().catch(()=>false);
          if(!playing&&!candidates.length)await page.keyboard.press('Space').catch(()=>{});
        });
        stage='nexa-sources';
        if(!candidates.length)await page.waitForResponse(r=>r.status()<400&&(mediaUrl(r.url())||/application\/(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(String(r.headers()['content-type']||''))),{timeout:18000}).catch(()=>{});
        await page.mouse.move(640,360);
        if(new URL(page.url()).pathname!==new URL(playerUrl).pathname||!nexaEpisodeConfirmed(await page.locator('body').innerText(),video))return {status:'web-only',streams:[],pageUrl:playerUrl,message:'O número exato do episódio não foi confirmado no reprodutor.'};
        stage='nexa-media-validation';
        const verified=await verifyCandidates(candidates,page);
        console.info(JSON.stringify({event:'provider_media',provider:provider.id,candidates:candidates.length,verified:verified.length}));
        return {status:verified.length?'resolved':'web-only',streams:verified,pageUrl:playerUrl,message:verified.length?'Vídeo direto verificado no servidor.':'Título identificado, mas o vídeo direto desta fonte não foi confirmado.'};
      }
      stage='homepage';
      await page.goto(provider.url,{waitUntil:'domcontentloaded'});
      await page.waitForLoadState('load',{timeout:6500}).catch(()=>{});
      if(await challenge(page)) return {status:'blocked',streams:[],message:'O site exige verificação manual.'};
      const search=page.getByRole('button',{name:'Search',exact:true});
      stage='search-open';
      await search.click();
      stage='search-input';
      const input=page.getByPlaceholder(/Search.*(?:movies|TV)/i);
      await input.waitFor({state:'visible'});
      await input.fill(meta.name);
      // Search is a live overlay. Wait for title links rather than inventing a search API.
      const wanted=video.type==='movie'?'/movie/watch/':'/tv/watch/';
      await page.waitForFunction(({prefix,title})=>Array.from(document.querySelectorAll('a[href]')).some(a=>a.getAttribute('href')?.includes(prefix) && `${a.innerText} ${a.getAttribute('href')}`.toLowerCase().replace(/[^a-z0-9]+/g,' ').includes(title)),{prefix:wanted,title:normalize(meta.name)},{timeout:6500}).catch(()=>{});
      const links=await page.locator(`a[href*="${wanted}"]`).evaluateAll(elements=>elements.map(a=>({href:a.getAttribute('href'),text:a.getAttribute('aria-label')||a.innerText||a.querySelector('img')?.alt||''})));
      const exact=links.filter(a=>{
        const text=normalize(a.text),name=normalize(meta.name);
        const slug=normalize(a.href);
        return text===name || text===`${name} ${meta.year}` || (slug.includes(name) && (!meta.year || video.type==='series' || slug.includes(meta.year)));
      });
      const unique=[...new Map(exact.map(a=>[a.href,a])).values()].slice(0,3);
      stage='title-identification';
      for(const found of unique) {
        const detail=new URL(found.href,provider.url);
        if(detail.origin!==new URL(provider.url).origin) continue;
        await page.goto(detail.href,{waitUntil:'domcontentloaded'});
        if(await challenge(page)) return {status:'blocked',streams:[],message:'O site exige verificação manual.'};
        if(video.type==='series') {
          const season=page.getByRole('combobox').first();
          if(await season.count()) {
            const options=await season.locator('option').evaluateAll(els=>els.map(e=>({value:e.value,text:e.textContent})));
            const option=options.find(o=>new RegExp(`(?:season\\s*)?0?${video.season}$`,'i').test(o.text.trim()));
            if(option) await season.selectOption(option.value);
          }
        }
        const playLinks=await page.locator('a[href*="/play/"]').evaluateAll(els=>els.map(a=>({href:a.getAttribute('href'),text:a.innerText,label:a.getAttribute('aria-label')||''})));
        let play;
        if(video.type==='movie') play=playLinks.find(a=>a.href.startsWith('/movie/play/'));
        else play=playLinks.find(a=>{
          const t=`${a.href} ${a.text} ${a.label}`;
          return new RegExp(`(?:season[-/ ]?|s)0?${video.season}(?:[-/ ]|$)`,'i').test(t) && new RegExp(`(?:episode[-/ ]?|e)0?${video.episode}(?:[-/ ?]|$)`,'i').test(t);
        });
        if(!play) continue;
        const playUrl=new URL(play.href,provider.url);
        if(playUrl.origin!==new URL(provider.url).origin)continue;
        candidates.length=0;
        stage='player';
        await page.goto(playUrl.href,{waitUntil:'domcontentloaded'});
        const identity=await page.locator('script:not([src])').allTextContents();
        if(!identity.map(playerIdentity).some(id=>sameIdentity(id,video))) continue;
        if(!candidates.length)await page.waitForResponse(r=>r.status()<400&&mediaUrl(r.url()),{timeout:7000}).catch(()=>{});
        stage='media-validation';
        const verified=await verifyCandidates(candidates);
        if(verified.length)return {status:'resolved',streams:verified,pageUrl:playUrl.href,message:'Playlist ou vídeo respondeu corretamente a partir do servidor.'};
        return {status:'web-only',streams:[],pageUrl:playUrl.href,message:'Título e episódio identificados, mas o vídeo direto não foi validado.'};
      }
      return {status:'not-found',streams:[],message:'O título e episódio exatos não foram confirmados nesta fonte.'};
    } catch(error) {
      console.warn(JSON.stringify({event:'provider_failure',provider:provider.id,stage,error:error.name,detail:error.message.split('\n')[0].replace(/https?:\/\/\S+/g,'[source]').slice(0,180)}));
      if(page && !page.isClosed()) {
        // Public UI diagnostics only. Never dump cookies, source URLs or page scripts.
        const state=await page.evaluate(()=>({title:document.title,headings:Array.from(document.querySelectorAll('h1,h2')).slice(0,8).map(h=>h.innerText),buttons:Array.from(document.querySelectorAll('button')).slice(0,20).map(b=>b.getAttribute('aria-label')||b.innerText)})).catch(()=>null);
        console.warn(JSON.stringify({event:'provider_public_ui',stage,state}));
        if(state&&hasChallenge(state.title,state.headings.join(' ')))return {status:'blocked',streams:[],message:'O site exige verificação manual.'};
      }
      return {status:'unavailable',streams:[],diagnosticStage:stage,message:/browser.*executable|executable.*exist/i.test(error.message)?'Navegador do servidor indisponível.':'A fonte não concluiu a consulta dentro do prazo.'};
    } finally {
      clearTimeout(timer);await context?.close().catch(()=>{});this.lastUsed=Date.now();
      this.running=false;
      // Reuse Chromium for nearby requests; release it after a short idle period.
      this.releaseIdle();
    }
  }
}
async function verifyCandidates(candidates,page) {
  const checked=new Set();
  for(let pass=0;pass<5&&checked.size<6;pass++) {
    // Audio-only playlists and capability probes can arrive before the video.
    // Check later captured candidates as well, with only two HTTP checks at once.
    const batch=candidates.filter(c=>!checked.has(c.url)).slice(0,Math.min(2,6-checked.size));
    for(const c of batch)checked.add(c.url);
    // The frame inspector is serial. Waiting for an entire parallel batch kept
    // a good stream behind a duplicate decode and could miss Stremio's deadline.
    for(const candidate of batch) {
      const verified=await validateMedia(candidate);
      if(verified)return [verified];
    }
    if(candidates.some(c=>!checked.has(c.url)))continue;
    if(!page||pass>=4)break;
    await page.waitForResponse(r=>!checked.has(r.url())&&r.status()<400&&(mediaUrl(r.url())||/application\/(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(String(r.headers()['content-type']||''))),{timeout:1800}).catch(()=>{});
  }
  return [];
}
export async function moviepalServers(page,candidates,reset,{verify=verifyCandidates}={}) {
  // These are the actual server controls in MoviePal's public player. Keep the
  // already-confirmed title/season/episode page while changing only its source.
  let selected='Alpha';
  // Charlie produced verified media on the deployed Render host. Alpha/Beta
  // produced no candidates there and previously exhausted the response budget.
  for(const server of ['Charlie','Alpha','Beta','Delta','Echo']) {
    if(server!==selected) {
      const button=page.getByRole('button',{name:server,exact:true}).first();
      if(!await button.isVisible().catch(()=>false))continue;
      reset();
      await button.click({timeout:1500,noWaitAfter:true}).catch(()=>{});
      selected=server;
    }
    for(let pass=0;pass<2&&!candidates.length;pass++) {
      for(const frame of page.frames()) {
        const play=frame.getByRole('button',{name:/^(play|play video|watch now|resume)$/i}).first();
        if(await play.isVisible().catch(()=>false))await play.click({timeout:1000,noWaitAfter:true}).catch(()=>{});
      }
      if(!candidates.length)await page.waitForResponse(r=>mediaUrl(r.url()),{timeout:3000}).catch(()=>{});
    }
    // Do not wait repeatedly for the same rejected slate before switching.
    const verified=await verify(candidates);
    console.info(JSON.stringify({event:'moviepal_server',server,candidates:candidates.length,verified:verified.length}));
    if(verified.length)return verified;
  }
  return [];
}
export function hasChallenge(title, text) {
  return /just a moment|checking your browser|verifying your browser|making sure you.re not a bot|attention required.*cloudflare|verify you are human|complete the security check|performing security verification|protect against malicious bots|cloudflare warp vpn|unblocked school proxy|please disable (?:your )?vpn/i.test(`${title} ${text}`);
}
async function challenge(page) {
  return hasChallenge(await page.title(), (await page.locator('body').innerText()).slice(0,2500));
}
