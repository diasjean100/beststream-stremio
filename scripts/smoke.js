import {createAddon} from '../src/addon.js';
const addon=createAddon();
let failed=false;
try {
  for(const [type,id] of [['movie','tt0133093'],['series','tt0903747:1:1']]) {
    const started=Date.now();
    const result=await addon.resolve(type,id);
    // Never log signed source URLs, tickets, IPs or cookies.
    console.log(JSON.stringify({type,id,status:result.status,directStreams:result.streams.length,attempts:result.attempts,elapsedMs:Date.now()-started}));
    if(result.status!=='resolved'||!result.streams.length)failed=true;
  }
} catch(e){console.error(e.message.replace(/https?:\/\/\S+/g,'[source]'));failed=true;}
finally{await addon.close();}
if(failed)process.exitCode=1;
