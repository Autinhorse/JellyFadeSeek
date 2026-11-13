// 程序贴图：所有贴图都用代码现场画出来，没有外部图片
import * as THREE from 'three';

// 可平铺的值噪声
function makeNoise(seed) {
  const P = 256, perm = new Float32Array(P * P); let s = seed * 9301 + 49297;
  for (let i = 0; i < P * P; i++) { s = (s * 16807) % 2147483647; perm[i] = (s & 0xffff) / 0xffff; }
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y, period) => { // period: 多少个格子后重复
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const w = (i, j) => perm[(((j % period) + period) % period) * P + (((i % period) + period) % period)];
    const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
const N1 = makeNoise(11), N2 = makeNoise(57);
export function fbm(u, v, fx, fy, oct = 4, n = N1) { let a = 0, amp = 0.5, tot = 0; for (let o = 0; o < oct; o++) { const px = Math.max(1, Math.round(fx)), py = Math.max(1, Math.round(fy)); a += amp * tile(n, u * px, v * py, px, py); tot += amp; amp *= 0.5; fx *= 2; fy *= 2; } return a / tot; }
function tile(n, x, y, px, py) { // 两个方向周期不同的平铺噪声
  const sm = (t) => t * t * (3 - 2 * t), xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
  const h = (i, j) => n(((i % px) + px) % px + 0.0, ((j % py) + py) % py + 0.0, 256);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

// fn(u,v) -> { c:[r,g,b] 0..1, h: 高度 0..1, r: 粗糙度 0..1 }；生成颜色、法线、粗糙度三张贴图
export function bake(size, fn, { normal = 2, repeat = [1, 1], aniso = 8 } = {}) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const ca = mk(), cn = mk(), cr = mk(), xa = ca.getContext('2d'), xn = cn.getContext('2d'), xr = cr.getContext('2d');
  const ia = xa.createImageData(size, size), inn = xn.createImageData(size, size), ir = xr.createImageData(size, size), H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = fn(x / size, y / size), k = (y * size + x) * 4; H[y * size + x] = o.h ?? 0.5;
    ia.data[k] = o.c[0] * 255; ia.data[k + 1] = o.c[1] * 255; ia.data[k + 2] = o.c[2] * 255; ia.data[k + 3] = 255;
    const r = (o.r ?? 0.8) * 255; ir.data[k] = r; ir.data[k + 1] = r; ir.data[k + 2] = r; ir.data[k + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = H[y * size + ((x - 1 + size) % size)], xr2 = H[y * size + ((x + 1) % size)], yu = H[((y - 1 + size) % size) * size + x], yd = H[((y + 1) % size) * size + x];
    let nx = (xl - xr2) * normal * size / 256, ny = (yd - yu) * normal * size / 256, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = (y * size + x) * 4; inn.data[k] = (nx * 0.5 + 0.5) * 255; inn.data[k + 1] = (ny * 0.5 + 0.5) * 255; inn.data[k + 2] = (nz * 0.5 + 0.5) * 255; inn.data[k + 3] = 255;
  }
  xa.putImageData(ia, 0, 0); xn.putImageData(inn, 0, 0); xr.putImageData(ir, 0, 0);
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: T(ca, true), normalMap: T(cn, false), roughnessMap: T(cr, false), canvas: ca };
}
export function canvasTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const rugCache = new Map();
export function rugTexture(c1, c2) {
  const key = c1 + ':' + c2; if (rugCache.has(key)) return rugCache.get(key);
  const W = 1024, Hh = 672, c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d');
    const hx = (v) => '#' + v.toString(16).padStart(6, '0'), col = { base: hx(c2), coral: hx(c1), teal: c1 === 0x57c2b8 || c1 === 0x5fc9c0 ? '#ff8f7d' : '#57c2b8', yellow: '#ffc94a', navy: '#4a5a8c' };
    x.fillStyle = col.coral; x.fillRect(0, 0, W, Hh); x.fillStyle = col.base; x.fillRect(34, 34, W - 68, Hh - 68);
    x.fillStyle = col.teal; x.fillRect(58, 58, W - 116, Hh - 116); x.fillStyle = col.base; x.fillRect(74, 74, W - 148, Hh - 148);
    // 锯齿边
    x.fillStyle = col.yellow; for (let i = 0; i < 40; i++) { const px = 74 + i * (W - 148) / 40, w = (W - 148) / 40; for (const [py, d] of [[74, 1], [Hh - 74, -1]]) { x.beginPath(); x.moveTo(px, py); x.lineTo(px + w / 2, py + d * 22); x.lineTo(px + w, py); x.fill(); } }
    for (let i = 0; i < 24; i++) { const py = 74 + i * (Hh - 148) / 24, h = (Hh - 148) / 24; for (const [px, d] of [[74, 1], [W - 74, -1]]) { x.beginPath(); x.moveTo(px, py); x.lineTo(px + d * 22, py + h / 2); x.lineTo(px, py + h); x.fill(); } }
    // 中间的菱形花纹
    const dia = (cx, cy, rx, ry, f) => { x.fillStyle = f; x.beginPath(); x.moveTo(cx, cy - ry); x.lineTo(cx + rx, cy); x.lineTo(cx, cy + ry); x.lineTo(cx - rx, cy); x.fill(); };
    for (let i = 0; i < 5; i++) { const cx = 190 + i * 161, cy = Hh / 2; dia(cx, cy, 86, 150, i % 2 ? col.teal : col.coral); dia(cx, cy, 62, 108, col.base); dia(cx, cy, 40, 70, col.yellow); dia(cx, cy, 16, 28, col.navy); }
    for (let i = 0; i < 4; i++) for (const cy of [150, Hh - 150]) { dia(270 + i * 161, cy, 26, 36, col.navy); dia(270 + i * 161, cy, 12, 17, col.base); }
    // 纤维感
    const id = x.getImageData(0, 0, W, Hh); for (let i = 0; i < id.data.length; i += 4) { const px = (i / 4) % W, py = Math.floor(i / 4 / W), n = (hash(px, py) - 0.5) * 26 + (hash(Math.floor(px / 3), Math.floor(py / 9)) - 0.5) * 16; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } x.putImageData(id, 0, 0);
    const t = canvasTex(c); rugCache.set(key, t); return t;
}

export function buildTextures() {
  const T = {};
  // 木地板：一张贴图 = 1.6m × 1.6m，8 排木板
  T.floor = bake(1024, (u, v) => {
    const rows = 8, row = Math.floor(v * rows), fv = v * rows - row, off = hash(row, 3) * 1.0, len = 2, pu = (u + off) * len, pi = Math.floor(pu), fu = pu - pi;
    const id = hash(row, ((pi % len) + len) % len + 7), grain = fbm(u + id * 3, v, 3, 64, 4), wave = fbm(u, v, 2, 6, 3, N2);
    const ring = 0.5 + 0.5 * Math.sin((v * rows * 6 + wave * 9 + id * 20) * 1.0 + grain * 6);
    let c = mix(hex(0xd99e5e), hex(0xf2c68c), id * 0.75 + grain * 0.35); c = mix(c, hex(0xb9783f), ring * 0.16 + (grain > 0.62 ? 0.12 : 0));
    const gap = Math.min(fv, 1 - fv) * (1 / rows) * 1.6, gapU = Math.min(fu, 1 - fu) * (1 / len) * 1.6, g = Math.min(ss(0, 0.006, gap), ss(0, 0.004, gapU));
    c = mix(hex(0x7a4d28), c, g); return { c, h: g * 0.7 + grain * 0.12 + ring * 0.05, r: 0.42 + grain * 0.2 + (1 - g) * 0.3 };
  }, { normal: 3 });
  // 家具木纹（浅色，靠材质颜色染色）
  T.wood = bake(512, (u, v) => {
    const grain = fbm(u, v, 2, 40, 4), wave = fbm(u, v, 2, 3, 3, N2), ring = 0.5 + 0.5 * Math.sin(v * 46 + wave * 14 + grain * 4);
    const t = 0.82 + grain * 0.14 - ring * 0.1; return { c: [t, t * 0.97, t * 0.93], h: grain * 0.5 + ring * 0.3, r: 0.48 + grain * 0.2 };
  }, { normal: 1.6 });
  // 布料：细密编织
  T.fabric = bake(512, (u, v) => {
    const f = 90, wa = Math.sin(u * f * Math.PI * 2), wb = Math.sin(v * f * Math.PI * 2), weave = (wa * wb) * 0.5 + 0.5, n = fbm(u, v, 24, 24, 3), big = fbm(u, v, 3, 3, 3, N2);
    const t = 0.86 + weave * 0.1 + n * 0.08 - 0.04 + (big - 0.5) * 0.08; return { c: [t, t, t], h: weave * 0.6 + n * 0.4, r: 0.86 + n * 0.1 };
  }, { normal: 2.2 });
  // 粗毛线（地毯、毯子）
  T.wool = bake(512, (u, v) => { const n = fbm(u, v, 48, 48, 4), m = fbm(u, v, 96, 12, 3, N2), t = 0.8 + n * 0.22; return { c: [t, t, t], h: n * 0.7 + m * 0.3, r: 0.95 }; }, { normal: 3.5 });
  // 墙漆
  T.plaster = bake(512, (u, v) => { const n = fbm(u, v, 10, 10, 5), f = fbm(u, v, 60, 60, 2, N2), t = 0.94 + n * 0.06; return { c: [t, t, t], h: n * 0.6 + f * 0.4, r: 0.8 + n * 0.12 }; }, { normal: 0.9 });
  // 墙纸：薄荷底色 + 小叶子图案
  T.wallpaper = bake(1024, (u, v) => {
    const n = fbm(u, v, 14, 14, 4), g = 6, cu = u * g, cv = v * g, row = Math.floor(cv), ou = cu + (row % 2) * 0.5, lx = ou - Math.floor(ou) - 0.5, ly = cv - row - 0.5;
    const a = 0.7, rx = lx * Math.cos(a) - ly * Math.sin(a), ry = lx * Math.sin(a) + ly * Math.cos(a), leaf = 1 - ss(0.8, 1.0, (rx * rx) / 0.012 + (ry * ry) / 0.06), vein = Math.abs(rx) < 0.008 && Math.abs(ry) < 0.22 ? 1 : 0;
    const dot = 1 - ss(0.0009, 0.0016, (lx - 0.27) * (lx - 0.27) + (ly + 0.25) * (ly + 0.25));
    let c = mix(hex(0xcfeedd), hex(0xdff5e8), n); c = mix(c, hex(0xa9dcc0), leaf * 0.85); c = mix(c, hex(0xcfeedd), vein * leaf * 0.8); c = mix(c, hex(0xffd08a), dot * 0.9);
    return { c, h: 0.5 + leaf * 0.12 + n * 0.1, r: 0.82 };
  }, { normal: 0.7 });
  // 草地
  T.grass = bake(512, (u, v) => { const n = fbm(u, v, 8, 8, 5), f = fbm(u, v, 80, 80, 2, N2); return { c: mix(hex(0x5fbf55), hex(0x9be37a), n * 0.8 + f * 0.25), h: f, r: 0.95 }; }, { normal: 2 });
  // 树叶团
  T.leaves = bake(512, (u, v) => { const n = fbm(u, v, 14, 14, 3), f = fbm(u, v, 40, 40, 2, N2), t = ss(0.35, 0.7, f); return { c: mix(hex(0x3f9a4b), hex(0x7fd16d), t * 0.8 + n * 0.3), h: f * 0.8 + n * 0.2, r: 0.9 }; }, { normal: 3 });
  // 中性色树叶团（靠材质颜色染色：绿篱、各种颜色的树冠）
  T.leavesN = bake(512, (u, v) => { const n = fbm(u, v, 14, 14, 3), f = fbm(u, v, 40, 40, 2, N2), t = 0.83 + ss(0.35, 0.7, f) * 0.14 + n * 0.05; return { c: [t, t, t], h: f * 0.8 + n * 0.2, r: 0.9 }; }, { normal: 2 });
  // 陶土花盆
  T.clay = bake(256, (u, v) => { const n = fbm(u, v, 12, 12, 4), t = 0.9 + n * 0.12; return { c: [t, t, t], h: n, r: 0.75 + n * 0.2 }; }, { normal: 1.5 });


  // 厨房地砖：棋盘格，一张贴图 = 2m × 2m，4×4 块
  T.tile = bake(512, (u, v) => {
    const n = 4, iu = Math.floor(u * n), iv = Math.floor(v * n), fu = u * n - iu, fv = v * n - iv, e = Math.min(fu, 1 - fu, fv, 1 - fv), g = ss(0.012, 0.03, e), nz = fbm(u, v, 20, 20, 3);
    let c = (iu + iv) % 2 ? hex(0xfdfaf2) : hex(0xa9d8f0); c = mix(c, [c[0] * 0.93, c[1] * 0.93, c[2] * 0.93], nz * 0.6); c = mix(hex(0xb9b2a6), c, g);
    return { c, h: g * 0.8 + ss(0.03, 0.09, e) * 0.2, r: g > 0.5 ? 0.22 + nz * 0.12 : 0.9 };
  }, { normal: 2.2 });
  // 中性色墙纸（靠材质颜色给每个房间染色）
  T.wallpaperN = bake(1024, (u, v) => {
    const n = fbm(u, v, 14, 14, 4), g = 6, cu = u * g, cv = v * g, row = Math.floor(cv), ou = cu + (row % 2) * 0.5, lx = ou - Math.floor(ou) - 0.5, ly = cv - row - 0.5;
    const a = 0.7, rx = lx * Math.cos(a) - ly * Math.sin(a), ry = lx * Math.sin(a) + ly * Math.cos(a), leaf = 1 - ss(0.8, 1.0, (rx * rx) / 0.012 + (ry * ry) / 0.06), vein = Math.abs(rx) < 0.008 && Math.abs(ry) < 0.22 ? 1 : 0;
    const dot = 1 - ss(0.0009, 0.0016, (lx - 0.27) * (lx - 0.27) + (ly + 0.25) * (ly + 0.25));
    let t = 0.95 + n * 0.05; t *= 1 - leaf * 0.085 * (1 - vein * 0.8); let c = [t, t, t]; c = mix(c, [1, 0.86, 0.6], dot * 0.75);
    return { c, h: 0.5 + leaf * 0.12 + n * 0.1, r: 0.84 };
  }, { normal: 0.7 });
  // 外墙木板：横向搭接
  T.siding = bake(512, (u, v) => { const rows = 6, fv = v * rows - Math.floor(v * rows), n = fbm(u, v, 3, 50, 4), lip = ss(0, 0.07, fv) * (1 - ss(0.93, 1, fv)), t = 0.9 + n * 0.08 - (1 - lip) * 0.22; return { c: [t, t, t], h: (1 - fv) * 0.8 * lip + n * 0.08, r: 0.7 + n * 0.15 }; }, { normal: 3 });
  // 屋顶瓦片
  T.roof = bake(512, (u, v) => { const rows = 6, row = Math.floor(v * rows), fv = v * rows - row, cu = u * 5 + (row % 2) * 0.5, fu = cu - Math.floor(cu), id = hash(Math.floor(cu) % 5, row), gap = ss(0, 0.05, Math.min(fu, 1 - fu)), n = fbm(u, v, 30, 30, 3), t = (0.82 + id * 0.18 + n * 0.06) * (0.75 + 0.25 * gap) * (0.8 + 0.2 * ss(0, 0.2, fv)); return { c: [t, t, t], h: (1 - fv) * 0.9 * gap + n * 0.1, r: 0.85 }; }, { normal: 3 });
  T.rug = rugTexture(0xff8f7d, 0xf7ead2);
  // 挂画
  T.paintings = [0, 1, 2].map((k) => {
    const c = document.createElement('canvas'); c.width = 384; c.height = 288; const x = c.getContext('2d');
    if (k === 0) { const g = x.createLinearGradient(0, 0, 0, 288); g.addColorStop(0, '#8fd3ff'); g.addColorStop(0.6, '#ffe9c7'); x.fillStyle = g; x.fillRect(0, 0, 384, 288); x.fillStyle = '#fff6c8'; x.beginPath(); x.arc(280, 90, 34, 0, 7); x.fill(); for (const [h, col] of [[190, '#8bd18b'], [220, '#5fb86a'], [250, '#3f9a55']]) { x.fillStyle = col; x.beginPath(); x.moveTo(0, 288); for (let i = 0; i <= 384; i += 8) x.lineTo(i, h + Math.sin(i * 0.02 + h) * 22 + Math.sin(i * 0.05 + h * 2) * 8); x.lineTo(384, 288); x.fill(); } }
    else if (k === 1) { x.fillStyle = '#fff3dc'; x.fillRect(0, 0, 384, 288); const cols = ['#ff8f7d', '#ffc94a', '#57c2b8', '#6ba8ff', '#b48cff']; for (let i = 0; i < 9; i++) { x.fillStyle = cols[i % 5]; x.globalAlpha = 0.85; x.beginPath(); x.arc(60 + (i % 3) * 132, 60 + Math.floor(i / 3) * 84, 30 + (i * 7) % 16, 0, 7); x.fill(); } x.globalAlpha = 1; }
    else { x.fillStyle = '#ffd9d0'; x.fillRect(0, 0, 384, 288); x.fillStyle = '#ff8a3d'; x.beginPath(); x.ellipse(192, 176, 86, 70, 0, 0, 7); x.fill(); x.fillStyle = '#ffb27a'; x.beginPath(); x.ellipse(192, 196, 50, 38, 0, 0, 7); x.fill(); x.fillStyle = '#ff8a3d'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(192 + s * 78, 150); x.lineTo(192 + s * 62, 70); x.lineTo(192 + s * 28, 118); x.fill(); } x.fillStyle = '#3a3550'; for (const s of [-1, 1]) { x.beginPath(); x.arc(192 + s * 32, 160, 9, 0, 7); x.fill(); } x.beginPath(); x.arc(192, 184, 6, 0, 7); x.fill(); }
    return canvasTex(c);
  });
  // 阳光光束用的渐变
  T.beam = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,244,214,0.55)'); g.addColorStop(1, 'rgba(255,244,214,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 256); const e = x.createLinearGradient(0, 0, 64, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.25, 'rgba(0,0,0,0)'); e.addColorStop(0.75, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = e; x.fillRect(0, 0, 64, 256); return canvasTex(c); })();
  T.dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return canvasTex(c); })();
  return T;
}
