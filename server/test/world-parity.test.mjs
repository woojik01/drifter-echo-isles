import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fullGame} from './helpers/full-game.mjs';
import {biomeAt,nodesForChunk,enemiesForChunk} from '../dist/world.js';
test('server terrain, resource nodes and stable monster IDs match the actual shipped world generator',async()=>{
 const game=await fullGame();try{
  for(const seed of [1,1234567,987654321,4294967295]){
   game.evaluate(`seed=${seed};chunks.clear();islandCache.clear();groundEquip=[];destroyed={};exp=newExpedition();`);
   for(const [cx,cy]of [[0,0],[1,0],[-1,1],[2,0],[2,1],[4,0],[4,1],[4,3],[5,3],[-5,4],[8,-3],[20,16],[70,50]]){
    const actual=JSON.parse(game.evaluate(`JSON.stringify((()=>{const c=getChunk(${cx},${cy});return{nodes:c.nodes.map(n=>({id:c.key+':'+n.idx,kind:n.type,x:n.x,y:n.y,hp:n.maxHp})),enemies:c.enemies.map(e=>({id:e.originId,kind:e.type,x:e.x,y:e.y,hp:e.maxHp,tier:e.tier,elite:e.elite,homeX:e.homeX,homeY:e.homeY}))}})())`));
    const expected=nodesForChunk(cx,cy,seed).map(({id,kind,x,y,hp})=>({id,kind,x,y,hp}));
    assert.deepEqual(actual.nodes,expected,`node parity at ${seed}/${cx},${cy}`);
    assert.deepEqual(actual.enemies,enemiesForChunk(cx,cy,seed),`enemy parity at ${seed}/${cx},${cy}`);
   }
   for(const [tx,ty]of [[16,16],[44,19],[70,10],[82,20],[100,40],[150,26],[160,106],[-80,30],[320,340]])assert.equal(game.evaluate(`biomeAt(${tx},${ty})`),biomeAt(tx,ty,seed));
  }
 }finally{await game.dispose()}
});
