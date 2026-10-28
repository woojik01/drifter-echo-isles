const fs=require('fs'),path=require('path'),vm=require('vm');
const noop=()=>{};
const mockContext=new Proxy({measureText:s=>({width:s.length*6}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:()=>({data:new Uint8ClampedArray(16)})},{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
module.exports=async function makeGame(options={}){
 const storage=new Map(options.storage||[]),elements=new Map(),listeners={},docListeners={},captureListeners={},timers=[];
 let canvas;
 if(options.realCanvas)canvas=require('@napi-rs/canvas');
 class Element{
  constructor(id=''){this.id=id;this.style={};this.dataset={};this.children=[];this.textContent='';this.innerHTML='';this.width=132;this.height=132;this.listeners={};const set=new Set();this.classList={add:(...a)=>a.forEach(v=>set.add(v)),remove:(...a)=>a.forEach(v=>set.delete(v)),contains:v=>set.has(v),toggle:(v,b)=>{if(b===undefined)b=!set.has(v);b?set.add(v):set.delete(v);return b;}};}
  addEventListener(k,f){(this.listeners[k]??=[]).push(f);}appendChild(e){this.children.push(e);return e;}insertBefore(e){return this.appendChild(e);}querySelector(s){return this._query??=new Element(s);}querySelectorAll(){return [];}getBoundingClientRect(){return{left:0,top:0,width:900,height:600};}setPointerCapture(){}remove(){}click(){}getContext(){return mockContext;}setAttribute(k,v){(this.attributes??={})[k]=v;}focus(){doc.activeElement=this;}closest(){return null;}
 }
 function element(id,canvasType=false){
  if(!canvas||!canvasType)return new Element(id);
  const target=canvas.createCanvas(132,132),base=new Element(id);
  for(const [key,value]of Object.entries(base))if(!['width','height'].includes(key))target[key]=value;
  for(const key of Object.getOwnPropertyNames(Element.prototype))if(!['constructor','getContext'].includes(key))target[key]=Element.prototype[key];
  return target;
 }
 const doc={getElementById:id=>{if(!elements.has(id))elements.set(id,element(id,['cv','mm','bigmap','logoCv'].includes(id)));return elements.get(id);},querySelectorAll:()=>[],createElement:tag=>element(tag,tag==='canvas'),addEventListener:(k,f)=>{(docListeners[k]??=[]).push(f);},body:new Element('body'),head:new Element('head'),documentElement:new Element('html'),hidden:false};
 const env={document:doc,console,innerWidth:options.width||1280,innerHeight:options.height||720,devicePixelRatio:1,performance:{now:()=>5000},crypto:require('crypto').webcrypto,matchMedia:()=>({matches:false}),navigator:{},fetch:async url=>({ok:!!options.config,status:options.config?200:503,json:async()=>options.config||{error:'Co-op is not configured yet; site owner should set runtime settings.'}}),localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimeout:noop,setInterval:()=>0,clearInterval:noop,requestAnimationFrame:noop,addEventListener:(k,f,options)=>{(options===true?captureListeners:listeners)[k]??=[];(options===true?captureListeners:listeners)[k].push(f);},dispatchEvent:e=>{for(const f of listeners[e.type]||[])f(e);},Event:class{constructor(type){this.type=type;}},URL:{createObjectURL:()=>'',revokeObjectURL:noop},Blob,confirm:()=>true,location:{reload:noop,protocol:options.sdk?'https:':'file:',hostname:options.sdk?'games.crazygames.com':''}};
 if(options.sdk)env.CrazyGames={SDK:options.sdk};if(options.gdSDK){env.gdsdk=options.gdSDK;env.location.protocol='https:';env.location.hostname='example.com';}env.window=env;
 vm.createContext(env);
 for(const file of ['platform.js',...(options.gdSDK?['gamedistribution.js']:[]),'game.js','expedition.js','multiplayer.js'])vm.runInContext(fs.readFileSync(path.join(options.assetsDir||path.join(__dirname,'../game-assets'),file),'utf8'),env,{filename:file,timeout:30000});
 if(options.gdSDK)env.GD_OPTIONS.onEvent({name:'SDK_READY'});
 await env.DrifterBoot();
 return{env,storage,elements,listeners,captureListeners,docListeners,timers,canvas,run:s=>vm.runInContext(s,env,{timeout:30000})};
};
