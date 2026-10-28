const assert=require('node:assert/strict');
const makeGame=require('./harness.cjs');
(async()=>{
 const g=await makeGame(),{run,elements}=g;
 function fresh(){run('freshStart();skipTutorial();closeMap();closeInv();closeActionMenu();backgroundSuspended=false;player.dead=false;');}
 function test(name,fn){fn();console.log('PASS',name);}

 test('a funded player away from camp gets a return action, compass and map distance',()=>{
  fresh();run('player.res.wood=4;player.res.stone=2;player.x=camp.x+18*TILE;player.y=camp.y;renderCampFeedback()');
  assert.equal(elements.get('campProjectOpen').textContent,'Return to camp');
  assert.match(elements.get('campProjectText').textContent,/Camp 18m/);
  assert.equal(elements.get('campCompass').hidden,false);
  assert.match(elements.get('campCompass').style.transform,/rotate\(/);
  elements.get('campProjectOpen').listeners.click[0]();
  assert.equal(run('mapOpen'),true);
  assert.equal(elements.get('mapCampDistance').textContent,'Camp · 18m');
  let routeDashed=false,routeDrawn=false;const mapContext=elements.get('bigmap').getContext('2d');
  mapContext.setLineDash=segments=>{if(segments.join(',')==='5,4')routeDashed=true};
  mapContext.stroke=()=>{routeDrawn=true};
  run('drawBigMap()');
  assert(routeDashed&&routeDrawn,'the map draws a dashed route between the player and camp');
 });

 test('at camp, the project action leads to the lantern craft and enables building',()=>{
  fresh();run('player.res.wood=4;player.res.stone=2;player.x=camp.x;player.y=camp.y;renderCampFeedback()');
  assert.equal(elements.get('campProjectOpen').textContent,'Make lantern');
  assert.equal(elements.get('campCompass').hidden,true);
  elements.get('campProjectOpen').listeners.click[0]();
  assert.equal(run('invOpen'),true);
  assert.match(run('craftHTML()'),/data-camp="lamp"[^>]*>Build lantern/);
 });

 test('missing camp materials outrank a closer berry bush for auto-gathering',()=>{
  fresh();run(`player.res.wood=0;player.res.stone=2;nodeCache=[
   {isNode:true,type:'bush',x:player.x+3,y:player.y,dead:false},
   {isNode:true,type:'tree',x:player.x+28,y:player.y,dead:false}
  ];`);
  assert.equal(run('findTarget().type'),'tree');
  run(`player.res.wood=4;player.res.stone=0;nodeCache=[
   {isNode:true,type:'tree',x:player.x+3,y:player.y,dead:false},
   {isNode:true,type:'rock',x:player.x+28,y:player.y,dead:false}
  ];`);
  assert.equal(run('findTarget().type'),'rock');
  run('player.res.stone=2');assert.equal(run('findTarget().type'),'tree');
 });

 test('collection receipt reports this pickup and basic gathering gives less early XP',()=>{
  fresh();run(`LANG='en';noteCollected('wood',2);`);
  assert.equal(elements.get('resourceReceipt').textContent,'Collected: Wood +2');
  assert.equal(run('NODE_INFO.tree.xp'),2);assert.equal(run('NODE_INFO.rock.xp'),2);assert.equal(run('NODE_INFO.bush.xp'),1);
 });
})().catch(e=>{console.error(e);process.exitCode=1;});
