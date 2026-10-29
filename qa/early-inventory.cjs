const assert=require('node:assert/strict');
const makeGame=require('./harness.cjs');
(async()=>{
 for(const lang of ['ko','en']){
  const g=await makeGame();const {run,elements}=g;
  run(`LANG='${lang}';freshStart();state='play';player.x=camp.x;player.y=camp.y;openInv('bag')`);
  let h=run('bagHTML()');
  assert(h.indexOf('camp-project-card')<h.indexOf('data-bag-fold="garden"'));
  assert.match(h,/data-bag-fold="garden"\s*>/);
  assert.match(h,/data-bag-fold="survival"\s*>/);
  assert.match(h,/data-bag-fold="chest"\s*>/);
  assert.match(h,/0 \/ 4/);assert.match(h,/0 \/ 2/);
  assert.match(run('craftHTML()'),/id="earlyCraftRecipes"\s*>/);
  assert.match(run('craftHTML()'),/data-act="craftGear"/);
  const toggles=elements.get('panelBody').listeners.toggle;
  for(const f of toggles)f({target:{dataset:{bagFold:'garden'},open:true}});
  run('closeInv();openInv("bag")');assert.match(run('bagHTML()'),/data-bag-fold="garden" open/);
  run('player.res.wood=4;player.res.stone=2;renderRes()');
  h=run('bagHTML()');assert.match(h,/4 \/ 4/);assert.match(h,/2 \/ 2/);assert.match(h,/data-camp="lamp" >/);
  assert.equal(run('buildCampLantern()'),true);
  h=run('craftHTML()');assert.match(h,/id="earlyCraftRecipes" open/);assert.match(h,/data-recipe="ore"/);
  for(const f of toggles)f({target:{id:'earlyCraftRecipes',dataset:{},open:false}});
  assert.match(run('craftHTML()'),/id="earlyCraftRecipes"\s*>/);
  run('freshStart();state="play";exp.seeds=[0];openInv("bag")');h=run('bagHTML()');assert.match(h,/data-bag-fold="garden" open/);
  for(const f of toggles)f({target:{dataset:{bagFold:'garden'},open:false}});
  assert.match(run('bagHTML()'),/data-bag-fold="garden"\s*>/);
 }
 console.log('PASS early inventory, resource updates, recipe visibility, disclosure state, progression and languages');
})().catch(e=>{console.error(e);process.exit(1)});
