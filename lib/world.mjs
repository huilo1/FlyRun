// Physical world, illustrative millimetres. Never chooses actions.
export const W = 100, H = 68, RADIUS = 0.8;
export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export function rng(seed) {
  let x = seed >>> 0;
  return () => { x += 0x6D2B79F5; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hashSeed(text) {
  let x = 2166136261;
  for (const c of String(text)) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return x >>> 0;
}
export function circleRect(x, y, r, box) {
  return Math.hypot(x - clamp(x, box.x, box.x + box.w), y - clamp(y, box.y, box.y + box.h)) < r;
}
export function blocked(world, x, y, r = RADIUS) {
  const exit = y > world.exit.y + r && y < world.exit.y + world.exit.h - r;
  return x < r || y < r || y > H - r || (x > W - r && !exit) || world.obstacles.some(b => circleRect(x, y, r, b));
}
// Clearance flood fill validates rooms ONLY; its result never reaches the fly.
export function reachable(world, clearance = 2.5) {
  const seen = new Set(), queue = [[10, 34]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i], key = x + ',' + y;
    if (seen.has(key) || x < 1 || x > W || y < 1 || y > H - 1 || blocked(world, x, y, clearance)) continue;
    seen.add(key);
    if (x >= W - 2 && Math.abs(y - world.exit.y - world.exit.h / 2) < 3) return true;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return false;
}
export function createWorld(seed = 'FLY-042', density = 10) {
  const random = rng(hashSeed(seed)), obstacles = [];
  const world = { seed, obstacles, exit: { x: W, y: 10 + Math.floor(random() * 38), h: 10 } };
  for (let i = 0; i < density; i++) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const vertical = random() > .5;
      const box = { x: 22 + random() * 64, y: 6 + random() * 48, w: vertical ? 3.5 : 9 + random() * 10, h: vertical ? 9 + random() * 13 : 3.5, type: i % 4 === 2 ? 'danger' : 'wall' };
      box.x = Math.min(box.x, W - 9 - box.w); box.y = Math.min(box.y, H - 7 - box.h);
      if (obstacles.some(b => box.x < b.x + b.w + 6 && box.x + box.w + 6 > b.x && box.y < b.y + b.h + 6 && box.y + box.h + 6 > b.y)) continue;
      obstacles.push(box);
      if (reachable(world)) break;
      obstacles.pop();
    }
  }
  return world;
}
export function createFly() {
  return { x: 10, y: 34, heading: -.2, time: 0, distance: 0, speed: 0, actualSpeed: 0, turn: 0, contact: false, collisions: 0, escaped: false, rates: [0, 0, 0, 0, 0, 0], trail: [[10, 34]], coverage: new Set(), behavior: 'Ожидание' };
}
function intersectRay(x, y, dx, dy, b) {
  let near = 0, far = Infinity;
  for (const [p, d, lo, hi] of [[x, dx, b.x, b.x + b.w], [y, dy, b.y, b.y + b.h]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return Infinity; }
    else { const a = (lo - p) / d, z = (hi - p) / d; near = Math.max(near, Math.min(a, z)); far = Math.min(far, Math.max(a, z)); }
  }
  return far >= near ? near : Infinity;
}
export function raycast(world, x, y, angle, range = 24) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let distance = range, type = 'empty';
  const bounds = [
    { x: -1, y: -1, w: 1, h: H + 2, type: 'wall' }, { x: 0, y: -1, w: W, h: 1, type: 'wall' },
    { x: 0, y: H, w: W, h: 1, type: 'wall' }, { x: W, y: 0, w: 1, h: world.exit.y, type: 'wall' },
    { x: W, y: world.exit.y + world.exit.h, w: 1, h: H, type: 'wall' },
    { x: W + 1, y: world.exit.y, w: 1, h: world.exit.h, type: 'exit' },
  ];
  for (const b of [...bounds, ...world.obstacles]) {
    const d = intersectRay(x, y, dx, dy, b);
    if (d < distance) { distance = d; type = b.type; }
  }
  return { distance, type, angle, x: x + dx * distance, y: y + dy * distance, proximity: type === 'empty' ? 0 : clamp(1 - distance / range) };
}
export function sense(world, fly, range = 24) {
  const rays = Array.from({ length: 15 }, (_, i) => raycast(world, fly.x, fly.y, fly.heading + (i - 7) * .25, range));
  let left = 0, right = 0, front = 0, danger = 0, dangerLeft = 0, dangerRight = 0;
  for (let i = 0; i < rays.length; i++) {
    const r = rays[i]; if (!['wall', 'danger'].includes(r.type)) continue;
    const value = r.proximity ** 2;
    if (i < 7) left = Math.max(left, value);
    if (i > 7) right = Math.max(right, value);
    if (Math.abs(i - 7) <= 2) front = Math.max(front, value);
    if (r.type === 'danger') {
      danger = Math.max(danger, value);
      if (i <= 7) dangerLeft = Math.max(dangerLeft, value);
      if (i >= 7) dangerRight = Math.max(dangerRight, value);
    }
  }
  const ex = W + 1 - fly.x, ey = world.exit.y + world.exit.h / 2 - fly.y;
  const distance = Math.hypot(ex, ey), angle = Math.atan2(ey, ex);
  const relative = Math.atan2(Math.sin(angle - fly.heading), Math.cos(angle - fly.heading));
  const visible = distance < range * 1.8 && Math.abs(relative) < 1.75 && raycast(world, fly.x, fly.y, angle, distance + 2).type === 'exit';
  const light = visible ? clamp(1 - distance / (range * 1.8)) : 0;
  // Contact is directional: a blocked backward step must not request more reverse.
  // These channels describe the attempted translation, not a detailed body sensor.
  return { rays, left, right, front, danger, dangerLeft, dangerRight, contact: fly.contact ? 1 : 0,
    contactFront: fly.contact && fly.speed >= 0 ? 1 : 0,
    contactRear: fly.contact && fly.speed < 0 ? 1 : 0,
    lightLeft: relative < 0 ? light : 0, lightRight: relative >= 0 ? light : 0 };
}
// Only measured neural rates enter here. No sensor signals or path information.
export function advanceFly(world, fly, input, dt) {
  if (fly.escaped) return;
  if (input.length !== 6 || !input.every(Number.isFinite) || !(dt > 0 && dt <= .05)) throw Error('Invalid motor readout');
  const alpha = 1 - Math.exp(-dt / .08);
  fly.rates = fly.rates.map((v, i) => v + (Math.max(0, input[i]) - v) * alpha);
  const [wl, wr, tl, tr, back, escape] = fly.rates;
  const walking = Math.max(0, (wl + wr) / 2 - 6), reverse = Math.max(0, back - 25);
  fly.speed = 20 * Math.tanh(walking / 30) * (1 - Math.tanh(reverse / 60)) - 12 * Math.tanh(reverse / 90);
  if (escape > 100 && walking > 6) fly.speed *= 1.25;
  // Preserve weak asymmetric neural responses: the former 15 Hz cutoff
  // discarded most turns in sensory-only mode. Smoothing still limits jitter.
  fly.turn = 4.8 * Math.tanh((tr - tl) / 45);
  fly.heading += fly.turn * dt;
  const dx = Math.cos(fly.heading) * fly.speed * dt, dy = Math.sin(fly.heading) * fly.speed * dt;
  const previousDistance = fly.distance;
  let contact = false;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (RADIUS / 2)));
  for (let i = 0; i < n; i++) {
    const x = fly.x + dx / n, y = fly.y + dy / n;
    if (blocked(world, x, y)) { contact = true; break; }
    fly.distance += Math.hypot(dx, dy) / n; fly.x = x; fly.y = y;
    if (x > W + RADIUS) { fly.escaped = true; break; }
  }
  fly.actualSpeed = Math.sign(fly.speed) * (fly.distance - previousDistance) / dt;
  if (contact && !fly.contact) fly.collisions++;
  fly.contact = contact; fly.time += dt;
  fly.coverage.add(`${Math.floor(fly.x / 5)},${Math.floor(fly.y / 5)}`);
  const last = fly.trail.at(-1);
  if (Math.hypot(fly.x - last[0], fly.y - last[1]) > .45) { fly.trail.push([fly.x, fly.y]); if (fly.trail.length > 6000) fly.trail.shift(); }
  fly.behavior = fly.escaped ? 'Выход найден' : contact ? 'Контакт с преградой' : fly.speed < -.5 ? 'Отступает' : Math.abs(fly.turn) > .6 ? fly.turn < 0 ? 'Поворачивает влево' : 'Поворачивает вправо' : fly.speed > .2 ? 'Исследует комнату' : 'Нейронная пауза';
}
