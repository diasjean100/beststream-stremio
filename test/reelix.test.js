import test from 'node:test';
import assert from 'node:assert/strict';
import {reelixPlaybackUrl,reelixIdentity} from '../src/reelix-source.js';

test('Reelix search requires the exact TMDB, media type and year, and preserves the chosen episode',async()=>{
  const video={type:'series',season:2,episode:3},meta={name:'Teen Wolf',tmdb:34524,year:'2011'};
  let request;
  const get=async url=>{request=url;return{titles:[{id:11824,type:'movie',title:'Teen Wolf',year:'1985',slug:'wrong-movie'},{id:34524,type:'tv',title:'Teen Wolf',year:'2011',slug:'teen-wolf-verified'}]};};
  assert.equal(await reelixPlaybackUrl(video,meta,get),'https://reelix.ac/watch/tv/teen-wolf-verified?season=2&episode=3');
  assert.equal(new URL(request).searchParams.get('q'),'Teen Wolf');
  for(const change of [{id:1},{type:'movie'},{year:'1985'},{title:'Teen Wolf Too'},{slug:'../../other'}]){
    const get=async()=>({titles:[{id:34524,type:'tv',title:'Teen Wolf',year:'2011',slug:'teen-wolf-verified',...change}]});
    assert.equal(await reelixPlaybackUrl(video,meta,get),null);
  }
});

test('Reelix playback requires a matching page identity and exact episode before accepting media',()=>{
  const video={type:'series',season:1,episode:2},meta={name:'Teen Wolf',tmdb:34524};
  const identity={id:'34524',type:'tv',title:'Teen Wolf',season:'1',episode:'2'};
  assert.equal(reelixIdentity(identity,video,meta),true);
  for(const change of [{id:'11824'},{type:'movie'},{title:'Teen Wolf Too'},{season:'2'},{episode:'1'}])assert.equal(reelixIdentity({...identity,...change},video,meta),false);
});
