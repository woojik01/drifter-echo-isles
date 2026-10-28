import fs from 'node:fs';
import assert from 'node:assert/strict';
const hasManifest=fs.existsSync('.openai/hosting.json');
assert.equal(fs.existsSync('dist/.openai/hosting.json'),hasManifest);
if(hasManifest){
 const manifest=JSON.parse(fs.readFileSync('dist/.openai/hosting.json','utf8'));
 const sourceManifest=JSON.parse(fs.readFileSync('.openai/hosting.json','utf8'));
 assert.deepEqual(manifest,sourceManifest);
}
assert.ok(fs.existsSync('dist/server/index.js'));
assert.equal(fs.existsSync('dist/index.html'),false);
const code=fs.readFileSync('dist/server/index.js','utf8');
assert.match(code,/\/api\/coop-config/);assert.match(code,/DRIFTER_COOP_SERVER_URL/);
assert.match(code,/gamedistribution\.js/);
assert.doesNotMatch(code,/DRIFTER_SUPABASE_(?:URL|PUBLISHABLE_KEY)/);
console.log('PASS Worker artifact and Colyseus runtime endpoint');
