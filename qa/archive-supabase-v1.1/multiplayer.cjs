const assert=require('assert');
const harness=require('./harness.cjs'),path=require('path');
const makeGame=options=>harness({...options,assetsDir:process.env.DRIFTER_QA_ASSETS||undefined});

function makeHub(){
 const rooms=new Map(),members=new Map(),memberTokens=new Map(),memberNames=new Map(),checkpoints=new Map(),channels=new Set();let nextUser=1;
 const failures={subscribe:0,leave:0},calls=[];
 const key=(room,user)=>`${room}:${user}`;
 function fail(message,code){return{data:null,error:Object.assign(new Error(message),{code})}}
 function hubForRoom(roomId){return[...channels].filter(ch=>ch.topic===`drifter:${roomId}`&&!ch.removed)}
 function presenceSync(roomId){for(const ch of hubForRoom(roomId))for(const h of ch.handlers)if(h.type==='presence'&&h.filter.event==='sync')h.callback()}
 function stateFor(roomId){
  const out={};for(const ch of hubForRoom(roomId))if(ch.presence)out[ch.uid]=[ch.presence];return out;
 }
 function sdkFor(label){
  const uid=`user-${label}-${nextUser++}`;let session=null;
  return{uid,disconnectFromRealtime(){for(const ch of [...channels])if(ch.uid===uid){ch.removed=true;channels.delete(ch);if(ch.presence)presenceSync(ch.topic.slice('drifter:'.length))}},createClient(){
   return{
    auth:{
     getSession:async()=>({data:{session},error:null}),
     signInAnonymously:async()=>{session={user:{id:uid}};return{data:{user:session.user,session},error:null}}
    },
    channel(topic,options){
     const ch={topic,options,uid,handlers:[],presence:null,subscribed:false,removed:false,
      on(type,filter,callback){this.handlers.push({type,filter,callback});return this},
      subscribe(callback){this.subscribed=true;channels.add(this);queueMicrotask(()=>{if(failures.subscribe){failures.subscribe--;callback('CHANNEL_ERROR');return}callback('SUBSCRIBED');const roomId=this.topic.slice('drifter:'.length);presenceSync(roomId)});return this},
      async track(presence){this.presence={...presence};presenceSync(this.topic.slice('drifter:'.length));return{status:'ok'}},
      presenceState(){return stateFor(this.topic.slice('drifter:'.length))},
      async send(message){
       const roomId=this.topic.slice('drifter:'.length);
       if(!members.get(roomId)?.has(uid))return{status:'error'};
       for(const peer of hubForRoom(roomId))if(peer!==this&&peer.subscribed){
        for(const h of peer.handlers)if(h.type==='broadcast'&&h.filter.event===message.event)h.callback({payload:message.payload});
       }
       return{status:'ok'};
      }};return ch;
    },
    async removeChannel(ch){
     ch.removed=true;channels.delete(ch);if(ch.presence)presenceSync(ch.topic.slice('drifter:'.length));return'OK';
    },
    async rpc(name,args){
     calls.push(name);
     const roomId=args?.p_room_id,joined=roomId&&members.get(roomId)?.has(uid);
     if(name==='drifter_create_room'){
      const existing=[...rooms.values()].find(r=>['waiting','playing'].includes(r.room_status)&&members.get(r.room_id)?.has(uid));
      if(existing)return{data:{room_id:existing.room_id,room_code:existing.room_code,room_status:existing.room_status,world_seed:existing.world_seed,is_host:existing.host===uid,resumed:true},error:null};
      const id=`room-${rooms.size+1}`,r={room_id:id,room_code:`4F7B${rooms.size}A91CD`,room_status:'waiting',world_seed:args.p_world_seed??500+rooms.size,is_host:true};
      rooms.set(id,{...r,host:uid});members.set(id,new Set([uid]));memberNames.set(key(id,uid),args.p_nickname);return{data:r,error:null};
     }
     if(name==='drifter_join_room'){
      const r=[...rooms.values()].find(v=>v.room_code===args.p_code);
      if(!r||r.room_status==='closed')return fail('Room code not found or expired.');
      const m=members.get(r.room_id),token=args.p_rejoin_token;
      if(!m.has(uid)){
       if([...rooms.values()].some(v=>v.room_id!==r.room_id&&['waiting','playing'].includes(v.room_status)&&members.get(v.room_id)?.has(uid)))return fail('Leave your current room before joining another.');
       const previous=[...m].find(member=>member!==uid&&(
        memberTokens.get(key(r.room_id,member))===token||
        (member!==r.host&&!memberTokens.has(key(r.room_id,member))&&memberNames.get(key(r.room_id,member))===args.p_nickname)));
       if(previous){m.delete(previous);memberTokens.delete(key(r.room_id,previous));memberNames.delete(key(r.room_id,previous));const oldSave=checkpoints.get(key(r.room_id,previous));if(oldSave){checkpoints.set(key(r.room_id,uid),oldSave);checkpoints.delete(key(r.room_id,previous))}}
       else if(m.size>=2)return fail('This room already has two players.');
       m.add(uid);
      }
      memberTokens.set(key(r.room_id,uid),token);memberNames.set(key(r.room_id,uid),args.p_nickname);
      return{data:{room_id:r.room_id,room_code:r.room_code,room_status:r.room_status,world_seed:r.world_seed,is_host:r.host===uid},error:null};
     }
     if(name==='drifter_start_room'){
      const r=rooms.get(roomId);if(!joined||r?.host!==uid)return fail('Only the room host can start it.');r.room_status='playing';return{data:true,error:null};
     }
     if(name==='drifter_save_checkpoint'){
      if(!joined||rooms.get(roomId)?.room_status!=='playing')return fail('Active room membership required.');
      checkpoints.set(key(roomId,uid),args.p_payload);return{data:true,error:null};
     }
     if(name==='drifter_load_checkpoint'){if(!joined)return fail('Room membership required.','42501');return{data:checkpoints.get(key(roomId,uid))||null,error:null}}
     if(name==='drifter_leave_room'){
      if(failures.leave){failures.leave--;return fail('Test network failure while leaving.')}
      if(!joined)return{data:false,error:null};const r=rooms.get(roomId);members.get(roomId).delete(uid);memberTokens.delete(key(roomId,uid));memberNames.delete(key(roomId,uid));if(r?.host===uid){r.room_status='closed';for(const member of members.get(roomId)){memberTokens.delete(key(roomId,member));memberNames.delete(key(roomId,member))}members.get(roomId).clear()}return{data:true,error:null};
     }
     return fail(`Unexpected RPC ${name}`);
    }
   };
  }};
 }
 return{sdkFor,rooms,members,memberTokens,memberNames,checkpoints,channels,failures,calls};
}

(async()=>{
 const configless=await makeGame();
 assert.equal(configless.elements.has('coopUrl'),false);assert.equal(configless.elements.has('coopKey'),false);
 await configless.run('DrifterMultiplayer.create()');
 assert.match(configless.elements.get('coopStatusText').textContent,/설정되지 않았습니다|not configured/i);
 const hub=makeHub();
 const solo=await makeGame();solo.run('freshStart();skipTutorial();player.res.wood=47;saveGame()');
 const soloSave=solo.storage.get('drifter_save_v1');
 const config={url:'https://demo.supabase.co',publishableKey:'sb_publishable_test'};
 const a=await makeGame({supabase:hub.sdkFor('a'),config,storage:[['drifter_save_v1',soloSave]]});
 const b=await makeGame({supabase:hub.sdkFor('b'),config,storage:[['drifter_save_v1',soloSave]]});
 await a.run('DrifterMultiplayer.create()');
 const room=a.run('DrifterMultiplayer.currentRoom()');assert(room&&room.is_host);assert.equal(room.room_status,'waiting');
 await b.run(`DrifterMultiplayer.join('${room.room_code}')`);
 assert.equal(b.run('DrifterMultiplayer.currentRoom().room_id'),room.room_id);
 await a.run('DrifterMultiplayer.start()');
 for(let i=0;i<10&&b.run('state')!=='play';i++)await new Promise(r=>setTimeout(r,0));
 assert.equal(a.run('state'),'play');assert.equal(b.run('state'),'play');
 assert.equal(a.run('DrifterMultiplayer.remotePlayers().length'),1);assert.equal(b.run('DrifterMultiplayer.remotePlayers().length'),1);
 assert.equal(a.run('seed'),room.world_seed);assert.equal(b.run('seed'),room.world_seed);
 a.run(`(()=>{const x=650,y=390,c=getChunk(Math.floor(x/CS),Math.floor(y/CS));c.enemies.push({type:'slime',x,y,hp:12,maxHp:12,anim:0,wdir:0,wt:2,kx:0,ky:0,flash:0,fx:1,alert:0,aggroed:false,isEnemy:true,originId:'qa:slime',homeX:x,homeY:y,_u:0})})()`);
 a.run('player.x=650;player.y=390;update(.2)');
 assert.equal(b.run('DrifterMultiplayer.remotePlayers()[0].targetX'),650);
 assert.equal(b.run('DrifterMultiplayer.remotePlayers()[0].targetY'),390);
 const sharedMob=b.run(`(()=>{for(const c of chunks.values())for(const e of c.enemies)if(e.originId==='qa:slime')return{hp:e.hp,x:e.mpTargetX,y:e.mpTargetY};return null})()`);
 assert(sharedMob&&Number.isFinite(sharedMob.x)&&Number.isFinite(sharedMob.y),'host mob snapshot should create and update the guest mob');
 const sharedDrop=a.run(`(()=>{const g={eq:{base:'sword',opts:[],h1:1,h2:2,id:991},x:655,y:392,ttl:null,uid:991,spawnT:gameT};addGroundEquip(g);return g.mpId})()`);
 assert(b.run(`groundEquip.some(g=>g.mpId===${JSON.stringify(sharedDrop)})`),'host loot should appear on the guest');
 b.run(`globalThis.lootAwarded=0;DrifterMultiplayer.claimLoot(groundEquip.find(g=>g.mpId===${JSON.stringify(sharedDrop)}),()=>globalThis.lootAwarded++)`);
 assert.equal(b.run('lootAwarded'),1,'host claim arbitration grants the pickup to the first claimant');
 assert(!a.run(`groundEquip.some(g=>g.mpId===${JSON.stringify(sharedDrop)})`));assert(!b.run(`groundEquip.some(g=>g.mpId===${JSON.stringify(sharedDrop)})`));
 const remoteDraw=b.run(`(()=>{const calls=[],prior=ctx.fillRect;ctx.fillRect=(...args)=>calls.push(args);exp.sailing=true;drawPlayer({x:650,y:390,face:1,phase:0,moving:false},true);exp.sailing=false;ctx.fillRect=prior;return calls})()`);
 assert(remoteDraw.some(([x,y,w,h])=>x===645&&y===378&&w===10&&h===8),'remote player renderer must preserve the remote actor even while local player is sailing');
 const nearNode=a.run(`(()=>{const p={x:player.x,y:player.y};const n=activeNodes().filter(n=>n.isNode&&n.type!=='ruin').sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];return n&&{x:n.x,y:n.y,idx:n.idx,chunkKey:n.chunkKey}})()`);
 assert(nearNode,'host and guest should have a nearby gather node');
 a.run(`player.x=${nearNode.x};player.y=${nearNode.y};cam.x=player.x;cam.y=player.y;update(.2)`);b.run('update(.2)');
 a.run(`globalThis.coopNode=chunks.get('${nearNode.chunkKey}').nodes.find(n=>n.idx===${nearNode.idx});coopNode.hp=0;coopNode.dead=true;`);
 await a.run('DrifterMultiplayer.publishWorldState(coopNode)');
 // Check the exact affected node by its stable generated index and coordinates.
 const info=a.run('({idx:coopNode.idx,x:coopNode.x,y:coopNode.y,type:coopNode.type,chunkKey:coopNode.chunkKey})');
 const synced=b.run(`(()=>{const n=getChunk(${info.chunkKey.split(',')[0]},${info.chunkKey.split(',')[1]}).nodes.find(v=>v.idx===${info.idx});return !!n?.dead})()`);
 assert.equal(synced,true);
 a.run('DrifterPlatform.storage.setItem(SAVE_KEY,"coop-save")');
 const ownKey=`drifter_coop_save_v1_${room.room_id}_user-a-1`;
 assert.equal(a.storage.get(ownKey),'coop-save');assert.equal(a.storage.get('drifter_save_v1'),soloSave);
 assert(hub.checkpoints.has(`${room.room_id}:user-a-1`));
 await a.run('DrifterMultiplayer.leave()');
 for(let i=0;i<10&&b.run('DrifterMultiplayer.currentRoom()');i++)await new Promise(r=>setTimeout(r,0));
 assert.equal(a.run('DrifterMultiplayer.currentRoom()'),null);assert.equal(b.run('DrifterMultiplayer.currentRoom()'),null);
 assert.equal(JSON.parse(b.storage.get('drifter_save_v1')).seed,JSON.parse(soloSave).seed);
 const migration=require('fs').readFileSync(require('path').join(__dirname,'../supabase/migrations/202610180001_drifter_coop.sql'),'utf8');
 assert(migration.includes('for update'));assert(migration.includes('drifter_can_access_topic'));assert(migration.includes("extension in ('broadcast','presence')"));
 console.log('PASS co-op room creation/join, presence, shared seed, remote movement/target state, private-save namespace, checkpoint RPC and host-close cleanup');
 const updates=[],sdk={environment:'crazygames',init:async()=>{},user:{systemInfo:{locale:'en-US'}},game:{settings:{},updateRoom:r=>updates.push(r),leftRoom:()=>{},inviteLink:async()=>'',showInviteButton:()=>{},hideInviteButton:()=>{},gameplayStart:()=>{},gameplayStop:()=>{}}};
 const p=await makeGame({supabase:hub.sdkFor('p'),config,sdk}),q=await makeGame({supabase:hub.sdkFor('q'),config});
 let reloads=0;p.env.location.reload=q.env.location.reload=()=>{reloads++};
 p.run('freshStart();skipTutorial();player.x=710;player.y=420;player.res.wood=83;saveGame()');
 q.run('freshStart();skipTutorial();player.x=340;player.res.wood=21;saveGame()');
 const soloP=p.run('seed'),soloQ=q.run('seed');
 p.run("startDialog({id:'party-dialog',persona:'wanderer',x:player.x,y:player.y})");await p.run('DrifterMultiplayer.open()');assert.equal(p.run('dlg'),null);p.run('DrifterMultiplayer.close()');
 p.run("openInv('bag')");await p.run('DrifterMultiplayer.open()');assert(!p.run('invOpen'));p.run('DrifterMultiplayer.close()');
 p.run('keys.KeyW=true;attackHeld=true');await p.run('DrifterMultiplayer.open()');
 assert(p.run('paused'));assert(!p.run('keys.KeyW||attackHeld'));
 p.run('globalThis.frozenTime=gameT;update(.5)');assert.equal(p.run('gameT'),p.run('frozenTime'));
 let stopped=false;const typing={code:'KeyQ',target:{tagName:'INPUT'},preventDefault(){},stopImmediatePropagation(){stopped=true}};
 for(const fn of p.captureListeners.keydown||[]){fn(typing);if(stopped)break}assert(stopped);
 p.run('DrifterMultiplayer.close()');assert(!p.run('paused'));
 const roomCount=hub.rooms.size;
 const [created,duplicate]=await Promise.all([p.run('DrifterMultiplayer.create()'),p.run('DrifterMultiplayer.create()')]);
 assert.equal(created,true);assert.equal(duplicate,false);assert.equal(hub.rooms.size,roomCount+1);
 const party=p.run('DrifterMultiplayer.currentRoom()');assert.equal(party.room_status,'playing');assert.equal(p.run('seed'),party.world_seed);assert.equal(p.run('seed'),soloP);
 assert.equal(p.run('player.x'),710);assert.equal(p.run('player.y'),420);assert.equal(p.run('player.res.wood'),83,'host keeps the live solo world and inventory when creating a party mid-game');
 assert(updates.some(r=>r.isJoinable&&r.roomId===party.room_id));
 p.run('player.x=650;player.y=390');
 await q.run(`DrifterMultiplayer.open();$('coopCode').value='${party.room_code}'`);
 let enterStopped=false,enterPrevented=false;q.elements.get('coopCode').tagName='INPUT';
 const enterJoin={code:'',key:'Enter',target:q.elements.get('coopCode'),preventDefault(){enterPrevented=true},stopImmediatePropagation(){enterStopped=true}};
 for(const fn of q.captureListeners.keydown||[]){fn(enterJoin);if(enterStopped)break}
 for(let i=0;i<12&&(!q.run('DrifterMultiplayer.currentRoom()')||q.elements.get('coopLeave').disabled);i++)await new Promise(r=>setTimeout(r,0));
 assert(enterStopped&&enterPrevented);assert(q.run('DrifterMultiplayer.currentRoom()'));
 assert.equal(q.run('seed'),party.world_seed);assert.equal(q.run('player.x'),650);assert.equal(q.run('player.y'),390);
 assert.equal(p.run('DrifterMultiplayer.remotePlayers().length'),1);assert.equal(updates.at(-1).isJoinable,false);
 assert(await q.run('DrifterMultiplayer.leave()'));
 assert.equal(q.run('state'),'play');assert.equal(q.run('seed'),soloQ);assert.equal(q.run('player.res.wood'),21);assert.equal(q.run('DrifterMultiplayer.currentRoom()'),null);
 assert.equal(p.run('DrifterMultiplayer.remotePlayers().length'),0);assert.equal(updates.at(-1).isJoinable,true);
 q.run('DrifterMultiplayer.close()');assert(!q.run('paused'));
 assert(await q.run(`DrifterMultiplayer.join('${party.room_code}')`));assert.equal(q.run('seed'),party.world_seed);
 hub.failures.leave=1;assert.equal(await q.run('DrifterMultiplayer.leave()'),false);assert(q.run('DrifterMultiplayer.currentRoom()'));assert.equal(q.elements.get('coopLeave').disabled,false);
 assert(await q.run('DrifterMultiplayer.leave()'));assert.equal(q.run('seed'),soloQ);
 assert(await q.run(`DrifterMultiplayer.join('${party.room_code}')`));
 assert(await p.run('DrifterMultiplayer.leave()'));
 for(let i=0;i<12&&q.run('DrifterMultiplayer.currentRoom()');i++)await new Promise(r=>setTimeout(r,0));
 assert.equal(p.run('seed'),soloP);assert.equal(p.run('player.res.wood'),83);assert.equal(q.run('seed'),soloQ);assert.equal(q.run('DrifterMultiplayer.currentRoom()'),null);assert.equal(reloads,0);
 p.run('DrifterMultiplayer.close()');assert(!p.run('paused'));
 hub.failures.subscribe=1;assert.equal(await p.run('DrifterMultiplayer.create()'),false);assert.equal(p.run('DrifterMultiplayer.currentRoom()'),null);assert.equal(p.run('seed'),soloP);
 assert(await p.run('DrifterMultiplayer.create()'));assert(await p.run('DrifterMultiplayer.leave()'));assert.equal(p.run('seed'),soloP);
 const waitingHost=await makeGame({supabase:hub.sdkFor('waiting'),config});
 assert(await waitingHost.run('DrifterMultiplayer.create()'));
 const waitingRoom=waitingHost.run('DrifterMultiplayer.currentRoom()');assert.equal(waitingRoom.room_status,'waiting');
 assert(await q.run(`DrifterMultiplayer.join('${waitingRoom.room_code}')`));assert.equal(q.run('seed'),soloQ);
 assert(await q.run('DrifterMultiplayer.leave()'));assert.equal(q.run('seed'),soloQ);
 assert(await q.run(`DrifterMultiplayer.join('${waitingRoom.room_code}')`));
 q.run('DrifterMultiplayer.close();player.res.wood=22;saveGame()');
 assert.equal(JSON.parse(q.storage.get('drifter_save_v1')).res.wood,22);
 assert(await waitingHost.run('DrifterMultiplayer.start()'));
 for(let i=0;i<12&&(q.run('seed')!==waitingRoom.world_seed||q.elements.get('coopLeave').disabled);i++)await new Promise(r=>setTimeout(r,0));
 assert.equal(q.run('seed'),waitingRoom.world_seed);assert(await q.run('DrifterMultiplayer.leave()'));assert.equal(q.run('seed'),soloQ);assert.equal(q.run('player.res.wood'),22);
 assert(await waitingHost.run('DrifterMultiplayer.leave()'));
 const strandedSdk=hub.sdkFor('stranded'),stranded=await makeGame({supabase:strandedSdk,config});
 assert(await stranded.run('DrifterMultiplayer.create()'));const strandedRoom=stranded.run('DrifterMultiplayer.currentRoom()'),roomCountBeforeReload=hub.rooms.size;
 const reloaded=await makeGame({supabase:strandedSdk,config});assert(await reloaded.run('DrifterMultiplayer.create()'));
 assert.equal(hub.rooms.size,roomCountBeforeReload);assert.equal(reloaded.run('DrifterMultiplayer.currentRoom()').room_id,strandedRoom.room_id);
 assert.match(reloaded.elements.get('coopStatusText').textContent,/복구|reconnected/i);
 assert(await reloaded.run('DrifterMultiplayer.leave()'));assert.equal(reloaded.run('DrifterMultiplayer.currentRoom()'),null);
 const staleJoinSdk=hub.sdkFor('stale-join'),staleJoiner=await makeGame({supabase:staleJoinSdk,config}),targetHost=await makeGame({supabase:hub.sdkFor('join-target'),config});
 assert(await staleJoiner.run('DrifterMultiplayer.create()'));const previousJoinRoom=staleJoiner.run('DrifterMultiplayer.currentRoom()');
 assert(await targetHost.run('DrifterMultiplayer.create()'));const targetRoom=targetHost.run('DrifterMultiplayer.currentRoom()');
 const joinerReload=await makeGame({supabase:staleJoinSdk,config});assert(await joinerReload.run(`DrifterMultiplayer.join('${targetRoom.room_code}')`));
 assert.equal(joinerReload.run('DrifterMultiplayer.currentRoom()').room_id,previousJoinRoom.room_id);
 assert.match(joinerReload.elements.get('coopStatusText').textContent,/나간 뒤|leave it first/i);
 assert(await joinerReload.run('DrifterMultiplayer.leave()'));
 assert(await joinerReload.run(`DrifterMultiplayer.join('${targetRoom.room_code}')`));assert.equal(joinerReload.run('DrifterMultiplayer.currentRoom()').room_id,targetRoom.room_id);
 assert(await joinerReload.run('DrifterMultiplayer.leave()'));assert(await targetHost.run('DrifterMultiplayer.leave()'));
 const orphanHostSdk=hub.sdkFor('orphan-host'),orphanGuestSdk=hub.sdkFor('orphan-guest');
 const orphanHost=await makeGame({supabase:orphanHostSdk,config}),orphanGuest=await makeGame({supabase:orphanGuestSdk,config});
 assert(await orphanHost.run('DrifterMultiplayer.create()'));const orphanRoom=orphanHost.run('DrifterMultiplayer.currentRoom()');
 assert(await orphanGuest.run(`DrifterMultiplayer.join('${orphanRoom.room_code}')`));const oldGuestId=orphanGuestSdk.uid;
 const tokenKey=`drifter_coop_rejoin_v1_${orphanRoom.room_code}`;assert(orphanGuest.storage.has(tokenKey));
 hub.checkpoints.set(`${orphanRoom.room_id}:${oldGuestId}`,'guest-checkpoint');
 await orphanGuestSdk.disconnectFromRealtime();
 const returnedGuestSdk=hub.sdkFor('orphan-guest-returned'),returnedGuest=await makeGame({supabase:returnedGuestSdk,config,storage:[...orphanGuest.storage]});
 assert(await returnedGuest.run(`DrifterMultiplayer.join('${orphanRoom.room_code}')`));
 assert.equal(returnedGuest.run('DrifterMultiplayer.currentRoom().room_id'),orphanRoom.room_id);
 assert.equal(hub.members.get(orphanRoom.room_id).size,2);assert(!hub.members.get(orphanRoom.room_id).has(oldGuestId));
 assert.equal(hub.checkpoints.get(`${orphanRoom.room_id}:${returnedGuestSdk.uid}`),'guest-checkpoint');
 assert(await returnedGuest.run('DrifterMultiplayer.leave()'));assert(await orphanHost.run('DrifterMultiplayer.leave()'));
 const legacyHost=await makeGame({supabase:hub.sdkFor('legacy-host'),config}),legacyGuestSdk=hub.sdkFor('legacy-guest'),legacyGuest=await makeGame({supabase:legacyGuestSdk,config});
 assert(await legacyHost.run('DrifterMultiplayer.create()'));const legacyRoom=legacyHost.run('DrifterMultiplayer.currentRoom()');
 assert(await legacyGuest.run(`DrifterMultiplayer.join('${legacyRoom.room_code}')`));
 hub.memberTokens.delete(`${legacyRoom.room_id}:${legacyGuestSdk.uid}`);
 await legacyGuestSdk.disconnectFromRealtime();
 const legacyReturn=await makeGame({supabase:hub.sdkFor('legacy-return'),config,storage:[...legacyGuest.storage]});
 assert(await legacyReturn.run(`DrifterMultiplayer.join('${legacyRoom.room_code}')`));
 assert.equal(hub.members.get(legacyRoom.room_id).size,2);
 assert(await legacyReturn.run('DrifterMultiplayer.leave()'));assert(await legacyHost.run('DrifterMultiplayer.leave()'));
 const html=require('fs').readFileSync(path.join(process.env.DRIFTER_QA_ASSETS||path.join(__dirname,'../game-assets'),'index.html'),'utf8');
 assert(html.includes('id="btnParty"'));assert(html.includes('id="coopManage"'));
 const rejoinMigration=require('fs').readFileSync(path.join(__dirname,'../supabase/migrations/202610180003_drifter_guest_rejoin.sql'),'utf8');
 assert(rejoinMigration.includes('rejoin_token_hash=md5(v_token)'));assert(rejoinMigration.includes('rejoin_token_hash is null and nickname=v_name'));
 const hostSeedMigration=require('fs').readFileSync(path.join(__dirname,'../supabase/migrations/202610180004_host_world_seed.sql'),'utf8');
 assert(hostSeedMigration.includes('p_world_seed bigint'));assert(hostSeedMigration.includes('coalesce(p_world_seed'));
 console.log('PASS co-op create/join/leave, same-browser rejoin, lost-anonymous-session and legacy slot recovery, checkpoint transfer, host-close fallback, stale-room recovery, invites, keyboard isolation and failed-operation recovery');
})().catch(error=>{console.error(error);process.exitCode=1});
