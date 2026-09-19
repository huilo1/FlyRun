import { W, H } from './world.mjs';
export function drawWorld(canvas, world, fly, sensors, options = {}) {
  const ctx = canvas.getContext('2d'), ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
  const scale = Math.min((width - 64) / (W + 5), (height - 70) / H), ox = (width - W * scale) / 2, oy = (height - H * scale) / 2;
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
  ctx.fillStyle = '#111c26'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2b3b48';
  for (let x = 2; x < W; x += 4) for (let y = 2; y < H; y += 4) { ctx.beginPath(); ctx.arc(x, y, .09, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#52616e'; ctx.lineWidth = .55;
  ctx.beginPath(); ctx.moveTo(W, world.exit.y); ctx.lineTo(W, 0); ctx.lineTo(0, 0); ctx.lineTo(0, H); ctx.lineTo(W, H); ctx.lineTo(W, world.exit.y + world.exit.h); ctx.stroke();
  const ey = world.exit.y;
  const glow = ctx.createLinearGradient(W - 9, 0, W + 2, 0); glow.addColorStop(0, '#c5f56a00'); glow.addColorStop(1, '#c5f56a3b');
  ctx.fillStyle = glow; ctx.fillRect(W - 9, ey, 11, world.exit.h);
  ctx.strokeStyle = '#c5f56a'; ctx.lineWidth = .65; ctx.setLineDash([.5, .6]);
  ctx.beginPath(); ctx.moveTo(W, ey); ctx.lineTo(W, ey + world.exit.h); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(W + 3, ey + world.exit.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#c5f56a'; ctx.font = `${11 / scale}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('ВЫХОД', 0, 0); ctx.restore();
  for (const b of world.obstacles) {
    ctx.fillStyle = '#00000035'; ctx.fillRect(b.x + .6, b.y + .8, b.w, b.h);
    ctx.fillStyle = b.type === 'danger' ? '#493632' : '#2a3b49'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.type === 'danger' ? '#d38e73' : '#617382'; ctx.lineWidth = .22; ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (b.type === 'danger') { ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip(); ctx.strokeStyle = '#ad72554d'; for (let x = b.x - b.h; x < b.x + b.w; x += 1.7) { ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x + b.h, b.y + b.h); ctx.stroke(); } ctx.restore(); }
  }
  if (options.trail && fly.trail.length > 1) {
    ctx.strokeStyle = '#c5f56a70'; ctx.lineWidth = .22; ctx.beginPath(); fly.trail.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke();
  }
  ctx.strokeStyle = '#8c9aa66b'; ctx.lineWidth = .18; ctx.beginPath(); ctx.arc(10, 34, 1.5, 0, Math.PI * 2); ctx.stroke();
  if (options.rays) {
    for (const r of sensors.rays) {
      ctx.strokeStyle = r.type === 'danger' ? '#ef9d7175' : r.type === 'exit' ? '#c5f56a88' : r.type === 'empty' ? '#77cfeb18' : '#77cfeb60';
      ctx.lineWidth = .12; ctx.beginPath(); ctx.moveTo(fly.x, fly.y); ctx.lineTo(r.x, r.y); ctx.stroke();
      if (r.type !== 'empty') { ctx.fillStyle = r.type === 'danger' ? '#f0aa82' : '#8ad6e9'; ctx.beginPath(); ctx.arc(r.x, r.y, .25, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // A schematic agent glyph: heading, six articulated legs, body and wings.
  ctx.save(); ctx.translate(fly.x, fly.y); ctx.rotate(fly.heading);
  ctx.strokeStyle = '#dcebb5'; ctx.lineWidth = .17;
  const gait = Math.sin(fly.distance * 7) * .3;
  for (let side of [-1, 1]) for (let i = 0; i < 3; i++) { const x = .7 - i * .65; ctx.beginPath(); ctx.moveTo(x, side * .3); ctx.lineTo(x - .35 + gait * (i === 1 ? -1 : 1), side * .9); ctx.lineTo(x + (i === 0 ? .6 : -.8), side * 1.35); ctx.stroke(); }
  ctx.fillStyle = '#d7e8b94a'; ctx.strokeStyle = '#dae7c975';
  for (const side of [-1,1]) { ctx.beginPath(); ctx.ellipse(-.5, side * .6, 1.1, .4, side * -.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#c5f56a'; ctx.beginPath(); ctx.ellipse(-.35, 0, .9, .4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0f8d9'; ctx.beginPath(); ctx.ellipse(.5, 0, .45, .48, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17221d'; for (let s of [-1, 1]) { ctx.beginPath(); ctx.arc(.7, s * .3, .12, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore(); ctx.restore();
  ctx.fillStyle = '#718695'; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
  ctx.fillText('0', ox - 13, oy + 4); ctx.fillText('100 mm', ox + scale * W - 44, oy + scale * H + 23);
  ctx.strokeStyle = '#718695'; ctx.beginPath(); ctx.moveTo(ox, oy + H * scale + 18); ctx.lineTo(ox + scale * 10, oy + H * scale + 18); ctx.stroke();
  ctx.fillText('10 mm', ox, oy + H * scale + 32);
}
export function drawBrain(canvas, points, firing) {
  const ctx = canvas.getContext('2d'), w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== w*dpr || canvas.height !== h*dpr) { canvas.width = w*dpr; canvas.height = h*dpr; }
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  if (!points.length) { ctx.fillStyle='#778a9a';ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillText('Анатомия появится после загрузки',w/2,h/2);return; }
  for (const p of points) {
    const [x,y,z] = p.position;
    const px = (x - 43000) / 43000 * w * .43 + w / 2, py = (z - 32000) / 45000 * h * .7 + h * .4;
    if (px < 0 || px > w || py < 0 || py > h) continue;
    const active = firing.has(p.index); ctx.fillStyle = active ? '#d1fa7b' : '#57718588';
    ctx.fillRect(px, py, active ? 2 : 1, active ? 2 : 1);
  }
}
