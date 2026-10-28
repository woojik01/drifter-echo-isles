const assert=require('node:assert/strict'),makeGame=require('./harness.cjs');
(async()=>{
 // Spawn on real generated terrain near the starting camp.
 const h=await makeGame(),q=h.run;q('seed=1234567;freshStart();exp.fireRadius=112;gameT=601;updateLocalDarkspawn()');
 for(let t=602;t<628;t+=2)q(`gameT=${t};updateLocalDarkspawn()`);
 const realCount=q('[...chunks.values()].flatMap(c=>c.enemies).filter(e=>e.darkspawn).length');assert(realCount>30,realCount);assert(realCount<=120);assert(q('[...chunks.values()].flatMap(c=>c.enemies).filter(e=>e.darkspawn).every(e=>!inCampfire(e.x,e.y,136)&&biomeAt(Math.floor(e.x/TILE),Math.floor(e.y/TILE))!==B_WATER)'));
 console.log('PASS real-terrain night horde:',realCount,'creatures in 26 seconds');
 q('biomeAt=()=>B_MEADOW;player.x=4000;player.y=4000');for(let t=628;t<670;t+=2)q(`gameT=${t};updateLocalDarkspawn()`);assert.equal(q('[...chunks.values()].flatMap(c=>c.enemies).filter(e=>e.darkspawn).length'),120);
 q('for(const c of chunks.values())c.enemies=c.enemies.filter(e=>!e.darkspawn);gameT=700;updateLocalDarkspawn()');assert.equal(q('[...chunks.values()].flatMap(c=>c.enemies).filter(e=>e.darkspawn).length'),12);
 q('player.x+=5000;gameT=703;updateLocalDarkspawn()');assert.equal(q('[...chunks.values()].flatMap(c=>c.enemies).filter(e=>e.darkspawn).length'),12);
 q('gameT=901;updateLocalDarkspawn()');assert.equal(q('[...chunks.values()].flatMap(c=>c.enemies).filter(e=>e.darkspawn).length'),0);
 q('gameT=1501;updateLocalDarkspawn();gameT=1502;player.dead=true;updateLocalDarkspawn()');assert.equal(q('[...chunks.values()].flatMap(c=>c.enemies).filter(e=>e.darkspawn).length'),0);
 q('player.dead=false;updateLocalDarkspawn()');assert(q('[...chunks.values()].flatMap(c=>c.enemies).some(e=>e.darkspawn)'));
 q('seed=1234567;freshStart();gameT=601;updateLocalDarkspawn()');assert.equal(q('localDarkCount'),0);
 console.log('PASS cap 120, killed creatures refill, distant cleanup, dawn cleanup, dead-player gate, new-journey reset');
})().catch(e=>{console.error(e);process.exitCode=1});
