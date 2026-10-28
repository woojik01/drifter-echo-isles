import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {before,after,test} from 'node:test';
import {createRequire} from 'node:module';
const {Client}=createRequire(import.meta.url)('../../game-assets/colyseus-sdk.js');
import {fullGame} from './helpers/full-game.mjs';
import {enemiesForChunk,nodesForChunk} from '../dist/world.js';
let child,endpoint,output='';const games=[],rooms=[];
class ObservedClient extends Client{async reconnect(token){const room=await super.reconnect(token);room.onMessage('*',()=>{});rooms.push(room);return room;}async consumeSeatReservation(r){const room=await super.consumeSeatReservation(r);room.onMessage('*',()=>{});rooms.push(room);return room;}}
async function until(check,message,ms=8000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await delay(25)}throw Error(message+'\n'+output.slice(-1500))}
before(async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));endpoint=`http://127.0.0.1:${port}`;child=spawn(process.execPath,['dist/index.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),DRIFTER_ALLOWED_ORIGINS:'*'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);await until(async()=>{try{return(await fetch(endpoint+'/health')).ok}catch{return false}},'Server did not start',15000)});
after(async()=>{for(const game of games)await game.dispose();for(const room of rooms){room.reconnection.enabled=false;try{room.connection.close(4000)}catch{}}child?.kill()});
async function game(name,position){const g=await fullGame({Client:ObservedClient,endpoint,name});games.push(g);if(position)g.evaluate(`freshStart();seed=1234567;chunks.clear();islandCache.clear();player.x=${position.x};player.y=${position.y};viewChunks();saveGame();`);return g;}
async function create(name,position){const g=await game(name,position);assert.equal(await g.api.create(),true,g.element('coopStatusText').textContent);const r=rooms.at(-1);if(!position)assert.equal(await g.api.start(),true,g.element('coopStatusText').textContent);await until(()=>r.state?.players?.get(r.sessionId)?.ready,'Host scene not ready');return{g,r,code:r.state.roomCode};}
async function join(code,name){const g=await game(name);assert.equal(await g.api.join(code),true,g.element('coopStatusText').textContent);const r=rooms.at(-1);await until(()=>r.state?.players?.get(r.sessionId)?.ready,'Guest scene not ready');return{g,r};}
const counts=g=>JSON.parse(g.evaluate('JSON.stringify({gear:groundEquip.map(g=>g.mpId).filter(Boolean).sort(),resources:groundRes.map(g=>g.mpId).filter(Boolean).sort(),monsters:[...chunks.values()].flatMap(c=>c.enemies).map(e=>e.originId).sort()})'));
test('four shipped clients: reliable drop bursts, single pickup, PvP, shared nodes, and late join',async()=>{
 const {g:host,r,code}=await create('Host',{x:440,y:192});const peers=[host];for(const n of ['A','B'])peers.push((await join(code,n)).g);
 await until(()=>peers.every(g=>g.evaluate('DrifterMultiplayer.remotePlayers().length')===2),'Remote membership mismatch');
 // All ten valid equipment bases survive a burst, including the previously rejected cloak/amulet/helmet/gloves.
 host.evaluate(`for(let i=0;i<36;i++)addGroundEquip({eq:{base:BASE_KEYS[i%10],opts:[],h1:10+i,h2:20+i,id:90000+i,tier:0,power:1,source:'craft'},x:player.x+70,y:player.y,ttl:null,uid:++uid,spawnT:gameT});`);
 await until(()=>r.state.loot.size>=36,'A burst dropped items at the server');const ids=[...r.state.loot.keys()].filter(id=>id.startsWith('drop:'));
 assert.equal(ids.length,36);await until(()=>peers.every(g=>counts(g).gear.filter(id=>ids.includes(id)).length===36),'Burst membership differs between real game clients');
 // Revisit an unchanged shared item after the client evicts it outside its view.
 const previousX=host.evaluate('player.x');host.evaluate('player.x-=5000');r.onStateChange.invoke(r.state);assert.equal(counts(host).gear.filter(id=>ids.includes(id)).length,0);host.evaluate(`player.x=${previousX}`);r.onStateChange.invoke(r.state);assert.equal(counts(host).gear.filter(id=>ids.includes(id)).length,36,'View re-entry did not restore unchanged items');
 const fourth=await join(code,'Late');peers.push(fourth.g);await until(()=>counts(fourth.g).gear.filter(id=>ids.includes(id)).length===36,'Late join lost shared loot');
 // Reposition one item within pickup range and make two clients race the exact same item.
 const id=ids[0];const original=JSON.parse(r.state.loot.get(id).data);r.send('loot:batch',{items:[{...original,x:440,y:192}]});await until(()=>Math.abs(r.state.loot.get(id)?.x-440)<1,'Drop reposition failed');
 let wins=0;r.onMessage('loot:claimed',d=>{if(d.id===id)wins++});r.send('loot:claim',{id});rooms.find(x=>x!==r&&x.state.roomCode===code).send('loot:claim',{id});await until(()=>!r.state.loot.has(id),'Pickup did not remove item');await delay(200);assert.equal(wins,1);
 r.send('loot:batch',{items:[{...original,x:440,y:192}]});await delay(150);assert.equal(r.state.loot.has(id),false,'A consumed item resurrected after replay');
 await until(()=>peers.every(g=>!counts(g).gear.includes(id)),'Consumed item remained on one screen');
 // Server calculates damage from equipment; snapshots and forged damage cannot overwrite HP.
 await delay(2100);const target=rooms.find(x=>x!==r&&x.state.roomCode===code),hp=target.state.players.get(target.sessionId).hp,damage=host.evaluate('stats.atk');
 r.send('player:attack',{target:target.sessionId,damage:9999});await until(()=>target.state.players.get(target.sessionId).hp<hp,'PvP damage missing');assert.equal(target.state.players.get(target.sessionId).hp,hp-damage);
 target.send('player:snapshot',{x:target.state.players.get(target.sessionId).x,y:target.state.players.get(target.sessionId).y,hp:999,maxHp:999,moving:false});await delay(150);assert.equal(target.state.players.get(target.sessionId).hp,hp-damage,'Client snapshot overwrote server health');
 // Resource destruction and all resulting loot are server actions; no actor-side drop generation.
 await delay(450);r.send('world:node-hit',{id:'0,0:8001',kind:'tree',damage:999});await until(()=>r.state.nodes.get('0,0:8001')?.hp===Math.max(0,4-damage),'First authoritative node hit wrong');await delay(450);r.send('world:node-hit',{id:'0,0:8001',kind:'tree'});await until(()=>r.state.nodes.get('0,0:8001')?.dead,'Node did not break');
 await until(()=>peers.every(g=>g.evaluate("getChunk(0,0).nodes.find(n=>n.idx===8001).dead")),'Node deletion differs across clients');
 assert.equal([...r.state.loot.keys()].filter(id=>id==='node:0,0:8001:res').length,1);
 // A shared resource stack awards its entire amount once through the actual client callback path.
 host.evaluate("const item=groundRes.find(g=>g.mpId==='node:0,0:8001:res');if(item)DrifterMultiplayer.claimLoot(item,()=>{})");
 await until(()=>!r.state.loot.has('node:0,0:8001:res'),'Resource stack not claimed');
 for(const g of peers)g.evaluate("chunks.delete('0,0');getChunk(0,0)");assert.ok(peers.every(g=>g.evaluate("getChunk(0,0).nodes.find(n=>n.idx===8001).dead")),'Chunk regeneration resurrected a broken node');
});
test('server monster AI, ownership-free attacks, deletion, and chunk reload use one canonical entity set',async()=>{
 let spawn;for(let y=-2;y<=2&&!spawn;y++)for(let x=-2;x<=2&&!spawn;x++)spawn=enemiesForChunk(x,y,1234567).find(e=>e.kind==='slime');assert.ok(spawn);
 const {g:host,r,code}=await create('Monster host',{x:spawn.x+20,y:spawn.y});const {g:guest}=await join(code,'Monster guest');
 await until(()=>r.state.entities.has(spawn.id),'Server did not spawn the deterministic monster');await until(()=>counts(host).monsters.includes(spawn.id)&&counts(guest).monsters.includes(spawn.id),'Monster not present on both screens');
 const x=r.state.entities.get(spawn.id).x;await delay(500);assert.notEqual(r.state.entities.get(spawn.id).x,x,'Server AI did not move without client simulation');
 const live=r.state.entities.get(spawn.id),liveX=Math.floor(live.x/512),liveY=Math.floor(live.y/512);for(const g of [host,guest])g.evaluate(`chunks.delete('${liveX},${liveY}');getChunk(${liveX},${liveY})`);await until(()=>counts(host).monsters.includes(spawn.id)&&counts(guest).monsters.includes(spawn.id),'Chunk reload detached a living monster');
 assert.equal(host.evaluate('DrifterMultiplayer.shouldSimulateEnemy({})'),false);assert.equal(guest.evaluate('DrifterMultiplayer.shouldSimulateEnemy({})'),false);
 // A legacy client cannot inject a phantom or overwrite canonical entity health/location.
 r.send('world:enemy-snapshot',{entities:[{id:'fake:monster',kind:'slime',x:spawn.x,y:spawn.y,hp:500,maxHp:500}]});await delay(150);assert.equal(r.state.entities.has('fake:monster'),false);
 for(let i=0;i<4&&r.state.entities.has(spawn.id);i++){r.send('world:enemy-hit',{id:spawn.id,kind:'slime',damage:999});await delay(460)}
 await until(()=>!r.state.entities.has(spawn.id),'Dead monster was retained');await until(()=>!counts(host).monsters.includes(spawn.id)&&!counts(guest).monsters.includes(spawn.id),'Dead monster remained on one client');
 const [cx,cy]=spawn.id.split(':')[0].split(',');for(const g of [host,guest])g.evaluate(`chunks.delete('${cx},${cy}');getChunk(${cx},${cy})`);
 await delay(250);assert.ok(!counts(host).monsters.includes(spawn.id)&&!counts(guest).monsters.includes(spawn.id),'Locally regenerated dead monster');
});
test('cave entities/drop sets, shared island puzzles/garden and atomic camp chest stay synchronized',async()=>{
 let cave;for(let y=-3;y<=3&&!cave;y++)for(let x=-3;x<=3&&!cave;x++)cave=nodesForChunk(x,y,1234567).find(n=>n.kind==='cave');assert.ok(cave);
 const {g:host,r,code}=await create('Cave host',{x:cave.x+24,y:cave.y});const {g:guest}=await join(code,'Cave guest');
 r.send('world:interact',{id:cave.id,kind:'cave'});await until(()=>r.state.nodes.get(cave.id)?.looted,'Cave did not open');
 await until(()=>[...r.state.entities.keys()].filter(id=>id.startsWith(cave.id+':bat:')).length>=3,'Cave bats missing');
 const bats=[...r.state.entities.keys()].filter(id=>id.startsWith(cave.id+':bat:'));await until(()=>bats.every(id=>counts(host).monsters.includes(id)&&counts(guest).monsters.includes(id)),'Cave entity presence differs');
 assert.equal([...r.state.loot.keys()].filter(id=>id.startsWith(`cave:${cave.id}:`)).length,3,'Cave drop burst incomplete');
 await delay(300);r.send('world:interact',{id:cave.id,kind:'cave'});await delay(200);assert.equal([...r.state.entities.keys()].filter(id=>id.startsWith(cave.id+':bat:')).length,bats.length,'Cave interaction replay duplicated bats');
 const nodes=nodesForChunk(2,0,1234567).concat(nodesForChunk(2,1,1234567));const rune=nodes.find(n=>n.island?.id==='isle:first'&&n.rune===2),altar=nodes.find(n=>n.island?.id==='isle:first'&&n.rune===-1);assert.ok(rune&&altar);
 const owner=await game('Island host',{x:rune.x,y:rune.y});owner.evaluate("exp.runes['isle:first']=[0,1];saveGame()");assert.equal(await owner.api.create(),true,owner.element('coopStatusText').textContent);const ir=rooms.at(-1);await until(()=>ir.state?.players?.get(ir.sessionId)?.ready,'Island host not ready');const visitor=await join(ir.state.roomCode,'Island guest');
 ir.send('world:interact',{id:rune.id,kind:'ruin'});await until(()=>JSON.parse(ir.state.progress).runes['isle:first'].length===3,'Rune not synchronized');await delay(270);ir.send('world:interact',{id:altar.id,kind:'ruin'});await until(()=>JSON.parse(ir.state.progress).claimed.includes('isle:first'),'Altar not awakened');
 await until(()=>[owner,visitor.g].every(g=>g.evaluate("exp.claimed.includes('isle:first')&&exp.seeds.includes(0)")),'Shared island state differs');
 for(const g of [owner,visitor.g])g.evaluate('warpTo(camp)');await until(()=>[...ir.state.players.values()].every(p=>Math.hypot(p.x-256,p.y-256)<120),'Camp warp did not reach the server');
 owner.evaluate('plantSeed(0)');await until(()=>[owner,visitor.g].every(g=>g.evaluate('exp.planted.includes(0)')),'Camp garden did not synchronize');
 owner.evaluate("DrifterMultiplayer.sharedAction('store',{dataset:{i:'0'}})");await until(()=>owner.evaluate('player.equip[0]===null')&&visitor.g.evaluate('exp.stash.length===1'),'Shared chest store mismatch');
 for(const g of [owner,visitor.g])g.evaluate("DrifterMultiplayer.sharedAction('withdraw',{dataset:{i:'0'}})");await until(()=>[owner,visitor.g].every(g=>g.evaluate('exp.stash.length===0')),'Chest withdrawal did not finish');await delay(200);
 assert.equal(owner.evaluate('player.equip.filter(Boolean).length')+visitor.g.evaluate('player.equip.filter(Boolean).length'),2,'Concurrent chest withdrawal duplicated or lost equipment');
});
test('refresh reconnect restores the same host, personal progress and the authoritative room world',async()=>{
 const {g:host,r,code}=await create('Refresh host',{x:440,y:192});await join(code,'Refresh guest');
 host.evaluate('player.res.wood=17;saveGame()');const saved=new Map(host.storage),session=r.sessionId;
 r.reconnection.enabled=false;r.connection.close(4001);await until(()=>r.connection.isOpen===false,'Old socket did not close');
 const refreshed=await fullGame({Client:ObservedClient,endpoint,name:'Refresh host',initialStorage:saved});games.push(refreshed);await refreshed.api.open();
 await until(()=>refreshed.evaluate("state==='play'&&DrifterMultiplayer.isActive()"),'Refreshed host did not enter the running party');
 const rr=rooms.at(-1);assert.equal(rr.sessionId,session);assert.equal(refreshed.evaluate('player.res.wood'),17);assert.equal(refreshed.evaluate('DrifterMultiplayer.currentRoom().room_code'),code);
 await until(()=>refreshed.evaluate('DrifterMultiplayer.remotePlayers().length')===1,'Remote player missing after refresh');
});
test('solo survival spawns darkness at night and burns it away at dawn',async()=>{
 const g=await game('Solo survival');
 g.evaluate('freshStart();player.x=268;player.y=268;gameT=610;updateEnemies(0);gameT=620;updateEnemies(0)');
 assert.ok(g.evaluate('[...chunks.values()].flatMap(c=>c.enemies).some(e=>e.darkspawn)'),'Solo night did not spawn a dark creature');
 g.evaluate('gameT=900;updateEnemies(0)');
 assert.equal(g.evaluate('[...chunks.values()].flatMap(c=>c.enemies).some(e=>e.darkspawn)'),false,'Solo darkspawn survived dawn');
 assert.equal(g.evaluate('DrifterSurvival.phase(600).night'),true);assert.equal(g.evaluate('DrifterSurvival.phase(900).night'),false);
});
test('shared survival: firewood stoking, darkspawn limits, and shadow crafting',async()=>{
 const host=await game('Survival host',{x:268,y:268});
 host.evaluate('gameT=850;exp.fireRadius=220;exp.fireUpdatedAt=850;player.res.wood=8;player.res.gloom=5;player.res.nightFang=2;player.res.nightCore=1;saveGame()');
 assert.equal(await host.api.create(),true,host.element('coopStatusText').textContent);const room=rooms.at(-1);
 await until(()=>room.state?.players?.get(room.sessionId)?.ready,'Survival host did not start');
 assert.equal(host.evaluate('DrifterMultiplayer.isInPartyWorld()'),true);
 assert.equal(host.evaluate("DrifterMultiplayer.sharedAction('stokeFire',null)"),true);
 await until(()=>{const p=JSON.parse(room.state.progress);return p.fireRadius>220&&host.evaluate('player.res.wood')===4},'Shared firewood was not applied',5000);
 assert.equal(host.evaluate("DrifterMultiplayer.sharedAction('craftDuskward',null)"),true);
 await until(()=>host.evaluate("player.equip.some(eq=>eq?.effect==='duskward')"),'Duskward recipe did not craft',5000);
 assert.equal(host.evaluate("DrifterMultiplayer.sharedAction('craftNightstep',null)"),true);
 await until(()=>host.evaluate("player.equip.some(eq=>eq?.effect==='nightstep')"),'Nightstep recipe did not craft',5000);
 await until(()=>[...room.state.entities.keys()].some(id=>id.startsWith('dark:')),'Night did not spawn a dark creature',15000);
 await delay(450);const fire=JSON.parse(room.state.progress),radius=Math.max(112,fire.fireRadius-(room.state.worldTime-fire.fireUpdatedAt)*.22);
 for(const [id,e]of room.state.entities)if(id.startsWith('dark:'))assert.ok(Math.hypot(e.x-256,e.y-256)>=radius+8,'A darkspawn crossed into firelight');
 const darkSync=()=>host.evaluate("[...chunks.values()].some(c=>c.enemies.some(e=>String(e.originId).startsWith('dark:')))" );
 try{await until(darkSync,'Darkspawn was not synchronized to the game client',15000)}catch(error){throw Error(`${error.message}\nserver: ${[...room.state.entities.keys()].filter(id=>id.startsWith('dark:')).join(',')}, client: ${host.evaluate("JSON.stringify({party:DrifterMultiplayer.isInPartyWorld(),time:gameT,tracked:[...chunks.values()].flatMap(c=>c.enemies).map(e=>e.originId).filter(id=>String(id).startsWith('dark:'))})")}`)}
 await until(()=>Number(room.state.worldTime)>=900,'The night cycle did not reach dawn',45000);
 await until(()=>![...room.state.entities.keys()].some(id=>id.startsWith('dark:')),'Darkspawn survived daylight',3000);
 await until(()=>!host.evaluate("[...chunks.values()].some(c=>c.enemies.some(e=>String(e.originId).startsWith('dark:')))"),'Burned darkspawn remained on the game client',3000);
});
