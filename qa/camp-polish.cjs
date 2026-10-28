const assert=require('node:assert/strict');
const fs=require('node:fs');
const makeGame=require('./harness.cjs');
(async()=>{
 const g=await makeGame();const{run,elements,storage}=g;
 function test(name,fn){fn();console.log('PASS',name);}
 function fresh(){run('freshStart();skipTutorial();closeInv();closeActionMenu();backgroundSuspended=false;player.dead=false;');}
 test('a hit does not finish gathering; drops at the old magnet dead zone reach the bag',()=>{
  fresh();run(`tutOpenIntro();tutStepDone('move');nodeCache=activeNodes();globalThis.testNode=nodeCache.find(n=>n.type==='tree');damageNode(testNode,1);`);
  assert.equal(run('tutCur()'),'gather');
  run(`groundRes=[{res:'wood',x:player.x+34,y:player.y,vx:0,vy:0,t:0,magnet:false}];for(let i=0;i<40;i++)updateGroundRes(.016);`);
  assert.equal(run('player.res.wood'),1);assert.equal(run('groundRes.length'),0);assert.equal(run('tutCur()'),'bag');
  assert.match(elements.get('resourceReceipt').textContent,/Wood \+1|나무 \+1/);
 });
 test('lantern consumes exactly its cost, is camp-only and idempotent, and persists',()=>{
  fresh();run('player.res.wood=4;player.res.stone=2;player.x=1000;');assert.equal(run('buildCampLantern()'),false);assert.equal(run('player.res.wood'),4);
  run('player.x=camp.x;player.y=camp.y;openInv("craft")');assert.equal(run('buildCampLantern()'),true);assert.equal(run('player.res.wood'),0);assert.equal(run('player.res.stone'),0);
  assert.equal(run('buildCampLantern()'),false);assert(run('campProgress().lamp'));run('saveGame();exp=newExpedition();loadSave()');assert(run('campProgress().lamp'));
 });
 test('all three trail recipes grant their stated different effects and debit once',()=>{
  for(const [key,effect]of[['ore','vein'],['mist','wader'],['ruin','guide']]){
   fresh();run('campProgress().lamp=true;player.res.wood=50;player.res.stone=50;player.res.berry=50;');
   assert(run(`craftTrailGear('${key}')`));assert(run(`player.equip.some(e=>e?.effect==='${effect}')`));
   const recipe=run(`TRAIL_RECIPES.find(r=>r.key==='${key}')`);for(const[k,n]of Object.entries(recipe.cost))assert.equal(run(`player.res.${k}`),50-n);
  }
  run('player.res.wood=0;player.res.stone=0;player.res.berry=0;');assert.equal(run("craftTrailGear('ore')"),false);
 });
 test('new crafters see one first project; every original recipe remains available',()=>{
  fresh();const html=run('craftHTML()');assert.match(html,/A small camp lantern|작은 캠프 등불/);assert.match(html,/Early crafts · supplies|초반 제작 · 회복/);assert.match(html,/data-act="craftGear" data-tier="0"/);assert.match(html,/id="advancedGearRecipes"/);assert.match(html,/id="regionCraftRecipes"/);assert.match(html,/id="shadowGearRecipes"/);assert.match(html,/data-exp="craftDuskward"/);
  run('campProgress().lamp=true');assert.match(run('craftHTML()'),/data-recipe="ore"/);assert.match(run('craftHTML()'),/data-recipe="mist"/);assert.match(run('craftHTML()'),/data-recipe="ruin"/);
 });
 test('gear comparison shows signed units and explicit effect gains and losses for all slots',()=>{
  fresh();const html=run(`gearPreviewHTML({base:'boots',opts:[{k:'stam',v:8}],effect:'wader',power:1})`);assert.match(html,/Speed \+10%|이동 속도 \+10%/);assert.match(html,/Attack -2|공격력 -2/);assert.match(html,/Gain: Mistwalker|얻음: 물안개 걸음/);
  const changed=run(`compareHTML({base:'boots',opts:[],effect:'guide',power:1},{base:'boots',opts:[],effect:'wader',power:1})`);assert.match(changed,/Lose: Mistwalker|잃음: 물안개 걸음/);assert.match(changed,/Gain: Wayfinder|얻음: 길잡이/);
 });
 test('garden progresses through actual growth and survives a save; old blooms migrate intact',()=>{
  fresh();run('exp.seeds=[0];plantSeed(0);closeInv();');assert.equal(run('campProgress().gardenAge[0]'),0);
  run('update(31)');assert.equal(run('campProgress().gardenAge[0]'),31);run('update(60)');assert.equal(run('campProgress().gardenAge[0]'),90);assert.match(run('gardenCardHTML()'),/In bloom|활짝 핌/);
  run(`saveGame();globalThis.oldGarden=JSON.parse(DrifterPlatform.storage.getItem(SAVE_KEY));delete oldGarden.exp.campProject;DrifterPlatform.storage.setItem(SAVE_KEY,JSON.stringify(oldGarden));loadSave();`);assert.equal(run('campProgress().gardenAge[0]'),90);
 });
 test('a dawn mark requires one minute alive at night and cannot repeat after reload',()=>{
  fresh();run('gameT=610;update(.1);campProgress().watch=59;gameT=899;update(2);');assert.equal(run('campProgress().nightMarks'),0);
  fresh();run('gameT=610;update(.1);campProgress().watch=61;gameT=899;update(2);');assert.equal(run('campProgress().nightMarks'),1);
  run('saveGame();loadSave();update(.1)');assert.equal(run('campProgress().nightMarks'),1);
 });
 test('new progress rejects malformed imports and keeps the current save',()=>{
  fresh();run('saveGame();globalThis.good=JSON.parse(DrifterPlatform.storage.getItem(SAVE_KEY));');assert(run('validSave(good)'));
  assert(!run('validSave({...good,exp:{...good.exp,campProject:{...good.exp.campProject,gardenAge:[0]}}})'));
  assert(!run('validSave({...good,exp:{...good.exp,campProject:{...good.exp.campProject,watch:999999}}})'));
 });
 test('both languages render every new interface and remain valid at small canvas sizes',()=>{
  for(const[w,h]of[[821,462],[800,450],[1280,720]])for(const lang of['ko','en']){g.env.innerWidth=w;g.env.innerHeight=h;run(`LANG='${lang}';applyLang();resize();render();openInv('craft');renderPanel();closeInv();`);assert.equal(run('orientationBlocked'),false);}
  const html=fs.readFileSync('game-assets/index.html','utf8');const ids=[...html.split('<script>')[0].matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);assert.equal(run('RELEASE_VERSION'),'1.5.5');
 });
})().catch(e=>{console.error(e);process.exitCode=1;});
