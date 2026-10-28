/* DRIFTER v1.4.0 authoritative party client. Colyseus owns room membership and shared state. */
(() => {
 'use strict';
 const NAME_KEY='drifter_nickname_v1',SAVE_KEY='drifter_save_v1',ROOM_LIMIT=4;
 const $=id=>document.getElementById(id);
 const ui={panel:$('coopPanel'),title:$('coopTitle'),intro:$('coopIntro'),note:$('coopNote'),privacy:$('coopPrivacy'),wakeCancel:$('coopWake')?.querySelector('[data-wake-cancel]'),status:$('coopStatus'),badge:$('coopBadge'),statusText:$('coopStatusText'),name:$('coopName'),nameLabel:$('coopNameLabel'),code:$('coopCode'),codeLabel:$('coopCodeLabel'),lobby:$('coopLobby'),roomCode:$('coopRoomCode'),lobbyText:$('coopLobbyText'),create:$('coopCreate'),join:$('coopJoin'),start:$('coopStart'),leave:$('coopLeave'),close:$('coopClose'),copy:$('coopCopy'),invite:$('coopInvite'),btn:$('btnCoop'),party:$('btnParty'),manage:$('coopManage'),quickLeave:$('coopLeaveQuick')};
 const baseStorage=DrifterPlatform.storage,baseSave=window.saveGame,baseUpdate=window.update,baseAttack=window.tryAttack;
 const baseDamageNode=window.damageNode,baseDamageEnemy=window.damageEnemy,baseEnterCave=window.enterCave,baseInvestigateRuin=window.investigateRuin,baseSpawnStar=window.spawnStar;
 const baseSyncPaused=window.syncPaused,baseApplyLang=window.applyLang;
 const baseGetChunk=window.getChunk,baseFindTarget=window.findTarget,baseRender=window.render,baseGroundRes=window.updateGroundRes,baseHeal=window.healPlayer,baseDamagePlayer=window.damagePlayer,baseWarp=window.warpTo,baseRecall=window.recallOrSignal,basePlant=window.plantSeed,baseBuy=window.buyItem;
 const entityIndex=new Map(),lootIndex=new Map(),lootSignatures=new Map(),pendingPublish=new Map(),pendingActions=new Map(),grantIds=new Set(),rewardIds=new Set(),actionIds=new Set(),deferredGrants=new Map(),deferredRewards=new Map(),memberEventRooms=new WeakSet();
 let networkDropped=false,syncTimer=null,progressSignature='',selfPositionSeq=-1,selfDamageSeq=0,gearSignature='',profileSeq=0,profileAck=0,lastProfileSent=0,lastRenderTime=0,worldApplying=false;

 let client=null,serverUrl='',roomEndpoint='',room=null,sessionId='',nickname=readNickname(),closed=true,roomReady=false,partyOpen=false,busy=false,launching=false,intentionalLeave=false,inPartyWorld=false;
 let remotes=new Map(),soloSnapshot=null,soloTutorial=null,lastStateAt=0,lastEnemyAt=0,lastCheckpointAt=0,lastLootPublishAt=0,lootPublishCursor='',lootSeq=0,appliedNodeVersions=new Map(),appliedEnemyVersions=new Map(),claimedLoot=new Set(),pendingLootClaims=new Map(),ownedLoot=new Map(),wakeRun=null,platformReadyStarted=false,platformInviteRoom='';
 let rateState={x:0,y:0,hp:0,maxHp:0,level:0,face:0,moving:false};
 window.syncPaused=function(){baseSyncPaused();paused=paused||partyOpen;if(partyOpen)releaseControls()};
 window.applyLang=function(){baseApplyLang();renderLabels();if(room)displayRoom()};

 function readNickname(){try{return localStorage.getItem(NAME_KEY)||'Drifter'}catch{return'Drifter'}}
 function cleanName(value){return String(value||'Drifter').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,20)||'Drifter'}
 function tell(message,busyStatus=false){if(ui.statusText){ui.statusText.textContent=message||'';ui.statusText.setAttribute('aria-busy',String(!!busyStatus))}}
 function active(){return !!(room&&roomReady&&!closed)}
 function roomMeta(){if(!room)return null;return {room_id:String(room.roomId||room.id||''),room_code:String(room.state?.roomCode||''),world_seed:Number(room.state?.worldSeed)||1,is_host:room.sessionId===room.state?.hostSessionId,room_status:room.state?.started?'playing':'waiting'}}
 function connectedPlayerCount(target=room){const players=target?.state?.players;if(!players)return target?1:0;let count=0;players.forEach(player=>{if(player.connected!==false)count++});return count}
 // Colyseus may deliver the join-time member event before consumeSeatReservation resolves.
 function makeCoopClient(endpoint){const instance=new window.Colyseus.Client(endpoint),createRoom=instance.createRoom.bind(instance);instance.createRoom=function(...args){return attachPartyMemberHandler(createRoom(...args))};return instance}
 function syncPlatformRoom(){
  const platform=window.DrifterPlatform;if(!platform?.isCrazyGames)return;
  if(!room){platform.hideInviteButton();platform.leftRoom();platformInviteRoom='';if(ui.invite){ui.invite.hidden=true;ui.invite.disabled=true}return}
  const meta=roomMeta(),count=room.state?.players?.size||1,joinable=count<ROOM_LIMIT;
  const inviteParams={roomCode:meta.room_code};platform.updateRoom({roomId:meta.room_id,isJoinable:joinable,inviteParams});
  if(joinable&&platformInviteRoom!==meta.room_id){platform.showInviteButton(inviteParams);platformInviteRoom=meta.room_id}else if(!joinable&&platformInviteRoom){platform.hideInviteButton();platformInviteRoom=''}
  if(ui.invite){ui.invite.hidden=!platform.supportsInvites;ui.invite.disabled=!joinable}
 }
 function mapSaveKey(key){return inPartyWorld&&room&&key===SAVE_KEY?`drifter_party_v120_${room.roomId||room.id}_${sessionId}`:key}
 function usePartyStorage(){DrifterPlatform.storage={getItem:key=>baseStorage.getItem(mapSaveKey(key)),setItem:(key,value)=>baseStorage.setItem(mapSaveKey(key),value),removeItem:key=>baseStorage.removeItem(mapSaveKey(key)),backup:key=>baseStorage.backup(mapSaveKey(key))}}
 function restoreStorage(){DrifterPlatform.storage=baseStorage}
 function renderLabels(){
  const ko=LANG==='ko',count=room?.state?.players?.size||0,meta=roomMeta();
  const copy=ko?{party:'파티',partyTitle:'파티 만들기 · 참가 · 나가기 (O)',panel:'친구와 함께',intro:'4인 파티를 만들거나 방 코드로 참가하세요. O 키로 열 수 있습니다.',name:'이름',roomCode:'방 코드',copyCode:'코드 복사',invite:'친구 초대',create:'방 만들기',join:'코드로 참가',start:'탐험 시작',endLeave:'파티 종료하고 나가기',leave:'나가기',back:'게임으로 돌아가기',close:'닫기',note:'게임 중 파티를 만들면 같은 월드에서 만납니다. 혼자 진행한 기록은 파티를 나가면 복구됩니다.',privacy:'개인정보: 닉네임과 게임 상태만 방 서버로 전송됩니다. 계정 정보는 요청하지 않습니다.',cancel:'취소'}:{party:'Party',partyTitle:'Create or join a party (O)',panel:'Play together',intro:'Create a party for up to 4 players or join with a room code. Press O to open.',name:'Name',roomCode:'Room code',copyCode:'Copy code',invite:'Invite friend',create:'Create room',join:'Join with code',start:'Start expedition',endLeave:'End party & leave',leave:'Leave party',back:'Back to game',close:'Close',note:'Party up to explore the same world. Your solo save is restored when you leave.',privacy:'Privacy: only your nickname and game state are sent to the room server. No account details are requested.',cancel:'Cancel'};
  if(ui.party){ui.party.textContent=copy.party+(room?` ${count}/${ROOM_LIMIT}`:'');ui.party.title=copy.partyTitle;ui.party.setAttribute('aria-label',copy.partyTitle)}
  if(ui.btn){ui.btn.textContent=copy.panel;ui.btn.title=copy.panel}
  if(ui.title)ui.title.textContent=copy.panel;
  if(ui.intro)ui.intro.textContent=copy.intro;
  if(ui.nameLabel)ui.nameLabel.textContent=copy.name;
  if(ui.name?.readOnly)ui.name.setAttribute('aria-label',ko?'CrazyGames 사용자 이름':'CrazyGames username');
  if(ui.codeLabel)ui.codeLabel.textContent=copy.roomCode;
  if(ui.copy)ui.copy.textContent=copy.copyCode;
  if(ui.invite)ui.invite.textContent=copy.invite;
  if(ui.create)ui.create.textContent=copy.create;
  if(ui.join)ui.join.textContent=copy.join;
  if(ui.note)ui.note.textContent=copy.note;
  if(ui.privacy)ui.privacy.textContent=copy.privacy;
  if(ui.wakeCancel)ui.wakeCancel.textContent=copy.cancel;
  if(ui.panel)ui.panel.setAttribute('aria-label',copy.panel);
  if(ui.manage)ui.manage.textContent=ko?'파티 관리':'Manage';if(ui.quickLeave)ui.quickLeave.textContent=ko?'나가기':'Leave';
  if(ui.leave)ui.leave.textContent=meta?.is_host?copy.endLeave:copy.leave;
  if(ui.start)ui.start.textContent=meta?.room_status==='playing'?(ko?'탐험에 합류':'Join expedition'):copy.start;
  if(ui.close)ui.close.textContent=state==='play'?copy.back:copy.close;
 }
 function setBusyControls(){const locked=busy||launching;for(const el of [ui.create,ui.join,ui.start,ui.leave,ui.quickLeave,ui.close,ui.name,ui.code])if(el)el.disabled=locked;ui.panel?.setAttribute('aria-busy',String(locked))}
 function setPanel(show){if(show&&!partyOpen)resetMenus();partyOpen=!!show;ui.panel?.classList.toggle('show',partyOpen);document.body.classList.toggle('party-open',partyOpen);for(const el of [ui.btn,ui.party,ui.manage])if(el)el.setAttribute('aria-expanded',String(partyOpen));releaseControls();syncPaused();renderLabels();if(partyOpen)(room?ui.close:ui.name)?.focus?.();else if(state==='play')ui.party?.focus?.()}
 function displaySolo(){ui.lobby.hidden=true;ui.codeLabel.hidden=false;ui.code.hidden=false;ui.create.hidden=false;ui.join.hidden=false;ui.start.hidden=true;ui.leave.hidden=true;if(ui.invite)ui.invite.hidden=true;ui.status?.classList.remove('show');renderLabels();setBusyControls()}
 function displayRoom(){
  if(!room)return;const meta=roomMeta(),count=room.state?.players?.size||1,ko=LANG==='ko';
  ui.lobby.hidden=false;ui.roomCode.textContent=meta.room_code||'--------';ui.codeLabel.hidden=true;ui.code.hidden=true;ui.create.hidden=true;ui.join.hidden=true;
  ui.start.hidden=!((meta.is_host&&meta.room_status==='waiting')||(meta.room_status==='playing'&&!inPartyWorld));ui.leave.hidden=false;
  const connected=connectedPlayerCount();
  ui.lobbyText.textContent=meta.room_status==='playing'?(ko?`탐험 중 · ${connected}/${ROOM_LIMIT}명 연결`:`Exploring · ${connected}/${ROOM_LIMIT} connected`):(ko?`${meta.is_host?'방장':'참가자'} · ${connected}/${ROOM_LIMIT}명 · 방 코드를 친구에게 보내세요.`:`${meta.is_host?'Host':'Guest'} · ${connected}/${ROOM_LIMIT} · Share this code with friends.`);
  const names=[...remotes.values()].filter(p=>p.connected!==false).map(p=>p.nickname).filter(Boolean);const partyStatus=meta.room_status==='playing'?(connected<=1?(ko?'혼자 탐험 중':'Exploring alone'):(names.length?(ko?`${names.join(', ')}와 함께 탐험 중`:`Exploring with ${names.join(', ')}`):(ko?`${connected}명 함께 탐험 중`:`Exploring with ${connected-1} others`))):(names.join(', ')||(connected>1?(ko?`${connected}명 참가 중`:`${connected} connected`):(ko?'친구 대기':'Waiting for friends')));ui.badge.textContent=`${meta.room_code} · ${partyStatus}`;
  ui.status?.classList.add('show');renderLabels();setBusyControls();syncPlatformRoom();
 }
 function resetMenus(){closeActionMenu();closeInv();endDialog();closeMap();togglePause(false);toggleModal(false);$('tutOv')?.classList.remove('show');releaseControls()}
 function rememberSolo(){if(inPartyWorld)return;if(state==='play')baseSave();let raw=null,saved=null;try{raw=baseStorage.getItem(SAVE_KEY);saved=JSON.parse(raw)}catch{}if(state==='play'&&!validSave(saved))throw new Error(LANG==='ko'?'개인 여정을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도하세요.':'Could not save your solo journey. Check storage and try again.');soloSnapshot=validSave(saved)?raw:null;soloTutorial=state==='play'?{...tut}:null}
 function returnToSolo(wasInPartyWorld){restoreStorage();if(wasInPartyWorld){resetMenus();if(soloSnapshot){DrifterPlatform.storage={...baseStorage,getItem:key=>key===SAVE_KEY?soloSnapshot:baseStorage.getItem(key)};let restored=false;try{restored=loadSave()}finally{restoreStorage()}if(restored){if(soloTutorial)Object.assign(tut,soloTutorial);else startJourneyTutorial();applyLang();startPlay()}}else if(state==='play')baseSave()}soloSnapshot=null;soloTutorial=null}
 function clearPartyCaches(){if(syncTimer){clearInterval(syncTimer);syncTimer=null}entityIndex.clear();lootIndex.clear();lootSignatures.clear();pendingPublish.clear();pendingActions.clear();grantIds.clear();rewardIds.clear();actionIds.clear();deferredGrants.clear();deferredRewards.clear();progressSignature='';selfPositionSeq=-1;selfDamageSeq=0;gearSignature='';profileSeq=0;profileAck=0;lastProfileSent=0;networkDropped=false;remotes.clear();appliedNodeVersions.clear();appliedEnemyVersions.clear();claimedLoot.clear();pendingLootClaims.clear();ownedLoot.clear()}
 async function disconnectRoom(target){if(!target)return;if(target.reconnection)target.reconnection.enabled=false;let timer;try{await Promise.race([target.leave(true),new Promise(resolve=>{timer=setTimeout(resolve,900)})])}catch{}finally{clearTimeout(timer);try{if(target.connection?.isOpen)target.connection.close(4000)}catch{}}}
 async function detachRoom(message,restoreSolo=true){const old=room,wasInPartyWorld=inPartyWorld;closed=true;roomReady=false;room=null;inPartyWorld=false;sessionId='';try{localStorage.removeItem('drifter_colyseus_active_v120')}catch{}clearPartyCaches();syncPlatformRoom();if(restoreSolo)returnToSolo(wasInPartyWorld);displaySolo();if(old&&!intentionalLeave)await disconnectRoom(old);if(message){setPanel(true);tell(message)}}

 function makeWakeLayer(){
  let layer=$('coopWake');if(layer)return layer;
  layer=document.createElement('div');layer.id='coopWake';layer.setAttribute('role','alertdialog');layer.setAttribute('aria-live','polite');
  Object.assign(layer.style,{position:'fixed',inset:'0',zIndex:'120',display:'none',alignItems:'center',justifyContent:'center',padding:'20px',background:'#07110bdc'});
  layer.innerHTML='<div style="width:min(420px,100%);padding:20px;background:#17231b;border:1px solid #71846e;border-radius:10px;color:#f1ead7;font:14px/1.55 system-ui"><strong data-wake-title></strong><p data-wake-text style="margin:10px 0 16px;color:#c4d0bd"></p><button type="button" data-wake-cancel style="min-height:40px;padding:8px 14px">취소</button></div>';
  document.body.appendChild(layer);return layer;
 }
 function wait(ms,run){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{run.cancelWait=null;resolve()},ms);run.cancelWait=()=>{clearTimeout(timer);run.cancelWait=null;reject(new Error(LANG==='ko'?'연결을 취소했습니다.':'Connection cancelled.'))}})}
 async function connectionFetch(url,run,timeoutMs){const controller=new AbortController();run.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});const health=await response.json().catch(()=>null);return {response,health}}finally{clearTimeout(timer);run.controllers.delete(controller)}}
 async function getServerUrl(){
  let raw=String(window.DRIFTER_COOP_SERVER_URL||'').trim();
  if(!window.DrifterPlatform?.isCrazyGames){
   try{const response=await fetch('/api/coop-config',{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(4000)});const body=await response.json().catch(()=>({}));if(response.ok&&body.serverUrl)raw=String(body.serverUrl).trim()}catch{}
  }
  if(!raw)throw new Error(LANG==='ko'?'협동 서버 주소가 아직 설정되지 않았습니다. 서버 배포 뒤 게임 설정을 갱신해 주세요.':'The co-op server address is not configured yet. Update the game build after deploying the server.');
  let parsed;try{parsed=new URL(raw)}catch{throw new Error(LANG==='ko'?'협동 서버 주소를 확인해 주세요.':'Check the co-op server URL.')}
  if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error(LANG==='ko'?'협동 서버 주소가 올바르지 않습니다.':'Invalid co-op server URL.');
  if(serverUrl!==parsed.origin)client=null;serverUrl=parsed.origin;return serverUrl;
 }
 async function wakeServer(workerIndex,deadline=Date.now()+180000,endpointOverride){
  const endpoint=endpointOverride||await getServerUrl(),layer=makeWakeLayer(),title=layer.querySelector('[data-wake-title]'),copy=layer.querySelector('[data-wake-text]'),cancel=layer.querySelector('[data-wake-cancel]');
  const run={cancelled:false,cancelWait:null,controllers:new Set()};wakeRun=run;layer.style.display='flex';title.textContent=LANG==='ko'?'서버 연결 중…':'Connecting to server…';
  cancel.onclick=()=>{run.cancelled=true;for(const controller of run.controllers)controller.abort();run.cancelWait?.()};const started=deadline-180000;let attempt=0,stage='gateway';
  try{
   while(Date.now()<deadline){if(run.cancelled)throw new Error(LANG==='ko'?'연결을 취소했습니다.':'Connection cancelled.');
    attempt++;const elapsed=Math.floor((Date.now()-started)/1000);const progress=stage==='workers'?(LANG==='ko'?`게임 서버 준비 중 (${elapsed}/180초)`:`Starting game servers (${elapsed}/180s)`):(LANG==='ko'?`접속 서버 연결 중 (${elapsed}/180초)`:`Connecting to gateway (${elapsed}/180s)`);copy.textContent=LANG==='ko'?`첫 실행은 최대 1분 정도 걸릴 수 있습니다. ${progress}`:`The first startup can take up to about a minute. ${progress}`;
    let response=null,health=null;
    const path=stage==='workers'?'/api/ready'+(Number.isInteger(workerIndex)&&workerIndex>0?'?worker='+workerIndex:''):'/health';
    try{({response,health}=await connectionFetch(`${endpoint}${path}`,run,Math.min(6000,deadline-Date.now())))}catch{}
    if(run.cancelled)throw new Error(LANG==='ko'?'연결을 취소했습니다.':'Connection cancelled.');
    if(response?.ok&&health?.ok){
     if(stage==='gateway'&&health.service==='drifter-gateway'){stage='workers';attempt=0;continue}
     if(stage==='gateway'||health.ready===true){if(!window.Colyseus?.Client)throw new Error(LANG==='ko'?'Colyseus SDK를 불러오지 못했습니다.':'Could not load the Colyseus SDK.');if(!client)client=makeCoopClient(endpoint);return endpoint}
    }
    if(stage==='workers'&&Array.isArray(health?.wakeUrls)){
     const urls=[...new Set(health.wakeUrls)].slice(0,16).filter(value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname.endsWith('.onrender.com')&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname==='/'}catch{return false}});
     await Promise.allSettled(urls.map(url=>connectionFetch(url+'/health',run,Math.max(1,Math.min(6000,deadline-Date.now())))));
     if(run.cancelled)throw new Error(LANG==='ko'?'연결을 취소했습니다.':'Connection cancelled.');
    }
    if(stage==='workers'&&response?.status===404)throw new Error(LANG==='ko'?'게임 서버의 연결 업데이트가 아직 배포되지 않았습니다.':'The game server connection update has not been deployed yet.');
    const pause=Math.max(0,Math.min(5000,1000+attempt*750,deadline-Date.now()));run.cancelWait=null;await wait(pause,run);
   }
   throw new Error(LANG==='ko'?'180초 동안 게임 서버가 준비되지 않았습니다. 잠시 뒤 다시 시도해 주세요.':'The game servers were not ready within 180 seconds. Please retry later.');
  }finally{layer.style.display='none';if(wakeRun===run)wakeRun=null}
 }
 async function apiPost(path,payload,deadline=Date.now()+180000){for(let attempt=0;attempt<3;attempt++){let response;try{response=await fetch(`${serverUrl}${path}`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(Math.max(1,Math.min(20000,deadline-Date.now())))})}catch{throw new Error(LANG==='ko'?'서버 요청이 끊겼습니다. 다시 시도해 주세요.':'The server request timed out. Please retry.')};const data=await response.json().catch(()=>({}));if(data.code==='WORKERS_WAKING'&&attempt<2){await wakeServer(data.workerIndex,deadline);continue}if(!response.ok)throw new Error(data.error||(LANG==='ko'?`서버 요청에 실패했습니다 (${response.status}).`:`Server request failed (${response.status}).`));return data}}
 function clearServerUrlCaches(){serverUrl='';client=null}
 function saveNickname(){nickname=cleanName(ui.name.value||nickname);try{localStorage.setItem(NAME_KEY,nickname)}catch{}ui.name.value=nickname;return nickname}
 function createRequestId(){try{return crypto.randomUUID()}catch{return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`}}
 function resetRoomTracking(){clearPartyCaches();lastStateAt=0;lastEnemyAt=0;lastCheckpointAt=0;lastLootPublishAt=0;lootPublishCursor='';rateState={x:0,y:0,hp:0,maxHp:0,level:0,face:0,moving:false}}
 function attachPartyMemberHandler(target){if(!target||memberEventRooms.has(target))return target;memberEventRooms.add(target);target.onMessage('party:member',()=>{if(room===target&&roomReady)applyRoomState(target.state)});return target}

 async function connectAndCreate(){
  if(room)throw new Error(LANG==='ko'?'현재 파티에서 나간 뒤 새 파티를 만드세요.':'Leave the current party before creating another.');
  const fromGame=state==='play';let solo=null;if(fromGame){rememberSolo();try{solo=JSON.parse(soloSnapshot||'null')}catch{}if(!validSave(solo)||!Number.isInteger(solo.seed)||solo.seed<1||solo.seed>4_294_967_295)throw new Error(LANG==='ko'?'현재 월드 시드를 확인하지 못했습니다.':'Could not validate the current world seed.')}
  const deadline=Date.now()+180000;nickname=saveNickname();tell(LANG==='ko'?'서버를 확인하고 방을 만들고 있습니다…':'Waking the server and creating a room…',true);await wakeServer(undefined,deadline);
  const payload={nickname,requestId:createRequestId()};if(fromGame){payload.worldSeed=Math.trunc(solo.seed);payload.x=Number(player.x)||268;payload.y=Number(player.y)||268}
  const data=await apiPost('/api/rooms',payload,deadline);await enterRoom(data);tell(LANG==='ko'?'방을 만들었습니다. 8자리 코드를 친구에게 보내세요.':'Room created. Share the 8-character code with your friends.');if(fromGame){await hostStart()}
 }
 async function connectAndJoin(){
  if(room)throw new Error(LANG==='ko'?'현재 파티에서 나간 뒤 다른 파티에 참가하세요.':'Leave the current party before joining another.');
  const code=String(ui.code.value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);if(code.length!==8)throw new Error(LANG==='ko'?'친구가 공유한 8자리 방 코드를 입력하세요.':'Enter the 8-character room code your friend shared.');
  const deadline=Date.now()+180000;ui.code.value=code;nickname=saveNickname();tell(LANG==='ko'?'서버를 확인하고 방에 참가하고 있습니다…':'Waking the server and joining the room…',true);await wakeServer(undefined,deadline);const data=await apiPost('/api/rooms/join',{code,nickname},deadline);await enterRoom(data);tell(roomMeta()?.room_status==='playing'?(LANG==='ko'?'탐험에 합류했습니다.':'Joined the expedition.'):(LANG==='ko'?'대기실에 합류했습니다.':'Joined the lobby.'));
 }
 async function enterRoom(info){
  if(!info||typeof info!=='object'||!info.reservation||!info.code)throw new Error(LANG==='ko'?'서버에서 방 예약을 받지 못했습니다.':'The server did not return a room reservation.');
  resetRoomTracking();closed=false;roomReady=false;
  try{room=await client.consumeSeatReservation(info.reservation);attachPartyMemberHandler(room)}catch(error){room=null;closed=true;throw new Error(String(error?.message||(LANG==='ko'?'방에 연결하지 못했습니다.':'Could not connect to the room.')))}
  const address=info.reservation.publicAddress;roomEndpoint=address?new URL(/^https?:\/\//i.test(address)?address:new URL(serverUrl).protocol+'//'+address).origin:serverUrl;
  await new Promise((resolve,reject)=>{const current=room,until=Date.now()+8000;const check=()=>{if(room!==current)return reject(new Error('Room connection changed.'));if(current.state?.players?.has(current.sessionId))return resolve();if(Date.now()>until)return reject(new Error(LANG==='ko'?'방 상태를 받지 못했습니다.':'Room state did not arrive.'));setTimeout(check,25)};check()});
  sessionId=room.sessionId;roomReady=true;attachRoomHandlers(room);syncPlatformRoom();applyRoomState(room.state);displayRoom();setPanel(true);
  rememberConnection(info.code);
  if(room.state?.started)await launchWorld(true);
 }
 function rememberConnection(code){try{localStorage.setItem('drifter_colyseus_active_v120',JSON.stringify({code:code||roomMeta()?.room_code,token:room.reconnectionToken,endpoint:roomEndpoint,expiresAt:Date.now()+24*60*60*1000}))}catch{}}
 function attachRoomHandlers(target){
  target.onStateChange(shared=>{if(room===target)applyRoomState(shared)});
  target.onMessage('party:started',()=>{if(room!==target)return;displayRoom();if(!inPartyWorld)launchWorld(true).catch(handleError)});
  target.onMessage('party:ended',()=>{if(room===target)detachRoom(LANG==='ko'?'방장이 파티를 종료했습니다.':'The host ended the party.')});
  target.onMessage('world:node-change',data=>{if(room===target)nodeEffect(data)});
  target.onMessage('world:enemy-change',data=>{if(room===target)enemyEffect(data)});
  target.onMessage('loot:upserted',()=>{});
  target.onMessage('loot:published',data=>{if(room!==target)return;for(const id of data?.accepted||[]){pendingPublish.delete(id);const local=lootIndex.get(id);if(local)local.mpPending=false}for(const id of data?.rejected||[]){pendingPublish.delete(id);clearLootLocal(id)}});
  target.onMessage('loot:claimed',data=>{if(room===target&&typeof data?.id==='string')finishLootClaim(data)});
  target.onMessage('loot:removed',data=>{if(room===target&&typeof data?.id==='string'){claimedLoot.add(data.id);clearLootLocal(data.id)}});
  target.onMessage('loot:denied',data=>{if(room!==target)return;pendingLootClaims.delete(data?.id);if(data?.removed){claimedLoot.add(data.id);clearLootLocal(data.id)}});
  target.onMessage('world:reward',data=>{if(room===target)applyReward(data)});
  target.onMessage('world:action-result',data=>{if(room===target)finishAction(data)});
  target.onMessage('player:correction',data=>{if(room===target&&inPartyWorld&&Number.isFinite(data?.x)&&Number.isFinite(data?.y)){player.x=data.x;player.y=data.y;if(typeof data.sailing==='boolean')exp.sailing=data.sailing;player.kbx=player.kby=0;cam.x=player.x;cam.y=player.y;viewChunks()}});
  target.onMessage('player:damaged',data=>{if(room===target)playerDamageEffect(data)});
  target.onMessage('player:swung',data=>{if(room!==target||data?.id===sessionId)return;const actor=remotes.get(data.id);if(actor){actor.swingUntil=performance.now()+180;actor.attackDir=Number(data.dir)||0}});
  target.onMessage('player:profiled',data=>{if(room===target)profileAck=Number(data?.seq)||0});
  target.onMessage('world:metrics',()=>{});
  target.onDrop(()=>{if(room===target){networkDropped=true;releaseControls();tell(LANG==='ko'?'재연결 중…':'Reconnecting…')}});
  target.onReconnect(()=>{if(room===target){networkDropped=false;rememberConnection();room.send('world:resync');sendProfile(true);applyRoomState(room.state);tell(LANG==='ko'?'연결이 복구되었습니다.':'Connection restored.');displayRoom()}});
  target.onLeave(code=>{if(room===target&&!intentionalLeave)detachRoom(LANG==='ko'?'파티 연결이 종료되었습니다.':'The party connection ended.')});
 }
 function applyRoomState(shared){
  if(!shared||!room)return;
  const next=new Map();shared.players?.forEach((p,id)=>{if(id===sessionId)return;const prev=remotes.get(id)||{uid:id,id,isRemote:true,x:Number(p.x)||0,y:Number(p.y)||0};Object.assign(prev,{targetX:Number(p.x)||0,targetY:Number(p.y)||0,hp:Number(p.hp)||0,maxHp:Number(p.maxHp)||30,lvl:Number(p.level)||1,face:p.face<0?-1:1,phase:Number(p.phase)||0,moving:!!p.moving,nickname:cleanName(p.nickname),role:p.role,connected:p.connected!==false,dead:!!p.dead,sailing:!!p.sailing,activity:p.activity,carrying:p.carrying});if(Number(p.attackSeq)>Number(prev.attackSeq||0)){prev.swingUntil=performance.now()+180;prev.attackDir=Number(p.attackDir)||0}prev.attackSeq=Number(p.attackSeq)||0;next.set(id,prev)});remotes=next;
  if(inPartyWorld&&seed===Number(shared.worldSeed)){
   applyOwnState(shared.players?.get(sessionId));applyProgress(shared.progress);
   const alive=new Set();shared.entities?.forEach((data,id)=>{id=String(id);alive.add(id);applyEnemyState(id,data)});for(const [id,e]of entityIndex)if(!alive.has(id)){removeEnemy(e);entityIndex.delete(id)}
   shared.nodes?.forEach((data,id)=>applyNodeState(String(id),data));
   const present=new Set(),lootRadius=CS*(updateRadius()+1);shared.loot?.forEach((item,id)=>{id=String(id);present.add(id);if(Math.abs(item.x-player.x)>lootRadius||Math.abs(item.y-player.y)>lootRadius){if(lootIndex.has(id)&&!pendingPublish.has(id)&&!pendingLootClaims.has(id))clearLootLocal(id);return}if(lootSignatures.get(id)!==item.data||!lootIndex.has(id)){try{applyLoot(JSON.parse(item.data));lootSignatures.set(id,item.data)}catch{}}});
   for(const id of lootIndex.keys())if(!present.has(id)&&!pendingPublish.has(id)&&!pendingLootClaims.has(id))clearLootLocal(id);
   if(Number.isFinite(shared.worldTime)&&Math.abs(gameT-shared.worldTime)>.8)gameT=shared.worldTime;
  }
  if(shared.started&&!inPartyWorld&&sessionId!==shared.hostSessionId)launchWorld(true).catch(handleError);displayRoom();
 }
 function remotePlayers(){return active()&&inPartyWorld&&room.state?.started?[...remotes.values()].filter(p=>p.connected!==false&&!p.dead):[]}
 function getWorldSeed(){return active()?Number(room.state.worldSeed)||0:0}
 function hostSpawn(){const host=room?.state?.players?.get(room.state.hostSessionId);if(!host)return;player.x=Number(host.x)||268;player.y=Number(host.y)||268;if(sessionId!==room.state.hostSessionId){player.x+=24;player.y+=24}player.invuln=Math.max(player.invuln,2);cam.x=player.x;cam.y=player.y;viewChunks();drawMinimap()}
 async function launchWorld(restore){
  if(launching||inPartyWorld||!room?.state?.started)return;
  if(Number(room.state.worldVersion||0)!==3)throw new Error(LANG==='ko'?'게임 서버 업데이트가 필요합니다.':'The game server needs an update.');
  launching=true;setBusyControls();const target=room;
  try{rememberSolo();resetMenus();inPartyWorld=true;usePartyStorage();let loaded=false;
   try{const raw=baseStorage.getItem(mapSaveKey(SAVE_KEY)),saved=raw?JSON.parse(raw):null;if(validSave(saved)&&Number(saved.seed)===Number(target.state.worldSeed))loaded=loadSave();
    else if(sessionId===target.state.hostSessionId&&soloSnapshot){const solo=JSON.parse(soloSnapshot);if(validSave(solo)&&solo.seed===Number(target.state.worldSeed)){baseStorage.setItem(mapSaveKey(SAVE_KEY),soloSnapshot);loaded=loadSave()}}
   }catch{}
   if(loaded){applyLang();startPlay()}else freshStart();if(room!==target||!roomReady)return;
   groundEquip=groundEquip.filter(g=>g.mpPrivate||g.mpId);groundRes=groundRes.filter(g=>g.mpId);for(const c of chunks.values())c.enemies=[];
   hostSpawn();loadLedger();sendProfile(true);applyRoomState(room.state);inPartyWorld=true;usePartyStorage();baseSave();displayRoom();setPanel(false);startSync();
   for(const d of deferredGrants.values())finishLootClaim(d);deferredGrants.clear();for(const d of deferredRewards.values())applyReward(d);deferredRewards.clear();await pushCheckpoint();
  }finally{launching=false;setBusyControls();if(room)displayRoom()}
 }
 async function hostStart(){if(!room||room.state.hostSessionId!==sessionId||room.state.started)return;ui.start.disabled=true;tell(LANG==='ko'?'탐험을 준비하고 있습니다…':'Starting the expedition…');let world=null;try{if(soloSnapshot){const saved=JSON.parse(soloSnapshot);world={destroyed:saved.destroyed,looted:saved.looted,caveLooted:saved.caveLooted,ruinDone:saved.ruinDone,groundEquip:saved.groundEquip,groundRes:saved.groundRes,gameT:saved.gameT,exp:{claimed:saved.exp?.claimed,runes:saved.exp?.runes,mirrors:saved.exp?.mirrors,enemyDead:saved.exp?.enemyDead,seeds:saved.exp?.seeds,planted:saved.exp?.planted,stash:saved.exp?.stash,fireRadius:saved.exp?.fireRadius,fireUpdatedAt:saved.exp?.fireUpdatedAt}}}}catch{}const encoded=JSON.stringify(world);if(encoded.length>100000){if(encoded.length>4*1024*1024)throw new Error(LANG==='ko'?'공유할 월드 기록이 너무 큽니다.':'The world snapshot is too large.');const bootstrapId=createRequestId(),count=Math.ceil(encoded.length/32000);for(let i=0;i<count;i++){room.send('world:bootstrap-chunk',{id:bootstrapId,index:i,count,data:encoded.slice(i*32000,(i+1)*32000)});if(i%8===7)await new Promise(resolve=>setTimeout(resolve,110))}room.send('room:start',{bootstrapId})}else room.send('room:start',{world});await new Promise((resolve,reject)=>{const until=Date.now()+5000;const check=()=>{if(room?.state?.started)return resolve();if(Date.now()>until)return reject(new Error(LANG==='ko'?'서버가 탐험 시작에 응답하지 않았습니다.':'The server did not confirm the start.'));setTimeout(check,100)};check()});if(!inPartyWorld)await launchWorld(false);tell(LANG==='ko'?'탐험을 시작했습니다.':'Expedition started.')}
 async function pushCheckpoint(){if(!room||!inPartyWorld||state!=='play')return false;try{baseSave();lastCheckpointAt=Date.now();return true}catch{return false}}
 async function leaveRoom(){if(!room)return;const old=room;try{if(inPartyWorld&&state==='play')baseSave()}catch{}tell(LANG==='ko'?'파티 연결을 종료하는 중…':'Closing party connection…',true);intentionalLeave=true;roomReady=false;closed=true;const leaving=disconnectRoom(old);if(room===old)await detachRoom('');await leaving;intentionalLeave=false;tell(LANG==='ko'?'파티에서 나왔습니다. 개인 여정을 계속하거나 새 파티에 참가할 수 있습니다.':'Left the party. Continue solo or create/join another party.')}
 function handleError(error){const detail=String(error?.message||error||'Unknown error').replace(/\s+/g,' ').slice(0,220);tell((LANG==='ko'?'연결 실패: ':'Connection failed: ')+detail);if(ui.start)ui.start.disabled=false}
 async function runTask(action){if(busy||launching)return false;busy=true;setPanel(true);setBusyControls();try{await action();return true}catch(error){handleError(error);return false}finally{busy=false;setBusyControls();if(room)displayRoom();else displaySolo()}}
 function roomCodeFromInvite(params){if(typeof params==='string'){try{params=JSON.parse(params)}catch{return params}}if(!params||typeof params!=='object')return'';return String(params.roomCode||params.room_code||params.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)}
 async function joinFromPlatform(params){const code=roomCodeFromInvite(params);if(code.length!==8){setPanel(true);tell(LANG==='ko'?'초대 정보에서 방 코드를 찾지 못했습니다.':'The invite did not include a room code.');return}if(room){if(roomMeta()?.room_code===code)return;setPanel(true);tell(LANG==='ko'?'현재 방에서 나간 뒤 초대를 열어 주세요.':'Leave your current room before joining this invite.');return}ui.code.value=code;ui.name.value=nickname;await runTask(connectAndJoin)}
 async function platformReady(){if(platformReadyStarted)return;platformReadyStarted=true;const platform=window.DrifterPlatform;if(!platform?.isCrazyGames)return;if(platform.username){nickname=cleanName(platform.username);ui.name.value=nickname;ui.name.readOnly=true;ui.name.setAttribute('aria-label',LANG==='ko'?'CrazyGames 사용자 이름':'CrazyGames username')}platform.onJoinRoom(joinFromPlatform);if(platform.inviteParams){await joinFromPlatform(platform.inviteParams);return}if(platform.isInstantMultiplayer&&!room){setPanel(true);tell(LANG==='ko'?'친구와 함께할 방을 만들고 있습니다…':'Creating a room for your party…');await runTask(connectAndCreate)}}


 function nodeId(n){return `${n.chunkKey}:${n.idx}`}
 function enemyId(e){return String(e?.originId||'')}
 function shouldSimulateEnemy(){return !inPartyWorld}
 function applyNodeTo(n,d){n.hp=Math.max(0,Number(d.hp)||0);n.maxHp=Math.max(1,Number(d.maxHp)||n.maxHp);n.dead=!!d.dead;n.looted=!!d.looted;if(n.dead){destroyed[n.chunkKey]??=[];if(!destroyed[n.chunkKey].includes(n.idx))destroyed[n.chunkKey].push(n.idx)}if(n.type==='cave'&&n.looted)caveLooted.add(nodeId(n));if(n.type==='ruin'&&n.looted)ruinDone.add(nodeId(n));}
 function applyNodeState(id,d){const split=id.lastIndexOf(':'),c=chunks.get(id.slice(0,split));if(!c)return;const n=c.nodes.find(n=>nodeId(n)===id);if(n)applyNodeTo(n,d)}
 function syncChunk(c){if(worldApplying||!room)return;worldApplying=true;try{c.enemies=c.enemies.filter(e=>e.mpServer);for(const n of c.nodes){const d=room.state?.nodes?.get(nodeId(n));if(d)applyNodeTo(n,d);if(n.islandId){n.dead=false;n.looted=n.rune>=0?(exp.runes[n.islandId]||[]).includes(n.rune):exp.claimed.includes(n.islandId)}}}finally{worldApplying=false}}
 function nodeEffect(d){if(!inPartyWorld||!d||typeof d.id!=='string')return;const id=d.id,revision=Number(d.revision)||0;if((appliedNodeVersions.get(id)||0)>=revision)return;appliedNodeVersions.set(id,revision);const c=chunks.get(id.slice(0,id.lastIndexOf(':'))),n=c?.nodes.find(n=>nodeId(n)===id);if(n){applyNodeTo(n,d);n.shake=.2;if(d.damage){floater(n.x,n.y-24,'-'+d.damage,'#f2e6c8');burst(n.x,n.y-10,['#9bad86','#8d8a80'],5);sfx('chop')}}}
 function removeEnemy(e){const key=e.mpChunk,c=key?chunks.get(key):null;if(c){const i=c.enemies.indexOf(e);if(i>=0)c.enemies.splice(i,1)}else for(const c of chunks.values()){const i=c.enemies.indexOf(e);if(i>=0)c.enemies.splice(i,1)}}
 function applyEnemyState(id,d){if(!d||d.dead||Number(d.hp)<=0){const e=entityIndex.get(id);if(e)removeEnemy(e);entityIndex.delete(id);return}const x=Number(d.x),y=Number(d.y);if(!Number.isFinite(x)||!Number.isFinite(y)||!ENEMY_INFO[d.kind])return;
  if(Math.abs(x-player.x)>CS*(updateRadius()+1)||Math.abs(y-player.y)>CS*(updateRadius()+1)){const old=entityIndex.get(id);if(old)removeEnemy(old);entityIndex.delete(id);return}
  let e=entityIndex.get(id);if(!e){e={type:d.kind,x,y,hp:d.hp,maxHp:d.maxHp,anim:Number(d.anim)||0,kx:0,ky:0,flash:0,fx:1,alert:0,aggroed:!!d.aggroed,isEnemy:true,originId:id,homeX:Number(d.homeX)||x,homeY:Number(d.homeY)||y,tier:Number(d.tier)||0,elite:!!d.elite,_u:0,mpServer:true};entityIndex.set(id,e)}
  const key=`${Math.floor(x/CS)},${Math.floor(y/CS)}`;if(e.mpChunk!==key)removeEnemy(e);const c=getChunk(Math.floor(x/CS),Math.floor(y/CS));if(!c.enemies.includes(e))c.enemies.push(e);e.mpChunk=key
  Object.assign(e,{mpTargetX:x,mpTargetY:y,hp:Number(d.hp),maxHp:Number(d.maxHp),tier:Number(d.tier)||0,elite:!!d.elite,aggroed:!!d.aggroed,fx:d.face<0?-1:1});
 }
 function enemyEffect(d){if(!inPartyWorld||!d||typeof d.id!=='string')return;const seq=Number(d.revision)||0;if((appliedEnemyVersions.get(d.id)||0)>=seq)return;appliedEnemyVersions.set(d.id,seq);const e=entityIndex.get(d.id);if(e){e.flash=.15;if(d.damage){floater(e.x,e.y-20,'-'+d.damage,'#f2e6c8');burst(e.x,e.y-6,['#c8564a','#e8e2cf'],6);sfx('hit')}if(d.dead){removeEnemy(e);entityIndex.delete(d.id)}}}
 function applyProgress(raw){if(typeof raw!=='string'||raw===progressSignature)return;let p;try{p=JSON.parse(raw)}catch{return}progressSignature=raw;for(const k of ['claimed','seeds','planted','stash'])if(Array.isArray(p[k]))exp[k]=p[k];for(const k of ['runes','mirrors'])if(p[k]&&typeof p[k]==='object')exp[k]=p[k];if(Number.isFinite(p.fireRadius))exp.fireRadius=p.fireRadius;if(Number.isFinite(p.fireUpdatedAt))exp.fireUpdatedAt=p.fireUpdatedAt;exp.partySold=p.sold||{};
  for(const [id,stock]of Object.entries(exp.shops||{}))for(let i=0;i<stock.length;i++)if(p.sold?.[`${id}:${i}`])stock[i].stock=0;
  for(const c of chunks.values())syncChunk(c);terrainLRU.clear();if(invOpen)renderPanel();if(dlg?.shop)showShopUI();
 }
 function applyOwnState(p){if(!p?.ready)return;const wasDead=player.dead;player.hp=Math.max(0,Number(p.hp)||0);player.dead=!!p.dead;
  if(player.dead&&!wasDead){exp.sailing=false;exp.carrying=null;guideWisp=null;releaseControls();if(fishing)cancelFishing();$('deathfade').style.opacity=1;for(const key of RES_KEYS)player.res[key]=Math.floor((player.res[key]||0)*.75);for(const key in player.fish)player.fish[key]=Math.floor(player.fish[key]*.75);toast(t('toastDied'));baseSave()}
  if(!player.dead&&wasDead){$('deathfade').style.opacity=0;player.stam=stats.maxStam;player.invuln=2;player.kbx=player.kby=0;toast(t('toastRevived'));renderRes();renderQuickbar()}
  if(selfPositionSeq!==Number(p.positionSeq)){selfPositionSeq=Number(p.positionSeq);exp.sailing=!!p.sailing;player.x=Number(p.x);player.y=Number(p.y);player.kbx=player.kby=0;cam.x=player.x;cam.y=player.y}
  const carry=String(p.carrying||'');if(carry){const [id,rune]=carry.split('|');exp.carrying={id,rune:Number(rune)}}else{exp.carrying=null;guideWisp=null}
 }
 function playerDamageEffect(d){if(!inPartyWorld||!d)return;if(d.id===sessionId){if(Number(d.seq)<=selfDamageSeq)return;selfDamageSeq=Number(d.seq);player.hp=Math.max(0,Number(d.hp)||0);const dx=player.x-Number(d.x),dy=player.y-Number(d.y),length=Math.hypot(dx,dy)||1;player.kbx=dx/length*130;player.kby=dy/length*130;player.invuln=1;sfx('hurt');camShake=5;$('dmgflash').style.opacity=1;setTimeout(()=>$('dmgflash').style.opacity=0,120)}else{const actor=remotes.get(d.id);if(actor){actor.hp=Number(d.hp)||0;floater(actor.x,actor.y-30,'-'+d.damage,'#e9aa98')}}}
 function safeGear(eq){if(!eq||typeof eq!=='object'||!BASES[eq.base]||!Array.isArray(eq.opts)||eq.opts.length>3)return null;return{...eq,opts:eq.opts.filter(o=>o&&STAT_META[o.k]&&Number.isFinite(o.v)).map(o=>({k:o.k,v:o.v}))}}
 function applyLoot(raw){if(!raw||typeof raw.id!=='string'||claimedLoot.has(raw.id)||grantIds.has(raw.id)||!Number.isFinite(raw.x)||!Number.isFinite(raw.y))return;
  if(Math.abs(raw.x-player.x)>CS*(updateRadius()+1)||Math.abs(raw.y-player.y)>CS*(updateRadius()+1)){clearLootLocal(raw.id);return}
  let g=lootIndex.get(raw.id);if(raw.kind==='resource'&&RES_META[raw.res]){if(!g){g={res:raw.res,x:raw.x,y:raw.y,vx:0,vy:0,t:0,magnet:false,mpId:raw.id};groundRes.push(g);lootIndex.set(raw.id,g)}g.res=raw.res;g.amount=Math.max(1,Number(raw.amount)||1)}
  else if(raw.kind==='equipment'){const eq=safeGear(raw.eq);if(!eq)return;if(!g){g={eq,x:raw.x,y:raw.y,ttl:null,uid:++uid,spawnT:gameT,mpId:raw.id};groundEquip.push(g);lootIndex.set(raw.id,g)}g.eq=eq;g.star=!!raw.star;if(raw.ck!==undefined){g.ck=raw.ck;g.idx=raw.idx}if(g.star){starActive={eq,x:raw.x,y:raw.y};landmarks.set('star',{t:'star',x:raw.x,y:raw.y})}}
  if(g){g.x=raw.x;g.y=raw.y;g.vx=g.vy=0;g.mpPending=false;g.ttl=null;pendingPublish.delete(raw.id)}
 }
 function publishLoot(item){if(!inPartyWorld||!item||item.mpPrivate||worldApplying)return false;
  if(item.ck!==undefined&&!item.mpId){const i=groundEquip.indexOf(item);if(i>=0)groundEquip.splice(i,1);return true}
  if(!item.mpId)item.mpId=`drop:${room.roomId||room.id}:${sessionId}:${++lootSeq}:${Date.now()}`;const id=String(item.mpId);if(claimedLoot.has(id)||grantIds.has(id))return true;
  const payload={id,kind:item.res?'resource':'equipment',x:Number(item.x),y:Number(item.y),ttl:item.ttl===null?null:Math.max(1,Math.min(45,Number(item.ttl)||30)),...(item.res?{res:item.res,amount:item.amount||1}:{eq:safeGear(item.eq)})};if(payload.kind==='equipment'&&!payload.eq)return true;
  pendingPublish.set(id,{payload,lastSent:0});lootIndex.set(id,item);item.mpPending=true;return true;
 }
 function removeLoot(item){if(inPartyWorld&&item?.mpId){lootIndex.delete(item.mpId);pendingPublish.delete(item.mpId)}}
 function clearLootLocal(id){pendingLootClaims.delete(id);ownedLoot.delete(id);lootIndex.delete(id);lootSignatures.delete(id);for(let i=groundEquip.length-1;i>=0;i--)if(groundEquip[i].mpId===id){if(groundEquip[i].star){starActive=null;landmarks.delete('star')}groundEquip.splice(i,1)}for(let i=groundRes.length-1;i>=0;i--)if(groundRes[i].mpId===id)groundRes.splice(i,1);if(replaceState?.g?.mpId===id){replaceState=null;if(invOpen)renderPanel()}}
 function loadLedger(){const saved=exp.partyReceipts||{};for(const v of saved.grants||[])grantIds.add(v);for(const v of saved.rewards||[])rewardIds.add(v);for(const v of saved.actions||[])actionIds.add(v);for(const payload of exp.partyPending||[])if(payload?.requestId&&!actionIds.has(payload.requestId))pendingActions.set(payload.requestId,{payload,callback:null,lastSent:0})}
 function saveLedger(){exp.partyReceipts={grants:[...grantIds],rewards:[...rewardIds],actions:[...actionIds]};exp.partyPending=[...pendingActions.values()].map(v=>v.payload);baseSave()}
 function recoverGear(eq){eq=safeGear(eq);if(!eq)return;const slot=player.equip.indexOf(null);if(slot>=0){player.equip[slot]=eq;recalcStats();renderSlots()}else groundEquip.push({eq,x:player.x+16,y:player.y+12,ttl:null,uid:++uid,spawnT:gameT,mpPrivate:true})}
 function finishLootClaim(data){if(!inPartyWorld){if(data.claimant===sessionId)deferredGrants.set(data.id,data);return}const id=data.id,pending=pendingLootClaims.get(id),mine=data.claimant===sessionId;
  if(mine&&!grantIds.has(id)){const raw=data.item;if(raw?.kind==='resource'&&RES_META[raw.res]){const amount=Math.max(1,Number(raw.amount)||1);player.res[raw.res]+=amount;for(let i=0;i<amount;i++)questEvent('gather',raw.res);if(typeof noteCollected==='function')noteCollected(raw.res,amount);renderRes(true);sfx('res');floater(player.x,player.y-30,'+'+amount+' '+RES_META[raw.res][LANG],'#a9c7a0')}
   else if(raw?.kind==='equipment'){if(typeof pending?.grant==='function')pending.grant();else recoverGear(raw.eq);if(raw.star){questEvent('star');toast(t('starToast'))}}
   grantIds.add(id);claimedLoot.add(id);clearLootLocal(id);saveLedger();room?.send('loot:ack',{id});
  }else{claimedLoot.add(id);clearLootLocal(id);if(mine)room?.send('loot:ack',{id})}
 }
 function claimLoot(item,grant){if(!inPartyWorld||item?.mpPrivate)return false;if(!item?.mpId){publishLoot(item);return true}const id=String(item.mpId);if(networkDropped||pendingPublish.has(id)||item.mpPending||claimedLoot.has(id)||grantIds.has(id)||pendingLootClaims.has(id))return true;pendingLootClaims.set(id,{grant,sentAt:performance.now()});room?.send('loot:claim',{id});return true}
 function applyReward(data){if(!data||typeof data.id!=='string')return;if(!inPartyWorld){deferredRewards.set(data.id,data);return}if(!rewardIds.has(data.id)){if(Number.isFinite(data.xp)&&data.xp>0)addXP(data.xp);if(data.quest)questEvent(data.quest,data.kind);if(data.glass)exp.glass+=data.glass;if(data.shard>0){exp.blueprint=Math.max(exp.blueprint,data.shard);exp.shards[data.shard]=(exp.shards[data.shard]||0)+(data.shardCount||1)}rewardIds.add(data.id);saveLedger()}room?.send('reward:ack',{id:data.id})}
 function sendNodeHit(node){if(room&&node?.isNode)room.send('world:node-hit',{id:nodeId(node),kind:node.type})}
 function sendEnemyHit(enemy){if(room&&enemy?.isEnemy)room.send('world:enemy-hit',{id:enemyId(enemy),kind:enemy.type})}
 function nodeInteraction(node,base){if(!inPartyWorld)return base?.call(window,node);if(!networkDropped&&node&&!node.looted)room?.send('world:interact',{id:nodeId(node),kind:node.type});return}
 function sendProfile(force=false){if(!room||!inPartyWorld||networkDropped)return;const equipment=player.equip.map(safeGear),resources=Object.fromEntries(RES_KEYS.map(k=>[k,Math.max(0,Math.floor(Number(player.res[k])||0))])),signature=JSON.stringify([equipment,player.lvl,resources]),now=performance.now();if(force||signature!==gearSignature){gearSignature=signature;profileSeq++;profileAck=0}if(profileAck!==profileSeq&&(force||now-lastProfileSent>600)){lastProfileSent=now;room.send('player:ready',{equipment,resources,level:player.lvl,hp:player.hp,seq:profileSeq})}}
 function sendAction(payload,callback){if(networkDropped||!room||pendingActions.size)return false;payload={...payload,requestId:createRequestId()};pendingActions.set(payload.requestId,{payload,callback,lastSent:performance.now()});saveLedger();room.send('world:action',payload);return true}
 function finishAction(data){if(!inPartyWorld||!data?.requestId)return;const pending=pendingActions.get(data.requestId);if(data.ok&&!actionIds.has(data.requestId)){if(typeof pending?.callback==='function')pending.callback(data);else if(data.op==='store'){const eq=data.eq,slot=player.equip.findIndex(e=>e&&e.id===eq?.id&&e.h1===eq.h1&&e.h2===eq.h2);if(slot>=0)player.equip[slot]=null;recalcStats()}else if(data.op==='withdraw')recoverGear(data.eq);else if(data.op==='purchase'&&data.item?.eq){if(canAfford(data.item.price)){pay(data.item.price);recoverGear(data.item.eq)}}else if(data.op==='stokeFire'){player.res.wood=Math.max(0,Number(data.wood)||0);exp.fireRadius=Number(data.fireRadius)||exp.fireRadius;exp.fireUpdatedAt=Number(data.fireUpdatedAt)||Number(room?.state?.worldTime)||gameT;renderRes(true);sfx('trade');toast(LANG==='ko'?'장작불 영역이 넓어졌습니다.':'The firelight grew.');baseSave()}else if(data.op==='craftDuskward'||data.op==='craftNightstep'){if(data.resources)for(const key of RES_KEYS)player.res[key]=Math.max(0,Number(data.resources[key])||0);profileAck=Number(data.profileSeq)||profileAck;recoverGear(data.eq);renderRes(true);sfx('level');baseSave()}actionIds.add(data.requestId)}else if(!data.ok)toast(LANG==='ko'?'다른 플레이어가 먼저 처리했거나 조건이 맞지 않습니다.':'This action is no longer available.');pendingActions.delete(data.requestId);saveLedger();room?.send('action:ack',{requestId:data.requestId});if(invOpen)renderPanel()}
 function sharedAction(action,button){if(!inPartyWorld||!['store','withdraw','stokeFire','craftDuskward','craftNightstep'].includes(action))return false;if(action==='stokeFire'||action==='craftDuskward'||action==='craftNightstep'){sendAction({op:action});return true}const index=Number(button?.dataset?.i);if(action==='store'){const eq=player.equip[index];if(eq)sendAction({op:'store',eq},()=>{const slot=player.equip.indexOf(eq);if(slot>=0)player.equip[slot]=null;recalcStats();renderSlots()})}else{const eq=exp.stash[index];if(eq)sendAction({op:'withdraw',key:`${eq.id}:${eq.h1}:${eq.h2}`},data=>recoverGear(data.eq))}return true}
 function sendState(){if(!room||!inPartyWorld||networkDropped||state!=='play')return;sendProfile();const now=performance.now(),current={x:Number(player.x)||0,y:Number(player.y)||0,face:player.face<0?-1:1,phase:Number(player.phase)||0,moving:!paused&&!partyOpen&&!dlg&&isWalking(),sailing:!!exp.sailing,activity:fishing?'fishing':''};const changed=Math.hypot(current.x-rateState.x,current.y-rateState.y)>=1||current.face!==rateState.face||current.moving!==rateState.moving||current.sailing!==rateState.sailing||current.activity!==rateState.activity;if(now-lastStateAt>=95&&(changed||now-lastStateAt>=750)){lastStateAt=now;rateState=current;room.send('player:snapshot',current)}
  const batch=[];for(const value of pendingPublish.values())if(now-value.lastSent>=900||!value.lastSent){value.lastSent=now;batch.push(value.payload);if(batch.length===24)break}if(batch.length)room.send('loot:batch',{items:batch});
  for(const [id,pending]of pendingLootClaims)if(now-pending.sentAt>1000){pending.sentAt=now;room.send('loot:claim',{id})}
  for(const pending of pendingActions.values())if(now-pending.lastSent>1000){pending.lastSent=now;room.send('world:action',pending.payload)}
 }
 function startSync(){if(syncTimer)clearInterval(syncTimer);syncTimer=setInterval(sendState,100);sendState()}
 function interpolateWorld(){if(!inPartyWorld)return;const now=performance.now(),dt=Math.min(.1,(now-(lastRenderTime||now))/1000),blend=1-Math.exp(-dt*14);lastRenderTime=now;for(const actor of remotes.values()){if(Math.hypot(actor.x-actor.targetX,actor.y-actor.targetY)>180){actor.x=actor.targetX;actor.y=actor.targetY}else{actor.x+=(actor.targetX-actor.x)*blend;actor.y+=(actor.targetY-actor.y)*blend}}
  for(const e of entityIndex.values()){if(Math.hypot(e.x-e.mpTargetX,e.y-e.mpTargetY)>160){e.x=e.mpTargetX;e.y=e.mpTargetY}else{e.x+=(e.mpTargetX-e.x)*blend;e.y+=(e.mpTargetY-e.y)*blend}e.anim+=dt;e.flash=Math.max(0,e.flash-dt)}
 }

 async function resumeStoredRoom(){let saved=null;try{saved=JSON.parse(localStorage.getItem('drifter_colyseus_active_v120')||'null')}catch{}if(!saved?.token||saved.expiresAt<Date.now())return false;try{tell(LANG==='ko'?'이전 파티 연결을 복구하고 있습니다…':'Restoring your previous party…');if(saved.endpoint){const parsed=new URL(saved.endpoint);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('Invalid saved room endpoint.');roomEndpoint=parsed.origin;await wakeServer(undefined,Date.now()+180000,roomEndpoint)}else{await wakeServer();roomEndpoint=serverUrl}const reconnectClient=makeCoopClient(roomEndpoint);room=await reconnectClient.reconnect(saved.token);attachPartyMemberHandler(room);await new Promise((resolve,reject)=>{const target=room,end=Date.now()+8000;const check=()=>{if(target.state?.players?.has(target.sessionId))return resolve();if(Date.now()>end)reject(new Error('Room state timeout'));else setTimeout(check,25)};check()});closed=false;roomReady=true;sessionId=room.sessionId;attachRoomHandlers(room);applyRoomState(room.state);displayRoom();rememberConnection(saved.code);if(room.state?.started&&!inPartyWorld)await launchWorld(true);return true}catch{try{localStorage.removeItem('drifter_colyseus_active_v120')}catch{}return false}}
 window.DrifterMultiplayer={getWorldSeed,worldTime(){return inPartyWorld&&room&&Number.isFinite(Number(room.state?.worldTime))?Number(room.state.worldTime):null},isInPartyWorld(){return inPartyWorld},remotePlayers,isActive:active,isPanelOpen(){return partyOpen},currentRoom:roomMeta,async open(){ui.name.value=nickname;if(!busy)tell('');setPanel(true);if(room){displayRoom();return}displaySolo();if(!busy)await resumeStoredRoom()},close(){if(!busy&&!launching)setPanel(false)},platformReady,async create(){return runTask(connectAndCreate)},async join(code){if(code)ui.code.value=code;return runTask(connectAndJoin)},async start(){return distributionBreak(()=>runTask(()=>room?.state?.started?launchWorld(true):hostStart()),'party-expedition')},async leave(){return runTask(leaveRoom)},async saveCheckpoint(){return pushCheckpoint()},shouldSimulateEnemy,publishWorldState(){},publishLoot,removeLoot,claimLoot,sharedAction,isTransactionPending(){return pendingActions.size>0}};
 window.damageNode=function(n,d){if(inPartyWorld){if(!networkDropped)sendNodeHit(n,d);return}return baseDamageNode?.apply(this,arguments)};
 window.damageEnemy=function(e,d){if(inPartyWorld){if(!networkDropped){if(e?.isRemote)room.send('player:attack',{target:e.id||e.uid});else sendEnemyHit(e,d)}return}return baseDamageEnemy?.apply(this,arguments)};
 window.enterCave=function(n){return nodeInteraction(n,baseEnterCave)};window.investigateRuin=function(n){return nodeInteraction(n,baseInvestigateRuin)};
 window.spawnStar=function(){if(inPartyWorld){starT=60;return}return baseSpawnStar?.apply(this,arguments)};
 window.getChunk=function(cx,cy){const c=baseGetChunk.apply(this,arguments);if(inPartyWorld)syncChunk(c);return c};
 window.findTarget=function(){let target=baseFindTarget.apply(this,arguments);if(!inPartyWorld)return target;let best=target&&!target.isNode?Math.hypot(target.x-player.x,target.y-player.y)-20:Infinity;for(const actor of remotePlayers()){const d=Math.hypot(actor.x-player.x,actor.y-player.y);if(d<stats.atkRange+20&&d<best){target=actor;best=d}}return target};
 window.updateGroundRes=function(dt){if(!inPartyWorld)return baseGroundRes.apply(this,arguments);if(networkDropped||player.dead)return;for(const item of groundRes){if(item.mpPrivate)continue;if(Math.hypot(player.x-item.x,player.y-item.y)<stats.pickup)claimLoot(item,()=>{})}};
 window.damagePlayer=function(){if(inPartyWorld)return;return baseDamagePlayer.apply(this,arguments)};
 window.healPlayer=function(){const hp=player.hp,result=baseHeal.apply(this,arguments);if(inPartyWorld&&room&&player.hp>hp)room.send('player:heal',{amount:player.hp-hp});return result};
 window.warpTo=function(){const result=baseWarp.apply(this,arguments);if(inPartyWorld&&room)room.send('player:warp',{x:player.x,y:player.y});return result};
 window.recallOrSignal=function(){const x=player.x,y=player.y,result=baseRecall.apply(this,arguments);if(inPartyWorld&&room&&Math.hypot(player.x-x,player.y-y)>100)room.send('player:warp',{x:player.x,y:player.y});return result};
 window.plantSeed=function(value){if(inPartyWorld){sendAction({op:'plant',seed:value},()=>{});return}return basePlant.apply(this,arguments)};
 window.buyItem=function(index){if(!inPartyWorld||!dlg?.shop?.[index]||dlg.shop[index].kind!=='equip')return baseBuy.apply(this,arguments);const npc=dlg.npc.id,it=dlg.shop[index];if(it.stock===0||!canAfford(it.price))return;sendAction({op:'purchase',npc,index,item:{eq:it.eq,price:it.price}},()=>{if(dlg?.npc?.id!==npc)return;it.stock=1;baseBuy.call(window,index)})};
 window.render=function(){interpolateWorld();const result=baseRender.apply(this,arguments);if(inPartyWorld){ctx.save();ctx.setTransform(SCALE*dpr,0,0,SCALE*dpr,cv.width/2-cam.x*SCALE*dpr,cv.height/2-cam.y*SCALE*dpr);for(const actor of remotePlayers()){if(actor.swingUntil>performance.now()){ctx.strokeStyle='#f1d38a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(actor.x,actor.y-5,34,actor.attackDir-.85,actor.attackDir+.85);ctx.stroke()}if(actor.activity==='fishing'){ctx.strokeStyle='#d1c0a1';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(actor.x+5,actor.y-16);ctx.lineTo(actor.x+35*actor.face,actor.y+8);ctx.stroke()}if(actor.carrying){ctx.fillStyle='#efe8b4';ctx.fillRect(actor.x-15,actor.y-20+Math.sin(gameT*4)*2,4,4)}}ctx.restore()}if(state==='play')drawNightVisibility();return result};
 ui.name.value=nickname;ui.btn?.addEventListener('click',()=>window.DrifterMultiplayer.open());ui.party?.addEventListener('click',()=>window.DrifterMultiplayer.open());ui.manage?.addEventListener('click',()=>window.DrifterMultiplayer.open());ui.create?.addEventListener('click',()=>window.DrifterMultiplayer.create());ui.join?.addEventListener('click',()=>window.DrifterMultiplayer.join());ui.code?.addEventListener('input',()=>{ui.code.value=ui.code.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)});ui.code?.addEventListener('keydown',e=>{if(e.key==='Enter')ui.join.click()});ui.start?.addEventListener('click',()=>window.DrifterMultiplayer.start());ui.leave?.addEventListener('click',()=>window.DrifterMultiplayer.leave());ui.quickLeave?.addEventListener('click',()=>window.DrifterMultiplayer.leave());ui.close?.addEventListener('click',()=>window.DrifterMultiplayer.close());
 let backdropPressed=false;ui.panel?.addEventListener('pointerdown',e=>{backdropPressed=e.target===ui.panel});ui.panel?.addEventListener('click',e=>{if(backdropPressed&&e.target===ui.panel)window.DrifterMultiplayer.close();backdropPressed=false});
 window.addEventListener('keydown',e=>{if(partyOpen){if(e.code==='Escape'||e.key==='Escape'){e.preventDefault();window.DrifterMultiplayer.close()}if((e.key==='Enter'||e.code==='Enter'||e.code==='NumpadEnter')&&e.target===ui.code&&!e.repeat){e.preventDefault();window.DrifterMultiplayer.join()}if(e.code==='Tab'||e.key==='Tab'){const controls=[...(ui.panel?.querySelectorAll('button,input,[tabindex]')||[])].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);const first=controls[0],last=controls[controls.length-1];if(first&&((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last))){e.preventDefault();(e.shiftKey?last:first).focus()}}e.stopImmediatePropagation();return}if((e.code==='KeyO'||String(e.key).toLowerCase()==='o')&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName)){e.preventDefault();e.stopImmediatePropagation();window.DrifterMultiplayer.open()}},true);
 ui.copy?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(roomMeta()?.room_code||'');tell(LANG==='ko'?'방 코드를 복사했습니다.':'Room code copied.')}catch{tell(LANG==='ko'?'방 코드를 직접 복사하세요.':'Copy the room code manually.')}});
 ui.invite?.addEventListener('click',async()=>{if(!room||!window.DrifterPlatform?.supportsInvites)return;const link=await DrifterPlatform.inviteLink({roomCode:roomMeta()?.room_code});if(!link){tell(LANG==='ko'?'CrazyGames 초대 링크를 만들지 못했습니다.':'Could not create the CrazyGames invite link.');return}try{await navigator.clipboard.writeText(link);tell(LANG==='ko'?'친구 초대 링크를 복사했습니다.':'Friend invite link copied.')}catch{tell(LANG==='ko'?'하단 CrazyGames 초대 버튼을 사용해 주세요.':'Use the CrazyGames invite button in the game footer.')}});
 window.addEventListener('beforeunload',()=>{if(inPartyWorld&&state==='play'){try{baseSave()}catch{}}});
 window.saveGame=function(){return baseSave.apply(this,arguments)};
 window.update=function(dt){if(partyOpen||(inPartyWorld&&networkDropped))return;const result=baseUpdate.apply(this,arguments);return result};
 window.tryAttack=function(){if(partyOpen||networkDropped)return;const before=player.atkCool,result=baseAttack.apply(this,arguments);if(inPartyWorld&&room&&before<=0&&player.atkCool>0&&!curTarget)room.send('player:swing',{dir:attackDir});return result};
 window.addEventListener('beforeunload',()=>{if(room){try{room.leave(false)}catch{}}});
 renderLabels();
})();
