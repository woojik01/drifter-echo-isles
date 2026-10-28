const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../game-assets/gamedistribution.js'),'utf8');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
function setup(host='revision.gamedistribution.com',protocol='https:',search=''){
 let clock=100000,id=0;const timers=new Map(),scripts=[],events=[],mute=[];
 const env={console,URLSearchParams,Date:{now:()=>clock},location:{hostname:host,protocol,search},document:{createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}},Event:class{constructor(type){this.type=type}},dispatchEvent:e=>events.push(e.type),DrifterPlatform:{setAdMuted:v=>mute.push(v)},setTimeout:(f,ms)=>{timers.set(++id,{f,at:clock+ms});return id},clearTimeout:i=>timers.delete(i)};
 env.window=env;vm.createContext(env);vm.runInContext(code,env);
 return{env,events,mute,scripts,api:env.DrifterGameDistribution,event:name=>env.GD_OPTIONS.onEvent({name}),advance:async ms=>{clock+=ms;for(const [key,t]of [...timers])if(t.at<=clock){timers.delete(key);t.f()}await flush()}};
}
(async()=>{
 const g=setup();assert.equal(g.scripts.length,1);assert.equal(g.env.GD_OPTIONS.gameId,'b2296dcb8238480f993960aabfb2bbb4');
 let requests=0,complete,continued=0;
 const first=g.api.runAfterAd(()=>continued++,'new');
 const duplicate=g.api.runAfterAd(()=>continued++,'new');assert.equal(first,duplicate);assert.equal(continued,0);
 g.env.gdsdk={showAd:type=>{assert.equal(type,'interstitial');requests++;return new Promise(r=>complete=r)}};
 assert.equal(requests,0);g.event('SDK_READY');await flush();assert.equal(requests,1);assert.equal(continued,0);
 g.event('SDK_GAME_PAUSE');assert.equal(g.mute.at(-1),true);
 g.event('SDK_GAME_START');await first;assert.equal(continued,1);assert.equal(g.mute.at(-1),false);complete();await flush();
 g.env.gdsdk.showAd=()=>{requests++;return Promise.resolve()};await g.api.showInterstitial('pause');assert.equal(requests,2);await g.advance(16000);
 g.env.gdsdk.showAd=()=>Promise.reject(Error('no fill'));
 await g.api.runAfterAd(()=>continued++,'continue');assert.equal(continued,2);assert.equal(g.api.lastAdResult,'unavailable');assert.match(g.api.lastError,/no fill/);assert.equal(g.mute.at(-1),false);
 const late=setup('revision.gamedistribution.com');const waiting=late.api.runAfterAd(()=>42,'new');await late.advance(12001);assert.equal(await waiting,42);assert.equal(late.mute.at(-1),false);
 let lateCalls=0;late.env.gdsdk={showAd:()=>{lateCalls++;return Promise.resolve()}};late.event('SDK_READY');await late.api.showInterstitial();assert.equal(lateCalls,1);
 const throwing=setup();throwing.env.gdsdk={showAd:()=>{throw Error('blocked')}};throwing.event('SDK_READY');await throwing.api.showInterstitial();assert.equal(throwing.mute.at(-1),false);
 const error=setup();error.env.gdsdk={showAd:()=>new Promise(()=>{})};error.event('SDK_READY');const request=error.api.showInterstitial();await flush();error.event('AD_ERROR');assert.equal(await request,'unavailable');assert.equal(error.mute.at(-1),false);
 const stuck=setup();stuck.env.gdsdk={showAd:()=>new Promise(()=>{})};stuck.event('SDK_READY');const timeout=stuck.api.showInterstitial();await stuck.advance(20001);assert.equal(await timeout,'request-timeout');assert.equal(stuck.mute.at(-1),false);
 for(const [host,protocol]of[['games.crazygames.com','https:'],['drifter-echo-isles.perkyspice3.chatgpt.site','https:'],['','file:']]){const off=setup(host,protocol);assert.equal(off.scripts.length,0);assert.equal(await off.api.showInterstitial(),'inactive')}
 const playing=setup();playing.env.gdsdk={showAd:()=>new Promise(()=>{})};playing.event('SDK_READY');const active=playing.api.showInterstitial();await flush();playing.event('SDK_GAME_PAUSE');await playing.advance(200000);assert.equal(playing.mute.at(-1),true);playing.event('SDK_GAME_START');assert.equal(await active,'completed');
 for(const search of ['?GD_SDK_REFERRER_URL=https%3A%2F%2Fpublisher.example','?gd_sdk_referrer_url=https%3A%2F%2Fpublisher.example'])assert.equal(setup('registered-game.example','https:',search).scripts.length,1);
 const makeGame=require('./harness.cjs'),game=await makeGame();Object.assign(game.env,{URLSearchParams,location:{protocol:'https:',hostname:'revision.gamedistribution.com',search:''}});game.run(code);
 let end;game.env.gdsdk={showAd:()=>new Promise(resolve=>end=resolve)};game.env.GD_OPTIONS.onEvent({name:'SDK_READY'});
 game.elements.get('btnNew').onclick();await flush();assert.equal(game.run('state'),'title');assert(game.run('distributionAdPaused&&backgroundSuspended'));
 end();await flush();assert.equal(game.run('state'),'play');assert(!game.run('distributionAdPaused||backgroundSuspended'));
 console.log('PASS GD: delayed SDK, one continuation, hosted loading, repeated opportunities, late READY, rejection/error/timeout recovery, and start-after-ad integration');
})().catch(e=>{console.error(e);process.exitCode=1});
