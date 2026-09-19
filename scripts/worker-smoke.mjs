// Run the actual browser worker protocol using Node's web-compatible APIs.
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createWorld, createFly, sense, advanceFly, hashSeed } from '../lib/world.mjs';
const bundle = process.env.FLYRUN_BUNDLE_DIR;
let workerSource;
if (bundle) {
 const dir = path.join(bundle, '_next/static/chunks');
 const client = fs.readdirSync(dir).filter(f => f.startsWith('fly-lab-')).map(f => fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
 assert.ok(!client.includes('file:///'), 'Client worker must never resolve from a build-machine file URL');
 const workerPath = client.match(/\/_next\/static\/worker-[A-Za-z0-9_-]+\.js/);
 assert.ok(workerPath, 'Client must reference an emitted worker asset');
 workerSource = path.resolve(bundle, '.' + workerPath[0]);
 assert.ok(fs.existsSync(workerSource));
 console.log('Testing production worker referenced by client:',workerPath[0]);
}
const script = `const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=m=>parentPort.postMessage(m);${workerSource ? `Promise.resolve().then(()=>require('node:vm').runInThisContext(require('node:fs').readFileSync(${JSON.stringify(workerSource)},'utf8')))` : `import(${JSON.stringify(new URL('../lib/neural/worker.js',import.meta.url).href)})`}.then(()=>parentPort.on('message',data=>self.onmessage({data})));`;
const worker = new Worker(script, {eval:true});
let pending;
worker.on('message', m => {
 if(m.type==='error'){pending?.reject(Error(m.message));return;}
 if(pending?.type===m.type){const resolve=pending.resolve;pending=null;resolve(m);}
});
worker.on('error', error => pending?.reject(error));
function request(message,type){return new Promise((resolve,reject)=>{pending={type,resolve,reject};worker.postMessage(message);});}
const timeout=setTimeout(()=>{pending?.reject(Error('Worker timed out'));worker.terminate();},90000);
const world=createWorld();let fly=createFly(),generation=0;
async function step(silenced=false){
 // assisted is deliberately omitted: check the production worker's DEFAULT.
 const m=await request({type:'step',generation,sensors:sense(world,fly),options:{gain:1,sensory:true,silenced}},'result');
 assert.equal(m.generation,generation);assert.ok(m.rates.every(Number.isFinite));
 assert.equal(m.directMotorCount,0);
 for(const key of ['turnLeft','turnRight','walkLeft','walkRight','reverse'])assert.equal(m.signals[key],0);
 advanceFly(world,fly,m.rates,m.dt);return m;
}
async function reset(){
 generation++;fly=createFly();
 const m=await request({type:'reset',generation,seed:hashSeed(world.seed)},'reset');
 assert.equal(m.generation,generation);
}
try{
 const ready=await request({type:'init',backend:'cpu',seed:hashSeed(world.seed),assetBase:new URL('/neural/',process.env.FLYRUN_BASE_URL||'http://localhost:3000').href},'ready');
 assert.equal(ready.backend,'cpu');console.log('Actual loader and worker ready, anatomical points:',ready.anatomy.length);
 for(let i=0;i<100;i++)await step();
 assert.ok(fly.distance>2);console.log('Sensory-only closed loop:',fly.distance.toFixed(2),'mm');
 for(let i=0;i<100;i++){
  const m=await step(true);
  if(i>=50)assert.ok(m.rates.every(x=>x===0),'Live ablation must stop motor spikes');
 }
 assert.equal(fly.speed,0);console.log('Live ablation: motor activity decays, fly stops');
 await reset();
 for(let i=0;i<100;i++){
  const m=await step(true);if(i===0)assert.equal(m.tick,100);
  assert.ok(m.rates.every(x=>x===0));assert.ok(m.active>0,'Visual inputs still spike');
 }
 assert.equal(fly.distance,0);console.log('Ablation from reset: zero movement with active sensory inputs');
 await reset();
 for(let i=0;i<100;i++)await step();
 assert.ok(fly.distance>2);console.log('Reset and connections restored: movement recovered');
}finally{clearTimeout(timeout);await worker.terminate();}
