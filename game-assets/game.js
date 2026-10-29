
'use strict';
/* ================================================================
   떠돌이 / DRIFTER — 목적 없는 무한 탐험
   [이번 패치] 튜토리얼 달리기 단계 수정
   - 원인: tutTrackMove의 달리기 체크가 '!tut.ran' 조건 안에
     갇혀 있어, ran이 true로 바뀐 그 한 프레임에만 완료 검사가
     실행되고 이후엔 블록 자체에 들어가지 못했음 → 영원히
     완료 불가. '최고치 대비 닳은 양' 방식으로 교체해 매 프레임
     평가. 막대가 20% 정도 닳으면(달리기 약 1~1.5초) 통과.
   - 추가: 채집(4단계)도 완료 처리가 빠져 있어 함께 수정
     (tut.gathered를 설정만 하고 소비하는 곳이 없었음)
   ================================================================ */
const $=id=>document.getElementById(id);
const TILE=16, CH=32, CS=TILE*CH, SCALE=2;
const SAVE_KEY='drifter_save_v1', PREF_KEY='drifter_prefs_v1', TUT_KEY='drifter_tut_done_v1';
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const rand=(a,b)=>a+Math.random()*(b-a);
const choice=a=>a[Math.floor(Math.random()*a.length)];
const isCoarse=()=>document.body.classList.contains('coarse');

/* ---------- 결정적 랜덤 ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash2(x,y,s){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(s|0,974711);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296}
function vnoise(x,y,s){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,sm=t=>t*t*(3-2*t);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);
  const u=sm(xf),v=sm(yf);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function chunkRng(cx,cy,salt){return mulberry32((Math.imul(cx,73856093)^Math.imul(cy,19349663)^Math.imul(seed,83492791)^salt)>>>0)}

/* ---------- i18n ---------- */
const I18N={
ko:{
 subtitle:'안개 너머, 아직 닿지 않은 빛.', cont:'이어하기', newgame:'새로 시작', yes:'네', no:'아니오',
 confirmNew:'진행 중인 기록을 지웁니다', titleFoot:'먼 길의 장비 · 잔광섬 · 뗏목 탐험 · 자동 저장',
 next:'계속 ▸', end:'끝 ▸', cancel:'취소', erased:'기록을 지웠다',
 btnAtk:'채집', btnRun:'달리기', btnUse:'행동', fs:'전체화면',
 toastLvup:l=>'레벨 업! Lv '+l, toastLvup2:'최대 체력 +4 · 최대 스테미너 +6',
 toastDrop:'내려놓았다 — 30초 후 안개 속으로 사라진다', toastVanish:'아이템이 안개 속으로 사라졌다',
 toastDied:'캄캄해진다…', toastRevived:'모닥불 앞에서 눈을 떴다. 짐의 일부를 안개에 두고 왔다.',
 toastCrafted:'완성됐다 — 발밑을 확인하자', buyToast:'구매 완료', buyToastG:'구매했다 — 발밑을 확인하자',
 toastFull:'장비 슬롯이 가득 찼습니다. 교체할 슬롯을 선택하세요.',
 notEnemy:'적이 아니다 — E로 말을 걸자',
 notMine:'캐는 곳이 아니다 — E로 들어간다', notInvest:'조사해야 한다 — E를 눌러라',
 caveToast:'동굴 안에서 보물과 박쥐가 쏟아져 나온다!',
 ruinToast:'유적이 간직하던 장비가 모습을 드러낸다!',
 bioMeadow:'드넓은 초원에 들어섰다', bioForest:'숲에 들어섰다', bioRock:'바위지대에 들어섰다',
 bioShallow:'여울을 지나간다', bioSand:'모래사장에 닿았다',
 caveHintDesk:'E · 동굴로 들어간다', caveHintMob:'행동 버튼 · 동굴로 들어간다',
 ruinHintDesk:'E · 유적을 조사한다', ruinHintMob:'행동 버튼 · 유적을 조사한다',
 warpHintDesk:'E · 지도를 열어 워프한다', warpHintMob:'행동 버튼 · 지도를 열어 워프한다',
 hintPickDesk:'E · 반짝이는 것이 근처에 있다 — 배낭에서 확인하고 착용', hintPickMob:'행동 버튼 · 반짝이는 것이 근처에 있다',
 fishCastDesk:'E · 낚싯대를 던진다', fishCastMob:'행동 버튼 · 낚싯대를 던진다',
 fishWait:'찌를 가만히 지켜본다…', fishReel:'E · 지금 당긴다!',
 fishEscape:'물고기가 도망쳤다…', fishJunk:'낡은 장화뿐이다…',
 fishCarp:'별빛 잉어가 장비를 삼키고 있었다!',
 rotateTxt:'기기를 가로로 돌려주세요',
 mapTitle:'지도 — 발로 그린', campLabel:'캠프',
 lgYou:'나', lgCave:'동굴', lgRuin:'유적(워프)', lgStar:'별빛 파편', lgWander:'방랑자', lgTrader:'행상인',
 mapStats:(c,r,f)=>'동굴 '+c+' · 유적 '+r+' · 최장 '+f+'m',
 pauseDisc:(c,r,f)=>'발견 — 동굴 '+c+' · 유적 '+r+' · 최장 '+f+'m',
 warpToast:'유적의 룬이 빛나며 공간이 접힌다 — 도착.',
 warpLocked:'잠든 유적이다 — 먼저 조사해서 룬을 깨워라.',
 starFall:'유성이 떨어졌다 — 지도를 확인하라!',
 starToast:'별빛 파편을 손에 넣었다!',
 shopT:'행상인의 물건', buy:'구매', sold:'품절',
 shopOpt:n=>'옵션 '+n+'개 이상 붙은 장비',
 craftOpt:n=>'옵션 '+n+'개 이상 보장',
 berryPack:'베리 ×6', berryPackD:'길 위의 간식',
 pauseTitle:'일시정지', pauseResume:'계속하기', pauseHint2:'도움말', pauseHint:'P 키로도 계속할 수 있다',
 qSect:'떠돌이의 과업',
 qGather:(r,n)=>r+' '+n+'개 모으기', qKill:(m,n)=>m+' '+n+'마리 처치',
 qRuin:'고대 유적 조사하기', qCave:'동굴 하나 탐사하기', qStar:'별빛 파편 회수하기',
 qFish:n=>'물고기 '+n+'마리 잡기',
 qDone:xp=>'과업 완료! 보상 XP '+xp+' · 수정 2',
 resWood:'나무', resStone:'돌', resIron:'철', resCrystal:'수정', resBerry:'베리', resJelly:'젤', resFang:'송곳니', resCore:'코어',
 slotEmpty:'빈 슬롯', slotN:n=>'슬롯 '+n, equipped:'착용 중', baseLabel:'기본', optNone:'옵션 없음',
 btnEquipShort:'착용', btnSwap:'버리기', btnClose:'닫기', btnUseShort:'사용', btnCraft:'제작', btnEat:'먹기',
 btnConfirmSwap:'교체',
 pBag:'배낭', pCraft:'제작', pEquip:'장착 중', pGround:'근처의 전리품', pGroundEmpty:'주울 장비가 없다',
 pUse:'소지품 · 사용', pGear:'장비 제작', pBase:'베이스 선택', pResult:'결과',
 pFishSect:'낚시 · 물고기', pFishEmpty:'잡은 물고기가 없다',
 hintDesk:'WASD 이동 · Space 공격 · E 행동 · B 배낭 · M 지도',
 hintMob:'왼쪽 아래를 끌어 이동 · 행동으로 주변 상호작용과 소지품 사용',
 helpTitle:'설정 · 도움말', helpCtrl:'조작', helpTipT:'떠돌이의 방법', close:'닫기', wipe:'기록 지우기', wipeConfirm:'정말 지웁니다',
 kMove:'이동', vMove:'WASD / 방향키 (모바일: 화면을 끌기)', kRun:'달리기', vRun:'Shift (모바일: 달리기 버튼) · 스테미너 소모',
 kAct:'채집 · 공격', vAct:'J / Space — 가장 가까운 나무·돌·적을 자동으로 타격',
 kUse:'행동', vUse:'E — 전리품 확인 · NPC 대화/상점 · 동굴 진입 · 유적 조사 · 물가에서 낚시',
 kBag:'배낭 · 제작', vBag:'Tab / B / C — 우측 패널. 과업·물고기·제작이 여기 있다',
 kItem:'소모품', vItem:'Z 베리 · Q 회복약 · X 기력의 차 · G 물고기 (모바일: 우측 버튼)',
 kMap:'지도 · 워프', vMap:'M 또는 미니맵 클릭 — 조사한 유적 마커를 탭하면 워프. 별빛 파편도 표시',
 kPause:'일시정지', vPause:'P 키 / ⏸ 버튼 / Esc',
 helpTip:'장비는 어디에나 떨어져 있다. 동굴은 걸어 들어가고, 유적은 조사하면 장비와 함께 워프 포인트가 열린다. 물가에서 행동을 눌러 낚시를 선택한다 — 찌가 흔들리는 순간 당겨라. 별빛 잉어는 장비를 삼킨다. 행상인은 장비와 소모품을 팔고, 배낭의 과업을 채우고, 유성을 쫓아라.',
 helpSave:'진행 상황은 자동으로 저장됩니다. 설정에서 백업을 내보낼 수 있습니다.',
 npcW:'방랑자', npcT:'행상인',
 mobSlime:'슬라임', mobWolf:'늑대', mobGolem:'골렘', mobSpider:'거미', mobBat:'박쥐',
 /* ---- 튜토리얼 ---- */
 tutBtn:'튜토리얼', tutBtnTitle:'기초 걷기 수업 다시 듣기',
 tutSpeaker:'웬 방랑자',
 tutOTitle:'떠돌이의 첫걸음',
 tutO1:'……어이, 잠깐. 그 맨발로 어디를 가려고.',
 tutO2:'마침 여분의 장화가 있어. 신어. 그리고 이건 첫걸음의 예의야 — 걷는 법부터 익혀야지.',
 tutO3:'괜찮아, 어렵지 않아. 발이 닿는 대로 걷다 보면 저절로 다 알게 돼.',
 tutOHint:'아래의 간단한 수업을 마치면 길은 알아서 보여준다. 세상의 나머지는, 알아서.',
 tutSkip:'건너뛰기', tutStart:'수업 시작',
 tutDoneTitle:'수업 끝',
 tutDone1:'……그 정도면 됐어. 이제 걷는 건 문제없겠군.',
 tutDone2:'남은 건 네 발이 할 일이야. 이 지도에서 뭘 만나든, 무엇을 주우든 — 그건 걸어가는 네 몫이다.',
 tutDone3:'안개 너머는 스스로 걸어서 확인해. 가끔은 여기저기 흘러다니는 우리 같은 떠돌이에게 말을 걸어 봐.',
 tutDoneHint:'도움이 필요하면 ? 버튼이나 T 키로 이 수업을 다시 들을 수 있다.',
 tutGo:'걷기 시작',
 tutStepsTitle:'첫걸음 수업',
 tutMsgs:{
  move:{d:'WASD 또는 방향키로 걸어 보자. 조금만 걸으면 돼.',m:'화면을 아무 곳이나 끌어서 걸어 보자. 조금만 걸으면 돼.'},
  far:{d:'반대 방향도 가 보자. 어느 쪽이든 갈 수 있다.',m:'반대 방향으로도 끌어서 가 보자. 어느 쪽이든 갈 수 있다.'},
  run:{d:'Shift를 누른 채 걸으면 달린다. 노란 스테미너 막대가 눈에 띄게 닳을 때까지 달려 보자.',m:'달리기 버튼을 누른 채 끌면 달린다. 노란 막대가 눈에 띄게 닳을 때까지 달려 보자.'},
  gather:{d:'주변의 나무나 돌 근처로 가서 J 또는 Space를 눌러 채집해 보자.',m:'주변의 나무나 돌 근처로 가서 채집 버튼을 꾹 눌러 보자.'},
  pickup:{d:'캔 자원은 스스로 모인다. 근처에 떨어진 장비가 있다면 E를 눌러 배낭을 열어 확인하자.',m:'캔 자원은 스스로 모인다. 근처에 떨어진 장비가 있다면 행동 버튼을 눌러 확인하자.'},
  equip:{d:'배낭의 근처의 전리품에서 장비를 착용해 보자. 같은 자리는 세 개까지 꽂을 수 있다.',m:'배낭의 근처의 전리품에서 장비를 착용해 보자. 같은 자리는 세 개까지 꽂을 수 있다.'},
  quest:{d:'마지막으로 배낭의 과업을 확인하자. 떠돌이에게 어울리는 일감이 세 개 늘어서 있다.',m:'마지막으로 배낭의 과업을 확인하자. 떠돌이에게 어울리는 일감이 세 개 늘어서 있다.'},
 },
 tutChk:{
  move:'몸풀기', far:'먼 곳까지', run:'달리기', gather:'채집',
  pickup:'줍기', equip:'장비 착용', quest:'과업 확인'},
 tutComplete:'수업 완료! 방랑자가 고개를 끄덕인다.',
 tutSkipped:'특별한 안내는 없다. 걷다 보면 다 알게 된다.',
 tutFirstToast:'길 위의 것들은 E(행동)로 살펴보자',
},
en:{
 subtitle:'No destination. Just walk.', cont:'Continue', newgame:'New Journey', yes:'Yes', no:'No',
 confirmNew:'This erases your current save', titleFoot:'Gear lies along the road · autosaves',
 next:'Next ▸', end:'End ▸', cancel:'Cancel', erased:'Save erased',
 btnAtk:'GATHER', btnRun:'RUN', btnUse:'USE', fs:'Fullscreen',
 toastLvup:l=>'Level up! Lv '+l, toastLvup2:'Max HP +4 · Max Stamina +6',
 toastDrop:'Set it down — it fades into the mist in 30s', toastVanish:'An item faded into the mist',
 toastDied:'Everything goes dark…', toastRevived:'You wake by the campfire. Some of your load was left in the mist.',
 toastCrafted:'Done — check your feet', buyToast:'Purchased', buyToastG:'Bought — check your feet',
 toastFull:'Equipment slots are full. Choose a slot to replace.',
 notEnemy:'Not a foe — press E to talk',
 notMine:'Not for mining — press E to enter', notInvest:'It awaits study — press E',
 caveToast:'Treasure — and bats — pour out of the cave!',
 ruinToast:'Gear kept by the ruins reveals itself!',
 bioMeadow:'You enter the open meadow', bioForest:'You enter the forest', bioRock:'You enter the stony fields',
 bioShallow:'You wade the shallows', bioSand:'You reach the sands',
 caveHintDesk:'E · enter the cave', caveHintMob:'USE button · enter the cave',
 ruinHintDesk:'E · examine the ruins', ruinHintMob:'USE button · examine the ruins',
 warpHintDesk:'E · open map to warp', warpHintMob:'USE button · open map to warp',
 hintPickDesk:'E · something glints nearby — check the bag', hintPickMob:'USE button · something glints nearby',
 fishCastDesk:'E · cast the line', fishCastMob:'USE button · cast the line',
 fishWait:'Watching the bobber…', fishReel:'E · REEL NOW!',
 fishEscape:'The fish got away…', fishJunk:'Just an old boot…',
 fishCarp:'The star carp had swallowed gear!',
 rotateTxt:'Please rotate your device to landscape',
 mapTitle:'Map — drawn with feet', campLabel:'Camp',
 lgYou:'You', lgCave:'Cave', lgRuin:'Ruin (warp)', lgStar:'Star fragment', lgWander:'Wanderer', lgTrader:'Trader',
 mapStats:(c,r,f)=>'Caves '+c+' · Ruins '+r+' · Farthest '+f+'m',
 pauseDisc:(c,r,f)=>'Found — caves '+c+' · ruins '+r+' · farthest '+f+'m',
 warpToast:'The rune flares and space folds — arrived.',
 warpLocked:'A dormant ruin — examine it to wake its rune.',
 starFall:'A star has fallen — check the map!',
 starToast:'You claim the star fragment!',
 shopT:"Trader's wares", buy:'Buy', sold:'Sold out',
 shopOpt:n=>'Gear with '+n+'+ options',
 craftOpt:n=>'Min. '+n+' options guaranteed',
 berryPack:'Berries ×6', berryPackD:'Trail snacks',
 pauseTitle:'Paused', pauseResume:'Resume', pauseHint2:'Help', pauseHint:'Press P to resume',
 qSect:'Drifter\u2019s errands',
 qGather:(r,n)=>'Gather '+n+' '+r, qKill:(m,n)=>'Slay '+n+' '+m,
 qRuin:'Examine an ancient ruin', qCave:'Explore a cave', qStar:'Recover a star fragment',
 qFish:n=>'Catch '+n+' fish',
 qDone:xp=>'Errand done! XP '+xp+' · 2 crystals',
 resWood:'Wood', resStone:'Stone', resIron:'Iron', resCrystal:'Crystal', resBerry:'Berry', resJelly:'Jelly', resFang:'Fang', resCore:'Core',
 slotEmpty:'Empty', slotN:n=>'Slot '+n, equipped:'Equipped', baseLabel:'Base', optNone:'No options',
 btnEquipShort:'Equip', btnSwap:'Drop', btnClose:'Close', btnUseShort:'Use', btnCraft:'Craft', btnEat:'Eat',
 btnConfirmSwap:'Swap',
 pBag:'Bag', pCraft:'Craft', pEquip:'Equipped', pGround:'Nearby loot', pGroundEmpty:'No gear to pick up',
 pUse:'Consumables', pGear:'Gear Crafting', pBase:'Choose base', pResult:'Result',
 pFishSect:'Fishing · catch', pFishEmpty:'No fish caught yet',
 hintDesk:'WASD move · Space attack · E interact · B bag · M map',
 hintMob:'Drag the lower left to move · Interact for nearby actions and supplies',
 helpTitle:"Settings & help", helpCtrl:'Controls', helpTipT:'How to drift', close:'Close', wipe:'Erase save', wipeConfirm:'Really erase?',
 kMove:'Move', vMove:'WASD / Arrows (mobile: drag the screen)', kRun:'Run', vRun:'Shift (mobile: RUN) · drains stamina',
 kAct:'Gather · Attack', vAct:'J / Space — auto-hits the nearest tree, rock or foe',
 kUse:'Interact', vUse:'E — check loot · talk/shop · enter caves · examine ruins · fish at the water\u2019s edge',
 kBag:'Bag · Craft', vBag:'Tab / B / C — side panel. Errands, fish and crafting live here',
 kItem:'Consumables', vItem:'Z Berry · Q Salve · X Vigor Tea · G Fish (mobile: right-side buttons)',
 kMap:'Map · Warp', vMap:'M or click the minimap — tap an examined ruin marker to warp. Star fragments marked too',
 kPause:'Pause', vPause:'P key / ⏸ button / Esc',
 helpTip:'Gear lies everywhere. Walk into caves; examine ruins for gear AND warp anchors. Use Interact by the water and choose Fishing — reel the instant the bobber dips. Star carp swallow gear. Traders sell wares; fill errands; chase fallen stars.',
 helpSave:'Progress autosaves. Export a backup from Settings.',
 npcW:'Wanderer', npcT:'Trader',
 mobSlime:'slimes', mobWolf:'wolves', mobGolem:'golems', mobSpider:'spiders', mobBat:'bats',
 /* ---- Tutorial ---- */
 tutBtn:'TUTORIAL', tutBtnTitle:'Take the first-steps lesson again',
 tutSpeaker:'A WANDERER',
 tutOTitle:'A Drifter\u2019s First Steps',
 tutO1:'…Hey. Hold on. Where do you think you\u2019re going barefoot like that?',
 tutO2:'I happen to have a spare pair of boots. Take them. And this — the courtesy of a first step. Learn to walk first.',
 tutO3:'It\u2019s not hard, I promise. Walk far enough and the rest teaches itself.',
 tutOHint:'Finish the short lesson below and the road will take care of the rest. What\u2019s out there — that part is yours to find.',
 tutSkip:'Skip', tutStart:'Begin the lesson',
 tutDoneTitle:'Lesson\u2019s over',
 tutDone1:'…That\u2019ll do. Walking\u2019s no problem for you now.',
 tutDone2:'The rest is your feet\u2019s business. Whatever you meet on this map, whatever you pick up — that\u2019s the walker\u2019s share.',
 tutDone3:'See past the mist for yourself. And now and then, stop and talk to us drifters drifting by.',
 tutDoneHint:'You can retake this lesson anytime with the TUTORIAL button or the T key.',
 tutGo:'Start walking',
 tutStepsTitle:'FIRST STEPS',
 tutMsgs:{
  move:{d:'Walk with WASD or the arrow keys. Just a few steps will do.',m:'Drag anywhere on the screen to walk. Just a few steps will do.'},
  far:{d:'Now try the opposite direction. Any direction works.',m:'Now drag the opposite way. Any direction works.'},
  run:{d:'Hold Shift while walking to run. Keep running until the yellow stamina bar visibly drains.',m:'Hold the RUN button while dragging to run. Keep going until the yellow bar visibly drains.'},
  gather:{d:'Walk up to a tree or rock and press J or Space to gather it.',m:'Walk up to a tree or rock and hold the GATHER button.'},
  pickup:{d:'Gathered resources collect themselves. If any gear dropped nearby, press E to open the bag and check it.',m:'Gathered resources collect themselves. If any gear dropped nearby, tap USE to check it.'},
  equip:{d:'Equip something from the Nearby loot section of the bag. The same spot holds up to three pieces.',m:'Equip something from the Nearby loot section of the bag. The same spot holds up to three pieces.'},
  quest:{d:'Finally, check the errands in your bag. Three odd jobs fit for a drifter await.',m:'Finally, check the errands in your bag. Three odd jobs fit for a drifter await.'},
 },
 tutChk:{
  move:'Warm-up', far:'A little further', run:'Running', gather:'Gathering',
  pickup:'Picking up', equip:'Equipping gear', quest:'Errands'},
 tutComplete:'Lesson complete! The wanderer nods.',
 tutSkipped:'No special guidance. Walk far enough and it all becomes clear.',
 tutFirstToast:'Press E (USE) to examine things along the road',
}};
let LANG='en';
const t=k=>{const v=I18N[LANG][k];return typeof v==='function'?v:v||k};
const MOB_META={slime:{ko:'슬라임',en:'Slime'},wolf:{ko:'늑대',en:'Wolf'},golem:{ko:'골렘',en:'Golem'},
 spider:{ko:'거미',en:'Spider'},bat:{ko:'박쥐',en:'Bat'}};

/* ---------- 스탯/장비 정의 ---------- */
const STAT_META={
 atk:{ko:'공격력',en:'Attack',fmt:v=>'+'+v},
 spd:{ko:'이동 속도',en:'Speed',fmt:v=>'+'+v+'%'},
 vit:{ko:'최대 체력',en:'Max HP',fmt:v=>'+'+v},
 stam:{ko:'최대 스테미너',en:'Max Stamina',fmt:v=>'+'+v},
 regen:{ko:'스테미너 회복',en:'Stam. Regen',fmt:v=>'+'+(v%1?v.toFixed(1):v)+'/s'},
 range:{ko:'손 뻗는 범위',en:'Reach',fmt:v=>'+'+v},
 luck:{ko:'행운',en:'Luck',fmt:v=>'+'+v},
};
const OPT_RANGE={atk:[1,3],spd:[3,12],vit:[3,10],stam:[5,20],regen:[1,4],range:[3,10],luck:[2,8]};
const BASES={
 pickaxe:{ko:'곡괭이',en:'Pickaxe',stats:{atk:2}},
 sword:{ko:'검',en:'Sword',stats:{atk:4}},
 boots:{ko:'장화',en:'Boots',stats:{spd:10}},
 cloak:{ko:'망토',en:'Cloak',stats:{spd:5,regen:2}},
 amulet:{ko:'부적',en:'Amulet',stats:{stam:25}},
 charm:{ko:'행운의 부적',en:'Lucky Charm',stats:{luck:6,range:6}},
 helmet:{ko:'투구',en:'Helmet',stats:{vit:8}},
 shield:{ko:'방패',en:'Shield',stats:{vit:5,stam:10}},
 gloves:{ko:'장갑',en:'Gloves',stats:{atk:1,spd:4}},
 ring:{ko:'반지',en:'Ring',stats:{luck:4,regen:2}},
};
const BASE_KEYS=['pickaxe','sword','boots','cloak','amulet','charm','helmet','shield','gloves','ring'];
const BASE_W=[['pickaxe',16],['sword',13],['boots',15],['cloak',13],['amulet',11],['charm',11],
 ['helmet',10],['shield',10],['gloves',10],['ring',8]];
const PREFIX={1:[{ko:'단단한',en:'Sturdy'},{ko:'쓸 만한',en:'Decent'}],
 2:[{ko:'좋은',en:'Fine'},{ko:'벼려진',en:'Tempered'}],
 3:[{ko:'놀라운',en:'Wondrous'},{ko:'별빛의',en:'Starlit'},{ko:'전설의',en:'Fabled'}]};
function equipName(eq){const n=eq.opts.length;if(!n)return BASES[eq.base][LANG];
 const p=PREFIX[n][Math.floor(hash2(eq.h1,eq.h2,977)*PREFIX[n].length)];
 return p[LANG]+' '+BASES[eq.base][LANG]}
function statName(k){return STAT_META[k][LANG]}
function statStr(k,v){return STAT_META[k].fmt(v)}
let uid=0;
function rollOptions(rng,minOpts){
 const luck=(stats&&typeof stats.luck==='number'&&stats.luck)||0;
 let n=0;const r=rng(),sh=luck*0.006;
 if(r<0.06+sh*2)n=3;else if(r<0.28+sh)n=2;else if(r<0.60+sh*0.5)n=1;
 if(minOpts>=0)n=Math.max(n,minOpts);
 const pool=Object.keys(OPT_RANGE),opts=[];
 for(let i=0;i<n;i++){const k=pool[Math.floor(rng()*pool.length)];pool.splice(pool.indexOf(k),1);
  const[a,b]=OPT_RANGE[k];opts.push({k,v:a+Math.floor(rng()*(b-a+1))})}
 return opts}
function makeEquip(rng,minOpts=-1){
 const tot=BASE_W.reduce((s,e)=>s+e[1],0);let r=rng()*tot,base='pickaxe';
 for(const e of BASE_W){r-=e[1];if(r<=0){base=e[0];break}}
 return{base,opts:rollOptions(rng,minOpts),h1:Math.floor(rng()*1e9),h2:Math.floor(rng()*1e9),id:++uid}}
function makeEquipFixed(base,rng,minOpts=-1){
 return{base,opts:rollOptions(rng,minOpts),h1:Math.floor(rng()*1e9),h2:Math.floor(rng()*1e9),id:++uid}}

/* ---------- 노드/적 정의 ---------- */
const NODE_INFO={
 tree:{hp:4,xp:2,res:'wood',drops:[1,2],eqC:0.04,hitY:-11,hitR:13},
 rock:{hp:6,xp:2,res:'stone',drops:[1,2],eqC:0.04,hitY:-6,hitR:12},
 iron:{hp:9,xp:6,res:'iron',drops:[1,2],eqC:0.08,hitY:-6,hitR:12},
 crystal:{hp:12,xp:10,res:'crystal',drops:[1,2],eqC:0.30,hitY:-8,hitR:12},
 bush:{hp:2,xp:1,res:'berry',drops:[1,1],eqC:0.01,hitY:-4,hitR:10},
 cave:{hp:1,xp:18,res:'crystal',drops:[0,0],eqC:0.60,hitY:-14,hitR:20},
 ruin:{hp:1,xp:25,res:'crystal',drops:[0,0],eqC:0,hitY:-10,hitR:11},
};
const ENEMY_INFO={
 slime:{hp:6,dmg:3,speed:26,aggro:70,wander:1,size:9,xp:4},
 wolf:{hp:10,dmg:6,speed:72,aggro:150,wander:1,size:11,xp:7},
 golem:{hp:20,dmg:10,speed:26,aggro:100,wander:1,size:14,xp:12},
 spider:{hp:8,dmg:5,speed:60,aggro:120,wander:1,size:10,xp:6},
 bat:{hp:4,dmg:4,speed:85,aggro:130,wander:1,size:8,xp:3},
 darkling:{hp:12,dmg:6,speed:44,aggro:420,wander:1,size:10,xp:14},
 gloomfang:{hp:36,dmg:18,speed:105,aggro:520,wander:1,size:12,xp:32},
 ashbrute:{hp:100,dmg:28,speed:36,aggro:620,wander:1,size:16,xp:80},
};
const MOB_DROPS={
 slime:{res:'jelly',min:1,max:2,c:0.9},
 wolf:{res:'fang',min:1,max:2,c:0.9},
 golem:{res:'core',min:1,max:1,c:1},
 spider:{res:'fang',min:1,max:1,c:0.7},
 bat:{res:'jelly',min:1,max:1,c:0.5},
 darkling:{res:'gloom',min:1,max:1,c:1},
 gloomfang:{res:'gloom',min:1,max:1,c:1},
 ashbrute:{res:'gloom',min:2,max:2,c:1},
};
const RES_KEYS=['wood','stone','iron','crystal','berry','jelly','fang','core','gloom','nightFang','nightCore'];
const RES_META={
 wood:{ko:'나무',en:'Wood'}, stone:{ko:'돌',en:'Stone'}, iron:{ko:'철',en:'Iron'},
 crystal:{ko:'수정',en:'Crystal'}, berry:{ko:'베리',en:'Berry'}, jelly:{ko:'젤',en:'Jelly'},
 fang:{ko:'송곳니',en:'Fang'}, core:{ko:'코어',en:'Core'},
 gloom:{ko:'잔영',en:'Gloom'}, nightFang:{ko:'어둠 송곳니',en:'Night Fang'}, nightCore:{ko:'밤의 핵',en:'Night Core'}};
function defaultRes(){return{wood:0,stone:0,iron:0,crystal:0,berry:0,jelly:0,fang:0,core:0,gloom:0,nightFang:0,nightCore:0}}

/* ---------- 물고기 정의 ---------- */
const FISH_INFO={
 minnow:{ko:'피라미',en:'Minnow',heal:6,w:45,rare:0},
 trout:{ko:'송어',en:'Trout',heal:12,w:25,rare:0},
 catfish:{ko:'메기',en:'Catfish',heal:20,w:14,rare:0},
 herring:{ko:'달빛 청어',en:'Moon Herring',heal:14,stam:true,w:8,rare:1},
 carp:{ko:'별빛 잉어',en:'Star Carp',heal:20,w:4,rare:2},
 boot:{ko:'낡은 장화',en:'Old Boot',heal:0,w:4,rare:0,junk:true},
};
const FISH_ORDER=['minnow','trout','catfish','herring','carp'];

/* ---------- 제작 레시피 ---------- */
const RECIPES=[
 {icon:'potion',ko:'응급 회복약',en:'Field Salve',dko:'체력 40% 회복',den:'Restores 40% HP',cost:{jelly:3},gives:'heal'},
 {icon:'tea',ko:'기력의 차',en:'Vigor Tea',dko:'스테미너 전부 회복',den:'Fully restores stamina',cost:{berry:3,fang:1},gives:'tea'},
];
const GEAR_TIERS=[
 {ko:'단단한 제작',en:'Sturdy Craft',minOpts:1,cost:{wood:5,stone:5}},
 {ko:'정예 제작',en:'Fine Craft',minOpts:2,cost:{iron:4,fang:3}},
 {ko:'전설의 제작',en:'Wondrous Craft',minOpts:3,cost:{crystal:3,core:2}},
];

/* ---------- 대사 풀 ---------- */
const DIALOG={
 greet:{ko:['안녕, 떠돌이.','오, 웬 방랑자.','이런 곳에서 만나다니.','발이 닳았겠군.'],
  en:['Well met, drifter.','Oh, a fellow wanderer.','Didn\u2019t expect company out here.','Your boots look worn.']},
 body:{ko:['안개 너머엔 늘 더 넓은 평원이 있지. 난 그걸 확인하러 다녀.','장비는 손에 잡히는 대로 가져. 내일이면 더 좋은 게 길에 떨어져 있을 테니.','수정을 찾으면 주변을 둘러봐. 빛나는 것들은 혼자 오지 않아.','지도는 발로 그리는 거야.','동굴은 걸어 들어가는 거고, 빛나는 룬이 새겨진 유적은 조사하는 거야. 조사하면 그 유적으로 워프도 된다.','물가에 서서 E를 눌러 봐. 배가 고플 때 물고기만 한 게 있더군. 별빛 잉어는 장비를 삼키기도 해.','유성이 떨어지면 달려가 봐. 별빛 파편에는 좋은 장비가 잠들어 있어.','바위지대엔 움직이는 돌이 있다더군. 조심하게.'],
  en:['Beyond the mist there\u2019s always more plain. I go check.','Take whatever gear you find. Better things will lie on the road tomorrow.','When you find a crystal, look around. Glowing things never travel alone.','Maps are drawn with feet.','Caves you walk into; rune-lit ruins you examine — and once examined, they become warp anchors.','Stand by the water and press E. Nothing beats fresh fish on the road — and star carp swallow gear, I hear.','When a star falls, run for it. Fine gear sleeps in starlight.','They say rocks walk in the stony fields. Careful out there.']},
 farewell:{ko:['무사히 걷게.','어디서든 다시 만나자.','발이 닿는 곳이 길이야.'],
  en:['Walk safe.','May we meet again, somewhere.','Wherever your feet land, that\u2019s the road.']},
 hint:{ko:['그러고 보니… 이 근처 어딘가에서 무언가 반짝이는 걸 봤어.','이 근처에 좋은 물건이 떨어져 있다는 소문이 있어.','아까 뭔가가 풀숲에서 반짝였거든. 찾아보게.'],
  en:['Come to think of it\u2026 I saw something glinting around here.','There\u2019s a rumor of fine gear dropped nearby.','Something sparkled in the grass a while ago. Go look.']},
 trade:{ko:['물건도 팔고 이야기도 팔지. 마음에 드는 게 있나?','이 가방 속엔 갓 주운 것들도 있어.','싼 게 비싼 게 아니다만, 든든한 건 사실이야.'],
  en:['I sell goods as well as stories. Anything catch your eye?','Fresh finds in this pack of mine.','Cheap ain\u2019t always worse — but sturdy it is.']},
};

/* ================================================================
   상태
   ================================================================ */
let seed=0, state='title', paused=false, gameT=0, saveTimer=0, camShake=0;
let frameN=0;
const chunks=new Map();
const terrainLRU=new Map();
let terrainFullRebuild=false;
let destroyed={};
let looted={};
let caveLooted=new Set();
let ruinDone=new Set();
let giftedSet=new Set();
let explored=new Map();
let landmarks=new Map();
let seenBiomes=new Set();
let farthest=0;
let quests=[];
let starActive=null;
let starT=70;
let muted=false;
const player={x:268,y:268,hp:30,stam:100,lvl:1,xp:0,face:1,phase:0,atkCool:0,invuln:0,dead:false,
 exhausted:false,kbx:0,kby:0,equip:[null,null,null],res:defaultRes(),pots:{heal:0,tea:0},fish:{}};
let stats={};
const cam={x:268,y:268};
let groundEquip=[], groundRes=[], particles=[], floaters=[], ambient=[];
function addGroundEquip(item){groundEquip.push(item);window.DrifterMultiplayer?.publishLoot?.(item);return item}
function addGroundRes(item){groundRes.push(item);window.DrifterMultiplayer?.publishLoot?.(item);return item}
let nearItems=[], nearIdx=0, nearSig='', prevNearUids=new Set();
let replaceState=null;
let invOpen=false, invTab='bag', craftBase='pickaxe';
let secOpen=null;
let attackT=0, attackDir=0, attackWeapon=null, curTarget=null;
let targetScanAt=-Infinity,nodeCacheAt=-Infinity,nodeCacheX=NaN,nodeCacheY=NaN,nodeCacheRadius=0;
let landmarkScanAt=-Infinity,explorationScanAt=-Infinity,enemySimBank=0;
let dlg=null;
let lastNpcHintT=-9, lastCaveHintT=-9;
let modalOpen=false, mapOpen=false, pauseOpen=false;
let warpLock=0;
let fishing=null;
const camp={x:256,y:262};
const keys={}; let attackHeld=false, runHeld=false;
let tutorialInputMode='keyboard';
function noteTutorialInput(mode){
 if(tutorialInputMode===mode)return;
 tutorialInputMode=mode;
 if(typeof renderJourneyHud==='function')renderJourneyHud()}
const joy={active:false,id:null,bx:0,by:0,dx:0,dy:0};
// Inventory actions validate the item identity; they do not depend on paused game time.
const MAP_CELLS=[2,4,8,16,32];
let mapZoomIdx=2, mapCX=0, mapCY=0, mapDrag=null, mapMoved=false;
let mapW=0, mapH=0, mapDrawT=0;

/* ================================================================
   [튜토리얼] 상태
   ================================================================ */
const TUT_STEPS=['move','far','run','gather','pickup','equip','quest'];
const tut={
 active:false, idx:0,
 walked:0, lastX:0, lastY:0,
 stamPeak:0,          /* 달리기 단계: 스테미너 최고치(회복 포함 추적) */
 gathered:false, equippedCount:0,
};
function tutCur(){return TUT_STEPS[tut.idx]||null}
function tutStepDone(key){
 if(!tut.active||tutCur()!==key)return;
 tut.idx++;
 sfx('trade');
 if(tutCur())tutShowStep();
 else tutFinish()}
function tutRenderSteps(){
 const el=$('tutStepsList');
 if(!tut.active){$('tutSteps').classList.remove('show');return}
 $('tutStepsTitle').textContent=t('tutStepsTitle');
 let h='';
 TUT_STEPS.forEach((k,i)=>{
  h+='<span class="tstep'+(i<tut.idx?' done':i===tut.idx?' cur':'')+'" title="'+t('tutChk')[k]+'"></span>'});
 el.innerHTML=h;
 $('tutSteps').classList.add('show')}
function tutShowStep(){
 const k=tutCur();if(!k)return;
 const m=t('tutMsgs')[k];
 const el=$('tutMsg');
 el.textContent=isCoarse()?m.m:m.d;
 el.classList.add('show');
 tutRenderSteps();
 if(k==='move'||k==='far'){tut.walked=0;tut.lastX=player.x;tut.lastY=player.y}
 if(k==='run')tut.stamPeak=player.stam;
 if(k==='gather')tut.gathered=false;
 if(k==='pickup'){} /* 자원/장비 감시는 update에서 */
 if(k==='equip')tut.equippedCount=player.equip.filter(e=>e).length}
/* [핵심 수정] 매 프레임 평가 — 이전엔 달리기 체크가 '!tut.ran' 래치
   안에 갇혀 완료 검사가 단 한 프레임만 실행됐다.
   새 방식: 단계 시작 후 관측된 스테미너 '최고치'를 계속 갱신하다가,
   최고치 대비 20% 이상 닳으면(달리기 1~1.5초) 통과.
   이전에 달려 스테미너가 깎인 채 들어와도: 회복하며 최고치가 올라가고,
   다시 달리면 그 최고치 기준으로 닳은 양을 측정하므로 정상 동작. */
function tutTrackMove(dt,moving){
 if(!tut.active)return;
 const k=tutCur();
 if(k==='move'||k==='far'){
  if(!moving)return;
  const d=Math.hypot(player.x-tut.lastX,player.y-tut.lastY);
  if(d>2){tut.walked+=d;tut.lastX=player.x;tut.lastY=player.y}
  if(tut.walked>60)tutStepDone(k)}
 else if(k==='run'){
  if(player.stam>tut.stamPeak)tut.stamPeak=player.stam;
  const need=clamp(stats.maxStam*0.2,12,30);
  if(tut.stamPeak-player.stam>=need)tutStepDone('run')}}
function tutOpenIntro(replay){
 $('tutSpeaker').textContent=t('tutSpeaker');
 $('tutTitle').textContent=t('tutOTitle');
 $('tutBody').innerHTML='<p>'+t('tutO1')+'</p><p>'+t('tutO2')+'</p><p>'+t('tutO3')+'</p>';
 $('tutHintLine').textContent=t('tutOHint');
 $('tutSkip').textContent=t('tutSkip');
 $('tutOk').textContent=t('tutStart');
 $('tutOk').onclick=()=>{startTutorial()};
 $('tutSkip').onclick=()=>{skipTutorial(replay)};
 $('tutOv').classList.add('show')}
function tutOpenDone(){
 tut.active=false;
 $('tutSteps').classList.remove('show');
 $('tutMsg').classList.remove('show');
 try{DrifterPlatform.storage.setItem(TUT_KEY,'1')}catch(e){}
 $('tutSpeaker').textContent=t('tutSpeaker');
 $('tutTitle').textContent=t('tutDoneTitle');
 $('tutBody').innerHTML='<p>'+t('tutDone1')+'</p><p>'+t('tutDone2')+'</p><p>'+t('tutDone3')+'</p>';
 $('tutHintLine').textContent=t('tutDoneHint');
 $('tutSkip').style.display='none';
 $('tutOk').textContent=t('tutGo');
 $('tutOk').onclick=()=>{$('tutOv').classList.remove('show')};
 $('tutOv').classList.add('show')}
function startTutorial(){
 $('tutOv').classList.remove('show');
 $('tutSkip').style.display='';
 tut.active=true;tut.idx=0;
 tutShowStep()}
function skipTutorial(replay){
 $('tutOv').classList.remove('show');
 tut.active=false;
 $('tutSteps').classList.remove('show');
 $('tutMsg').classList.remove('show');
 try{DrifterPlatform.storage.setItem(TUT_KEY,'1')}catch(e){}
 if(!replay)toast(t('tutSkipped'),'small')}
function tutFinish(){
 toast(t('tutComplete'));
 sfx('level');
 tutOpenDone()}
 $('btnTut').onclick=()=>{ensureAudio();sfx('ui');
 if(state!=='play'){toast(t('tutBtnTitle'),'small');return}
 tutOpenIntro(true)};
function tutIsDone(){try{return !!DrifterPlatform.storage.getItem(TUT_KEY)}catch(e){return false}}

/* ================================================================
   전체화면 / 가로 고정
   ================================================================ */
/* ================================================================
   사운드
   ================================================================ */
let actx=null, noiseBuf=null;
function ensureAudio(){try{
 if(!actx){actx=new (window.AudioContext||window.webkitAudioContext)();
  noiseBuf=actx.createBuffer(1,actx.sampleRate*0.3,actx.sampleRate);
  const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
 if((actx.state==='suspended'||actx.state==='interrupted')&&!DrifterPlatform.muted&&!document.hidden)actx.resume().catch(()=>{});
}catch(e){}}
function tone(f0,f1,dur,type,vol,delay=0){if(!actx||muted||DrifterPlatform.muted||document.hidden||backgroundSuspended)return;
 const t0=actx.currentTime+delay,o=actx.createOscillator(),g=actx.createGain();
 o.type=type;o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t0+dur);
 g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
 o.connect(g);g.connect(actx.destination);o.start(t0);o.stop(t0+dur+0.02)}
function noiseHit(dur,vol,freq,delay=0){if(!actx||muted||DrifterPlatform.muted||document.hidden||backgroundSuspended)return;
 const t0=actx.currentTime+delay,s=actx.createBufferSource(),f=actx.createBiquadFilter(),g=actx.createGain();
 s.buffer=noiseBuf;f.type='lowpass';f.frequency.value=freq;
 g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
 s.connect(f);f.connect(g);g.connect(actx.destination);s.start(t0);s.stop(t0+dur+0.02)}
function sfx(n){switch(n){
 case 'swing':noiseHit(0.05,0.06,900);break;
 case 'chop':noiseHit(0.07,0.22,500);tone(180,120,0.06,'square',0.07);break;
 case 'break':noiseHit(0.22,0.3,300);tone(150,60,0.18,'square',0.09);break;
 case 'hit':tone(300,180,0.08,'square',0.12);noiseHit(0.05,0.12,700);break;
 case 'res':tone(600+Math.random()*90,880,0.09,'triangle',0.09);break;
 case 'equip':tone(660,660,0.05,'square',0.1);tone(990,990,0.06,'square',0.08,0.06);break;
 case 'drop':tone(440,330,0.08,'triangle',0.08);break;
 case 'hurt':tone(220,80,0.2,'sawtooth',0.16);noiseHit(0.12,0.14,400);break;
 case 'level':[523,659,784].forEach((f,i)=>tone(f,f,0.1,'square',0.09,i*0.09));break;
 case 'ui':tone(500,500,0.03,'square',0.05);break;
 case 'talk':tone(300,340,0.06,'triangle',0.08);break;
 case 'deny':tone(180,140,0.12,'square',0.09);break;
 case 'alert':tone(660,990,0.09,'triangle',0.07);break;
 case 'trade':tone(880,880,0.07,'triangle',0.1);tone(1320,1320,0.08,'triangle',0.09,0.08);break;
 case 'warp':tone(220,900,0.3,'triangle',0.12);tone(900,1400,0.25,'triangle',0.08,0.12);break;
 case 'cast':noiseHit(0.08,0.07,1400);tone(700,400,0.08,'triangle',0.05);break;
 case 'splash':noiseHit(0.14,0.2,650);tone(280,140,0.1,'triangle',0.07);break;
 case 'reel':tone(500,760,0.07,'square',0.08);tone(760,990,0.06,'square',0.06,0.06);break;
}}

/* ================================================================
   월드 생성
   ================================================================ */
const B_WATER=0,B_SAND=1,B_MEADOW=2,B_FOREST=3,B_ROCK=4,B_SHALLOW=5;
const BIOME_COL=['#3c6f86','#cbb37a','#6d9b52','#47713b','#7a746a','#7fb8c9'];
const BIOME_KEY={[B_MEADOW]:'bioMeadow',[B_FOREST]:'bioForest',[B_ROCK]:'bioRock',
 [B_SHALLOW]:'bioShallow',[B_SAND]:'bioSand'};
function elev(tx,ty){return vnoise(tx*0.045,ty*0.045,seed)*0.55+vnoise(tx*0.1,ty*0.1,seed+7)*0.3+vnoise(tx*0.24,ty*0.24,seed+13)*0.15}
function moist(tx,ty){return vnoise(tx*0.05+100,ty*0.05,seed+31)}
function biomeAt(tx,ty){
 if(tx>=-4&&tx<=4&&ty>=-4&&ty<=4)return B_MEADOW;
 const e=elev(tx,ty);
 if(e<0.30)return B_WATER;
 if(e<0.345)return B_SHALLOW;
 if(e<0.375)return B_SAND;
 if(e>0.70)return B_ROCK;
 return moist(tx,ty)>0.55?B_FOREST:B_MEADOW}

function tilePaint(c,lx,ly,wx,wy,b){
 const px=lx*TILE,py=ly*TILE,h=hash2(wx,wy,seed+55);
 if(b===B_MEADOW||b===B_FOREST){
  const base=b===B_FOREST?(h<0.5?'#699951':'#63914b'):(h<0.5?'#86b15e':'#7fa957');
  c.fillStyle=base;c.fillRect(px,py,TILE,TILE);
  c.fillStyle=b===B_FOREST?'#4f7c41':'#6f9a4d';
  const n=2+Math.floor(h*3);
  for(let i=0;i<n;i++){const hx=hash2(wx*7+i,wy*3,seed+9),hy=hash2(wx,wy*11+i,seed+19);
   c.fillRect(px+Math.floor(hx*14),py+Math.floor(hy*14),1,2)}
  if(b===B_MEADOW&&hash2(wx,wy,seed+77)<0.02){
   c.fillStyle=hash2(wx,wy,seed+78)<0.5?'#e8d8a3':'#d8a03c';
   c.fillRect(px+Math.floor(h*10)+2,py+Math.floor(hash2(wx,wy,seed+79)*10)+2,1,1)}
 }else if(b===B_WATER){
  c.fillStyle=h<0.5?'#4e94b5':'#488bad';c.fillRect(px,py,TILE,TILE);
  c.fillStyle='#3f7fa0';
  if(h<0.35)c.fillRect(px+2,py+Math.floor(h*20)%12,8,2);
 }else if(b===B_SHALLOW){
  c.fillStyle=h<0.5?'#7fc0d4':'#79bad0';c.fillRect(px,py,TILE,TILE);
  c.fillStyle='#a5d8e4';
  if(h<0.5)c.fillRect(px+2,py+Math.floor(h*20)%12,7,1);
 }else if(b===B_SAND){
  c.fillStyle=h<0.5?'#d6c084':'#cfb97c';c.fillRect(px,py,TILE,TILE);
  c.fillStyle='#bda76c';c.fillRect(px+Math.floor(h*13),py+Math.floor(hash2(wx,wy,seed+81)*13),2,1);
 }else{
  c.fillStyle=h<0.5?'#9a9184':'#938a7d';c.fillRect(px,py,TILE,TILE);
  c.fillStyle='#7c756a';
  for(let i=0;i<3;i++){const hx=hash2(wx*5+i,wy*7,seed+91),hy=hash2(wx*3,wy*9+i,seed+92);
   c.fillRect(px+Math.floor(hx*13),py+Math.floor(hy*13),2,2)}
 }}

function buildTerrain(ch){
 const cv=document.createElement('canvas');cv.width=CS;cv.height=CS;
 const c=cv.getContext('2d');
 for(let ly=0;ly<CH;ly++)for(let lx=0;lx<CH;lx++){
  const wx=ch.cx*CH+lx,wy=ch.cy*CH+ly;
  tilePaint(c,lx,ly,wx,wy,ch.biome[ly*CH+lx])}
 return cv}

function getChunk(cx,cy){
 const key=cx+','+cy;let ch=chunks.get(key);
 if(ch)return ch;
 ch={cx,cy,key,biome:new Array(CH*CH),nodes:[],enemies:[],npc:null,loots:[],water:[],mapColor:2};
 chunks.set(key,ch);
 for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CH;tx++){
  const b=biomeAt(cx*CH+tx,cy*CH+ty);ch.biome[ty*CH+tx]=b;
  if(b===B_WATER)ch.water.push([cx*CH+tx,cy*CH+ty]);
  if(tx>=13&&tx<=19&&ty>=13&&ty<=19&&cx===0&&cy===0)continue;
  const r=hash2(cx*CH+tx,cy*CH+ty,seed+101);
  let type=null;
  if(b===B_FOREST){if(r<0.10)type='tree';else if(r<0.125)type='bush'}
  else if(b===B_MEADOW){if(r<0.015)type='tree';else if(r<0.045)type='bush';else if(r<0.047)type='crystal'}
  else if(b===B_ROCK){if(r<0.055)type='rock';else if(r<0.085)type='iron';else if(r<0.090)type='crystal';else if(r<0.097)type='cave'}
  if(type){
   const info=NODE_INFO[type];
   const ox=(hash2(cx*CH+tx,cy*CH+ty,seed+113)-0.5)*10,oy=(hash2(cx*CH+tx,cy*CH+ty,seed+127)-0.5)*10;
   ch.nodes.push({idx:ch.nodes.length,type,x:(cx*CH+tx)*TILE+TILE/2+ox,y:(cy*CH+ty)*TILE+TILE/2+oy,
    hp:info.hp,maxHp:info.hp,shake:0,dead:false,looted:false,chunkKey:key,isNode:true});
  }}
 if(hash2(cx,cy,seed+701)<0.12&&!(cx===0&&cy===0)){
  const rr=chunkRng(cx,cy,702);
  let rx,ry,ok=false;
  for(let a=0;a<8&&!ok;a++){
   rx=(cx*CH+Math.floor(rr()*CH))*TILE+8;ry=(cy*CH+Math.floor(rr()*CH))*TILE+8;
   if(biomeAt(Math.floor(rx/TILE),Math.floor(ry/TILE))!==B_WATER)ok=true}
  if(ok)ch.nodes.push({idx:ch.nodes.length,type:'ruin',x:rx,y:ry,
   hp:1,maxHp:1,shake:0,dead:false,looted:false,chunkKey:key,isNode:true})}
 const caves=ch.nodes.filter(n=>n.type==='cave');
 if(caves.length)ch.nodes=ch.nodes.filter(n=>{
  if(n.type==='cave')return true;
  for(const cv of caves){const dx=n.x-cv.x,dy=n.y-cv.y;
   if(dx*dx+dy*dy<52*52)return false}
  return true});
 const des=new Set(destroyed[key]||[]);for(const n of ch.nodes)if(des.has(n.idx))n.dead=true;
 for(const n of ch.nodes){
  if(n.type==='cave'&&caveLooted.has(key+':'+n.idx))n.looted=true;
  if(n.type==='ruin'&&ruinDone.has(key+':'+n.idx))n.looted=true}
 const rng=chunkRng(cx,cy,555);
 if(hash2(cx,cy,seed+301)<0.13){
  const idx=Math.floor(rng()*999);
  const lx=campSafeLootPos(cx,cy,rng);
  const eq=makeEquip(rng,-1,lootContext(lx[0],lx[1],'world'));
  ch.loots.push(idx);
  if(!(looted[key]&&looted[key].includes(idx)))
   addGroundEquip({eq,x:lx[0],y:lx[1],ttl:null,ck:key,idx,uid:++uid,spawnT:gameT});
 }
 const er=hash2(cx,cy,seed+401);
 let ec=(cx===0&&cy===0)?0:(er<0.25?1:(er<0.33?2:0));
 const center=ch.biome[CH*CH/2+CH/2];
 for(let i=0;i<ec;i++){
  const r2=chunkRng(cx,cy,402+i);
  const k2=r2();let kind='slime';
  if(center===B_ROCK)kind=k2<0.4?'golem':(k2<0.7?'bat':'wolf');
  else if(center===B_FOREST)kind=k2<0.4?'wolf':(k2<0.7?'spider':'slime');
  else if(center===B_MEADOW)kind=k2<0.85?'slime':'spider';
  const ex=(cx*CH+Math.floor(r2()*CH))*TILE+8,ey=(cy*CH+Math.floor(r2()*CH))*TILE+8;
  if(biomeAt(Math.floor(ex/TILE),Math.floor(ey/TILE))===B_WATER)continue;
  const info=ENEMY_INFO[kind];
  ch.enemies.push({type:kind,x:ex,y:ey,hp:info.hp,maxHp:info.hp,anim:Math.random()*10,
   wdir:rand(0,6.28),wt:rand(1,4),kx:0,ky:0,flash:0,fx:1,alert:0,aggroed:false,isEnemy:true,_u:0});
 }
 if(hash2(cx,cy,seed+501)<0.17&&!(cx===0&&cy===0)){
  const r3=chunkRng(cx,cy,502);
  const isTrader=r3()<0.32;
  let nx,ny,ok=false;
  for(let a=0;a<6&&!ok;a++){
   nx=(cx*CH+Math.floor(r3()*CH))*TILE+8;ny=(cy*CH+Math.floor(r3()*CH))*TILE+8;
   if(biomeAt(Math.floor(nx/TILE),Math.floor(ny/TILE))!==B_WATER)ok=true}
  if(ok){
   const persona=isTrader?'trader':'wanderer';
   ch.npc={persona,x:nx,y:ny,id:key+':n',anim:Math.random()*10,bob:0};
  }}
 ch.mapColor=(center>=0&&center<=5)?center:2;
 return ch}
function campSafeLootPos(cx,cy,rng){
 for(let a=0;a<8;a++){
  const x=(cx*CH+Math.floor(rng()*CH))*TILE+8,y=(cy*CH+Math.floor(rng()*CH))*TILE+8;
  if(biomeAt(Math.floor(x/TILE),Math.floor(y/TILE))!==B_WATER&&!islandAt(x,y))return[x,y]}
 return[cx*CS+CS/2,cy*CS+CS/2]}

function updateRadius(){return clamp(Math.ceil(innerWidth/SCALE/CS/2)+1,2,4)}
function nearChunkList(r){
 const out=[];const pcx=Math.floor(player.x/CS),pcy=Math.floor(player.y/CS);
 for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){const c=chunks.get((pcx+i)+','+(pcy+j));if(c)out.push(c)}
 return out}
function activeNodes(){const r=updateRadius(),out=[];
 for(const c of nearChunkList(r))for(const n of c.nodes)if(!n.dead)out.push(n);return out}
function activeEnemies(){const r=updateRadius(),out=[];
 for(const c of nearChunkList(r))for(const e of c.enemies)out.push(e);return out}
function activeNpcs(){const out=[];for(const c of nearChunkList(1))if(c.npc)out.push(c.npc);return out}
function nearestEnterable(range){
 let best=null,bd=range;
 for(const n of nodeCache){
  if(!n.isNode||n.dead||n.looted)continue;
  if(n.type!=='cave'&&n.type!=='ruin')continue;
  const d=Math.hypot(n.x-player.x,n.y-player.y);
  if(d<bd){bd=d;best=n}}
 return best}
function nearestWarpRuin(range){
 let best=null,bd=range;
 for(const n of nodeCache){
  if(!n.isNode||n.type!=='ruin'||!n.looted)continue;
  const d=Math.hypot(n.x-player.x,n.y-player.y);
  if(d<bd){bd=d;best=n}}
 return best}
function findFishSpot(){
 let best=null,bd=46;
 const ptx=Math.floor(player.x/TILE),pty=Math.floor(player.y/TILE);
 for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
  const tx=ptx+dx,ty=pty+dy;
  if(biomeAt(tx,ty)!==B_WATER)continue;
  const wx=tx*TILE+TILE/2,wy=ty*TILE+TILE/2;
  const d=Math.hypot(wx-player.x,wy-player.y);
  if(d<bd){bd=d;best=[wx,wy]}}
 return best}

/* ---------- 충돌 ---------- */
function blockedAt(x,y){
 if(biomeAt(Math.floor((x-4)/TILE),Math.floor((y+5)/TILE))===B_WATER)return true;
 if(biomeAt(Math.floor((x+4)/TILE),Math.floor((y+5)/TILE))===B_WATER)return true;
 if(biomeAt(Math.floor(x/TILE),Math.floor((y+6)/TILE))===B_WATER)return true;
 for(const n of nodeCache){
  const r2=n.type==='tree'?42:(n.type==='cave'?144:100);
  const dx=x-n.x,dy=y-n.y;
  if(dx*dx+dy*dy<r2){
   const cdx=player.x-n.x,cdy=player.y-n.y;
   if(cdx*cdx+cdy*cdy<r2)continue;
   return true}}
 return false}
let nodeCache=[];
function tryMove(dx,dy){
 if(dx){const nx=player.x+dx;if(!blockedAt(nx,player.y))player.x=nx}
 if(dy){const ny=player.y+dy;if(!blockedAt(player.x,ny))player.y=ny}}

/* ================================================================
   스탯 계산
   ================================================================ */
function recalcStats(){
 const s={atk:1,spd:0,vit:0,stam:0,regen:0,range:0,luck:0};
 for(const eq of player.equip){if(!eq)continue;
  const base=equipBaseStats(eq);
  for(const k in base)s[k]+=base[k];
  for(const o of eq.opts)s[o.k]+=o.v}
 stats={...s,
  maxHp:30+s.vit+(player.lvl-1)*4, maxStam:100+s.stam+(player.lvl-1)*6,
  regen:12+s.regen+(player.lvl-1)*0.6, speed:70*(1+s.spd/100),
  atkRange:46+s.range, pickup:40+s.range, atk:Math.round(s.atk)};
 player.hp=Math.min(player.hp,stats.maxHp);
 player.stam=Math.min(player.stam,stats.maxStam);
 renderSlots();renderStatSum()}
function xpNeed(lv){return Math.floor(25*Math.pow(1.4,lv-1))}
function addXP(n){
 player.xp+=n;
 while(player.xp>=xpNeed(player.lvl)){
  player.xp-=xpNeed(player.lvl);player.lvl++;
  const oh=player.hp;recalcStats();player.hp=Math.min(stats.maxHp,oh+4);
  toast(t('toastLvup')(player.lvl));toast(t('toastLvup2'),'small');
  sfx('level');ringFx(player.x,player.y-8,'#f0c468');
  for(let i=0;i<14;i++)particles.push({x:player.x,y:player.y-10,vx:rand(-40,40),vy:rand(-80,-20),g:60,life:rand(.5,.9),max:.9,size:2,color:'#f0c468'})}
 renderXP()}

/* ================================================================
   전투 & 채집
   ================================================================ */
function findTarget(){
 const R=stats.atkRange;let best=null,bd=Infinity;
 for(const e of activeEnemies()){
  if(!e.isEnemy)continue;
  const einfo=ENEMY_INFO[e.type];if(!einfo)continue;
  const d=Math.hypot(e.x-player.x,e.y-player.y)-einfo.size-8;
  if(d<R&&d-40<bd){bd=d-40;best=e}}
 if(!best){for(const n of nodeCache){
  if(!n.isNode||n.type==='cave'||n.type==='ruin')continue;
  const info=NODE_INFO[n.type];if(!info)continue;
  const dx=n.x-player.x,dy=(n.y+info.hitY)-(player.y-6);
  const d=Math.hypot(dx,dy)-info.hitR;
  if(d<R&&d<bd){bd=d;best=n}}}
 return best}
function tryAttack(){
 if(player.atkCool>0||dlg||player.dead||paused||fishing||exp.sailing)return;
 player.atkCool=0.45;attackT=0.18;sfx('swing');
 const tg=findTarget();curTarget=tg;
 if(tg){
  const aimY=tg.isNode?tg.y-8:tg.y;
  attackDir=Math.atan2(aimY-(player.y-6),tg.x-player.x);
  player.face=tg.x<player.x?-1:1;
  attackWeapon= tg.isNode?firstIcon('pickaxe'):firstIcon('sword');
  if(tg.isNode)damageNode(tg,stats.atk);
  else damageEnemy(tg,stats.atk);
 }else{
  attackDir=player.face>0?0:Math.PI;attackWeapon=firstIcon('sword');
  let npc=null,bd=stats.atkRange+16;
  for(const n of activeNpcs()){const d=Math.hypot(n.x-player.x,n.y-player.y);if(d<bd){bd=d;npc=n}}
  if(npc&&gameT-lastNpcHintT>1.5){
   lastNpcHintT=gameT;
   floater(npc.x,npc.y-40,t('notEnemy'),'#e8e2cf');sfx('talk');return}
  const ent=nearestEnterable(stats.atkRange+24);
  if(ent&&gameT-lastCaveHintT>1.5){
   lastCaveHintT=gameT;
   floater(ent.x,ent.y-42,t(ent.type==='cave'?'notMine':'notInvest'),'#e8e2cf');sfx('talk')}}}
function firstIcon(base){
 for(const eq of player.equip)if(eq&&eq.base===base)return base;return null}

function damageNode(n,d){
 if(!n||!n.isNode||!NODE_INFO[n.type])return;
 if(n.type==='cave'||n.type==='ruin')return;
 n.hp-=d;n.shake=0.25;
 floater(n.x,n.y-24,'-'+d,'#f2e6c8');
 burst(n.x,n.y-10,n.type==='tree'?['#4c8449','#3a6b3f','#7a5533']:
  n.type==='bush'?['#4f8f49','#d8404a']:['#a0a098','#8d8a80',n.type==='iron'?'#d98a4a':'#8d8a80'],8);
 sfx('chop');camShake=Math.min(3,camShake+1);
 // The lesson advances when the drop reaches the bag, not on the first hit.
 if(n.hp<=0)breakNode(n)}
function breakNode(n){
 if(!n||!n.isNode||!NODE_INFO[n.type])return;
 n.dead=true;sfx('break');camShake=4;
 const info=NODE_INFO[n.type];
 addXP(info.xp);
 const cnt=info.drops[0]+Math.floor(Math.random()*(info.drops[1]-info.drops[0]+1));
 for(let i=0;i<cnt;i++)addGroundRes({res:info.res,x:n.x+rand(-3,3),y:n.y+rand(-2,2),
  vx:rand(-70,70),vy:rand(-70,70),t:0,magnet:false});
 burst(n.x,n.y-10,n.type==='tree'?['#4c8449','#2e5734','#7a5533']:n.type==='crystal'?['#8fe0cf','#a0a098']:['#a0a098','#6f6c63','#8d8a80'],16);
 if(n.type==='crystal')ringFx(n.x,n.y-8,'#8fe0cf');
 if(Math.random()<info.eqC+stats.luck*0.004)
  addGroundEquip({eq:makeEquip(Math.random,-1,lootContext(n.x,n.y,'gather')),x:n.x+rand(-8,8),y:n.y+rand(-6,6),ttl:null,uid:++uid,spawnT:gameT});
 if(!destroyed[n.chunkKey])destroyed[n.chunkKey]=[];
 destroyed[n.chunkKey].push(n.idx)}

function enterCave(n){
 if(!n||n.type!=='cave'||n.looted)return;
 n.looted=true;
 caveLooted.add(n.chunkKey+':'+n.idx);
 sfx('break');camShake=5;
 addXP(NODE_INFO.cave.xp);
 ringFx(n.x,n.y-10,'#8fe0cf');
 burst(n.x,n.y-10,['#8fe0cf','#8d8a80','#f0c468'],26);
 const cn=2+Math.floor(Math.random()*2);
 for(let i=0;i<cn;i++){
  addGroundRes({res:'crystal',x:n.x+rand(-12,12),y:n.y+rand(-4,8),vx:rand(-90,90),vy:rand(-90,40),t:0,magnet:false});
  addGroundRes({res:'iron',x:n.x+rand(-12,12),y:n.y+rand(-4,8),vx:rand(-90,90),vy:rand(-90,40),t:0,magnet:false})}
 const ck=chunks.get(n.chunkKey)||nearChunkList(1)[0];
 const bats=3+(Math.random()<0.5?1:0);
 if(ck)for(let i=0;i<bats;i++){const bx=n.x+rand(-16,16),by=n.y+rand(-14,8);ck.enemies.push({type:'bat',x:bx,y:by,
  hp:4,maxHp:4,anim:Math.random()*10,wdir:rand(0,6.28),wt:rand(1,3),kx:0,ky:0,flash:0,fx:1,
  alert:1,aggroed:true,isEnemy:true,originId:`${n.chunkKey}:cave:${n.idx}:bat:${i}`,homeX:bx,homeY:by,_u:0})}
 if(true)
  addGroundEquip({eq:makeEquip(Math.random,2,lootContext(n.x,n.y,'cave')),x:n.x+rand(-10,10),y:n.y+rand(-2,8),ttl:null,uid:++uid,spawnT:gameT});
 toast(t('caveToast'));
 questEvent('cave');
 saveGame()}

function investigateRuin(n){
 if(!n||n.type!=='ruin'||n.looted)return;
 n.looted=true;
 ruinDone.add(n.chunkKey+':'+n.idx);
 sfx('level');
 addXP(NODE_INFO.ruin.xp);
 ringFx(n.x,n.y-12,'#8fe0cf');
 burst(n.x,n.y-12,['#8fe0cf','#f0c468','#e8e2cf'],20);
 addGroundRes({res:'crystal',x:n.x+rand(-6,6),y:n.y+rand(0,6),vx:rand(-50,50),vy:rand(-50,20),t:0,magnet:false});
 const eq=makeEquip(Math.random,2,lootContext(n.x,n.y,'ruin'));
 addGroundEquip({eq,x:n.x+rand(-8,8),y:n.y+rand(-2,8),ttl:null,uid:++uid,spawnT:gameT});
 toast(t('ruinToast'));
 questEvent('ruin');
 saveGame()}

function damageEnemy(e,d){
 if(!e||!e.isEnemy||!ENEMY_INFO[e.type])return;
 e.hp-=d;e.flash=0.15;
 const dx=e.x-player.x,dy=e.y-player.y,dd=Math.hypot(dx,dy)||1;
 e.kx=dx/dd*140;e.ky=dy/dd*140;
 floater(e.x,e.y-20,'-'+d,'#f2e6c8');
 burst(e.x,e.y-6,['#c8564a','#e8e2cf'],6);
 sfx('hit');camShake=3;
 if(e.hp<=0){
  const info=enemyInfo(e);
  addXP(info.xp);
  burst(e.x,e.y-6,['#8d8a80','#c8564a','#e8e2cf'],14);
  sfx('break');
  const md=MOB_DROPS[e.type];
  if(md&&Math.random()<md.c){
   const cnt=md.min+Math.floor(Math.random()*(md.max-md.min+1));
   for(let i=0;i<cnt;i++)addGroundRes({res:md.res,x:e.x+rand(-4,4),y:e.y+rand(-4,4),
    vx:rand(-70,70),vy:rand(-70,70),t:0,magnet:false})}
  if(e.type==='gloomfang')addGroundRes({res:'nightFang',x:e.x+5,y:e.y,vx:rand(-45,45),vy:rand(-45,20),t:0,magnet:false});
  if(e.type==='ashbrute')addGroundRes({res:'nightCore',x:e.x+5,y:e.y,vx:rand(-45,45),vy:rand(-45,20),t:0,magnet:false});
  if(Math.random()<0.12+stats.luck*0.005)
   addGroundEquip({eq:makeEquip(Math.random,e.elite?2:-1,lootContext(e.homeX??e.x,e.homeY??e.y,e.elite?'elite':'enemy')),x:e.x+rand(-8,8),y:e.y+rand(-6,6),ttl:null,uid:++uid,spawnT:gameT});
  for(const c of nearChunkList(updateRadius())){const i=c.enemies.indexOf(e);if(i>=0){c.enemies.splice(i,1);break}}
  questEvent('kill',e.type)}}

function damagePlayer(dmg,fromX,fromY,sourceType='',cooldown=1){
 if(player.invuln>0||player.dead)return;
 if(window.DrifterSurvival?.isDarkspawn?.(sourceType)&&hasEffect('duskward'))dmg=Math.round(dmg*.7);
 player.hp-=dmg;player.invuln=cooldown;
 const dx=player.x-fromX,dy=player.y-fromY,dd=Math.hypot(dx,dy)||1;
 player.kbx=dx/dd*170;player.kby=dy/dd*170;
 sfx('hurt');camShake=6;
 $('dmgflash').style.opacity=1;setTimeout(()=>$('dmgflash').style.opacity=0,120);
 if(player.hp<=0)die()}
function die(){
 player.dead=true;exp.sailing=false;toast(t('toastDied'));
 if(fishing)cancelFishing();
 $('deathfade').style.opacity=1;
 setTimeout(()=>{
  for(const k of RES_KEYS)player.res[k]=Math.floor(player.res[k]*0.75);
  for(const k in player.fish)player.fish[k]=Math.floor(player.fish[k]*0.75);
  player.x=camp.x+14;player.y=camp.y+14;player.hp=stats.maxHp;player.stam=stats.maxStam;
  player.dead=false;player.invuln=2;player.kbx=player.kby=0;
  cam.x=player.x;cam.y=player.y;replaceState=null;closeInv();
  $('deathfade').style.opacity=0;
  toast(t('toastRevived'));renderRes();renderQuickbar();saveGame();
 },1700)}

/* ---------- 회복 ---------- */
function healPlayer(n){
 const before=player.hp;player.hp=Math.min(stats.maxHp,player.hp+n);
 const d=Math.round(player.hp-before);
 if(d>0){floater(player.x,player.y-26,'+'+d,'#8fd97a');
  burst(player.x,player.y-8,['#8fd97a','#4c8449'],8);sfx('res')}}
function useConsumable(k){
 if(player.dead||(paused&&!invOpen)||dlg)return;
 if(k==='berry'){if(player.res.berry<1){sfx('deny');return}player.res.berry--;healPlayer(4)}
 else if(k==='heal'){if(player.pots.heal<1){sfx('deny');return}player.pots.heal--;healPlayer(Math.round(stats.maxHp*0.4))}
 else if(k==='tea'){if(player.pots.tea<1){sfx('deny');return}player.pots.tea--;
  player.stam=stats.maxStam;player.exhausted=false;
  floater(player.x,player.y-26,'+ST','#f0c468');
  burst(player.x,player.y-8,['#f0c468','#f2e6c8'],8);sfx('res')}
 renderRes();renderQuickbar();if(invOpen)renderPanel();saveGame()}
function fishTotal(){let n=0;for(const k in player.fish)n+=player.fish[k];return n}
function eatFish(id){
 if(player.dead||(paused&&!invOpen)||dlg)return;
 if(!id){for(const k of FISH_ORDER)if((player.fish[k]||0)>0){id=k;break}}
 if(!id||!(player.fish[id]>0)){sfx('deny');return}
 player.fish[id]--;
 const f=FISH_INFO[id];
 healPlayer(f.heal);
 if(f.stam){player.stam=stats.maxStam;player.exhausted=false;
  floater(player.x,player.y-32,'+ST','#f0c468')}
 renderQuickbar();if(invOpen)renderPanel();saveGame()}

/* ================================================================
   낚시 시스템
   ================================================================ */
function rollFish(){
 const luck=(stats&&typeof stats.luck==='number'&&stats.luck)||0;
 let tot=0;const ws=[];
 for(const id in FISH_INFO){
  const f=FISH_INFO[id];
  let w=f.w;
  if(f.rare)w*=1+luck*0.05;
  ws.push([id,w]);tot+=w}
 let r=Math.random()*tot;
 for(const [id,w] of ws){r-=w;if(r<=0)return id}
 return 'minnow'}
function startFishing(spot){
 if(!spot||fishing||player.dead)return;
 fishing={bx:spot[0],by:spot[1],phase:'wait',t:rand(1.8,4.2),anim:0};
 player.face=spot[0]>player.x?1:-1;
 sfx('cast');
 particles.push({x:spot[0],y:spot[1],ring:true,life:.5,max:.5,size:2,color:'#bfe3ec'})}
function cancelFishing(quiet){
 if(!fishing)return;
 particles.push({x:fishing.bx,y:fishing.by,ring:true,life:.5,max:.5,size:2,color:'#bfe3ec'});
 if(!quiet)sfx('splash');
 fishing=null}
function updateFishing(dt,moving){
 if(!fishing)return;
 if(moving||attackHeld||player.dead){cancelFishing(true);return}
 fishing.anim+=dt;
 fishing.t-=dt;
 if(fishing.phase==='wait'){
  if(Math.random()<dt*1.4)
   particles.push({x:fishing.bx+rand(-3,3),y:fishing.by+rand(-2,2),ring:true,life:.7,max:.7,size:1,color:'#a5d8e4'});
  if(fishing.t<=0){
   fishing.phase='bite';fishing.t=0.9;
   sfx('splash');sfx('alert');
   burst(fishing.bx,fishing.by-2,['#bfe3ec','#e8e2cf'],5)}}
 else{
  if(Math.random()<dt*8)
   particles.push({x:fishing.bx+rand(-3,3),y:fishing.by+rand(-2,2),ring:true,life:.5,max:.5,size:2,color:'#bfe3ec'});
  if(fishing.t<=0){
   cancelFishing();
   toast(t('fishEscape'),'small');sfx('deny')}}}
function catchFish(){
 if(!fishing||fishing.phase!=='bite')return;
 const bx=fishing.bx,by=fishing.by;
 const id=rollFish();
 const f=FISH_INFO[id];
 fishing=null;
 sfx('splash');sfx('reel');
 burst(bx,by-3,['#bfe3ec','#e8e2cf','#8fc0d4'],10);
 particles.push({x:bx,y:by,ring:true,life:.6,max:.6,size:4,color:'#bfe3ec'});
 addXP(2);
 questEvent('fish');
 if(f.junk){
  toast(t('fishJunk'),'small');
  floater(bx,by-14,'…','#96a188');
  saveGame();return}
 player.fish[id]=(player.fish[id]||0)+1;
 floater(bx,by-14,'+1 '+f[LANG],'#bfe3ec');
 if(id==='carp'){
  addGroundEquip({eq:makeEquip(Math.random,2,lootContext(bx,by,'fish')),x:player.x+rand(-6,6),y:player.y+rand(2,8),ttl:null,uid:++uid,spawnT:gameT});
  toast(t('fishCarp'))}
 else if(f.rare)toast(f[LANG]+'!','small');
 renderQuickbar();if(invOpen)renderPanel();
 saveGame()}

/* ================================================================
   바닥 아이템
   ================================================================ */
function dropAtRandom(eq){
 const a=rand(0,6.28),d=rand(14,Math.max(16,stats.pickup-6));
 let x=player.x+Math.cos(a)*d,y=player.y+Math.sin(a)*d;
 if(biomeAt(Math.floor(x/TILE),Math.floor(y/TILE))===B_WATER){x=player.x+Math.cos(a)*8;y=player.y+Math.sin(a)*8}
 addGroundEquip({eq,x,y,ttl:30,uid:++uid,spawnT:gameT});
 sfx('drop')}
function updateGroundRes(dt){
 for(let i=groundRes.length-1;i>=0;i--){
  const r=groundRes[i];r.t+=dt;
  if(r.t>45){removeGroundRes(r);continue}
  if(!r.magnet){r.x+=r.vx*dt;r.y+=r.vy*dt;r.vx*=Math.max(0,1-6*dt);r.vy*=Math.max(0,1-6*dt)}
  const dx=player.x-r.x,dy=player.y-r.y,dd=Math.hypot(dx,dy);
  const radius=tut.active&&tutCur()==='gather'?Math.max(stats.pickup,100):stats.pickup;
  if(dd<radius)r.magnet=true;
  if(r.magnet&&dd>=9){const step=Math.min(dd-4,220*Math.max(0,dt));r.x+=dx/dd*step;r.y+=dy/dd*step}
  if(Math.hypot(player.x-r.x,player.y-r.y)<9){
   const collect=()=>{player.res[r.res]++;const firstGather=!exp.firstGatherDone;exp.firstGatherDone=true;renderRes(true);sfx('res');
    floater(player.x+rand(-6,6),player.y-30,'+1 '+RES_META[r.res][LANG],'#a9c7a0');
    questEvent('gather',r.res);removeGroundRes(r);
    if(tut.active&&tutCur()==='gather'){tut.gathered=true;tutStepDone('gather')}
    if(typeof noteCollected==='function')noteCollected(r.res,1);if(firstGather)saveGame()};
   if(!window.DrifterMultiplayer?.claimLoot?.(r,collect))collect()}}}
function removeGroundRes(item){const i=groundRes.indexOf(item);if(i>=0)groundRes.splice(i,1);window.DrifterMultiplayer?.removeLoot?.(item)}

function removeGround(g){
 const i=groundEquip.indexOf(g);if(i>=0)groundEquip.splice(i,1);
 window.DrifterMultiplayer?.removeLoot?.(g);
 if(g.ck){if(!looted[g.ck])looted[g.ck]=[];looted[g.ck].push(g.idx)}
 if(g.star){
  starActive=null;
  landmarks.delete('star');
  starT=rand(120,200);
  toast(t('starToast'));sfx('trade');
  questEvent('star')}
 saveGame()}
function updateNearEquip(){
 const list=[];
 for(const g of groundEquip){
  const d=Math.hypot(g.x-player.x,g.y-player.y);
  if(d<stats.pickup)list.push(g)}
 list.sort((a,b)=>((a.x-player.x)**2+(a.y-player.y)**2)-((b.x-player.x)**2+(b.y-player.y)**2));
 const sig=list.map(g=>g.uid).join(',');
 const changed=sig!==nearSig;
 if(changed){
  const nowUids=new Set(list.map(g=>g.uid));
  const newOne=[...nowUids].some(u=>!prevNearUids.has(u));
  if(newOne&&list.length&&!invOpen&&!dlg&&!replaceState&&!isCoarse())openInv('bag');
  prevNearUids=nowUids}
 nearItems=list;nearSig=sig;
 if(replaceState&&(!list.includes(replaceState.g)))exitReplace();
 const npcNear=activeNpcs().some(n=>Math.hypot(n.x-player.x,n.y-player.y)<64);
 const ent=nearestEnterable(stats.pickup+10);
 const wr=nearestWarpRuin(stats.pickup+10);
 const fs=fishing?null:findFishSpot();
 const show=(list.length||ent||wr||fs||fishing)&&!invOpen&&!dlg&&!player.dead;
 const ph=$('pickupHint');
 ph.style.display=show?'block':'none';
 if(show&&fishing)ph.textContent=fishing.phase==='bite'?t('fishReel'):t('fishWait');
 else if(show&&ent)ph.textContent=isCoarse()?
  t(ent.type==='cave'?'caveHintMob':'ruinHintMob'):
  t(ent.type==='cave'?'caveHintDesk':'ruinHintDesk');
 else if(show&&fs)ph.textContent=isCoarse()?t('fishCastMob'):t('fishCastDesk');
 else if(show&&wr)ph.textContent=isCoarse()?t('warpHintMob'):t('warpHintDesk');
 else if(show)ph.textContent=isCoarse()?t('hintPickMob'):t('hintPickDesk');
 $('btnUse').classList.toggle('hot',(show||(npcNear&&!dlg))&&!invOpen);
 if(invOpen&&changed)renderPanel()}

function tryEquipGround(g){
 if(window.DrifterMultiplayer?.isTransactionPending?.())return;
 if(!g||!groundEquip.includes(g)||Math.hypot(g.x-player.x,g.y-player.y)>=stats.pickup)return;
 const slot=player.equip.indexOf(null);
 if(slot>=0){
  const equip=()=>{player.equip[slot]=g.eq;removeGround(g);
   sfx('equip');recalcStats();renderPanel();saveGame()};
  if(!window.DrifterMultiplayer?.claimLoot?.(g,equip))equip();
 }else{
  replaceState={g,slot:-1};

  openInv('bag');
  if(secOpen)secOpen.equip=true;
  renderPanel();toast(t('toastFull'),'small')}}
function exitReplace(){replaceState=null;renderSlots();renderPanel()}
function doReplace(i){
 if(window.DrifterMultiplayer?.isTransactionPending?.())return;
 if(!replaceState||!groundEquip.includes(replaceState.g)||!Number.isInteger(i)||i<0||i>2)return;
 const target=replaceState.g;
 const equip=()=>{if(!replaceState||replaceState.g!==target)return;
  const old=player.equip[i];player.equip[i]=target.eq;removeGround(target);dropAtRandom(old);
  toast(t('toastDrop'),'small');sfx('equip');recalcStats();replaceState=null;renderSlots();renderPanel();saveGame()};
 if(!window.DrifterMultiplayer?.claimLoot?.(target,equip))equip()}
function dropEquip(i){
 if(window.DrifterMultiplayer?.isTransactionPending?.())return;
 const eq=player.equip[i];if(!eq)return;
 player.equip[i]=null;dropAtRandom(eq);
 toast(t('toastDrop'),'small');recalcStats();renderSlots();renderPanel();saveGame()}
function dropGroundItem(g){
 if(!g)return;
 const a=rand(0,6.28),dd=rand(14,Math.max(16,stats.pickup-6));
 g.x=player.x+Math.cos(a)*dd;g.y=player.y+Math.sin(a)*dd;g.ttl=30;
 window.DrifterMultiplayer?.publishLoot?.(g);
 toast(t('toastDrop'),'small');sfx('drop')}

function interact(){
 if(dlg){dlgAdvance();return}
 if(paused)return;
 if(fishing){
  if(fishing.phase==='bite')catchFish();
  else cancelFishing();
  return}
 let npc=null,bd=64;
 for(const n of activeNpcs()){const d=Math.hypot(n.x-player.x,n.y-player.y);if(d<bd){bd=d;npc=n}}
 if(npc){startDialog(npc);return}
 const ent=nearestEnterable(64);
 if(ent){if(ent.type==='cave')enterCave(ent);else investigateRuin(ent);return}
 const fs=findFishSpot();
 if(fs){startFishing(fs);return}
 if(nearestWarpRuin(64)){openMap();return}
 if(nearItems.length)openInv('bag')}

/* ================================================================
   대화 시스템
   ================================================================ */
function buildShop(){
 const shop=[];
 const fine=Math.random()<0.5;
 shop.push({kind:'equip',base:choice(BASE_KEYS),
  minOpts:fine?2:1,price:fine?{iron:3,fang:2}:{wood:4,stone:4},stock:1});
 const pool=[{kind:'heal',price:{jelly:2}},{kind:'tea',price:{berry:2,fang:1}},{kind:'berry6',price:{wood:3}}];
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
 shop.push({...pool[0],stock:-1},{...pool[1],stock:-1});
 return shop}
function startDialog(npc){
 closeInv();
 if(fishing)cancelFishing(true);
 const L=LANG;
 const pick=a=>DIALOG[a][L][Math.floor(Math.random()*DIALOG[a][L].length)];
 let lines,shop=null,hint=false;
 if(npc.persona==='trader'){
  lines=[pick('greet'),pick('trade')];
  shop=buildShop();
 }else{
  lines=[pick('greet'),pick('body'),pick('body')];
  if(Math.random()<0.35&&!giftedSet.has(npc.id)){hint=true;lines.push(DIALOG.hint[L][Math.floor(Math.random()*DIALOG.hint[L].length)])}
  else lines.push(pick('farewell'));
 }
 dlg={npc,lines,idx:0,typed:0,timer:null,hint,shop};
 sfx('talk');
 $('dlg').classList.add('show');
 $('dlg').scrollTop=0;
 $('dlgNext').style.display='none';
 $('dlgNext').textContent=t('next');
 $('dlg').querySelector('.dlgShop').innerHTML='';
 $('dlg').querySelector('.dlgBtns').innerHTML='';
 const nameTxt=npc.persona==='trader'?I18N[L].npcT:I18N[L].npcW;
 $('dlg').querySelector('.dlgName').textContent=nameTxt;
 typeLine()}
function typeLine(){
 const txt=dlg.lines[dlg.idx];dlg.typed=0;dlg.done=false;
 clearInterval(dlg.timer);
 const el=$('dlg').querySelector('.dlgText');el.textContent='';
 dlg.timer=setInterval(()=>{
  dlg.typed+=2;el.textContent=txt.slice(0,dlg.typed);
  if(dlg.typed>=txt.length){clearInterval(dlg.timer);dlg.done=true;lineEndUI()}
 },18)}
function lineEndUI(){
 const last=dlg.idx>=dlg.lines.length-1;
 if(last&&dlg.shop){showShopUI();return}
 $('dlgNext').textContent=last?t('end'):t('next');
 $('dlgNext').style.display='block'}
function dlgAdvance(){
 if(!dlg)return;
 if(!dlg.done){clearInterval(dlg.timer);
  $('dlg').querySelector('.dlgText').textContent=dlg.lines[dlg.idx];
  dlg.done=true;lineEndUI();return}
 if(dlg.idx<dlg.lines.length-1){
  dlg.idx++;sfx('talk');typeLine();
  $('dlgNext').style.display='none';return}
 endDialog()}
function showShopUI(){
 $('dlgNext').style.display='none';
 const box=$('dlg').querySelector('.dlgShop');
 let h='<div class="sectbtn" style="cursor:default"><span>'+t('shopT')+'</span>'
  +'<button class="warn" data-buy="close" style="padding:3px 10px;font-size:10px">'+t('btnClose')+'</button></div>';
 dlg.shop.forEach((it,i)=>{
  let nm,ic,desc;
  if(it.kind==='equip'){nm=BASES[it.base][LANG];ic=it.base;desc=t('shopOpt')(it.minOpts)}
  else if(it.kind==='heal'){nm=RECIPES[0][LANG];ic='potion';desc=RECIPES[0][LANG==='ko'?'dko':'den']}
  else if(it.kind==='tea'){nm=RECIPES[1][LANG];ic='tea';desc=RECIPES[1][LANG==='ko'?'dko':'den']}
  else{nm=t('berryPack');ic='berry';desc=t('berryPackD')}
  const sold=it.stock===0;
  h+='<div class="rrow"><span class="pico" data-ico="'+ic+'"></span>'
   +'<div class="pmain"><div class="pname">'+nm+'</div><div class="rdesc">'+desc+'</div>'
   +'<div>'+costHTML(it.price)+'</div></div>'
   +'<div class="pbtns"><button class="'+(sold?'':'acc')+'" data-buy="'+i+'" '+(sold?'disabled':'')+'>'
   +(sold?t('sold'):t('buy'))+'</button></div></div>'});
 box.innerHTML=h;
 box.scrollTop=0;
 injectIcons(box)}
function buyItem(i){
 if(!dlg)return;
 const it=dlg.shop[i];if(!it)return;
 if(it.stock===0||!canAfford(it.price)){sfx('deny');return}
 pay(it.price);
 if(it.kind==='equip'){
  it.stock=0;
  const eq=it.eq||makeEquipFixed(it.base,Math.random,it.minOpts,lootContext(dlg.npc.x,dlg.npc.y,'shop'));
  addGroundEquip({eq,x:player.x+rand(-8,8),y:player.y+rand(2,10),ttl:null,uid:++uid,spawnT:gameT});
  toast(t('buyToastG'))}
 else if(it.kind==='heal'){player.pots.heal++;toast(t('buyToast'))}
 else if(it.kind==='tea'){player.pots.tea++;toast(t('buyToast'))}
 else{player.res.berry+=6;toast(t('buyToast'))}
 sfx('trade');renderQuickbar();renderRes();showShopUI();saveGame()}
 $('dlg').querySelector('.dlgShop').addEventListener('click',e=>{
 const b=e.target.closest('[data-buy]');
 if(!b||!dlg)return;
 if(b.dataset.buy==='close'){endDialog();return}
 buyItem(+b.dataset.buy)});
function canAfford(cost){for(const k in cost)if(player.res[k]<cost[k])return false;return true}
function pay(cost){for(const k in cost)player.res[k]-=cost[k];renderRes()}
function endDialog(){
 if(!dlg)return;
 clearInterval(dlg.timer);
 if(dlg.hint&&!giftedSet.has(dlg.npc.id)){
  giftedSet.add(dlg.npc.id);
  const a=rand(0,6.28),d=rand(60,150);
  addGroundEquip({eq:makeEquip(Math.random,-1,lootContext(dlg.npc.x,dlg.npc.y,'gift')),x:dlg.npc.x+Math.cos(a)*d,y:dlg.npc.y+Math.sin(a)*d,
   ttl:null,uid:++uid,spawnT:gameT});
  sfx('trade')}
 dlg=null;$('dlg').classList.remove('show');
 $('dlg').querySelector('.dlgShop').innerHTML='';
 saveGame()}

/* ================================================================
   과업 시스템
   ================================================================ */
function genQuest(exclude){
 const kinds=['gather','kill','ruin','cave','star','fish'].filter(k=>!exclude.includes(k));
 const k=choice(kinds.length?kinds:['gather','kill','ruin','cave','star','fish']);
 if(k==='gather')return{type:'gather',res:choice(['wood','stone','iron','crystal']),need:6+Math.floor(Math.random()*8),prog:0};
 if(k==='kill')return{type:'kill',mob:choice(['slime','wolf','spider','golem']),need:3+Math.floor(Math.random()*3),prog:0};
 if(k==='fish')return{type:'fish',need:2+Math.floor(Math.random()*3),prog:0};
 return{type:k,need:1,prog:0}}
function initQuests(){
 const qs=[],used=[];
 for(let i=0;i<3;i++){const q=genQuest(used);used.push(q.type);qs.push(q)}
 return qs}
function qDesc(q){
 switch(q.type){
  case 'gather':return t('qGather')(RES_META[q.res][LANG],q.need);
  case 'kill':return t('qKill')(MOB_META[q.mob][LANG],q.need);
  case 'ruin':return t('qRuin');
  case 'cave':return t('qCave');
  case 'fish':return t('qFish')(q.need);
  default:return t('qStar')}}
function questEvent(type,arg){
 let changed=false;
 for(const q of quests){
  if(q.done)continue;
  if(q.type!==type)continue;
  if(q.type==='gather'&&q.res!==arg)continue;
  if(q.type==='kill'&&q.mob!==arg)continue;
  q.prog++;changed=true;
  if(q.prog>=q.need){
   const xp=15+q.need*4;
   addXP(xp);player.res.crystal+=2;
   toast(t('qDone')(xp));sfx('level');
   const others=quests.filter(x=>x!==q).map(x=>x.type);
   const nq=genQuest(others);
   delete q.res;delete q.mob;
   q.type=nq.type;q.need=nq.need;q.prog=0;q.done=false;
   if(nq.res)q.res=nq.res;
   if(nq.mob)q.mob=nq.mob}}
 if(changed&&invOpen)renderPanel()}

/* ================================================================
   별빛 파편
   ================================================================ */
function spawnStar(){
 for(let a=0;a<12;a++){
  const ang=rand(0,6.28),d=rand(320,680);
  const x=player.x+Math.cos(ang)*d,y=player.y+Math.sin(ang)*d;
  if(biomeAt(Math.floor(x/TILE),Math.floor(y/TILE))===B_WATER)continue;
  const eq=makeEquip(Math.random,3,lootContext(x,y,'star'));
  starActive={eq,x,y};
  addGroundEquip({eq,x,y,ttl:null,star:true,uid:++uid,spawnT:gameT});
  landmarks.set('star',{t:'star',x,y});
  toast(t('starFall'));sfx('level');
  ringFx(x,y-8,'#f2e6c8');
  burst(x,y-14,['#f2e6c8','#f0c468'],20);
  return}
 starT=30}

/* ================================================================
   발견 스캔
   ================================================================ */
function scanLandmarks(){
 const R=240;
 for(const n of nodeCache){
  if(!n.isNode||(n.type!=='cave'&&n.type!=='ruin'))continue;
  const key=n.chunkKey+':'+n.idx;
  if(landmarks.has(key))continue;
  if(Math.hypot(n.x-player.x,n.y-player.y)<R)
   landmarks.set(key,{t:n.type,x:n.x,y:n.y})}
 for(const p of activeNpcs()){
  if(landmarks.has(p.id))continue;
  if(Math.hypot(p.x-player.x,p.y-player.y)<R)
   landmarks.set(p.id,{t:p.persona==='trader'?'npcT':'npcW',x:p.x,y:p.y})}}
function trackExploration(){
 const bio=biomeAt(Math.floor(player.x/TILE),Math.floor(player.y/TILE));
 const bk=BIOME_KEY[bio];
 if(bk&&!seenBiomes.has(bk)){seenBiomes.add(bk);toast(t(bk),'small');sfx('talk')}
 const dc=Math.hypot(player.x-camp.x,player.y-camp.y);
 if(dc>farthest)farthest=dc}
function lmCounts(){
 let c=0,r=0;
 for(const l of landmarks.values()){
  if(l.t==='cave')c++;else if(l.t==='ruin')r++}
 return[c,r]}

/* ================================================================
   제작
   ================================================================ */
function craft(rIdx){
 const rec=RECIPES[rIdx];
 if(!canAfford(rec.cost)){sfx('deny');return}
 pay(rec.cost);
 if(rec.gives==='heal')player.pots.heal++;
 if(rec.gives==='tea')player.pots.tea++;
 sfx('trade');toast(t('toastCrafted'));
 renderQuickbar();renderPanel();saveGame()}
function craftGear(tierIdx){
 const tier=GEAR_TIERS[tierIdx];
 if(!canAfford(tier.cost)){sfx('deny');return}
 pay(tier.cost);
 const eq=makeEquipFixed(craftBase,Math.random,tier.minOpts);
 addGroundEquip({eq,x:player.x+rand(-8,8),y:player.y+rand(2,10),ttl:null,uid:++uid,spawnT:gameT});
 sfx('equip');toast(t('toastCrafted'));
 renderPanel();saveGame()}

/* ================================================================
   이펙트
   ================================================================ */
function burst(x,y,cols,n){
 for(let i=0;i<n;i++)particles.push({x,y,vx:rand(-70,70),vy:rand(-90,10),g:160,
  life:rand(.3,.7),max:.7,size:rand(1,2.5),color:cols[Math.floor(Math.random()*cols.length)]})}
function floater(x,y,txt,color){floaters.push({x,y,txt,color,t:0})}
function ringFx(x,y,color){particles.push({x,y,ring:true,life:.6,max:.6,size:6,color})}

/* ================================================================
   메인 업데이트
   ================================================================ */
function getMove(){
 let x=0,y=0;
 if(keys.KeyW||keys.ArrowUp)y-=1; if(keys.KeyS||keys.ArrowDown)y+=1;
 if(keys.KeyA||keys.ArrowLeft)x-=1; if(keys.KeyD||keys.ArrowRight)x+=1;
 if(joy.active){x=joy.dx;y=joy.dy}
 const l=Math.hypot(x,y);
 if(l>0.01){x/=l;y/=l}
 return{x,y}}
function isWalking(){const m=getMove();return m.x!==0||m.y!==0}

function update(dt){
 gameT+=dt;frameN++;
 const nodeCx=Math.floor(player.x/CS),nodeCy=Math.floor(player.y/CS),nodeRadius=updateRadius();
 if(gameT-nodeCacheAt>=0.2||nodeCx!==nodeCacheX||nodeCy!==nodeCacheY||nodeRadius!==nodeCacheRadius){
  nodeCache=activeNodes();nodeCacheAt=gameT;nodeCacheX=nodeCx;nodeCacheY=nodeCy;nodeCacheRadius=nodeRadius}
 if(gameT-landmarkScanAt>=0.25){landmarkScanAt=gameT;scanLandmarks()}
 if(gameT-explorationScanAt>=0.25){explorationScanAt=gameT;trackExploration()}
 if(!starActive){starT-=dt;if(starT<=0)spawnStar()}
 const mv=dlg||player.dead?{x:0,y:0}:getMove();
 const moving=mv.x!==0||mv.y!==0;
 tutTrackMove(dt,moving);
 updateFishing(dt,moving);
 if(player.exhausted&&player.stam>=25)player.exhausted=false;
 let spd=stats.speed;
 if(hasEffect('nightstep')&&window.DrifterSurvival?.isNight?.())spd*=1.2;
 if(player.exhausted)spd*=0.85;
 const wading=biomeAt(Math.floor(player.x/TILE),Math.floor((player.y+4)/TILE))===B_SHALLOW;
 if(wading&&!hasEffect('wader')&&!exp.sailing)spd*=0.55;
 if(exp.sailing)spd*=1.35;
 const wantRun=runHeld&&moving;
 const running=wantRun&&!player.exhausted&&player.stam>0&&!exp.sailing;
 if(running){spd*=1.75;player.stam-=20*dt;
  if(player.stam<=0){player.stam=0;player.exhausted=true}
  if(!wading&&Math.random()<dt*12)particles.push({x:player.x+rand(-4,4),y:player.y+2,vx:rand(-14,14),vy:rand(-8,4),g:30,life:.4,max:.4,size:1.5,color:'#b7a687'});
 }else player.stam=Math.min(stats.maxStam,player.stam+stats.regen*(moving?0.55:1)*dt);
 if(Math.abs(player.kbx)>2||Math.abs(player.kby)>2){
  tryMove(player.kbx*dt,player.kby*dt);
  player.kbx*=Math.max(0,1-8*dt);player.kby*=Math.max(0,1-8*dt)}
 if(moving){
  tryMove(mv.x*spd*dt,mv.y*spd*dt);
  player.phase+=dt*spd/26;
  if(Math.abs(mv.x)>0.1)player.face=mv.x>0?1:-1;
  if(wading){if(Math.random()<dt*10)particles.push({x:player.x+rand(-5,5),y:player.y+2,vx:rand(-8,8),vy:rand(-12,-3),g:40,life:.4,max:.4,size:1,color:'#cdeef5'})}
  else if(Math.random()<dt*4)particles.push({x:player.x+rand(-5,5),y:player.y+3,vx:rand(-12,12),vy:rand(-24,-6),g:60,life:.5,max:.5,size:1,color:'#6f9a4d'})}
 if(attackHeld)tryAttack();
 player.atkCool=Math.max(0,player.atkCool-dt);
 attackT=Math.max(0,attackT-dt);
 player.invuln=Math.max(0,player.invuln-dt);
 enemySimBank+=dt;
 if(enemySimBank>=1/30){const enemyStep=Math.min(enemySimBank,0.1);enemySimBank=0;updateEnemies(enemyStep)}
 for(const n of activeNpcs()){n.bob+=dt;n.anim+=dt}
 updateGroundRes(dt);
 updateNearEquip();
 /* 튜토리얼: 줍기/착용 단계 자동 감시 */
 if(tut.active){
  const k=tutCur();
  if(k==='pickup'){
   const gotRes=(player.res.wood+player.res.stone+player.res.iron+player.res.berry)>0;
   if(nearItems.length>0||gotRes)tutStepDone('pickup')}
  else if(k==='equip'){
   const c=player.equip.filter(e=>e).length;
   if(c>tut.equippedCount)tutStepDone('equip')}}
 for(let i=groundEquip.length-1;i>=0;i--){
  const g=groundEquip[i];
  if(g.ttl!==null){g.ttl-=dt;
   if(g.ttl<=0){burst(g.x,g.y-6,['#e8e2cf','#96a188'],6);
    toast(t('toastVanish'),'small');groundEquip.splice(i,1);window.DrifterMultiplayer?.removeLoot?.(g)}}}
 for(const n of nodeCache)if(n.shake>0)n.shake-=dt;
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;
  if(p.life<=0){particles.splice(i,1);continue}
  if(!p.ring){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.g||0)*dt}}
 for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.t+=dt/0.8;f.y-=24*dt;
  if(f.t>=1)floaters.splice(i,1)}
 if(ambient.length<9&&Math.random()<dt*2)
  ambient.push({x:cam.x+rand(-300,300),y:cam.y+rand(-200,200),ph:rand(0,9),life:rand(6,12)});
 for(let i=ambient.length-1;i>=0;i--){const a=ambient[i];a.life-=dt;a.x+=9*dt;a.y+=Math.sin(gameT*1.5+a.ph)*4*dt;
  if(a.life<=0||Math.abs(a.x-cam.x)>360||Math.abs(a.y-cam.y)>260)ambient.splice(i,1)}
 const vis=viewChunks();
 for(const c of vis){if(!c.water.length)continue;
  if(Math.random()<dt*1.5){const w=c.water[Math.floor(Math.random()*c.water.length)];
   particles.push({x:w[0]*TILE+rand(2,14),y:w[1]*TILE+rand(2,14),vx:0,vy:0,g:0,life:.7,max:.7,size:1,color:'#bfe3ec'})}}
 if(Math.random()<dt*9)
  particles.push({x:camp.x+rand(-3,3),y:camp.y-8,vx:rand(-5,5),vy:rand(-38,-18),g:-30,life:rand(.3,.6),max:.6,size:rand(1.5,2.5),
   color:Math.random()<0.5?'#e8933c':'#f2c05a'});
 cam.x+=(player.x-cam.x)*Math.min(1,dt*5);
 cam.y+=(player.y-cam.y)*Math.min(1,dt*5);
 camShake=Math.max(0,camShake-dt*14);
 const pcx=Math.floor(player.x/CS),pcy=Math.floor(player.y/CS);
 for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
  const key=(pcx+i)+','+(pcy+j);
  if(!explored.has(key)){const c=chunks.get(key);explored.set(key,(c&&c.mapColor!=null)?c.mapColor:2)}}
 saveTimer+=dt;if(saveTimer>5){saveTimer=0;saveGame()}}

function updateEnemies(dt){
 if(dlg||player.dead)return;
 for(const c of nearChunkList(updateRadius())){
  for(let i=c.enemies.length-1;i>=0;i--){
   const e=c.enemies[i];
   if(!e.isEnemy)continue;
   if(window.DrifterMultiplayer?.shouldSimulateEnemy&&!window.DrifterMultiplayer.shouldSimulateEnemy(e))continue;
   if(e._u===frameN)continue;
   e._u=frameN;
   const info=enemyInfo(e);if(!info)continue;
   e.anim+=dt;e.flash=Math.max(0,e.flash-dt);
   if(e.alert>0)e.alert-=dt;
   const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy);
   if(!e.aggroed&&info.aggro>0&&d<info.aggro){e.aggroed=true;e.alert=0.9;sfx('alert')}
   else if(e.aggroed&&d>info.aggro*1.8)e.aggroed=false;
   let vx=0,vy=0;
   if(e.aggroed){
    if(d>0.5){
     vx=dx/d*info.speed;vy=dy/d*info.speed;
     if(e.type==='bat'){const wob=Math.sin(e.anim*7)*55;vx+=-dy/d*wob;vy+=dx/d*wob}
     e.fx=dx>0?1:-1}
   }else{
    e.wt-=dt;if(e.wt<=0){e.wdir=rand(0,6.28);e.wt=rand(1.5,3.5)}
    vx=Math.cos(e.wdir)*info.speed*0.6;vy=Math.sin(e.wdir)*info.speed*0.6;
    if(Math.abs(vx)>2)e.fx=vx>0?1:-1}
   const flies=e.type==='bat';
   let nx=e.x+(vx+e.kx)*dt,ny=e.y+(vy+e.ky)*dt;
   if(window.DrifterSurvival?.isDarkspawn?.(e)){const dx=nx-256,dy=ny-256,darkDist=Math.hypot(dx,dy),minDist=(window.DrifterSurvival.fireRadius()||112)+info.size+4;if(darkDist<minDist){const angle=darkDist?Math.atan2(dy,dx):0;nx=256+Math.cos(angle)*minDist;ny=256+Math.sin(angle)*minDist}}
   if(flies||biomeAt(Math.floor(nx/TILE),Math.floor(ny/TILE))!==B_WATER){e.x=nx;e.y=ny}
   else e.wdir=rand(0,6.28);
   e.kx*=Math.max(0,1-8*dt);e.ky*=Math.max(0,1-8*dt);
   if(d<info.size+10&&gameT>=(e._attackAt||0)){const cooldown=info.attackCooldown||1;e._attackAt=gameT+cooldown;damagePlayer(info.dmg,e.x,e.y,e.type,cooldown)}
   const ecx=Math.floor(e.x/CS),ecy=Math.floor(e.y/CS);
   if(ecx!==c.cx||ecy!==c.cy){
    c.enemies.splice(i,1);
    getChunk(ecx,ecy).enemies.push(e)}}}}

function viewChunks(){
 const vw=innerWidth/SCALE,vh=innerHeight/SCALE,out=[];
 const x0=Math.floor((cam.x-vw/2-16)/CS),x1=Math.floor((cam.x+vw/2+16)/CS);
 const y0=Math.floor((cam.y-vh/2-16)/CS),y1=Math.floor((cam.y+vh/2+16)/CS);
 for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++)out.push(getChunk(cx,cy));
 return out}

/* ================================================================
   렌더링
   ================================================================ */
const cv=$('cv'),ctx=cv.getContext('2d');
let dpr=1;
function resize(){dpr=Math.min(1.5,window.devicePixelRatio||1);
 cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;
 if(mapOpen){sizeBigMap();drawBigMap()}}
addEventListener('resize',resize);resize();

function render(){
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle='#0a0d0a';ctx.fillRect(0,0,cv.width/dpr,cv.height/dpr);
 const shx=camShake?rand(-camShake,camShake):0,shy=camShake?rand(-camShake,camShake):0;
 ctx.setTransform(SCALE*dpr,0,0,SCALE*dpr,
  cv.width/2-(cam.x+shx)*SCALE*dpr,cv.height/2-(cam.y+shy)*SCALE*dpr);
 ctx.imageSmoothingEnabled=false;
 const vis=viewChunks();
 let built=0;
 const budget=3;
 for(const c of vis){
  let cvt=terrainLRU.get(c.key);
  if(cvt){terrainLRU.delete(c.key);terrainLRU.set(c.key,cvt)}
  else if(built<budget){
   cvt=buildTerrain(c);
   terrainLRU.set(c.key,cvt);
   if(terrainLRU.size>48){const old=terrainLRU.keys().next().value;terrainLRU.delete(old)}
   built++}
  else continue;
  ctx.drawImage(cvt,c.cx*CS,c.cy*CS)}
 terrainFullRebuild=false;

 for(const g of groundEquip){
  if(Math.abs(g.x-cam.x)>innerWidth/SCALE/2+30||Math.abs(g.y-cam.y)>innerHeight/SCALE/2+30)continue;
  const bob=Math.sin(gameT*3+g.uid)*1.5;
  if(g.ttl!==null&&g.ttl<5&&Math.floor(gameT*4)%2===0)continue;
  shadow(g.x,g.y+2,8,3);
  if(g.star){
   const pu=0.4+Math.sin(gameT*4)*0.3;
   ctx.strokeStyle='rgba(242,230,200,'+pu+')';ctx.lineWidth=1.5;
   ctx.beginPath();ctx.arc(g.x,g.y-10,12+Math.sin(gameT*4)*3,0,6.29);ctx.stroke();
   ctx.strokeStyle='rgba(240,196,104,'+pu*0.6+')';
   ctx.beginPath();ctx.arc(g.x,g.y-10,20+Math.sin(gameT*4)*4,0,6.29);ctx.stroke();
   ctx.drawImage(iconSrc('star'),Math.round(g.x-8),Math.round(g.y-18+bob),16,16)}
  else{
   ctx.drawImage(iconSrc(BASES[g.eq.base]?g.eq.base:'stone'),Math.round(g.x-8),Math.round(g.y-16+bob),16,16);
   const age=gameT-(g.spawnT||0);
   if(age<2){ctx.strokeStyle='rgba(240,196,104,'+(1-age/2)*0.8+')';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(g.x,g.y-8,10+age*10,0,6.29);ctx.stroke()}}
  if(!paused&&!document.hidden&&!backgroundSuspended&&g.star&&Math.random()<0.06)particles.push({x:g.x+rand(-8,8),y:g.y-12+rand(-6,6),vx:0,vy:-10,g:0,life:.8,max:.8,size:1,color:'#f2e6c8'});
  else if(!paused&&!document.hidden&&!backgroundSuspended&&!g.star&&Math.random()<0.02)particles.push({x:g.x+rand(-7,7),y:g.y-8+rand(-6,6),vx:0,vy:-8,g:0,life:.5,max:.5,size:1,color:'#f0c468'})}
 for(const r of groundRes)drawResSprite(r);

 const draws=[];
 for(const c of vis){
  for(const n of c.nodes)draws.push(n);
  for(const e of c.enemies)draws.push(e);
  if(c.npc)draws.push(c.npc)}
 draws.push({y:camp.y,isCamp:true});
 if(!player.dead)draws.push({y:player.y,isPlayer:true});
 for(const actor of window.DrifterMultiplayer?.remotePlayers?.()||[]){
  if(Math.abs(actor.x-cam.x)<innerWidth/SCALE/2+40&&Math.abs(actor.y-cam.y)<innerHeight/SCALE/2+40)draws.push({y:actor.y,isRemote:true,actor})}
 draws.sort((a,b)=>a.y-b.y);
 for(const d of draws){
  ctx.globalAlpha=1;
  if(d.isPlayer)drawPlayer();
  else if(d.isRemote){drawPlayer(d.actor,true);ctx.globalAlpha=1;ctx.font='10px Galmuri11, sans-serif';ctx.textAlign='center';ctx.fillStyle='#f0ce91';ctx.fillText(d.actor.nickname||'Drifter',Math.round(d.actor.x),Math.round(d.actor.y-28));ctx.fillStyle='#17231b';ctx.fillRect(Math.round(d.actor.x-12),Math.round(d.actor.y-24),24,3);ctx.fillStyle='#9dba8d';ctx.fillRect(Math.round(d.actor.x-12),Math.round(d.actor.y-24),24*Math.max(0,Math.min(1,d.actor.hp/(d.actor.maxHp||30))),3)}
  else if(d.isCamp)drawCamp();
  else if(d.isNode)drawNode(d);
  else if(d.isEnemy)drawEnemy(d);
  else drawNpc(d)}

 if(fishing){
  const hx=player.x+player.face*5,hy=player.y-13;
  ctx.strokeStyle='#7a5c33';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+player.face*9,hy-9);ctx.stroke();
  ctx.strokeStyle='rgba(232,226,207,.55)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(hx+player.face*9,hy-9);ctx.lineTo(fishing.bx,fishing.by-3);ctx.stroke();
  const dip=fishing.phase==='bite'?2:Math.sin(fishing.anim*3)*1;
  ctx.fillStyle='#d8404a';ctx.fillRect(Math.round(fishing.bx)-2,Math.round(fishing.by)-4+dip,4,3);
  ctx.fillStyle='#e8e2cf';ctx.fillRect(Math.round(fishing.bx)-2,Math.round(fishing.by)-6+dip,4,2);
  if(fishing.phase==='bite'){
   const b=Math.abs(Math.sin(gameT*10))*2;
   ctx.fillStyle='#f0c468';
   ctx.fillRect(Math.round(fishing.bx)-1,Math.round(fishing.by)-17-b,3,6);
   ctx.fillRect(Math.round(fishing.bx),Math.round(fishing.by)-10-b,1,1)}}

 if(dlg||player.dead||paused||fishing){curTarget=null;targetScanAt=gameT}
 else if(gameT-targetScanAt>=0.1){curTarget=findTarget();targetScanAt=gameT}
 if(curTarget){
  let rx=curTarget.x,ry=curTarget.y,rr=12;
  if(curTarget.isNode){const info=NODE_INFO[curTarget.type]||{hitY:-6,hitR:10};
   ry=curTarget.y+info.hitY;rr=info.hitR+4}
  else if(curTarget.isEnemy){const ei=ENEMY_INFO[curTarget.type];rr=(ei?ei.size:10)+6}
  const resource=curTarget.isNode?NODE_INFO[curTarget.type]?.res:null;
  ctx.save();ctx.globalAlpha=.88+.12*Math.sin(gameT*6);
  ctx.strokeStyle=curTarget.isEnemy?'#f09b84':'#f0c468';ctx.lineWidth=1.6;
  ctx.setLineDash([4,2]);ctx.lineDashOffset=-gameT*14;
  ctx.beginPath();ctx.arc(rx,ry,rr+2,0,6.29);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(rx,ry,rr-1,0,6.29);ctx.stroke();
  if(resource&&RES_META[resource]){
   const label=RES_META[resource][LANG];ctx.font='6px Galmuri11, sans-serif';
   const textWidth=ctx.measureText(label).width;
   const boxW=textWidth+14,boxH=11,bx=Math.round(rx-boxW/2),by=Math.round(ry-rr-15);
   ctx.fillStyle='rgba(8,14,10,.94)';ctx.fillRect(bx,by,boxW,boxH);
   ctx.strokeStyle='#d8a03c';ctx.lineWidth=.7;ctx.strokeRect(bx,by,boxW,boxH);
   ctx.drawImage(iconSrc(resource),bx+2,by+2,7,7);
   ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#fff0c4';ctx.fillText(label,bx+11,by+boxH/2);
  }
  ctx.restore()}

 if(attackT>0){
  const a=attackT/0.18;
  ctx.globalAlpha=a*0.85;
  ctx.strokeStyle='#f2e6c8';ctx.lineWidth=2.5;
  ctx.beginPath();ctx.arc(player.x,player.y-5,stats.atkRange*0.72,attackDir-0.85,attackDir+0.85);ctx.stroke();
  if(attackWeapon){
   const r=stats.atkRange*0.72+4;
   ctx.save();ctx.translate(player.x+Math.cos(attackDir)*r,player.y-5+Math.sin(attackDir)*r);
   ctx.rotate(attackDir+(1-a)*1.6-0.6);
   ctx.drawImage(iconSrc(attackWeapon),-8,-8,16,16);ctx.restore()}
  ctx.globalAlpha=1}

 for(const a of ambient){ctx.globalAlpha=0.35;ctx.fillStyle='#e8e2cf';
  ctx.fillRect(a.x,a.y,1.5,1.5);ctx.globalAlpha=1}
 for(const p of particles){
  const a=p.life/p.max;
  if(p.ring){ctx.strokeStyle=p.color;ctx.globalAlpha=a;ctx.lineWidth=1.5;
   ctx.beginPath();ctx.arc(p.x,p.y,p.size+(1-a)*22,0,6.29);ctx.stroke()}
  else{ctx.globalAlpha=a;ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size)}
  ctx.globalAlpha=1}
 ctx.font='11px Galmuri11, sans-serif';ctx.textAlign='center';
 for(const f of floaters){ctx.globalAlpha=1-f.t;ctx.fillStyle=f.color;
  ctx.fillText(f.txt,Math.round(f.x),Math.round(f.y))}
 ctx.globalAlpha=1}

/* ---------- 스프라이트 ---------- */
function shadow(x,y,rx,ry){ctx.fillStyle='rgba(10,14,10,.3)';
 ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,6.29);ctx.fill()}
function drawPlayer(actor=player,remote=false){
 ctx.globalAlpha=1;
 const x=Math.round(actor.x),y=Math.round(actor.y);
 const walking=remote?!!actor.moving:isWalking()&&!dlg&&!player.dead&&!fishing;
 const sw=walking?Math.sin(actor.phase*9)*2.2:0;
 if(actor.invuln>0&&Math.floor(gameT*10)%2===0)ctx.globalAlpha=0.35;
 shadow(x,y+2,7,3);
 ctx.fillStyle='#4a3626';
 ctx.fillRect(Math.round(x-4+sw),y-5,3,5);
 ctx.fillRect(Math.round(x+1-sw),y-5,3,5);
 ctx.fillStyle='#5a6d44';ctx.fillRect(x-5,y-12,10,8);
 ctx.fillStyle='#6d8054';ctx.fillRect(x-5,y-12,10,2);
 ctx.fillStyle='#d8a03c';ctx.fillRect(x-5,y-13,10,2);
 ctx.fillStyle='#3a2f22';ctx.fillRect(x-6,y-7,12,2);
 ctx.fillStyle='#e7c9a3';ctx.fillRect(x-4,y-19,8,7);
 ctx.fillStyle='#4a3626';ctx.fillRect(x-4,y-19,8,3);ctx.fillRect(x-4,y-16,1,3);ctx.fillRect(x+3,y-16,1,3);
 ctx.fillStyle='#1a140d';
 const eo=actor.face>0?1:-1;
 ctx.fillRect(x-3+eo,y-15,2,2);ctx.fillRect(x+1+eo,y-15,2,2);
 ctx.globalAlpha=1}
function drawNode(n){
 const info=NODE_INFO[n.type];if(!info)return;
 const x=Math.round(n.x),y=Math.round(n.y);
 if(n.dead){
  if(n.type==='tree'){
   shadow(x,y+1,5,2);
   ctx.fillStyle='#5c4326';ctx.fillRect(x-3,y-4,6,4);
   ctx.fillStyle='#7a5533';ctx.fillRect(x-3,y-4,6,1);
  }else if(n.type==='bush'){
   ctx.fillStyle='#5c4326';ctx.fillRect(x-3,y-3,2,3);ctx.fillRect(x+1,y-2,2,2);
  }else if(n.type==='cave'){
   shadow(x,y+1,22,4);
   ctx.fillStyle='#78756c';ctx.fillRect(x-22,y-9,44,9);
   ctx.fillStyle='#84817a';ctx.fillRect(x-15,y-14,30,5);ctx.fillRect(x-7,y-17,14,3);
   ctx.fillStyle='#66635c';ctx.fillRect(x-12,y-8,3,4);ctx.fillRect(x+8,y-6,3,3);
   ctx.fillStyle='#0b0d0a';ctx.fillRect(x-5,y-5,10,5);
   ctx.fillStyle='#8fe0cf';ctx.fillRect(x+9,y-8,2,2);
   ctx.fillStyle='#4f7c41';ctx.fillRect(x-19,y-4,6,2);
  }else if(n.type==='ruin'){
   ctx.fillStyle='#6f7a72';ctx.fillRect(x-2,y-8,4,8);
   ctx.fillStyle='#7c756a';
   ctx.fillRect(x-9,y-2,4,3);ctx.fillRect(x+6,y-3,4,3);ctx.fillRect(x-5,y-1,3,2);
  }else{
   ctx.fillStyle='#7c756a';
   ctx.fillRect(x-5,y-3,4,3);ctx.fillRect(x+1,y-2,4,2);ctx.fillRect(x-1,y-1,3,2);
   if(n.type==='iron'){ctx.fillStyle='#d98a4a';ctx.fillRect(x-1,y-2,2,2)}
   if(n.type==='crystal'){ctx.fillStyle='#8fe0cf';ctx.fillRect(x+1,y-2,2,2)}
  }
  return}
 const ox=n.shake>0?Math.sin(n.shake*60)*2*(n.shake/0.25):0;
 const sx=Math.round(n.x+ox);
 if(n.type==='tree'){
  const v=hash2(Math.floor(n.x),Math.floor(n.y),seed+77);
  const s=0.85+v*0.35;
  shadow(sx,y+1,7,2.5);
  ctx.fillStyle='#6b4a2e';ctx.fillRect(sx-2,y-6,4,7);
  const w1=Math.round(5*s),w2=Math.round(8*s),w3=Math.round(11*s);
  ctx.fillStyle='#2c5433';ctx.fillRect(sx-w1,y-Math.round(23*s),w1*2,Math.round(6*s));
  ctx.fillStyle='#376a3d';ctx.fillRect(sx-w2,y-Math.round(17*s),w2*2,Math.round(7*s));
  ctx.fillStyle='#336239';ctx.fillRect(sx-w3,y-Math.round(11*s),w3*2,Math.round(7*s));
  ctx.fillStyle='#4c8449';
  ctx.fillRect(sx-Math.round(w3*0.5),y-Math.round(9*s),2,2);
  ctx.fillRect(sx+Math.round(w1*0.4),y-Math.round(15*s),2,2);
 }else if(n.type==='bush'){
  shadow(sx,y+1,7,2.5);
  ctx.fillStyle='#3f7a3c';ctx.fillRect(sx-6,y-7,12,6);
  ctx.fillStyle='#4f8f49';ctx.fillRect(sx-5,y-9,10,3);
  ctx.fillStyle='#d8404a';
  ctx.fillRect(sx-4,y-6,2,2);ctx.fillRect(sx+1,y-8,2,2);ctx.fillRect(sx+3,y-4,2,2);
 }else if(n.type==='cave'){
  const dep=n.looted;
  shadow(sx,y+1,26,5);
  ctx.fillStyle='#78756c';ctx.fillRect(sx-26,y-19,52,19);
  ctx.fillStyle='#84817a';ctx.fillRect(sx-22,y-25,44,7);
  ctx.fillStyle='#918e86';ctx.fillRect(sx-16,y-30,32,6);
  ctx.fillStyle='#9d9a92';ctx.fillRect(sx-9,y-33,18,4);
  ctx.fillStyle='#a8a59d';ctx.fillRect(sx-4,y-35,8,3);
  ctx.fillStyle='#66635c';ctx.fillRect(sx-20,y-12,3,9);ctx.fillRect(sx+11,y-15,3,10);ctx.fillRect(sx-3,y-27,2,6);
  ctx.fillStyle='#4f7c41';ctx.fillRect(sx-25,y-7,7,3);ctx.fillRect(sx+18,y-10,6,3);ctx.fillRect(sx-13,y-23,5,2);
  ctx.fillStyle='#151814';ctx.fillRect(sx-14,y-16,28,16);
  ctx.fillStyle='#0b0d0a';ctx.fillRect(sx-10,y-13,20,13);
  ctx.fillStyle='#8a877e';
  ctx.fillRect(sx-12,y-16,2,4);ctx.fillRect(sx-5,y-16,2,6);ctx.fillRect(sx+3,y-16,2,5);ctx.fillRect(sx+10,y-16,2,4);
  if(!dep){
   ctx.fillStyle='#8fe0cf';
   ctx.fillRect(sx-18,y-6,3,4);ctx.fillRect(sx+16,y-8,3,4);
   ctx.fillStyle='#e6fff9';ctx.fillRect(sx-18,y-6,1,1);ctx.fillRect(sx+16,y-8,1,1)}
  else{
   ctx.fillStyle='#6a675f';
   ctx.fillRect(sx-18,y-6,3,4);ctx.fillRect(sx+16,y-8,3,4)}
  if(!dep&&Math.sin(gameT*2.5+x*0.7)>-0.2){
   ctx.fillStyle='#d8a03c';ctx.fillRect(sx-5,y-9,2,2);ctx.fillRect(sx+3,y-9,2,2)}
 }else if(n.type==='ruin'){
  const active=n.looted;
  shadow(x,y+1,8,3);
  ctx.fillStyle='#7c756a';
  ctx.fillRect(x-11,y-2,4,3);ctx.fillRect(x+8,y-3,4,3);
  ctx.fillRect(x-7,y-1,3,2);ctx.fillRect(x+4,y-2,3,2);
  ctx.fillStyle='#6f7a72';ctx.fillRect(x-3,y-22,6,22);
  ctx.fillStyle='#7e8980';ctx.fillRect(x-3,y-22,2,22);
  ctx.fillStyle='#5c665e';ctx.fillRect(x-3,y-4,6,4);
  ctx.fillStyle='#8a958c';ctx.fillRect(x-4,y-25,8,3);
  ctx.fillStyle=active?'#f0c468':'#8fe0cf';
  ctx.fillRect(x-1,y-20,2,7);ctx.fillRect(x-1,y-10,2,2);
  if(active){
   if(!paused&&!document.hidden&&!backgroundSuspended&&Math.random()<0.04)particles.push({x:x+rand(-4,4),y:y-rand(6,20),vx:0,vy:-7,g:0,life:.7,max:.7,size:1,color:'#f0c468'})}
  else{
   if(!paused&&!document.hidden&&!backgroundSuspended&&Math.random()<0.03)particles.push({x:x+rand(-4,4),y:y-rand(6,20),vx:0,vy:-6,g:0,life:.6,max:.6,size:1,color:'#8fe0cf'})}
 }else{
  shadow(sx,y+1,9,3);
  ctx.fillStyle='#8d8a80';ctx.fillRect(sx-8,y-8,16,8);
  ctx.fillStyle='#9d9a90';ctx.fillRect(sx-6,y-11,12,4);
  ctx.fillStyle='#b5b2a8';ctx.fillRect(sx-4,y-10,3,2);
  ctx.fillStyle='#6f6c63';ctx.fillRect(sx+1,y-6,1,5);
  if(n.type==='iron'){ctx.fillStyle='#d98a4a';
   ctx.fillRect(sx-5,y-8,3,3);ctx.fillRect(sx+2,y-6,3,3);ctx.fillRect(sx-1,y-10,2,2)}
  if(n.type==='crystal'){
   ctx.fillStyle='#8fe0cf';
   ctx.beginPath();ctx.moveTo(sx,y-18);ctx.lineTo(sx+4,y-12);ctx.lineTo(sx,y-7);ctx.lineTo(sx-4,y-12);ctx.closePath();ctx.fill();
   ctx.beginPath();ctx.moveTo(sx+4,y-13);ctx.lineTo(sx+6,y-10);ctx.lineTo(sx+4,y-8);ctx.lineTo(sx+2,y-10.5);ctx.closePath();ctx.fill();
   ctx.fillStyle='#e6fff9';ctx.fillRect(sx-1,y-15,1,2)}}
 if(n.hp<n.maxHp){
  const topY=(n.type==='tree')?y-28:y-16;
  ctx.fillStyle='#141b14';ctx.fillRect(x-7,topY,14,2);
  ctx.fillStyle='#c8564a';ctx.fillRect(x-7,topY,Math.max(1,Math.round(n.hp/n.maxHp*14)),2)}}
function drawEnemy(e){
 ctx.globalAlpha=1;
 const info=ENEMY_INFO[e.type];if(!info)return;
 const x=Math.round(e.x),y=Math.round(e.y);
 if(e.flash>0)ctx.globalAlpha=0.6;
 if(e.type==='slime'){
  const q=Math.sin(e.anim*4)*1.5;
  shadow(x,y+1,7,2.5);
  ctx.fillStyle='#8fbf5a';ctx.beginPath();
  ctx.ellipse(x,y-4-q/2,(11+q)/2,(8-q)/2+2,0,0,6.29);ctx.fill();
  ctx.fillStyle='#6d9a41';ctx.fillRect(x-5,y-2,10,2);
  ctx.fillStyle='#fff';ctx.fillRect(x-3,y-7,2,2);ctx.fillRect(x+1,y-7,2,2);
  ctx.fillStyle='#1a140d';ctx.fillRect(x-3,y-6,1,1);ctx.fillRect(x+1,y-6,1,1);
 }else if(e.type==='wolf'){
  const st=Math.sin(e.anim*10)*1.5;const f=e.fx;
  shadow(x,y+1,9,3);
  ctx.fillStyle='#82827b';ctx.fillRect(x-6,y-7,12,5);
  const hx=f>0?x+5:x-11;
  ctx.fillRect(hx,y-9,6,5);
  ctx.fillStyle='#6d6d66';ctx.fillRect(hx+(f>0?0:4),y-11,2,2);ctx.fillRect(hx+(f>0?4:0),y-11,2,2);
  ctx.fillStyle='#82827b';ctx.fillRect(f>0?x-9:x+6,y-8,4,2);
  ctx.fillStyle='#5f5f59';
  ctx.fillRect(x-5,y-2,2,3+st);ctx.fillRect(x+3,y-2,2,3-st);
  ctx.fillStyle='#d8a03c';ctx.fillRect(hx+(f>0?4:1),y-8,1,1);
 }else if(e.type==='golem'){
  const bob=Math.sin(e.anim*3)>0?0:1;
  shadow(x,y+1,11,4);
  ctx.fillStyle='#6f6f68';ctx.fillRect(x-7,y-13-bob,14,13);
  ctx.fillStyle='#7b7b73';ctx.fillRect(x-4,y-18-bob,8,5);
  ctx.fillStyle='#5c5c55';ctx.fillRect(x-10,y-11-bob,3,7);ctx.fillRect(x+7,y-11-bob,3,7);
  ctx.fillStyle='#d8a03c';ctx.fillRect(x-2,y-17-bob,2,2);ctx.fillRect(x+1,y-17-bob,2,2);
  ctx.fillStyle='#565650';ctx.fillRect(x-5,y-9,3,1);ctx.fillRect(x+2,y-6,3,1);
 }else if(e.type==='spider'){
  const lg=Math.sin(e.anim*9)*2;
  shadow(x,y+1,8,2.5);
  ctx.fillStyle='#4a4a45';
  for(let i=0;i<3;i++){
   const lx=x-7+i*5, ph=i%2?lg:-lg;
   ctx.fillRect(lx,y-6+ph,2,4);ctx.fillRect(lx+2,y-3,2,3)}
  ctx.beginPath();ctx.ellipse(x,y-7,6,4.5,0,0,6.29);ctx.fill();
  ctx.fillStyle='#5c5c55';ctx.beginPath();ctx.ellipse(x+(e.fx>0?5:-5),y-6,3,2.5,0,0,6.29);ctx.fill();
  ctx.fillStyle='#d8404a';ctx.fillRect(x+(e.fx>0?6:-7),y-7,1,1);ctx.fillRect(x+(e.fx>0?7:-5),y-7,1,1);
 }else if(e.type==='darkling'){
  const pulse=Math.sin(e.anim*8)*1.5;shadow(x,y+2,7,2.5);
  ctx.fillStyle='#31243f';ctx.beginPath();ctx.arc(x,y-7,7+pulse*.25,0,6.29);ctx.fill();
  ctx.fillStyle='#704d91';ctx.beginPath();ctx.arc(x,y-7,5+pulse*.2,0,6.29);ctx.fill();
  ctx.fillStyle='#e5caff';ctx.fillRect(x-3,y-8,2,2);ctx.fillRect(x+2,y-8,2,2);
  ctx.fillStyle='#b891dd';ctx.fillRect(x-1,y-1,2,3);
 }else if(e.type==='gloomfang'){
  const f=e.fx,st=Math.sin(e.anim*10)*1.5;shadow(x,y+2,10,3);
  ctx.fillStyle='#31243f';ctx.fillRect(x-8,y-9,16,7);
  ctx.fillStyle='#553c70';ctx.fillRect(x-6,y-13,12,6);
  const hx=f>0?x+4:x-10;ctx.fillRect(hx,y-12,7,5);
  ctx.fillStyle='#805da3';ctx.fillRect(hx+(f>0?0:4),y-17,3,6);
  ctx.fillStyle='#ff6b7f';ctx.fillRect(hx+(f>0?4:1),y-11,2,2);
  ctx.fillStyle='#d9c3ed';ctx.fillRect(hx+(f>0?5:1),y-6,1,3);
  ctx.fillStyle='#332943';ctx.fillRect(x-6,y-3,3,4+st);ctx.fillRect(x+3,y-3,3,4-st);
 }else if(e.type==='ashbrute'){
  const bob=Math.sin(e.anim*3)>0?0:1;shadow(x,y+2,13,4);
  ctx.fillStyle='#28212e';ctx.fillRect(x-10,y-15-bob,20,15);
  ctx.fillStyle='#45324d';ctx.fillRect(x-7,y-21-bob,14,8);
  ctx.fillStyle='#9a5d66';ctx.beginPath();ctx.moveTo(x-8,y-18);ctx.lineTo(x-14,y-26);ctx.lineTo(x-4,y-21);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(x+8,y-18);ctx.lineTo(x+14,y-26);ctx.lineTo(x+4,y-21);ctx.closePath();ctx.fill();
  ctx.fillStyle='#ff9b55';ctx.fillRect(x-5,y-14,3,3);ctx.fillRect(x+3,y-14,3,3);
  ctx.fillStyle='#d36c4c';ctx.fillRect(x-8,y-4,5,5);ctx.fillRect(x+4,y-4,5,5);
 }else{
  const fl=Math.sin(e.anim*18)*4;
  shadow(x,y+2,5,2);
  ctx.fillStyle='#514e48';
  ctx.fillRect(x-3,y-12,6,4);
  ctx.fillStyle='#413e39';
  ctx.beginPath();ctx.moveTo(x-3,y-10);ctx.lineTo(x-10,y-12-fl);ctx.lineTo(x-3,y-7);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(x+3,y-10);ctx.lineTo(x+10,y-12-fl);ctx.lineTo(x+3,y-7);ctx.closePath();ctx.fill();
  ctx.fillStyle='#5c5952';ctx.fillRect(x-3,y-14,1,2);ctx.fillRect(x+2,y-14,1,2);
  ctx.fillStyle='#f0c468';ctx.fillRect(x-2,y-11,1,1);ctx.fillRect(x+1,y-11,1,1)}
 ctx.globalAlpha=1;
 if(e.alert>0){
  const b=Math.abs(Math.sin(gameT*6))*2;
  ctx.fillStyle='#f0c468';
  ctx.fillRect(x-1,y-28-b,3,6);ctx.fillRect(x,y-21-b,1,1)}
 if(e.hp<e.maxHp){
  ctx.fillStyle='#141b14';ctx.fillRect(x-7,y-22,14,2);
  ctx.fillStyle='#c8564a';ctx.fillRect(x-7,y-22,Math.max(1,Math.round(e.hp/e.maxHp*14)),2)}}
function drawNpc(n){
 ctx.globalAlpha=1;
 const x=Math.round(n.x),y=Math.round(n.y);
 const bob=Math.sin(n.bob*2)*0.8;
 const d=Math.hypot(n.x-player.x,n.y-player.y);
 const gl=0.30+Math.sin(gameT*4+n.anim)*0.07;
 ctx.globalAlpha=gl;ctx.fillStyle='#f0c468';
 ctx.beginPath();ctx.ellipse(x+7,y-12+bob,10,8,0,0,6.29);ctx.fill();
 ctx.globalAlpha=gl*0.55;
 ctx.beginPath();ctx.ellipse(x+7,y-12+bob,16,12,0,0,6.29);ctx.fill();
 ctx.globalAlpha=1;
 if(!paused&&!document.hidden&&!backgroundSuspended&&Math.random()<0.05)particles.push({x:x+7+rand(-2,2),y:y-12+bob,vx:rand(-4,4),vy:rand(-9,-3),g:-8,life:.7,max:.7,size:1,color:'#f0c468'});
 shadow(x,y+2,6,2.5);
 ctx.fillStyle='#e8dcb8';ctx.fillRect(x-5,y-13+bob,10,13);
 ctx.fillStyle='#cbbd92';ctx.fillRect(x-5,y-13+bob,2,13);
 ctx.fillStyle='#d8cba2';ctx.fillRect(x-4,y-18+bob,8,6);
 ctx.fillStyle='#6a5a3f';ctx.fillRect(x-2,y-16+bob,4,3);
 ctx.fillStyle='#7a5c33';ctx.fillRect(x+7,y-18+bob,2,17);
 ctx.fillStyle='#5c4326';ctx.fillRect(x+6,y-14+bob,4,5);
 ctx.fillStyle='#f2c05a';ctx.fillRect(x+7,y-13+bob,2,3);
 ctx.fillStyle='#e8933c';ctx.fillRect(x+6,y-9+bob,1,1);
 if(d<170){
  const nm=n.persona==='trader'?I18N[LANG].npcT:I18N[LANG].npcW;
  ctx.font='9px Galmuri11, sans-serif';ctx.textAlign='center';
  ctx.fillStyle='rgba(13,18,13,.75)';
  ctx.fillRect(x-Math.round(nm.length*3.2)-2,y-37,Math.round(nm.length*6.4)+4,10);
  ctx.fillStyle=n.persona==='trader'?'#f0c468':'#e8e2cf';
  ctx.fillText(nm,x,y-29)}
 if(d<130&&!dlg){const b=Math.abs(Math.sin(gameT*4))*3;
  ctx.fillStyle='#f0c468';
  ctx.fillRect(x-1,y-46-b,3,5);ctx.fillRect(x,y-40-b,1,1)}
 ctx.globalAlpha=1}
function drawCamp(){
 const x=camp.x,y=camp.y;
 shadow(x-46,y+2,18,4);
 ctx.fillStyle='#cbb88e';ctx.beginPath();
 ctx.moveTo(x-62,y);ctx.lineTo(x-46,y-20);ctx.lineTo(x-30,y);ctx.closePath();ctx.fill();
 ctx.fillStyle='#a8956c';ctx.beginPath();
 ctx.moveTo(x-52,y);ctx.lineTo(x-46,y-13);ctx.lineTo(x-40,y);ctx.closePath();ctx.fill();
 shadow(x,y+2,9,3);
 ctx.fillStyle='#5c4326';
 ctx.fillRect(x-7,y-3,14,3);ctx.fillRect(x-2,y-6,3,7);
 ctx.fillStyle='#7c6238';ctx.fillRect(x-9,y-1,3,3);ctx.fillRect(x+7,y-1,3,3);
 const f=Math.sin(gameT*9)*2;
 ctx.fillStyle='#e8933c';ctx.beginPath();
 ctx.moveTo(x,y-15+f);ctx.lineTo(x+4,y-4);ctx.lineTo(x-4,y-4);ctx.closePath();ctx.fill();
 ctx.fillStyle='#f2c05a';ctx.beginPath();
 ctx.moveTo(x,y-10+f*0.5);ctx.lineTo(x+2,y-4);ctx.lineTo(x-2,y-4);ctx.closePath();ctx.fill()}
function drawResSprite(r){
 const x=Math.round(r.x),y=Math.round(r.y);
 const bob=Math.sin(gameT*5+r.t*7)*1;
 ctx.fillStyle='rgba(10,14,10,.25)';ctx.fillRect(x-3,y+2,6,2);
 if(r.res==='wood'){ctx.fillStyle='#a5713f';ctx.fillRect(x-4,y-3+bob/2,8,4);ctx.fillStyle='#7a5533';ctx.fillRect(x-2,y-2+bob/2,4,1)}
 else if(r.res==='stone'){ctx.fillStyle='#8d8a80';ctx.fillRect(x-3,y-4+bob/2,6,6);ctx.fillStyle='#b5b2a8';ctx.fillRect(x-2,y-4+bob/2,2,2)}
 else if(r.res==='iron'){ctx.fillStyle='#b7b3ac';ctx.fillRect(x-4,y-3+bob/2,8,5);ctx.fillStyle='#d98a4a';ctx.fillRect(x-1,y-2+bob/2,2,2)}
 else if(r.res==='crystal'){ctx.fillStyle='#8fe0cf';ctx.beginPath();ctx.moveTo(x,y-6+bob);ctx.lineTo(x+3,y-2+bob);ctx.lineTo(x,y+2+bob);ctx.lineTo(x-3,y-2+bob);ctx.closePath();ctx.fill()}
 else if(r.res==='berry'){ctx.fillStyle='#d8404a';ctx.fillRect(x-3,y-4+bob/2,4,4);ctx.fillStyle='#f2848a';ctx.fillRect(x-3,y-4+bob/2,2,2);ctx.fillStyle='#4f8f49';ctx.fillRect(x,y-5+bob/2,3,1)}
 else if(r.res==='jelly'){ctx.fillStyle='#8fbf5a';ctx.beginPath();ctx.arc(x,y-2+bob/2,3,0,6.29);ctx.fill();ctx.fillStyle='#c8e89a';ctx.fillRect(x-1,y-4+bob/2,2,1)}
 else if(r.res==='fang'){ctx.fillStyle='#e8e4d8';ctx.beginPath();ctx.moveTo(x-2,y-5+bob);ctx.lineTo(x+2,y-5+bob);ctx.lineTo(x,y+1+bob);ctx.closePath();ctx.fill()}
 else if(r.res==='gloom'){ctx.fillStyle='#38264d';ctx.beginPath();ctx.moveTo(x,y-6+bob);ctx.lineTo(x+4,y-2+bob);ctx.lineTo(x,y+3+bob);ctx.lineTo(x-4,y-2+bob);ctx.closePath();ctx.fill();ctx.fillStyle='#c39ae8';ctx.fillRect(x-1,y-3+bob,2,3)}
 else if(r.res==='nightFang'){ctx.fillStyle='#b995d7';ctx.beginPath();ctx.moveTo(x-3,y-5+bob);ctx.lineTo(x+3,y-5+bob);ctx.lineTo(x+1,y-1+bob);ctx.lineTo(x,y+2+bob);ctx.lineTo(x-1,y-1+bob);ctx.closePath();ctx.fill();ctx.fillStyle='#f2dcff';ctx.fillRect(x,y-4+bob,1,2)}
 else if(r.res==='nightCore'){ctx.fillStyle='#4a304e';ctx.beginPath();ctx.moveTo(x,y-7+bob);ctx.lineTo(x+5,y-3+bob);ctx.lineTo(x+3,y+3+bob);ctx.lineTo(x-3,y+3+bob);ctx.lineTo(x-5,y-3+bob);ctx.closePath();ctx.fill();ctx.fillStyle='#ff9b55';ctx.fillRect(x-1,y-3+bob,2,3)}
 else{ctx.fillStyle='#d8a03c';ctx.beginPath();ctx.moveTo(x,y-6+bob);ctx.lineTo(x+3,y-2+bob);ctx.lineTo(x,y+2+bob);ctx.lineTo(x-3,y-2+bob);ctx.closePath();ctx.fill();ctx.fillStyle='#f0c468';ctx.fillRect(x-1,y-3+bob,1,1)}}

/* ================================================================
   아이콘 (16×16)
   ================================================================ */
const iconCache=new Map();
function iconSrc(key){
 if(iconCache.has(key))return iconCache.get(key);
 const c=document.createElement('canvas');c.width=16;c.height=16;
 const g=c.getContext('2d');
 switch(key){
  case 'star':
   g.fillStyle='#f0c468';
   g.fillRect(7,2,2,12);g.fillRect(2,7,12,2);
   g.fillStyle='#f2e6c8';g.fillRect(5,5,6,6);
   g.fillStyle='#d8a03c';g.fillRect(7,7,2,2);break;
  case 'fish':
   g.fillStyle='#8fc0d4';
   g.beginPath();g.ellipse(7,9,4,3,0,0,6.29);g.fill();
   g.beginPath();g.moveTo(10,9);g.lineTo(14,6);g.lineTo(14,12);g.closePath();g.fill();
   g.fillStyle='#bfe3ec';g.fillRect(5,8,4,2);
   g.fillStyle='#1a140d';g.fillRect(4,8,1,1);
   g.fillStyle='#6d9a41';g.fillRect(6,6,2,1);break;
  case 'pickaxe':
   g.fillStyle='#8a5c33';g.fillRect(4,4,2,9);g.fillRect(6,6,2,7);
   g.fillStyle='#c9ccc6';g.fillRect(5,2,7,2);g.fillRect(3,3,3,2);g.fillRect(11,3,3,2);g.fillRect(2,5,2,2);g.fillRect(13,5,2,2);
   g.fillStyle='#e8eae4';g.fillRect(5,2,3,1);break;
  case 'sword':
   g.fillStyle='#d9dcd8';g.fillRect(9,2,3,2);g.fillRect(8,4,3,2);g.fillRect(7,6,3,2);g.fillRect(6,8,3,2);
   g.fillStyle='#f2f4ef';g.fillRect(10,2,2,1);
   g.fillStyle='#d8a03c';g.fillRect(4,9,5,2);
   g.fillStyle='#8a5c33';g.fillRect(3,11,2,3);break;
  case 'boots':
   g.fillStyle='#a3784c';g.fillRect(3,3,4,8);g.fillRect(9,3,4,8);
   g.fillStyle='#c4955f';g.fillRect(3,3,4,2);g.fillRect(9,3,4,2);
   g.fillStyle='#5c4326';g.fillRect(2,11,5,2);g.fillRect(8,11,5,2);break;
  case 'cloak':
   g.fillStyle='#b0574c';g.beginPath();g.moveTo(3,2);g.lineTo(13,2);g.lineTo(8,14);g.closePath();g.fill();
   g.fillStyle='#c97a6d';g.beginPath();g.moveTo(5,2);g.lineTo(8,2);g.lineTo(6,9);g.closePath();g.fill();
   g.fillStyle='#d8a03c';g.fillRect(7,1,2,2);break;
  case 'amulet':
   g.fillStyle='#8a5c33';g.fillRect(4,2,2,2);g.fillRect(10,2,2,2);g.fillRect(3,4,2,3);g.fillRect(11,4,2,3);
   g.fillStyle='#8fe0cf';g.beginPath();g.moveTo(8,6);g.lineTo(12,11);g.lineTo(8,15);g.lineTo(4,11);g.closePath();g.fill();
   g.fillStyle='#e6fff9';g.fillRect(7,8,2,2);break;
  case 'charm':
   g.fillStyle='#6fae56';g.fillRect(4,3,4,4);g.fillRect(8,3,4,4);g.fillRect(4,7,4,4);g.fillRect(8,7,4,4);
   g.fillStyle='#4c8449';g.fillRect(7,10,2,5);break;
  case 'helmet':
   g.fillStyle='#98a098';g.fillRect(4,4,8,8);g.fillRect(5,2,6,2);
   g.fillStyle='#b0b6ae';g.fillRect(5,3,4,2);
   g.fillStyle='#1a1d1a';g.fillRect(4,8,8,2);
   g.fillStyle='#d8a03c';g.fillRect(7,1,2,2);break;
  case 'shield':
   g.fillStyle='#98a098';g.beginPath();g.moveTo(8,1);g.lineTo(13,3);g.lineTo(13,9);g.lineTo(8,15);g.lineTo(3,9);g.lineTo(3,3);g.closePath();g.fill();
   g.fillStyle='#b0b6ae';g.fillRect(5,3,3,4);
   g.fillStyle='#d8a03c';g.fillRect(7,6,2,2);break;
  case 'gloves':
   g.fillStyle='#a3784c';g.fillRect(3,4,4,7);g.fillRect(9,4,4,7);
   g.fillStyle='#c4955f';g.fillRect(3,4,4,2);g.fillRect(9,4,4,2);
   g.fillStyle='#5c4326';g.fillRect(2,11,5,2);g.fillRect(9,11,5,2);
   g.fillStyle='#a3784c';g.fillRect(2,7,2,3);g.fillRect(12,7,2,3);break;
  case 'ring':
   g.strokeStyle='#d8a03c';g.lineWidth=2;g.beginPath();g.arc(8,9,4,0,6.29);g.stroke();
   g.fillStyle='#8fe0cf';g.fillRect(7,2,3,3);g.fillStyle='#e6fff9';g.fillRect(7,2,1,1);break;
  case 'wood':
   g.fillStyle='#a5713f';g.fillRect(2,5,12,6);g.fillStyle='#7a5533';g.fillRect(4,7,8,1);g.fillRect(3,6,1,3);
   g.fillStyle='#c4955f';g.fillRect(2,5,12,1);break;
  case 'stone':
   g.fillStyle='#8d8a80';g.fillRect(4,5,8,7);g.fillRect(3,7,10,5);g.fillStyle='#b5b2a8';g.fillRect(5,6,3,2);break;
  case 'iron':
   g.fillStyle='#b7b3ac';g.beginPath();g.moveTo(3,11);g.lineTo(5,6);g.lineTo(11,6);g.lineTo(13,11);g.closePath();g.fill();
   g.fillStyle='#d98a4a';g.fillRect(6,8,2,2);g.fillStyle='#dedcd5';g.fillRect(5,6,6,1);break;
  case 'crystal':
   g.fillStyle='#8fe0cf';g.beginPath();g.moveTo(8,2);g.lineTo(12,8);g.lineTo(8,14);g.lineTo(4,8);g.closePath();g.fill();
   g.fillStyle='#e6fff9';g.fillRect(7,4,2,3);break;
  case 'berry':
   g.fillStyle='#d8404a';g.fillRect(4,7,4,4);g.fillRect(8,5,4,4);
   g.fillStyle='#f2848a';g.fillRect(4,7,2,2);g.fillRect(8,5,2,2);
   g.fillStyle='#4f8f49';g.fillRect(7,3,4,2);break;
  case 'jelly':
   g.fillStyle='#8fbf5a';g.beginPath();g.arc(8,9,4,0,6.29);g.fill();
   g.fillStyle='#c8e89a';g.fillRect(6,6,3,2);
   g.fillStyle='#6d9a41';g.fillRect(5,11,6,2);break;
  case 'fang':
   g.fillStyle='#e8e4d8';g.beginPath();g.moveTo(4,3);g.lineTo(9,3);g.lineTo(7,13);g.closePath();g.fill();
   g.beginPath();g.moveTo(9,4);g.lineTo(13,4);g.lineTo(11,12);g.closePath();g.fill();
   g.fillStyle='#c8c4b8';g.fillRect(5,4,2,2);break;
  case 'core':
   g.fillStyle='#d8a03c';g.beginPath();g.moveTo(8,2);g.lineTo(13,8);g.lineTo(8,14);g.lineTo(3,8);g.closePath();g.fill();
   g.fillStyle='#f0c468';g.fillRect(6,6,3,3);g.fillStyle='#a8752c';g.fillRect(9,9,2,2);break;
  case 'gloom':
   g.fillStyle='#38264d';g.beginPath();g.moveTo(8,1);g.lineTo(14,7);g.lineTo(9,14);g.lineTo(3,9);g.closePath();g.fill();
   g.fillStyle='#c39ae8';g.fillRect(7,5,3,5);break;
  case 'nightFang':
   g.fillStyle='#b995d7';g.beginPath();g.moveTo(3,3);g.lineTo(13,3);g.lineTo(11,8);g.lineTo(8,14);g.lineTo(5,8);g.closePath();g.fill();
   g.fillStyle='#f2dcff';g.fillRect(7,4,2,4);break;
  case 'nightCore':
   g.fillStyle='#4a304e';g.beginPath();g.moveTo(8,1);g.lineTo(14,5);g.lineTo(12,12);g.lineTo(4,12);g.lineTo(2,5);g.closePath();g.fill();
   g.fillStyle='#ff9b55';g.fillRect(6,5,4,5);break;
  case 'potion':
   g.fillStyle='#8a5c33';g.fillRect(7,1,2,2);
   g.fillStyle='#cfe0d8';g.fillRect(7,3,2,3);g.fillRect(5,6,6,7);
   g.fillStyle='#d05348';g.fillRect(5,10,6,3);
   g.fillStyle='#e88878';g.fillRect(6,10,2,2);break;
  case 'tea':
   g.fillStyle='#d8cfc0';g.fillRect(4,6,8,6);g.fillRect(3,11,10,2);
   g.fillStyle='#8fd97a';g.fillRect(5,6,6,2);
   g.fillStyle='#d8cfc0';g.fillRect(12,7,2,3);
   g.fillStyle='#cdeef5';g.fillRect(6,2,1,2);g.fillRect(9,1,1,3);break;
  default:g.fillStyle='#8d8a80';g.fillRect(4,6,8,6)}
 iconCache.set(key,c);return c}
function iconEl(key){const c=document.createElement('canvas');c.width=16;c.height=16;
 c.getContext('2d').drawImage(iconSrc(key),0,0);return c}
function injectIcons(root){root.querySelectorAll('[data-ico]').forEach(sp=>{
 if(sp.dataset.done)return;sp.dataset.done='1';sp.insertBefore(iconEl(sp.dataset.ico),sp.firstChild)})}

/* ================================================================
   미니맵 — 활성 유적 탭 = 워프
   ================================================================ */
const mm=$('mm'),mmc=mm.getContext('2d');
let mmTimer=0;
function drawMinimap(){
 const N=132,mmCell=4;
 mmc.fillStyle='#0a0e0a';mmc.fillRect(0,0,N,N);
 const half=Math.floor(N/(2*mmCell));
 const pcx=player.x/CS,pcy=player.y/CS;
 const pfx=Math.floor(pcx),pfy=Math.floor(pcy);
 for(let j=-half;j<=half;j++)for(let i=-half;i<=half;i++){
  const key=(pfx+i)+','+(pfy+j);
  if(!explored.has(key))continue;
  const ci=explored.get(key);
  mmc.fillStyle=BIOME_COL[ci]||BIOME_COL[B_MEADOW];
  mmc.fillRect(66+i*mmCell,66+j*mmCell,mmCell,mmCell)}
 for(const l of landmarks.values()){
  const nx=66+((l.x/CS)-pcx)*mmCell, ny=66+((l.y/CS)-pcy)*mmCell;
  if(nx<1||nx>N-3||ny<1||ny>N-3)continue;
  if(l.t==='cave'){mmc.fillStyle='#d8a03c';mmc.fillRect(Math.round(nx)-1,Math.round(ny)-1,2,2)}
  else if(l.t==='ruin'){mmc.fillStyle='#8fe0cf';mmc.fillRect(Math.round(nx)-1,Math.round(ny)-1,2,2)}
  else if(l.t==='star'){mmc.fillStyle='#f2e6c8';mmc.fillRect(Math.round(nx)-1,Math.round(ny)-1,3,3);
   mmc.fillStyle='#d8a03c';mmc.fillRect(Math.round(nx),Math.round(ny),1,1)}
  else{mmc.fillStyle=l.t==='npcT'?'#f0c468':'#e8e2cf';
   mmc.fillRect(Math.round(nx)-1,Math.round(ny)-1,2,2)}}
 const cdx=Math.floor(camp.x/CS)-pfx,cdy=Math.floor(camp.y/CS)-pfy;
 if(Math.abs(cdx)<=half&&Math.abs(cdy)<=half){mmc.fillStyle='#f0c468';
  mmc.fillRect(66+cdx*mmCell,66+cdy*mmCell,Math.max(2,mmCell-1),Math.max(2,mmCell-1))}
 else{mmc.fillStyle='#d8a03c';
  const bx=clamp(66+cdx*mmCell,2,N-4),by=clamp(66+cdy*mmCell,2,N-4);
  mmc.fillRect(bx,by,2,2)}
 mmc.fillStyle='#f2e6c8';mmc.fillRect(65,65,2,2)}
 $('mmWrap').onclick=e=>{
 ensureAudio();
 const r=mm.getBoundingClientRect();
 const sx=(e.clientX-r.left)/r.width*132, sy=(e.clientY-r.top)/r.height*132;
 const pcx=player.x/CS,pcy=player.y/CS;
 let hit=null,hd=8;
 for(const [key,l] of landmarks){
  if(l.t!=='ruin')continue;
  const d=Math.hypot(66+(l.x/CS-pcx)*4-sx,66+(l.y/CS-pcy)*4-sy);
  if(d<hd){hd=d;hit=[key,l]}}
 if(hit){
  if(ruinDone.has(hit[0])){warpTo(hit[1]);return}
  toast(t('warpLocked'),'small');sfx('deny');
  openMap();return}
 openMap()};

/* ================================================================
   워프
   ================================================================ */
function safeLanding(x,y){
 const offs=[[0,20],[0,26],[16,20],[-16,20],[24,12],[-24,12],[0,-26]];
 for(const o of offs){
  const tx=x+o[0],ty=y+o[1];
  if(biomeAt(Math.floor(tx/TILE),Math.floor(ty/TILE))!==B_WATER)return[tx,ty]}
 return[x,y+20]}
function warpTo(lm){
 if(state!=='play'||player.dead||Date.now()<warpLock)return;
 warpLock=Date.now()+1500;
 closeMap();
 if(fishing)cancelFishing(true);
 const [tx,ty]=safeLanding(lm.x,lm.y);
 sfx('warp');
 $('warpfade').style.opacity=1;
 setTimeout(()=>$('warpfade').style.opacity=0,140);
 exp.sailing=false;player.x=tx;player.y=ty;player.kbx=player.kby=0;
 player.invuln=Math.max(player.invuln,1.2);
 cam.x=tx;cam.y=ty;
 burst(tx,ty-8,['#f0c468','#8fe0cf','#f2e6c8'],18);
 ringFx(tx,ty-8,'#f0c468');
 toast(t('warpToast'));
 saveGame()}

/* ================================================================
   전체 화면 지도
   ================================================================ */
function syncPaused(){paused=modalOpen||mapOpen||pauseOpen||invOpen||!!dlg}
function openMap(){
 if(dlg||state!=='play')return;
 mapOpen=true;syncPaused();
 mapCX=player.x/CS;mapCY=player.y/CS;
 $('mapOv').classList.add('show');
 $('mapTitle').textContent=t('mapTitle');
 $('mapCampDistance').textContent=t('campLabel')+' · '+Math.round(Math.hypot(player.x-camp.x,player.y-camp.y)/TILE)+'m';
 buildMapLegend();
 try{void $('mapOv').offsetHeight;sizeBigMap();drawBigMap()}catch(err){console.error('[drifter] map open:',err)}
 requestAnimationFrame(()=>{try{sizeBigMap();drawBigMap()}catch(err){console.error('[drifter] map raf:',err)}});
 sfx('ui')}
function closeMap(){mapOpen=false;syncPaused();$('mapOv').classList.remove('show')}
function sizeBigMap(){
 const c=$('bigmap'),r=c.getBoundingClientRect();
 if(r.width<10||r.height<10)return false;
 const nw=Math.floor(r.width),nh=Math.floor(r.height);
 const d=Math.min(2,window.devicePixelRatio||1);
 if(c.width!==nw*d||c.height!==nh*d){c.width=nw*d;c.height=nh*d}
 mapW=nw;mapH=nh;
 return true}
function buildMapLegend(){
 const items=[['#f2e6c8',t('lgYou')],['#f0c468',t('campLabel')],['#d8a03c',t('lgCave')],
  ['#8fe0cf',t('lgRuin')],['#f2e6c8',t('lgStar')],['#e8e2cf',t('lgWander')],['#f0c468',t('lgTrader')]];
 let h='';
 for(const [col,lab] of items)h+='<span class="li"><i style="background:'+col+'"></i>'+lab+'</span>';
 const [c,r]=lmCounts();
 h+='<span class="st">'+t('mapStats')(c,r,Math.round(farthest/TILE))+'</span>';
 $('mapLegend').innerHTML=h}
function drawBigMap(){
 if(!mapOpen)return;
 if(mapW<10){if(!sizeBigMap())return}
 const c=$('bigmap'),g=c.getContext('2d');
 const w=mapW,h=mapH;
 const d=Math.min(2,window.devicePixelRatio||1);
 g.setTransform(d,0,0,d,0,0);
 const cell=MAP_CELLS[mapZoomIdx];
 g.fillStyle='#0a0e0a';g.fillRect(0,0,w,h);
 const x0=Math.floor(mapCX-w/(2*cell))-1,x1=Math.ceil(mapCX+w/(2*cell))+1;
 const y0=Math.floor(mapCY-h/(2*cell))-1,y1=Math.ceil(mapCY+h/(2*cell))+1;
 for(const [key,ci] of explored.entries()){
  const p=key.split(','),cx=+p[0],cy=+p[1];
  if(cx<x0||cx>x1||cy<y0||cy>y1)continue;
  g.fillStyle=BIOME_COL[ci]||BIOME_COL[B_MEADOW];
  g.fillRect(Math.round((cx-mapCX)*cell+w/2),Math.round((cy-mapCY)*cell+h/2),cell,cell)}
 const playerMapX=(player.x/CS-mapCX)*cell+w/2,playerMapY=(player.y/CS-mapCY)*cell+h/2;
 const campMapX=(camp.x/CS-mapCX)*cell+w/2,campMapY=(camp.y/CS-mapCY)*cell+h/2;
 const routeDx=campMapX-playerMapX,routeDy=campMapY-playerMapY,routeLength=Math.hypot(routeDx,routeDy);
 if(routeLength>2){
  g.save();g.lineCap='round';g.strokeStyle='rgba(7,12,8,.92)';g.lineWidth=4;
  g.beginPath();g.moveTo(playerMapX,playerMapY);g.lineTo(campMapX,campMapY);g.stroke();
  g.strokeStyle='#d8a03c';g.lineWidth=2;g.setLineDash([5,4]);g.lineDashOffset=-gameT*3;
  g.beginPath();g.moveTo(playerMapX,playerMapY);g.lineTo(campMapX,campMapY);g.stroke();g.setLineDash([]);
  const arrowX=playerMapX+routeDx*.66,arrowY=playerMapY+routeDy*.66,angle=Math.atan2(routeDy,routeDx);
  g.translate(arrowX,arrowY);g.rotate(angle);g.fillStyle='#f0c468';g.beginPath();g.moveTo(5,0);g.lineTo(-4,-3);g.lineTo(-2,0);g.lineTo(-4,3);g.closePath();g.fill();g.restore();
 }
 for(const [key,l] of landmarks.entries()){
  if(!l||!isFinite(l.x)||!isFinite(l.y))continue;
  const lx=(l.x/CS-mapCX)*cell+w/2,ly=(l.y/CS-mapCY)*cell+h/2;
  if(lx<-14||lx>w+14||ly<-14||ly>h+14)continue;
  if(l.t==='cave'){
   const s=Math.max(4,cell*0.55);
   g.fillStyle='#0d120e';g.fillRect(Math.round(lx-s/2)-1,Math.round(ly-s/2)-1,s+2,s+2);
   g.fillStyle='#d8a03c';g.fillRect(Math.round(lx-s/2),Math.round(ly-s/2),s,s)}
  else if(l.t==='ruin'){
   const s=Math.max(4,cell*0.5);
   const act=ruinDone.has(key);
   g.fillStyle='#0d120e';g.fillRect(Math.round(lx-s/2)-1,Math.round(ly-s/2)-1,s+2,s+2);
   g.fillStyle='#8fe0cf';g.fillRect(Math.round(lx-s/2),Math.round(ly-s/2),s,s);
   if(act){g.fillStyle='#f2e6c8';g.fillRect(Math.round(lx)-1,Math.round(ly)-1,2,2)}}
  else if(l.t==='star'){
   g.fillStyle='rgba(13,18,13,.8)';g.fillRect(Math.round(lx)-3,Math.round(ly)-3,6,6);
   g.fillStyle='#f2e6c8';
   g.fillRect(Math.round(lx)-1,Math.round(ly)-5,2,10);
   g.fillRect(Math.round(lx)-5,Math.round(ly)-1,10,2);
   g.fillStyle='#f0c468';g.fillRect(Math.round(lx)-1,Math.round(ly)-1,2,2)}
  else{
   const s=Math.max(3,cell*0.4);
   g.fillStyle=l.t==='npcT'?'#f0c468':'#e8e2cf';
   g.fillRect(Math.round(lx-s/2),Math.round(ly-s/2),s,s)}}
 const ccx=campMapX,ccy=campMapY;
 const cs2=Math.max(5,cell*0.7);
 g.fillStyle='#0d120e';g.fillRect(Math.round(ccx-cs2/2)-1,Math.round(ccy-cs2/2)-1,cs2+2,cs2+2);
 g.fillStyle='#f0c468';g.fillRect(Math.round(ccx-cs2/2),Math.round(ccy-cs2/2),cs2,cs2);
 if(cell>=6){
  g.font='10px Galmuri11, sans-serif';g.textAlign='center';
  g.fillStyle='rgba(13,18,13,.8)';
  g.fillText(t('campLabel'),ccx+1,ccy-cell*0.8+1);
  g.fillStyle='#f0c468';g.fillText(t('campLabel'),ccx,ccy-cell*0.8)}
 const px=playerMapX,py=playerMapY;
 const pr=Math.max(3,cell*0.45);
 g.fillStyle='#0d120e';g.beginPath();g.arc(px,py,pr+2,0,6.29);g.fill();
 g.fillStyle='#f2e6c8';g.beginPath();g.arc(px,py,pr,0,6.29);g.fill();
 g.fillStyle='#d8a03c';g.fillRect(px-1+player.face*(pr-1),py-1,2,2);
 $('mapZoomLv').textContent='×'+(cell/4)}
 $('mapZoomIn').onclick=()=>{if(mapZoomIdx<MAP_CELLS.length-1){mapZoomIdx++;drawBigMap();sfx('ui')}};
 $('mapZoomOut').onclick=()=>{if(mapZoomIdx>0){mapZoomIdx--;drawBigMap();sfx('ui')}};
 $('mapClose').onclick=()=>{closeMap();sfx('ui')};
 $('bigmap').addEventListener('pointerdown',e=>{
 mapDrag={x:e.clientX,y:e.clientY};mapMoved=false;
 try{$('bigmap').setPointerCapture(e.pointerId)}catch(err){}});
 $('bigmap').addEventListener('pointermove',e=>{
 if(!mapDrag||!mapOpen)return;
 if(Math.hypot(e.clientX-mapDrag.x,e.clientY-mapDrag.y)>6)mapMoved=true;
 const cell=MAP_CELLS[mapZoomIdx];
 mapCX-=(e.clientX-mapDrag.x)/cell;
 mapCY-=(e.clientY-mapDrag.y)/cell;
 mapDrag={x:e.clientX,y:e.clientY};
 drawBigMap()});
 $('bigmap').addEventListener('pointerup',e=>{
 if(mapDrag&&!mapMoved&&mapOpen)mapClick(e);
 mapDrag=null});
 $('bigmap').addEventListener('pointercancel',()=>{mapDrag=null});
function mapClick(e){
 const c=$('bigmap'),r=c.getBoundingClientRect();
 const px=e.clientX-r.left,py=e.clientY-r.top;
 if(px<0||py<0||px>mapW||py>mapH)return;
 const cell=MAP_CELLS[mapZoomIdx];
 let hit=null,hd=Math.max(12,cell*0.9);
 for(const [key,l] of landmarks){
  if(l.t!=='ruin'||!isFinite(l.x))continue;
  const lx=(l.x/CS-mapCX)*cell+mapW/2,ly=(l.y/CS-mapCY)*cell+mapH/2;
  const d=Math.hypot(px-lx,py-ly);
  if(d<hd){hd=d;hit=[key,l]}}
 if(!hit)return;
 if(ruinDone.has(hit[0]))warpTo(hit[1]);
 else{toast(t('warpLocked'),'small');sfx('deny')}}
 $('bigmap').addEventListener('wheel',e=>{
 e.preventDefault();
 if(!mapOpen)return;
 if(e.deltaY<0&&mapZoomIdx<MAP_CELLS.length-1)mapZoomIdx++;
 else if(e.deltaY>0&&mapZoomIdx>0)mapZoomIdx--;
 drawBigMap()},{passive:false});

/* ================================================================
   일시정지
   ================================================================ */
function renderPauseStats(){
 const [c,r]=lmCounts();
 const f=Math.round(farthest/TILE);
 $('pauseStats').innerHTML='Lv '+player.lvl+
  (stats&&stats.maxHp?' · HP '+Math.round(player.hp)+'/'+stats.maxHp+' · ST '+Math.round(player.stam)+'/'+stats.maxStam:'')
  +'<br><span class="sub">'+t('pauseDisc')(c,r,f)+'</span>'}
function togglePause(force){
 if(dlg&&force!==false)return;
 pauseOpen=force!==undefined?force:!pauseOpen;
 if(pauseOpen)renderPauseStats();
 $('pauseOv').classList.toggle('show',pauseOpen);
 syncPaused();sfx('ui')}
 $('btnPause').onclick=()=>{ensureAudio();const opening=!pauseOpen;togglePause();if(opening)window.DrifterGameDistribution?.showInterstitial('pause')};
 $('btnResume').onclick=()=>{togglePause(false)};
 $('btnPauseHelp').onclick=()=>{togglePause(false);toggleModal(true)};

/* ================================================================
   HUD DOM
   ================================================================ */
const slotRow=$('slotRow');
function renderSlots(){
 slotRow.innerHTML='';
 for(let i=0;i<3;i++){
  const d=document.createElement('div');
  d.className='slot'+((replaceState&&replaceState.slot===i)?' sel':'');
  const eq=player.equip[i];
  if(eq){d.appendChild(iconEl(eq.base));d.title=equipName(eq)}
  else{const e=document.createElement('div');e.className='empty';d.appendChild(e);d.title=t('slotEmpty')}
  d.onclick=()=>{
   sfx('ui');
   if(replaceState){replaceState.slot=i;openInv('bag');renderPanel();return}
   openInv('bag')};
  slotRow.appendChild(d)}}
function renderStatSum(){
 const parts=[];
 const ab={atk:'ATK',spd:'SPD',vit:'HP',stam:'ST',regen:'RG',range:'RCH',luck:'LCK'};
 for(const k of ['atk','spd','vit','stam','regen','range','luck']){
  if(stats[k]>0)parts.push(ab[k]+(k==='atk'?' ':' +')+ (k==='regen'&&stats[k]%1?stats[k].toFixed(1):Math.round(stats[k])) + (k==='spd'?'%':''))}
 $('statSum').textContent=parts.join(' · ')}
function renderXP(){
 $('lvTxt').textContent='Lv '+player.lvl;
 $('xpTxt').textContent=Math.floor(player.xp)+'/'+xpNeed(player.lvl);
 $('xpF').style.width=(player.xp/xpNeed(player.lvl)*100)+'%'}
const resRow=$('resRow');
function renderRes(pop){
 resRow.innerHTML='';
 for(const k of RES_KEYS){
  if(player.res[k]===0&&!pop)continue;
  const d=document.createElement('div');d.className='res';
  d.appendChild(iconEl(k));
  const b=document.createElement('b');b.textContent=player.res[k];
  d.appendChild(b);
  const s=document.createElement('span');s.textContent=RES_META[k][LANG];
  d.appendChild(s);
  if(pop){b.style.color='#f0c468';setTimeout(()=>b.style.color='',300)}
  resRow.appendChild(d)}
 if(invOpen)renderPanel();updateRaftCraftControls()}

/* ---------- 퀵바 (소모품) ---------- */
function renderQuickbar(){
 const btns=$('quickbar').querySelectorAll('.qbtn');
 const vals={berry:player.res.berry,heal:player.pots.heal,tea:player.pots.tea,fish:fishTotal()};
 btns.forEach(b=>{
  const v=vals[b.dataset.use]||0;
  b.querySelector('b').textContent=v;
  b.classList.toggle('off',v<1);
  b.title={berry:RES_META.berry[LANG],heal:RECIPES[0][LANG],tea:RECIPES[1][LANG],
   fish:t('pFishSect')}[b.dataset.use]||''})}
 $('quickbar').addEventListener('click',e=>{
 const b=e.target.closest('.qbtn');if(!b)return;
 ensureAudio();
 if(b.dataset.use==='fish'){eatFish();return}
 useConsumable(b.dataset.use)});

/* ---------- 배낭/제작 패널 ---------- */
function openInv(tab){
 if(dlg||pauseOpen||mapOpen)return;
 invOpen=true;invTab=tab||invTab;
 if(!secOpen)secOpen={equip:!isCoarse(),ground:true,use:!isCoarse(),fish:!isCoarse()};
 $('panel').classList.add('show');
 renderPanel();sfx('ui');
 if(tut.active){
  const k=tutCur();
  if(k==='pickup'&&(nearItems.length>0))tutStepDone('pickup');
  if(k==='bag'&&invTab==='bag')tutStepDone('bag')}}
function closeInv(){invOpen=false;replaceState=null;$('panel').classList.remove('show')}
 $('btnBag').onclick=()=>{ensureAudio();invOpen?closeInv():openInv('bag')};
 $('tabBag').onclick=()=>{invTab='bag';renderPanel();sfx('ui')};
 $('tabCraft').onclick=()=>{invTab='craft';renderPanel();sfx('ui')};
 $('panelClose').onclick=()=>{closeInv();sfx('ui')};

function statLinesHTML(eq){
 let h='';
 const base=equipBaseStats(eq);
 const bk=Object.keys(base);
 h+='<span class="base"><b>'+t('baseLabel')+'</b> ';
 for(const k of bk)h+=statName(k)+' '+statStr(k,base[k])+' ';
 h+='</span>';
 if(eq.opts.length){
  for(const o of eq.opts)h+='<br>· '+statName(o.k)+' '+statStr(o.k,o.v);
 }else h+='<br><span class="none">· '+t('optNone')+'</span>';
 return h}
function costHTML(cost){
 let h='';
 for(const k in cost){
  const ok=player.res[k]>=cost[k];
  h+='<span class="chip'+(ok?'':' no')+'" data-ico="'+k+'">'+cost[k]+'</span>'}
 return h}
function sectBtn(key,label){
 const open=secOpen[key]||(key==='equip'&&replaceState);
 return '<div class="sectbtn" data-act="togSec" data-sec="'+key+'"><span>'+label+'</span><span>'+(open?'▾':'▸')+'</span></div>'}
function questIcon(q){
 switch(q.type){
  case 'gather':return q.res;
  case 'kill':return 'sword';
  case 'ruin':return 'crystal';
  case 'cave':return 'stone';
  case 'fish':return 'fish';
  default:return 'star'}}
function bagHTML(){
 let h='';
 h+='<details class="quest-list" id="bagQuests" '+(bagFoldState.quests?'open':'')+'><summary>'+t('qSect')+'</summary>';
 for(const q of quests){
  const rw=15+q.need*4;
  h+='<div class="prow"><span class="pico" data-ico="'+questIcon(q)+'"></span>'
   +'<div class="pmain"><div class="pname">'+qDesc(q)+'</div>'
   +'<div class="pstats"><span class="base">'+Math.min(q.prog,q.need)+' / '+q.need+'</span></div></div>'
   +'<div class="rdesc" style="flex:none">XP '+rw+'</div></div>'}
 h+='</details>';
 const eqCount=player.equip.filter(e=>e).length;
 h+=sectBtn('equip',t('pEquip')+' · '+eqCount+'/3');
 if(replaceState){
  h+='<div class="repbar"><span>'+t('toastFull')+'</span><button class="warn" data-act="cancelReplace">'+t('cancel')+'</button></div>';
  if(replaceState.slot>=0){
   const old=player.equip[replaceState.slot];
   h+='<div class="repbar confirm"><span style="color:var(--tx)">'+(old?equipName(old):t('slotEmpty'))+' ⇒ '+equipName(replaceState.g.eq)+'</span>'
    +'<button class="acc" data-act="confirmReplace">'+t('btnConfirmSwap')+'</button></div>'}}
 if(secOpen.equip||replaceState){
  for(let i=0;i<3;i++){
   const eq=player.equip[i];
   const inRep=!!replaceState;
   const selRow=inRep&&replaceState.slot===i;
   if(eq){
    h+='<'+(inRep?'button type="button"':'div')+' class="prow'+(inRep?' rep':'')+(selRow?' sel':'')+'"'+(inRep?' data-act="replaceSlot" data-i="'+i+'"':'')+'>'
     +'<span class="pico" data-ico="'+eq.base+'"></span>'
     +'<div class="pmain"><div class="pname">'+equipName(eq)+' <span class="psub">· '+t('slotN')(i+1)+'</span></div>'
     +'<div class="pstats">'+statLinesHTML(eq)+'</div></div>'
     +(inRep?'':'<div class="pbtns"><button class="warn" data-act="dropEquip" data-i="'+i+'">'+t('btnSwap')+'</button></div>')
     +'</'+(inRep?'button':'div')+'>'
   }else{
    h+='<'+(inRep?'button type="button"':'div')+' class="prow'+(inRep?' rep':'')+'"'+(inRep?' data-act="replaceSlot" data-i="'+i+'"':'')+' style="opacity:.5"><span class="pico"></span>'
     +'<div class="pmain"><span class="pname" style="color:#68755f">'+t('slotEmpty')+' — '+t('slotN')(i+1)+'</span></div></'+(inRep?'button':'div')+'>'}}}
 h+=sectBtn('ground',t('pGround')+' · '+nearItems.length);
 if(secOpen.ground){
  if(!nearItems.length)h+='<div class="pempty">'+t('pGroundEmpty')+'</div>';
  nearItems.forEach((g,i)=>{
   h+='<div class="prow"><span class="pico" data-ico="'+(g.star?'star':g.eq.base)+'"></span>'
    +'<div class="pmain"><div class="pname">'+(g.star?t('lgStar')+' — '+equipName(g.eq):equipName(g.eq))+'</div>'
    +'<div class="pstats">'+statLinesHTML(g.eq)+'</div>'+gearPreviewHTML(g.eq)+'</div>'
    +'<div class="pbtns"><button class="acc" data-act="equipGround" data-uid="'+g.uid+'">'+t('btnEquipShort')+'</button>'
    +'<button class="warn" data-act="dropGround" data-uid="'+g.uid+'">'+t('btnSwap')+'</button></div></div>'})}
 h+=sectBtn('use',t('pUse'));
 if(secOpen.use){
  const cons=[
   {k:'berry',n:RES_META.berry[LANG],d:'HP +4',c:player.res.berry,ico:'berry'},
   {k:'heal',n:RECIPES[0][LANG],d:'HP 40%',c:player.pots.heal,ico:'potion'},
   {k:'tea',n:RECIPES[1][LANG],d:'ST 100%',c:player.pots.tea,ico:'tea'}];
  for(const c of cons){
   h+='<div class="prow"><span class="pico" data-ico="'+c.ico+'"></span>'
    +'<div class="pmain"><div class="pname">'+c.n+' <span class="psub">× '+c.c+'</span></div>'
    +'<div class="pstats"><span class="base">'+c.d+'</span></div></div>'
    +'<div class="pbtns"><button data-act="use" data-k="'+c.k+'" '+(c.c<1?'disabled':'')+'>'+t('btnUseShort')+'</button></div></div>'}}
 h+=sectBtn('fish',t('pFishSect')+' · '+fishTotal());
 if(secOpen.fish){
  let any=false;
  for(const id of FISH_ORDER){
   const c=player.fish[id]||0;if(c<1)continue;any=true;
   const f=FISH_INFO[id];
   const d=f.stam?('HP +'+f.heal+' · ST 100%'):('HP +'+f.heal);
   h+='<div class="prow"><span class="pico" data-ico="fish"></span>'
    +'<div class="pmain"><div class="pname">'+f[LANG]+' <span class="psub">× '+c+'</span></div>'
    +'<div class="pstats"><span class="base">'+d+'</span></div></div>'
    +'<div class="pbtns"><button data-act="eatFish" data-f="'+id+'">'+t('btnEat')+'</button></div></div>'}
  if(!any)h+='<div class="pempty">'+t('pFishEmpty')+'</div>'}
 return h}
function craftHTML(){
 let h='';
 h+='<div class="craft-priority"><div class="sectbtn" style="cursor:default"><span>'+L('초반 제작 · 회복','Early crafts · supplies')+'</span></div>';
 RECIPES.forEach((r,i)=>{
  h+='<div class="rrow"><span class="pico" data-ico="'+r.icon+'"></span>'
   +'<div class="pmain"><div class="pname">'+r[LANG]+'</div><div class="rdesc">'+(LANG==='ko'?r.dko:r.den)+'</div>'
   +'<div>'+costHTML(r.cost)+'</div></div>'
   +'<div class="pbtns"><button class="acc" data-act="craft" data-r="'+i+'" '+((canAfford(r.cost))?'':'disabled')+'>'+t('btnCraft')+'</button></div></div>'});
 h+='<div class="sectbtn" style="cursor:default"><span>'+t('pGear')+'</span></div>';
 h+='<div class="rdesc" style="margin-bottom:4px">'+t('pBase')+'</div>';
 h+='<div class="baseSel">';
 for(const b of BASE_KEYS){
  h+='<button class="bsel'+(craftBase===b?' on':'')+'" data-act="pickBase" data-b="'+b+'" title="'+BASES[b][LANG]+'"><span class="qico" data-ico="'+b+'"></span></button>'}
 h+='</div>';
 h+='<div class="rdesc" style="margin:8px 0 4px">'+t('pResult')+': <span style="color:var(--amber2)">'+BASES[craftBase][LANG]+'</span></div>';
 GEAR_TIERS.forEach((tier,i)=>{
  if(i!==0)return;
  h+='<div class="rrow"><div class="pmain"><div class="pname">'+tier[LANG]+'</div>'
   +'<div class="rdesc">'+t('craftOpt')(tier.minOpts)+'</div>'
   +'<div>'+costHTML(tier.cost)+'</div></div>'
   +'<div class="pbtns"><button class="acc" data-act="craftGear" data-tier="'+i+'" '+(canForgeGear(i)?'':'disabled')+'>'+t('btnCraft')+'</button></div></div>'});
 h+='</div>';
 const advancedReady=GEAR_TIERS.slice(1).some((tier,i)=>canForgeGear(i+1));
 if(advancedReady&&!advancedGearSeenUnlocked){advancedGearOpen=true;advancedGearSeenUnlocked=true;}
 h+='<details class="craft-fold '+(advancedReady?'unlocked':'locked')+'" id="advancedGearRecipes" '+(advancedGearOpen?'open':'')+'><summary>'+L('고급 장비 제작','Advanced gear')+'<span class="craft-lock">'+(advancedReady?L('제작 가능','AVAILABLE'):L('재료 필요','LOCKED'))+'</span></summary><p class="expdesc">'+L('더 먼 지역과 적에게서 얻는 재료로 상위 장비를 만듭니다.','Use materials from farther regions and stronger foes for higher-tier gear.')+'</p>';
 GEAR_TIERS.forEach((tier,i)=>{
  if(i===0)return;
  h+='<div class="rrow"><div class="pmain"><div class="pname">'+tier[LANG]+'</div>'
   +'<div class="rdesc">'+t('craftOpt')(tier.minOpts)+'</div>'
   +'<div>'+costHTML(tier.cost)+'</div></div>'
   +'<div class="pbtns"><button class="acc" data-act="craftGear" data-tier="'+i+'" '+(canForgeGear(i)?'':'disabled')+'>'+t('btnCraft')+'</button></div></div>'});
 h+='</details>';
 return h}
function renderPanel(){
 if(!invOpen)return;
 $('tabBag').classList.toggle('on',invTab==='bag');
 $('tabCraft').classList.toggle('on',invTab==='craft');
 const el=$('panelBody');
 el.innerHTML=invTab==='bag'?bagHTML():craftHTML();
 injectIcons(el)}
 $('panelBody').addEventListener('click',e=>{
 const b=e.target.closest('[data-act]');
 if(!b)return;
 const act=b.dataset.act;
 if(act==='togSec'){secOpen[b.dataset.sec]=!secOpen[b.dataset.sec];renderPanel();sfx('ui')}
 else if(act==='equipGround'){
  tryEquipGround(groundEquip.find(g=>g.uid===+b.dataset.uid));
  if(tut.active&&tutCur()==='equip')tutStepDone('equip')}
 else if(act==='dropGround'){dropGroundItem(groundEquip.find(g=>g.uid===+b.dataset.uid))}
 else if(act==='dropEquip'){dropEquip(+b.dataset.i)}
 else if(act==='replaceSlot'){
  if(!replaceState)return;
  replaceState.slot=+b.dataset.i;renderPanel();sfx('ui')}
 else if(act==='confirmReplace'){
  if(replaceState&&replaceState.slot>=0)doReplace(replaceState.slot)}
 else if(act==='cancelReplace'){replaceState=null;renderSlots();renderPanel()}
 else if(act==='use'){useConsumable(b.dataset.k)}
 else if(act==='eatFish'){eatFish(b.dataset.f)}
 else if(act==='craft'){craft(+b.dataset.r)}
 else if(act==='pickBase'){craftBase=b.dataset.b;renderPanel();sfx('ui')}
 else if(act==='craftGear'){craftGear(+b.dataset.tier)}});

function toast(msg,cls){
 const d=document.createElement('div');d.className='toast '+(cls||'');d.textContent=msg;
 $('toasts').appendChild(d);
 setTimeout(()=>{d.style.transition='opacity .5s';d.style.opacity=0;setTimeout(()=>d.remove(),500)},2400)}

/* ================================================================
   입력
   ================================================================ */
addEventListener('keydown',e=>{
 if(e.repeat){if(['Space','Tab'].includes(e.code))e.preventDefault();return}
 keys[e.code]=true;ensureAudio();
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))noteTutorialInput('keyboard');
 if(state!=='play'){
  return}
 if(e.code==='Space'||e.code==='KeyJ'){attackHeld=true;e.preventDefault()}
 if(e.code==='ShiftLeft'||e.code==='ShiftRight')runHeld=true;
 if(e.code==='KeyE')interact();
 if(e.code==='KeyM'){mapOpen?closeMap():openMap()}
 if(e.code==='KeyP'){if(!modalOpen&&!mapOpen)togglePause()}
 if(e.code==='KeyT'){tutOpenIntro(true)}
 if(e.code==='Tab'||e.code==='KeyB'){e.preventDefault();invOpen?closeInv():openInv('bag')}
 if(e.code==='KeyC'){invOpen&&invTab==='craft'?closeInv():openInv('craft')}
 if(e.code==='KeyZ')useConsumable('berry');
 if(e.code==='KeyQ')useConsumable('heal');
 if(e.code==='KeyX')useConsumable('tea');
 if(e.code==='KeyG')eatFish();
 if(e.code==='KeyH')toggleModal();
 if(e.code==='Escape'){
  if($('modal').classList.contains('show'))toggleModal(false);
  else if($('tutOv').classList.contains('show')){
   if(tut.active)skipTutorial(false);else $('tutOv').classList.remove('show')}
  else if(invOpen)closeInv();
  else if(mapOpen)closeMap();
  else if(pauseOpen)togglePause(false);
  else togglePause(true)}});
addEventListener('keyup',e=>{
 keys[e.code]=false;
 if(e.code==='Space'||e.code==='KeyJ')attackHeld=false;
 if(e.code==='ShiftLeft'||e.code==='ShiftRight')runHeld=false});

const pad=$('pad'),joyB=$('joyBase'),joyS=$('joyStick');
pad.addEventListener('pointerdown',e=>{
 if(e.pointerType!=='touch'||state!=='play'||paused||e.clientX>innerWidth*.5||e.clientY<innerHeight*.45)return;
 ensureAudio();
 if(invOpen)closeInv();
 if(joy.active)return;
 joy.active=true;joy.id=e.pointerId;joy.bx=e.clientX;joy.by=e.clientY;joy.dx=0;joy.dy=0;
 joyB.style.display='block';joyB.style.left=(e.clientX-52)+'px';joyB.style.top=(e.clientY-52)+'px';
 joyS.style.display='block';joyS.style.left=(e.clientX-20)+'px';joyS.style.top=(e.clientY-20)+'px';
 try{pad.setPointerCapture(e.pointerId)}catch(err){}});
pad.addEventListener('pointermove',e=>{
 if(!joy.active||e.pointerId!==joy.id)return;
 let dx=e.clientX-joy.bx,dy=e.clientY-joy.by;
 const l=Math.hypot(dx,dy);
 if(l>6){
  noteTutorialInput('touch');
  const oct=Math.round(Math.atan2(dy,dx)/(Math.PI/4));
  const qx=Math.round(Math.cos(oct*Math.PI/4)),qy=Math.round(Math.sin(oct*Math.PI/4));
  const diag=Math.abs(qx)&&Math.abs(qy);
  joy.dx=diag?qx*0.7071:qx;joy.dy=diag?qy*0.7071:qy}
 else{joy.dx=0;joy.dy=0}
 if(l>40){dx=dx/l*40;dy=dy/l*40}
 joyS.style.left=(joy.bx+dx-20)+'px';joyS.style.top=(joy.by+dy-20)+'px'});
function joyEnd(e){
 if(joy.active&&e.pointerId===joy.id){joy.active=false;joy.dx=0;joy.dy=0;
  joyB.style.display='none';joyS.style.display='none'}}
pad.addEventListener('pointerup',joyEnd);
pad.addEventListener('pointercancel',joyEnd);

function bindBtn(el,down,up){
 el.addEventListener('pointerdown',e=>{e.preventDefault();ensureAudio();el.classList.add('on');
  try{el.setPointerCapture(e.pointerId)}catch(err){}
  down()});
 el.addEventListener('pointerup',()=>{el.classList.remove('on');up&&up()});
 el.addEventListener('pointercancel',()=>{el.classList.remove('on');up&&up()})}
bindBtn($('btnAtk'),()=>attackHeld=true,()=>attackHeld=false);
bindBtn($('btnRun'),()=>runHeld=true,()=>runHeld=false);
// A discrete action opens on the native click, after pointer release.
$('btnUse').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();ensureAudio();interact()});
function refreshCtrlLabels(){$('btnAtk').textContent=t('btnAtk');$('btnRun').textContent=t('btnRun');$('btnUse').textContent=t('btnUse')}
if(matchMedia('(pointer:coarse)').matches)document.body.classList.add('coarse');

/* ================================================================
   전역 클릭/터치 쿨타임 (0.5초)
   ================================================================ */
const INT_SEL='button,.slot,#mmWrap,.cbtn,[data-act],[data-buy]';
let lastTapT=0,armedClickAt=0;
function tapOK(){
 const n=performance.now();
 if(n-lastTapT<500)return false;
 lastTapT=n;
 return true}
function guardPD(e){
 if(state!=='play')return;
 const el=e.target;
 if(!el||!el.closest||!el.closest(INT_SEL))return;
 if(tapOK()){armedClickAt=performance.now();return}
 armedClickAt=0;
 e.stopPropagation()}
function guardClick(e){
 if(state!=='play')return;
 const el=e.target;
 if(!el||!el.closest||!el.closest(INT_SEL))return;
 if(armedClickAt&&performance.now()-armedClickAt<700){armedClickAt=0;return}
 if(tapOK())return;
 e.stopPropagation()}
/* Independent controls must not share a global touch cooldown. */
/* Equip and action operations maintain their own state guards. */

/* ================================================================
   저장 / 불러오기 / 환경설정
   ================================================================ */
function saveGame(){
 if(state!=='play'||player.dead)return;
 try{
  const d={v:4,savedAt:Date.now(),seed,lang:LANG,muted,uid,gameT,exp,groundEquip,groundRes,
   px:player.x,py:player.y,hp:player.hp,lvl:player.lvl,xp:player.xp,res:player.res,pots:player.pots,
   fish:player.fish,
   equip:player.equip,destroyed,looted,caveLooted:[...caveLooted],ruinDone:[...ruinDone],
   landmarks:[...landmarks.entries()],seenBiomes:[...seenBiomes],farthest,
   quests,starActive,starT,
   gifted:[...giftedSet],explored:[...explored.entries()]};
  DrifterPlatform.storage.setItem(SAVE_KEY,JSON.stringify(d));
  updateSaveWarning();
 }catch(e){updateSaveWarning(true)}}
function persistPrefs(){
 try{DrifterPlatform.storage.setItem(PREF_KEY,JSON.stringify({lang:LANG,muted}))}catch(e){}}
function hasSave(){try{return !!DrifterPlatform.storage.getItem(SAVE_KEY)}catch(e){return false}}
function loadSave(){
 try{
  const d=JSON.parse(DrifterPlatform.storage.getItem(SAVE_KEY));
  if(!validSave(d))return false;
  seed=d.seed;uid=d.uid||0;gameT=d.gameT||0;
  exp=Object.assign(newExpedition(),d.exp||{});restoreGround=d.groundEquip||null;restoreResources=d.groundRes||[];islandCache.clear();
  player.x=d.px;player.y=d.py;player.hp=d.hp;player.lvl=d.lvl;player.xp=d.xp;
  player.res=Object.assign(defaultRes(),d.res||{});
  if(d.exp?.firstGatherDone==null&&Object.values(player.res).some(n=>Number(n)>0))exp.firstGatherDone=true;
  player.pots=Object.assign({heal:0,tea:0},d.pots||{});
  player.fish=d.fish||{};
  player.equip=d.equip.map(e=>e||null);player.dead=false;player.kbx=player.kby=0;player.stam=100;player.invuln=2;
  if(player.hp<=0){player.hp=30;player.x=camp.x+14;player.y=camp.y+14;exp.sailing=false;}
  destroyed=d.destroyed||{};looted=d.looted||{};
  caveLooted=new Set(d.caveLooted||[]);
  ruinDone=new Set(d.ruinDone||[]);
  landmarks=new Map(d.landmarks||[]);
  seenBiomes=new Set(d.seenBiomes||[]);
  farthest=d.farthest||0;
  quests=(d.quests&&d.quests.length)?d.quests:[];
  for(const q of quests)delete q.done;
  starActive=d.starActive||null;
  starT=d.starT!=null?d.starT:70;
  giftedSet=new Set(d.gifted||[]);explored=new Map(d.explored||[]);
 }catch(e){return false}
 return true}

/* ================================================================
   화면 꺠짐/백그라운드 복귀 대응
   ================================================================ */
function onResume(){
 resize();
 last=0;
 terrainLRU.clear();
 terrainFullRebuild=true;
 if(state==='play'){
  viewChunks();
  drawMinimap();
  if(mapOpen)drawBigMap()}}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)saveGame();
 else onResume()});
window.addEventListener('pageshow',e=>{if(e.persisted)onResume()});
window.addEventListener('focus',()=>{last=0});

/* ================================================================
   시작 / 언어 / 모달
   ================================================================ */
function applyLang(){
 document.documentElement.lang=LANG;
 document.querySelectorAll('[data-i18n]').forEach(el=>{
  const k=el.dataset.i18n;
  if(I18N[LANG][k]!==undefined)el.textContent=typeof I18N[LANG][k]==='function'?'':I18N[LANG][k]});
 document.querySelectorAll('[data-v-move]').forEach(el=>el.textContent=t('vMove'));
 document.querySelectorAll('[data-v-run]').forEach(el=>el.textContent=t('vRun'));
 document.querySelectorAll('[data-v-act]').forEach(el=>el.textContent=t('vAct'));
 document.querySelectorAll('[data-v-use]').forEach(el=>el.textContent=t('vUse'));
 document.querySelectorAll('[data-v-bag]').forEach(el=>el.textContent=t('vBag'));
 document.querySelectorAll('[data-v-item]').forEach(el=>el.textContent=t('vItem'));
 document.querySelectorAll('[data-v-map]').forEach(el=>el.textContent=t('vMap'));
 document.querySelectorAll('[data-v-pause]').forEach(el=>el.textContent=t('vPause'));
 $('gameTitle').textContent=LANG==='ko'?'떠돌이 · 잔광의 섬':'DRIFTER · ECHO ISLES';
 $('btnLang').textContent=LANG==='ko'?'EN':'한';
 $('btnLang2').textContent=$('btnLang').textContent;
 $('rotateTxt').textContent=t('rotateTxt');
 $('tabBag').textContent=t('pBag');
 $('tabCraft').textContent=t('pCraft');
 $('mapTitle').textContent=t('mapTitle');
 $('pauseTitle').textContent=t('pauseTitle');
 $('btnTut').title=t('tutBtnTitle');
 renderPauseStats();
 buildMapLegend();
 $('pauseHint').textContent=t('pauseHint');
 $('btnResume').textContent=t('pauseResume');
 $('btnPauseHelp').textContent=t('pauseHint2');
 $('btnPause').title=t('pauseTitle');
 $('btnBag').title=t('pBag');
 $('btnCont').style.display=hasSave()?'':'none';
 const hb=$('hintBar');
 if(hb.style.display==='block')hb.textContent=isCoarse()?t('hintMob'):t('hintDesk');
 if(tut.active)tutShowStep();
 refreshCtrlLabels();renderSlots();renderStatSum();renderRes();renderXP();renderQuickbar();
 if(invOpen)renderPanel();
 if(mapOpen)drawBigMap();
 $('sndWave').style.display=muted?'none':''}
function toggleLang(){LANG=LANG==='ko'?'en':'ko';applyLang();sfx('ui');
 endDialog();closeInv();persistPrefs();saveGame()}
 $('btnLang').onclick=toggleLang;$('btnLang2').onclick=toggleLang;
 $('btnMute').onclick=()=>{muted=!muted;$('sndWave').style.display=muted?'none':'';sfx('ui');persistPrefs();saveGame()};
function toggleModal(force){
 const show=force!==undefined?force:!modalOpen;
 modalOpen=show;
 $('modal').classList.toggle('show',show);
 syncPaused()}
 $('btnHelp').onclick=()=>{ensureAudio();toggleModal(true);sfx('ui')};
 $('btnCloseM').onclick=()=>toggleModal(false);
 $('modal').addEventListener('click',e=>{if(e.target===$('modal'))toggleModal(false)});
let wipeArmed=false;
 $('btnWipe').onclick=()=>{
 if(!wipeArmed){wipeArmed=true;$('btnWipe').textContent=t('wipeConfirm');
  setTimeout(()=>{wipeArmed=false;$('btnWipe').textContent=t('wipe')},2500);return}
 try{DrifterPlatform.storage.removeItem(SAVE_KEY)}catch(e){}
 wipeArmed=false;$('btnWipe').textContent=t('wipe');
 $('btnCont').style.display='none';toast(t('erased'),'small')};

function initWorld(){
 chunks.clear();terrainLRU.clear();
 groundEquip=[];groundRes=[];particles=[];floaters=[];ambient=[];
 nearItems=[];nearSig='';prevNearUids=new Set();
 replaceState=null;fishing=null;
 closeInv();closeMap();togglePause(false);
 viewChunks();
 if(starActive){
  if(!landmarks.has('star'))landmarks.set('star',{t:'star',x:starActive.x,y:starActive.y});
  addGroundEquip({eq:starActive.eq,x:starActive.x,y:starActive.y,ttl:null,star:true,uid:++uid,spawnT:gameT})}
 cam.x=player.x;cam.y=player.y;
 const pcx=Math.floor(player.x/CS),pcy=Math.floor(player.y/CS);
 const startRevealRadius=farthest<CS*1.5?2:1;
 for(let j=-startRevealRadius;j<=startRevealRadius;j++)for(let i=-startRevealRadius;i<=startRevealRadius;i++){
  const key=(pcx+i)+','+(pcy+j);
  if(!explored.has(key)){const c=chunks.get(key);explored.set(key,(c&&c.mapColor!=null)?c.mapColor:2)}}
 recalcStats();renderRes();renderXP();renderQuickbar();drawMinimap()}
function startPlay(){
 state='play';paused=false;
 $('title').classList.add('hide');
 initWorld();
 const hb=$('hintBar');
 hb.textContent=isCoarse()?t('hintMob'):t('hintDesk');
 hb.style.display='block';hb.style.opacity=1;
 setTimeout(()=>{hb.style.opacity=0;setTimeout(()=>hb.style.display='none',1100)},9000);
 saveGame()}
 function distributionBreak(action,placement){return window.DrifterGameDistribution?.runAfterAd?window.DrifterGameDistribution.runAfterAd(action,placement):action()}
 $('btnNew').onclick=()=>{
 ensureAudio();sfx('ui');
 if(hasSave()){$('confirmNew').classList.add('show');return}
 distributionBreak(freshStart,'new-journey')};
function freshStart(){
 closeActionMenu();closeInv();endDialog();modalOpen=false;mapOpen=false;pauseOpen=false;releaseControls();$('modal').classList.remove('show');
 exp=newExpedition();restoreGround=null;restoreResources=[];islandCache.clear();forgeTier=0;gameT=0;
 seed=window.DrifterMultiplayer?.getWorldSeed?.()||Math.floor(Math.random()*1e9)+1;
 Object.assign(player,{x:268,y:268,hp:30,stam:100,lvl:1,xp:0,invuln:0,dead:false,exhausted:false});
 player.res=defaultRes();player.pots={heal:0,tea:0};player.fish={};
 player.equip=[{base:'pickaxe',opts:[],h1:1,h2:2,id:++uid},null,null];
 destroyed={};looted={};caveLooted=new Set();ruinDone=new Set();
 landmarks=new Map();seenBiomes=new Set();farthest=0;
 quests=initQuests();starActive=null;starT=rand(50,90);
 giftedSet=new Set();explored=new Map();
 startPlay();
 startJourneyTutorial();}
 $('cnYes').onclick=()=>{$('confirmNew').classList.remove('show');distributionBreak(freshStart,'new-journey')};
 $('cnNo').onclick=()=>{$('confirmNew').classList.remove('show');sfx('ui')};
 $('btnCont').onclick=()=>{ensureAudio();sfx('ui');return distributionBreak(()=>{
 if(loadSave()){
  if(!quests.length)quests=initQuests();
  applyLang();startPlay()}else toast(L('저장을 읽지 못했습니다. 설정에서 백업을 가져오거나 새 여정을 선택하세요.','Save could not be read. Import a backup in Settings or choose New journey.'))},'continue-journey')};

/* DRIFTER · Echo Isles 1.0 — self-contained expedition expansion. */
const REGIONS=[
 {d:0,ko:'모닥불 주변',en:'Hearthlands',power:1,p3:.06,p2:.22,p1:.32,color:'#91ae72'},
 {d:200,ko:'외곽 들판',en:'Outer Fields',power:1.15,p3:.10,p2:.27,p1:.33,color:'#77b8a3'},
 {d:600,ko:'깊은 야생',en:'Deep Wilds',power:1.35,p3:.16,p2:.31,p1:.31,color:'#86b9cf'},
 {d:1200,ko:'잊힌 변경',en:'Forgotten March',power:1.60,p3:.24,p2:.34,p1:.28,color:'#b39acb'},
 {d:2200,ko:'미지의 땅',en:'Uncharted',power:1.90,p3:.32,p2:.37,p1:.23,color:'#d8b77d'}];
const EFFECTS={
 wader:{ko:'물안개 걸음',en:'Mistwalker',dko:'얕은 물에서 이동 감속이 사라집니다.',den:'Ignore shallow-water slowdown.'},
 vein:{ko:'메아리 채굴',en:'Ore Echo',dko:'근처 광맥의 방향을 표시합니다.',den:'Reveal the direction of nearby ore.'},
 guide:{ko:'길잡이',en:'Wayfinder',dko:'근처 미조사 유적의 방향을 표시합니다.',den:'Sense nearby unopened ruins.'},
 return:{ko:'귀환',en:'Homeward',dko:'귀환 버튼으로 마지막 조사 유적에 복귀. 재사용 90초.',den:'Recall to your last ruin. Cooldown: 90s.'},
 starfish:{ko:'별빛 수확',en:'Star Harvest',dko:'희귀 물고기를 잡으면 다음 채집 재료 +3.',den:'Rare fish grant +3 resources on your next harvest.'}};
const L=(ko,en)=>LANG==='ko'?ko:en;
function newExpedition(){return {raft:false,sailing:false,shore:null,glass:0,compass:false,claimed:[],runes:{},stash:[],shops:{},blueprint:0,shards:[0,0,0,0,0],enemyDead:{},found:[],seeds:[],lastRuin:null,recallAt:0,harvestBonus:0,lastRegion:0,firstGatherDone:false};}
let exp=newExpedition(),restoreGround=null,restoreResources=[],forgeTier=0,hudClock=0,pruneClock=0;
const islandCache=new Map();
const ISLE_SPAN=240;
function distanceM(x,y){return Math.hypot(x-camp.x,y-camp.y)/TILE}
function tierAt(x,y){const d=distanceM(x,y);let t=0;for(let i=1;i<REGIONS.length;i++)if(d>=REGIONS[i].d)t=i;return t}
function lootContext(x,y,source){return{x,y,source,tier:tierAt(x,y)}}
function hasEffect(k){return player.equip.some(e=>e&&e.effect===k)}
function scaledStat(k,v,power){return ['atk','vit','stam'].includes(k)?Math.max(1,Math.round(v*power)):v}
function equipBaseStats(eq){const base=BASES[eq.base].stats,p=eq.power||1,out={};for(const k in base)out[k]=scaledStat(k,base[k],p);return out}
function enemyInfo(e){const b=ENEMY_INFO[e.type];if(!b)return null;const tier=e.tier||0,info={...b,dmg:Math.round(b.dmg*(1+.12*tier)*(e.elite?1.25:1)),xp:Math.round(b.xp*(1+.25*tier)*(e.elite?1.7:1)),speed:b.speed*(1+Math.min(.06,tier*.015)),attackCooldown:1};if(window.DrifterSurvival&&!window.DrifterSurvival.isDarkspawn(e)){const buff=window.DrifterSurvival.nightBuff?.(e);if(buff){info.dmg=Math.round(info.dmg*1.5);info.speed*=1.35;info.attackCooldown=.65}}else if(window.DrifterSurvival?.isDarkspawn?.(e))info.attackCooldown=.85;return info}
function rollGearOptions(rng,minOpts,context){
 const tier=clamp(context.tier||0,0,4),r=REGIONS[tier];
 const luck=['world','shop','island'].includes(context.source)?0:clamp(stats.luck||0,0,40);
 const bonus=.10*luck/(luck+20),p3=r.p3+bonus,p2=r.p2,p1=r.p1-bonus;
 const roll=rng();let n=roll<p3?3:roll<p3+p2?2:roll<p3+p2+p1?1:0;n=Math.max(n,minOpts<0?0:Math.min(3,minOpts));
 const bio=biomeAt(Math.floor(context.x/TILE),Math.floor(context.y/TILE));
 const pref=bio===B_FOREST?['vit','regen']:bio===B_ROCK?['atk','range']:bio===B_WATER||bio===B_SHALLOW?['spd','stam']:['luck','vit'];
 const pool=Object.keys(OPT_RANGE),out=[];
 for(let i=0;i<n;i++){let k;if(rng()<.45){const left=pref.filter(k=>pool.includes(k));k=left.length?left[Math.floor(rng()*left.length)]:null}if(!k)k=pool[Math.floor(rng()*pool.length)];pool.splice(pool.indexOf(k),1);const [a,b]=OPT_RANGE[k];out.push({k,v:scaledStat(k,a+Math.floor(rng()*(b-a+1)),r.power)})}
 return out;
}
function createGear(base,rng,minOpts,context){
 context=context||lootContext(player.x,player.y,'field');const tier=clamp(context.tier||0,0,4),r=REGIONS[tier];
 const eq={base,opts:rollGearOptions(rng,minOpts,context),h1:Math.floor(rng()*1e9),h2:Math.floor(rng()*1e9),id:++uid,tier,power:r.power,origin:Math.round(distanceM(context.x,context.y)),source:context.source};
 if(context.source==='island'||(tier>=1&&eq.opts.length===3&&rng()<.12+tier*.025)){const b=biomeAt(Math.floor(context.x/TILE),Math.floor(context.y/TILE));let pool=Object.keys(EFFECTS);if(b===B_FOREST)pool.push('starfish','guide');if(b===B_ROCK)pool.push('vein','vein');if(b===B_SAND||b===B_WATER)pool.push('wader','return');eq.effect=pool[Math.floor(rng()*pool.length)]}
 return eq;
}
makeEquip=function(rng,minOpts=-1,context){let r=rng()*BASE_W.reduce((s,e)=>s+e[1],0),base='pickaxe';for(const e of BASE_W){r-=e[1];if(r<=0){base=e[0];break}}return createGear(base,rng,minOpts,context)};
makeEquipFixed=function(base,rng,minOpts=-1,context){return createGear(base,rng,minOpts,context)};
const originalEquipName=equipName;
equipName=function(eq){return originalEquipName(eq)+(eq.effect?' ✧':'')};
const originalStatLines=statLinesHTML;
statLinesHTML=function(eq){let h='<span class="expbadge">'+L('지역 단계 ','Region ')+((eq.tier||0)+1)+' · '+(eq.origin||0)+'m</span><br>'+originalStatLines(eq);if(eq.effect&&EFFECTS[eq.effect]){const e=EFFECTS[eq.effect];h+='<br><span style="color:#afdfcb">✧ '+e[LANG]+'</span><br><span class="expdesc">'+(LANG==='ko'?e.dko:e.den)+'</span>'}return h};
const originalRecalc=recalcStats;
recalcStats=function(){originalRecalc();stats.speed=Math.min(stats.speed,140);stats.luck=Math.min(stats.luck,40);stats.atkRange=Math.min(stats.atkRange,90);stats.pickup=Math.min(stats.pickup,88);stats.regen=Math.min(stats.regen,28);stats.maxStam=Math.min(stats.maxStam,320);player.stam=Math.min(player.stam,stats.maxStam)};

/* Islands own a bounded ocean ring. Their positions are deterministic per seed. */
function tutorialIsland(){return{id:'isle:first',tx:82,ty:20,rx:14,ry:11,tutorial:true,variant:0}}
function islandSpec(gx,gy){
 const key=seed+':'+gx+','+gy;if(islandCache.has(key))return islandCache.get(key);
 let a=null;if(!(gx===0&&gy===0)&&hash2(gx,gy,seed+850)<.56){a={id:'isle:'+gx+','+gy,tx:gx*ISLE_SPAN+65+Math.floor(hash2(gx,gy,seed+851)*105),ty:gy*ISLE_SPAN+65+Math.floor(hash2(gx,gy,seed+852)*105),rx:12+Math.floor(hash2(gx,gy,seed+853)*10),ry:11+Math.floor(hash2(gx,gy,seed+854)*9),variant:Math.floor(hash2(gx,gy,seed+855)*3)}}
 if(islandCache.size>=512)islandCache.delete(islandCache.keys().next().value);islandCache.set(key,a);return a;
}
function nearbyIslands(tx,ty,r=1){const a=[tutorialIsland()],gx=Math.floor(tx/ISLE_SPAN),gy=Math.floor(ty/ISLE_SPAN);for(let y=gy-r;y<=gy+r;y++)for(let x=gx-r;x<=gx+r;x++){const i=islandSpec(x,y);if(i)a.push(i)}return a}
function islandAt(x,y){const tx=x/TILE,ty=y/TILE;for(const i of [tutorialIsland(),islandSpec(Math.floor(tx/ISLE_SPAN),Math.floor(ty/ISLE_SPAN))]){if(i&&((tx-i.tx)/i.rx)**2+((ty-i.ty)/i.ry)**2<1)return i}return null}
const originalBiome=biomeAt;
biomeAt=function(tx,ty){
 if(Math.hypot(tx-16,ty-16)<27)return B_MEADOW;
 if(tx>=32&&tx<=46&&ty>=16&&ty<=23)return tx>=44?B_SAND:B_MEADOW;
 const first=tutorialIsland();const ia=(tx-first.tx)/(first.rx+27),ib=(ty-first.ty)/(first.ry+24);
 let i=ia*ia+ib*ib<1.12?first:islandSpec(Math.floor(tx/ISLE_SPAN),Math.floor(ty/ISLE_SPAN));
 if(i){const dx=tx-i.tx,dy=ty-i.ty,land=(dx/i.rx)**2+(dy/i.ry)**2,water=(dx/(i.rx+27))**2+(dy/(i.ry+24))**2;
  if(land<.68)return i.variant===1&&land>.20?B_ROCK:i.variant===2&&land>.25?B_FOREST:B_MEADOW;
  if(land<1)return B_SAND;if(land<1.23)return B_SHALLOW;if(water<.88)return B_WATER;if(water<1)return B_SHALLOW;
 }
 return originalBiome(tx,ty);
};
function islandNodes(i){return[{x:(i.tx+.5)*TILE,y:(i.ty+.5)*TILE,rune:-1},...[-2.3,-.2,1.8].map((a,n)=>({x:(i.tx+Math.cos(a)*i.rx*.57+.5)*TILE,y:(i.ty+Math.sin(a)*i.ry*.57+.5)*TILE,rune:n}))]}
const originalGetChunk=getChunk;
getChunk=function(cx,cy){
 const key=cx+','+cy;if(chunks.has(key))return chunks.get(key);const c=originalGetChunk(cx,cy);
 const lootSeen=new Set();groundEquip=groundEquip.filter(g=>{if(!g.ck)return true;const id=g.ck+':'+g.idx;if(lootSeen.has(id))return false;lootSeen.add(id);return true});
 c.nodes=c.nodes.filter(n=>{const i=islandAt(n.x,n.y);return !i||((n.x/TILE-i.tx)/i.rx)**2+((n.y/TILE-i.ty)/i.ry)**2>.82});
 if(cx===0&&cy===0){for(let j=0;j<7;j++){const idx=8000+j;if(!c.nodes.some(n=>n.idx===idx))c.nodes.push({idx,type:'tree',x:(26+j*2)*TILE,y:(j%2?12:26)*TILE,hp:4,maxHp:4,shake:0,dead:(destroyed[key]||[]).includes(idx),looted:false,chunkKey:key,isNode:true})}}
 if(cx===0&&cy===0)for(let j=0;j<4;j++){const idx=8100+j;c.nodes.push({idx,type:'rock',x:(22+j*2)*TILE,y:31*TILE,hp:6,maxHp:6,shake:0,dead:(destroyed[key]||[]).includes(idx),looted:false,chunkKey:key,isNode:true})}
 for(const i of nearbyIslands(cx*CH+CH/2,cy*CH+CH/2,0)){for(const [j,p] of islandNodes(i).entries()){if(Math.floor(p.x/CS)!==cx||Math.floor(p.y/CS)!==cy)continue;const idx=9000+j;const lit=p.rune<0?exp.claimed.includes(i.id):(exp.runes[i.id]||[]).includes(p.rune);c.nodes.push({idx,type:'ruin',x:p.x,y:p.y,hp:1,maxHp:1,shake:0,dead:false,looted:lit,chunkKey:key,isNode:true,islandId:i.id,island:i,rune:p.rune})}}
 c.enemies=c.enemies.filter((e,n)=>{e.originId=key+':'+n;e.tier=tierAt(e.x,e.y);e.homeX=e.x;e.homeY=e.y;e.elite=e.tier>=2&&hash2(cx*11+n,cy,seed+899)<.12;e.hp=e.maxHp=Math.round(e.hp*(1+.20*e.tier)*(e.elite?1.4:1));return !exp.enemyDead[e.originId]&&!islandAt(e.x,e.y)});
 if(c.npc&&islandAt(c.npc.x,c.npc.y))c.npc=null;return c;
};
const originalInvestigate=investigateRuin;
investigateRuin=function(n){
 if(!n||n.looted)return;
 if(!n.islandId){originalInvestigate(n);exp.lastRuin={x:n.x,y:n.y};rewardSurvey(n.x,n.y,1);saveGame();return}
 const id=n.islandId;
 if(n.rune>=0){const a=exp.runes[id]||(exp.runes[id]=[]);if(!a.includes(n.rune))a.push(n.rune);n.looted=true;ringFx(n.x,n.y-8,'#b4e7d2');sfx('trade');toast(L('잔광의 룬 ','Echo rune ')+a.length+'/3');saveGame();return}
 if(exp.claimed.includes(id)){openMap();return}
 if((exp.runes[id]||[]).length<3){toast(L('섬의 룬석 세 개를 먼저 켜세요.','Light the three island runestones first.'));return}
 const rng=chunkRng(n.island.tx,n.island.ty,912),context=lootContext(n.x,n.y,'island'),eq=makeEquip(rng,3,context);
 exp.claimed.push(id);n.looted=true;ruinDone.add(n.chunkKey+':'+n.idx);exp.lastRuin={x:n.x,y:n.y};exp.glass+=3+(context.tier>=2?1:0);if(!exp.seeds.includes(n.island.variant))exp.seeds.push(n.island.variant);rewardSurvey(n.x,n.y,3);
 addGroundEquip({eq,x:n.x+22,y:n.y+20,ttl:null,uid:++uid,spawnT:gameT,islandReward:id});landmarks.set(n.chunkKey+':'+n.idx,{t:'ruin',x:n.x,y:n.y,island:true});
 addXP(25+context.tier*12);ringFx(n.x,n.y-12,'#b4e7d2');burst(n.x,n.y-14,['#b4e7d2','#f0c468','#eee2be'],30);toast(L('잔광섬 보상! 장비 · 조류 유리 +','Island cleared! Gear · Tideglass +')+(3+(context.tier>=2?1:0)));questEvent('ruin');saveGame();if(invOpen)renderPanel();
};
function rewardSurvey(x,y,n){const tier=tierAt(x,y);exp.blueprint=Math.max(exp.blueprint,tier);if(tier>0)exp.shards[tier]=(exp.shards[tier]||0)+n}
const originalBreak=breakNode;
breakNode=function(n){const bonus=exp.harvestBonus||0;originalBreak(n);if(n.type==='crystal'||n.type==='iron')rewardSurvey(n.x,n.y,1);if(bonus){player.res[NODE_INFO[n.type].res]+=bonus;exp.harvestBonus=0;toast(L('별빛 수확 +','Star Harvest +')+bonus);renderRes()}saveGame()};
const originalDamageEnemy=damageEnemy;
damageEnemy=function(e,d){const killing=e.hp<=d;if(killing&&e.originId)exp.enemyDead[e.originId]=true;originalDamageEnemy(e,d);if(killing&&e.elite){rewardSurvey(e.homeX,e.homeY,2);saveGame()}};
const originalCave=enterCave;
enterCave=function(n){if(!n||n.looted)return;originalCave(n);rewardSurvey(n.x,n.y,1);saveGame()};
const originalDropGround=dropGroundItem;
dropGroundItem=function(g){if(!g)return;if(g.ck){if(!looted[g.ck])looted[g.ck]=[];if(!looted[g.ck].includes(g.idx))looted[g.ck].push(g.idx);delete g.ck;delete g.idx}originalDropGround(g);saveGame()};
const originalCatch=catchFish;
catchFish=function(){const before=player.fish.herring||0,before2=player.fish.carp||0;originalCatch();if(hasEffect('starfish')&&((player.fish.herring||0)>before||(player.fish.carp||0)>before2)){exp.harvestBonus=3;toast(L('다음 채집 재료 +3','Next harvest: +3 resources'));saveGame()}};

/* Sailing keeps the same movement input. Boarding is an explicit action. */
const originalBlocked=blockedAt;
blockedAt=function(x,y){if(!exp.sailing)return originalBlocked(x,y);const b=biomeAt(Math.floor(x/TILE),Math.floor((y+6)/TILE));return b!==B_WATER&&b!==B_SHALLOW&&b!==B_SAND};
function nearWater(){return findFishSpot()}
function toggleRaft(){
 if(state!=='play'||(paused&&!invOpen)||dlg||player.dead)return;
 if(!exp.raft){if(!canAfford({wood:12,stone:4})){openInv('craft');toast(L('뗏목: 나무 12 · 돌 4','Raft: 12 wood · 4 stone'));return}pay({wood:12,stone:4});exp.raft=true;sfx('trade');toast(L('뗏목 완성! 물가에서 타세요.','Raft ready! Board at the shore.'));updateVoyageHud();saveGame();return}
 if(fishing)cancelFishing(true);
 if(exp.sailing){const candidates=[];for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){const px=(Math.floor(player.x/TILE)+x)*TILE+8,py=(Math.floor(player.y/TILE)+y)*TILE+5;const b=biomeAt(Math.floor(px/TILE),Math.floor((py+6)/TILE));if(b!==B_WATER&&Math.hypot(px-player.x,py-player.y)<=38)candidates.push({x:px,y:py,d:Math.hypot(px-player.x,py-player.y)})}candidates.sort((a,b)=>a.d-b.d);exp.sailing=false;const p=candidates.find(p=>!blockedAt(p.x,p.y));if(!p){exp.sailing=true;toast(L('얕은 물이나 해안에 접근하세요.','Approach shallow water or the shore.'));return}player.x=p.x;player.y=p.y;toast(L('땅에 내렸습니다.','Back on land.'))}
 else{const p=nearWater();if(!p){toast(L('물가에서 뗏목을 띄우세요.','Launch the raft at the shore.'));return}exp.shore={x:player.x,y:player.y};exp.sailing=true;player.x=p[0];player.y=p[1]-6;toast(L('출항! 해안 근처에서 행동을 눌러 내리세요.','Sailing! Use Interact near the coast to disembark.'))}
 closeInv();saveGame();updateVoyageHud();
}
function recallOrSignal(){
 if(state!=='play'||paused||dlg||player.dead)return;
 if(exp.sailing&&exp.shore){exp.sailing=false;player.x=exp.shore.x;player.y=exp.shore.y;player.kbx=player.kby=0;cam.x=player.x;cam.y=player.y;toast(L('출항했던 해안으로 돌아왔습니다.','Returned to the departure shore.'));saveGame();return}
 if(hasEffect('return')){if(gameT<exp.recallAt){toast(L('귀환 재사용 대기: ','Recall cooldown: ')+Math.ceil(exp.recallAt-gameT)+'s');return}if(activeEnemies().some(e=>e.aggroed&&Math.hypot(e.x-player.x,e.y-player.y)<160)){toast(L('적에게서 벗어난 뒤 귀환하세요.','Leave combat before recalling.'));return}exp.recallAt=gameT+90;warpTo(exp.lastRuin||camp);saveGame();return}
 openInv('craft');
}
$('raftBtn').onclick=()=>{ensureAudio();toggleRaft()};$('signalBtn').onclick=recallOrSignal;
addEventListener('keydown',e=>{if(e.repeat||state!=='play')return;if(e.code==='KeyV')toggleRaft();if(e.code==='KeyR')recallOrSignal()});
const originalInteract=interact;
interact=function(){if(exp.sailing){if(fishing){originalInteract();return}toggleRaft();return}originalInteract()};

/* Stable merchant stock and material-based forging. */
buildShop=function(){
 const npc=activeShopNpc||(dlg&&dlg.npc);return makeShopFor(npc||{id:'fallback',x:player.x,y:player.y})
};
function makeShopFor(npc){if(exp.shops[npc.id])return exp.shops[npc.id];const rng=chunkRng(Math.floor(npc.x/CS),Math.floor(npc.y/CS),944),context=lootContext(npc.x,npc.y,'shop'),base=BASE_KEYS[Math.floor(rng()*BASE_KEYS.length)],minOpts=context.tier>=2?2:1;const shop=[{kind:'equip',base,minOpts,eq:makeEquipFixed(base,rng,minOpts,context),price:{iron:3+context.tier,fang:2+context.tier},stock:1},{kind:'heal',price:{jelly:2},stock:-1},{kind:'tea',price:{berry:2,fang:1},stock:-1}];exp.shops[npc.id]=shop;return shop}
const originalStartDialog=startDialog;let activeShopNpc=null;
startDialog=function(npc){activeShopNpc=npc;originalStartDialog(npc);activeShopNpc=null;if(npc.persona==='trader'){dlg.shop=makeShopFor(npc);saveGame()}};
const originalShowShop=showShopUI;
showShopUI=function(){originalShowShop();if(dlg&&dlg.shop){const el=$('dlg').querySelector('.dlgShop');let h='';for(const it of dlg.shop)if(it.eq)h+='<div class="expcard"><div>'+equipName(it.eq)+'</div><div class="pstats">'+statLinesHTML(it.eq)+'</div></div>';el.innerHTML+=h}};
craftGear=function(tierIdx){const r=GEAR_TIERS[tierIdx],ft=clamp(forgeTier,0,exp.blueprint);if(!canAfford(r.cost)||(ft>0&&(exp.shards[ft]||0)<2)){sfx('deny');return}pay(r.cost);if(ft>0)exp.shards[ft]-=2;const eq=makeEquipFixed(craftBase,Math.random,r.minOpts,{x:camp.x,y:camp.y,source:'craft',tier:ft});eq.origin=REGIONS[ft].d;addGroundEquip({eq,x:player.x+16,y:player.y+18,ttl:null,uid:++uid,spawnT:gameT});sfx('trade');toast(t('toastCrafted'));renderPanel();saveGame()};
const originalCraftHTML=craftHTML;
craftHTML=function(){
 const raftCost={wood:12,stone:4};
 let h='<div class="expcard"><h4>'+L('원정 장비','Expedition tools')+'</h4><div class="expdesc">'+L('뗏목은 영구 사용 · 출항 해안 복귀 가능','Reusable raft · return to your departure shore')+'</div><button data-exp="raft" '+(exp.raft||!canAfford(raftCost)?'disabled':'')+'>'+L(exp.raft?'뗏목 보유':'뗏목 제작 · 나무 12 / 돌 4',exp.raft?'Raft owned':'Build raft · 12 wood / 4 stone')+'</button></div>';
 const regionUnlocked=exp.blueprint>0||exp.glass>=3;
 if(regionUnlocked&&!regionCraftSeenUnlocked){regionCraftOpen=true;regionCraftSeenUnlocked=true;}
 h+='<details class="craft-fold '+(regionUnlocked?'unlocked':'locked')+'" id="regionCraftRecipes" '+(regionCraftOpen?'open':'')+'><summary>'+L('섬 탐험 · 지역 제작','Island & regional crafting')+'<span class="craft-lock">'+(regionUnlocked?L('새 설계도','UNLOCKED'):L('잠금 · 섬 보상 필요','LOCKED · Island reward'))+'</span></summary>';
 h+='<div class="expcard"><h4>'+L('탐험 도구','Expedition tools')+'</h4><button data-exp="compass" '+(exp.compass||exp.glass<3?'disabled':'')+'>'+L(exp.compass?'조류 나침반 보유':'나침반 제작 · 조류 유리 3',exp.compass?'Compass owned':'Craft compass · 3 Tideglass')+'</button><div class="expdesc">'+L('조류 유리: ','Tideglass: ')+exp.glass+'</div></div>';
 h+='<div class="expcard"><h4>'+L('제작 지역 단계','Forging region')+'</h4><div class="expdesc">'+L('먼 지역의 철·수정·유적에서 조각과 설계도를 얻습니다. 단계 II 이상은 제작마다 해당 조각 2개를 사용합니다.','Find blueprints and shards in distant ore and ruins. Region II+ uses 2 matching shards per craft.')+'</div><div class="exprow"><select id="forgeSelect" aria-label="Forging region">';
 for(let i=0;i<=exp.blueprint;i++)h+='<option value="'+i+'" '+(forgeTier===i?'selected':'')+'>'+L('단계 ','Region ')+(i+1)+' · '+REGIONS[i][LANG]+(i?' · '+(exp.shards[i]||0)+L(' 조각',' shards'):'')+'</option>';
 return h+'</select></div></div></details>'+originalCraftHTML()};
function atCamp(){return Math.hypot(player.x-camp.x,player.y-camp.y)<120}
function itemTotals(eq){const o=equipBaseStats(eq);for(const a of eq.opts)o[a.k]=(o[a.k]||0)+a.v;return o}
function compareHTML(a,b){const aa=itemTotals(a),bb=b?itemTotals(b):{},parts=[];for(const k of Object.keys(STAT_META)){const d=(aa[k]||0)-(bb[k]||0);if(d)parts.push(statName(k)+' '+(d>0?'+':'')+d)}return '<div class="compare">'+L('교체 시: ','On swap: ')+parts.join(' · ')+(a.effect!==b?.effect?' · '+L('고유 효과 변경','Effect changes'):'')+'</div>'}
const originalBag=bagHTML;
bagHTML=function(){let h=bagFoldStart('log',L('원정 기록','Expedition log'))+'<div class="expcard"><h4>'+L('원정 기록','Expedition log')+'</h4><div class="expdesc">'+L('섬 발견 ','Islands found ')+exp.found.length+' · '+L('제단 개방 ','Altars opened ')+exp.claimed.length+'<br>'+L('조류 유리 ','Tideglass ')+exp.glass+' · '+L('거점 식물 ','Camp plants ')+exp.seeds.length+'/3</div></div></details>';
 if(replaceState&&replaceState.slot>=0)h+=compareHTML(replaceState.g.eq,player.equip[replaceState.slot]);h+=originalBag();
 h+=bagFoldStart('chest',L('모닥불 보관함','Camp chest'))+'<div class="expcard"><h4>'+L('모닥불 보관함 ','Camp chest ')+exp.stash.length+'/12</h4>';
 if(atCamp()){for(let j=0;j<3;j++)if(player.equip[j])h+='<button data-exp="store" data-i="'+j+'">'+L('보관: ','Store: ')+equipName(player.equip[j])+'</button>';exp.stash.forEach((e,j)=>{h+='<div class="expdesc">'+equipName(e)+' · '+L('단계 ','Region ')+((e.tier||0)+1)+' <button data-exp="withdraw" data-i="'+j+'">'+L('꺼내기','Take out')+'</button></div>'})}else h+='<div class="expdesc">'+L('모닥불 근처에서 보관하거나 꺼낼 수 있습니다.','Store or withdraw gear near the campfire.')+'</div>';return h+'</div></details>'};
$('panelBody').addEventListener('change',e=>{if(e.target.id==='forgeSelect'){forgeTier=+e.target.value;renderPanel()}});
$('panelBody').addEventListener('click',e=>{const b=e.target.closest('[data-exp]');if(!b)return;const a=b.dataset.exp;if(window.DrifterMultiplayer?.sharedAction?.(a,b))return;if(a==='raft'){toggleRaft();renderPanel()}if(a==='compass'&&!exp.compass&&exp.glass>=3){exp.glass-=3;exp.compass=true;toast(L('조류 나침반이 미개방 섬을 가리킵니다.','The Tide Compass points to unopened islands.'));renderPanel();saveGame()}if(a==='store'&&atCamp()&&exp.stash.length<12){const i=+b.dataset.i;if(player.equip[i]){exp.stash.push(player.equip[i]);player.equip[i]=null;recalcStats();renderPanel();saveGame()}}if(a==='withdraw'&&atCamp()){const i=+b.dataset.i,eq=exp.stash[i];if(eq){exp.stash.splice(i,1);const slot=player.equip.indexOf(null);if(slot>=0){player.equip[slot]=eq;recalcStats()}else addGroundEquip({eq,x:camp.x+28,y:camp.y+20,ttl:null,uid:++uid,spawnT:gameT});renderPanel();saveGame()}}});
const originalOpenInv=openInv,originalCloseInv=closeInv;
openInv=function(tab){originalOpenInv(tab);document.body.classList.toggle('panel-open',invOpen)};
closeInv=function(){originalCloseInv();document.body.classList.remove('panel-open')};

/* Exploration signals and one-time discoveries. */
function bearing(x,y){const a=Math.atan2(y-player.y,x-player.x),dirs=['→','↘','↓','↙','←','↖','↑','↗'];return dirs[(Math.round(a/(Math.PI/4))+8)%8]+' '+Math.round(Math.hypot(x-player.x,y-player.y)/TILE)+'m'}
function expeditionSignal(){
 const items=[];
 if(exp.compass){for(const i of nearbyIslands(player.x/TILE,player.y/TILE,2))if(!exp.claimed.includes(i.id))items.push({x:i.tx*TILE,y:i.ty*TILE,label:L('미개방 섬','Unopened island')})}
 if(hasEffect('guide'))for(const c of nearChunkList(2))for(const n of c.nodes)if(n.type==='ruin'&&!n.looted&&!n.dead)items.push({x:n.x,y:n.y,label:L('유적','Ruin')});
 if(hasEffect('vein'))for(const n of nodeCache)if(!n.dead&&['iron','crystal'].includes(n.type))items.push({x:n.x,y:n.y,label:L('광맥','Ore')});
 items.sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
 if(items.length)return items[0].label+' '+bearing(items[0].x,items[0].y);
 if(!exp.raft){if(farthest<CS*1.5&&!exp.found.length)return L('동쪽 해안에서 바람이 불어옵니다 · 뗏목: 나무 12 / 돌 4','A breeze rises from the eastern shore · raft: 12 wood / 4 stone');return L('뗏목 준비 · 나무 12 / 돌 4 · 제작 버튼','Prepare raft · 12 wood / 4 stone · Build')}
 const t=tutorialIsland();if(!exp.claimed.includes(t.id))return L('첫 잔광섬 ','First island ')+bearing(t.tx*TILE,t.ty*TILE);
 return L('먼 지역의 유적에서 새로운 설계도를 찾으세요.','Find new blueprints in distant ruins.');
}
function updateVoyageHud(){
 $('voyage').style.display=state==='play'?'block':'none';if(state!=='play')return;
 const d=distanceM(player.x,player.y),tier=tierAt(player.x,player.y),r=REGIONS[tier],next=REGIONS[tier+1];
 $('voyageRegion').textContent=L('지역 ','Region ')+(tier+1)+' · '+r[LANG]+' · '+Math.floor(d)+'m';$('voyageRegion').style.color=r.color;
 $('voyageNext').textContent=next?L('다음 경계까지 ','Next boundary: ')+Math.max(0,Math.ceil(next.d-d))+'m':L('최심부 · 장비 성능 ×1.90','Frontier · gear power ×1.90');
 $('voyageFill').style.width=(next?clamp((d-r.d)/(next.d-r.d)*100,0,100):100)+'%';$('voyageGoal').textContent=exp.sailing?L('출항 해안으로 언제든 복귀할 수 있습니다.','You can return to your departure shore.'):expeditionSignal();
 $('raftBtn').textContent=exp.sailing?L('내리기 · V','Land · V'):exp.raft?L('뗏목 타기 · V','Board · V'):L('뗏목 제작','Build raft');
 updateRaftCraftControls();
 $('signalBtn').textContent=exp.sailing?L('해안 복귀','Return ashore'):hasEffect('return')?L('귀환 · R','Recall · R'):L('원정 제작','Expedition');
 if(tier!==exp.lastRegion){exp.lastRegion=tier;toast(r[LANG]+' · '+L('지역 단계 ','Region ')+(tier+1))}
}
function updateRaftCraftControls(){
 const b=$('raftBtn');if(!b)return;
 const ready=state==='play'&&(exp.raft||exp.sailing||canAfford({wood:12,stone:4}));
 b.disabled=!ready;b.setAttribute('aria-disabled',String(!ready));
 b.title=ready?'':L('나무 12개와 돌 4개가 필요합니다.','Requires 12 wood and 4 stone.')
}
const originalScan=scanLandmarks;
scanLandmarks=function(){originalScan();for(const i of nearbyIslands(player.x/TILE,player.y/TILE,0)){if(Math.hypot(i.tx*TILE-player.x,i.ty*TILE-player.y)>350)continue;if(!exp.found.includes(i.id)){exp.found.push(i.id);toast(L('발견: 잔광섬','Discovered: Echo Isle'));saveGame()}landmarks.set(i.id,{t:'island',x:i.tx*TILE,y:i.ty*TILE,id:i.id})}};
const originalMap=drawBigMap;
drawBigMap=function(){originalMap();if(!mapOpen)return;const g=$('bigmap').getContext('2d'),cell=MAP_CELLS[mapZoomIdx];for(const i of landmarks.values())if(i.t==='island'){const x=(i.x/CS-mapCX)*cell+mapW/2,y=(i.y/CS-mapCY)*cell+mapH/2;g.fillStyle=exp.claimed.includes(i.id)?'#c0a56e':'#b6e6d9';g.beginPath();g.moveTo(x,y-5);g.lineTo(x+5,y);g.lineTo(x,y+5);g.lineTo(x-5,y);g.closePath();g.fill()}};
const originalLegend=buildMapLegend;
buildMapLegend=function(){originalLegend();$('mapLegend').innerHTML+='<span class="li"><i style="background:#b6e6d9"></i>'+L('잔광섬','Echo Isle')+'</span><span class="st">'+L('현재 지역 단계 ','Current region ')+(tierAt(player.x,player.y)+1)+'</span>'};
const originalNear=updateNearEquip;
updateNearEquip=function(){originalNear();if(exp.sailing){$('pickupHint').style.display='none';return}const ent=nearestEnterable(64);if(ent&&ent.islandId){$('pickupHint').style.display='block';$('pickupHint').textContent=ent.rune>=0?L('행동 / E · 룬석 켜기','Use / E · Light runestone'):L('행동 / E · 제단 · 룬 ','Use / E · Altar · Runes ')+(exp.runes[ent.islandId]||[]).length+'/3'}};

/* Bounded live chunk memory; destructive changes survive regeneration. */
const originalUpdate=update;
update=function(dt){originalUpdate(dt);hudClock+=dt;pruneClock+=dt;if(hudClock>.25){hudClock=0;updateVoyageHud()}if(pruneClock>8){pruneClock=0;const cx=Math.floor(player.x/CS),cy=Math.floor(player.y/CS);if(chunks.size>100){for(const [key,c] of chunks)if(Math.max(Math.abs(c.cx-cx),Math.abs(c.cy-cy))>6){chunks.delete(key);terrainLRU.delete(key)}groundEquip=groundEquip.filter(g=>!g.ck||chunks.has(g.ck));}}};
const originalInit=initWorld;
initWorld=function(){const saved=restoreGround;originalInit();if(saved){const seen=new Set(saved.filter(g=>g.ck).map(g=>g.ck+':'+g.idx));groundEquip=groundEquip.filter(g=>!g.star&&(!g.ck||!seen.has(g.ck+':'+g.idx)));const ids=new Set(groundEquip.map(g=>g.uid));for(const g of saved){if(ids.has(g.uid))g.uid=++uid;else ids.add(g.uid);g.spawnT=gameT;addGroundEquip(g)}if(starActive&&!groundEquip.some(g=>g.star))addGroundEquip({eq:starActive.eq,x:starActive.x,y:starActive.y,ttl:null,star:true,uid:++uid,spawnT:gameT})}groundRes=restoreResources||[];restoreGround=null;restoreResources=[];updateVoyageHud()};

/* Pixel art additions reuse the original rendering palette. */
const originalTile=tilePaint;
tilePaint=function(c,lx,ly,wx,wy,b){originalTile(c,lx,ly,wx,wy,b);const t=tierAt(wx*TILE,wy*TILE);if(t>0&&b!==B_WATER){c.fillStyle=['','#4d9d8f18','#6199c01c','#8f6fb025','#d4b07325'][t];c.fillRect(lx*TILE,ly*TILE,TILE,TILE)}};
const originalDrawPlayer=drawPlayer;
drawPlayer=function(actor=player,remote=false){if((remote&&actor.sailing)||(!remote&&actor===player&&exp.sailing)){const x=Math.round(actor.x),y=Math.round(actor.y+Math.sin(gameT*3));ctx.fillStyle='#3d6b7d';ctx.fillRect(x-17,y+4,34,3);ctx.fillStyle='#61432b';ctx.fillRect(x-14,y-1,28,8);for(let n=0;n<4;n++){ctx.fillStyle=n%2?'#b18a50':'#977444';ctx.fillRect(x-14+n*7,y-2,6,9)}ctx.fillStyle='#d8b47b';ctx.fillRect(x-14,y,28,1);ctx.strokeStyle='#d2c69a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+11,y-8);ctx.lineTo(x+20+Math.sin(gameT*4)*4,y+7);ctx.stroke()}originalDrawPlayer(actor,remote)};
let gatherHintFrame=-1,gatherHintTargets=new Set();
function updateGatherHintTargets(){
 if(gatherHintFrame===frameN)return;gatherHintFrame=frameN;gatherHintTargets=new Set();
 if(state!=='play'||exp.firstGatherDone)return;
 for(const type of ['tree','rock']){let best=null,bestD=Infinity;
  for(const n of nodeCache){if(n.dead||n.islandId||n.type!==type)continue;const d=Math.hypot(n.x-player.x,n.y-player.y);if(d<=TILE*14&&d<bestD){best=n;bestD=d}}
  if(best)gatherHintTargets.add(best)}
}
function drawFirstGatherHint(n){
 updateGatherHintTargets();if(!gatherHintTargets.has(n))return;
 const x=Math.round(n.x),y=Math.round(n.y),w=n.type==='tree'?27:22,h=n.type==='tree'?25:18;
 ctx.save();ctx.globalAlpha=.28+.16*(.5+.5*Math.sin(gameT*3));ctx.fillStyle='#f0ce91';
 const l=x-Math.floor(w/2),r=l+w,t=y-h,b=y+2,s=5;
 ctx.fillRect(l,t,s,1);ctx.fillRect(l,t,1,s);ctx.fillRect(r-s,t,s,1);ctx.fillRect(r-1,t,1,s);
 ctx.fillRect(l,b-1,s,1);ctx.fillRect(l,b-s,1,s);ctx.fillRect(r-s,b-1,s,1);ctx.fillRect(r-1,b-s,1,s);
 ctx.fillRect(x-1,t-5,2,2);ctx.fillRect(x-3,t-3,2,1);ctx.fillRect(x+1,t-3,2,1);ctx.restore();
}
const originalDrawNode=drawNode;
drawNode=function(n){if(!n.islandId){originalDrawNode(n);drawFirstGatherHint(n);return}const x=Math.round(n.x),y=Math.round(n.y),lit=n.looted;shadow(x,y+2,n.rune<0?15:8,4);ctx.fillStyle='#596c68';ctx.fillRect(x-10,y-5,20,6);ctx.fillStyle='#84948b';ctx.fillRect(x-7,y-9,14,4);ctx.fillStyle=lit?'#b9e6c8':'#506768';if(n.rune>=0){ctx.fillStyle='#6f8782';ctx.fillRect(x-4,y-19,8,12);ctx.fillStyle=lit?'#b8f2db':'#557b78';ctx.fillRect(x-1,y-16,2,6);ctx.fillRect(x-3,y-14,6,2)}else{ctx.fillStyle='#607c77';ctx.fillRect(x-6,y-22,12,14);ctx.fillStyle=lit?'#e2c884':'#a9e1d2';ctx.fillRect(x-2,y-19,4,8);ctx.fillRect(x-4,y-16,8,2);const ready=(exp.runes[n.islandId]||[]).length===3;if(!lit){ctx.globalAlpha=ready?.19:.08;ctx.fillStyle='#b9e6d7';ctx.fillRect(x-4,y-110,8,88);ctx.globalAlpha=1;for(let j=0;j<3;j++){ctx.fillStyle=(exp.runes[n.islandId]||[]).includes(j)?'#b8f2db':'#3d514d';ctx.fillRect(x-9+j*7,y-29,4,3)}}}ctx.globalAlpha=1};
const originalDrawCamp=drawCamp;
drawCamp=function(){originalDrawCamp();(exp.planted||[]).forEach((s,i)=>{const x=camp.x-40+i*17,y=camp.y+16;ctx.fillStyle='#8b6541';ctx.fillRect(x-4,y-1,8,6);ctx.fillStyle='#5e935b';ctx.fillRect(x,y-12,2,12);ctx.fillRect(x-4,y-8,4,2);ctx.fillStyle=['#b8e7d5','#e1bb6c','#b29fd5'][s];ctx.fillRect(x-2,y-15,6,5)})};
const originalDrawEnemy=drawEnemy;
drawEnemy=function(e){if(e.elite){ctx.strokeStyle='#d8ba77';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(e.x,e.y+2,ENEMY_INFO[e.type].size+4,6,0,0,6.29);ctx.stroke()}originalDrawEnemy(e)};
const originalRender=render;
render=function(){originalRender();if(state==='title')$('voyage').style.display='none';if(state!=='play')return;const i=tierAt(player.x,player.y);if(i>0){ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.strokeStyle=REGIONS[i].color+'30';ctx.lineWidth=4;ctx.strokeRect(2,2,innerWidth-4,innerHeight-4);ctx.restore()}};
const originalApply=applyLang;
applyLang=function(){originalApply();$('expHelp').innerHTML='<h4>'+L('잔광의 섬 · 탐험 안내','Echo Isles · Expedition')+'</h4><div class="expdesc">'+L('시작 모닥불에서 멀어질수록 장비가 강해집니다. 동쪽 해안 너머 첫 섬이 있습니다. 뗏목은 나무 12·돌 4로 제작합니다. 행동 버튼에서 승하선·귀환·소지품 사용을 선택합니다. 섬의 룬석 세 개를 켜고 중앙 제단을 조사하세요. 조류 유리 3개로 다음 섬을 찾는 나침반을 만듭니다. 모닥불 근처 배낭에서 장비를 보관할 수 있습니다.','Gear improves with distance from camp. Find the first island across the eastern shore. Build a raft with 12 wood and 4 stone. Interact lets you board, disembark, recall, or use supplies. Light 3 runestones, then inspect the central altar. Craft a Tide Compass with 3 Tideglass. Use the bag near camp to store gear.')+'</div>';$('exportSave').textContent=L('저장 내보내기','Export save');$('importSave').textContent=L('저장 가져오기','Import save');updateVoyageHud()};
$('exportSave').onclick=()=>{saveGame();const data=DrifterPlatform.storage.getItem(SAVE_KEY);if(!data){toast(L('먼저 게임을 시작하세요.','Start a game first.'));return}const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='drifter-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('importSave').onclick=()=>$('importInput').click();
$('importInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const raw=await f.text(),d=JSON.parse(raw);if(!Number.isFinite(d.seed)||!Number.isFinite(d.px)||!Number.isFinite(d.py)||!Array.isArray(d.equip)||d.equip.length!==3||d.equip.some(q=>q&&(!BASES[q.base]||!Array.isArray(q.opts)||q.opts.some(o=>!STAT_META[o.k]||!Number.isFinite(o.v)))))throw new Error('invalid');if(!confirm(L('현재 진행을 가져온 저장으로 교체할까요?','Replace current progress with this save?')))return;DrifterPlatform.storage.setItem(SAVE_KEY,raw);location.reload()}catch(err){toast(L('올바른 DRIFTER 저장 파일이 아닙니다.','Invalid DRIFTER save file.'))}e.target.value=''};


/* Interface layer: shared controls and captions, independent of save/game rules. */
const UI_ICONS={
 bag:'<path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',
 gear:'<path d="m9 3-.7 2.4-2 .9L4 5.7 2.5 8.3l1.7 1.8v2.2l-1.7 1.8L4 16.7l2.3-.6 2 .9.7 2.4h3l.7-2.4 2-.9 2.3.6 1.5-2.6-1.7-1.8v-2.2l1.7-1.8L17 5.7l-2.3.6-2-.9L12 3H9Z"/><circle cx="10.5" cy="11.2" r="3"/>',
 sword:'<path d="m5 19 3-3m-3-3 6 6m-2-5 9-10 3-1-1 4-10 9"/>',
 run:'<circle cx="15" cy="4" r="2"/><path d="m10 8 4-1 3 5h4M13 8l-2 6-5 2m5-2 5 4 1 4M5 8l5-1"/>',
 use:'<path d="M8 13V7a2 2 0 0 1 4 0v5-2a2 2 0 0 1 4 0v3-1a2 2 0 0 1 4 0v4c0 4-3 6-7 6-3 0-5-2-7-5l-2-3a2 2 0 0 1 3-2l2 2"/>',
 book:'<path d="M12 5C8 2 4 3 3 4v15c3-2 6-1 9 1 3-2 6-3 9-1V4c-3-2-6-1-9 1Zm0 0v15"/>',
 full:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>'
};
function uiIcon(name){return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+UI_ICONS[name]+'</svg>'}
const bagFoldState={quests:false,log:false,chest:false,survival:false,garden:false,resources:false,summary:false};
function bagFoldStart(key,label){return '<details class="craft-fold bag-fold" data-bag-fold="'+key+'" '+(bagFoldState[key]?'open':'')+'><summary>'+label+'</summary>';}
function uiResources(){
 const early=!campProgress().lamp;
 const tiles=keys=>'<section class="resource-ledger" aria-label="'+L('보유 재료','Materials')+'">'+keys.map(k=>'<div class="resource-tile'+(player.res[k]?'':' empty')+'" title="'+RES_META[k][LANG]+'"><span data-ico="'+k+'"></span><span>'+RES_META[k][LANG]+'</span><b>'+player.res[k]+'</b></div>').join('')+'</section>';
 if(!early)return tiles(RES_KEYS);
 const priority=RES_KEYS.filter(k=>k==='wood'||k==='stone'||player.res[k]>0),other=RES_KEYS.filter(k=>!priority.includes(k));
 return tiles(priority)+(other.length?bagFoldStart('resources',L('다른 자원','Other materials'))+tiles(other)+'</details>':'');
}
const uiBagHTML=bagHTML;
bagHTML=function(){return uiBagHTML()};
sectBtn=function(key,label){const open=!!(secOpen[key]||(key==='equip'&&replaceState));return '<button type="button" class="sectbtn" data-act="togSec" data-sec="'+key+'" aria-expanded="'+open+'"><span>'+label+'</span><span aria-hidden="true">'+(open?'−':'+')+'</span></button>'};
let uiRenderedTab=null;
const uiRenderPanel=renderPanel;
renderPanel=function(){if(!invOpen)return;const el=$('panelBody'),position=uiRenderedTab===invTab?(el.scrollTop||0):0;uiRenderPanel();el.scrollTop=position;uiRenderedTab=invTab;$('tabBag').setAttribute('aria-selected',String(invTab==='bag'));$('tabCraft').setAttribute('aria-selected',String(invTab==='craft'));$('btnBag').setAttribute('aria-expanded','true')};
const uiOpenInv=openInv,uiCloseInv=closeInv;
openInv=function(tab){if(!secOpen)secOpen={equip:false,ground:false,use:false,fish:false};uiOpenInv(tab);$('btnBag').setAttribute('aria-expanded',String(invOpen))};
closeInv=function(){uiCloseInv();$('btnBag').setAttribute('aria-expanded','false');uiRenderedTab=null};
const uiDialogStart=startDialog,uiDialogEnd=endDialog;
startDialog=function(npc){uiDialogStart(npc);document.body.classList.toggle('dialog-open',!!dlg)};
endDialog=function(){uiDialogEnd();document.body.classList.remove('dialog-open')};
const uiUpdateVoyage=updateVoyageHud;
updateVoyageHud=function(){uiUpdateVoyage();$('hpValue').textContent=Math.ceil(player.hp)+' / '+(stats.maxHp||30);$('stValue').textContent=Math.floor(player.stam)+' / '+(stats.maxStam||100);if(state==='play'&&(isCoarse()||innerWidth<641))$('raftBtn').textContent=exp.sailing?L('내리기','Land'):exp.raft?L('뗏목 타기','Board raft'):L('뗏목 제작','Build raft')};
function uiCaptions(){
 const labels={btnBag:L('배낭','Bag'),btnPause:L('일시정지','Pause'),btnHelp:L('설정 · 도움말','Settings & help'),panelClose:L('닫기','Close'),mapClose:L('지도 닫기','Close map'),btnMute:L('소리','Sound'),btnTut:L('튜토리얼','Tutorial'),btnLang:L('언어','Language')};
 for(const id in labels){$(id).title=labels[id];$(id).setAttribute('aria-label',labels[id])}
 $('btnBag').innerHTML=uiIcon('bag');$('btnPause').innerHTML=uiIcon('pause');$('btnHelp').innerHTML=uiIcon('gear');
 $('btnTut').innerHTML=uiIcon('book')+'<span>'+labels.btnTut+'</span>';
 $('btnLang').textContent=L('English','한국어');$('soundLabel').textContent=muted?L('소리 꺼짐','Sound off'):L('소리 켜짐','Sound on');$('btnMute').setAttribute('aria-pressed',String(!muted));
 $('settingsLabel').textContent=L('환경 설정','Preferences');$('voyageLabel').textContent=L('원정','Expedition');$('mapCaption').textContent=L('지도','Map');
 $('mmWrap').setAttribute('aria-label',L('지도','Map'));$('sysBtns').setAttribute('aria-label',L('게임 메뉴','Game menu'));
 $('tutOv').setAttribute('aria-label',L('튜토리얼','Tutorial'));$('pauseOv').setAttribute('aria-label',L('일시정지','Paused'));$('modal').setAttribute('aria-label',L('설정','Settings'));
 $('controlsLabel').textContent=L('조작 방법','Controls');$('tipsLabel').textContent=L('탐험 도움말','Exploration guide');$('islesGuideLabel').textContent=L('섬 · 뗏목 안내','Islands & sailing');
 $('saveSectionLabel').textContent=L('진행 기록','Save data');$('panel').setAttribute('aria-label',L('배낭과 제작','Inventory and crafting'));
 $('btnAtk').innerHTML=uiIcon('sword')+'<span>'+t('btnAtk')+'</span>';$('btnUse').innerHTML=uiIcon('use')+'<span>'+t('btnUse')+'</span>';$('btnRun').innerHTML=uiIcon('run')+'<span>'+t('btnRun')+'</span>';
 for(const id of ['btnAtk','btnUse','btnRun'])$(id).setAttribute('aria-label',$(id).textContent);
 $('btnNew').classList.toggle('acc',!hasSave());$('titleFoot').textContent=L('무한한 길 · 잔광의 섬 · 자동 저장','Endless paths · Echo Isles · Autosave');
}
const uiApplyLang=applyLang;
applyLang=function(){uiApplyLang();uiCaptions()};
const uiMute=$('btnMute').onclick;
$('btnMute').onclick=()=>{uiMute();uiCaptions()};
$('mmWrap').addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();mapOpen?closeMap():openMap()}});
$('panelTabs').addEventListener('keydown',e=>{if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();invTab=invTab==='bag'?'craft':'bag';renderPanel();const b=invTab==='bag'?$('tabBag'):$('tabCraft');if(b.focus)b.focus()}});


/* Contextual interaction and explicit language settings. */
let actionMenuOpen=false,actionMenuKind='world',actionEntries=[];
const actionBaseSync=syncPaused;
syncPaused=function(){actionBaseSync();paused=paused||actionMenuOpen};
function releaseControls(){for(const k in keys)delete keys[k];attackHeld=false;runHeld=false;joy.active=false;joy.dx=joy.dy=0;joyB.style.display=joyS.style.display='none';for(const id of ['btnAtk','btnRun','btnUse'])$(id).classList.remove('on')}
function closeActionMenu(focus=false){actionMenuOpen=false;actionEntries=[];$('actionMenu').classList.remove('show');$('actionMenu').hidden=true;document.body.classList.remove('action-open');syncPaused();if(focus&&$('btnUse').focus)$('btnUse').focus({preventScroll:true})}
function actionEntry(id,label,detail,run,extra={}){return{id,label,detail,run,...extra}}
function landingPosition(){
 const out=[];
 for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){
  const px=(Math.floor(player.x/TILE)+x)*TILE+8,py=(Math.floor(player.y/TILE)+y)*TILE+5;
  if(biomeAt(Math.floor(px/TILE),Math.floor((py+6)/TILE))===B_WATER||Math.hypot(px-player.x,py-player.y)>38)continue;
  // The walking collision function ignores the current sailing mode.
  if(!originalBlocked(px,py))out.push({x:px,y:py,d:Math.hypot(px-player.x,py-player.y)});
 }
 out.sort((a,b)=>a.d-b.d);return out[0]||null;
}
function consumableActions(){
 const out=[];
 if(player.res.berry>0)out.push(actionEntry('use:berry',L('베리 먹기','Eat berries')+' · '+player.res.berry,L('체력 +4','HP +4'),()=>useConsumable('berry')));
 if(player.pots.heal>0)out.push(actionEntry('use:heal',L('회복약 사용','Use field salve')+' · '+player.pots.heal,L('최대 체력의 40% 회복','Restore 40% max HP'),()=>useConsumable('heal')));
 if(player.pots.tea>0)out.push(actionEntry('use:tea',L('기력의 차 마시기','Drink vigor tea')+' · '+player.pots.tea,L('스테미너 전부 회복','Fully restore stamina'),()=>useConsumable('tea')));
 for(const id of FISH_ORDER){const n=player.fish[id]||0;if(n<1)continue;const f=FISH_INFO[id];out.push(actionEntry('eat:'+id,f[LANG]+' · '+n,'HP +'+f.heal+(f.stam?' · ST 100%':''),()=>eatFish(id)))}
 return out;
}
function openCampChest(){bagFoldState.chest=true;openInv('bag');if(secOpen)secOpen.equip=true;renderPanel();const card=$('panelBody').querySelector('[data-bag-fold="chest"]');if(card&&card.scrollIntoView)card.scrollIntoView({block:'start',behavior:'smooth'})}
function craftTideCompass(){if(exp.compass||exp.glass<3)return;exp.glass-=3;exp.compass=true;sfx('trade');toast(L('조류 나침반을 만들었습니다.','Tide Compass crafted.'));saveGame();updateVoyageHud()}
function harvestAction(n){if(player.atkCool>0||n.dead||exp.sailing)return;player.atkCool=.45;attackT=.18;attackDir=Math.atan2(n.y-8-(player.y-6),n.x-player.x);player.face=n.x<player.x?-1:1;attackWeapon=firstIcon('pickaxe');sfx('swing');damageNode(n,stats.atk)}
function availableActions(){
 if(state!=='play'||player.dead)return [];
 if(fishing)return [actionEntry(fishing.phase==='bite'?'reel':'cancel-fish',fishing.phase==='bite'?L('물고기 낚아 올리기','Reel in'):L('낚시 취소','Cancel fishing'),L('낚시','Fishing'),()=>{if(fishing?.phase==='bite')catchFish();else cancelFishing()})];
 const out=[],nodes=activeNodes(),npcs=activeNpcs();
 const distanceLabel=(x,y)=>Math.max(1,Math.round(Math.hypot(x-player.x,y-player.y)/TILE))+'m';
 if(exp.sailing){
  if(landingPosition())out.push(actionEntry('raft:land',L('뗏목에서 내리기','Disembark'),L('가까운 해안으로 이동','Step onto the nearby shore'),()=>toggleRaft()));
  const spot=findFishSpot();if(spot)out.push(actionEntry('fish',L('낚시하기','Go fishing'),L('뗏목 위에서 낚시','Fish from your raft'),()=>startFishing(spot)));
  if(exp.shore)out.push(actionEntry('raft:rescue',L('출항한 해안으로 복귀','Return to departure shore'),L('마지막 출항 위치로 돌아갑니다.','Return to where you launched the raft.'),()=>recallOrSignal()));
 }else{
  for(const npc of npcs){if(Math.hypot(npc.x-player.x,npc.y-player.y)>=64)continue;out.push(actionEntry('npc:'+npc.id,npc.persona==='trader'?L('행상인과 거래','Trade with merchant'):L('방랑자와 대화','Talk to wanderer'),distanceLabel(npc.x,npc.y),()=>startDialog(npc)))}
  for(const n of nodes){if(n.dead||Math.hypot(n.x-player.x,n.y-player.y)>=64)continue;
   if(n.type==='cave'&&!n.looted)out.push(actionEntry('node:'+n.chunkKey+':'+n.idx,L('동굴 탐험','Explore cave'),distanceLabel(n.x,n.y),()=>enterCave(n)));
   if(n.type==='ruin'&&!n.looted){let label=L('유적 조사','Inspect ruin'),detail=distanceLabel(n.x,n.y);if(n.islandId){if(n.rune>=0)label=L('룬석 켜기 ','Light runestone ')+(n.rune+1);else{label=L('섬 제단 조사','Inspect island altar');detail=L('켜진 룬 ','Runes lit ')+(exp.runes[n.islandId]||[]).length+'/3'}}out.push(actionEntry('node:'+n.chunkKey+':'+n.idx,label,detail,()=>investigateRuin(n)))}
  }
  const warp=nodes.find(n=>n.type==='ruin'&&n.looted&&(!n.islandId||n.rune<0)&&Math.hypot(n.x-player.x,n.y-player.y)<64&&ruinDone.has(n.chunkKey+':'+n.idx));
  if(warp)out.push(actionEntry('warp',L('유적 워프 지도','Open warp map'),L('활성화한 유적으로 이동','Travel to an activated ruin'),()=>openMap()));
  const target=nodes.filter(n=>!n.dead&&NODE_INFO[n.type]&&!['cave','ruin'].includes(n.type)).map(n=>({n,d:Math.hypot(n.x-player.x,n.y+NODE_INFO[n.type].hitY-(player.y-6))-NODE_INFO[n.type].hitR})).filter(a=>a.d<stats.atkRange).sort((a,b)=>a.d-b.d)[0]?.n;
  if(target){const res=RES_META[NODE_INFO[target.type].res][LANG];out.push(actionEntry('gather:'+target.chunkKey+':'+target.idx,L('채집 · ','Gather · ')+res,L('공격 버튼을 누르고 있어도 채집합니다.','You can also hold Attack to gather.'),()=>harvestAction(target)))}
  const loot=groundEquip.filter(g=>Math.hypot(g.x-player.x,g.y-player.y)<stats.pickup);
  if(loot.length)out.push(actionEntry('loot',L('전리품 확인','Inspect loot')+' · '+loot.length,L('주변 장비를 확인하고 착용합니다.','Inspect and equip nearby gear.'),()=>{nearItems=loot;if(secOpen)secOpen.ground=true;openInv('bag')}));
  const spot=findFishSpot();if(spot){out.push(actionEntry('fish',L('낚시하기','Go fishing'),distanceLabel(spot[0],spot[1]),()=>startFishing(spot)));
   if(exp.raft)out.push(actionEntry('raft:board',L('뗏목 타기','Board raft'),L('깊은 물을 건널 수 있습니다.','Sail across deep water.'),()=>toggleRaft()));
   else if(canAfford({wood:12,stone:4}))out.push(actionEntry('raft:craft',L('뗏목 제작','Build raft'),L('나무 12 · 돌 4','12 wood · 4 stone'),()=>toggleRaft()));
  }
  if(atCamp()){out.push(actionEntry('camp:chest',L('모닥불 보관함','Camp chest'),exp.stash.length+'/12',()=>openCampChest()));out.push(actionEntry('craft',L('제작하기','Craft equipment'),L('장비 · 원정 도구 · 소모품','Gear · expedition tools · supplies'),()=>openInv('craft')))}
  if(!exp.compass&&exp.glass>=3)out.push(actionEntry('compass:craft',L('조류 나침반 제작','Craft Tide Compass'),L('조류 유리 3개','3 Tideglass'),()=>craftTideCompass()));
  if(hasEffect('return')){
   const wait=Math.max(0,Math.ceil(exp.recallAt-gameT)),combat=activeEnemies().some(e=>e.aggroed&&Math.hypot(e.x-player.x,e.y-player.y)<160);
   out.push(actionEntry('recall',L('유적으로 귀환','Recall to ruin'),wait?L('재사용 대기 ','Cooldown ')+wait+'s':combat?L('전투에서 벗어나야 합니다.','Leave combat to recall.'):L('마지막으로 조사한 유적','Last inspected ruin'),()=>recallOrSignal(),{disabled:wait>0||combat}));
  }
 }
 if(consumableActions().length)out.push(actionEntry('items',L('소지품 사용','Use supplies'),L('베리 · 회복약 · 차 · 물고기','Berries · salves · tea · fish'),()=>showActionMenu('items')));
 return out;
}
function actionCandidates(kind){return kind==='items'?consumableActions():availableActions()}
function renderActionMenu(){
 actionEntries=actionCandidates(actionMenuKind);
 $('actionMenuTitle').textContent=actionMenuKind==='items'?L('소지품 사용','Use supplies'):L('어떤 행동을 할까요?','Choose an action');
 $('actionMenuHint').textContent=L('원하는 행동을 선택하세요.','Select what you want to do.');$('actionMenuClose').setAttribute('aria-label',L('닫기','Close'));
 $('actionMenuList').innerHTML=actionEntries.map((a,i)=>'<button type="button" data-context="'+i+'" '+(a.disabled?'disabled':'')+'><span class="action-key" aria-hidden="true">'+(i<9?i+1:'·')+'</span><span class="action-copy"><b>'+a.label+'</b><small>'+a.detail+'</small></span><span class="action-arrow" aria-hidden="true">›</span></button>').join('');
 if(!actionEntries.length)$('actionMenuList').innerHTML='<div class="pempty">'+L('지금 가능한 행동이 없습니다.','No actions available here.')+'</div>';
}
function showActionMenu(kind='world'){
 actionBackdropPress=false;
 releaseControls();actionMenuKind=kind;actionMenuOpen=true;$('actionMenu').hidden=false;$('actionMenu').classList.add('show');document.body.classList.add('action-open');syncPaused();renderActionMenu();
 const first=$('actionMenuList').querySelector('button:not(:disabled)');if(first?.focus)first.focus({preventScroll:true});
}
function chooseContextAction(index){
 if(!actionMenuOpen)return;const selected=actionEntries[index];if(!selected||selected.disabled)return;
 const fresh=actionCandidates(actionMenuKind).find(a=>a.id===selected.id);
 if(!fresh||fresh.disabled){renderActionMenu();return}
 closeActionMenu();fresh.run();
}
$('actionMenuList').addEventListener('click',e=>{const b=e.target.closest('[data-context]');if(b)chooseContextAction(+b.dataset.context)});
$('actionMenuClose').onclick=()=>closeActionMenu(true);
let actionBackdropPress=false;
$('actionMenu').addEventListener('pointerdown',e=>{actionBackdropPress=e.target===$('actionMenu')});
$('actionMenu').addEventListener('click',e=>{const dismiss=actionBackdropPress&&e.target===$('actionMenu');actionBackdropPress=false;if(dismiss)closeActionMenu(true)});
interact=function(){
 if(actionMenuOpen){closeActionMenu(true);return}
 if(dlg){dlgAdvance();return}
 if(state!=='play'||paused||player.dead||invOpen)return;
 const choices=availableActions(),enabled=choices.filter(a=>!a.disabled);
 if(enabled.length===1){enabled[0].run();return}
 if(enabled.length>1){showActionMenu();return}
 if(choices.length)showActionMenu();else toast(L('가까이 다가가면 행동할 수 있습니다.','Move closer to something to interact.'),'small');
};
// A click on the map should always open the map. Warping requires a deliberate map selection.
$('mmWrap').onclick=()=>{if(state==='play'&&!actionMenuOpen){ensureAudio();mapOpen?closeMap():openMap()}};
let actionHintAt=-1,actionFishingPhase=null,actionButtonSignature='';
updateNearEquip=function(){
 const list=groundEquip.filter(g=>Math.hypot(g.x-player.x,g.y-player.y)<stats.pickup).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
 const sig=list.map(g=>g.uid).join(','),changed=sig!==nearSig;nearItems=list;nearSig=sig;prevNearUids=new Set(list.map(g=>g.uid));
 if(replaceState&&!list.includes(replaceState.g))exitReplace();if(invOpen&&changed)renderPanel();
 const phase=fishing?.phase||null;if(gameT<actionHintAt&&!changed&&phase===actionFishingPhase)return;actionHintAt=gameT+.16;actionFishingPhase=phase;
 const choices=availableActions(),world=choices.filter(a=>a.id!=='items'&&!a.disabled);
 const visible=state==='play'&&!dlg&&!invOpen&&!player.dead&&!actionMenuOpen&&!paused;
 $('btnUse').classList.toggle('hot',visible&&world.length>0);$('btnUse').setAttribute('data-action-count',String(choices.length));
 const hint=$('pickupHint');hint.style.display='none';
 if(visible&&fishing){hint.style.display='block';hint.textContent=fishing.phase==='bite'?t('fishReel'):t('fishWait')}
 // The button itself communicates multiplicity without another floating panel.
 const label=world.length>1?L('행동 선택','Choose'):t('btnUse');const badge=choices.length>1?'<i class="action-count">'+choices.length+'</i>':'';
 const signature=LANG+':'+label+':'+choices.length;if(signature!==actionButtonSignature){actionButtonSignature=signature;$('btnUse').innerHTML=uiIcon('use')+'<span>'+label+'</span>'+badge}$('btnUse').setAttribute('aria-label',label+(choices.length>1?' · '+choices.length:''));
};
const contextBag=bagHTML;
bagHTML=function(){const r=REGIONS[tierAt(player.x,player.y)],d=Math.floor(distanceM(player.x,player.y));return bagFoldStart('summary',L('현재 원정','Current expedition'))+'<div class="expcard expedition-summary"><h4>'+L('원정 · ','Expedition · ')+r[LANG]+' · '+d+'m</h4><div class="expdesc">'+expeditionSignal()+'</div></div></details>'+contextBag()};
const contextCaptions=uiCaptions;
uiCaptions=function(){contextCaptions();actionButtonSignature='';$('languageSelect').value=LANG;$('languageLabel').textContent=L('언어','Language');$('btnLang').hidden=true;$('btnLang2').hidden=true;$('btnAtk').innerHTML=uiIcon('sword')+'<span>'+L('공격','Attack')+'</span>';$('btnAtk').setAttribute('aria-label',L('공격 · 채집','Attack / gather'));$('actionMenuClose').setAttribute('aria-label',L('닫기','Close'))};
// Language changes have a single explicit entry point. Hidden title controls cannot toggle it.
toggleLang=function(){};$('btnLang').onclick=null;$('btnLang2').onclick=null;
function setGameLanguage(value){if(value!=='ko'&&value!=='en')return false;LANG=value;persistPrefs();applyLang();saveGame();return true}
$('languageSelect').addEventListener('change',e=>{if(e.target!==$('languageSelect')||!modalOpen)return;setGameLanguage(e.target.value)});
const contextStartPlay=startPlay;
startPlay=function(){closeActionMenu();releaseControls();actionHintAt=-1;actionFishingPhase=null;actionButtonSignature='';contextStartPlay();$('title').hidden=true;$('title').setAttribute('inert','');document.body.classList.add('playing');};
const contextApplyLang=applyLang;
applyLang=function(){contextApplyLang();if(actionMenuOpen)renderActionMenu();document.body.classList.toggle('playing',state==='play')};
// Menus must not inherit held movement or attack inputs. Native control focus keeps its own keys.
addEventListener('keydown',e=>{
 if(window.DrifterMultiplayer?.isPanelOpen?.())return;
 const tag=e.target?.tagName?.toLowerCase();
 if(tag==='select'||tag==='input'||tag==='textarea'||e.target?.isContentEditable){e.stopImmediatePropagation();return}
 if(orientationBlocked){e.preventDefault();e.stopImmediatePropagation();return}
 if(!actionMenuOpen){if(['button','summary'].includes(tag)&&['Space','Enter'].includes(e.code))e.stopImmediatePropagation();return;}
 if(e.code==='Escape'||e.code==='KeyE'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)closeActionMenu(true);return}
 if(/^Digit[1-9]$/.test(e.code)){e.preventDefault();e.stopImmediatePropagation();chooseContextAction(+e.code.slice(-1)-1);return}
 if(e.code==='Tab'){
  const buttons=[...$('actionMenuBox').querySelectorAll('button:not(:disabled)')];if(buttons.length){const i=buttons.indexOf(document.activeElement),next=(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length;e.preventDefault();buttons[next].focus()}
 }
 e.stopImmediatePropagation();
},true);
addEventListener('blur',releaseControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseControls();saveGame()}});


(function drawLogo(){
 const c=$('logoCv').getContext('2d');c.imageSmoothingEnabled=false;
 c.clearRect(0,0,32,32);
 c.fillStyle='rgba(10,14,10,.4)';c.beginPath();c.ellipse(16,29,8,3,0,0,6.29);c.fill();
 c.fillStyle='#4a3626';c.fillRect(12,23,3,6);c.fillRect(17,23,3,6);
 c.fillStyle='#5a6d44';c.fillRect(11,14,10,9);
 c.fillStyle='#6d8054';c.fillRect(11,14,10,2);
 c.fillStyle='#d8a03c';c.fillRect(11,13,10,2);
 c.fillStyle='#e7c9a3';c.fillRect(12,6,8,8);
 c.fillStyle='#4a3626';c.fillRect(12,6,8,3);c.fillRect(12,9,1,3);c.fillRect(19,9,1,3);
 c.fillStyle='#1a140d';c.fillRect(14,10,2,2);c.fillRect(18,10,2,2);
 c.fillStyle='#7a5c33';c.fillRect(24,8,2,20);c.fillStyle='#d8a03c';c.fillRect(24,6,2,2);
})();

/* ================================================================
   메인 루프
   ================================================================ */
let last=0,titleT=0,hudRefreshAt=0;
function frame(ts){
 const dt=Math.min(0.05,Math.max(0,(ts-last)/1000))||0.016;last=ts;
 if(state==='title'){
  try{titleUpdate(dt)}catch(err){console.error('[drifter] title:',err)}
 }else if(!paused&&!document.hidden&&!backgroundSuspended){
  try{
   update(dt);
   mmTimer+=dt;if(mmTimer>0.25){mmTimer=0;drawMinimap()}
  }catch(err){console.error('[drifter] update:',err)}
 }
 try{render()}catch(err){console.error('[drifter] render:',err)}
 if(mapOpen){
  mapDrawT+=dt;
  if(mapDrawT>0.3){mapDrawT=0;
   try{sizeBigMap();drawBigMap()}catch(err){console.error('[drifter] map:',err)}}}
 if(ts-hudRefreshAt>=100){hudRefreshAt=ts;refreshVitalHud()}
 DrifterPlatform.syncGameplay(state==='play'&&!paused&&!dlg&&!player.dead);
 requestAnimationFrame(frame)}
function titleUpdate(dt){
 titleT+=dt;
 cam.x=camp.x+Math.cos(titleT*0.07)*260;
 cam.y=camp.y+Math.sin(titleT*0.05)*180;
 gameT+=dt;
 if(Math.random()<dt*9)particles.push({x:camp.x+rand(-3,3),y:camp.y-8,vx:rand(-5,5),vy:rand(-38,-18),g:-30,life:rand(.3,.6),max:.6,size:rand(1.5,2.5),color:Math.random()<0.5?'#e8933c':'#f2c05a'});
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;
  if(p.life<=0){particles.splice(i,1);continue}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.g||0)*dt}}

async function boot(){
 await Promise.all([DrifterPlatform.ready,window.DrifterGameDistribution?.ready]);
 LANG=DrifterPlatform.locale.startsWith('ko')?'ko':'en';
 try{
  const p=JSON.parse(DrifterPlatform.storage.getItem(PREF_KEY));
  if(p&&['ko','en'].includes(p.lang)){LANG=p.lang;muted=!!p.muted}
  else if(hasSave()){
   const d=JSON.parse(DrifterPlatform.storage.getItem(SAVE_KEY));
   if(d&&['ko','en'].includes(d.lang))LANG=d.lang;
   if(d)muted=!!d.muted}
 }catch(e){}
 if(hasSave()){try{seed=JSON.parse(DrifterPlatform.storage.getItem(SAVE_KEY)).seed}catch(e){seed=1}}
 else seed=Math.floor(Math.random()*1e9)+1;
 viewChunks();
 applyLang();
 injectIcons($('quickbar'));
 renderQuickbar();
 addEventListener('beforeunload',saveGame);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)saveGame()});
 DrifterPlatform.syncGameplay(state==='play'&&!paused&&!dlg&&!player.dead);
 $('btnNew').disabled=false;$('btnCont').disabled=false;
 requestAnimationFrame(frame);
  window.DrifterMultiplayer?.platformReady?.();
}
window.DrifterBoot=boot;
