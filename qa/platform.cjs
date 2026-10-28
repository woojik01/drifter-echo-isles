const assert=require('assert'),makeGame=require('./harness.cjs');
function fakeSDK({locale='fr-FR',muted=false,disabledData=false,failInit=false}={}){
 const data=new Map(),events=[];let initialised=false,settingsListener;
 return{data,events,sdk:{environment:'crazygames',init:async()=>{if(failInit)throw Error('offline');initialised=true;},user:{systemInfo:{locale}},game:{settings:{muteAudio:muted},addSettingsChangeListener:f=>settingsListener=f,gameplayStart:()=>{assert(initialised);events.push('start');},gameplayStop:()=>events.push('stop'),happytime:()=>events.push('happy')},data:{getItem:k=>{assert(initialised);if(disabledData)throw Error('dataModuleDisabled');return data.get(k)??null;},setItem:(k,v)=>{assert(initialised);data.set(k,v);},removeItem:k=>data.delete(k)}},setMuted:v=>settingsListener({muteAudio:v})};
}
(async()=>{
 const mock=fakeSDK(),g=await makeGame({sdk:mock.sdk}),run=g.run;
 assert.equal(run('LANG'),'en');assert.deepEqual(mock.events,[]);
 run('freshStart();frame(1000);frame(1016)');assert.deepEqual(mock.events,['start']);
 for(const [open,close]of[["openInv('bag')",'closeInv()'],['openMap()','closeMap()'],['toggleModal(true)','toggleModal(false)'],['togglePause(true)','togglePause(false)'],['showActionMenu()','closeActionMenu()'],['DrifterMultiplayer.open()','DrifterMultiplayer.close()']]){
  mock.events.length=0;run(open+';frame(1100);frame(1116);'+close+';frame(1132)');assert.deepEqual(mock.events,['stop','start']);
 }
 mock.events.length=0;run('stopForBackground();frame(1200);resumeFromBackground();frame(1216)');assert.deepEqual(mock.events,[]);
 run('saveGame()');assert(mock.data.has('drifter_save_v1'));assert.equal(JSON.parse(mock.data.get('drifter_save_v1')).v,4);
 mock.setMuted(true);assert(run('DrifterPlatform.muted'));run("$('btnMute').onclick()");assert(run('DrifterPlatform.muted'));mock.setMuted(false);assert(!run('DrifterPlatform.muted'));
 console.log('PASS SDK init, gameplay lifecycle, focus exclusion, Data writes, platform mute');
 mock.events.length=0;
 run(`startDialog({id:'sdk-dialogue',persona:'wanderer',x:player.x,y:player.y});globalThis.beforeDialogueTime=gameT;frame(1300);frame(1316)`);
 assert(run('!paused&&gameT>beforeDialogueTime'));
 assert.deepEqual(mock.events,['stop']);
 run('endDialog();frame(1332)');assert.deepEqual(mock.events,['stop','start']);
 console.log('PASS dialogue keeps ambient simulation live but stops SDK gameplay until it closes');
 const restore=await makeGame({sdk:mock.sdk});assert(restore.run('loadSave()'));assert.equal(restore.run('player.lvl'),run('player.lvl'));
 console.log('PASS cloud progress restores in an independent game instance');
 const ko=await makeGame({sdk:fakeSDK({locale:'ko-KR'}).sdk});assert.equal(ko.run('LANG'),'ko');
 const explicit=fakeSDK({locale:'en-US'});explicit.data.set('drifter_prefs_v1',JSON.stringify({lang:'ko',muted:true}));const custom=await makeGame({sdk:explicit.sdk});assert.equal(custom.run('LANG'),'ko');
 console.log('PASS SDK locale, English fallback, explicit language preference');
 const fail=await makeGame({sdk:fakeSDK({failInit:true}).sdk});fail.run('freshStart();frame(1000);saveGame()');assert.equal(fail.run('state'),'play');assert(fail.storage.has('drifter_save_v1'));
 const disabled=await makeGame({sdk:fakeSDK({disabledData:true}).sdk});disabled.run('freshStart();saveGame()');assert(disabled.storage.has('drifter_save_v1'));assert.equal(disabled.run('DrifterPlatform.storageIssue'),'cloud');
 console.log('PASS SDK unavailable and disabled Data fall back to playable local saves');
 const freshAccount=await makeGame({sdk:fakeSDK().sdk,storage:[['drifter_save_v1',mock.data.get('drifter_save_v1')]]});assert.equal(freshAccount.run('hasSave()'),false);
 console.log('PASS a new cloud account never inherits a previous local account save');
 const overflow=fakeSDK();const limited=await makeGame({sdk:overflow.sdk});limited.run('freshStart()');overflow.sdk.data.setItem=()=>{throw Error('dataLimitExceeded');};limited.run('player.res.wood=37;saveGame()');assert.equal(limited.run('DrifterPlatform.storageIssue'),'cloud');assert.equal(JSON.parse(limited.storage.get('drifter_save_v1')).res.wood,37);assert.equal(limited.run("$('saveWarning').style.display"),'block');
 console.log('PASS cloud failure keeps a local backup and shows a save warning');
})().catch(e=>{console.error(e);process.exitCode=1;});
