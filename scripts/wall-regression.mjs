// Real full-connectome regression for the sustained MDN / rear-wall feedback loop.
// CPU reference with GPU's Poisson seed=1; this is not a WebGPU execution test.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { BrainCPU } from '../lib/neural/brain.js';
import { populations, decodeCounts } from '../lib/neural/stimulus.js';
import { inputGroups, SensorEncoder } from '../lib/sensor-encoder.mjs';
import { createWorld, createFly, sense, advanceFly, hashSeed, blocked, H, W } from '../lib/world.mjs';

const base = new URL('../public/neural/data/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base)));
const neurons = JSON.parse(gunzipSync(fs.readFileSync(new URL(manifest.metadata, base))));
const graph = { n: manifest.neurons, neurons, sign: Int32Array.from(neurons, r => ['dopamine', 'octopamine', 'serotonin'].includes(r[4]) ? 1 : r[5]) };
for (const a of manifest.arrays) {
  const b = Buffer.concat(a.parts.map(p => gunzipSync(fs.readFileSync(new URL(p.file, base)))));
  graph[a.name] = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
const world = createWorld(process.argv[2] || 'FLY-241377');
const seed = hashSeed(world.seed), groups = populations(neurons);
const brain = new BrainCPU(graph, { seed: 1 });
const encoder = new SensorEncoder(graph.n, inputGroups(neurons), seed);
console.log('Full graph:', graph.n, 'neurons;', graph.sources.length, 'edges; room:', world.seed);
for (const [wall, x, y, heading] of [
  ['top', 10, .85, Math.PI / 2],
  ['bottom', 10, H - .85, -Math.PI / 2],
  ['left', .85, 34, 0],
  ['right', W - .85, 3, Math.PI],
]) {
  brain.reset(); encoder.reset(seed);
  const fly = { ...createFly(), x, y, heading, contact: true, speed: -10, rates: [20,20,20,20,380,20], trail: [[x,y]] };
  assert.ok(!blocked(world, x, y), `${wall}: fixture must be outside solid geometry`);
  // Establish actual recurrent activity from the former continuously driven
  // reflex, then release into the corrected closed loop without resetting brain.
  const stimulus = encoder.sample({ ...sense(world, fly), contactFront: 1, contactRear: 0 }, 0, { assisted: true }).rates;
  for (let i = 0; i < 50; i++) brain.batch(100, stimulus);
  fly.time = brain.tick / 10000;
  let mdnInputBatches = 0, spikes = 0, mdnTail = 0;
  for (let i = 0; i < 100; i++) {
    const sensors = sense(world, fly);
    const input = encoder.sample(sensors, fly.time, { assisted: true });
    if (sensors.contactRear) assert.equal(input.signals.reverse, 0, `${wall}: rear contact must not sustain MDN`);
    if (input.signals.reverse) mdnInputBatches++;
    const result = brain.batch(100, input.rates);
    const rates = Array.from(decodeCounts(result.counts, groups, 100));
    spikes += result.total;
    if (i >= 80) mdnTail += rates[4] / 20;
    advanceFly(world, fly, rates, .01);
  }
  const displacement = Math.hypot(fly.x - x, fly.y - y);
  assert.ok(spikes > 0, `${wall}: network must remain active`);
  assert.ok(displacement > 2, `${wall}: fly must leave the stuck position; got ${displacement} mm`);
  assert.ok(mdnTail < 100, `${wall}: sustained MDN must decay after removing its external drive`);
  console.log(JSON.stringify({ wall, displacementMm: +displacement.toFixed(2), mdnInputBatches, finalMdnHz: +mdnTail.toFixed(1), spikes }));
}
