const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
(async()=>{
 const source=fs.readFileSync('worker/index.js','utf8').replace('export default','globalThis.worker =');
 const ctx={Response,URL,Uint8Array,atob};vm.createContext(ctx);vm.runInContext(source,ctx);
 const handler=ctx.worker;
 let res=await handler.fetch(new Request('https://drifter.test/api/coop-config'),{});assert.equal(res.status,503);
 res=await handler.fetch(new Request('https://drifter.test/api/coop-config'),{DRIFTER_COOP_SERVER_URL:'https://drifter-colyseus.onrender.com'});assert.equal(res.status,200);assert.deepEqual(await res.json(),{serverUrl:'https://drifter-colyseus.onrender.com'});
 for(const value of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?q=1']){
  res=await handler.fetch(new Request('https://drifter.test/api/coop-config'),{DRIFTER_COOP_SERVER_URL:value});assert.equal(res.status,503,`Rejected unsafe/noncanonical endpoint: ${value}`)
 }
 res=await handler.fetch(new Request('https://drifter.test/api/coop-config',{method:'POST'}),{DRIFTER_COOP_SERVER_URL:'https://drifter-colyseus.onrender.com'});assert.equal(res.status,405);
 res=await handler.fetch(new Request('https://drifter.test/'),{});assert.equal(res.status,200);const html=await res.text();assert.match(html,/id="btnParty"/);assert.match(html,/colyseus-sdk\.js/);
 console.log('PASS Worker static assets and validated Colyseus runtime configuration');
})().catch(e=>{console.error(e);process.exitCode=1});
