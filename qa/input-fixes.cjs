const assert=require('assert'),makeGame=require('./harness.cjs');
(async()=>{
 const g=await makeGame(),{run,elements,env}=g;
 function test(name,fn){try{fn();console.log('PASS',name);}catch(e){console.error('FAIL',name,e);process.exitCode=1;}}
 function fire(kind,target,extra={}){
  let stopped=false;const e={target,pointerType:'touch',pointerId:1,code:'',preventDefault(){this.defaultPrevented=true;},stopPropagation(){stopped=true;},stopImmediatePropagation(){stopped=true;},...extra};
  for(const f of g.captureListeners[kind]||[]){f(e);if(stopped)return e;}
  for(const f of target?.listeners[kind]||[]){f(e);if(stopped)return e;}
  if(kind==='click')target?.onclick?.(e);
  if(!stopped)for(const f of g.listeners[kind]||[]){f(e);if(stopped)break;}
  return e;
 }
 function panelAction(dataset){const button={dataset,closest:()=>button};for(const f of elements.get('panelBody').listeners.click||[])f({target:{closest:selector=>selector==='[data-act]'&&dataset.act||selector==='[data-exp]'&&dataset.exp?button:null}});}
 function fresh(){run('freshStart();skipTutorial();closeInv();closeActionMenu();');}
 test('touch down/up/click opens one persistent action menu; release click cannot dismiss it',()=>{
  fresh();const use=elements.get('btnUse');fire('pointerdown',use);assert(!run('actionMenuOpen'));fire('pointerup',use);assert(!run('actionMenuOpen'));fire('click',use);assert(run('actionMenuOpen'));
  const backdrop=elements.get('actionMenu');fire('click',backdrop);assert(run('actionMenuOpen'));
  fire('pointerdown',backdrop);fire('pointerup',backdrop);fire('click',backdrop);assert(!run('actionMenuOpen'));
 });
 test('holding E does not close a newly opened menu; a fresh E press closes it',()=>{
  fresh();fire('keydown',env.document.body,{code:'KeyE',repeat:false});assert(run('actionMenuOpen'));
  fire('keydown',env.document.body,{code:'KeyE',repeat:true});assert(run('actionMenuOpen'));
  fire('keyup',env.document.body,{code:'KeyE'});fire('keydown',env.document.body,{code:'KeyE',repeat:false});assert(!run('actionMenuOpen'));
 });
 test('focus loss preserves an open action menu and clears held input',()=>{
  fresh();run('showActionMenu();attackHeld=true;keys.KeyW=true;');fire('blur',env.document.body);assert(run('actionMenuOpen&&paused&&!attackHeld&&!keys.KeyW'));fire('focus',env.document.body);run('closeActionMenu()');
 });
 test('two equipment buttons work consecutively while inventory time stays paused',()=>{
  fresh();run(`globalThis.gearA={eq:makeEquipFixed('boots',mulberry32(10),1),x:player.x+5,y:player.y,uid:++uid,ttl:null};globalThis.gearB={eq:makeEquipFixed('sword',mulberry32(12),1),x:player.x+10,y:player.y,uid:++uid,ttl:null};groundEquip=[gearA,gearB];openInv('bag');globalThis.frozen=gameT;`);
  panelAction({act:'equipGround',uid:run('gearA.uid')});panelAction({act:'equipGround',uid:run('gearB.uid')});
  assert.equal(run('player.equip.filter(Boolean).length'),3);assert.equal(run('gameT'),run('frozen'));assert.equal(run('nearItems.length'),0);
 });
 test('full inventory replacement can be selected and confirmed without unpausing',()=>{
  run(`globalThis.swapGear={eq:makeEquipFixed('helmet',mulberry32(17),1),x:player.x+4,y:player.y,uid:++uid,ttl:null};groundEquip=[swapGear];refreshInterface();`);
  panelAction({act:'equipGround',uid:run('swapGear.uid')});assert(run('!!replaceState'));panelAction({act:'replaceSlot',i:1});panelAction({act:'confirmReplace'});
  assert.equal(run('player.equip[1].id'),run('swapGear.eq.id'));assert.equal(run('replaceState'),null);assert(run('paused'));
 });
 test('crafted equipment appears immediately and can be equipped from the paused bag',()=>{
  fresh();run(`player.res.wood=100;player.res.stone=100;openInv('craft');craftBase='sword';craftGear(0);globalThis.crafted=groundEquip.at(-1);`);
  assert(run('nearItems.some(g=>g===crafted)'));run(`invTab='bag';renderPanel()`);
  panelAction({act:'equipGround',uid:run('crafted.uid')});assert(run('player.equip.some(e=>e?.id===crafted.eq.id)'));
 });
 test('healing and stamina values update immediately while a menu is paused',()=>{
  run(`player.hp=7;player.stam=1;player.pots.heal=2;player.pots.tea=2;useConsumable('heal');useConsumable('tea');`);
  assert.equal(elements.get('hpValue').textContent,run("Math.ceil(player.hp)+' / '+stats.maxHp"));assert.equal(elements.get('stValue').textContent,run("Math.floor(player.stam)+' / '+stats.maxStam"));assert.equal(elements.get('stF').style.width,'100%');
 });
 test('regional forge button affordability includes matching shards',()=>{
  run('forgeTier=2;exp.blueprint=2;exp.shards[2]=0;player.res.wood=999;player.res.stone=999;');assert(!run('canForgeGear(0)'));
  run('exp.shards[2]=2');assert(run('canForgeGear(0)'));run('craftGear(0)');assert.equal(run('exp.shards[2]'),0);assert(!run('canForgeGear(0)'));
 });
 test('tutorial teaches movement, gathering and bag, then removes all route arrows',()=>{
  fresh();run('tutOpenIntro();');assert.equal(run('tutCur()'),'move');assert(run('journeyTarget!==null'));assert(!run("$('journeyHud').hidden"));
  run(`tutStepDone('move')`);assert.equal(run('tutCur()'),'gather');assert(run('journeyTarget&&["tree","rock"].includes(journeyTarget.type)'));
  run(`tutStepDone('gather');openInv('bag')`);assert(!run('tut.active'));assert(run("$('journeyHud').hidden&&$('tutorialArrow').hidden&&journeyTarget===null"));
 });
 test('skip remains off during exploration and after loading saved progress',()=>{
  fresh();run('tutOpenIntro()');fire('click',elements.get('tutorialSkip'));assert(!run('tut.active'));run('closeInv();update(.3);saveGame();loadSave();startPlay();renderJourneyHud();');assert(run("$('journeyHud').hidden&&journeyTarget===null"));
 });
 test('portrait blocks controls and simulation; landscape resumes without held inputs',()=>{
  fresh();env.innerWidth=390;env.innerHeight=844;fire('resize',env.document.body);assert(run('orientationBlocked&&paused'));assert(env.document.body.classList.contains('orientation-blocked'));
  const before=run('gameT');fire('keydown',env.document.body,{code:'KeyW'});run('frame(5000)');assert.equal(run('gameT'),before);assert(!run('keys.KeyW'));
  env.innerWidth=844;env.innerHeight=390;fire('resize',env.document.body);assert(!run('orientationBlocked||paused'));assert(!env.document.body.classList.contains('orientation-blocked'));run('frame(5016)');assert(run('gameT')>before);
 });
 test('talking to a wanderer keeps the world clock and NPC animation live without moving or attacking',()=>{
  fresh();run(`globalThis.talkNpc={id:'live-wanderer',persona:'wanderer',x:player.x,y:player.y,bob:0,anim:0};getChunk(Math.floor(player.x/CS),Math.floor(player.y/CS)).npc=talkNpc;globalThis.talkX=player.x;startDialog(talkNpc);globalThis.talkTime=gameT;globalThis.talkBob=talkNpc.bob;keys.KeyW=true;attackHeld=true;`);
  assert(run('dlg&&!paused&&document.body.classList.contains("dialog-open")'));
  run('update(.1)');
  assert(run('gameT>talkTime&&talkNpc.bob>talkBob'));
  assert.equal(run('player.x'),run('talkX'));
  run('endDialog()');assert(run('!dlg&&!paused&&!keys.KeyW&&!attackHeld'));
 });
 test('dialogue Next is a native button with one click activation; wanderers can finish without E',()=>{
  const html=require('fs').readFileSync(require('path').join(__dirname,'../game-assets/index.html'),'utf8');
  assert(/<button\b[^>]*\bid="dlgNext"[^>]*>/.test(html));
  fresh();run(`startDialog({id:'click-wanderer',persona:'wanderer',x:player.x,y:player.y});`);
  const next=elements.get('dlgNext');assert.equal(next.listeners.click.length,1);
  // The harness does not run the typewriter interval: first activation completes
  // text, second advances. This exercises the registered UI listener itself.
  fire('click',next);assert(run('dlg.done&&dlg.idx===0'));
  fire('click',next);assert(run('dlg.idx===1&&!dlg.done'));
  for(let i=0;i<12&&run('!!dlg');i++)fire('click',next);
  assert(run('!dlg&&!paused'));
 });
 test('merchant Next reaches its shop, buys once, and the registered close action exits',()=>{
  fresh();run(`player.res.wood=100;player.res.stone=100;player.res.iron=100;player.res.crystal=100;player.res.fang=100;player.res.jelly=100;player.res.berry=100;startDialog({id:'click-trader',persona:'trader',x:player.x,y:player.y});globalThis.shopTime=gameT;`);
  const next=elements.get('dlgNext');fire('click',next);fire('click',next);fire('click',next);
  assert(run('dlg.idx===1&&dlg.done&&!!dlg.shop'));assert.equal(next.style.display,'none');
  run(`globalThis.beforeSalve=player.pots.heal;globalThis.healIndex=dlg.shop.findIndex(i=>i.kind==='heal');`);
  const shop=elements.get('dlg').querySelector('.dlgShop');
  function shopClick(value){const b={dataset:{buy:String(value)}};for(const f of shop.listeners.click||[])f({target:{closest:()=>b}});}
  shopClick(run('healIndex'));assert.equal(run('player.pots.heal'),run('beforeSalve')+1);
  shopClick('close');assert(run('!dlg&&!paused'));assert.equal(run('gameT'),run('shopTime'));
 });
 test('paused, hidden, and background rendering cannot accumulate ambient particles',()=>{
  run(`globalThis.qaOldRandom=Math.random;Math.random=()=>0;particles=[];globalThis.qaNode={type:'ruin',x:player.x,y:player.y,looted:true};globalThis.qaNpc={persona:'wanderer',x:player.x,y:player.y,bob:0,anim:0};paused=true;`);
  for(let i=0;i<20;i++)run('drawNode(qaNode);drawNpc(qaNpc)');
  assert.equal(run('particles.length'),0);
  run('paused=false;document.hidden=true');for(let i=0;i<20;i++)run('drawNode(qaNode);drawNpc(qaNpc)');assert.equal(run('particles.length'),0);
  run('document.hidden=false;backgroundSuspended=true');for(let i=0;i<20;i++)run('drawNode(qaNode);drawNpc(qaNpc)');assert.equal(run('particles.length'),0);
  run('backgroundSuspended=false');run('drawNode(qaNode);drawNpc(qaNpc)');assert(run('particles.length>0'));
  run('Math.random=qaOldRandom;paused=false');
 });
})().catch(e=>{console.error(e);process.exitCode=1;});
