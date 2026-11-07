import { publicTarget } from './network.js';
import { mediaUrl, playerIdentity, validateMedia } from './media.js';

const TIMEOUT=24_000;
export const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function sameIdentity(identity, video) {
  return identity?.imdb===video.imdb && (video.type==='movie'?identity.season===0&&identity.episode===0:identity.season===video.season&&identity.episode===video.episode);
}

export class BrowserSource {
  constructor() { this.running=false; this.instance=null; this.lastUsed=0; this.checked=new Map(); }
  async browser() {
    if(this.instance?.isConnected()) return this.instance;
    const {chromium}=await import('playwright');
    this.instance=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--disable-background-networking','--js-flags=--max-old-space-size=128']});
    return this.instance;
  }
  async close() { const b=this.instance;this.instance=null;await b?.close(); }
  async resolve(provider,video,meta) {
    if(provider.id!=='bingebang-st') return {status:'unsupported',streams:[],message:'Fonte disponível somente como link de navegador.'};
    if(this.running) return {status:'busy',streams:[],message:'A fonte está consultando outro título. Tente novamente em alguns segundos.'};
    this.running=true;
    let context;
    const candidates=[];
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
          // Capture playlist requests, but do not download video segments on the server.
          if(/\.(ts|m4s)(?:$|[?#])/i.test(u.href)) return route.abort();
          return route.continue();
        } catch {return route.abort();}
      });
      page=await context.newPage();
      page.setDefaultTimeout(5000);
      page.setDefaultNavigationTimeout(10_000);
      timer=setTimeout(()=>context?.close().catch(()=>{}),TIMEOUT);
      page.on('popup',p=>p.close().catch(()=>{}));
      page.on('response', response=> {
        const url=response.url();
        if(response.status()<400 && mediaUrl(url) && !/trailer|preview|youtube/i.test(url) && !candidates.some(c=>c.url===url)) {
          const referer=response.request().headers().referer;
          candidates.push({url,headers:referer?{Referer:referer}: {}});
        }
      });
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
        await page.waitForResponse(r=>r.status()<400&&mediaUrl(r.url()),{timeout:7000}).catch(()=>{});
        stage='media-validation';
        const verified=[];
        for(const candidate of candidates.slice(0,3)) {
          const result=await validateMedia(candidate);
          if(result)verified.push(result);
        }
        if(verified.length)return {status:'resolved',streams:verified,pageUrl:playUrl.href,message:'Playlist ou vídeo respondeu corretamente a partir do servidor.'};
        return {status:'web-only',streams:[],pageUrl:playUrl.href,message:'Título e episódio identificados, mas o vídeo direto não foi validado.'};
      }
      return {status:'not-found',streams:[],message:'O título e episódio exatos não foram confirmados nesta fonte.'};
    } catch(error) {
      console.warn(JSON.stringify({event:'provider_failure',provider:provider.id,stage,error:error.name}));
      if(process.env.CI && page && !page.isClosed()) {
        // Public UI diagnostics only. Never dump cookies, source URLs or page scripts.
        const state=await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,500),buttons:Array.from(document.querySelectorAll('button')).slice(0,25).map(b=>b.getAttribute('aria-label')||b.innerText),inputs:Array.from(document.querySelectorAll('input')).filter(i=>i.type!=='hidden').slice(0,8).map(i=>({type:i.type,placeholder:i.placeholder,visible:!!i.getClientRects().length}))})).catch(()=>null);
        console.warn(JSON.stringify({event:'provider_public_ui',stage,state}));
      }
      return {status:'unavailable',streams:[],message:/browser.*executable|executable.*exist/i.test(error.message)?'Navegador do servidor indisponível.':'A fonte não concluiu a consulta dentro do prazo.'};
    } finally {
      clearTimeout(timer);await context?.close().catch(()=>{});this.lastUsed=Date.now();
      // Free instances have limited RAM. Release Chromium after each lookup.
      await this.close().catch(()=>{});
      this.running=false;
    }
  }
}
export function hasChallenge(title, text) {
  return /just a moment|checking your browser|verify you are human|complete the security check|performing security verification|protect against malicious bots/i.test(`${title} ${text}`);
}
async function challenge(page) {
  return hasChallenge(await page.title(), (await page.locator('body').innerText()).slice(0,2500));
}
