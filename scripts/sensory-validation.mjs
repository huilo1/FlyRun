// Full-network causal checks, not a maze-solution or biological-validity test.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fullGraph } from './full-graph.mjs';
import { BrainCPU } from '../lib/neural/brain.js';
import { populations, decodeCounts, CHANNELS } from '../lib/neural/stimulus.js';
import { inputGroups, SensorEncoder, SENSORY_KEYS, DEFAULT_NEURAL_OPTIONS } from '../lib/sensor-encoder.mjs';
import { createWorld, createFly, sense, advanceFly, hashSeed } from '../lib/world.mjs';

const graph = fullGraph(), brain = new BrainCPU(graph, { seed: 1 });
const inputs = inputGroups(graph.neurons), groups = populations(graph.neurons);
const motor = new Set(CHANNELS.flatMap(key => groups[key]));
const visual = new Set(SENSORY_KEYS.flatMap(key => inputs[key]));
assert.ok([...visual].every(id => !motor.has(id)), 'No sensory input may be a motor readout');
assert.ok([...visual].every(id => graph.neurons[id][2] === 'visual_projection'));
assert.equal(DEFAULT_NEURAL_OPTIONS.assisted, false);
const empty = { left:0, right:0, front:0, danger:0, dangerLeft:0, dangerRight:0, lightLeft:0, lightRight:0, contact:0, contactFront:0, contactRear:0 };
const results = [];
function run(name, { seconds = 1, stimulus = empty, room, silenced = false, cutAt = Infinity, neuralSeed = 1 } = {}) {
  brain.seed = neuralSeed; brain.reset();
  const world = room ? createWorld(room) : { seed: 'PROBE', exit: {y:29,h:10}, obstacles: [] };
  const encoder = new SensorEncoder(graph.n, inputs, hashSeed(world.seed));
  const fly = createFly(), mean = Array(6).fill(0), tail = Array(6).fill(0), recentRates = [];
  const batches = Math.round(seconds * 100);
  let totalSpikes = 0, completed = 0, contactSeconds = 0, maxContactSeconds = 0, firstContactSeconds = null;
  for (let i = 0; i < batches; i++) {
    const input = encoder.sample(room ? sense(world, fly) : stimulus, fly.time).rates;
    assert.ok([...motor].every(id => input[id] === 0), 'No direct motor stimulus');
    const result = brain.batch(100, input, silenced || i / 100 >= cutAt);
    const rates = Array.from(decodeCounts(result.counts, groups, 100));
    if (silenced || i / 100 >= cutAt + .5) assert.ok(rates.every(v => v === 0), 'Motor response must vanish without connections');
    rates.forEach((value,j) => { mean[j] += value; });
    recentRates.push(rates); if (recentRates.length > 50) recentRates.shift();
    totalSpikes += result.total;
    advanceFly(world, fly, rates, .01);
    completed++;
    if (fly.contact) {
      firstContactSeconds ??= fly.time;
      contactSeconds += .01;
      maxContactSeconds = Math.max(maxContactSeconds, contactSeconds);
    } else contactSeconds = 0;
    if (batches > 1000 && completed % 500 === 0) console.log(JSON.stringify({ progress:name,seconds:fly.time,distanceMm:fly.distance,maxContactSeconds }));
    if (fly.escaped) break;
  }
  mean.forEach((value,j) => { mean[j] = value / completed; });
  for (const sample of recentRates) sample.forEach((value,j) => { tail[j] += value / recentRates.length; });
  const result = { name, seconds:fly.time, requestedSeconds:seconds, neuralSeed, distanceMm: fly.distance, signedTurnRadians: fly.heading + .2, finalSpeedMmS: fly.actualSpeed, finalCommandSpeedMmS:fly.speed, collisions: fly.collisions, firstContactSeconds, maxContactSeconds, escaped:fly.escaped, meanMotorHz: mean, lastHalfSecondMotorHz: tail, totalSpikes };
  results.push(result); console.log(JSON.stringify(result)); return result;
}

const background = run('LC9 background 180 Hz, no environment', {seconds:3});
assert.ok(background.distanceMm > 10 && background.lastHalfSecondMotorHz[0] + background.lastHalfSecondMotorHz[1] > 20, 'Sustained response through the graph');
const left = run('Visible target left', {stimulus:{...empty,lightLeft:1}});
const right = run('Visible target right', {stimulus:{...empty,lightRight:1}});
assert.ok(left.signedTurnRadians < -.2 && right.signedTurnRadians > .2, 'Target side must change turning through network spikes');
run('Close objects both sides; LC16 response is not guaranteed to cause retreat', {stimulus:{...empty,left:1,right:1,front:1}});
const ablated = run('Same left target, connections off from reset', {stimulus:{...empty,lightLeft:1},silenced:true});
assert.equal(ablated.distanceMm,0); assert.equal(ablated.signedTurnRadians,0); assert.ok(ablated.totalSpikes > 0, 'Input neurons should still spike');
const cut = run('Connections cut after 1 second, without resetting brain', {seconds:2,cutAt:1});
assert.equal(cut.finalSpeedMmS,0);
const regression = run('Closed loop FLY-042 through obstacle contacts, GPU-compatible neural seed', {seconds:50,room:'FLY-042'});
assert.ok(regression.firstContactSeconds !== null, 'Regression must reach an actual obstacle');
assert.ok(regression.distanceMm > 100, 'Must move beyond the first stalled position');
assert.ok(regression.maxContactSeconds < 8, 'Must not remain pinned against an obstacle');
run('Closed loop FLY-241377, CPU room seed', {seconds:3,room:'FLY-241377',neuralSeed:hashSeed('FLY-241377')});

const sources = ['lib/sensor-encoder.mjs','lib/world.mjs','lib/neural/brain.js','lib/neural/stimulus.js'];
const report = {
  schema: 1, backend: 'CPU reference; WebGPU execution not measured',
  graph: { neurons: graph.n, edges: graph.sources.length },
  stimulusReadoutOverlap: [...visual].filter(id => motor.has(id)).length,
  inputCounts: Object.fromEntries(SENSORY_KEYS.map(key => [key,inputs[key].length])),
  sourceSha256: Object.fromEntries(sources.map(file => [file,createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex')])),
  limits: ['Synthetic visual features and artificial LC9 background; no validated retinal model.', 'Deterministic tests establish causal dependence and recovery in the reported room, not animal-like behavior or general maze solving.', 'LC16 response is weak in this model; reliable retreat is not established.'],
  results,
};
if (process.argv.includes('--write-report')) fs.writeFileSync(new URL('../public/neural/sensory-validation.json',import.meta.url), JSON.stringify(report,null,2)+'\n');
console.log('Sensory-only causal checks passed.');
