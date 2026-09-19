// Headless Chrome computation test. Uses a disposable profile, no user tabs or UI.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(new URL('..',import.meta.url).pathname), bundle=path.join(root,'dist/client');
const chrome=process.env.FLYRUN_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const client=fs.readdirSync(path.join(bundle,'_next/static/chunks')).find(f=>f.startsWith('fly-lab-'));
const source=fs.readFileSync(path.join(bundle,'_next/static/chunks',client),'utf8');
const workerPath=source.match(/\/_next\/static\/worker-[A-Za-z0-9_-]+\.js/)[0];
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 if(route==='/_gpu-test'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>FlyRun GPU computation test</title>');return;}
 const file=route==='/_gpu-world.mjs'?path.join(root,'lib/world.mjs'):path.resolve(bundle,'.'+route);
 if(!file.startsWith(bundle+path.sep)&&route!=='/_gpu-world.mjs'){res.writeHead(404);res.end();return;}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 const ext=path.extname(file),type={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm'}[ext]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':type});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'flyrun-gpu-'));
const child=spawn(chrome,['--headless=new','--enable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','about:blank'],{stdio:'ignore'});
let socket,id=0;const pending=new Map();
const deadline=setTimeout(()=>{child.kill();for(const p of pending.values())p.reject(Error('GPU test timed out'));},240000);
function command(method,params={}){return new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
try{
 let port;
 for(let i=0;i<100;i++){
  const file=path.join(profile,'DevToolsActivePort');
  if(fs.existsSync(file)){port=fs.readFileSync(file,'utf8').split('\n')[0];break;}
  if(child.exitCode!==null)throw Error('Headless Chrome exited before debugger startup');
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(port,'Chrome debugger did not start');
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin+'/_gpu-test')}`,{method:'PUT'})).json();
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
  if(m.method==='Runtime.consoleAPICalled'&&m.params.args[0]?.value==='FLYRUN_GPU')console.log(m.params.args[1]?.value);
 });
 await command('Runtime.enable');
 const result=await command('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const check=(v,message)=>{if(!v)throw Error(message)};
  const api=await import('/_gpu-world.mjs');
  const adapter=await navigator.gpu?.requestAdapter();check(adapter,'No WebGPU adapter');
  const worker=new Worker(${JSON.stringify(workerPath)},{type:'module'});let waiter;
  worker.onmessage=({data:m})=>{if(m.type==='error'||m.type==='fallback'){waiter?.reject(Error(m.message));return;}if(waiter?.type===m.type){const p=waiter;waiter=null;p.resolve(m);}};
  worker.onerror=e=>waiter?.reject(Error(e.message));
  const ask=(m,type)=>new Promise((resolve,reject)=>{waiter={type,resolve,reject};worker.postMessage(m)});
  const world=api.createWorld('FLY-042');let fly=api.createFly(),generation=0;
  const step=async(silenced=false)=>{const m=await ask({type:'step',generation,sensors:api.sense(world,fly),options:{silenced}},'result');check(m.directMotorCount===0,'Direct motor stimulus');api.advanceFly(world,fly,m.rates,m.dt);return m;};
  try{
   const ready=await ask({type:'init',backend:'auto',seed:api.hashSeed(world.seed),assetBase:location.origin+'/neural/'},'ready');check(ready.backend==='gpu','Expected actual WebGPU');
   console.log('FLYRUN_GPU','Full graph ready on WebGPU');
   let firstContact=null,streak=0,maxContact=0,recovered=false,contactPosition;
   for(let i=0;i<5000;i++){
    await step();
    if(fly.contact){if(firstContact===null){firstContact=fly.time;contactPosition=[fly.x,fly.y];}streak+=.01;maxContact=Math.max(maxContact,streak);}else streak=0;
    if(contactPosition&&Math.hypot(fly.x-contactPosition[0],fly.y-contactPosition[1])>2)recovered=true;
    if(i%100===99)console.log('FLYRUN_GPU',JSON.stringify({seconds:fly.time,distance:fly.distance,contact:fly.contact,maxContact}));
    if(fly.escaped)break;
   }
   check(firstContact!==null&&recovered,'Must recover after an actual obstacle contact');check(maxContact<8,'Prolonged contact');
   const loop={seconds:fly.time,distanceMm:fly.distance,firstContact,maxContact,recovered,escaped:fly.escaped};
   for(let i=0;i<100;i++){const m=await step(true);if(i>=50)check(m.rates.every(v=>v===0),'Live ablation motor spikes');}
   if(!fly.escaped)check(fly.actualSpeed===0,'Live ablation must stop movement');
   generation++;fly=api.createFly();await ask({type:'reset',generation,seed:api.hashSeed(world.seed)},'reset');
   for(let i=0;i<50;i++){const m=await step(true);check(m.rates.every(v=>v===0),'Cold ablation motor spikes');check(m.active>0,'Sensory neurons must remain active');}
   check(fly.distance===0,'Cold ablation must not move');
   return {backend:'WebGPU',browser:navigator.userAgent,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description},loop,liveAblationPassed:true,coldAblationPassed:true,directMotorInputs:0};
  }finally{worker.terminate();}
 })()`});
 if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
 const report={...result.result.value,workerPath,workerSha256:createHash('sha256').update(fs.readFileSync(path.join(bundle,workerPath))).digest('hex'),sourceSha256:Object.fromEntries(['lib/world.mjs','scripts/gpu-smoke.mjs'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]))};
 console.log(JSON.stringify(report,null,2));
 if(process.argv.includes('--write-report'))fs.writeFileSync(path.join(root,'public/neural/gpu-validation.json'),JSON.stringify(report,null,2)+'\n');
}finally{
 clearTimeout(deadline);socket?.close();child.kill();server.close();server.closeAllConnections();
 await new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve));
 fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
