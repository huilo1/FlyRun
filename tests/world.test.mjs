import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, createFly, reachable, blocked, sense, raycast, advanceFly, W } from '../lib/world.mjs';
import { SensorEncoder, inputGroups, DEFAULT_NEURAL_OPTIONS } from '../lib/sensor-encoder.mjs';
import { BrainCPU } from '../lib/neural/brain.js';
import { decodeCounts, populations } from '../lib/neural/stimulus.js';

test('seed reproduces a spacious connected room across 60 seeds', () => {
  for (let i = 0; i < 60; i++) {
    const world = createWorld(`seed-${i}`, 14);
    assert.deepEqual(world, createWorld(`seed-${i}`, 14));
    assert.ok(reachable(world, 2.5));
    assert.ok(!blocked(world, 10, 34, 2.5));
    assert.ok(world.obstacles.length >= 4);
  }
});
test('rays report nearest object and hide exit light behind obstacles', () => {
  const world = { exit: { y: 29, h: 10 }, obstacles: [{x:70,y:20,w:4,h:25,type:'danger'}] };
  const fly = {...createFly(),x:65,y:34,heading:0};
  assert.equal(raycast(world,65,34,0).type,'danger');
  assert.equal(raycast(world,65,34,0).distance,5);
  assert.equal(sense(world,fly).lightRight,0);
  assert.ok(sense(world,fly).danger > 0);
  world.obstacles=[];
  assert.ok(sense(world,fly).lightRight > 0);
});
test('no motor spikes means no movement, despite nearby exit', () => {
  const world = {exit:{y:29,h:10},obstacles:[]}, fly = {...createFly(),x:90};
  for(let i=0;i<200;i++) advanceFly(world,fly,[0,0,0,0,0,0],.01);
  assert.equal(fly.x,90);assert.equal(fly.distance,0);assert.equal(fly.heading,-.2);
});
test('collisions constrain movement without an automatic turn; exit is traversable', () => {
  const world = {exit:{y:29,h:10},obstacles:[{x:12,y:25,w:3,h:20,type:'wall'}]}, fly={...createFly(),heading:0};
  for(let i=0;i<200;i++)advanceFly(world,fly,[200,200,0,0,0,0],.01);
  assert.ok(fly.x<12);assert.equal(fly.heading,0);assert.ok(fly.contact);assert.equal(fly.collisions,1);
  assert.equal(fly.actualSpeed,0);assert.ok(fly.speed>0);
  const escaped={...createFly(),x:98,heading:0};
  for(let i=0;i<50;i++)advanceFly({exit:world.exit,obstacles:[]},escaped,[200,200,0,0,0,0],.01);
  assert.ok(escaped.escaped);assert.ok(escaped.x>W);
});
test('opposite descending populations produce opposite turns',()=>{
  const a=createFly(),b=createFly(),world=createWorld();
  advanceFly(world,a,[0,0,200,0,0,0],.05);advanceFly(world,b,[0,0,0,200,0,0],.05);
  assert.ok(a.heading<-.2);assert.ok(b.heading>-.2);
});
test('weak asymmetric motor activity below 15 Hz still turns the fly',()=>{
 const world={exit:{y:29,h:10},obstacles:[]},a=createFly(),b=createFly(),equal=createFly();
 for(let i=0;i<100;i++){
  advanceFly(world,a,[0,0,8,3,0,0],.01);
  advanceFly(world,b,[0,0,3,8,0,0],.01);
  advanceFly(world,equal,[0,0,8,8,0,0],.01);
 }
 assert.ok(a.heading<-.6);assert.ok(b.heading>.2);
 assert.equal(equal.heading,-.2);
 assert.equal(a.distance,0);assert.equal(b.distance,0);
});
const neurons = [[1,'LC9','visual','L'],[2,'LC9','visual','R'],[3,'LC4','visual','L'],[4,'LC4','visual','R'],[5,'DNa02','descending','L'],[6,'DNa02','descending','R'],[7,'MDN','descending','L'],[8,'DNp09','descending','L'],[9,'DNp09','descending','R']];
const legacySample=(e,s,t,options={})=>e.sample(s,t,{assisted:true,...options});
const sensors={left:0,right:1,front:0,danger:.5,contact:1,contactFront:1,contactRear:0,lightLeft:0,lightRight:0};
test('input mapping reacts to type and direction, with real sensory and DN ablations',()=>{
  const e=new SensorEncoder(9,inputGroups(neurons),42);
  const a=legacySample(e,sensors,0);
  assert.ok(a.signals.turnLeft>a.signals.turnRight);assert.ok(a.signals.dangerLeft>0);assert.ok(a.signals.reverse>0);
  const b=legacySample(e,sensors,0,{assisted:false});assert.deepEqual(Array.from(b.rates.slice(4)),[0,0,0,0,0]);
  const c=legacySample(e,sensors,0,{sensory:false});assert.equal(c.signals.reverse,0);assert.equal(c.signals.dangerLeft,0);
  const d=legacySample(e,sensors,0,{gain:0});assert.ok(d.rates.every(x=>x===0));
});
test('CPU seed repeats spikes and reset clears recurrent state',()=>{
 const graph={n:2,offsets:new Uint32Array([0,0,1]),sources:new Uint32Array([0]),counts:new Uint32Array([100]),sign:new Int32Array([1,1])};
 const b=new BrainCPU(graph,{seed:42}),rates=new Float32Array([200,0]);
 const first=b.batch(500,rates);b.reset();const second=b.batch(500,rates);
 assert.deepEqual(first,second);assert.ok(first.counts[1]>0);
 b.reset();assert.deepEqual(Array.from(b.batch(500,rates,true).counts).slice(1),[0]);
});

test('strong MDN reverses even with persistent recurrent walking activity',()=>{
 const fly={...createFly(),heading:0},world={exit:{y:29,h:10},obstacles:[]};
 for(let i=0;i<100;i++)advanceFly(world,fly,[150,150,0,0,300,0],.01);
 assert.ok(fly.speed<0);assert.ok(fly.x<10);
});

test('backward collision produces rear contact, not a forward-contact reflex',()=>{
 const world={exit:{y:29,h:10},obstacles:[]};
 const fly={...createFly(),x:.81,heading:0,rates:[20,20,20,20,380,20]};
 advanceFly(world,fly,[20,20,20,20,380,20],.01);
 const s=sense(world,fly);
 assert.equal(s.contact,1);assert.equal(s.contactFront,0);assert.equal(s.contactRear,1);
 const e=new SensorEncoder(9,inputGroups(neurons),42);
 const input=legacySample(e,s,fly.time).signals;
 assert.equal(input.reverse,0);assert.equal(input.walkLeft,120);
});
test('continuous forward contact cannot extend the 300 ms MDN pulse',()=>{
 const e=new SensorEncoder(9,inputGroups(neurons),42);
 assert.equal(legacySample(e,sensors,0).signals.reverse,400);
 for(let t=1;t<=100;t++) {
   const s=legacySample(e,sensors,t/100).signals;
   if(t>=30){assert.equal(s.reverse,0);assert.equal(s.walkLeft,120);}
 }
 // A genuinely new contact can produce a new pulse.
 legacySample(e,{...sensors,contact:0,contactFront:0},1.01);
 assert.equal(legacySample(e,sensors,1.02).signals.reverse,400);
});
test('rear contact cancels an active reverse pulse and preserves neural-only control',()=>{
 const e=new SensorEncoder(9,inputGroups(neurons),42);
 legacySample(e,sensors,0);
 const rear={...sensors,contactFront:0,contactRear:1};
 assert.equal(legacySample(e,rear,.1).signals.reverse,0);
 assert.equal(legacySample(e,rear,.2).signals.walkRight,120);
 const pure=legacySample(e,rear,.3,{assisted:false});
 assert.ok(pure.rates.slice(4).every(x=>x===0));
});
test('displayed stimulus rates equal the effective inputs after gain',()=>{
 const e=new SensorEncoder(9,inputGroups(neurons),42);
 const {signals,rates}=legacySample(e,sensors,0,{gain:.5});
 assert.equal(signals.reverse,200);assert.equal(rates[6],200);
 assert.equal(rates[0],Math.fround(signals.visualLeft));
});

const visualNeurons = [...neurons, [10,'LC10a','visual_projection','L'], [11,'LC10a','visual_projection','R'], [12,'LC16','visual_projection','L'], [13,'LC16','visual_projection','R']];
test('default sensory mode never drives a motor output, including on contact',()=>{
 assert.equal(DEFAULT_NEURAL_OPTIONS.assisted,false);
 const e=new SensorEncoder(13,inputGroups(visualNeurons),42);
 const {rates,signals}=e.sample(sensors,0);
 assert.ok(rates.slice(4,9).every(x=>x===0));
 assert.equal(signals.visualLeft,180);assert.equal(signals.visualRight,180);
 assert.equal(signals.loomLeft,0);assert.equal(signals.loomRight,180);
 assert.equal(signals.reverse,0);assert.equal(signals.walkLeft,0);
});
test('visual features stay on their own side, with no computed motor command',()=>{
 const a=new SensorEncoder(13,inputGroups(visualNeurons),42),b=new SensorEncoder(13,inputGroups(visualNeurons),42);
 const l=a.sample({...sensors,left:.8,right:0,dangerLeft:.5,dangerRight:0,lightLeft:.7,lightRight:0},0).signals;
 const r=b.sample({...sensors,left:0,right:.8,dangerLeft:0,dangerRight:.5,lightLeft:0,lightRight:.7},0).signals;
 for(const key of ['visual','target','loom','danger']){assert.equal(l[key+'Left'],r[key+'Right']);assert.equal(l[key+'Right'],r[key+'Left']);}
 assert.equal(l.turnLeft,0);assert.equal(r.turnRight,0);
});
test('disabling feedback leaves only a symmetric visual background',()=>{
 const e=new SensorEncoder(13,inputGroups(visualNeurons),42);
 e.sample(sensors,0);
 const {signals,rates}=e.sample({...sensors,lightLeft:1},.01,{sensory:false});
 assert.equal(signals.visualLeft,180);assert.equal(signals.visualRight,180);
 assert.ok(rates.slice(2).every(x=>x===0));
});
test('visual approach responds to increasing proximity and reset clears its history',()=>{
 const e=new SensorEncoder(13,inputGroups(visualNeurons),42);
 e.sample({...sensors,right:.1},0);
 const increasing=e.sample({...sensors,right:.2},.01).signals.loomRight;
 const stationary=e.sample({...sensors,right:.2},.02).signals.loomRight;
 assert.ok(increasing>stationary);
 e.reset(42);
 assert.equal(e.sample({...sensors,right:.2},0).signals.loomRight,stationary);
});
test('constant danger cannot indefinitely drive LC4; a new approach can',()=>{
 const e=new SensorEncoder(13,inputGroups(visualNeurons),42);
 const near={...sensors,dangerLeft:.5,dangerRight:0};
 assert.equal(e.sample(near,0).signals.dangerLeft,90);
 let last;
 for(let i=1;i<=200;i++)last=e.sample(near,i/100).signals;
 assert.ok(last.dangerLeft<.1);assert.equal(last.dangerRight,0);
 const renewed=e.sample({...near,dangerLeft:1},2.01).signals;
 assert.ok(renewed.dangerLeft>80);
 const disabled=e.sample(near,2.02,{sensory:false}).signals;
 assert.equal(disabled.dangerLeft,0);assert.equal(disabled.dangerRight,0);
});
