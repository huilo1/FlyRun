import { clamp, rng } from './world.mjs';
export const DEFAULT_NEURAL_OPTIONS = Object.freeze({ gain: 1, assisted: false, sensory: true, silenced: false });
export const SENSORY_KEYS = ['visualLeft', 'visualRight', 'dangerLeft', 'dangerRight', 'targetLeft', 'targetRight', 'loomLeft', 'loomRight'];
export function inputGroups(neurons) {
  const groups = Object.fromEntries([...SENSORY_KEYS, 'turnLeft', 'turnRight', 'reverse', 'walkLeft', 'walkRight'].map(key => [key, []]));
  neurons.forEach((row, i) => {
    const side = row[3] === 'L' ? 'Left' : row[3] === 'R' ? 'Right' : null;
    if (row[1] === 'LC9' && side) groups['visual' + side].push(i);
    if (row[1] === 'LC4' && side) groups['danger' + side].push(i);
    if (row[1] === 'LC10a' && side) groups['target' + side].push(i);
    if (row[1] === 'LC16' && side) groups['loom' + side].push(i);
    if (row[1] === 'DNa02' && side) groups['turn' + side].push(i);
    if (row[1] === 'DNp09' && side) groups['walk' + side].push(i);
    if (row[1] === 'MDN') groups.reverse.push(i);
  });
  return groups;
}
// Engineered interface, not a fitted sensory model. Direct DN drive is optional.
export class SensorEncoder {
  constructor(n, groups, seed = 1) { this.rates = new Float32Array(n); this.groups = groups; this.reset(seed); }
  reset(seed = 1) { this.random = rng(seed); this.bias = 0; this.nextChange = 0; this.contactUntil = 0; this.contactTurn = 0; this.wasFrontContact = false; this.previous = null; this.dangerAdaptation = { Left: 0, Right: 0 }; }
  sample(s, time, { gain = 1, assisted = false, sensory = true } = {}) {
    if (time >= this.nextChange) { this.bias = (this.random() - .5) * .55; this.nextChange = time + .5 + this.random(); }
    const v = sensory ? s : { left: 0, right: 0, front: 0, danger: 0, dangerLeft: 0, dangerRight: 0, contact: 0, contactFront: 0, contactRear: 0, lightLeft: 0, lightRight: 0 };
    const elapsed = this.previous ? time - this.previous.time : 0;
    const approach = side => elapsed > 0 && elapsed <= .1 ? clamp((v[side] - this.previous[side]) / elapsed * .2) : 0;
    // Feature channels on the SAME visual side; no chosen turn, escape action,
    // contact reflex or motor-neuron stimulus in the default sensory mode.
    // LC9's 180 Hz background is an artificial drive, selected by a full-graph
    // probe for sustained response. It is not spontaneous brain activity.
    // A transient visual change signal, not a permanent escape drive from a
    // stationary surface. The 250 ms adaptation is an engineered approximation.
    const dangerSignal = side => {
      const value = v['danger' + side] ?? v.danger;
      const alpha = 1 - Math.exp(-Math.max(0, elapsed) / .25);
      this.dangerAdaptation[side] += (value - this.dangerAdaptation[side]) * alpha;
      return 180 * clamp(value - this.dangerAdaptation[side]);
    };
    const sensorySignals = {
      visualLeft: 180, visualRight: 180,
      targetLeft: 180 * v.lightLeft, targetRight: 180 * v.lightRight,
      loomLeft: 180 * clamp(v.left ** 3 + approach('left')),
      loomRight: 180 * clamp(v.right ** 3 + approach('right')),
      dangerLeft: dangerSignal('Left'),
      dangerRight: dangerSignal('Right'),
      turnLeft: 0, turnRight: 0, reverse: 0, walkLeft: 0, walkRight: 0,
    };
    this.previous = { time, left: v.left, right: v.right };
    // A bounded pulse on a new forward contact, never a sliding deadline.
    // Rear contact cancels reverse immediately; subsequent movement still comes
    // only from network spikes, with no position correction or forced steering.
    if (!sensory || v.contactRear) this.contactUntil = 0;
    else if (v.contactFront && !this.wasFrontContact) {
      this.contactUntil = time + .3;
      this.contactTurn = v.right >= v.left ? 1 : -1;
    }
    this.wasFrontContact = Boolean(v.contactFront);
    const contact = time < this.contactUntil;
    const turn = clamp((contact ? this.contactTurn * .8 : 0) + (v.right - v.left) * 1.8 + (v.lightLeft - v.lightRight) * 1.1 + this.bias * (1 + v.front), -1, 1);
    const signals = assisted ? {
      visualLeft: 85 + 150 * Math.max(0, turn) + 45 * v.lightLeft,
      visualRight: 85 + 150 * Math.max(0, -turn) + 45 * v.lightRight,
      dangerLeft: 210 * v.danger + 60 * v.front,
      dangerRight: 210 * v.danger + 60 * v.front,
      turnLeft: assisted ? 380 * Math.max(0, turn) : 0,
      turnRight: assisted ? 380 * Math.max(0, -turn) : 0,
      reverse: assisted && contact ? 400 : 0,
      walkLeft: assisted && !contact ? 120 : 0,
      walkRight: assisted && !contact ? 120 : 0,
      targetLeft: 0, targetRight: 0, loomLeft: 0, loomRight: 0,
    } : sensorySignals;
    for (const key of Object.keys(signals)) signals[key] *= gain;
    this.rates.fill(0);
    for (const [key, ids] of Object.entries(this.groups)) for (const id of ids) this.rates[id] = signals[key];
    return { rates: this.rates, signals };
  }
}
