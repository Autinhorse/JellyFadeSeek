// 画面样板：客厅。房间 x 0..14（东西）、z 0..6（北→南），南墙是朝后院的大窗。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const H = 2.8, T = 0.2;
export const C = { cream: 0xfff4e0, coral: 0xff7a6b, yellow: 0xffc94a, sky: 0x6ba8ff, teal: 0x57c2b8, mint: 0xa8f0e0, wood: 0xe2a968, woodDark: 0xb07642, white: 0xffffff, ink: 0x3a3550, leaf: 0x4fae58, orange: 0xff8a3d, purple: 0xb48cff, pink: 0xffb7c8 };

// 按世界尺寸重排 UV，让贴图在所有物体上密度一致
function worldUV(g, s = 1) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v; if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); } uv[i * 2] = u * s; uv[i * 2 + 1] = v * s; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
const rbox = (w, h, d, r = 0.03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.49));
// 鼓鼓的垫子：圆角盒子的上表面和侧面再往外鼓一点
function puffy(w, h, d, r, puff) {
  const g = new RoundedBoxGeometry(w, h, d, 8, Math.min(r, Math.min(w, h, d) * 0.49)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2), z = p.getZ(i) / (d / 2); const b = Math.cos(Math.min(1, Math.abs(x)) * Math.PI / 2) * Math.cos(Math.min(1, Math.abs(z)) * Math.PI / 2); p.setY(i, p.getY(i) + (y > 0 ? 1 : -0.3) * puff * b * Math.abs(y)); const s = Math.cos(Math.min(1, Math.abs(y)) * Math.PI / 2) * puff * 0.5; p.setX(i, p.getX(i) + x * s * Math.cos(Math.min(1, Math.abs(z)) * Math.PI / 2)); p.setZ(i, p.getZ(i) + z * s * Math.cos(Math.min(1, Math.abs(x)) * Math.PI / 2)); }
  g.computeVertexNormals(); return g;
}
const lathe = (pts, seg = 40) => { const curve = new THREE.SplineCurve(pts.map((q) => new THREE.Vector2(q[0], q[1]))); return new THREE.LatheGeometry(curve.getPoints(pts.length * 6), seg); };

export function buildScene(scene, tex) {
  const M = {}; // 材质
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const maps = (t, rep, ns = 1) => { const c = (x) => { const y = x.clone(); y.repeat.set(rep, rep); y.needsUpdate = true; return y; }; return { map: c(t.map), normalMap: c(t.normalMap), roughnessMap: c(t.roughnessMap), normalScale: new THREE.Vector2(ns, ns) }; };
  M.floor = std({ ...maps(tex.floor, 1 / 1.6, 1.0), roughness: 1 });
  M.wall = std({ ...maps(tex.wallpaper, 1 / 1.5, 0.6), roughness: 1 });
  M.plaster = std({ ...maps(tex.plaster, 0.6, 0.5), color: 0xffffff, roughness: 1 });
  M.trim = std({ ...maps(tex.plaster, 1.2, 0.25), color: 0xfffdf6, roughness: 0.55 });
  const wood = (color, rough = 1) => std({ ...maps(tex.wood, 1.1, 0.7), color, roughness: rough });
  M.wood = wood(C.wood); M.woodDark = wood(C.woodDark); M.woodWhite = wood(0xfff6e6); M.piano = std({ color: 0x2f2a44, roughness: 0.18, metalness: 0.0 });
  const fabric = (color, rep = 2.2) => new THREE.MeshPhysicalMaterial({ ...maps(tex.fabric, rep, 0.9), color, roughness: 1, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6) });
  M.sofa = fabric(0x5d9dff); M.cushY = fabric(C.yellow, 3); M.cushC = fabric(C.coral, 3); M.cushW = fabric(0xfff1dc, 3); M.chair = fabric(0xffc94a); M.curtain = fabric(0xff8f7d, 1.4); M.curtainB = fabric(0xfff0d0, 1.4);
  M.curtain.side = M.curtainB.side = THREE.DoubleSide;
  const wool = (color, rep = 2) => std({ ...maps(tex.wool, rep, 1.2), color, roughness: 1 });
  M.blanket = wool(0x57c2b8, 4); M.basket = wool(0xe0b77c, 5);
  M.rug = std({ map: tex.rug, normalMap: (() => { const t = tex.wool.normalMap.clone(); t.repeat.set(9, 6); t.needsUpdate = true; return t; })(), normalScale: new THREE.Vector2(1.3, 1.3), roughness: 1 });
  M.clay = std({ ...maps(tex.clay, 2, 0.8), color: 0xff8f6b, roughness: 1 }); M.clayBlue = std({ ...maps(tex.clay, 2, 0.8), color: 0x6ba8ff, roughness: 0.6 });
  M.leaf = new THREE.MeshPhysicalMaterial({ color: 0x46a84f, roughness: 0.45, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0xbfffb0), clearcoat: 0.3, clearcoatRoughness: 0.4 });
  M.leaf2 = M.leaf.clone(); M.leaf2.color.setHex(0x6cc463);
  M.metal = std({ color: 0xd9c38a, roughness: 0.3, metalness: 0.9 }); M.dark = std({ color: C.ink, roughness: 0.5 });
  M.ceramic = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.1, envMapIntensity: 2.5, depthWrite: false });
  M.shade = std({ color: 0xfff0c2, emissive: 0xffd58a, emissiveIntensity: 1.6, roughness: 0.9, side: THREE.DoubleSide });
  M.grass = std({ ...maps(tex.grass, 0.5, 1), roughness: 1 });
  M.hedge = std({ ...maps(tex.leaves, 1.4, 1.6), roughness: 1 }); M.tree = std({ ...maps(tex.leaves, 0.9, 1.6), color: 0xd6ffc8, roughness: 1 });
  const paint = (color, rough = 0.5) => std({ color, roughness: rough });

  const root = new THREE.Group(); scene.add(root);
  const add = (g, m, x = 0, y = 0, z = 0, o = {}) => { if (o.uv !== false && !o.keepUV) worldUV(g, o.uvs || 1); const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = o.cast !== false; mesh.receiveShadow = o.recv !== false; if (o.ry) mesh.rotation.y = o.ry; if (o.rx) mesh.rotation.x = o.rx; if (o.rz) mesh.rotation.z = o.rz; (o.parent || root).add(mesh); return mesh; };
  const box = (x0, y0, z0, x1, y1, z1, m, o = {}) => add(o.sharp ? new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0) : rbox(x1 - x0, y1 - y0, z1 - z0, o.r ?? 0.02, o.seg ?? 2), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);

  // —— 地板、天花板 ——
  add(new THREE.BoxGeometry(14.4, 0.2, 6.4), M.floor, 7, -0.1, 3, { cast: false });
  add(new THREE.BoxGeometry(14.6, 0.2, 6.6), M.plaster, 7, H + 0.1, 3);
  for (const x of [2.4, 7, 11.6]) box(x - 0.09, H - 0.2, 0.05, x + 0.09, H + 0.02, 5.95, M.woodDark, { r: 0.015 });
  // 走廊（门洞后面）
  add(new THREE.BoxGeometry(6, 0.2, 2.4), M.floor, 11, -0.1, -1.3, { cast: false }); add(new THREE.BoxGeometry(6, 0.2, 2.6), M.plaster, 11, H + 0.1, -1.3);
  box(8, 0, -2.6, 14, H, -2.4, M.plaster, { sharp: true }); box(7.9, 0, -2.5, 8.1, H, 0, M.plaster, { sharp: true }); box(13.9, 0, -2.5, 14.1, H, 0, M.plaster, { sharp: true });

  // —— 墙（带开口）、护墙板、踢脚线、顶角线 ——
  const wallRun = (axis, at, from, to, opens, inner) => { // inner: 室内在墙的哪一侧 (+1 / -1)
    const seg = (a, b, y0, y1) => { if (b - a < 0.01 || y1 - y0 < 0.01) return; if (axis === 'x') box(a, y0, at - T / 2, b, y1, at + T / 2, M.wall, { sharp: true }); else box(at - T / 2, y0, a, at + T / 2, y1, b, M.wall, { sharp: true }); };
    const deco = (a, b, y0, y1, depth, m, r = 0.01) => { const d0 = inner > 0 ? at + T / 2 : at - T / 2 - depth, d1 = d0 + depth; if (axis === 'x') box(a, y0, d0, b, y1, d1, m, { r, cast: false }); else box(d0, y0, a, d1, y1, b, m, { r, cast: false }); };
    const panel = (a, b, top) => { if (b - a < 0.05) return; deco(a, b, 0.12, top, 0.018, M.trim, 0.004); const n = Math.max(1, Math.round((b - a) / 0.75)), w = (b - a) / n; for (let i = 0; i < n; i++) { const p0 = a + i * w + 0.08, p1 = a + (i + 1) * w - 0.08; if (p1 - p0 < 0.08 || top < 0.5) continue; deco(p0, p1, top - 0.1, top - 0.085, 0.028, M.trim, 0.004); deco(p0, p1, 0.22, 0.235, 0.028, M.trim, 0.004); deco(p0, p0 + 0.015, 0.22, top - 0.085, 0.028, M.trim, 0.004); deco(p1 - 0.015, p1, 0.22, top - 0.085, 0.028, M.trim, 0.004); } deco(a, b, top, top + 0.05, 0.035, M.trim, 0.012); deco(a, b, 0, 0.12, 0.028, M.trim, 0.008); };
    let cur = from; opens = opens.slice().sort((p, q) => p.a - q.a);
    for (const o of opens) { seg(cur, o.a, 0, H); panel(cur, o.a, 0.95); seg(o.a, o.b, 0, o.y0); seg(o.a, o.b, o.y1, H); if (o.y0 > 0.3) panel(o.a, o.b, Math.min(0.95, o.y0 - 0.06)); cur = o.b; }
    seg(cur, to, 0, H); panel(cur, to, 0.95); deco(from, to, H - 0.11, H, 0.06, M.trim, 0.02);
  };
  const WIN = { big: { a: 3.3, b: 7.5, y0: 0.9, y1: 2.3 }, small: { a: 9.6, b: 11.6, y0: 0.9, y1: 2.3 }, west: { a: 2.0, b: 4.0, y0: 0.9, y1: 2.3 } };
  wallRun('x', 6 + T / 2, -T, 14 + T, [WIN.big, WIN.small], -1);
  wallRun('x', -T / 2, -T, 14 + T, [{ a: 11.4, b: 12.9, y0: 0, y1: 2.15 }], 1);
  wallRun('z', -T / 2, 0, 6, [WIN.west], 1);
  wallRun('z', 14 + T / 2, 0, 6, [], -1);
  // 窗框、窗台、玻璃
  const windowAt = (axis, at, o, nv) => {
    const fr = (a, b, y0, y1, dep = 0.09) => { if (axis === 'x') box(a, y0, at - dep, b, y1, at + dep, M.woodWhite, { r: 0.012 }); else box(at - dep, y0, a, at + dep, y1, b, M.woodWhite, { r: 0.012 }); };
    fr(o.a - 0.07, o.a + 0.03, o.y0 - 0.02, o.y1 + 0.07, 0.13); fr(o.b - 0.03, o.b + 0.07, o.y0 - 0.02, o.y1 + 0.07, 0.13); fr(o.a - 0.07, o.b + 0.07, o.y1 - 0.02, o.y1 + 0.08, 0.13);
    for (let i = 1; i < nv; i++) { const p = o.a + (o.b - o.a) * i / nv; fr(p - 0.022, p + 0.022, o.y0, o.y1, 0.03); } fr(o.a, o.b, (o.y0 + o.y1) / 2 + 0.26, (o.y0 + o.y1) / 2 + 0.3, 0.03);
    const inner = axis === 'x' ? -1 : 1; // 窗台往室内伸
    if (axis === 'x') { box(o.a - 0.12, o.y0 - 0.06, at - 0.26, o.b + 0.12, o.y0, at + 0.14, M.woodWhite, { r: 0.02 }); add(new THREE.PlaneGeometry(o.b - o.a, o.y1 - o.y0), M.glass, (o.a + o.b) / 2, (o.y0 + o.y1) / 2, at, { cast: false, recv: false, keepUV: true }); }
    else { box(at - 0.14, o.y0 - 0.06, o.a - 0.12, at + 0.26, o.y0, o.b + 0.12, M.woodWhite, { r: 0.02 }); add(new THREE.PlaneGeometry(o.b - o.a, o.y1 - o.y0), M.glass, at, (o.y0 + o.y1) / 2, (o.a + o.b) / 2, { cast: false, recv: false, keepUV: true, ry: Math.PI / 2 }); }
    void inner;
  };
  windowAt('x', 6 + T / 2, WIN.big, 4); windowAt('x', 6 + T / 2, WIN.small, 2); windowAt('z', -T / 2, WIN.west, 2);
  // 门框
  for (const [a, b] of [[11.33, 11.43], [12.87, 12.97]]) box(a, 0, -T - 0.03, b, 2.2, 0.03, M.woodWhite, { r: 0.012 }); box(11.33, 2.13, -T - 0.03, 12.97, 2.24, 0.03, M.woodWhite, { r: 0.012 });
  // 窗帘（有褶皱）+ 窗帘杆
  const curtain = (x, z, w, h, m, ry = 0, gather = 1) => { const g = new THREE.PlaneGeometry(w, h, 48, 10), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i) / w + 0.5, v = p.getY(i) / h + 0.5; p.setZ(i, Math.sin(u * Math.PI * 2 * 5.5 * gather) * 0.045 * (0.75 + 0.25 * (1 - v)) + Math.sin(u * 31) * 0.008); p.setX(i, p.getX(i) * (0.92 + 0.08 * (1 - v))); } g.computeVertexNormals(); const mm = add(g, m, x, 0.06 + h / 2, z, { keepUV: true, ry }); mm.geometry.attributes.uv.array.forEach((_, i, a) => { a[i] *= i % 2 ? h * 1.4 : w * 3; }); return mm; };
  const rod = (x0, x1, z) => { add(new THREE.CylinderGeometry(0.018, 0.018, x1 - x0, 10), M.metal, (x0 + x1) / 2, 2.5, z, { rz: Math.PI / 2, uv: false }); for (const x of [x0, x1]) add(new THREE.SphereGeometry(0.04, 12, 8), M.metal, x, 2.5, z, { uv: false }); };
  rod(2.7, 8.1, 5.86); curtain(3.05, 5.86, 0.62, 2.42, M.curtain); curtain(7.75, 5.86, 0.62, 2.42, M.curtain); rod(9.1, 12.1, 5.86); curtain(9.35, 5.86, 0.5, 2.42, M.curtain); curtain(11.85, 5.86, 0.5, 2.42, M.curtain);
  add(new THREE.CylinderGeometry(0.018, 0.018, 3, 10), M.metal, 0.14, 2.5, 3, { rx: Math.PI / 2, uv: false }); curtain(0.14, 1.75, 0.5, 2.42, M.curtainB, Math.PI / 2); curtain(0.14, 4.25, 0.5, 2.42, M.curtainB, Math.PI / 2);

  // —— 地毯 ——
  { const g = rbox(4.8, 0.03, 3.15, 0.012, 2); const m = add(g, M.rug, 5.5, 0.016, 3.05, { keepUV: true, cast: false }); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4.8 + 0.5, 0.5 - p.getZ(i) / 3.15); void m; }
  for (let i = 0; i < 60; i++) for (const x of [3.1 - 0.05, 7.9 + 0.05]) add(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 4), M.cushW, x, 0.012, 1.5 + i * 0.0525, { rz: Math.PI / 2 + (i % 3 - 1) * 0.12, cast: false, uv: false });

  // —— 沙发（背靠大窗）——
  const sofa = (cx, cz, seats, m, cush, ry = 0) => {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; root.add(g); const w = seats * 0.82 + 0.5, o = { parent: g };
    add(rbox(w, 0.3, 1.0, 0.08, 4), m, 0, 0.27, 0, o); add(puffy(w - 0.06, 0.62, 0.3, 0.13, 0.05), m, 0, 0.72, 0.36, { ...o, rx: 0.12 });
    for (const s of [-1, 1]) add(puffy(0.28, 0.5, 1.02, 0.12, 0.04), m, s * (w / 2 - 0.13), 0.5, 0, o);
    for (let i = 0; i < seats; i++) { const x = (i - (seats - 1) / 2) * 0.82; add(puffy(0.78, 0.2, 0.74, 0.08, 0.06), m, x, 0.5, -0.1, o); add(puffy(0.74, 0.46, 0.2, 0.09, 0.07), m, x, 0.84, 0.22, { ...o, rx: 0.22 }); }
    for (const [x, z] of [[-w / 2 + 0.12, -0.4], [w / 2 - 0.12, -0.4], [-w / 2 + 0.12, 0.4], [w / 2 - 0.12, 0.4]]) add(new THREE.CylinderGeometry(0.035, 0.025, 0.12, 10), M.woodDark, x, 0.06, z, { ...o, uv: false });
    cush.forEach(([x, mat, rz, s = 0.42], i) => add(puffy(s, s, 0.14, 0.07, 0.09), mat, x, 0.82, 0.02 - i * 0.004, { ...o, rx: 0.3, rz }));
    return g;
  };
  sofa(5.4, 5.25, 3, M.sofa, [[-1.05, M.cushY, 0.2], [-0.62, M.cushW, -0.12, 0.36], [1.05, M.cushC, -0.25]]);
  // 单人沙发 + 小边桌 + 台灯
  sofa(1.75, 2.9, 1, M.chair, [[0.05, M.cushW, 0.15, 0.36]], Math.PI / 2 + 0.25);
  const roundTable = (x, z, r, h, m) => { add(new THREE.CylinderGeometry(r, r, 0.035, 36), m, x, h, z, { uv: false }); add(new THREE.CylinderGeometry(0.028, 0.028, h, 10), M.metal, x, h / 2, z, { uv: false }); add(new THREE.CylinderGeometry(r * 0.6, r * 0.66, 0.025, 28), M.metal, x, 0.012, z, { uv: false }); };
  roundTable(1.25, 4.75, 0.3, 0.55, M.woodWhite);
  const lampShade = (x, y, z, r, h) => add(new THREE.CylinderGeometry(r * 0.7, r, h, 28, 1, true), M.shade, x, y, z, { cast: false, uv: false });
  add(lathe([[0, 0], [0.09, 0.005], [0.1, 0.03], [0.04, 0.06], [0.05, 0.14], [0.085, 0.2], [0.05, 0.28], [0.015, 0.31], [0.012, 0.4]]), M.ceramic.clone(), 1.25, 0.57, 4.75, { uv: false }).material.color.setHex(C.teal); lampShade(1.25, 1.07, 4.75, 0.2, 0.24);
  // 茶几 + 桌上的东西
  { const top = add(rbox(1.5, 0.05, 0.85, 0.025, 3), M.wood, 5.4, 0.42, 3.05); void top; add(rbox(1.3, 0.03, 0.68, 0.012, 2), M.wood, 5.4, 0.16, 3.05); for (const [x, z] of [[-0.66, -0.34], [0.66, -0.34], [-0.66, 0.34], [0.66, 0.34]]) add(new THREE.CylinderGeometry(0.03, 0.022, 0.42, 12), M.woodDark, 5.4 + x, 0.21, 3.05 + z, { uv: false });
    add(lathe([[0, 0], [0.07, 0.003], [0.13, 0.03], [0.16, 0.07], [0.165, 0.09], [0.155, 0.09], [0.12, 0.035], [0, 0.02]], 36), M.clayBlue, 5.0, 0.445, 3.1, { uv: false });
    const fruit = (x, y, z, r, c) => add(new THREE.SphereGeometry(r, 20, 14), paint(c, 0.35), x, y, z, { uv: false }); fruit(4.96, 0.53, 3.07, 0.055, 0xff5d4d); fruit(5.06, 0.525, 3.13, 0.05, 0xffc94a); fruit(5.0, 0.53, 3.18, 0.052, 0xff8a3d); fruit(5.02, 0.59, 3.11, 0.045, 0x8fd16d);
    box(5.55, 0.445, 2.8, 5.85, 0.475, 3.02, paint(C.coral, 0.6), { r: 0.006, ry: 0 }); add(rbox(0.27, 0.025, 0.2, 0.006), paint(C.sky, 0.6), 5.71, 0.488, 2.92, { ry: 0.25 }); add(rbox(0.23, 0.02, 0.17, 0.005), paint(0xfff1dc, 0.6), 5.7, 0.511, 2.91, { ry: -0.15 });
    add(lathe([[0, 0], [0.036, 0.002], [0.04, 0.02], [0.042, 0.09], [0.038, 0.09], [0.035, 0.02], [0, 0.015]], 24), M.ceramic, 5.92, 0.445, 3.28, { uv: false }); add(new THREE.TorusGeometry(0.026, 0.008, 8, 16, Math.PI), M.ceramic, 5.965, 0.49, 3.28, { rz: -Math.PI / 2, uv: false }); }
  // 电视柜 + 电视
  { box(4.3, 0.1, 0.06, 6.7, 0.58, 0.52, M.woodWhite, { r: 0.025 }); for (const x of [4.42, 6.58]) for (const z of [0.14, 0.44]) add(new THREE.CylinderGeometry(0.025, 0.018, 0.1, 10), M.woodDark, x, 0.05, z, { uv: false });
    for (let i = 0; i < 3; i++) { const x0 = 4.36 + i * 0.775; box(x0, 0.16, 0.515, x0 + 0.73, 0.52, 0.535, M.wood, { r: 0.008 }); add(new THREE.SphereGeometry(0.018, 10, 8), M.metal, x0 + 0.365, 0.34, 0.545, { uv: false }); }
    box(4.85, 0.95, 0.04, 6.15, 1.7, 0.09, paint(0x2b2740, 0.4), { r: 0.02 }); add(new THREE.PlaneGeometry(1.22, 0.67), new THREE.MeshPhysicalMaterial({ color: 0x10131c, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.8 }), 5.5, 1.325, 0.092, { keepUV: true, cast: false });
    add(lathe([[0, 0], [0.05, 0.003], [0.07, 0.05], [0.05, 0.12], [0.03, 0.17], [0.04, 0.2], [0.03, 0.2], [0, 0.18]], 28), M.ceramic.clone(), 6.45, 0.58, 0.3, { uv: false }).material.color.setHex(C.yellow); }
  // 书架
  { const x0 = 8.0, x1 = 10.7, z0 = 0.04, z1 = 0.42, top = 2.15; box(x0, 0, z0, x0 + 0.05, top, z1, M.wood, { r: 0.01 }); box(x1 - 0.05, 0, z0, x1, top, z1, M.wood, { r: 0.01 }); box((x0 + x1) / 2 - 0.02, 0, z0, (x0 + x1) / 2 + 0.02, top, z1, M.wood, { r: 0.008 }); box(x0, 0, z0, x1, top, z0 + 0.02, M.woodDark, { sharp: true });
    const cols = [C.coral, C.yellow, C.sky, C.teal, C.purple, 0xfff1dc, C.orange, 0x4a5a8c, 0xff9db5, 0x8fd16d]; let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let lvl = 0; lvl < 5; lvl++) { const y = 0.08 + lvl * 0.43; box(x0, y - 0.035, z0, x1, y, z1 + 0.015, M.wood, { r: 0.008 });
      for (const [a, b] of [[x0 + 0.07, (x0 + x1) / 2 - 0.04], [(x0 + x1) / 2 + 0.04, x1 - 0.07]]) { let t = a; const kind = rnd();
        if (kind < 0.22 && lvl > 0) { // 摆件
          const cx = (a + b) / 2; if (rnd() < 0.5) { add(new THREE.SphereGeometry(0.12, 24, 16), paint(C.sky, 0.3), cx, y + 0.17, 0.24, { uv: false }); add(new THREE.CylinderGeometry(0.05, 0.07, 0.05, 16), M.metal, cx, y + 0.025, 0.24, { uv: false }); t = cx + 0.25; } else { add(lathe([[0, 0], [0.06, 0.003], [0.09, 0.08], [0.06, 0.2], [0.03, 0.27], [0.045, 0.3], [0.035, 0.3], [0, 0.28]], 28), M.ceramic.clone(), cx - 0.25, y, 0.24, { uv: false }).material.color.setHex(cols[Math.floor(rnd() * 5)]); t = cx; }
        }
        while (t < b - 0.06) { const w = 0.03 + rnd() * 0.04, h = 0.22 + rnd() * 0.14, d = 0.2 + rnd() * 0.08, c = cols[Math.floor(rnd() * cols.length)];
          if (rnd() < 0.1 && t < b - 0.4) { for (let k = 0; k < 3; k++) add(rbox(0.26, 0.04, 0.19, 0.006, 1), paint(cols[Math.floor(rnd() * cols.length)], 0.6), t + 0.15, y + 0.02 + k * 0.041, 0.24, { ry: (rnd() - 0.5) * 0.3, uv: false }); t += 0.32; continue; }
          const lean = rnd() < 0.08 ? 0.18 : 0; const bk = add(rbox(w, h, d, 0.006, 1), paint(c, 0.55), t + w / 2 + lean * h * 0.5, y + h / 2, z0 + 0.04 + d / 2, { rz: -lean, uv: false }); add(new THREE.BoxGeometry(w + 0.002, 0.025, d + 0.002), paint(0xfff1dc, 0.5), 0, h * 0.28, 0, { parent: bk, cast: false, uv: false }); t += w + 0.006 + lean * h + (rnd() < 0.07 ? 0.12 : 0); }
      } }
    box(x0 - 0.03, top - 0.02, z0, x1 + 0.03, top + 0.03, z1 + 0.03, M.wood, { r: 0.012 });
    plant(root, M, 8.5, top + 0.03, 0.24, 0.5, true); add(new THREE.SphereGeometry(0.1, 20, 14), paint(C.coral, 0.3), 10.2, top + 0.13, 0.24, { uv: false }); }
  // 挂画
  const frame = (x, y, z, w, h, t, axis = 'x') => { const g = new THREE.Group(); g.position.set(x, y, z); if (axis === 'z') g.rotation.y = -Math.PI / 2; root.add(g); add(rbox(w + 0.1, h + 0.1, 0.035, 0.012), M.wood, 0, 0, 0, { parent: g }); add(new THREE.PlaneGeometry(w + 0.02, h + 0.02), paint(0xfffaf0, 0.9), 0, 0, 0.019, { parent: g, keepUV: true, cast: false }); add(new THREE.PlaneGeometry(w - 0.06, h - 0.06), std({ map: t, roughness: 0.7 }), 0, 0, 0.021, { parent: g, keepUV: true, cast: false }); };
  frame(7.35, 1.55, 0.03, 0.62, 0.46, tex.paintings[0]); frame(7.35, 2.15, 0.03, 0.36, 0.28, tex.paintings[1]); frame(3.3, 1.6, 0.03, 0.5, 0.62, tex.paintings[2]); frame(13.97, 1.6, 4.6, 0.7, 0.52, tex.paintings[1], 'z');
  // 钢琴
  { const px = 13.3; box(px, 0, 1.6, px + 0.62, 1.22, 3.2, M.piano, { r: 0.03 }); box(px - 0.26, 0.66, 1.62, px + 0.02, 0.74, 3.18, M.piano, { r: 0.02 }); box(px - 0.24, 0.74, 1.68, px - 0.02, 0.755, 3.12, paint(0xfffdf5, 0.25), { r: 0.004 });
    for (let i = 0; i < 20; i++) if (i % 7 !== 2 && i % 7 !== 6) box(px - 0.13, 0.755, 1.725 + i * 0.07, px - 0.02, 0.772, 1.765 + i * 0.07, paint(0x1d1a2c, 0.3), { r: 0.004, cast: false }); for (let i = 1; i < 21; i++) box(px - 0.24, 0.7551, 1.68 + i * 0.0685, px - 0.02, 0.7561, 1.681 + i * 0.0685, paint(0x8a8598, 0.5), { sharp: true, cast: false });
    for (const z of [1.66, 3.14]) box(px - 0.24, 0, z - 0.04, px - 0.16, 0.66, z + 0.04, M.piano, { r: 0.02 }); box(px - 0.02, 0.95, 2.05, px + 0.02, 1.2, 2.75, M.wood, { r: 0.006, rz: 0.2 });
    add(puffy(0.36, 0.09, 0.62, 0.04, 0.03), M.cushC, px - 0.62, 0.49, 2.4); for (const [x, z] of [[-0.74, 2.16], [-0.5, 2.16], [-0.74, 2.64], [-0.5, 2.64]]) add(new THREE.CylinderGeometry(0.022, 0.018, 0.45, 10), M.woodDark, px + x, 0.225, z, { uv: false });
    plantSmall(root, M, px + 0.3, 1.22, 1.85); frame(13.97, 1.95, 2.4, 0.5, 0.38, tex.paintings[0], 'z'); }
  // 落地灯、吊灯
  { add(new THREE.CylinderGeometry(0.17, 0.19, 0.03, 28), M.metal, 0.7, 0.015, 0.7, { uv: false }); add(new THREE.CylinderGeometry(0.014, 0.014, 1.5, 10), M.metal, 0.7, 0.76, 0.7, { uv: false }); lampShade(0.7, 1.62, 0.7, 0.26, 0.32);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.75, 6), M.dark, 5.4, H - 0.375, 3.05, { uv: false, cast: false }); add(new THREE.SphereGeometry(0.2, 32, 20), M.shade, 5.4, H - 0.9, 3.05, { uv: false, cast: false }); add(new THREE.CylinderGeometry(0.06, 0.09, 0.07, 20), M.metal, 5.4, H - 0.72, 3.05, { uv: false }); }
  // 大盆栽、藤编筐、玩具
  plant(root, M, 0.75, 0, 5.2, 1.0); plant(root, M, 12.9, 0, 5.3, 0.8);
  { add(lathe([[0, 0], [0.2, 0.004], [0.26, 0.1], [0.27, 0.3], [0.24, 0.36], [0.22, 0.36], [0.24, 0.3], [0.23, 0.1], [0, 0.03]], 36), M.basket, 2.6, 0, 4.9, { uvs: 1 }); add(puffy(0.36, 0.2, 0.36, 0.09, 0.05), M.blanket, 2.6, 0.36, 4.9, { ry: 0.5 });
    add(new THREE.SphereGeometry(0.16, 32, 20), new THREE.MeshPhysicalMaterial({ color: 0xff5d4d, roughness: 0.3, clearcoat: 0.6 }), 8.6, 0.16, 2.2, { uv: false }); add(new THREE.SphereGeometry(0.162, 32, 20, 0, Math.PI * 2, 1.2, 0.7), paint(0xffffff, 0.3), 8.6, 0.16, 2.2, { uv: false, cast: false });
    const blk = (x, y, z, c, ry) => add(rbox(0.11, 0.11, 0.11, 0.014, 2), paint(c, 0.45), x, y, z, { ry, uv: false }); blk(9.3, 0.055, 3.3, C.sky, 0.3); blk(9.42, 0.055, 3.38, C.yellow, 0.9); blk(9.36, 0.165, 3.34, C.coral, 0.55); blk(9.6, 0.055, 3.15, C.teal, 0.1); }

  // —— 窗外：草地、绿篱、树、围栏、远山 ——
  add(new THREE.PlaneGeometry(90, 60), M.grass, 7, -0.02, 26, { rx: -Math.PI / 2, keepUV: true, cast: false }).geometry.attributes.uv.array.forEach((_, i, a) => { a[i] *= 22; });
  add(new THREE.PlaneGeometry(40, 30), M.grass, -20, -0.02, 3, { rx: -Math.PI / 2, keepUV: true, cast: false }).geometry.attributes.uv.array.forEach((_, i, a) => { a[i] *= 12; });
  const bush = (x, y, z, r, m, sq = 0.85) => { const g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const n = 1 + 0.1 * Math.sin(p.getX(i) * 9 + p.getY(i) * 7) * Math.cos(p.getZ(i) * 8); p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * sq, p.getZ(i) * n); } g.computeVertexNormals(); return add(g, m, x, y, z); };
  for (let i = 0; i < 16; i++) bush(-1 + i * 1.15, 0.75 + (i % 3) * 0.08, 12.5 + (i % 2) * 0.3, 0.85 + (i % 4) * 0.05, M.hedge);
  for (const [x, z, s] of [[2, 17, 1.2], [10.5, 15.5, 1.0], [15.5, 11, 0.9], [-6, 4, 1.1], [-5, 9.5, 0.9]]) { add(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 2.4 * s, 12), M.woodDark, x, 1.2 * s, z); bush(x, 3.3 * s, z, 1.6 * s, M.tree, 0.9); bush(x + 1.0 * s, 2.8 * s, z + 0.3, 1.0 * s, M.tree); bush(x - 0.9 * s, 2.9 * s, z - 0.3, 1.05 * s, M.tree); }
  for (let i = 0; i < 26; i++) { const x = -4 + i * 0.9; box(x - 0.36, 0.2, 9.96, x + 0.36, 1.05, 10.04, M.woodWhite, { r: 0.02 }); add(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), M.woodWhite, x - 0.45, 0.6, 10, { uv: false }); }
  { let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, fc = [C.coral, C.yellow, 0xffffff, C.pink, C.purple]; box(2.8, 0, 7.0, 8.2, 0.3, 7.7, M.clay, { r: 0.04 });
    for (let i = 0; i < 26; i++) { const x = 3 + rnd() * 5, z = 7.12 + rnd() * 0.46, h = 0.5 + rnd() * 0.3; add(new THREE.CylinderGeometry(0.012, 0.012, h - 0.28, 5), M.leaf, x, (h + 0.28) / 2, z, { uv: false, cast: false }); add(new THREE.SphereGeometry(0.07 + rnd() * 0.03, 10, 8), paint(fc[i % 5], 0.6), x, h + 0.04, z, { uv: false }); } }
  for (const [x, z, r, c] of [[-30, 60, 26, 0x8fd88a], [15, 75, 34, 0x7fcf86], [55, 62, 28, 0x9be39a], [-55, 20, 24, 0x8fd88a]]) add(new THREE.SphereGeometry(r, 32, 16), std({ color: c, roughness: 1 }), x, -r * 0.55, z, { uv: false, cast: false, recv: false });
  return { M, root };
}

// 盆栽：陶盆 + 一圈弯曲的大叶子
function leafGeo(len, wid, droop) {
  const g = new THREE.PlaneGeometry(1, 1, 6, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) + 0.5, s = p.getX(i) * 2, w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.97 + 0.03)), 0.7) * wid * (1 - t * 0.25); p.setXYZ(i, s * w / 2, t * len * Math.cos(t * droop) , -t * len * Math.sin(t * droop) * 0.9 + Math.abs(s) * Math.abs(s) * wid * 0.22); }
  g.computeVertexNormals(); return g;
}
function plant(root, M, x, y, z, s, small = false) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); root.add(g);
  const pot = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve([[0, 0], [0.19, 0.005], [0.23, 0.2], [0.27, 0.44], [0.285, 0.47], [0.26, 0.47], [0.24, 0.42], [0, 0.4]].map((q) => new THREE.Vector2(q[0], q[1]))).getPoints(40), 36), small ? M.clayBlue : M.clay); pot.castShadow = pot.receiveShadow = true; g.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.245, 24), new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.42; g.add(soil);
  const n = small ? 9 : 15; let seed = Math.round(x * 13 + z * 7) + 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const ring = i / n, len = (small ? 0.5 : 0.95) * (0.7 + rnd() * 0.5), lf = new THREE.Mesh(leafGeo(len, len * 0.42, 0.9 + rnd() * 0.7), i % 3 ? M.leaf : M.leaf2), piv = new THREE.Group(); piv.position.y = 0.42; piv.rotation.y = i * 2.4 + rnd() * 0.4; lf.rotation.x = -(0.15 + ring * 0.75 + rnd() * 0.2); lf.position.y = small ? 0.02 : 0.25 + (1 - ring) * 0.45; lf.castShadow = lf.receiveShadow = true; piv.add(lf); g.add(piv); lf.userData.sway = rnd() * 6; root.userData.leaves = (root.userData.leaves || []).concat([lf]); if (!small) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, lf.position.y + 0.05, 6), M.leaf2); st.position.y = lf.position.y / 2; piv.add(st); } }
}
function plantSmall(root, M, x, y, z) { plant(root, M, x, y, z, 0.42, true); }
