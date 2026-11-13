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
// 猎人的颜料颜色，按编号轮流用
export const HUNTER_COLORS = [0xff8a3d, 0xc46bff, 0x3fb6ff, 0xff5f9e];
export const MAX_HIDERS = 6, MAX_HUNTERS = 3;
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

// 视线方向角（世界 xz 平面，atan2(dz, dx)）和第一人称 yaw 的换算
export const angOfYaw = (yaw) => Math.atan2(-Math.cos(yaw), -Math.sin(yaw));

// 一局的阵容。role 是本机真人的身份（'hider' / 'hunter' / 'none'），真人总在各自队伍的 0 号位
export function lineup(role, hunters, hiders) {
  hunters = clamp(hunters | 0, 1, MAX_HUNTERS); hiders = clamp(hiders | 0, 1, MAX_HIDERS);
  return {
    hiders: Array.from({ length: hiders }, (_, i) => ({ ctrl: role === 'hider' && i === 0 ? 'human' : 'ai' })),
    hunters: Array.from({ length: hunters }, (_, i) => ({ ctrl: role === 'hunter' && i === 0 ? 'human' : 'ai' })),
  };
}

export class Game {
  constructor(world, rng = Math.random) {
    this.world = world; this.rng = rng; this.nav = new Nav(world);
    this.solids = world.boxes.filter((b) => b.solid);
    this.occluders = world.boxes.filter((b) => b.occlude);
    this.paintBoxes = world.boxes.filter((b) => b.occlude || b.solid);
    // 真人当猎人时用的碰撞体：矮窗台对猎人是墙
    this.hunterSolids = world.boxes.filter((b) => b.solid || b.hunterBlock).map((b) => (b.map === 'vault' && b.y1 < 1 ? { ...b, y1: 2 } : b));
    this.hideSpots = HIDE_SPOTS.filter((q) => !this.collides(q.x, q.z, C.stances[q.st].height));
    // 躲藏方出生点：在地图出生点周围散开，避开家具
    const s = world.spawn; this.hiderSpawns = [];
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const x = s.x + dx * 0.9, z = s.z + dz * 0.9; if (!this.collides(x, z, C.stances.walk.height)) this.hiderSpawns.push({ x, z });
    }
    this.setup = lineup('hider', C.hunterCount, 1);
    this.events = []; this.reset();
  }
  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // —— 开局 ——
  newHider(i, s) {
    const w = this.world, sp = this.hiderSpawns[i % this.hiderSpawns.length];
    return {
      id: i, key: 'h' + i, kind: 'hider', ctrl: s.ctrl, name: s.name || '',
      x: sp.x, z: sp.z, yaw: w.spawn.yaw, pitch: 0, stance: 'walk', running: false, moving: false, vis: 1, still: 0, noise: 0, vx: 0, vz: 0, floorY: 0, noiseT: 0,
      caught: false, caughtColor: null, score: 0,
      stats: { moved: 0, brushes: 0, escapes: 0, spotted: 0, closest: 99, closestVis: 1, coneTime: 0, shotsDodged: 0, survived: 0 },
      camp: { x: sp.x, z: sp.z, t: 0, level: 0 },
      bot: s.ctrl === 'ai' ? { state: 'go', spot: null, path: null, wait: 0, freeze: 0, freezeCd: 0, flee: false, stuck: 0, lx: 0, lz: 0, seen: false } : null,
    };
  }
  newHunter(i, s, nHiders) {
    const sp = this.world.hunterSpawns[i % this.world.hunterSpawns.length], x = sp.x, z = sp.z - 1.1 * Math.floor(i / this.world.hunterSpawns.length);
    return {
      id: i, key: 'k' + i, kind: 'hunter', ctrl: s.ctrl, name: s.name || '', color: HUNTER_COLORS[i % HUNTER_COLORS.length],
      x, z, ang: -Math.PI / 2, yaw: 0, pitch: 0, state: 'wait', ammo: C.ammo, cd: 0, fired: 0, moving: false, running: false,
      // 对每个躲藏方：发现值、视线比例、距离、擦肩而过的状态
      det: new Array(nHiders).fill(0), frac: new Array(nHiders).fill(0), dd: new Array(nHiders).fill(99), brush: Array.from({ length: nHiders }, () => ({ armed: false, cd: 0 })),
      detect: 0, target: -1, chasedId: -1, dist: 99,
      path: null, timer: 0, repath: 0, lost: 0, lastSeen: null, aim: 0, probes: C.probeShots, still: true, bend: false,
      pi: [8, 0][i] ?? (i * 5) % this.world.patrol.length, dir: i % 2 === 0 ? 1 : -1, look: 0, lookBase: 0, speed: 0, hop: 0,
    };
  }
  reset() {
    this.phase = 'menu'; this.time = 0; this.timeLeft = C.roundTime; this.result = null; this.why = null;
    this.hiders = this.setup.hiders.map((s, i) => this.newHider(i, s));
    this.hunters = this.setup.hunters.map((s, i) => this.newHunter(i, s, this.hiders.length));
    this.hideLeft = this.hiders.some((q) => q.ctrl === 'human') ? C.hideTime : C.hideTimeBots;
    this.shots = []; this.pendingPaintOut = false;
    for (const q of this.hiders) if (q.bot) this.botPick(q, false);
  }
  // setup：lineup() 的结果；也接受 'hider' / 'hunter'，等于原来的两种单机模式
  start(setup) {
    if (setup === 'hider') setup = lineup('hider', C.hunterCount, 1); else if (setup === 'hunter') setup = lineup('hunter', 1, 1);
    if (setup) this.setup = setup; this.reset(); this.phase = 'hide'; this.emit('start');
  }
  actor(key) { return key[0] === 'h' ? this.hiders[+key.slice(1)] : this.hunters[+key.slice(1)]; }
  firstHuman() { return this.hiders.find((q) => q.ctrl === 'human') || this.hunters.find((h) => h.ctrl === 'human') || null; }
  alive() { return this.hiders.filter((q) => !q.caught); }

  // —— 躲藏方 ——
  stanceCfg(q) { return C.stances[q.stance === 'walk' && q.running && q.moving ? 'run' : q.stance]; }
  height(q) { return C.stances[q.stance].height; }
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
  setStance(q, target) { // 'crouch' / 'prone' 是切换键；再按一次回到站立
    const next = q.stance === target ? 'walk' : target, human = q.ctrl === 'human';
    if (C.stances[next].height > C.stances[q.stance].height && this.collides(q.x, q.z, C.stances[next].height, C.playerRadius - 0.02)) { if (human) this.emit('bump', { hid: q.id }); return false; }
    q.stance = next; q.vis = Math.min(1, q.vis + C.stancePenalty); q.still = Math.min(q.still, C.fadeDelay * 0.5); if (human) this.emit('stance', { hid: q.id, stance: next }); return true;
  }
  // 躲藏方的移动和可见度：只依赖自己的输入，联机时本机预测也用这一段
  stepHider(q, dt, inp) {
    if (inp.stance) { if (inp.stance === 'stand') { if (q.stance !== 'walk') this.setStance(q, q.stance); } else this.setStance(q, inp.stance); }
    q.yaw = inp.yaw ?? q.yaw; q.pitch = inp.pitch || 0; q.running = !!inp.run && q.stance === 'walk';
    let f = inp.f || 0, s = inp.s || 0; const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    const want = len > 0.05; const cfg = C.stances[q.stance === 'walk' && q.running && want ? 'run' : q.stance];
    const fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw), rx = Math.cos(q.yaw), rz = -Math.sin(q.yaw);
    const ox = q.x, oz = q.z;
    if (want) { const [nx, nz] = this.resolve(q.x + (fx * f + rx * s) * cfg.speed * dt, q.z + (fz * f + rz * s) * cfg.speed * dt, C.stances[q.stance].height); q.x = nx; q.z = nz; }
    const moved = Math.hypot(q.x - ox, q.z - oz); q.vx = (q.x - ox) / dt; q.vz = (q.z - oz) / dt;
    q.moving = moved > cfg.speed * dt * 0.2 && want; q.floorY = lerp(q.floorY, this.floorAt(q.x, q.z), Math.min(1, dt * 12));
    q.stats.moved += moved;
    if (q.moving) {
      q.still = 0; const tgt = cfg.visTarget;
      if (q.vis < tgt) q.vis = Math.min(tgt, q.vis + cfg.rise * dt); else q.vis = Math.max(tgt, q.vis - (1 - C.visFloor) / C.fadeTime * 0.6 * dt);
      q.noise = cfg.noise;
    } else {
      q.still += dt; q.noise = 0;
      if (q.still > C.fadeDelay && q.vis > C.visFloor) {
        const span = 1 - C.visFloor, u = (q.vis - C.visFloor) / span; // 先快后慢，总时长 = fadeTime
        q.vis = Math.max(C.visFloor, q.vis - span / C.fadeTime * 1.155 * (0.4 + 1.2 * u) * dt);
      }
    }
  }
  updateHider(q, dt, inp) {
    this.stepHider(q, dt, inp);
    // 噪音：附近的 AI 猎人会过来查看
    q.noiseT -= dt;
    if (q.noise > 0 && q.noiseT <= 0 && this.phase === 'seek') {
      q.noiseT = 0.4;
      for (const h of this.hunters) {
        if (h.ctrl !== 'ai' || (h.state !== 'patrol' && h.state !== 'investigate' && h.state !== 'search')) continue;
        const d = Math.hypot(h.x - q.x, h.z - q.z); const blockedBy = this.los(h.x, 1.2, h.z, q.x, 1.2, q.z) ? 1 : 0.55;
        if (d < q.noise * blockedBy) { const a = this.rng() * TAU, r = this.rng() * C.noiseError * Math.min(1, d / 6); this.investigate(h, q.x + Math.cos(a) * r, q.z + Math.sin(a) * r, 'noise', q.id); }
      }
    }
  }

  // —— 视线 ——
  los(ax, ay, az, bx, by, bz) { for (const b of this.occluders) if (segBox(ax, ay, az, bx, by, bz, b)) return false; return true; }
  bodyPoints(q) { const h = this.height(q), y = q.floorY; return [[q.x, y + h - 0.08, q.z], [q.x, y + h * 0.5, q.z], [q.x, y + 0.08, q.z]]; }
  // 水平方向的射线距离（小地图视野锥用）
  rayDist(x, y, z, ang, max) {
    const ex = x + Math.cos(ang) * max, ez = z + Math.sin(ang) * max; let t = 1;
    for (const b of this.occluders) { if (b.y0 > y || b.y1 < y) continue; const r = segBox(x, y, z, ex, y, ez, b); if (r && r.t < t) t = r.t; }
    return t * max;
  }
  // 猎人对每个躲藏方：距离、能看到身体的比例（0..1）
  sense(h) {
    const seek = this.phase === 'seek', fov = (C.fovDeg * Math.PI / 180) * (h.state === 'chase' ? 0.75 : 0.5); h.dist = 99;
    for (const q of this.hiders) {
      if (q.caught) { h.frac[q.id] = 0; h.dd[q.id] = 99; continue; }
      const dx = q.x - h.x, dz = q.z - h.z, d = Math.hypot(dx, dz); h.dd[q.id] = d; if (d < h.dist) h.dist = d;
      const inCone = d < C.viewDist && Math.abs(angDiff(Math.atan2(dz, dx), h.ang)) < fov;
      let frac = 0;
      if (seek && h.state !== 'wait' && (inCone || d < 1.0)) { const eye = h.bend ? 0.55 : C.hunterEye; for (const p of this.bodyPoints(q)) if (this.los(h.x, eye, h.z, p[0], p[1], p[2])) frac++; frac /= 3; }
      h.frac[q.id] = frac;
    }
  }
  // 计分：在猎人眼皮底下没被发现、擦肩而过（真人和 AI 猎人都算）
  scoreNear(h, dt) {
    for (const q of this.hiders) {
      const b = h.brush[q.id]; b.cd -= dt;
      if (q.caught) { b.armed = false; continue; }
      const d = h.dd[q.id], frac = h.frac[q.id], onMe = h.state === 'chase' && h.target === q.id;
      if (d < q.stats.closest && !onMe) { q.stats.closest = d; q.stats.closestVis = q.vis; }
      if (onMe || h.state === 'empty') { b.armed = false; continue; }
      if (frac > 0 && d < C.scoreInConeDist) { this.addScore(q, C.scoreInCone * dt); q.stats.coneTime += dt; }
      if (d < C.brushDist && b.cd <= 0) b.armed = true;
      if (b.armed && d > C.brushDist + 1.5) { b.armed = false; b.cd = 6; q.stats.brushes++; this.addScore(q, C.scoreBrush, '擦肩而过'); this.emit('brush', { id: h.id, hid: q.id }); }
    }
  }

  // —— AI 猎人 ——
  goTo(h, x, z) { h.path = this.nav.path(h.x, h.z, x, z); h.repath = 0.3; return !!h.path; }
  investigate(h, x, z, why, hid = -1) { if (h.state === 'chase' || h.state === 'wait' || h.state === 'empty') return; h.state = 'investigate'; h.thorough = why === 'camp'; h.timer = C.investigateLookTime; h.arrived = false; this.goTo(h, x, z); this.emit('investigate', { id: h.id, why, hid }); }
  nextPatrol(h) { const n = this.world.patrol.length; h.pi = (h.pi + h.dir + n) % n; const t = this.world.patrol[h.pi]; h.state = 'patrol'; h.arrived = false; h.timer = C.lookAroundTime; if (!this.goTo(h, t.x, t.z)) h.path = []; }
  shoot(h, ox, oy, oz, vx, vy, vz, probe) {
    h.ammo--; h.fired++;
    this.shots.push({ x: ox, y: oy, z: oz, vx, vy, vz, color: h.color, owner: h.id, life: 4, near: [] });
    this.emit('fire', { id: h.id, x: ox, y: oy, z: oz, probe: !!probe, ammo: h.ammo });
    if (this.hunters.every((k) => k.ammo <= 0)) this.pendingPaintOut = true;
  }
  fire(h, tx, ty, tz, probe) {
    if (h.ammo <= 0) return; h.cd = C.fireCooldown;
    const ox = h.x + Math.cos(h.ang) * 0.45, oz = h.z + Math.sin(h.ang) * 0.45, oy = h.bend ? 0.45 : 1.05;
    const dx = tx - ox, dz = tz - oz, d = Math.max(0.5, Math.hypot(dx, dz)), t = d / C.paintSpeed;
    this.shoot(h, ox, oy, oz, dx / d * C.paintSpeed, (ty - oy) / t + 0.5 * C.paintGravity * t, dz / d * C.paintSpeed, probe);
  }
  updateHunter(h, dt) {
    const seek = this.phase === 'seek'; h.cd -= dt;
    this.sense(h);
    if (!seek || h.state === 'wait') { h.speed = 0; h.hop += dt * 2; return; }
    // 发现值
    for (const q of this.hiders) {
      const i = q.id, frac = h.frac[i], d = h.dd[i];
      if (q.caught) { h.det[i] = 0; continue; }
      if (frac > 0 && h.state !== 'empty') {
        const v = Math.max(q.vis, d < (h.bend ? C.closeRevealDist * 2 : C.closeRevealDist) ? C.closeRevealVis : 0), eff = Math.pow(v, C.visPower || 2);
        const df = d <= 3 ? 1 : lerp(1, 0.2, clamp((d - 3) / (C.viewDist - 3), 0, 1));
        h.det[i] = Math.min(1, h.det[i] + eff * df * C.detectGain * (h.still ? C.stillLookBonus : 1) * (0.4 + 0.6 * frac) * dt);
      } else h.det[i] = Math.max(0, h.det[i] - C.detectDecay * dt);
    }
    this.scoreNear(h, dt);
    let top = -1; for (const q of this.hiders) if (!q.caught && (top < 0 || h.det[q.id] > h.det[top])) top = q.id;
    h.detect = top >= 0 ? h.det[top] : 0;
    if (h.state !== 'chase' && h.state !== 'empty' && h.detect >= 1) {
      const q = this.hiders[top]; h.state = 'chase'; h.target = top; h.aim = 0; h.lost = 0; h.chasedId = top; h.lastSeen = { x: q.x, z: q.z }; h.repath = 0; q.stats.spotted++; this.emit('spotted', { id: h.id, hid: top });
    }
    // 追的目标已经被别人喷中：回去巡逻
    if (h.state === 'chase' && this.hiders[h.target].caught) { h.target = -1; h.chasedId = -1; this.nextPatrol(h); }

    let speed = 0, face = null;
    if (h.state === 'chase') {
      const p = this.hiders[h.target], d = h.dd[p.id], frac = h.frac[p.id], toP = Math.atan2(p.z - h.z, p.x - h.x);
      const contact = frac > 0 && (p.vis > 0.3 || d < C.closeRevealDist + 1);
      h.bend = p.stance === 'prone' && d < 6; // 目标趴着时，猎人蹲下来瞄
      if (contact) { h.lastSeen = { x: p.x, z: p.z }; h.lost = 0; h.det[p.id] = h.detect = 1; face = toP; }
      else { h.lost += dt; if (h.lost >= C.loseSightTime) { h.state = 'search'; h.timer = C.searchTime; h.arrived = false; h.look = 0; this.goTo(h, h.lastSeen.x, h.lastSeen.z); this.emit('lost', { id: h.id, hid: p.id }); } }
      if (h.state === 'chase') {
        h.repath -= dt; if (h.repath <= 0) this.goTo(h, h.lastSeen.x, h.lastSeen.z);
        speed = contact && d < 3.2 ? 0 : C.hunterChaseSpeed;
        if (contact && d < C.fireRange && h.ammo > 0) {
          h.aim += dt;
          if (h.aim >= C.aimDelay && h.cd <= 0 && Math.abs(angDiff(toP, h.ang)) < 0.35) {
            const t = d / C.paintSpeed, a = this.rng() * TAU, r = Math.sqrt(this.rng()) * C.aimError * clamp(d / 6, 0.5, 1.6);
            this.fire(h, p.x + p.vx * t * 0.85 + Math.cos(a) * r, p.floorY + this.height(p) * 0.55 + (this.rng() - 0.5) * 0.3, p.z + p.vz * t * 0.85 + Math.sin(a) * r);
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
      if (h.timer <= 0) {
        const q = this.hiders[h.chasedId];
        if (q && !q.caught) { q.stats.escapes++; this.addScore(q, C.scoreEscape, '甩掉猎人'); this.emit('escaped', { id: h.id, hid: q.id }); }
        h.chasedId = -1; h.target = -1; this.nextPatrol(h);
      }
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
    h.speed = h.still ? 0 : speed; h.moving = !h.still;
    if (face !== null) h.ang += clamp(angDiff(face, h.ang), -7 * dt, 7 * dt);
  }
  addScore(q, v, label) { q.score += v; if (label) this.emit('score', { hid: q.id, v, label }); }

  // —— 真人猎人 ——
  // 移动：只依赖自己的输入，联机时本机预测也用这一段
  stepHunter(h, dt, inp) {
    h.yaw = inp.yaw ?? h.yaw; h.pitch = inp.pitch || 0; h.ang = angOfYaw(h.yaw);
    if (this.phase !== 'seek') { h.moving = false; h.speed = 0; return; }
    let f = inp.f || 0, s = inp.s || 0; const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    h.running = !!inp.run; const sp = h.running ? C.hunterChaseSpeed : C.hunterPatrolSpeed, ox = h.x, oz = h.z;
    const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
    if (len > 0.05) { const [nx, nz] = this.resolve(h.x + (fx * f + rx * s) * sp * dt, h.z + (fz * f + rz * s) * sp * dt, 1.6, 0.35, this.hunterSolids); h.x = nx; h.z = nz; }
    h.moving = Math.hypot(h.x - ox, h.z - oz) > sp * dt * 0.2; h.speed = h.moving ? sp : 0; h.hop += dt * h.speed * 2.2;
  }
  updateHumanHunter(h, dt, inp) {
    h.cd -= dt; this.stepHunter(h, dt, inp);
    if (this.phase !== 'seek') return;
    if (h.state === 'wait') h.state = 'human';
    this.sense(h); this.scoreNear(h, dt);
    if (inp.fire && h.cd <= 0 && h.ammo > 0) {
      h.cd = C.fireCooldown * 0.6; const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
      const cp = Math.cos(h.pitch), dx = fx * cp, dy = Math.sin(h.pitch), dz = fz * cp;
      this.shoot(h, h.x + dx * 0.4 + rx * 0.18, C.hunterEye - 0.16 + dy * 0.4, h.z + dz * 0.4 + rz * 0.18, dx * C.paintSpeed, dy * C.paintSpeed + 0.6, dz * C.paintSpeed);
      if (h.ammo <= 0) { h.state = 'empty'; this.emit('empty', { id: h.id }); }
    }
  }

  // —— 颜料弹 ——
  updateShots(dt) {
    for (const s of this.shots) {
      let left = dt;
      while (left > 0 && !s.dead) {
        const st = Math.min(left, 1 / 240); left -= st;
        const nx = s.x + s.vx * st, ny = s.y + s.vy * st, nz = s.z + s.vz * st; s.vy -= C.paintGravity * st;
        // 命中躲藏方？
        let hit = null;
        for (const q of this.hiders) {
          if (q.caught) continue;
          const pd = Math.hypot(nx - q.x, nz - q.z);
          if (pd < 1.2 && !s.near.includes(q.id)) s.near.push(q.id);
          if (pd < C.playerRadius + 0.14 && ny > q.floorY - 0.05 && ny < q.floorY + this.height(q) + 0.12 && this.phase === 'seek' && !C.invincible) { hit = q; break; }
        }
        if (hit) { s.dead = true; this.emit('splat', { x: nx, y: ny, z: nz, nx: 0, ny: 1, nz: 0, color: s.color, onBody: true, hid: hit.id }); this.caught(hit, s); break; }
        let best = null;
        for (const b of this.paintBoxes) { const r = segBox(s.x, s.y, s.z, nx, ny, nz, b); if (r && r.axis >= 0 && (!best || r.t < best.t)) best = r; }
        if (best) {
          const n = [0, 0, 0]; n[best.axis] = best.sign; s.dead = true;
          this.emit('splat', { x: lerp(s.x, nx, best.t), y: lerp(s.y, ny, best.t), z: lerp(s.z, nz, best.t), nx: n[0], ny: n[1], nz: n[2], color: s.color });
        } else if (ny <= 0.02) { s.dead = true; this.emit('splat', { x: nx, y: 0.02, z: nz, nx: 0, ny: 1, nz: 0, color: s.color }); }
        s.x = nx; s.y = ny; s.z = nz;
      }
      s.life -= dt; if (s.life <= 0 || s.x < -5 || s.z < -5 || s.x > 45 || s.z > 35) s.dead = true;
      if (s.dead && this.phase === 'seek') for (const id of s.near) { const q = this.hiders[id]; if (!q.caught) { q.stats.shotsDodged++; this.emit('dodged', { hid: id }); } }
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }
  caught(q, s) {
    q.caught = true; q.caughtColor = s.color; q.vis = 1; q.moving = false; q.noise = 0; q.stats.survived = C.roundTime - this.timeLeft;
    for (const h of this.hunters) h.det[q.id] = 0;
    this.emit('caught', { hid: q.id, id: s.owner, color: s.color });
    if (this.hiders.every((k) => k.caught)) this.end('hunters', 'allCaught');
  }
  end(winner, why) {
    this.phase = 'over'; this.result = winner; this.why = why;
    if (winner === 'hiders') for (const q of this.alive()) { q.stats.survived = C.roundTime - Math.max(0, this.timeLeft); this.addScore(q, C.scoreSurvive); }
    this.emit('over', { winner, why });
  }

  // —— AI 躲藏方：找地方躲、定时换位置、被看到会僵住或逃跑 ——
  nearestHunter(x, z) { let best = null, bd = 1e9; for (const h of this.hunters) { const d = Math.hypot(h.x - x, h.z - z); if (d < bd) { bd = d; best = h; } } return [best, bd]; }
  botPick(q, away) {
    const b = q.bot; let best = null, bs = -1e9;
    const taken = this.hiders.filter((k) => k !== q && k.bot && !k.caught).map((k) => k.bot.spot);
    for (const s of this.hideSpots) {
      if (s === b.spot || taken.includes(s)) continue; const dp = Math.hypot(s.x - q.x, s.z - q.z), dm = this.nearestHunter(s.x, s.z)[1];
      let sc = this.rng() * 8 - dp * (away ? 0.15 : 0.25) + Math.min(dm, 14) * (away ? 0.9 : 0.3);
      if (this.phase === 'seek' && this.hunters.some((h) => this.los(h.x, C.hunterEye, h.z, s.x, 0.6, s.z))) sc -= 6;
      if (sc > bs) { bs = sc; best = s; }
    }
    b.spot = best; b.state = 'go'; b.flee = away; b.stuck = 0;
    const tx = best.ax ?? best.x, tz = best.az ?? best.z; b.path = this.nav.path(q.x, q.z, tx, tz) || [];
    if (best.ax !== undefined || !this.nav.isFree(best.x, best.z)) b.path.push({ x: best.x, z: best.z, last: true }); else if (b.path.length) b.path[b.path.length - 1].last = true;
  }
  botStance(q, t) { if (q.stance !== t) this.setStance(q, t === 'walk' ? q.stance : t); }
  botInput(q, dt) {
    const b = q.bot, seek = this.phase === 'seek'; b.freezeCd -= dt;
    // 离得最近的猎人，以及有没有猎人正看着自己
    let d = this.nearestHunter(q.x, q.z)[1], seen = false;
    if (seek) for (const h of this.hunters) {
      if (h.state === 'wait') continue; const dx = q.x - h.x, dz = q.z - h.z, dh = Math.hypot(dx, dz);
      if (dh < 26 && Math.abs(angDiff(Math.atan2(dz, dx), h.ang)) < 0.95 && this.los(h.x, C.hunterEye, h.z, q.x, q.floorY + this.height(q) * 0.6, q.z)) { if (!seen || dh < d) d = dh; seen = true; }
    }
    b.seen = seen;
    if (b.state === 'hidden') {
      b.wait -= dt;
      if (seen && ((d < 5 && q.vis > 0.3) || d < 2.6)) { this.botStance(q, 'walk'); this.botPick(q, true); }
      else if (b.wait <= 0 && !seen && d > 5) this.botPick(q, false);
      return { f: 0, yaw: q.yaw };
    }
    if (!b.path || !b.path.length) { this.botStance(q, b.spot.st); b.state = 'hidden'; b.flee = false; b.wait = 9 + this.rng() * 16; return { f: 0, yaw: q.yaw }; }
    // 被远远看到：先僵住不动，赌自己变透明
    if (seen && d > 8 && b.freezeCd <= 0 && !b.flee && b.freeze <= 0) { b.freeze = 2.5 + this.rng() * 2.5; b.freezeCd = 9; }
    if (b.freeze > 0) { b.freeze -= dt; if (seen && d < 6.5) { b.freeze = 0; b.flee = true; } else return { f: 0, yaw: q.yaw }; }
    if (seen && d < 7) b.flee = true;
    const t = b.path[0], tx = t.x - q.x, tz = t.z - q.z, td = Math.hypot(tx, tz);
    if (td < 0.18) { b.path.shift(); return { f: 0, yaw: q.yaw }; }
    if (t.last && td < 2.2 && b.spot.st !== 'walk') this.botStance(q, b.spot.st); else if (b.flee || (seen && d < 12)) this.botStance(q, 'walk'); else this.botStance(q, d < 14 && !t.last ? 'crouch' : 'walk');
    // 卡住了就换个目标
    if (Math.hypot(q.x - b.lx, q.z - b.lz) < 0.02 * dt * 60) { b.stuck += dt; if (b.stuck > 1.2) { this.botStance(q, 'walk'); this.botPick(q, b.flee); } } else b.stuck = 0; b.lx = q.x; b.lz = q.z;
    return { f: 1, s: 0, run: (b.flee || (seen && d < 12)) && q.stance === 'walk', yaw: Math.atan2(-tx, -tz) };
  }

  // —— 防挂机：躲藏方待太久，最近的 AI 猎人会收到提示；真人猎人在画面上看到提示圈 ——
  updateCamp(q, dt) {
    const c = q.camp;
    if (Math.hypot(q.x - c.x, q.z - c.z) > C.campDist) { c.x = q.x; c.z = q.z; c.t = 0; c.level = 0; return; }
    c.t += dt; if (c.t < C.campTime) return;
    c.t = 0; c.level++;
    const R = C.campHintRadius * [0.6, 0.25, 0.08][Math.min(2, c.level - 1)], a = this.rng() * TAU, r = this.rng() * R;
    const x = clamp(q.x + Math.cos(a) * r, 1, 39), z = clamp(q.z + Math.sin(a) * r, 1, 29);
    let best = null, bd = 1e9; for (const h of this.hunters) { if (h.ctrl !== 'ai' || (h.state !== 'patrol' && h.state !== 'investigate')) continue; const d = Math.hypot(h.x - q.x, h.z - q.z); if (d < bd) { bd = d; best = h; } }
    if (best) this.investigate(best, x, z, 'camp', q.id);
    if (best || this.hunters.some((h) => h.ctrl === 'human')) this.emit('campHint', { hid: q.id, level: c.level, x, z, r: Math.max(R, 0.8) });
  }

  // inputs：{ 角色 key: 输入 }。单机时也可以直接传一个输入对象，给第一个真人用。
  // 输入：{ f, s, run, yaw, pitch, fire, stance: 'crouch' | 'prone' | 'stand' }
  update(dt, inputs = {}) {
    if (this.phase === 'menu' || this.phase === 'over') { if (this.phase === 'over') this.updateShots(dt); return; }
    if ('yaw' in inputs || 'f' in inputs || 'fire' in inputs || 'stance' in inputs) { const me = this.firstHuman(); inputs = me ? { [me.key]: inputs } : {}; }
    dt = Math.min(dt, 0.05); this.time += dt;
    for (const q of this.hiders) {
      if (q.caught) continue;
      this.updateHider(q, dt, q.bot ? this.botInput(q, dt) : inputs[q.key] || { yaw: q.yaw, pitch: q.pitch });
    }
    for (const h of this.hunters) if (h.ctrl === 'human') this.updateHumanHunter(h, dt, inputs[h.key] || { yaw: h.yaw, pitch: h.pitch });
    if (this.phase === 'hide') {
      this.hideLeft -= dt;
      if (this.hideLeft <= 0) { this.phase = 'seek'; for (const h of this.hunters) if (h.ctrl === 'ai') this.nextPatrol(h); else h.state = 'human'; this.emit('seek'); }
    } else {
      this.timeLeft -= dt;
      for (const q of this.alive()) { this.addScore(q, C.scorePerSecond * dt); this.updateCamp(q, dt); }
    }
    for (const h of this.hunters) if (h.ctrl === 'ai') this.updateHunter(h, dt);
    this.updateShots(dt);
    if (this.phase === 'seek') {
      if (this.timeLeft <= 0) this.end('hiders', 'timeout');
      else if (this.pendingPaintOut && this.shots.length === 0) this.end('hiders', 'paintout');
    }
  }
}
