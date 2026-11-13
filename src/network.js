import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

export function publicAddress(ip) {
  if (isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) ||
      (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0 || (b===88 && c===99))) ||
      (a===198 && (b===18 || b===19 || b===51)) || (a===203 && b===0 && c===113));
  }
  // Refuse mapped IPv4, local, multicast and reserved IPv6. Global unicast only.
  return isIP(ip) === 6 && /^[23][0-9a-f]{0,3}:/i.test(ip) && !/^2001:(?:db8|0):/i.test(ip) && !/^2002:/i.test(ip);
}

export async function publicTarget(value, lookupFn = lookup) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('Destino de rede inválido');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const records = isIP(host) ? [{address:host,family:isIP(host)}] : await lookupFn(host, {all:true, verbatim:true});
  if (!records.length || records.some(r => !publicAddress(r.address))) throw new Error('Destino privado ou reservado bloqueado');
  return {url, records};
}

export async function request(url, {timeout=9000,maxBytes=2_000_000,prefixBytes=0,headers={},redirects=4,signal}={}) {
  const target = await publicTarget(url);
  const response = await new Promise((resolve,reject) => {
    const transport = target.url.protocol === 'https:' ? https : http;
    const req = transport.request(target.url, {
      method:'GET', signal,
      headers:{'User-Agent':'Mozilla/5.0 BestStream/0.1','Accept-Encoding':'identity',...headers},
      lookup(_host, options, callback) {
        const chosen = target.records[0];
        if(options?.all) callback(null,target.records);
        else callback(null,chosen.address,chosen.family);
      }
    }, res => {
      const chunks=[]; let size=0;
      const result=()=>({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks),url:target.url.href});
      res.on('data', chunk => {
        if(prefixBytes>0) {
          const remaining=Math.min(prefixBytes,maxBytes)-size;
          chunks.push(chunk.subarray(0,Math.max(0,remaining)));size+=Math.min(chunk.length,Math.max(0,remaining));
          if(size>=Math.min(prefixBytes,maxBytes)){resolve(result());res.destroy();}
        } else {size+=chunk.length;if(size>maxBytes)res.destroy(new Error('Resposta excede o limite'));else chunks.push(chunk);}
      });
      res.on('error',reject);
      res.on('end',() => resolve(result()));
    });
    req.setTimeout(timeout,()=>req.destroy(new Error('Tempo de rede esgotado')));
    req.on('error',reject); req.end();
  });
  if([301,302,303,307,308].includes(response.status) && response.headers.location) {
    if(redirects<=0) throw new Error('Redirecionamentos em excesso');
    const next=new URL(response.headers.location,target.url);
    // Never forward cookies or other source headers to an unrelated origin.
    const nextHeaders = next.origin===target.url.origin ? headers : Object.fromEntries(Object.entries(headers).filter(([k])=>!['cookie','authorization'].includes(k.toLowerCase())));
    return request(next,{timeout,maxBytes,prefixBytes,headers:nextHeaders,redirects:redirects-1,signal});
  }
  return response;
}

export async function json(url, options) {
  const r=await request(url,options);
  if(r.status!==200) throw new Error(`A fonte respondeu HTTP ${r.status}`);
  try { return JSON.parse(r.body.toString('utf8')); } catch { throw new Error('A fonte não retornou JSON válido'); }
}
