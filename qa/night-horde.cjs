const assert=require('node:assert/strict'),makeGame=require('./harness.cjs');
(async()=>{
 const g=await makeGame(),run=g.run;
 run('freshStart();biomeAt=()=>B_MEADOW;gameT=600;updateLocalDarkspawn();gameT=601;updateLocalDarkspawn()');
 const count=()=>run('activeEnemies().filter(isDarkspawn).length');
 assert.equal(count(),12);
 run('gameT=605;updateLocalDarkspawn()');assert.equal(count(),24);
 run('for(let i=0;i<20;i++){gameT+=4;updateLocalDarkspawn()}');assert.equal(count(),120);
 assert(run('activeEnemies().filter(isDarkspawn).every(e=>!inCampfire(e.x,e.y))'));
 run('for(const c of chunks.values())c.enemies=c.enemies.filter(e=>!isDarkspawn(e));gameT+=4;updateLocalDarkspawn()');assert.equal(count(),12);
 run('player.x=5000;player.y=5000;gameT+=4;updateLocalDarkspawn()');assert.equal(count(),12);
 assert(run('[...chunks.values()].flatMap(c=>c.enemies).filter(isDarkspawn).every(e=>Math.hypot(e.x-player.x,e.y-player.y)<=NIGHT_HORDE.despawn)'));
 run('gameT=900;updateLocalDarkspawn()');assert.equal(count(),0);
 assert(run("['darkling','gloomfang','ashbrute'].every(type=>isDarkspawn({type})&&!nightMobBuff({type,x:5000,y:5000}))"));
 run('gameT=600;player.x=256;player.y=256;updateLocalDarkspawn();gameT=601;updateLocalDarkspawn()');assert.equal(count(),12);
 for(const type of ['darkling','gloomfang','ashbrute']){
  run(`{clearLocalDarkspawn();frameN++;const c=getChunk(1,1);c.enemies.push({type:'${type}',x:300,y:256,hp:100,maxHp:100,anim:0,alert:0,aggroed:true,isEnemy:true,darkspawn:true,kx:0,ky:0,flash:0,_u:-1});survivalUpdateEnemies(.016)}`);
  assert(run('activeEnemies().filter(isDarkspawn).every(e=>!inCampfire(e.x,e.y))'),type+' crossed firelight');
 }
 run('clearLocalDarkspawn();localDarkNight=-1;gameT=600;updateLocalDarkspawn();paused=true;gameT=601;updateLocalDarkspawn()');assert.equal(count(),0);
 run('paused=false;updateLocalDarkspawn()');assert.equal(count(),12);
 console.log('PASS night hordes: 12 opening, 12 per wave, 120 alive cap, replenishment after kills, distant cleanup, dawn cleanup, all species firelight exclusion, pause and new-night reset');
})().catch(e=>{console.error(e);process.exitCode=1});
