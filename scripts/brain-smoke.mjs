import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { BrainCPU } from '../lib/neural/brain.js';
import { populations, decodeCounts } from '../lib/neural/stimulus.js';
import { inputGroups, SensorEncoder } from '../lib/sensor-encoder.mjs';
import { createWorld, createFly, sense, advanceFly, hashSeed } from '../lib/world.mjs';
const base = new URL('../public/neural/data/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base)));
const neurons = JSON.parse(gunzipSync(fs.readFileSync(new URL(manifest.metadata, base))));
const graph = { n: manifest.neurons, neurons, sign: Int32Array.from(neurons, r => ['dopamine', 'octopamine', 'serotonin'].includes(r[4]) ? 1 : r[5]) };
for (const a of manifest.arrays) { const b = Buffer.concat(a.parts.map(p => gunzipSync(fs.readFileSync(new URL(p.file, base))))); graph[a.name] = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
console.log('Loaded actual graph:', graph.n, graph.sources.length);
const seed = hashSeed('FLY-042');
const brain = new BrainCPU(graph, { seed }), groups = populations(neurons), encoder = new SensorEncoder(graph.n, inputGroups(neurons), seed);
const world = createWorld(), fly = createFly();
const started = performance.now();
for (let i = 0; i < Number(process.argv[2] || 100); i++) {
 const input = encoder.sample(sense(world, fly), fly.time).rates;
 const result = brain.batch(100, input);
 const rates = Array.from(decodeCounts(result.counts, groups, 100));
 advanceFly(world, fly, rates, .01);
 if (i % 25 === 0) console.log(i, 'spikes', result.total, 'rates', rates.map(v=>v.toFixed(0)), 'position', fly.x.toFixed(2), fly.y.toFixed(2));
}
console.log(JSON.stringify({ seconds: fly.time, distance: fly.distance, speed: fly.speed, escaped: fly.escaped, collisions: fly.collisions, rates: fly.rates, elapsedMs: performance.now()-started }));
if (fly.distance < 2) throw Error('Full connectome produced no locomotion');
