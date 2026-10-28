const ASSETS = __EMBEDDED_ASSETS__;
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function validConfig(env){
 const raw=String(env.DRIFTER_COOP_SERVER_URL||'').trim();
 try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;return {serverUrl:url.origin}}catch{return null}
}
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(u.pathname==='/api/coop-config'){
  if(request.method!=='GET')return json({error:'Method not allowed.'},405);
  const config=validConfig(env);
  if(!config)return json({code:'COOP_NOT_CONFIGURED',error:'협동 서버가 아직 연결되지 않았습니다. / Co-op server is not configured yet.'},503);
  return json(config,200);
 }
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
 let path=decodeURIComponent(u.pathname);if(path==='/'||path==='/index.html')path='/index.html';
 const asset=ASSETS[path];if(!asset)return new Response('Not found',{status:404});
 const ext=path.slice(path.lastIndexOf('.'));
 return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset),c=>c.charCodeAt(0)),{headers:{'content-type':TYPES[ext]||'application/octet-stream','cache-control':path==='/index.html'?'no-cache':'public, max-age=3600','x-content-type-options':'nosniff'}});
}};
