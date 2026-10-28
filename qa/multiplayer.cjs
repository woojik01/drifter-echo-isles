const assert=require('assert');
const makeGame=require('./harness.cjs');

function makeHub(){
 const rooms=new Map(),members=new Map(),checkpoints=new Map(),channels=new Set();let nextUser=1;
 const users=[];
 const key=(room,user)=>`${room}:${user}`;
 function fail(message){return{data:null,error:new Error(message)}}
 function hubForRoom(roomId){return[...channels].filter(ch=>ch.topic===`drifter:${roomId}`&&!ch.removed)}
 function presenceSync(roomId){for(const ch of hubForRoom(roomId))for(const h of ch.handlers)if(h.type==='presence'&&h.filter.event==='sync')h.callback()}
 function stateFor(roomId){
  const out={};for(const ch of hubForRoom(roomId))if(ch.presence)out[ch.uid]=[ch.presence];return out;
 }
 function sdkFor(label){
  const uid=`user-${label}-${nextUser++}`;let session=null;
  return{createClient(){
   return{
    auth:{
     getSession:async()=>({data:{session},error:null}),
     signInAnonymously:async()=>{session={user:{id:uid}};return{data:{user:session.user,session},error:null}}
    },
    channel(topic,options){
     const ch={topic,options,uid,handlers:[],presence:null,subscribed:false,removed:false,
      on(type,filter,callback){this.handlers.push({type,filter,callback});return this},
      subscribe(callback){this.subscribed=true;channels.add(this);queueMicrotask(()=>{callback('SUBSCRIBED');const roomId=this.topic.slice('drifter:'.length);presenceSync(roomId)});return this},
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
     const roomId=args?.p_room_id,joined=roomId&&members.get(roomId)?.has(uid);
     if(name==='drifter_create_room'){
      const id=`room-${rooms.size+1}`,r={room_id:id,room_code:`4F7B${rooms.size}A91CD`,room_status:'waiting',world_seed:500+rooms.size,is_host:true};
      rooms.set(id,{...r,host:uid});members.set(id,new Set([uid]));return{data:r,error:null};
     }
     if(name==='drifter_join_room'){
      const r=[...rooms.values()].find(v=>v.room_code===args.p_code);
      if(!r||r.room_status==='closed')return fail('Room code not found or expired.');
      const m=members.get(r.room_id);if(!m.has(uid)&&m.size>=2)return fail('This room already has two players.');m.add(uid);
      return{data:{room_id:r.room_id,room_code:r.room_code,room_status:r.room_status,world_seed:r.world_seed,is_host:r.host===uid},error:null};
     }
     if(name==='drifter_start_room'){
      const r=rooms.get(roomId);if(!joined||r?.host!==uid)return fail('Only the room host can start it.');r.room_status='playing';return{data:true,error:null};
     }
     if(name==='drifter_save_checkpoint'){
      if(!joined||rooms.get(roomId)?.room_status!=='playing')return fail('Active room membership required.');
      checkpoints.set(key(roomId,uid),args.p_payload);return{data:true,error:null};
     }
     if(name==='drifter_load_checkpoint')return{data:checkpoints.get(key(roomId,uid))||null,error:null};
     if(name==='drifter_leave_room'){
      if(!joined)return{data:false,error:null};const r=rooms.get(roomId);members.get(roomId).delete(uid);if(r?.host===uid)r.room_status='closed';return{data:true,error:null};
     }
     return fail(`Unexpected RPC ${name}`);
    }
   };
  }};
 }
 return{sdkFor,rooms,members,checkpoints,channels};
}

(async()=>{
 const configless=await makeGame();
 assert.equal(configless.elements.has('coopUrl'),false);assert.equal(configless.elements.has('coopKey'),false);
 await configless.run('DrifterMultiplayer.create()');
 assert.match(configless.elements.get('coopStatusText').textContent,/설정되지 않았습니다|not configured/i);
 const hub=makeHub();
 const soloSave='single-player-save';
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
 a.run('player.x=650;player.y=390;update(.2)');
 assert.equal(b.run('DrifterMultiplayer.remotePlayers()[0].targetX'),650);
 assert.equal(b.run('DrifterMultiplayer.remotePlayers()[0].targetY'),390);
 a.run(`globalThis.coopNode=getChunk(0,0).nodes.find(n=>n.isNode&&n.type!=='ruin');coopNode.hp=0;coopNode.dead=true;`);
 await a.run('DrifterMultiplayer.publishWorldState(coopNode)');
 // Check the exact affected node by its stable generated index and coordinates.
 const info=a.run('({idx:coopNode.idx,x:coopNode.x,y:coopNode.y,type:coopNode.type})');
 const synced=b.run(`(()=>{const n=getChunk(Math.floor(${info.x}/CS),Math.floor(${info.y}/CS)).nodes.find(v=>v.idx===${info.idx});return !!n?.dead})()`);
 assert.equal(synced,true);
 a.run('DrifterPlatform.storage.setItem(SAVE_KEY,"coop-save")');
 const ownKey=`drifter_coop_save_v1_${room.room_id}_user-a-1`;
 assert.equal(a.storage.get(ownKey),'coop-save');assert.equal(a.storage.get('drifter_save_v1'),soloSave);
 assert(hub.checkpoints.has(`${room.room_id}:user-a-1`));
 await a.run('DrifterMultiplayer.leave()');
 for(let i=0;i<10&&b.run('DrifterMultiplayer.currentRoom()');i++)await new Promise(r=>setTimeout(r,0));
 assert.equal(a.run('DrifterMultiplayer.currentRoom()'),null);assert.equal(b.run('DrifterMultiplayer.currentRoom()'),null);
 assert.equal(b.storage.get('drifter_save_v1'),soloSave);
 const migration=require('fs').readFileSync(require('path').join(__dirname,'../supabase/migrations/202610180001_drifter_coop.sql'),'utf8');
 assert(migration.includes('for update'));assert(migration.includes('drifter_can_access_topic'));assert(migration.includes("extension in ('broadcast','presence')"));
 console.log('PASS co-op room creation/join, presence, shared seed, remote movement/target state, private-save namespace, checkpoint RPC and host-close cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
