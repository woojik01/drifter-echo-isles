'use strict';
// Release 1.4: survival cycle, campfire defense, and night creatures.
const RELEASE_VERSION='1.5.6';
let orientationBlocked=false;
let backgroundSuspended=false, distributionAdPaused=false, journeyClock=0, journeyTarget=null, guideWisp=null;
const INTRO_ISLANDS=[
  {id:'isle:prism',tx:158,ty:26,rx:14,ry:11,variant:1},
  {id:'isle:wisp',tx:151,ty:106,rx:14,ry:12,variant:2}
];
const SEED_NAMES={ko:['새벽꽃','유리꽃','별이끼'],en:['Dawn bloom','Glassflower','Star moss']};
const PUZZLE_NAMES={ko:['메아리의 순서','빛의 방향','숲의 길잡이'],en:['Echo sequence','Prism light','Wisp grove']};
const releaseNewExpedition=newExpedition;
newExpedition=function(){return {...releaseNewExpedition(),planted:[],mirrors:{},carrying:null,journeyComplete:false,fireRadius:320,fireUpdatedAt:0};};
// Fresh title worlds also need the new defaults before the first click.
exp=Object.assign(newExpedition(),exp);

const SURVIVAL_DAY=600,SURVIVAL_NIGHT=300,SURVIVAL_CYCLE=SURVIVAL_DAY+SURVIVAL_NIGHT;
const FIRE_START=320,FIRE_MIN=112,FIRE_MAX=560,FIRE_DECAY=.22,FIRE_COST=4,FIRE_GROWTH=64;
function survivalNow(){const shared=window.DrifterMultiplayer?.worldTime?.();return Number.isFinite(shared)?shared:gameT}
function survivalPhase(time=survivalNow()){
 const safe=Math.max(0,Number.isFinite(time)?time:0),phase=safe%SURVIVAL_CYCLE,night=phase>=SURVIVAL_DAY;
 return{night,phase,secondsLeft:Math.ceil(night?SURVIVAL_CYCLE-phase:SURVIVAL_DAY-phase),nightIndex:Math.floor(safe/SURVIVAL_CYCLE)}
}
function campfireRadius(time=survivalNow()){
 const base=clamp(Number(exp.fireRadius)||FIRE_START,FIRE_MIN,FIRE_MAX),updated=Number.isFinite(exp.fireUpdatedAt)?exp.fireUpdatedAt:time;
 return Math.max(FIRE_MIN,base-Math.max(0,time-updated)*FIRE_DECAY)
}
function inCampfire(x,y,radius=campfireRadius()){return Math.hypot(x-256,y-256)<=radius}
const NIGHT_CREATURE_TYPES=new Set(['darkling','gloomfang','ashbrute']);
const NIGHT_HORDE={cap:120,opening:12,wave:12,interval:2,despawn:1600};
function isDarkspawn(enemy){return !!enemy?.darkspawn||NIGHT_CREATURE_TYPES.has(typeof enemy==='string'?enemy:enemy?.type)}
function nightMobBuff(e){return survivalPhase().night&&!isDarkspawn(e)&&!inCampfire(e?.x||0,e?.y||0)}
window.DrifterSurvival={now:survivalNow,phase:survivalPhase,isNight:()=>survivalPhase().night,fireRadius:campfireRadius,inFirelight:inCampfire,nightBuff:nightMobBuff,isDarkspawn};
let localDarkNight=-1,localDarkAt=0,localDarkCount=0,localDarkLastTime=0;
function clearLocalDarkspawn(){for(const c of chunks.values())c.enemies=c.enemies.filter(e=>!isDarkspawn(e))}
function updateLocalDarkspawn(){
 if(window.DrifterMultiplayer?.isInPartyWorld?.())return;
 const phase=survivalPhase(),time=survivalNow();
 if(!phase.night){if(localDarkNight!==-1)clearLocalDarkspawn();localDarkNight=-1;localDarkCount=0;localDarkLastTime=time;return}
 if(localDarkNight!==phase.nightIndex||time<localDarkLastTime){clearLocalDarkspawn();localDarkNight=phase.nightIndex;localDarkCount=0;localDarkAt=time+1}
 localDarkLastTime=time;
 if(state!=='play'||paused||player.dead||dlg||backgroundSuspended||time<localDarkAt)return;
 localDarkAt=time+NIGHT_HORDE.interval;
 // Reclaim distant creatures so travelling never accumulates an unlimited army.
 const nearby=[];
 for(const c of chunks.values())c.enemies=c.enemies.filter(e=>{
  if(!isDarkspawn(e))return true;
  if(Math.hypot(e.x-player.x,e.y-player.y)>NIGHT_HORDE.despawn)return false;
  nearby.push(e);return true;
 });
 const target=Math.min(localDarkCount===0?NIGHT_HORDE.opening:NIGHT_HORDE.wave,NIGHT_HORDE.cap-nearby.length);
 const radius=campfireRadius(),ring=inCampfire(player.x,player.y)?Math.max(300,radius+48):300;
 let added=0;
 for(let attempt=0;attempt<target*24&&added<target;attempt++){
  const angle=rand(0,Math.PI*2),distance=ring+rand(0,160),x=player.x+Math.cos(angle)*distance,y=player.y+Math.sin(angle)*distance;
  if(biomeAt(Math.floor(x/TILE),Math.floor(y/TILE))===B_WATER||inCampfire(x,y,radius+32)||nearby.some(e=>Math.hypot(e.x-x,e.y-y)<28))continue;
  const c=getChunk(Math.floor(x/CS),Math.floor(y/CS));
  const roll=Math.random(),type=roll<.76?'darkling':roll<.95?'gloomfang':'ashbrute',info=ENEMY_INFO[type],tier=tierAt(x,y),hp=Math.round(info.hp*(1+.2*tier));
  const enemy={type,tier,x,y,hp,maxHp:hp,anim:Math.random()*10,wdir:rand(0,6.28),wt:rand(1,4),kx:0,ky:0,flash:0,fx:1,alert:.9,aggroed:true,isEnemy:true,darkspawn:true,originId:`dark:${phase.nightIndex}:${++localDarkCount}`,homeX:x,homeY:y,_u:0};
  c.enemies.push(enemy);nearby.push(enemy);added++;
 }
}
const survivalInitWorld=initWorld;
initWorld=function(){localDarkNight=-1;localDarkAt=0;localDarkCount=0;return survivalInitWorld()};
const survivalUpdateEnemies=updateEnemies;
updateEnemies=function(dt){updateLocalDarkspawn();survivalUpdateEnemies(dt)};
function stokeCampfire(){
 if(window.DrifterMultiplayer?.isInPartyWorld?.())return window.DrifterMultiplayer.sharedAction('stokeFire',null);
 if(!atCamp()||player.res.wood<FIRE_COST)return false;
 player.res.wood-=FIRE_COST;const now=survivalNow();exp.fireRadius=Math.min(FIRE_MAX,campfireRadius(now)+FIRE_GROWTH);exp.fireUpdatedAt=now;
 renderRes(true);sfx('trade');toast(L('장작불 영역이 넓어졌습니다.','The firelight grew.'));saveGame();if(invOpen)renderPanel();return true
}
function survivalGear(kind){
 const duskward=kind==='duskward',cost=duskward?{gloom:3,nightCore:1}:{gloom:2,nightFang:2};
 if(Object.entries(cost).some(([key,count])=>player.res[key]<count))return false;
 for(const [key,count]of Object.entries(cost))player.res[key]-=count;
 const eq=makeEquipFixed(duskward?'amulet':'boots',Math.random,0);
 eq.opts=duskward?[{k:'vit',v:8},{k:'regen',v:2}]:[{k:'spd',v:12},{k:'stam',v:12}];
 eq.effect=kind;eq.source='shadowcraft';eq.tier=1;eq.power=1.15;
 const slot=player.equip.indexOf(null);
 if(slot>=0){player.equip[slot]=eq;recalcStats()}else addGroundEquip({eq,x:player.x+18,y:player.y+8,ttl:null,uid:++uid,spawnT:gameT});
 renderRes(true);sfx('level');toast(L(duskward?'황혼 수호 부적을 만들었습니다.':'밤걸음 장화를 만들었습니다.',duskward?'Duskward charm crafted.':'Nightstep boots crafted.'));
 saveGame();if(invOpen)renderPanel();return true
}
function updateSurvivalHud(){
 const el=$('survivalHud');if(!el)return;
 const show=state==='play';el.hidden=!show;if(!show)return;
 const phase=survivalPhase(),minutes=Math.floor(phase.secondsLeft/60),seconds=phase.secondsLeft%60;
 el.textContent=(phase.night?'☾ ':'☀ ')+L(phase.night?'밤':'낮',phase.night?'Night':'Day')+' '+minutes+':'+String(seconds).padStart(2,'0')+' · 🔥 '+Math.round(campfireRadius());
 el.dataset.phase=phase.night?'night':'day';
}

const releaseNearbyIslands=nearbyIslands;
nearbyIslands=function(tx,ty,r=1){return [...releaseNearbyIslands(tx,ty,r),...INTRO_ISLANDS];};
const releaseIslandAt=islandAt;
islandAt=function(x,y){for(const i of INTRO_ISLANDS)if(((x/TILE-i.tx)/i.rx)**2+((y/TILE-i.ty)/i.ry)**2<1)return i;return releaseIslandAt(x,y);};
const releaseBiome=biomeAt;
biomeAt=function(tx,ty){
 for(const i of INTRO_ISLANDS){
  const land=((tx-i.tx)/i.rx)**2+((ty-i.ty)/i.ry)**2;
  const ocean=((tx-i.tx)/(i.rx+26))**2+((ty-i.ty)/(i.ry+24))**2;
  if(land<.68)return i.variant===1&&land>.2?B_ROCK:i.variant===2&&land>.25?B_FOREST:B_MEADOW;
  if(land<1)return B_SAND;if(land<1.23)return B_SHALLOW;if(ocean<.88)return B_WATER;if(ocean<1)return B_SHALLOW;
 }
 return releaseBiome(tx,ty);
};
function mirrorTarget(n){const center=islandNodes(n.island)[0];return ((Math.round(Math.atan2(center.y-n.y,center.x-n.x)/(Math.PI/2))%4)+4)%4;}
function mirrorDirection(n){const values=exp.mirrors[n.islandId];return values?.[n.rune]??((mirrorTarget(n)+2)%4);}
function runeCount(id){return (exp.runes[id]||[]).length;}
function centerOf(i){return{x:(i.tx+.5)*TILE,y:(i.ty+.5)*TILE};}
function findIsland(id){return [tutorialIsland(),...INTRO_ISLANDS,...nearbyIslands(player.x/TILE,player.y/TILE,2)].find(i=>i.id===id);}
function lightRune(n){
 const a=exp.runes[n.islandId]||(exp.runes[n.islandId]=[]);
 if(a.includes(n.rune))return;
 a.push(n.rune);n.looted=true;ringFx(n.x,n.y-12,'#bce9d6');sfx('trade');saveGame();
 toast(L('섬의 빛 ','Island light ')+a.length+'/3','small');
}
const releaseInvestigate=investigateRuin;
investigateRuin=function(n){
 if(!n?.islandId){releaseInvestigate(n);return;}
 if(n.looted||exp.claimed.includes(n.islandId))return;
 if(n.rune>=0){
  if(n.island.variant===0){
   const next=[0,1,2].find(v=>!(exp.runes[n.islandId]||[]).includes(v));
   if(n.rune!==next){sfx('deny');toast(L('먼저 빛나는 룬 ','Follow the glowing rune ')+(next+1));return;}
   lightRune(n);
  }else if(n.island.variant===1){
   const values=exp.mirrors[n.islandId]||(exp.mirrors[n.islandId]=[]);
   values[n.rune]=(mirrorDirection(n)+1)%4;
   if(values[n.rune]===mirrorTarget(n))lightRune(n);
   else{sfx('ui');toast(L('빛을 중앙 제단 쪽으로 돌리세요.','Turn the light toward the central altar.'),'small');saveGame();}
  }else{
   if(exp.carrying){toast(L('함께 온 별빛을 중앙 제단으로 안내하세요.','Lead your wisp to the central altar first.'));return;}
   exp.carrying={id:n.islandId,rune:n.rune};guideWisp={x:n.x,y:n.y-18};
   sfx('star');toast(L('별빛이 따라옵니다. 중앙 제단으로!','A wisp follows you. Lead it to the altar!'));saveGame();
  }
  renderJourneyHud();return;
 }
 const was=exp.claimed.length;
 releaseInvestigate(n);
 if(exp.claimed.length!==was){
  for(const [key,c]of chunks)if(Math.hypot((c.cx+.5)*CS-n.x,(c.cy+.5)*CS-n.y)<900)terrainLRU.delete(key);
  burst(n.x,n.y-20,['#dcebc2','#eed798','#95d4bf'],42);ringFx(n.x,n.y,'#f3d99f');
  DrifterPlatform.celebrate();renderJourneyHud();
  toast(L('섬이 깨어났습니다 · 씨앗을 모닥불에 심어 보세요.','Island awakened · plant its seed at your camp.'));
 }
};

function plantSeed(s){
 if(!atCamp()||!exp.seeds.includes(s)||exp.planted.includes(s))return;
 exp.planted.push(s);exp.journeyComplete=true;
 burst(camp.x-40+(exp.planted.length-1)*17,camp.y+4,['#b5dfb4','#edda9f'],26);
 sfx('level');toast(SEED_NAMES[LANG][s]+L('이 거점에서 피어났습니다.',' now grows at your camp.'));
 saveGame();renderJourneyHud();if(invOpen)renderPanel();
}
function returnToCamp(){
 if(activeEnemies().some(e=>e.aggroed&&Math.hypot(e.x-player.x,e.y-player.y)<160))return;
 exp.sailing=false;exp.carrying=null;guideWisp=null;releaseControls();closeInv();
 warpTo({x:camp.x+14,y:camp.y+14});saveGame();renderJourneyHud();
}
const releaseActions=availableActions;
availableActions=function(){
 const out=releaseActions();if(state!=='play'||player.dead||fishing)return out;
 const nodes=activeNodes();
 for(const a of out){
  if(!a.id.startsWith('node:'))continue;
  const n=nodes.find(n=>a.id==='node:'+n.chunkKey+':'+n.idx);if(!n?.islandId)continue;
  if(n.rune<0){a.label=L('섬 깨우기','Awaken island');a.detail=L('섬의 빛 ','Island lights ')+runeCount(n.islandId)+'/3';a.disabled=runeCount(n.islandId)<3;continue;}
  if(n.island.variant===0){a.label=L('메아리 룬 ','Echo rune ')+(n.rune+1);a.detail=L('1 → 2 → 3 순서로 켜세요.','Light the runes in order: 1 → 2 → 3.');a.disabled=n.rune!==[0,1,2].find(v=>!(exp.runes[n.islandId]||[]).includes(v));}
  if(n.island.variant===1){a.label=L('빛 돌리기','Turn prism');a.detail=['→','↓','←','↑'][mirrorDirection(n)]+' · '+L('제단을 향해 빛을 연결하세요.','Point the beam toward the altar.');}
  if(n.island.variant===2){a.label=L('별빛 부르기','Call wisp');a.detail=L('별빛과 함께 중앙 제단으로 걸어가세요.','Walk with the wisp to the central altar.');a.disabled=!!exp.carrying;}
 }
 if(!exp.sailing&&atCamp())for(const s of exp.seeds)if(!exp.planted.includes(s))out.unshift(actionEntry('plant:'+s,L('씨앗 심기 · ','Plant · ')+SEED_NAMES[LANG][s],L('모닥불 곁에 영구히 피어납니다.','A permanent bloom beside your campfire.'),()=>plantSeed(s)));
 if(!exp.sailing&&!exp.raft&&canAfford({wood:12,stone:4})&&!out.some(a=>a.id==='raft:craft'))out.unshift(actionEntry('raft:craft',L('뗏목 제작','Build raft'),L('나무 12 · 돌 4','12 wood · 4 stone'),()=>toggleRaft()));
 const island=islandAt(player.x,player.y);
 if(island&&exp.claimed.includes(island.id)&&!exp.sailing&&!atCamp())out.push(actionEntry('camp:return',L('모닥불로 귀환','Return to camp'),L('섬의 빛을 타고 거점으로 돌아갑니다.','Travel home with the island light.'),returnToCamp));
 return out;
};
const survivalActions=availableActions;
availableActions=function(){
 const out=survivalActions();
 if(state==='play'&&!player.dead&&!exp.sailing&&atCamp())out.unshift(actionEntry('fire:stoke',L('장작불 키우기 · 나무 4','Feed fire · 4 wood'),L('불빛 영역을 넓힙니다.','Expand the firelight area.'),stokeCampfire,{disabled:player.res.wood<FIRE_COST||campfireRadius()>=FIRE_MAX}));
 return out;
};

function nextIsland(){
 const islands=[tutorialIsland(),...INTRO_ISLANDS];
 const next=islands.find(i=>!exp.claimed.includes(i.id));if(next)return next;
 return nearbyIslands(player.x/TILE,player.y/TILE,2).filter(i=>!exp.claimed.includes(i.id)).sort((a,b)=>Math.hypot(a.tx*TILE-player.x,a.ty*TILE-player.y)-Math.hypot(b.tx*TILE-player.x,b.ty*TILE-player.y))[0]||null;
}
// Only the short controls lesson owns a world arrow. Exploration has no mandatory route.
function journeyGoal(){
 if(!tut.active)return{label:'',target:null};
 const step=tutCur();
 if(step==='move')return{label:tutorialInputMode==='touch'?L('화면 왼쪽 아래를 터치하고 끌어 이동하세요.','Touch and drag the lower left to move.'):L('WASD 또는 방향키로 이동하세요.','Move with WASD or the arrow keys.'),target:{x:camp.x+76,y:camp.y+14}};
 if(step==='gather'){
  const node=activeNodes().filter(n=>!n.dead&&['tree','rock'].includes(n.type)).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];
  const drop=groundRes.find(r=>Math.hypot(r.x-player.x,r.y-player.y)<180);
  return{label:drop?L('떨어진 재료 가까이 가세요 · 배낭에 들어오면 완료!','Approach the drop · collect it in your bag to finish!'):tutorialInputMode==='touch'?L('화살표 근처에서 공격을 길게 눌러 재료를 모으세요.','Hold Attack near the arrow to gather a resource.'):L('화살표 근처에서 Space를 길게 눌러 재료를 모으세요.','Hold Space near the arrow to gather a resource.'),target:drop||node||null};
 }
 return{label:L('화살표가 가리키는 배낭을 여세요.','Open the bag indicated by the arrow.'),target:null};
}
function renderJourneyHud(){
 const show=state==='play'&&tut.active;
 $('journeyHud').hidden=!show;
 if(!show){journeyTarget=null;$('tutorialArrow').hidden=true;return;}
 const goal=journeyGoal();journeyTarget=goal.target;
 $('journeyText').textContent=goal.label;$('tutorialSkip').textContent=L('건너뛰기','Skip');
 const button=tutCur()==='bag'?$('btnBag'):tutCur()==='gather'&&tutorialInputMode==='touch'?$('btnAtk'):null;
 $('tutorialArrow').hidden=!button||paused;
 if(button){const r=button.getBoundingClientRect();$('tutorialArrow').style.left=(r.left+r.width/2)+'px';$('tutorialArrow').style.top=(r.top+r.height+4)+'px';$('tutorialArrow').textContent='↑';}
}
TUT_STEPS.splice(0,TUT_STEPS.length,'move','gather','bag');
function startJourneyTutorial(){tutorialInputMode=isCoarse()?'touch':'keyboard';tut.active=!tutIsDone();tut.idx=0;tut.walked=0;tut.lastX=player.x;tut.lastY=player.y;renderJourneyHud();}
tutShowStep=function(){if(tutCur()==='move'){tut.walked=0;tut.lastX=player.x;tut.lastY=player.y;}renderJourneyHud();};
tutOpenIntro=function(){toggleModal(false);tut.active=true;tut.idx=0;tutShowStep();};
tutOpenDone=function(){tut.active=false;try{DrifterPlatform.storage.setItem(TUT_KEY,'1');}catch{}renderJourneyHud();};
skipTutorial=function(){tutOpenDone();$('tutOv').classList.remove('show');};
$('tutorialSkip').onclick=()=>skipTutorial();

function refreshVitalHud(){
 if(!stats.maxHp||!stats.maxStam)return;
 const setText=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
 setText('hpValue',Math.ceil(Math.max(0,player.hp))+' / '+stats.maxHp);
 setText('stValue',Math.floor(Math.max(0,player.stam))+' / '+stats.maxStam);
 $('hpF').style.width=clamp(player.hp/stats.maxHp*100,0,100)+'%';
 $('stF').style.width=clamp(player.stam/stats.maxStam*100,0,100)+'%';
 $('stamBar').classList.toggle('low',player.exhausted);
}
let refreshingInterface=false;
function refreshInterface(){
 if(refreshingInterface||state!=='play')return;
 refreshingInterface=true;
 try{
  nearItems=groundEquip.filter(g=>Math.hypot(g.x-player.x,g.y-player.y)<stats.pickup).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
  nearSig=nearItems.map(g=>g.uid).join(',');
  if(replaceState&&!groundEquip.includes(replaceState.g))replaceState=null;
  refreshVitalHud();renderXP();renderSlots();renderStatSum();renderQuickbar();
  if(invOpen)renderPanel();if(actionMenuOpen)renderActionMenu();renderJourneyHud();
 }finally{refreshingInterface=false;}
}
const inputFixSave=saveGame;
saveGame=function(){inputFixSave();refreshInterface();};
function canForgeGear(index){
 const recipe=GEAR_TIERS[index],tier=clamp(forgeTier,0,exp.blueprint);
 return !!recipe&&canAfford(recipe.cost)&&(tier===0||(exp.shards[tier]||0)>=2);
}
craftGear=function(index){
 if(!canForgeGear(index)){sfx('deny');toast(L('재료 또는 해당 지역 조각이 부족합니다.','Not enough materials or matching region shards.'));return;}
 const recipe=GEAR_TIERS[index],tier=clamp(forgeTier,0,exp.blueprint);
 pay(recipe.cost);if(tier>0)exp.shards[tier]-=2;
 const eq=makeEquipFixed(craftBase,Math.random,recipe.minOpts,{x:camp.x,y:camp.y,source:'craft',tier});eq.origin=REGIONS[tier].d;
 addGroundEquip({eq,x:player.x+16,y:player.y+18,ttl:null,uid:++uid,spawnT:gameT});
 if(secOpen)secOpen.ground=true;
 sfx('trade');toast(t('toastCrafted'));saveGame();
};
const inputFixOpenInv=openInv;
openInv=function(tab){inputFixOpenInv(tab);refreshInterface();};

function updateOrientation(){
 const blocked=innerHeight>innerWidth,changed=blocked!==orientationBlocked;
 orientationBlocked=blocked;document.body.classList.toggle('orientation-blocked',blocked);
 if(changed){releaseControls();syncPaused();last=0;}
}
function requestLandscape(){
 try{const orientation=window.screen?.orientation;if(orientation?.lock)Promise.resolve(orientation.lock('landscape')).catch(()=>{});}catch{}
}
addEventListener('resize',updateOrientation);
addEventListener('orientationchange',updateOrientation);
window.screen?.orientation?.addEventListener?.('change',updateOrientation);
const landscapeStartPlay=startPlay;
startPlay=function(){landscapeStartPlay();requestLandscape();updateOrientation();syncPaused();refreshInterface();updateSurvivalHud();};

const survivalBaseCraftHTML=craftHTML;
craftHTML=function(){
 const duskward=player.res.gloom>=3&&player.res.nightCore>=1,nightstep=player.res.gloom>=2&&player.res.nightFang>=2;
 const shadowUnlocked=duskward||nightstep;if(shadowUnlocked&&!shadowGearSeenUnlocked){shadowGearOpen=true;shadowGearSeenUnlocked=true;}
 const card='<details class="craft-fold '+(shadowUnlocked?'unlocked':'locked')+'" id="shadowGearRecipes" '+(shadowGearOpen?'open':'')+'><summary>'+L('어둠 장비','Shadow gear')+'<span class="craft-lock">'+(shadowUnlocked?L('제작 가능','AVAILABLE'):L('재료 필요','LOCKED'))+'</span></summary><div class="expcard">'+
  '<div class="expdesc">'+L('어둠의 자식을 처치해 고유 재료를 모으세요.','Defeat Children of Darkness for their unique drops.')+'</div>'+
  '<button class="acc" data-exp="craftDuskward" '+(duskward?'':'disabled')+'>'+L('황혼 수호 부적 · 잔영 3 + 밤의 핵 1','Duskward Charm · 3 Gloom + 1 Night Core')+'</button>'+
  '<div class="expdesc">'+L('어둠의 자식 피해 30% 감소','30% less damage from Children of Darkness')+'</div>'+
  '<button class="acc" data-exp="craftNightstep" '+(nightstep?'':'disabled')+'>'+L('밤걸음 장화 · 잔영 2 + 어둠 송곳니 2','Nightstep Boots · 2 Gloom + 2 Night Fangs')+'</button>'+
  '<div class="expdesc">'+L('밤에 이동 속도 20% 증가','20% faster movement at night')+'</div></div></details>';
 return survivalBaseCraftHTML()+card;
};
$('panelBody').addEventListener('click',e=>{
 const b=e.target.closest('[data-exp]');if(!b)return;
 const kind=b.dataset.exp;
 if(kind==='stokeFire'){if(window.DrifterMultiplayer?.sharedAction?.('stokeFire',b))return;stokeCampfire();}
 if(kind==='craftDuskward'){if(window.DrifterMultiplayer?.sharedAction?.('craftDuskward',b))return;if(!survivalGear('duskward'))toast(L('재료가 부족합니다.','Not enough materials.'));}
 if(kind==='craftNightstep'){if(window.DrifterMultiplayer?.sharedAction?.('craftNightstep',b))return;if(!survivalGear('nightstep'))toast(L('재료가 부족합니다.','Not enough materials.'));}
});

const releaseUpdate=update;
update=function(dt){
 releaseUpdate(dt);
 if(exp.carrying){
  const i=findIsland(exp.carrying.id);
  if(!i||player.dead||exp.sailing||Math.hypot(player.x-i.tx*TILE,player.y-i.ty*TILE)>Math.max(i.rx,i.ry)*TILE+60){exp.carrying=null;guideWisp=null;saveGame();}
  else{
   if(!guideWisp)guideWisp={x:player.x-12,y:player.y-16};
   const follow=1-Math.exp(-dt*5);guideWisp.x+=(player.x-12-guideWisp.x)*follow;guideWisp.y+=(player.y-18-guideWisp.y)*follow;
   const p=centerOf(i);
   if(Math.hypot(player.x-p.x,player.y-p.y)<28){
    const index=exp.carrying.rune,n=activeNodes().find(n=>n.islandId===i.id&&n.rune===index);
    if(n){lightRune(n);exp.carrying=null;guideWisp=null;saveGame();}
   }
  }
 }
 journeyClock+=dt;if(journeyClock>.2){journeyClock=0;renderJourneyHud();updateSurvivalHud();}
};

const releaseDrawNode=drawNode;
drawNode=function(n){
 releaseDrawNode(n);if(!n.islandId||n.rune<0)return;
 const done=exp.claimed.includes(n.islandId),next=[0,1,2].find(v=>!(exp.runes[n.islandId]||[]).includes(v));
 ctx.font='bold 8px sans-serif';ctx.textAlign='center';
 ctx.fillStyle=n.looted?'#c9e9bb':n.island.variant===0&&n.rune===next?'#f2d899':'#adc1b4';
 const label=n.island.variant===0?String(n.rune+1):n.island.variant===1?['→','↓','←','↑'][n.looted?mirrorTarget(n):mirrorDirection(n)]:'✧';
 ctx.fillText(label,n.x,n.y-27);
 if(n.island.variant===1){
  const d=n.looted?mirrorTarget(n):mirrorDirection(n),c=centerOf(n.island),aligned=n.looted;
  ctx.strokeStyle=aligned?'#f1db9a99':'#a4dad555';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(n.x,n.y-14);
  ctx.lineTo(aligned?c.x:n.x+Math.cos(d*Math.PI/2)*32,aligned?c.y-16:n.y-14+Math.sin(d*Math.PI/2)*32);ctx.stroke();
 }
 if(!done&&(n.looted||(n.island.variant===0&&n.rune===next))){ctx.strokeStyle='#b9e5c54d';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(n.x,n.y+3,10+Math.sin(gameT*2),4,0,0,Math.PI*2);ctx.stroke();}
};
const releaseTile=tilePaint;
tilePaint=function(c,lx,ly,wx,wy,b){
 releaseTile(c,lx,ly,wx,wy,b);if(b===B_WATER||b===B_SHALLOW||b===B_SAND)return;
 const i=islandAt((wx+.5)*TILE,(wy+.5)*TILE);if(!i)return;
 if(!exp.claimed.includes(i.id)){c.fillStyle='#223b4e25';c.fillRect(lx*TILE,ly*TILE,TILE,TILE);return;}
 const r=hash2(wx,wy,seed+1300);
 if(r<.20){const x=lx*TILE+Math.floor(r*50)+2,y=ly*TILE+9;c.fillStyle='#719a67';c.fillRect(x,y,1,4);c.fillStyle=['#eee1b2','#cfeadd','#cfc1ec'][i.variant];c.fillRect(x-1,y-2,3,3);}
};
// Half-resolution light mask; erase light pools from darkness, never from the world canvas.
const NIGHT_VISION={radius:96,clear:40,opacity:.97,fade:12};
const nightMask=document.createElement('canvas'),nightMaskCtx=nightMask.getContext('2d');
function nightVisionStrength(time=survivalNow()){
 const phase=survivalPhase(time);if(!phase.night)return 0;
 return Math.min(1,(phase.phase-SURVIVAL_DAY)/NIGHT_VISION.fade,(SURVIVAL_CYCLE-phase.phase)/NIGHT_VISION.fade);
}
function drawNightVisibility(){
 const strength=nightVisionStrength();if(strength<=0||!nightMaskCtx)return;
 const scale=.5,w=Math.ceil(innerWidth*scale),h=Math.ceil(innerHeight*scale);
 if(nightMask.width!==w||nightMask.height!==h){nightMask.width=w;nightMask.height=h;}
 const mask=nightMaskCtx;mask.setTransform(1,0,0,1,0,0);mask.globalCompositeOperation='source-over';mask.clearRect(0,0,w,h);
 mask.fillStyle='rgba(3,6,16,'+(NIGHT_VISION.opacity*strength)+')';mask.fillRect(0,0,w,h);
 mask.globalCompositeOperation='destination-out';
 function light(x,y,clear,radius){
  const sx=(innerWidth/2+(x-cam.x)*SCALE)*scale,sy=(innerHeight/2+(y-cam.y)*SCALE)*scale,r=radius*SCALE*scale;
  if(sx+r<0||sy+r<0||sx-r>w||sy-r>h)return;
  const gradient=mask.createRadialGradient(sx,sy,Math.max(1,clear*SCALE*scale),sx,sy,r);
  gradient.addColorStop(0,'rgba(0,0,0,1)');gradient.addColorStop(.55,'rgba(0,0,0,.78)');gradient.addColorStop(1,'rgba(0,0,0,0)');
  mask.fillStyle=gradient;mask.beginPath();mask.arc(sx,sy,r,0,Math.PI*2);mask.fill();
 }
 light(player.x,player.y-6,NIGHT_VISION.clear,NIGHT_VISION.radius);
 const fire=campfireRadius();light(256,256,fire*.7,fire);
 if(guideWisp)light(guideWisp.x,guideWisp.y,8,34);
 mask.globalCompositeOperation='source-over';
 ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.drawImage(nightMask,0,0,innerWidth,innerHeight);ctx.restore();
}
const releaseRender=render;
render=function(){
 releaseRender();if(state!=='play')return;
 ctx.save();ctx.setTransform(SCALE*dpr,0,0,SCALE*dpr,cv.width/2-cam.x*SCALE*dpr,cv.height/2-cam.y*SCALE*dpr);
 const radius=campfireRadius();ctx.fillStyle='rgba(232,147,60,.035)';ctx.beginPath();ctx.arc(256,256,radius,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=survivalPhase().night?'rgba(255,177,99,.72)':'rgba(226,164,89,.38)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(256,256,radius,0,Math.PI*2);ctx.stroke();
 if(guideWisp){ctx.fillStyle='#efe8b4';ctx.fillRect(guideWisp.x-2,guideWisp.y-2+Math.sin(gameT*4)*2,4,4);ctx.strokeStyle='#ede1b655';ctx.beginPath();ctx.arc(guideWisp.x,guideWisp.y,7,0,Math.PI*2);ctx.stroke();}
 if(tut.active&&journeyTarget&&!paused){
  const p=journeyTarget,dx=p.x-cam.x,dy=p.y-cam.y;
  const rx=Math.max(25,innerWidth/SCALE/2-85),ry=Math.max(25,innerHeight/SCALE/2-65);
  const scale=Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry,1),x=cam.x+dx/scale,y=cam.y+dy/scale;
  ctx.strokeStyle='#e3ce94';ctx.fillStyle='#e3ce94';ctx.lineWidth=1.5;
  if(scale===1){ctx.beginPath();ctx.moveTo(x-4,y-32);ctx.lineTo(x,y-28);ctx.lineTo(x+4,y-32);ctx.stroke();}
  else{const a=Math.atan2(dy,dx);ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-3,-4);ctx.lineTo(-3,4);ctx.closePath();ctx.fill();}
 }
 ctx.restore();
 if(survivalPhase().night){
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='rgba(7,12,28,.16)';ctx.fillRect(0,0,innerWidth,innerHeight);ctx.restore();
  ctx.save();ctx.setTransform(SCALE*dpr,0,0,SCALE*dpr,cv.width/2-cam.x*SCALE*dpr,cv.height/2-cam.y*SCALE*dpr);
  if(ctx.createRadialGradient){const glow=ctx.createRadialGradient(256,256,Math.max(1,radius*.2),256,256,radius);glow.addColorStop(0,'rgba(255,174,92,0)');glow.addColorStop(1,'rgba(255,151,71,.14)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(256,256,radius,0,Math.PI*2);ctx.fill()}
  ctx.strokeStyle='rgba(255,187,111,.82)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(256,256,radius,0,Math.PI*2);ctx.stroke();ctx.restore();
 }
};

const releaseBag=bagHTML;
bagHTML=function(){
 const seeds=exp.seeds.map(s=>'<span class="garden-seed">'+SEED_NAMES[LANG][s]+' · '+(exp.planted.includes(s)?L('피어남','Planted'):L('씨앗 보유','Seed collected'))+'</span>').join('');
 return bagFoldStart('survival',L('야간 생존','Night survival'))+'<div class="expcard"><h4>'+L('생존','Survival')+'</h4><div class="expdesc">'+L((survivalPhase().night?'밤 ':'낮 ')+Math.floor(survivalPhase().secondsLeft/60)+':'+String(survivalPhase().secondsLeft%60).padStart(2,'0')+' · 불빛 반경 '+Math.round(campfireRadius()),(survivalPhase().night?'Night ':'Day ')+Math.floor(survivalPhase().secondsLeft/60)+':'+String(survivalPhase().secondsLeft%60).padStart(2,'0')+' · Firelight '+Math.round(campfireRadius()))+'</div>'+(atCamp()?'<button data-exp="stokeFire" '+(player.res.wood>=FIRE_COST&&campfireRadius()<FIRE_MAX?'':'disabled')+'>'+L('장작불 키우기 · 나무 4','Feed fire · 4 wood')+'</button>':'')+'</div></details>'+
  '<div class="expcard"><h4>'+L('모닥불 정원','Camp garden')+' · '+exp.planted.length+'/3</h4><div class="expdesc">'+L('서로 다른 섬의 씨앗을 가져와 모닥불 곁에서 행동으로 심으세요.','Bring seeds from each island type and use Interact beside the campfire to plant them.')+'</div><div class="garden-list">'+seeds+'</div></div>'+releaseBag();
};

// Menu transitions release every held input and freeze combat, including inventory.
const releaseOpenInv=openInv,releaseCloseInv=closeInv,releaseStartDialog=startDialog,releaseEndDialog=endDialog;
openInv=function(tab){releaseControls();releaseOpenInv(tab);syncPaused();};
closeInv=function(){releaseCloseInv();releaseControls();syncPaused();};
startDialog=function(npc){releaseControls();releaseStartDialog(npc);syncPaused();};
endDialog=function(){releaseControls();releaseEndDialog();syncPaused();};
// A semantic button supplies one click for mouse, touch, Enter and Space.
// Keep a single activation path so a touch release cannot skip two lines.
$('dlgNext').addEventListener('click',e=>{e.preventDefault();dlgAdvance();});
// A conversation keeps the world clock and ambient life moving. Menus and
// orientation still pause the simulation; update() independently blocks
// player actions and hostile movement while dlg is active.
syncPaused=function(){paused=!!(modalOpen||mapOpen||pauseOpen||invOpen||actionMenuOpen||orientationBlocked);if(paused)releaseControls();};
// Ignore gameplay controls during conversation so held input cannot resume
// movement or attacks when the dialogue closes. E remains available to advance.
addEventListener('keydown',e=>{
 if(!dlg)return;
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyJ','ShiftLeft','ShiftRight','KeyZ','KeyQ','KeyX','KeyG'].includes(e.code)){
  e.preventDefault();e.stopImmediatePropagation();
 }
},true);
pad.addEventListener('pointerdown',e=>{if(dlg){e.preventDefault();e.stopImmediatePropagation();}},true);
function stopForBackground(){backgroundSuspended=true;releaseControls();saveGame();if(actx&&actx.state==='running')actx.suspend().catch(()=>{});}
function resumeFromBackground(){backgroundSuspended=distributionAdPaused||document.hidden;last=0;releaseControls();if(!backgroundSuspended&&actx)ensureAudio();}
addEventListener('blur',stopForBackground);addEventListener('focus',resumeFromBackground);
document.addEventListener('visibilitychange',()=>{document.hidden?stopForBackground():resumeFromBackground();});
addEventListener('drifter-platform-ad-pause',()=>{distributionAdPaused=true;stopForBackground();});
addEventListener('drifter-platform-ad-resume',()=>{distributionAdPaused=false;resumeFromBackground();});
addEventListener('drifter-platform-audio',()=>{if(DrifterPlatform.muted&&actx?.state==='running')actx.suspend().catch(()=>{});else if(!document.hidden&&!backgroundSuspended&&actx)ensureAudio();});
addEventListener('pointerdown',()=>{if(!document.hidden&&!distributionAdPaused){backgroundSuspended=false;ensureAudio();}},{passive:true});
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&state==='play'&&!['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))e.preventDefault();});

function updateSaveWarning(failed=false){
 const issue=DrifterPlatform.storageIssue;
 const text=issue==='cloud'?L('기기에는 저장됐지만 클라우드 저장을 완료하지 못했습니다. 설정에서 백업을 내보내세요.','Saved on this device. Cloud save is unavailable; export a backup in Settings.'):L('저장 공간을 사용할 수 없습니다. 설정에서 진행 기록을 내보내세요.','Storage is unavailable. Export your progress in Settings.');
 $('saveWarning').textContent=text;$('saveWarning').style.display=failed||issue?'block':'none';
}
function validSave(d){
 if(!d||typeof d!=='object'||!Number.isFinite(d.seed)||!Number.isFinite(d.px)||!Number.isFinite(d.py)||!Number.isFinite(d.hp)||!Number.isInteger(d.lvl)||d.lvl<1||d.lvl>200||!Number.isFinite(d.xp))return false;
 let count=0;function safe(v,depth=0){
  if(++count>200000||depth>22)return false;
  if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=1e14;
  if(typeof v==='string')return v.length<=1000&&!/[<>&]/.test(v);
  if(v===null||typeof v==='boolean')return true;
  if(typeof v!=='object')return false;
  return Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&safe(x,depth+1));
 }
 const equip=e=>!e||(BASES[e.base]&&Array.isArray(e.opts)&&e.opts.length<=3&&e.opts.every(o=>STAT_META[o.k]&&Number.isFinite(o.v)));
 const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!safe(d)||!Array.isArray(d.equip)||d.equip.length!==3||!d.equip.every(equip))return false;
 for(const name of ['res','pots','fish'])if(d[name]&&(Array.isArray(d[name])||typeof d[name]!=='object'||!Object.values(d[name]).every(v=>Number.isFinite(v)&&v>=0)))return false;
 for(const name of ['groundEquip','groundRes','landmarks','quests','explored','caveLooted','ruinDone','seenBiomes','gifted'])if(d[name]&&!Array.isArray(d[name]))return false;
 if(d.groundEquip?.some(g=>!g.eq||!equip(g.eq)||!Number.isFinite(g.x)||!Number.isFinite(g.y)))return false;
 if(d.exp){
  if(!record(d.exp))return false;
  for(const name of ['claimed','found','seeds','shards','stash','planted'])if(name in d.exp&&!Array.isArray(d.exp[name]))return false;
  for(const name of ['seeds','planted'])if(d.exp[name]?.some(v=>!Number.isInteger(v)||v<0||v>2))return false;
  if(d.exp.stash&&(d.exp.stash.length>12||d.exp.stash.some(e=>!e||!equip(e))))return false;
  for(const name of ['runes','mirrors','shops','enemyDead'])if(name in d.exp&&!record(d.exp[name]))return false;
  if(d.exp.runes&&Object.values(d.exp.runes).some(v=>!Array.isArray(v)||v.length>3||new Set(v).size!==v.length||v.some(n=>!Number.isInteger(n)||n<0||n>2)))return false;
  if(d.exp.mirrors&&Object.values(d.exp.mirrors).some(v=>!Array.isArray(v)||v.length>3||v.some(n=>!Number.isInteger(n)||n<0||n>3)))return false;
  if(d.exp.shops&&Object.values(d.exp.shops).some(v=>!Array.isArray(v)||v.length>10))return false;
  if(d.exp.enemyDead&&Object.values(d.exp.enemyDead).some(v=>typeof v!=='boolean'))return false;
  if(d.exp.shards&&(d.exp.shards.length!==5||d.exp.shards.some(v=>!Number.isInteger(v)||v<0)))return false;
  for(const name of ['shore','lastRuin'])if(d.exp[name]!=null&&(!record(d.exp[name])||!Number.isFinite(d.exp[name].x)||!Number.isFinite(d.exp[name].y)))return false;
  if(d.exp.carrying!=null&&(!record(d.exp.carrying)||typeof d.exp.carrying.id!=='string'||!Number.isInteger(d.exp.carrying.rune)||d.exp.carrying.rune<0||d.exp.carrying.rune>2))return false;
 }
 return true;
}
const releaseLoad=loadSave;
loadSave=function(){
 let prior;try{prior=JSON.parse(DrifterPlatform.storage.getItem(SAVE_KEY));}catch{return false;}
 if(!validSave(prior)||!releaseLoad())return false;
 // Existing gardens remain planted when upgrading a v1-v3 save.
 if(prior.exp&&!Array.isArray(prior.exp.planted))exp.planted=[...exp.seeds];
 if(!prior.exp||!Number.isFinite(prior.exp.fireRadius)){exp.fireRadius=FIRE_START;exp.fireUpdatedAt=gameT}
 else if(!Number.isFinite(prior.exp.fireUpdatedAt))exp.fireUpdatedAt=gameT;
 exp.planted=[...new Set(exp.planted)].filter(s=>exp.seeds.includes(s));
 exp.mirrors=exp.mirrors||{};guideWisp=null;return true;
};
$('exportSave').onclick=()=>{
 saveGame();const raw=DrifterPlatform.storage.backup(SAVE_KEY)||DrifterPlatform.storage.getItem(SAVE_KEY);
 if(!raw){toast(L('먼저 여정을 시작하세요.','Start a journey first.'));return;}
 const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='drifter-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('importInput').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  if(f.size>4*1024*1024)throw Error('size');const raw=await f.text(),d=JSON.parse(raw);if(!validSave(d))throw Error('schema');
  if(!confirm(L('현재 진행을 가져온 저장으로 교체할까요?','Replace current progress with this save?')))return;
  DrifterPlatform.storage.setItem(SAVE_KEY,raw);state='title';releaseControls();location.reload();
 }catch{toast(L('저장을 가져오지 못했습니다. 파일과 저장 공간을 확인하세요.','Unable to import. Check the save file and available storage.'));}finally{e.target.value='';}
};
$('btnWipe').onclick=()=>{
 if(!wipeArmed){wipeArmed=true;$('btnWipe').textContent=t('wipeConfirm');setTimeout(()=>{wipeArmed=false;$('btnWipe').textContent=t('wipe');},3500);return;}
 try{DrifterPlatform.storage.removeItem(SAVE_KEY);DrifterPlatform.storage.removeItem(TUT_KEY);state='title';releaseControls();location.reload();}catch{updateSaveWarning(true);}
};
const releaseApplyLang=applyLang;
applyLang=function(){
 releaseApplyLang();document.title='DRIFTER · Echo Isles';
 $('subtitle').textContent=L('걷고, 낚시하고, 수집하며 나만의 길을 찾아보세요.','Wander, fish, collect, and find your own path.');
 $('btnNew').textContent=L('새 여정','New journey');$('btnCont').textContent=L('이어서 탐험','Continue journey');
 $('titleFoot').textContent=L('자유 탐험 · 수집 · 자동 저장','Free exploration · Collect · Autosave')+' · v'+RELEASE_VERSION;
 $('expHelp').innerHTML='<h4>'+L('섬의 빛','Island light')+'</h4><div class="expdesc">'+L('메아리섬: 1→2→3 순서로 룬을 켭니다. 빛의 섬: 거울을 돌려 중앙 제단으로 빛을 보냅니다. 숲의 섬: 별빛을 하나씩 불러 중앙 제단으로 안내합니다. 세 빛을 모아 제단을 깨우면 씨앗을 얻습니다. 행동으로 모닥불에 귀환하고 씨앗을 심으세요.','Echo island: light runes 1→2→3. Prism island: turn each beam toward the altar. Wisp grove: call each wisp and walk it to the altar. Gather three lights and awaken the altar for a seed. Use Interact to return to camp and plant it.')+'</div>';
 updateSaveWarning();updateOrientation();renderJourneyHud();updateSurvivalHud();
};

// 1.5 — clear collection, a first camp project, readable choices and living gardens.
const LAMP_COST={wood:4,stone:2};
const TRAIL_RECIPES=[
 {key:'ore',base:'pickaxe',effect:'vein',cost:{wood:6,stone:5},opts:[{k:'range',v:4}],ko:'광맥 길잡이 곡괭이',en:'Orefinder Pickaxe'},
 {key:'mist',base:'boots',effect:'wader',cost:{wood:6,berry:3},opts:[{k:'stam',v:8}],ko:'물안개 탐험 장화',en:'Mistwalker Boots'},
 {key:'ruin',base:'amulet',effect:'guide',cost:{wood:4,stone:3,berry:2},opts:[{k:'luck',v:3}],ko:'유적 길잡이 부적',en:'Wayfinder Charm'}
];
const MATERIAL_SOURCES={
 wood:['나무','trees'],stone:['바위','rocks'],iron:['철 광맥','iron veins'],crystal:['수정·동굴','crystals / caves'],
 berry:['열매 덤불','berry bushes'],jelly:['슬라임','slimes'],fang:['늑대·거미','wolves / spiders'],core:['골렘','golems'],
 gloom:['밤의 어둠 몬스터','night creatures'],nightFang:['어둠 송곳니 몬스터','Gloomfangs'],nightCore:['거대한 어둠 몬스터','Ashbrutes']
};
let advancedGearOpen=false,advancedGearSeenUnlocked=false,regionCraftOpen=false,regionCraftSeenUnlocked=false,shadowGearOpen=false,shadowGearSeenUnlocked=false,earlyCraftOpen=false,earlyCraftSeenLamp=false,campUiClock=0,collectionUntil=0;
const collectionCounts=new Map();
const bagRevealSeen={garden:false,log:false,survival:false};
function defaultCampProject(){return{lamp:false,hidden:false,gardenAge:[0,0,0],nightIndex:-1,lastDawn:-1,watch:0,nightMarks:0};}
function campProgress(){
 if(!exp.campProject){exp.campProject=defaultCampProject();for(const s of exp.planted||[])exp.campProject.gardenAge[s]=90;}
 return exp.campProject;
}
const campObjectiveFindTarget=findTarget;
findTarget=function(){
 const ordinary=campObjectiveFindTarget();
 if(ordinary?.isEnemy||state!=='play')return ordinary;
 const project=campProgress();if(project.lamp||project.hidden)return ordinary;
 const required=[];
 if(player.res.wood<4)required.push('tree');
 if(player.res.stone<2)required.push('rock');
 if(!required.length)return ordinary;
 let best=null,bestDistance=Infinity;
 for(const n of nodeCache){
  if(n.dead||n.islandId||!required.includes(n.type))continue;
  const info=NODE_INFO[n.type];if(!info)continue;
  const dx=n.x-player.x,dy=(n.y+info.hitY)-(player.y-6);
  const d=Math.hypot(dx,dy)-info.hitR;
  if(d<stats.atkRange&&d<bestDistance){best=n;bestDistance=d}
 }
 return best||ordinary;
};
const campNewExpedition=newExpedition;
newExpedition=function(){return{...campNewExpedition(),campProject:defaultCampProject()};};
const campValidSave=validSave;
validSave=function(data){
 if(!campValidSave(data))return false;
 const p=data.exp?.campProject;if(p===undefined)return true;
 if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.lamp!=='boolean'||typeof p.hidden!=='boolean')return false;
 if(!Array.isArray(p.gardenAge)||p.gardenAge.length!==3||p.gardenAge.some(v=>!Number.isFinite(v)||v<0||v>90))return false;
 return ['nightIndex','lastDawn','nightMarks'].every(k=>Number.isInteger(p[k])&&p[k]>= (k==='nightMarks'?0:-1)&&p[k]<=100000000)&&Number.isFinite(p.watch)&&p.watch>=0&&p.watch<=300;
};
const campLoadSave=loadSave;
loadSave=function(){let prior;try{prior=JSON.parse(DrifterPlatform.storage.getItem(SAVE_KEY));}catch{}const ok=campLoadSave();if(ok){const p=campProgress();if(!prior?.exp?.campProject)for(const s of exp.planted)p.gardenAge[s]=90;collectionCounts.clear();collectionUntil=0;}return ok;};
const campFreshStart=freshStart;
freshStart=function(){earlyCraftOpen=false;earlyCraftSeenLamp=false;for(const key in bagFoldState)bagFoldState[key]=false;for(const key in bagRevealSeen)bagRevealSeen[key]=false;secOpen=null;advancedGearOpen=false;advancedGearSeenUnlocked=false;regionCraftOpen=false;regionCraftSeenUnlocked=false;shadowGearOpen=false;shadowGearSeenUnlocked=false;collectionCounts.clear();collectionUntil=0;return campFreshStart();};

function noteCollected(key,count=1){
 if(!RES_META[key])return;
 const firstGather=!exp.firstGatherDone;exp.firstGatherDone=true;if(firstGather)saveGame();
 if(gameT>collectionUntil)collectionCounts.clear();
 collectionCounts.set(key,(collectionCounts.get(key)||0)+count);collectionUntil=gameT+3;
 if(tut.active&&tutCur()==='gather'){tut.gathered=true;tutStepDone('gather');}
 renderCampFeedback();
}
function renderCampFeedback(){
 const receipt=$('resourceReceipt');receipt.hidden=state!=='play'||gameT>collectionUntil||!collectionCounts.size;
 const message=L('획득: ','Collected: ')+[...collectionCounts].map(([k,n])=>RES_META[k][LANG]+' +'+n).join(' · ');if(receipt.textContent!==message)receipt.textContent=message;
 const p=campProgress(),card=$('campProject');
 card.hidden=state!=='play'||tut.active||p.lamp||p.hidden;
 const home=atCamp(),distance=Math.round(distanceM(player.x,player.y)),compass=$('campCompass');
 $('campProjectText').textContent=L('첫 불빛 · 나무 ','First light · Wood ')+Math.min(player.res.wood,4)+'/4 · '+L('돌 ','Stone ')+Math.min(player.res.stone,2)+'/2'+(home?'':' · '+L('캠프 ','Camp ')+distance+'m');
 compass.hidden=home;compass.style.transform='rotate('+Math.atan2(camp.y-player.y,camp.x-player.x)+'rad)';
 $('campProjectOpen').textContent=canAfford(LAMP_COST)?(home?L('등불 만들기','Make lantern'):L('캠프로 돌아가기','Return to camp')):L('제작 보기','View craft');
 $('campProjectLater').textContent=L('나중에','Later');
}
$('campProjectOpen').addEventListener('click',()=>{
 if(canAfford(LAMP_COST)&&!atCamp()){openMap();return}
 openInv('craft');
});
$('campProjectLater').addEventListener('click',()=>{campProgress().hidden=true;renderCampFeedback();saveGame();});

function materialCostHTML(cost){
 const missing=Object.entries(cost).filter(([k,n])=>(player.res[k]||0)<n);
 return '<div class="recipe-cost">'+Object.entries(cost).map(([k,n])=>'<span class="cost-chip '+((player.res[k]||0)>=n?'enough':'short')+'">'+RES_META[k][LANG]+' <b>'+Math.min(player.res[k]||0,n)+' / '+n+'</b></span>').join('')+'</div>'+
  (missing.length?'<div class="material-hint">'+L('찾을 곳: ','Find: ')+missing.map(([k])=>RES_META[k][LANG]+' → '+(MATERIAL_SOURCES[k]?.[LANG==='ko'?0:1]||RES_META[k][LANG])).join(' · ')+'</div>':'');
}
costHTML=materialCostHTML;
function lampCardHTML(){
 const p=campProgress();
 return '<section class="camp-project-card expcard"><div class="camp-eyebrow">'+L('나의 캠프 · 첫 제작','MY CAMP · FIRST CRAFT')+'</div><h4>'+L(p.lamp?'첫 불빛이 켜졌습니다':'작은 캠프 등불',p.lamp?'Your first light is lit':'A small camp lantern')+'</h4><p class="expdesc">'+L(p.lamp?'탐험 도구 3종을 만들 수 있습니다. 돌아올 때마다 이 불빛이 반겨 줍니다.':'나무 4개와 돌 2개로 등불을 세우세요. 탐험 도구 3종이 열리고 캠프에 불빛이 남습니다.',p.lamp?'Three trail recipes are unlocked. Your lantern will welcome you home.':'Use 4 wood and 2 stone to build a lasting light and unlock three trail recipes.')+'</p>'+
  (p.lamp?'<span class="project-complete">'+L('완성 · 영구 보관','Complete · permanent')+'</span>':materialCostHTML(LAMP_COST)+'<button class="acc" data-camp="lamp" '+(!atCamp()||!canAfford(LAMP_COST)?'disabled':'')+'>'+L('등불 세우기','Build lantern')+'</button>'+(!atCamp()?'<p class="material-hint">'+L('시작 모닥불 근처에서 만들 수 있습니다.','Build beside the starting campfire.')+'</p>':''))+'</section>';
}
function buildCampLantern(){
 const p=campProgress();if(state!=='play'||player.dead||p.lamp||!atCamp()||!canAfford(LAMP_COST))return false;
 pay(LAMP_COST);p.lamp=true;p.hidden=true;releaseControls();
 burst(camp.x+31,camp.y-22,['#f1cd85','#e1e8bd','#a8d3b5'],28);ringFx(camp.x+31,camp.y-12,'#f4d898');
 sfx('level');toast(L('첫 불빛 완성! 탐험 도구 3종이 열렸습니다.','First light complete! Three trail recipes unlocked.'));
 DrifterPlatform.celebrate();renderRes(true);renderCampFeedback();saveGame();return true;
}
function trailCraftHTML(){
 return '<section class="trail-recipes"><h4>'+L('탐험 방식을 고르세요','Choose how to explore')+'</h4><p class="expdesc">'+L('능력과 고유 효과가 정해진 제작입니다. 빈 장비 칸이 있으면 바로 착용합니다.','These recipes guarantee their listed effect. An empty gear slot equips the result immediately.')+'</p>'+TRAIL_RECIPES.map(r=>{
  const preview={base:r.base,opts:r.opts,effect:r.effect,tier:0,power:1,origin:0};
  return '<div class="trail-recipe"><div class="pname">'+r[LANG]+'</div><div class="pstats">'+statLinesHTML(preview)+'</div>'+materialCostHTML(r.cost)+'<button class="acc" data-camp="gear" data-recipe="'+r.key+'" '+(!atCamp()||!canAfford(r.cost)?'disabled':'')+'>'+L('제작','Craft')+'</button></div>';
 }).join('')+(!atCamp()?'<p class="material-hint">'+L('탐험 도구는 시작 모닥불 근처에서 제작하세요.','Craft trail gear beside the starting campfire.')+'</p>':'')+'</section>';
}
function craftTrailGear(key){
 const r=TRAIL_RECIPES.find(r=>r.key===key);if(!r||!campProgress().lamp||!atCamp()||!canAfford(r.cost)||player.dead||state!=='play')return false;
 pay(r.cost);const eq=makeEquipFixed(r.base,Math.random,1,{x:camp.x,y:camp.y,tier:0,source:'trailcraft'});eq.opts=r.opts.map(o=>({...o}));eq.effect=r.effect;
 const slot=player.equip.indexOf(null);
 if(slot>=0){player.equip[slot]=eq;recalcStats();renderSlots();toast(r[LANG]+L(' 제작 · 바로 착용했습니다.',' crafted · equipped.'));}
 else{addGroundEquip({eq,x:player.x+12,y:player.y+8,ttl:null,uid:++uid,spawnT:gameT});secOpen.ground=true;invTab='bag';toast(L('제작 완료 · 배낭에서 장비를 비교하세요.','Crafted · compare it in your bag.'));}
 sfx('trade');renderRes(true);saveGame();return true;
}
const campCraftHTML=craftHTML;
craftHTML=function(){
 const lit=campProgress().lamp;
 if(lit&&!earlyCraftSeenLamp){earlyCraftOpen=true;earlyCraftSeenLamp=true;}
 return lampCardHTML()+(lit?trailCraftHTML():'')+'<details class="craft-fold" id="earlyCraftRecipes" '+(earlyCraftOpen?'open':'')+'><summary>'+L('기타 제작법','Other recipes')+'</summary>'+(!lit?'<p class="expdesc">'+L('첫 불빛을 밝히면 탐험 도구가 해금됩니다. 다른 제작법은 미리 확인할 수 있습니다.','Light the lantern to unlock trail gear. You can preview other recipes now.')+'</p>':'')+campCraftHTML()+'</details>';
};
$('panelBody').addEventListener('toggle',e=>{const id=e.target?.id;if(e.target?.dataset?.bagFold)bagFoldState[e.target.dataset.bagFold]=!!e.target.open;if(id==='bagQuests')bagFoldState.quests=!!e.target.open;if(id==='earlyCraftRecipes')earlyCraftOpen=!!e.target.open;if(id==='advancedGearRecipes')advancedGearOpen=!!e.target.open;if(id==='regionCraftRecipes')regionCraftOpen=!!e.target.open;if(id==='shadowGearRecipes')shadowGearOpen=!!e.target.open;},true);
$('panelBody').addEventListener('click',e=>{const b=e.target.closest('[data-camp]');if(!b||b.disabled)return;if(b.dataset.camp==='lamp')buildCampLantern();if(b.dataset.camp==='gear')craftTrailGear(b.dataset.recipe);});
const campAvailableActions=availableActions;
availableActions=function(){const out=campAvailableActions();if(state==='play'&&!player.dead&&!exp.sailing&&atCamp()&&!campProgress().lamp)out.unshift(actionEntry('camp:lantern',L('작은 등불 세우기','Build camp lantern'),L('나무 4 · 돌 2 · 탐험 도구 제작 해금','4 wood · 2 stone · unlock trail recipes'),buildCampLantern,{disabled:!canAfford(LAMP_COST)}));return out;};

const NIGHT_EFFECT_INFO={duskward:{ko:'황혼 수호',en:'Duskward',dko:'어둠의 자식에게 받는 피해 30% 감소',den:'30% less damage from Children of Darkness'},nightstep:{ko:'밤걸음',en:'Nightstep',dko:'밤에 이동 속도 20% 증가',den:'20% faster movement at night'}};
function effectName(key){const info=EFFECTS[key]||NIGHT_EFFECT_INFO[key];return info?info[LANG]:L('없음','None');}
const campStatLinesHTML=statLinesHTML;
statLinesHTML=function(eq){let h=campStatLinesHTML(eq);const info=NIGHT_EFFECT_INFO[eq.effect];if(info)h+='<br><span class="gain">✧ '+info[LANG]+'</span><br><span class="expdesc">'+info[LANG==='ko'?'dko':'den']+'</span>';return h;};
function signedStat(k,n){const unit=k==='spd'?'%':k==='regen'?'/s':'';return (n>0?'+':'')+(Number.isInteger(n)?n:n.toFixed(1))+unit;}
compareHTML=function(a,b){
 const aa=itemTotals(a),bb=b?itemTotals(b):{},parts=[];
 for(const k of Object.keys(STAT_META)){const d=(aa[k]||0)-(bb[k]||0);if(d)parts.push('<span class="stat-delta '+(d>0?'gain':'loss')+'">'+statName(k)+' '+signedStat(k,d)+'</span>');}
 const changed=a.effect!==b?.effect;
 return '<div class="gear-comparison">'+(parts.length?parts.join(' '):L('기본 능력 변화 없음','No stat change'))+(changed?'<div class="effect-delta">'+(b?.effect?'<span class="loss">'+L('잃음: ','Lose: ')+effectName(b.effect)+'</span>':'')+(a.effect?'<span class="gain">'+L('얻음: ','Gain: ')+effectName(a.effect)+'</span>':'')+'</div>':'')+'</div>';
};
function gearPreviewHTML(eq){
 const match=player.equip.findIndex(e=>e?.base===eq.base),empty=player.equip.indexOf(null),slot=match>=0?match:empty>=0?empty:0;
 return '<div class="gear-preview"><b>'+L('착용 전 비교 · 칸 ','Compare before equipping · slot ')+(slot+1)+'</b>'+compareHTML(eq,player.equip[slot])+'<details><summary>'+L('다른 장비 칸과 비교','Compare other slots')+'</summary>'+player.equip.map((old,i)=>'<div class="slot-comparison"><b>'+L('칸 ','Slot ')+(i+1)+' · '+(old?equipName(old):L('빈 칸','Empty'))+'</b>'+compareHTML(eq,old)+'</div>').join('')+'</details></div>';
}

function gardenCardHTML(){
 const p=campProgress(),n=exp.planted.length,stage=age=>age>=90?2:age>=30?1:0;
 return '<section class="expcard garden-card"><h4>'+L('살아나는 캠프 정원','Your growing camp garden')+' · '+n+'/3</h4><p class="expdesc">'+L('섬의 씨앗을 심으면 새싹 → 성장 → 개화합니다. 탐험하는 동안에도 자랍니다.','Island seeds become sprouts, stems, then blooms. They grow while you explore.')+'</p><div class="garden-stages">'+[0,1,2].map(s=>{
  const planted=exp.planted.includes(s),age=p.gardenAge[s],level=stage(age),label=planted?[L('새싹','Sprout'),L('성장 중','Growing'),L('활짝 핌','In bloom')][level]:exp.seeds.includes(s)?L('심을 수 있음','Ready to plant'):L('씨앗 미발견','Seed undiscovered');
  return '<div class="garden-stage '+(planted?'planted':'')+'"><b>'+SEED_NAMES[LANG][s]+'</b><span>'+label+'</span><div class="garden-track"><i style="width:'+(planted?Math.max(8,age/90*100):0)+'%"></i></div></div>';
 }).join('')+'</div><p class="expdesc">'+L('새벽 기록 ','Dawns witnessed ')+p.nightMarks+' · '+L('밤에 1분 이상 살아남고 맞이한 새벽마다 반딧불이 남습니다.','Survive at least one minute of night; each dawn leaves a firefly at camp.')+'</p></section>';
}
const campBagHTML=bagHTML;
bagHTML=function(){for(const [key,ready] of Object.entries({garden:exp.seeds.length>0||exp.planted.length>0,log:exp.found.length>0,survival:survivalPhase().night})){if(ready&&!bagRevealSeen[key]){bagRevealSeen[key]=true;bagFoldState[key]=true;}}const old=campBagHTML();const start=old.indexOf('<div class="expcard"><h4>'+L('모닥불 정원','Camp garden'));const end=start<0?-1:old.indexOf('</div></div>',start);const clean=end<0?old:old.slice(0,start)+old.slice(end+12);return (!campProgress().lamp?lampCardHTML():'')+uiResources()+bagFoldStart('garden',L('캠프 정원','Camp garden'))+gardenCardHTML()+'</details>'+clean;};
const campPlantSeed=plantSeed;
plantSeed=function(s){const before=exp.planted.includes(s);const result=campPlantSeed(s);if(!before&&exp.planted.includes(s)){campProgress().gardenAge[s]=0;saveGame();}return result;};
const campUpdate=update;
update=function(dt){
 campUpdate(dt);if(state!=='play'||paused||backgroundSuspended||document.hidden)return;
 const p=campProgress(),phase=survivalPhase();
 for(const s of exp.planted){const old=p.gardenAge[s];p.gardenAge[s]=Math.min(90,old+dt);if(old<90&&p.gardenAge[s]===90){toast(SEED_NAMES[LANG][s]+L('이 활짝 피었습니다. 캠프에서 만나세요.',' is in bloom. Visit your camp.'));saveGame();}}
 if(player.dead)p.watch=0;
 if(phase.night){if(p.nightIndex!==phase.nightIndex){p.nightIndex=phase.nightIndex;p.watch=0;}if(!player.dead)p.watch=Math.min(300,p.watch+dt);}
 else if(p.nightIndex>p.lastDawn){
  if(p.watch>=60&&!player.dead){p.nightMarks=Math.min(999,p.nightMarks+1);p.lastDawn=p.nightIndex;toast(L('새벽을 맞았습니다 · 캠프에 반딧불 하나가 남았습니다.','Dawn reached · a firefly now glows at your camp.'));sfx('level');}
  p.watch=0;p.lastDawn=p.nightIndex;saveGame();
 }
 campUiClock+=dt;if(campUiClock>=.2){campUiClock=0;renderCampFeedback();}
};
const campDrawCamp=drawCamp;
drawCamp=function(){
 originalDrawCamp();const p=campProgress(),x=camp.x,y=camp.y;
 if(p.lamp){
  ctx.fillStyle='#80603b';ctx.fillRect(x+30,y-30,3,31);ctx.fillRect(x+23,y-30,12,3);ctx.fillStyle='#453f2d';ctx.fillRect(x+23,y-25,9,12);
  ctx.fillStyle=survivalPhase().night?'#ffd88d':'#e7bd71';ctx.fillRect(x+25,y-23,5,8);ctx.fillStyle='#fff0ba';ctx.fillRect(x+26,y-22,2,5);
  ctx.fillStyle='#b09969';for(let i=0;i<4;i++)ctx.fillRect(x+10+i*5,y+6+(i%2)*2,3,2);
  if(survivalPhase().night){ctx.save();ctx.globalAlpha=.09+.025*Math.sin(gameT*2);ctx.fillStyle='#ffce80';ctx.beginPath();ctx.arc(x+27,y-18,35,0,Math.PI*2);ctx.fill();ctx.restore();}
 }
 for(const s of exp.planted){const i=exp.planted.indexOf(s),px=x-40+i*17,py=y+16,age=p.gardenAge[s];
  ctx.fillStyle='#81613d';ctx.fillRect(px-5,py-1,11,5);ctx.fillStyle='#5d8c58';ctx.fillRect(px,py-(age>=30?12:6),2,age>=30?12:6);ctx.fillRect(px-3,py-5,4,2);
  if(age>=30){ctx.fillRect(px-6,py-10,6,3);ctx.fillRect(px+2,py-7,6,3);}
  if(age>=90){ctx.fillStyle=['#b8e7d5','#e1bb6c','#b29fd5'][s];ctx.fillRect(px-2,py-16,6,5);ctx.fillStyle=['#e4eed2','#f2dba3','#dfc9f1'][s];ctx.fillRect(px-4,py-14,3,3);ctx.fillRect(px+5,py-12,3,3);ctx.fillStyle='#f3e8ba';ctx.fillRect(px+1,py-14,2,2);}
 }
 for(let i=0;i<Math.min(6,p.nightMarks);i++){const a=gameT*.4+i*2.1,fx=x+Math.cos(a)*(22+i*3),fy=y-20+Math.sin(a*1.4)*13;ctx.fillStyle='#e9efa4';ctx.globalAlpha=.55+.35*Math.sin(gameT*2+i);ctx.fillRect(fx,fy,2,2);}ctx.globalAlpha=1;
};
const campRenderJourney=renderJourneyHud;
renderJourneyHud=function(){campRenderJourney();renderCampFeedback();};
const campApplyLang=applyLang;
applyLang=function(){campApplyLang();$('subtitle').textContent=L('낮에는 발견하고, 밤에는 불빛을 지키세요. 돌아올 때마다 자라는 나의 캠프.','Discover by day. Keep the fire by night. Come home to a growing camp.');renderCampFeedback();};
