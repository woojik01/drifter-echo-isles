const assert=require('node:assert/strict'),fs=require('fs'),makeGame=require('./harness.cjs');
(async()=>{
 const game=await makeGame({realCanvas:true,width:1280,height:720}),r=game.run;
 r('seed=1234567;freshStart();tut.active=false;player.x=1800;player.y=1800;cam.x=player.x;cam.y=player.y;gameT=720;for(let i=0;i<20;i++)render()');
 assert.equal(r('nightVisionStrength()'),1);
 const alpha=(x,y)=>r(`nightMaskCtx.getImageData(${x},${y},1,1).data[3]`);
 assert(alpha(320,180)<5,'player must stay visible');assert(alpha(8,8)>240,'outside vision must be dark');assert(alpha(450,180)>240,'nearby view radius must be bounded');
 assert(r('nightMask.width===640&&nightMask.height===360'),'mask should use half resolution');
 fs.mkdirSync('../qa-screens',{recursive:true});fs.writeFileSync('../qa-screens/night-wild.png',game.elements.get('cv').toBuffer('image/png'));
 r('player.x=256;player.y=256;cam.x=256;cam.y=256;exp.fireRadius=320;exp.fireUpdatedAt=720;render()');assert(alpha(480,180)<40,'campfire must reveal its safe area');
 fs.writeFileSync('../qa-screens/night-camp.png',game.elements.get('cv').toBuffer('image/png'));
 r('gameT=606');assert.equal(r('nightVisionStrength()'),.5);r('gameT=894');assert.equal(r('nightVisionStrength()'),.5);r('gameT=100');assert.equal(r('nightVisionStrength()'),0);r('gameT=900');assert.equal(r('nightVisionStrength()'),0);
 r('DrifterMultiplayer.worldTime=()=>720;gameT=0;render()');assert.equal(r('nightVisionStrength()'),1,'party must use shared server time');
 console.log('PASS night mask pixels, bounded 96-unit vision, campfire lighting, half-resolution rendering, dusk/dawn fade, shared party clock');
})().catch(e=>{console.error(e);process.exitCode=1});
