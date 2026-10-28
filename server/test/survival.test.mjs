import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ENEMIES} from '../dist/world.js';
import {DAY_SECONDS,NIGHT_SECONDS,CYCLE_SECONDS,FIRE_START_RADIUS,FIRE_MIN_RADIUS,FIRE_MAX_RADIUS,FIRE_DECAY_PER_SECOND,FIRE_STOKE_COST,FIRE_STOKE_GROWTH,dayNightAt,fireRadiusAt,insideFirelight,nightBuffed,constrainDarkspawn} from '../dist/survival.js';

test('day and night follow the shared ten minute / five minute clock',()=>{
 assert.equal(DAY_SECONDS,600);assert.equal(NIGHT_SECONDS,300);assert.equal(CYCLE_SECONDS,900);
 assert.equal(dayNightAt(0).night,false);assert.equal(dayNightAt(599.01).secondsLeft,1);
 assert.deepEqual(dayNightAt(600),{night:true,phase:600,secondsLeft:300,nightIndex:0});
 assert.equal(dayNightAt(899).secondsLeft,1);assert.equal(dayNightAt(900).night,false);assert.equal(dayNightAt(900).nightIndex,1);
});

test('firelight shrinks to a floor, feeding it enlarges it, and night buffs stop inside it',()=>{
 assert.equal(fireRadiusAt(FIRE_START_RADIUS,0,0),FIRE_START_RADIUS);
 assert.equal(fireRadiusAt(200,100,200),200-FIRE_DECAY_PER_SECOND*100);
 assert.equal(fireRadiusAt(120,0,10000),FIRE_MIN_RADIUS);
 const before=fireRadiusAt(220,100,300),after=Math.min(FIRE_MAX_RADIUS,before+FIRE_STOKE_GROWTH);
 assert.equal(after-before,FIRE_STOKE_GROWTH);assert.equal(FIRE_STOKE_COST,4);assert.equal(FIRE_MAX_RADIUS,560);
 assert.equal(insideFirelight(256,256,FIRE_START_RADIUS),true);
 assert.equal(nightBuffed(600,256,650,200),true);
 assert.equal(nightBuffed(350,256,650,200),false);
 assert.equal(nightBuffed(600,256,599,200),false);
});

test('darkspawn have strong distinct profiles and cannot enter an expanded campfire',()=>{
 assert.ok(ENEMIES.darkling.hp/ENEMIES.slime.hp>=2);
 assert.ok(ENEMIES.gloomfang.hp/ENEMIES.wolf.hp>=3);
 assert.ok(ENEMIES.ashbrute.hp/ENEMIES.golem.hp>=5);
 const safe=constrainDarkspawn(270,270,400,16);
 assert.equal(safe.moved,true);assert.ok(Math.hypot(safe.x-256,safe.y-256)>=420-1e-8);
 const outside=constrainDarkspawn(700,256,400,12);
 assert.deepEqual(outside,{x:700,y:256,moved:false});
});
