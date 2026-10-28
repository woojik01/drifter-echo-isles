const assert=require('node:assert/strict');
const makeGame=require('./harness.cjs');

function test(name,fn){fn();console.log('PASS',name);}
function fireGlobal(game,type,event){for(const fn of game.listeners[type]||[])fn(event);}
function fireElement(element,type,event){for(const fn of element.listeners[type]||[])fn(event);}

(async()=>{
 const g=await makeGame();const{run,elements,storage}=g;
 test('raft controls stay disabled until both resources are available and refresh immediately',()=>{
  run('freshStart();');
  assert.equal(elements.get('raftBtn').disabled,true);
  assert.match(run('craftHTML()'),/data-exp="raft" disabled/);
  run('player.res.wood=12;player.res.stone=3;renderRes();');
  assert.equal(elements.get('raftBtn').disabled,true);
  run('player.res.stone=4;renderRes();');
  assert.equal(elements.get('raftBtn').disabled,false);
  assert.doesNotMatch(run('craftHTML()'),/data-exp="raft" disabled/);
  run('toggleRaft();');
  assert.equal(run('exp.raft'),true);
  assert.equal(run('player.res.wood'),0);assert.equal(run('player.res.stone'),0);
  assert.equal(elements.get('raftBtn').disabled,false,'boarding remains enabled after crafting');
  assert.match(run('craftHTML()'),/data-exp="raft" disabled/);
 });

 test('the start map reveals a small local area and keeps distant fog hidden',()=>{
  run('freshStart();');
  assert.equal(run('explored.size'),25);
  assert(run('explored.size<100'));
  assert.match(run('expeditionSignal()'),/eastern shore|동쪽 해안/);
 });

 test('first gathered resource removes nearby harvest markers and persists without changing old saves',()=>{
  run('freshStart();nodeCache=[{type:"tree",x:player.x+20,y:player.y,dead:false},{type:"rock",x:player.x+30,y:player.y,dead:false}];frameN++;updateGatherHintTargets();');
  assert.equal(run('gatherHintTargets.size'),2);
  run('groundRes=[{res:"wood",x:player.x,y:player.y,vx:0,vy:0,t:0,magnet:false}];updateGroundRes(.016);');
  assert.equal(run('player.res.wood'),1);assert.equal(run('exp.firstGatherDone'),true);
  assert.equal(JSON.parse(storage.get('drifter_save_v1')).exp.firstGatherDone,true);
  run('frameN++;updateGatherHintTargets();');assert.equal(run('gatherHintTargets.size'),0);
  run('globalThis.oldSave=JSON.parse(DrifterPlatform.storage.getItem(SAVE_KEY));delete oldSave.exp.firstGatherDone;oldSave.res.wood=2;DrifterPlatform.storage.setItem(SAVE_KEY,JSON.stringify(oldSave));loadSave();');
  assert.equal(run('exp.firstGatherDone'),true,'older saves with collected materials migrate the hint state');
 });

 const keyboard=await makeGame();
 test('keyboard movement displays PC guidance and completes the same first-move lesson',()=>{
  keyboard.run('freshStart();');
  assert.match(keyboard.elements.get('journeyText').textContent,/WASD|방향키/);
  fireGlobal(keyboard,'keydown',{code:'KeyD',repeat:false,preventDefault(){}});
  assert.equal(keyboard.run('getMove().x'),1);
  keyboard.run('player.x+=61;tutTrackMove(.016,true);');
  assert.equal(keyboard.run('tutCur()'),'gather');
 });

 const touch=await makeGame();
 test('touch dragging updates guidance and completes the same first-move lesson',()=>{
  touch.run('freshStart();');
  const pad=touch.elements.get('pad');
  fireElement(pad,'pointerdown',{pointerType:'touch',pointerId:7,clientX:100,clientY:600});
  fireElement(pad,'pointermove',{pointerType:'touch',pointerId:7,clientX:130,clientY:600});
  assert.equal(touch.run('tutorialInputMode'),'touch');
  assert.match(touch.elements.get('journeyText').textContent,/Touch and drag|터치하고 끌어/);
  assert.equal(touch.run('getMove().x'),1);
  touch.run('player.x+=61;tutTrackMove(.016,true);');
  assert.equal(touch.run('tutCur()'),'gather');
  touch.run('skipTutorial();saveGame();loadSave();startJourneyTutorial();');
  assert.equal(touch.run('tut.active'),false);
  assert.equal(touch.run('tutIsDone()'),true);
 });

 const craft=await makeGame();
 test('starter recipes stay visible; advanced and regional recipes unlock in collapsible sections',()=>{
  craft.run('freshStart();');
  let html=craft.run('craftHTML()');
  assert.match(html,/초반 제작 · 회복|Early crafts · supplies/);
  assert.match(html,/data-act="craft" data-r="0"/);
  assert.match(html,/data-act="craftGear" data-tier="0"/);
  assert.match(html,/class="craft-fold locked" id="regionCraftRecipes"/);
  assert.match(html,/class="craft-fold locked" id="advancedGearRecipes"/);
  craft.run('player.res.iron=4;player.res.fang=3;renderPanel();');
  html=craft.run('craftHTML()');
  assert.match(html,/class="craft-fold unlocked" id="advancedGearRecipes" open/);
  craft.run('exp.glass=3;renderPanel();');
  html=craft.run('craftHTML()');
  assert.match(html,/class="craft-fold unlocked" id="regionCraftRecipes" open/);
 });

 console.log('PASS Drifter v1.5.1 focused regression suite');
})().catch(e=>{console.error(e);process.exitCode=1;});
