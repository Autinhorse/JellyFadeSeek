// 游戏逻辑：不依赖渲染。可见度和发现判定都在这里，将来可以搬到服务器端。
import { CONFIG as C } from './config.js';

const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// 线段与盒子相交，返回 t(0..1) 和命中的轴，没有则返回 null
export function segBox(ox, oy, oz, ex, ey, ez, b) {
  let t0 = 0, t1 = 1, axis = -1, sign = 0;
  const o = [ox, oy, oz], d = [ex - ox, ey - oy, ez - oz], lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
    let a = (lo[i] - o[i]) / d[i], c = (hi[i] - o[i]) / d[i], s = -1;
    if (a > c) { const tmp = a; a = c; c = tmp; s = 1; }
    if (a > t0) { t0 = a; axis = i; sign = s; }
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  return { t: t0, axis, sign };
}

// —— 寻路网格 ——
export class Nav {
  constructor(world, cell = 0.25, inflate = 0.3) {
    this.cell = cell; this.nx = Math.ceil(world.size.x / cell); this.nz = Math.ceil(world.size.z / cell);
    this.blocked = new Uint8Array(this.nx * this.nz);
    for (const b of world.boxes) {
      if (!b.hunterBlock || b.y0 >= 1.5 || b.y1 <= 0.3) continue;
      const i0 = Math.max(0, Math.floor((b.x0 - inflate) / cell)), i1 = Math.min(this.nx - 1, Math.floor((b.x1 + inflate) / cell));
      const j0 = Math.max(0, Math.floor((b.z0 - inflate) / cell)), j1 = Math.min(this.nz - 1, Math.floor((b.z1 + inflate) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * cell, cz = (j + 0.5) * cell;
        if (cx > b.x0 - inflate && cx < b.x1 + inflate && cz > b.z0 - inflate && cz < b.z1 + inflate) this.blocked[j * this.nx + i] = 1;
      }
    }
    // 地图边界
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) if (i < 2 || j < 2 || i >= this.nx - 2 || j >= this.nz - 2) this.blocked[j * this.nx + i] = 1;
    this.g = new Float32Array(this.nx * this.nz); this.from = new Int32Array(this.nx * this.nz); this.mark = new Uint32Array(this.nx * this.nz); this.stamp = 0;
  }
  idx(x, z) { return clamp(Math.floor(z / this.cell), 0, this.nz - 1) * this.nx + clamp(Math.floor(x / this.cell), 0, this.nx - 1); }
  isFree(x, z) { return !this.blocked[this.idx(x, z)]; }
  // 最近的可走格子
  nearestFree(x, z) {
    const start = this.idx(x, z); if (!this.blocked[start]) return start;
    const ci = start % this.nx, cj = (start / this.nx) | 0;
    for (let r = 1; r < 40; r++) {
      let best = -1, bd = 1e9;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const k = j * this.nx + i; if (this.blocked[k]) continue;
        const d = (i - ci) * (i - ci) + (j - cj) * (j - cj); if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return start;
  }
  lineFree(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; if (this.blocked[this.idx(lerp(x0, x1, t), lerp(z0, z1, t))]) return false; }
    return true;
  }
  // A* 寻路，返回平滑后的路径点 [{x,z}]，找不到返回 null
  path(sx, sz, tx, tz) {
    const s = this.nearestFree(sx, sz), t = this.nearestFree(tx, tz), nx = this.nx;
    if (s === t) return this.isFree(tx, tz) ? [{ x: tx, z: tz }] : [];
    const stamp = ++this.stamp, g = this.g, from = this.from, mark = this.mark;
    const ti = t % nx, tj = (t / nx) | 0;
    const h = (k) => { const dx = Math.abs(k % nx - ti), dz = Math.abs(((k / nx) | 0) - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const heap = []; // [f, k]
    const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g[s] = 0; mark[s] = stamp; from[s] = -1; push(h(s), s);
    const closed = new Uint8Array(this.blocked.length);
    let found = false, iter = 0;
    while (heap.length && iter++ < 60000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
      if (k === t) { found = true; break; }
      const i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= this.nz) continue;
        const n = nj * nx + ni; if (this.blocked[n] || closed[n]) continue;
        if (di && dj && (this.blocked[j * nx + ni] || this.blocked[nj * nx + i])) continue;
        const ng = g[k] + (di && dj ? 1.414 : 1);
        if (mark[n] !== stamp || ng < g[n]) { g[n] = ng; mark[n] = stamp; from[n] = k; push(ng + h(n), n); }
      }
    }
    if (!found) return null;
    const pts = []; for (let k = t; k !== -1; k = from[k]) pts.push({ x: (k % nx + 0.5) * this.cell, z: (((k / nx) | 0) + 0.5) * this.cell });
    pts.reverse();
    if (this.isFree(tx, tz)) pts[pts.length - 1] = { x: tx, z: tz };
    // 平滑：尽量走直线
    const out = []; let a = 0;
    while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !this.lineFree(pts[a].x, pts[a].z, pts[b].x, pts[b].z)) b--; out.push(pts[b]); a = b; }
    return out;
  }
}

export const HUNTER_COLORS = [0xff8a3d, 0xc46bff];
// AI 躲藏方会用的藏身点。st: 到位后的姿态；ax/az: 钻进去之前先走到的位置
const HIDE_SPOTS = [
  { x: 11, z: 15.25, st: 'crouch' }, { x: 18, z: 15.95, st: 'crouch' }, { x: 11, z: 14.4, st: 'prone', ax: 11, az: 13.4 }, { x: 9.4, z: 17.4, st: 'walk' },
  { x: 7.3, z: 8.3, st: 'prone', ax: 9.1, az: 8.3 }, { x: 10.3, z: 3.55, st: 'crouch' }, { x: 14.6, z: 4.7, st: 'crouch', ax: 14.6, az: 6.2 }, { x: 15.35, z: 9.2, st: 'crouch' },
  { x: 16.6, z: 6.9, st: 'prone', ax: 16.6, az: 8.0 }, { x: 27.8, z: 5.0, st: 'crouch' }, { x: 24, z: 8.1, st: 'prone', ax: 24, az: 9.5 }, { x: 31, z: 9.45, st: 'crouch' },
  { x: 25.5, z: 14.5, st: 'walk' }, { x: 32.5, z: 16.85, st: 'prone', ax: 32.5, az: 15.8 }, { x: 33.2, z: 13.75, st: 'crouch' },
  { x: 6, z: 24.9, st: 'walk' }, { x: 12.9, z: 23, st: 'walk' }, { x: 19.6, z: 24.9, st: 'prone', ax: 17.9, az: 24.9 }, { x: 7, z: 27.3, st: 'prone', ax: 7, az: 25.6 },
  { x: 36.5, z: 25.6, st: 'crouch', ax: 33.8, az: 26.3 }, { x: 30.5, z: 25.45, st: 'crouch' }, { x: 5, z: 21.9, st: 'walk' }, { x: 31.5, z: 27.85, st: 'walk' },
  { x: 3.1, z: 9.3, st: 'crouch' }, { x: 16, z: 2.4, st: 'crouch' }, { x: 27.9, z: 23.2, st: 'walk' }, { x: 24.7, z: 26.1, st: 'crouch' },
];

export class Game {
  constructor(world, rng = Math.random) {
    this.world = world; this.rng = rng; this.nav = new Nav(world);
    this.solids = world.boxes.filter((b) => b.solid);
    this.occluders = world.boxes.filter((b) => b.occlude);
    this.paintBoxes = world.boxes.filter((b) => b.occlude || b.solid);
    // 真人当猎人时用的碰撞体：矮窗台对猎人是墙
    this.hunterSolids = world.boxes.filter((b) => b.solid || b.hunterBlock).map((b) => (b.map === 'vault' && b.y1 < 1 ? { ...b, y1: 2 } : b));
    this.mode = 'hider';
    this.hideSpots = HIDE_SPOTS.filter((q) => !this.collides(q.x, q.z, C.stances[q.st].height));
    this.events = []; this.reset();
  }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  reset() {
    const w = this.world;
    this.phase = 'menu'; this.time = 0; this.hideLeft = C.hideTime; this.timeLeft = C.roundTime; this.result = null;
    this.score = 0; this.stats = { moved: 0, brushes: 0, escapes: 0, spotted: 0, closest: 99, closestVis: 1, coneTime: 0, shotsDodged: 0 };
    this.player = { x: w.spawn.x, z: w.spawn.z, yaw: w.spawn.yaw, pitch: 0, stance: 'walk', running: false, moving: false, vis: 1, still: 0, noise: 0, vx: 0, vz: 0, floorY: 0, noiseT: 0 };
    this.hunters = [];
    for (let i = 0; i < (this.mode === 'hunter' ? 0 : C.hunterCount); i++) {
      const s = w.hunterSpawns[i % w.hunterSpawns.length];
      this.hunters.push({ id: i, x: s.x + (i >= w.hunterSpawns.length ? 1 : 0), z: s.z, ang: -Math.PI / 2, state: 'wait', detect: 0, ammo: C.ammo, cd: 0, path: null, timer: 0, repath: 0, lost: 0, lastSeen: null, aim: 0, color: HUNTER_COLORS[i % 2], probes: C.probeShots, chased: false, still: true, frac: 0, inCone: false, brushArmed: false, brushCd: 0, pi: i === 0 ? 8 : 0, dir: i === 0 ? 1 : -1, look: 0, lookBase: 0, speed: 0, hop: 0, dist: 99 });
    }
    this.shots = []; this.pendingPaintOut = false;
    if (this.mode === 'hunter') { this.hideLeft = 10; this.me = { x: 20, z: 28.4, yaw: 0, pitch: 0, ammo: C.ammo, cd: 0, moving: false, running: false, fired: 0 }; this.bot = { state: 'go', spot: null, path: null, wait: 0, freeze: 0, freezeCd: 0, flee: false, stuck: 0, lx: 0, lz: 0 }; this.botPick(false); } this.camp = { x: this.player.x, z: this.player.z, t: 0 };
  }
  start(mode) { if (mode) this.mode = mode; this.reset(); this.phase = 'hide'; this.emit('start'); }

  // —— 躲藏方 ——
  stanceCfg() { const p = this.player; return C.stances[p.stance === 'walk' && p.running && p.moving ? 'run' : p.stance]; }
  height(st = this.player.stance) { return C.stances[st].height; }
  floorAt(x, z) { let h = 0; for (const s of this.world.steps) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) h = Math.max(h, s.h); return h; }
  collides(x, z, height, r = C.playerRadius) {
    for (const b of this.solids) {
      if (b.y0 >= height - 0.02 || b.y1 <= 0.4) continue;
      const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r - 1e-6) return true;
    }
    return false;
  }
  resolve(x, z, height, r = C.playerRadius, list = this.solids) {
    for (let it = 0; it < 3; it++) for (const b of list) {
      if (b.y0 >= height - 0.02 || b.y1 <= 0.4) continue;
      const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1); let dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
      else { // 圆心在盒子里：从最近的面推出去
        const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bb = b.z1 - z, m = Math.min(l, rr, t, bb);
        if (m === l) x = b.x0 - r; else if (m === rr) x = b.x1 + r; else if (m === t) z = b.z0 - r; else z = b.z1 + r;
      }
    }
    return [clamp(x, 0.4, this.world.size.x - 0.4), clamp(z, 0.4, this.world.size.z - 0.4)];
  }
  setStance(target) { // 'crouch' / 'prone' 是切换键；再按一次回到站立
    const p = this.player; const next = p.stance === target ? 'walk' : target;
    if (C.stances[next].height > C.stances[p.stance].height && this.collides(p.x, p.z, C.stances[next].height, C.playerRadius - 0.02)) { if (!this._quiet) this.emit('bump'); return false; }
    p.stance = next; p.vis = Math.min(1, p.vis + C.stancePenalty); p.still = Math.min(p.still, C.fadeDelay * 0.5); if (!this._quiet) this.emit('stance', { stance: next }); return true;
  }
  updatePlayer(dt, inp) {
    const p = this.player; p.yaw = inp.yaw; p.pitch = inp.pitch || 0; p.running = !!inp.run && p.stance === 'walk';
    let f = inp.f || 0, s = inp.s || 0; const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    const want = len > 0.05; const cfg = C.stances[p.stance === 'walk' && p.running && want ? 'run' : p.stance];
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const ox = p.x, oz = p.z;
    if (want) { const [nx, nz] = this.resolve(p.x + (fx * f + rx * s) * cfg.speed * dt, p.z + (fz * f + rz * s) * cfg.speed * dt, C.stances[p.stance].height); p.x = nx; p.z = nz; }
    const moved = Math.hypot(p.x - ox, p.z - oz); p.vx = (p.x - ox) / dt; p.vz = (p.z - oz) / dt;
    p.moving = moved > cfg.speed * dt * 0.2 && want; p.floorY = lerp(p.floorY, this.floorAt(p.x, p.z), Math.min(1, dt * 12));
    this.stats.moved += moved;
    // 可见度
    if (p.moving) {
      p.still = 0; const tgt = cfg.visTarget;
      if (p.vis < tgt) p.vis = Math.min(tgt, p.vis + cfg.rise * dt); else p.vis = Math.max(tgt, p.vis - (1 - C.visFloor) / C.fadeTime * 0.6 * dt);
      p.noise = cfg.noise;
    } else {
      p.still += dt; p.noise = 0;
      if (p.still > C.fadeDelay && p.vis > C.visFloor) {
        const span = 1 - C.visFloor, u = (p.vis - C.visFloor) / span; // 先快后慢，总时长 = fadeTime
        p.vis = Math.max(C.visFloor, p.vis - span / C.fadeTime * 1.155 * (0.4 + 1.2 * u) * dt);
      }
    }
    // 噪音
    p.noiseT -= dt;
    if (p.noise > 0 && p.noiseT <= 0 && this.phase === 'seek') {
      p.noiseT = 0.4;
      for (const h of this.hunters) {
        if (h.state !== 'patrol' && h.state !== 'investigate' && h.state !== 'search') continue;
        const d = Math.hypot(h.x - p.x, h.z - p.z); const blockedBy = this.los(h.x, 1.2, h.z, p.x, 1.2, p.z) ? 1 : 0.55;
        if (d < p.noise * blockedBy) { const a = this.rng() * TAU, r = this.rng() * C.noiseError * Math.min(1, d / 6); this.investigate(h, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 'noise'); }
      }
    }
  }

  // —— 视线 ——
  los(ax, ay, az, bx, by, bz) { for (const b of this.occluders) if (segBox(ax, ay, az, bx, by, bz, b)) return false; return true; }
  bodyPoints() { const p = this.player, h = this.height(), y = p.floorY; return [[p.x, y + h - 0.08, p.z], [p.x, y + h * 0.5, p.z], [p.x, y + 0.08, p.z]]; }
  // 水平方向的射线距离（小地图视野锥用）
  rayDist(x, y, z, ang, max) {
    const ex = x + Math.cos(ang) * max, ez = z + Math.sin(ang) * max; let t = 1;
    for (const b of this.occluders) { if (b.y0 > y || b.y1 < y) continue; const r = segBox(x, y, z, ex, y, ez, b); if (r && r.t < t) t = r.t; }
    return t * max;
  }

  // —— 猎人 ——
  goTo(h, x, z) { h.path = this.nav.path(h.x, h.z, x, z); h.repath = 0.3; return !!h.path; }
  investigate(h, x, z, why) { if (h.state === 'chase' || h.state === 'wait' || h.state === 'empty') return; h.state = 'investigate'; h.thorough = why === 'camp'; h.timer = C.investigateLookTime; h.arrived = false; this.goTo(h, x, z); this.emit('investigate', { id: h.id, why }); }
  nextPatrol(h) { const n = this.world.patrol.length; h.pi = (h.pi + h.dir + n) % n; const t = this.world.patrol[h.pi]; h.state = 'patrol'; h.arrived = false; h.timer = C.lookAroundTime; if (!this.goTo(h, t.x, t.z)) h.path = []; }
  fire(h, tx, ty, tz, probe) {
    if (h.ammo <= 0) return; h.ammo--; h.cd = C.fireCooldown;
    const ox = h.x + Math.cos(h.ang) * 0.45, oz = h.z + Math.sin(h.ang) * 0.45, oy = h.bend ? 0.45 : 1.05;
    const dx = tx - ox, dz = tz - oz, d = Math.max(0.5, Math.hypot(dx, dz)), t = d / C.paintSpeed;
    this.shots.push({ x: ox, y: oy, z: oz, vx: dx / d * C.paintSpeed, vz: dz / d * C.paintSpeed, vy: (ty - oy) / t + 0.5 * C.paintGravity * t, color: h.color, owner: h.id, life: 4, near: false });
    this.emit('fire', { id: h.id, x: ox, y: oy, z: oz, probe: !!probe, ammo: h.ammo });
    if (this.hunters.every((q) => q.ammo <= 0)) this.pendingPaintOut = true;
  }
  updateHunter(h, dt) {
    const p = this.player, seek = this.phase === 'seek'; h.cd -= dt; h.brushCd -= dt;
    const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz); h.dist = d;
    const toP = Math.atan2(dz, dx), fov = (C.fovDeg * Math.PI / 180) * (h.state === 'chase' ? 0.75 : 0.5);
    h.inCone = d < C.viewDist && Math.abs(angDiff(toP, h.ang)) < fov;
    let frac = 0;
    if (seek && h.state !== 'wait' && (h.inCone || d < 1.0)) { const eye = h.bend ? 0.55 : C.hunterEye; for (const q of this.bodyPoints()) if (this.los(h.x, eye, h.z, q[0], q[1], q[2])) frac++; frac /= 3; }
    h.frac = frac;
    if (!seek || h.state === 'wait') { h.speed = 0; h.hop += dt * 2; return; }
    // 发现值
    if (frac > 0 && h.state !== 'empty') {
      const v = Math.max(p.vis, d < (h.bend ? C.closeRevealDist * 2 : C.closeRevealDist) ? C.closeRevealVis : 0), eff = Math.pow(v, C.visPower || 2);
      const df = d <= 3 ? 1 : lerp(1, 0.2, clamp((d - 3) / (C.viewDist - 3), 0, 1));
      h.detect = Math.min(1, h.detect + eff * df * C.detectGain * (h.still ? C.stillLookBonus : 1) * (0.4 + 0.6 * frac) * dt);
    } else h.detect = Math.max(0, h.detect - C.detectDecay * dt);
    // 统计与计分
    if (d < this.stats.closest && h.state !== 'chase') { this.stats.closest = d; this.stats.closestVis = p.vis; }
    if (h.state !== 'chase' && h.state !== 'empty') {
      if (frac > 0 && d < C.scoreInConeDist) { this.addScore(C.scoreInCone * dt); this.stats.coneTime += dt; h.coneNow = true; } else h.coneNow = false;
      if (d < C.brushDist && h.brushCd <= 0) h.brushArmed = true;
      if (h.brushArmed && d > C.brushDist + 1.5) { h.brushArmed = false; h.brushCd = 6; this.stats.brushes++; this.addScore(C.scoreBrush, '擦肩而过'); this.emit('brush', { id: h.id }); }
    } else { h.brushArmed = false; h.coneNow = false; }

    if (h.state !== 'chase' && h.state !== 'empty' && h.detect >= 1) { h.state = 'chase'; h.aim = 0; h.lost = 0; h.chased = true; h.lastSeen = { x: p.x, z: p.z }; h.repath = 0; this.stats.spotted++; this.emit('spotted', { id: h.id }); }

    let speed = 0, face = null;
    if (h.state === 'chase') {
      const contact = frac > 0 && (p.vis > 0.3 || d < C.closeRevealDist + 1);
      h.bend = p.stance === 'prone' && d < 6; // 目标趴着时，猎人蹲下来瞄
      if (contact) { h.lastSeen = { x: p.x, z: p.z }; h.lost = 0; h.detect = 1; face = toP; }
      else { h.lost += dt; if (h.lost >= C.loseSightTime) { h.state = 'search'; h.timer = C.searchTime; h.arrived = false; h.look = 0; this.goTo(h, h.lastSeen.x, h.lastSeen.z); this.emit('lost', { id: h.id }); } }
      if (h.state === 'chase') {
        h.repath -= dt; if (h.repath <= 0) this.goTo(h, h.lastSeen.x, h.lastSeen.z);
        speed = contact && d < 3.2 ? 0 : C.hunterChaseSpeed;
        if (contact && d < C.fireRange && h.ammo > 0) {
          h.aim += dt;
          if (h.aim >= C.aimDelay && h.cd <= 0 && Math.abs(angDiff(toP, h.ang)) < 0.35) {
            const t = d / C.paintSpeed, a = this.rng() * TAU, r = Math.sqrt(this.rng()) * C.aimError * clamp(d / 6, 0.5, 1.6);
            this.fire(h, p.x + p.vx * t * 0.85 + Math.cos(a) * r, p.floorY + this.height() * 0.55 + (this.rng() - 0.5) * 0.3, p.z + p.vz * t * 0.85 + Math.sin(a) * r);
          }
        } else h.aim = 0;
        if (h.ammo <= 0) { h.state = 'empty'; h.path = null; this.emit('empty', { id: h.id }); }
      }
    } else if (h.state === 'search') {
      h.timer -= dt; speed = C.hunterPatrolSpeed * 1.15;
      if (!h.path || !h.path.length) {
        h.look += dt; speed = 0; face = h.lookBase + Math.sin(h.look * 2.6) * 1.5;
        if (h.look > 1.3) {
          h.look = 0;
          if (h.probes > 0 && h.ammo > 3 && h.cd <= 0 && this.rng() < 0.45 && h.lastSeen) { // 对可疑位置试探性开一枪
            h.probes--; const a = this.rng() * TAU, r = 1 + this.rng() * 3; const tx = h.lastSeen.x + Math.cos(a) * r, tz = h.lastSeen.z + Math.sin(a) * r;
            h.ang = Math.atan2(tz - h.z, tx - h.x); this.fire(h, tx, 0.5, tz, true);
          }
          for (let k = 0; k < 6; k++) { const a = this.rng() * TAU, r = 1.5 + this.rng() * (C.searchRadius - 1.5); const tx = h.lastSeen.x + Math.cos(a) * r, tz = h.lastSeen.z + Math.sin(a) * r; if (tx > 1 && tz > 1 && tx < 39 && tz < 29 && this.nav.isFree(tx, tz) && this.goTo(h, tx, tz)) break; }
        }
      } else h.lookBase = h.ang;
      if (h.timer <= 0) { if (h.chased) { h.chased = false; this.stats.escapes++; this.addScore(C.scoreEscape, '甩掉猎人'); this.emit('escaped', { id: h.id }); } this.nextPatrol(h); }
    } else if (h.state === 'investigate' || h.state === 'patrol') {
      speed = C.hunterPatrolSpeed * (h.state === 'investigate' ? 1.2 : 1);
      if (!h.path || !h.path.length) {
        if (!h.arrived) { h.arrived = true; h.lookBase = h.ang; h.look = 0; }
        h.bend = h.state === 'investigate' && h.thorough; // 防挂机提示：弯腰仔细找
        h.look += dt; speed = 0; h.timer -= dt; face = h.lookBase + Math.sin(h.look * (TAU / (h.state === 'patrol' ? C.lookAroundTime : C.investigateLookTime * 0.67))) * 1.7;
        if (h.timer <= 0) this.nextPatrol(h);
      }
    }
    if (h.state !== 'chase' && (h.state !== 'investigate' || (h.path && h.path.length))) h.bend = false;
    // 移动
    h.still = true;
    if (speed > 0 && h.path && h.path.length) {
      let step = speed * dt;
      while (step > 0 && h.path.length) {
        const t = h.path[0], ddx = t.x - h.x, ddz = t.z - h.z, dd = Math.hypot(ddx, ddz);
        if (dd <= step) { h.x = t.x; h.z = t.z; step -= dd; h.path.shift(); }
        else { h.x += ddx / dd * step; h.z += ddz / dd * step; if (face === null) face = Math.atan2(ddz, ddx); step = 0; }
      }
      h.still = false; h.hop += dt * speed * 2.2;
    }
    h.speed = h.still ? 0 : speed;
    if (face !== null) h.ang += clamp(angDiff(face, h.ang), -7 * dt, 7 * dt);
  }
  addScore(v, label) { this.score += v; if (label) this.emit('score', { v, label }); }

  // —— 颜料弹 ——
  updateShots(dt) {
    const p = this.player, ph = this.height();
    for (const s of this.shots) {
      let left = dt;
      while (left > 0 && !s.dead) {
        const st = Math.min(left, 1 / 240); left -= st;
        const nx = s.x + s.vx * st, ny = s.y + s.vy * st, nz = s.z + s.vz * st; s.vy -= C.paintGravity * st;
        // 命中躲藏方？
        const pd = Math.hypot(nx - p.x, nz - p.z);
        if (pd < 1.2) s.near = true;
        if (pd < C.playerRadius + 0.14 && ny > p.floorY - 0.05 && ny < p.floorY + ph + 0.12 && this.phase === 'seek' && !C.invincible) {
          s.dead = true; this.emit('splat', { x: nx, y: ny, z: nz, nx: 0, ny: 1, nz: 0, color: s.color, onPlayer: true }); this.caught(s); break;
        }
        let best = null;
        for (const b of this.paintBoxes) { const r = segBox(s.x, s.y, s.z, nx, ny, nz, b); if (r && r.axis >= 0 && (!best || r.t < best.t)) best = r; }
        if (best) {
          const n = [0, 0, 0]; n[best.axis] = best.sign; s.dead = true;
          this.emit('splat', { x: lerp(s.x, nx, best.t), y: lerp(s.y, ny, best.t), z: lerp(s.z, nz, best.t), nx: n[0], ny: n[1], nz: n[2], color: s.color });
        } else if (ny <= 0.02) { s.dead = true; this.emit('splat', { x: nx, y: 0.02, z: nz, nx: 0, ny: 1, nz: 0, color: s.color }); }
        s.x = nx; s.y = ny; s.z = nz;
      }
      s.life -= dt; if (s.life <= 0 || s.x < -5 || s.z < -5 || s.x > 45 || s.z > 35) s.dead = true;
      if (s.dead && s.near && this.phase === 'seek') { this.stats.shotsDodged++; this.emit('dodged'); }
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }
  caught(s) { this.phase = 'over'; this.result = this.mode === 'hunter' ? 'found' : 'caught'; this.caughtColor = s.color; this.player.vis = 1; this.emit('caught', { color: s.color, id: s.owner }); }
  lose(why) { this.phase = 'over'; this.result = why; this.emit('hunterLose', { why }); }

  // —— 真人当猎人 ——
  updateMe(dt, inp) {
    const m = this.me; m.yaw = inp.yaw; m.pitch = inp.pitch || 0; m.cd -= dt;
    if (this.phase !== 'seek') { m.moving = false; return; }
    let f = inp.f || 0, s = inp.s || 0; const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    m.running = !!inp.run; const sp = m.running ? C.hunterChaseSpeed : C.hunterPatrolSpeed, ox = m.x, oz = m.z;
    const fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw), rx = Math.cos(m.yaw), rz = -Math.sin(m.yaw);
    if (len > 0.05) { const [nx, nz] = this.resolve(m.x + (fx * f + rx * s) * sp * dt, m.z + (fz * f + rz * s) * sp * dt, 1.6, 0.35, this.hunterSolids); m.x = nx; m.z = nz; }
    m.moving = Math.hypot(m.x - ox, m.z - oz) > sp * dt * 0.2;
    if (inp.fire && m.cd <= 0 && m.ammo > 0) {
      m.ammo--; m.cd = C.fireCooldown * 0.6; m.fired++; const cp = Math.cos(m.pitch), dx = fx * cp, dy = Math.sin(m.pitch), dz = fz * cp;
      const ox2 = m.x + dx * 0.4 + rx * 0.18, oy = C.hunterEye - 0.16 + dy * 0.4, oz2 = m.z + dz * 0.4 + rz * 0.18;
      this.shots.push({ x: ox2, y: oy, z: oz2, vx: dx * C.paintSpeed, vy: dy * C.paintSpeed + 0.6, vz: dz * C.paintSpeed, color: HUNTER_COLORS[0], owner: -1, life: 4, near: false });
      this.emit('fire', { id: -1, x: ox2, y: oy, z: oz2, ammo: m.ammo });
    }
  }
  // —— AI 躲藏方（只在“当猎人”模式用）：找地方躲、定时换位置、被看到会僵住或逃跑 ——
  botPick(away) {
    const b = this.bot, p = this.player, m = this.me; let best = null, bs = -1e9;
    for (const q of this.hideSpots) {
      if (q === b.spot) continue; const dp = Math.hypot(q.x - p.x, q.z - p.z), dm = Math.hypot(q.x - m.x, q.z - m.z);
      let sc = this.rng() * 8 - dp * (away ? 0.15 : 0.25) + Math.min(dm, 14) * (away ? 0.9 : 0.3);
      if (this.phase === 'seek' && this.los(m.x, C.hunterEye, m.z, q.x, 0.6, q.z)) sc -= 6;
      if (sc > bs) { bs = sc; best = q; }
    }
    b.spot = best; b.state = 'go'; b.flee = away; b.stuck = 0;
    const tx = best.ax ?? best.x, tz = best.az ?? best.z; b.path = this.nav.path(p.x, p.z, tx, tz) || [];
    if (best.ax !== undefined || !this.nav.isFree(best.x, best.z)) b.path.push({ x: best.x, z: best.z, last: true }); else if (b.path.length) b.path[b.path.length - 1].last = true;
  }
  botStance(t) { const p = this.player; this._quiet = true; if (p.stance !== t) this.setStance(t === 'walk' ? p.stance : t); this._quiet = false; }
  botInput(dt) {
    const b = this.bot, p = this.player, m = this.me, seek = this.phase === 'seek'; b.freezeCd -= dt;
    const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz), mAng = Math.atan2(-Math.cos(m.yaw), -Math.sin(m.yaw));
    const seen = seek && d < 26 && Math.abs(angDiff(Math.atan2(dz, dx), mAng)) < 0.95 && this.los(m.x, C.hunterEye, m.z, p.x, p.floorY + this.height() * 0.6, p.z);
    b.seen = seen;
    if (b.state === 'hidden') {
      b.wait -= dt;
      if (seen && ((d < 5 && p.vis > 0.3) || d < 2.6)) { this.botStance('walk'); this.botPick(true); }
      else if (b.wait <= 0 && !seen && d > 5) this.botPick(false);
      return { f: 0, yaw: p.yaw };
    }
    if (!b.path || !b.path.length) { this.botStance(b.spot.st); b.state = 'hidden'; b.flee = false; b.wait = 9 + this.rng() * 16; return { f: 0, yaw: p.yaw }; }
    // 被远远看到：先僵住不动，赌自己变透明
    if (seen && d > 8 && b.freezeCd <= 0 && !b.flee && b.freeze <= 0) { b.freeze = 2.5 + this.rng() * 2.5; b.freezeCd = 9; }
    if (b.freeze > 0) { b.freeze -= dt; if (seen && d < 6.5) { b.freeze = 0; b.flee = true; } else return { f: 0, yaw: p.yaw }; }
    if (seen && d < 7) b.flee = true;
    const t = b.path[0], tx = t.x - p.x, tz = t.z - p.z, td = Math.hypot(tx, tz);
    if (td < 0.18) { b.path.shift(); return { f: 0, yaw: p.yaw }; }
    if (t.last && td < 2.2 && b.spot.st !== 'walk') this.botStance(b.spot.st); else if (b.flee || (seen && d < 12)) this.botStance('walk'); else this.botStance(d < 14 && !t.last ? 'crouch' : 'walk');
    // 卡住了就换个目标
    if (Math.hypot(p.x - b.lx, p.z - b.lz) < 0.02 * dt * 60) { b.stuck += dt; if (b.stuck > 1.2) { this.botStance('walk'); this.botPick(b.flee); } } else b.stuck = 0; b.lx = p.x; b.lz = p.z;
    return { f: 1, s: 0, run: (b.flee || (seen && d < 12)) && p.stance === 'walk', yaw: Math.atan2(-tx, -tz) };
  }
  win(why) { this.phase = 'over'; this.result = why; this.addScore(C.scoreSurvive); this.emit('win', { why }); }

  update(dt, inp) {
    if (this.phase === 'menu' || this.phase === 'over') { if (this.phase === 'over') this.updateShots(dt); return; }
    dt = Math.min(dt, 0.05); this.time += dt;
    if (this.mode === 'hunter') { this.updatePlayer(dt, this.botInput(dt)); this.updateMe(dt, inp); } else this.updatePlayer(dt, inp);
    if (this.phase === 'hide') {
      this.hideLeft -= dt;
      if (this.hideLeft <= 0) { this.phase = 'seek'; for (const h of this.hunters) this.nextPatrol(h); this.emit('seek'); }
    } else {
      this.timeLeft -= dt; this.addScore(C.scorePerSecond * dt);
      // 防挂机
      const c = this.camp, p = this.player;
      if (Math.hypot(p.x - c.x, p.z - c.z) > C.campDist) { c.x = p.x; c.z = p.z; c.t = 0; c.level = 0; }
      else { c.t += dt; if (c.t >= C.campTime) { c.t = 0; c.level = (c.level || 0) + 1; const a = this.rng() * TAU, r = this.rng() * C.campHintRadius * [0.6, 0.25, 0.08][Math.min(2, c.level - 1)]; let best = null; for (const h of this.hunters) if ((h.state === 'patrol' || h.state === 'investigate') && (!best || h.dist < best.dist)) best = h; if (best) { this.investigate(best, clamp(p.x + Math.cos(a) * r, 1, 39), clamp(p.z + Math.sin(a) * r, 1, 29), 'camp'); this.emit('campHint', { level: c.level }); } } }
    }
    for (const h of this.hunters) this.updateHunter(h, dt);
    this.updateShots(dt);
    if (this.phase === 'seek') {
      if (this.mode === 'hunter') { if (this.timeLeft <= 0) this.lose('timeout'); else if (this.me.ammo <= 0 && this.shots.length === 0) this.lose('noammo'); }
      else if (this.timeLeft <= 0) this.win('survived');
      else if (this.pendingPaintOut && this.shots.length === 0) this.win('paintout');
    }
  }
}
