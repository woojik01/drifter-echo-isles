const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),makeGame=require('./harness.cjs');
(async()=>{
 const dir=path.resolve('../tmp/v154-party-start');fs.mkdirSync(dir,{recursive:true});
 for(const file of ['platform.js','game.js','expedition.js','multiplayer.js'])fs.copyFileSync(path.join('game-assets',file),path.join(dir,file));
 const file=path.join(dir,'multiplayer.js');let source=fs.readFileSync(file,'utf8');const end=source.lastIndexOf('})();');source=source.slice(0,end)+`window.__partyStartQA=async raw=>{soloSnapshot=raw;inPartyWorld=true;sessionId='qa-self';let sent;room={state:{hostSessionId:sessionId,started:false},send(type,payload){if(type==='room:start'){sent=payload;room.state.started=true}}};await hostStart();return sent;};\n`+source.slice(end);fs.writeFileSync(file,source);
 const g=await makeGame({assetsDir:dir});g.run('freshStart();gameT=720;exp.fireRadius=455;exp.fireUpdatedAt=710;saveGame()');
 const start=await g.env.__partyStartQA(g.storage.get('drifter_save_v1'));
 assert.equal(start.world.gameT,720);assert.equal(start.world.exp.fireRadius,455);assert.equal(start.world.exp.fireUpdatedAt,710);
 console.log('PASS solo-to-party start preserves world time, current firelight radius and last refueling time');
})().catch(e=>{console.error(e);process.exitCode=1});
