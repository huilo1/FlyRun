import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';

// Node-only loader for experiments using the same complete graph as the Worker.
export function fullGraph() {
  const base = new URL('../public/neural/data/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base)));
  const neurons = JSON.parse(gunzipSync(fs.readFileSync(new URL(manifest.metadata, base))));
  const graph = { n: manifest.neurons, neurons, sign: Int32Array.from(neurons, r => ['dopamine', 'octopamine', 'serotonin'].includes(r[4]) ? 1 : r[5]) };
  for (const a of manifest.arrays) {
    const b = Buffer.concat(a.parts.map(p => gunzipSync(fs.readFileSync(new URL(p.file, base)))));
    graph[a.name] = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return graph;
}
