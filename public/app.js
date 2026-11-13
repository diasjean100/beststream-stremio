const $=s=>document.querySelector(s);
let sources=[];
const watch=/^\/watch\/(movie|series)\/([^/]+)$/.exec(location.pathname);
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3000);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Copiado!');}catch{if(text===manifestUrl()){const field=$('#manifest-address');field.focus();field.select();toast('Mantenha o endereço selecionado e toque em Copiar.');}else toast('Selecione o título exibido para copiá-lo.');}}
function manifestUrl(){return `${location.origin}/native/manifest.json`;}
function updateInstall(){$('#install').href=manifestUrl().replace(/^https?:\/\//,'stremio://');$('#manifest-address').value=manifestUrl();}
$('#copy').addEventListener('click',()=>copy(manifestUrl()));updateInstall();
async function api(url){const response=await fetch(url);let data;try{data=await response.json();}catch{throw Error('O servidor ainda está iniciando. Tente novamente em instantes.');}if(!response.ok)throw Error(data.error||'Não foi possível consultar agora.');return data;}
function renderSources(){
  const q=$('#filter').value.toLowerCase(),grid=$('#source-grid');grid.replaceChildren();
  for(const source of sources.filter(s=>s.adapter&&s.name.toLowerCase().includes(q))){
    const url=safeUrl(source.url);if(!url)continue;
    const card=node('article',undefined,'source-card'),info=node('div',undefined,'source-info');
    card.append(node('span',source.name[0],'source-icon'));info.append(node('h3',source.name),node('p',new URL(url).hostname));
    card.append(info,node('span','Consulta automática','native-badge'));grid.append(card);
  }
  if(!grid.children.length)grid.append(node('p','Nenhuma fonte compatível com esse nome.','hint'));
}
$('#filter').addEventListener('input',renderSources);
async function loadSources(){try{const data=await api('/api/sources');sources=data.sources;$('#source-count').textContent=`${sources.filter(s=>s.adapter).length} integrações disponíveis`;$('#directory-state').textContent=data.origin==='live'?'Diretório atualizado nesta consulta.':`Referência de ${data.checkedAt}. Atualização ao vivo indisponível.`;renderSources();}catch(e){$('#source-count').textContent='Consulta indisponível';$('#directory-state').textContent=e.message;}}
$('#search-form').addEventListener('submit',async event=>{event.preventDefault();const query=$('#query').value.trim(),type=$('#type').value;if(!query)return;const button=$('#search-form button');button.disabled=true;$('#search-state').textContent='Buscando títulos…';$('#results').replaceChildren();try{const {metas}=await api(`/catalog/${type}/beststream-${type==='movie'?'movies':'series'}/search=${encodeURIComponent(query)}.json`);$('#search-state').textContent=metas.length?`${metas.length} títulos encontrados. Disponibilidade será consultada ao abrir.`:'Nenhum título encontrado. Tente outro nome.';for(const meta of metas){const card=node('a',undefined,'result-card');card.href=type==='movie'?`stremio:///detail/movie/${meta.id}/${meta.id}`:`stremio:///detail/series/${meta.id}`;const poster=node('img',undefined,'poster');poster.alt=meta.name;poster.loading='lazy';if(safeUrl(meta.poster))poster.src=meta.poster;card.append(poster,node('h3',meta.name),node('p',meta.releaseInfo||(type==='series'?'Série • escolha um episódio no Stremio':'Filme')));$('#results').append(card);}}catch(e){$('#search-state').textContent=e.message;}finally{button.disabled=false;}});
async function resolve(){const [_,type,id]=watch;$('#resolve-state').textContent='Verificando a fonte. A consulta pode levar alguns segundos.';$('#retry').hidden=true;$('#direct-streams').replaceChildren();try{const result=await api(`/api/resolve?type=${type}&id=${encodeURIComponent(id)}`);$('#watch-title').textContent=result.meta?.name||'Título não identificado';const episode=type==='series'?`Temporada ${result.video.season} • Episódio ${result.video.episode}`:'';$('#watch-detail').textContent=[result.meta?.year,episode].filter(Boolean).join(' • ');const title=[result.meta?.name,result.meta?.year,episode].filter(Boolean).join(' ');$('#copy-title-text').textContent=title;$('#copy-title').onclick=()=>copy(title);$('#resolve-state').textContent=result.streams?.length?'O servidor verificou um vídeo direto. A reprodução no seu aparelho ainda depende das restrições da fonte.':result.message||'Nenhuma fonte compatível respondeu. Tente novamente mais tarde.';for(const stream of result.streams||[]){const link=node('a',stream.name+' ↗','button primary');link.href=`stremio:///detail/${type}/${result.video.imdb}/${encodeURIComponent(id)}`;$('#direct-streams').append(link);}$('#retry').hidden=false;}catch(e){$('#resolve-state').textContent=e.message;$('#retry').hidden=false;}}
if(watch){$('#home').hidden=true;$('#watch').hidden=false;$('#retry').addEventListener('click',resolve);resolve();}
loadSources();
