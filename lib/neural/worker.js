import { loadGraph, configureAssetBase } from './data-loader.js';
import { BrainCPU } from './brain.js';
import { populations, decodeCounts, CHANNELS } from './stimulus.js';
import { inputGroups, SensorEncoder, SENSORY_KEYS, DEFAULT_NEURAL_OPTIONS } from '../sensor-encoder.mjs';
let graph, brain, groups, encoder, motorIds, backend = 'cpu', generation = 0;
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(() => handle(data)).catch(error => postMessage({ type: 'error', message: error.message, generation }));
};
async function handle(m) {
  if (m.type === 'init') {
    configureAssetBase(m.assetBase);
    graph = await loadGraph(value => postMessage({ type: 'progress', value }), message => postMessage({ type: 'stage', message }));
    graph.neurons.forEach((r, i) => { if (['dopamine', 'octopamine', 'serotonin'].includes(r[4])) graph.sign[i] = 1; });
    groups = populations(graph.neurons);
    const inputs = inputGroups(graph.neurons);
    motorIds = [...new Set(CHANNELS.flatMap(key => groups[key]))];
    const sensoryIds = new Set(SENSORY_KEYS.flatMap(key => inputs[key]));
    if (motorIds.some(id => sensoryIds.has(id))) throw Error('Sensory input overlaps motor readout');
    encoder = new SensorEncoder(graph.n, inputs, m.seed);
    postMessage({ type: 'progress', value: 0.92 });
    if (m.backend !== 'cpu') {
      try {
        postMessage({ type: 'stage', message: 'Проверка WebGPU и подготовка мозга…' });
        const { BrainGPU } = await import('./brain-gpu.js');
        const { checkGPU } = await import('./gpu-check.js');
        await checkGPU(g => BrainGPU.create(g));
        brain = await BrainGPU.create(graph); await brain.prepareReadout(groups); backend = 'gpu';
      } catch (error) {
        brain?.destroy?.(); postMessage({ type: 'fallback', message: error.message });
        brain = new BrainCPU(graph, { seed: m.seed }); backend = 'cpu';
      }
    } else { postMessage({ type: 'stage', message: 'Подготовка полной сети на CPU…' }); brain = new BrainCPU(graph, { seed: m.seed }); }
    // A small factual anatomical point cloud, not random decorative neurons.
    const anatomy = [];
    graph.neurons.forEach((r, i) => { if (i % 24 === 0 && r[6]?.length === 3 && r[2] !== 'motor_neuron') anatomy.push({ index: i, position: r[6] }); });
    postMessage({ type: 'ready', backend, anatomy, inputCounts: Object.fromEntries(Object.entries(inputs).map(([k, a]) => [k, a.length])) });
  } else if (m.type === 'reset') {
    generation = m.generation; await brain.reset(); if (backend === 'cpu') brain.seed = m.seed;
    encoder.reset(m.seed); postMessage({ type: 'reset', generation });
  } else if (m.type === 'step') {
    if (generation !== m.generation) return;
    const start = performance.now(), steps = 100;
    const options = { ...DEFAULT_NEURAL_OPTIONS, ...m.options };
    const { rates: input, signals } = encoder.sample(m.sensors, brain.tick / 10000, options);
    const directMotorCount = motorIds.filter(id => input[id] > 0).length;
    if (!options.assisted && directMotorCount) throw Error('Direct motor input in sensory mode');
    const result = await brain.batch(steps, input, options.silenced);
    const rates = decodeCounts(result.counts, groups, steps);
    if (backend === 'gpu' && result.rates.some((x, i) => !Number.isFinite(x) || Math.abs(x - rates[i]) > 1e-3 * Math.max(1, rates[i]))) throw Error('GPU readout mismatch');
    const firing = [];
    for (let i = 0; i < result.counts.length; i++) if (result.counts[i]) firing.push(i);
    postMessage({ type: 'result', generation, rates: Array.from(rates), tick: result.tick, dt: steps / 10000, total: result.total, active: firing.length, firing: firing.filter(i => i % 24 === 0), signals, directMotorCount, wallMs: performance.now() - start });
  }
}
