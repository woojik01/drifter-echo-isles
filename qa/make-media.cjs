// Submission art is composed from the game's own code-drawn sprites.
// Video frames run the actual simulation/renderer in scripted scenes; no browser capture.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),{once}=require('events');
const makeGame=require('./harness.cjs');
const OUT=process.argv[2];if(!OUT||!path.isAbsolute(OUT))throw Error('Supply an absolute output directory');
fs.mkdirSync(OUT,{recursive:true});
function title(ctx,text,y,size,w){ctx.font=`900 ${size}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=size*.085;ctx.strokeStyle='#142e2c';ctx.strokeText(text,w/2,y);ctx.fillStyle='#f0e2b5';ctx.fillText(text,w/2,y);}
async function cover(w,h,name){
 const game=await makeGame({realCanvas:true,width:w,height:h});
 const {run,canvas}=game;
 run(`freshStart();seed=94162;chunks.clear();terrainLRU.clear();exp.raft=true;exp.sailing=true;player.x=70*TILE;player.y=24*TILE;cam.x=82*TILE;cam.y=20*TILE;journeyTarget=null;gameT=4;render()`);
 const c=canvas.createCanvas(w,h),g=c.getContext('2d');g.imageSmoothingEnabled=false;
 g.fillStyle='#214745';g.fillRect(0,0,w,h);
 // Rescale the same island scene into each format with breathing room for the title.
 const src=game.elements.get('cv');const regionW=Math.min(w,960),regionH=Math.min(h,720);
 const sw=regionW,sh=regionH,sx=(w-sw)/2,sy=(h-sh)/2;
 g.drawImage(src,sx,sy,sw,sh,0,h*.25,w,h*.78);
 const veil=g.createLinearGradient(0,0,0,h*.63);veil.addColorStop(0,'#142e2c');veil.addColorStop(.44,'#142e2cf2');veil.addColorStop(1,'#142e2c00');g.fillStyle=veil;g.fillRect(0,0,w,h*.65);
 const big=w*.118;title(g,'DRIFTER',h*.15,big,w);title(g,'ECHO ISLES',h*.15+big*.77,w*.043,w);
 // Hero and raft at an intentional foreground scale, using original rendering code.
 const sourceCanvas=game.elements.get('cv');
 run(`ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);player.x=0;player.y=0;player.dead=false;exp.sailing=true;attackT=0;player.face=1;ctx.setTransform(5,0,0,5,130,160);drawPlayer();`);
 const heroSize=Math.min(w*.40,h*.40);g.drawImage(sourceCanvas,0,0,280,240,w*.12,h*.64,heroSize,heroSize*.86);
 const buffer=c.toBuffer('image/png');fs.writeFileSync(path.join(OUT,name),buffer);return c;
}
function setupScene(run,scene){
 run(`releaseControls();closeInv();closeActionMenu();seed=94162;chunks.clear();terrainLRU.clear();groundEquip=[];groundRes=[];particles=[];floaters=[];exp=newExpedition();exp.raft=true;player.equip=[{base:'pickaxe',opts:[],h1:1,h2:2,id:100},null,null];recalcStats();player.hp=stats.maxHp;state='play';paused=false;player.dead=false;journeyTarget=null;gameT=2;`);
 if(scene===0)run(`exp.sailing=true;player.x=55*TILE;player.y=20*TILE;player.face=1;cam.x=player.x+56;cam.y=player.y;`);
 if(scene===1)run(`exp.runes['isle:first']=[0,1,2];player.x=83*TILE;player.y=22*TILE;cam.x=82*TILE;cam.y=20*TILE;viewChunks();`);
 if(scene===2)run(`{const i=INTRO_ISLANDS[0];player.x=(i.tx+9)*TILE;player.y=(i.ty-1)*TILE;cam.x=i.tx*TILE;cam.y=i.ty*TILE;exp.runes[i.id]=[0,2];viewChunks();}`);
 if(scene===3)run(`{const i=INTRO_ISLANDS[1];player.x=(i.tx-7)*TILE;player.y=(i.ty-5)*TILE;cam.x=i.tx*TILE;cam.y=i.ty*TILE;exp.runes[i.id]=[1,2];viewChunks();globalThis.clipWisp=activeNodes().find(n=>n.islandId===i.id&&n.rune===0);investigateRuin(clipWisp);}`);
 if(scene===4)run(`exp.seeds=[0,1,2];exp.planted=[0,1];player.x=camp.x+14;player.y=camp.y+14;cam.x=camp.x;cam.y=camp.y;viewChunks();`);
}
async function video(width,height,name,opening){
 const portrait=height>width,game=await makeGame({realCanvas:true,width:portrait?540:960,height:portrait?810:540});const{run,canvas}=game;
 const output=canvas.createCanvas(width,height),ctx=output.getContext('2d');ctx.imageSmoothingEnabled=false;
 const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','30','-i','-','-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',path.join(OUT,name)],{stdio:['pipe','ignore','pipe']});
 let stderr='';ff.stderr.on('data',v=>stderr+=v);
 let prior=-1;
 for(let f=0;f<540;f++){
  const seconds=f/30,scene=Math.min(4,Math.floor(seconds/3.6)),local=seconds-scene*3.6;
  if(scene!==prior){setupScene(run,scene);prior=scene;}
  if(scene===0)run(`keys.KeyD=${local<3};cam.x=player.x+60;cam.y=player.y;`);
  if(scene===1&&f===131)run(`investigateRuin(activeNodes().find(n=>n.islandId==='isle:first'&&n.rune===-1));`);
  if(scene===2&&(f===239||f===270))run(`investigateRuin(activeNodes().find(n=>n.islandId==='isle:prism'&&n.rune===1));`);
  if(scene===3){run(`{const i=INTRO_ISLANDS[1],p=centerOf(i);keys.KeyD=player.x<p.x-3;keys.KeyS=player.y<p.y-3;}`);if(f===410)run(`investigateRuin(activeNodes().find(n=>n.islandId==='isle:wisp'&&n.rune===-1));`);}
  if(scene===4&&f===460)run('plantSeed(2)');
  run(`update(1/30);journeyTarget=null;render();`);
  ctx.drawImage(game.elements.get('cv'),0,0,width,height);
  if(f===0)ctx.drawImage(opening,0,0,width,height);
  if(!ff.stdin.write(output.toBuffer('image/png')))await once(ff.stdin,'drain');
 }
 ff.stdin.end();const [code]=await once(ff,'exit');if(code!==0)throw Error(stderr);console.log('CREATED',name);
}
(async()=>{
 const landscape=await cover(1920,1080,'cover-landscape-1920x1080.png');
 const portrait=await cover(800,1200,'cover-portrait-800x1200.png');
 await cover(800,800,'cover-square-800x800.png');console.log('CREATED three covers');
 await video(1920,1080,'preview-landscape-1920x1080.mp4',landscape);
 await video(1080,1620,'preview-portrait-1080x1620.mp4',portrait);
})().catch(e=>{console.error(e);process.exit(1);});
