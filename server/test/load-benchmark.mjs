import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
const {Client}=createRequire(import.meta.url)('../../game-assets/colyseus-sdk.js');
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const endpoint=`http://127.0.0.1:${port}`,rooms=[],hosts=[];let output='',child,interval;
async function wait(check,label,ms=10000){const until=Date.now()+ms;while(Date.now()<until){if(await check())return;await delay(25)}throw Error(label+': '+output.slice(-1000))}
async function post(path,data){const response=await fetch(endpoint+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});assert.ok(response.ok,`HTTP ${response.status}`);return response.json()}
async function consume(data){const room=await new Client(endpoint).consumeSeatReservation(data.reservation);room.onMessage('*',()=>{});rooms.push(room);await wait(()=>room.state?.players?.has(room.sessionId),'Initial state');return room}
function metrics(room){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Metrics timeout '+JSON.stringify({session:room.sessionId,host:room.state.hostSessionId,open:room.connection.isOpen,players:room.state.players.size})+' '+output.slice(-1200))),5000);room.onMessage('world:metrics',data=>{clearTimeout(timer);resolve(data)});room.send('world:metrics',{})})}
try{
 child=spawn(process.execPath,['dist/index.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),DRIFTER_ALLOWED_ORIGINS:'*'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);await wait(async()=>{try{return(await fetch(endpoint+'/health')).ok}catch{return false}},'Start');
 for(let i=0;i<8;i++){const data=await post('/api/rooms',{nickname:'Benchmark host',worldSeed:1234567+i,requestId:crypto.randomUUID()});const host=await consume(data);hosts.push(host);host.send('room:start');await wait(()=>host.state.started,'Room start');for(let j=0;j<3;j++)await consume(await post('/api/rooms/join',{code:data.code,nickname:'Benchmark guest'}));}
 for(const room of rooms)room.send('player:ready',{equipment:[{base:'pickaxe',opts:[]},null,null],level:1,hp:30});await wait(()=>rooms.every(r=>r.state.players.get(r.sessionId)?.ready),'Scene readiness');
 const baseline=await metrics(hosts[0]);let frames=0,inputs=0;const started=performance.now();interval=setInterval(()=>{frames++;for(const room of rooms){const p=room.state.players.get(room.sessionId);room.send('player:snapshot',{x:p.x,y:p.y,face:frames%2?-1:1,moving:false,phase:frames*.15});inputs++}},100);
 await delay(10000);clearInterval(interval);interval=null;const elapsed=performance.now()-started;const all=await Promise.all(hosts.map(metrics));assert.ok(rooms.every(r=>r.state.players.size===4));assert.ok(all.every(m=>m.meanTickMs<20),'Room tick exceeds its work budget');
 const last=all[0],cpuMs=((last.processCpu.user-baseline.processCpu.user)+(last.processCpu.system-baseline.processCpu.system))/1000;
 const result={ok:true,environment:'local process; not a Render capacity guarantee',sdk:'bundled browser SDK',rooms:8,clients:32,durationMs:Math.round(elapsed),inputsSent:inputs,serverInputsAccepted:all.reduce((n,m)=>n+m.inputs,0),activeMonsters:all.reduce((n,m)=>n+m.activeEntities,0),meanRoomTickMs:all.reduce((n,m)=>n+m.meanTickMs,0)/all.length,maxRoomTickMs:Math.max(...all.map(m=>m.maxMs)),processRssMiB:last.processRssBytes===null?null:last.processRssBytes/1024/1024,processPeakRssMiB:last.processPeakRssBytes/1024/1024,processHeapMiB:last.processHeapBytes/1024/1024,processCpuMs:cpuMs,processCpuCorePercent:cpuMs/elapsed*100};
 await writeFile(process.env.DRIFTER_BENCH_REPORT||new URL('../benchmark-result.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.error('BENCHMARK_FAILED',error);process.exitCode=1;}finally{if(interval)clearInterval(interval);for(const room of rooms.reverse()){room.reconnection.enabled=false;try{await Promise.race([room.leave(true),delay(500)])}catch{}try{if(room.connection.isOpen)room.connection.close(4000)}catch{}}child?.kill()}
