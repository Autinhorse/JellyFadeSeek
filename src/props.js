// 整件家具/墙体的高质量模型。输入是 world.js 里 helper 的参数，输出按材质合并的网格。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rugTexture } from './slice/tex.js';

const WALL_H = 2.8, WT = 0.2;
function worldUV(g, s = 1) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v; if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); } uv[i * 2] = u * s; uv[i * 2 + 1] = v * s; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
const rbox = (w, h, d, r = 0.03, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, Math.min(r, Math.min(w, h, d) * 0.49)));
const sbox = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function puffy(w, h, d, r, puff, seg = 6) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.49)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2), z = p.getZ(i) / (d / 2); const cx = Math.cos(Math.min(1, Math.abs(x)) * Math.PI / 2), cz = Math.cos(Math.min(1, Math.abs(z)) * Math.PI / 2), cy = Math.cos(Math.min(1, Math.abs(y)) * Math.PI / 2); p.setY(i, p.getY(i) + (y > 0 ? 1 : -0.3) * puff * cx * cz * Math.abs(y)); p.setX(i, p.getX(i) + x * cy * puff * 0.5 * cz); p.setZ(i, p.getZ(i) + z * cy * puff * 0.5 * cx); }
  g.computeVertexNormals(); return g;
}
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(new THREE.SplineCurve(pts.map((q) => new THREE.Vector2(q[0], q[1]))).getPoints(pts.length * 5), seg);
function leafGeo(len, wid, droop) {
  const g = new THREE.PlaneGeometry(1, 1, 4, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) + 0.5, s = p.getX(i) * 2, w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.97 + 0.03)), 0.7) * wid * (1 - t * 0.25); p.setXYZ(i, s * w / 2, t * len * Math.cos(t * droop), -t * len * Math.sin(t * droop) * 0.9 + s * s * wid * 0.22); }
  g.computeVertexNormals(); return g;
}
// 表面有起伏的圆球（树冠、灌木）
function bushGeo(r, sq = 0.88, seed = 0) {
  let g = new THREE.IcosahedronGeometry(r, 3); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4); const p = g.attributes.position; // 合并顶点，表面才是平滑的
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.1 * Math.sin(x * 7 / r + seed) * Math.cos(z * 6 / r + seed * 2) + 0.06 * Math.sin(y * 11 / r + seed * 3); p.setXYZ(i, x * n, y * n * sq, z * n); }
  g.computeVertexNormals(); return g;
}
// 细分的圆角长方体，表面带不规则起伏（修剪过的绿篱）
function lumpyBox(w, h, d, rad, amp) {
  let g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.ceil(w / 0.22)), Math.max(2, Math.ceil(h / 0.22)), Math.max(2, Math.ceil(d / 0.22))); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); q.set(THREE.MathUtils.clamp(v.x, -w / 2 + rad, w / 2 - rad), THREE.MathUtils.clamp(v.y, -h / 2 + rad, h / 2 - rad), THREE.MathUtils.clamp(v.z, -d / 2 + rad, d / 2 - rad)); const dir = v.clone().sub(q), l = dir.length(); const n = Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.7 + v.y * 2.1) + 0.5 * Math.sin(v.x * 11 + v.z * 9 + v.y * 7); if (l > 1e-5) { dir.multiplyScalar(1 / l); v.copy(q).addScaledVector(dir, rad + amp * n * (v.y > -h / 2 + 0.05 ? 1 : 0)); } p.setXYZ(i, v.x, Math.max(v.y, -h / 2), v.z); }
  g.computeVertexNormals(); return g;
}
const tintUp = (c, f = 0.3) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), f).getHex().toString(16);
const isWoody = (c) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return r > 150 && g > 100 && g < 215 && b < 150 && r > b + 60; };
const isWhite = (c) => ((c >> 16) & 255) > 235 && ((c >> 8) & 255) > 235 && (c & 255) > 215;
const shade = (c, f) => { const k = new THREE.Color(c); k.multiplyScalar(f); return k.getHex(); };

export class Builder {
  constructor(tex, world) { this.tex = tex; this.world = world; this.buckets = new Map(); this.matCache = new Map(); this.stack = [new THREE.Matrix4()]; this.lights = []; this.seed = 12345; }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  maps(t, rep, ns = 1) { const c = (x) => { const y = x.clone(); y.repeat.set(rep, rep); y.needsUpdate = true; return y; }; return { map: c(t.map), normalMap: c(t.normalMap), roughnessMap: c(t.roughnessMap), normalScale: new THREE.Vector2(ns, ns) }; }
  // 材质按 “种类:颜色” 缓存
  mat(key) {
    if (this.matCache.has(key)) return this.matCache.get(key);
    const [kind, hex, extra] = key.split(':'), color = hex ? parseInt(hex, 16) : 0xffffff, T = this.tex, S = (o) => new THREE.MeshStandardMaterial(o), P = (o) => new THREE.MeshPhysicalMaterial(o); let m;
    switch (kind) {
      case 'wood': m = S({ ...this.maps(T.wood, 1.1, 0.7), color, roughness: 1 }); break;
      case 'floor': m = S({ ...this.maps(T.floor, 1 / 1.6, 1), roughness: 1 }); break;
      case 'tile': m = S({ ...this.maps(T.tile, 1 / 2, 1), roughness: 1 }); break;
      case 'carpet': m = S({ ...this.maps(T.wool, 1.6, 1.3), color, roughness: 1 }); break;
      case 'concrete': m = S({ ...this.maps(T.plaster, 0.5, 1.2), color: 0xd4cdc2, roughness: 1 }); break;
      case 'wall': m = S({ ...this.maps(T.wallpaperN, 1 / 1.5, 0.6), color, roughness: 1 }); break;
      case 'siding': m = S({ ...this.maps(T.siding, 1 / 1.2, 1), color, roughness: 1 }); break;
      case 'plaster': m = S({ ...this.maps(T.plaster, 0.6, 0.5), color, roughness: 1 }); break;
      case 'trim': m = S({ ...this.maps(T.plaster, 1.2, 0.25), color: 0xfffdf6, roughness: 0.55 }); break;
      case 'fabric': m = P({ ...this.maps(T.fabric, 2.4, 0.9), color, roughness: 1, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6), side: extra === 'ds' ? THREE.DoubleSide : THREE.FrontSide }); break;
      case 'wool': m = S({ ...this.maps(T.wool, 3, 1.2), color, roughness: 1 }); break;
      case 'clay': m = S({ ...this.maps(T.clay, 2, 0.8), color, roughness: 1 }); break;
      case 'card': m = S({ ...this.maps(T.plaster, 2.2, 0.9), color, roughness: 0.95 }); break;
      case 'roof': m = S({ ...this.maps(T.roof, 1 / 1.4, 1.4), color, roughness: 1 }); break;
      case 'grass': m = S({ ...this.maps(T.grass, 0.5, 1), roughness: 1 }); break;
      case 'leafy': m = S({ ...this.maps(T.leavesN, 1.1, 0.9), color, roughness: 1 }); break;
      case 'bark': m = S({ ...this.maps(T.wood, 2.2, 1.8), color, roughness: 1 }); break;
      case 'hedge': { // 纯色 + 一层层深浅波浪，按世界坐标算，转角处不会错位
        m = S({ color: 0xffffff, roughness: 1 });
        m.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHW = (modelMatrix * vec4(position, 1.0)).xyz;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;').replace('#include <color_fragment>', `#include <color_fragment>
            float hv = vHW.y * 2.6 + 0.3 * sin(vHW.x * 3.3 + vHW.y * 0.7) + 0.3 * sin(vHW.z * 3.3 - vHW.y * 0.5) + 0.12 * sin((vHW.x + vHW.z) * 7.0);
            float hf = fract(hv), edge = smoothstep(0.0, 0.05, hf) * (1.0 - smoothstep(0.93, 1.0, hf));
            vec3 hDark = vec3(0.115, 0.42, 0.13), hLight = vec3(0.27, 0.72, 0.24);
            diffuseColor.rgb = mix(hDark, mix(hLight, mix(hLight, hDark, 0.55), hf), edge) * (0.86 + 0.14 * clamp(vHW.y * 0.55, 0.0, 1.0));`);
        };
        break; }
      case 'vcfol': m = S({ vertexColors: true, roughness: 1 }); break;
      case 'vcgrass': m = S({ vertexColors: true, roughness: 1 }); break;
      case 'leaf': m = P({ color, roughness: 0.45, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0xbfffb0), clearcoat: 0.3, clearcoatRoughness: 0.4 }); break;
      case 'metal': m = S({ color, roughness: 0.32, metalness: 0.85 }); break;
      case 'gloss': m = P({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 }); break;
      case 'glass': m = P({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.1, envMapIntensity: 2.5, depthWrite: false }); m.userData.noAO = true; break;
      case 'shade': m = S({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.9, side: THREE.DoubleSide }); break;
      case 'rug': m = S({ map: rugTexture(color, parseInt(extra, 16)), normalMap: (() => { const t = T.wool.normalMap.clone(); t.repeat.set(8, 5); t.needsUpdate = true; return t; })(), normalScale: new THREE.Vector2(1.3, 1.3), roughness: 1 }); break;
      case 'pic': m = S({ map: T.paintings[color % T.paintings.length], roughness: 0.7 }); break;
      case 'vc': m = S({ vertexColors: true, roughness: 0.6 }); break;
      case 'vcglow': m = S({ vertexColors: true, roughness: 0.8, emissive: 0xffe2a0, emissiveIntensity: 0.9 }); break;
      default: m = S({ color, roughness: extra ? parseFloat(extra) : 0.55 });
    }
    this.matCache.set(key, m); return m;
  }
  surf(color) { return isWoody(color) ? `wood:${color.toString(16)}` : isWhite(color) ? `wood:${(0xfff6e6).toString(16)}` : `paint:${color.toString(16)}:0.5`; }
  push(x, y, z, ry = 0) { const m = new THREE.Matrix4().makeRotationY(ry); m.setPosition(x, y, z); this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m)); }
  pop() { this.stack.pop(); }
  // 放一块几何体。o: ry/rx/rz 旋转, uv: 贴图密度(默认 1) 或 'keep', cast/recv 阴影
  put(g, matKey, x = 0, y = 0, z = 0, o = {}) {
    if (o.rx || o.ry || o.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)));
    g.translate(x, y, z); g.applyMatrix4(this.stack[this.stack.length - 1]);
    if (o.uv !== 'keep') worldUV(g, o.uv || 1);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    const key = matKey + (o.cast === false ? '|nc' : ''); if (!this.buckets.has(key)) this.buckets.set(key, []); this.buckets.get(key).push(g);
  }
  box(x0, y0, z0, x1, y1, z1, matKey, o = {}) { const w = x1 - x0, h = y1 - y0, d = z1 - z0; if (w < 0.002 || h < 0.002 || d < 0.002) return; this.put(o.sharp ? sbox(w, h, d) : rbox(w, h, d, o.r ?? 0.02, o.seg ?? 2), matKey, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o); }
  finish(scene) {
    const out = [];
    for (const [key, list] of this.buckets) { const matKey = key.replace('|nc', ''), g = mergeGeometries(list, false); list.forEach((q) => q.dispose()); const m = new THREE.Mesh(g, this.mat(matKey)); m.castShadow = !key.endsWith('|nc') && !matKey.startsWith('glass'); m.receiveShadow = !matKey.startsWith('glass'); m.matrixAutoUpdate = false; if (matKey.startsWith('glass')) { m.userData.noAO = true; m.renderOrder = 2; } scene.add(m); out.push(m); }
    this.buckets.clear(); return out;
  }
  tintAt(x, z) { for (const t of this.world.roomTints) if (x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1) return t.c; return null; }

  build(p) { const f = this['p_' + p.kind]; if (f) { f.call(this, p); return true; } return false; }
  has(kind) { return typeof this['p_' + kind] === 'function'; }

  // —— 院子 ——
  // 一团叶子：光滑的小圆球，纯色，上亮下暗。y0..y1 是整棵植物的高度范围，用来算明暗
  puff(x, y, z, r, color, y0, y1, detail = 2, squash = 0.92) {
    const tk = 'puff' + detail; if (!this[tk]) { let t = new THREE.IcosahedronGeometry(1, detail); t.deleteAttribute('normal'); t.deleteAttribute('uv'); t = mergeVertices(t, 1e-4); t.computeVertexNormals(); this[tk] = t; }
    const g = this[tk].clone(); g.rotateY(this.rnd() * 6.28); g.rotateX(this.rnd() * 6.28); g.scale(r, r * squash, r); g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color(color), hs = {}; c.getHSL(hs); c.setHSL(hs.h + (this.rnd() - 0.5) * 0.025, hs.s, hs.l * (0.96 + this.rnd() * 0.08));
    for (let i = 0; i < pos.count; i++) { const wy = y + pos.getY(i), t = THREE.MathUtils.clamp((wy - y0) / Math.max(0.01, y1 - y0), 0, 1), f = 0.7 + 0.3 * t + 0.1 * nor.getY(i); col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); this.put(g, 'vcfol', x, y, z);
  }
  p_hedge(p) { // 几段大圆角长方体拼起来，高矮略有不同
    const w = p.x1 - p.x0, d = p.z1 - p.z0, h = p.h ?? 1.9, horiz = w > d, len = horiz ? w : d, thick = horiz ? d : w, n = Math.max(1, Math.round(len / 2.6)), seg = len / n, dh = [0, -0.16, 0.07, -0.08];
    for (let i = 0; i < n; i++) {
      const hh = h + (n > 1 ? dh[i % 4] : 0), l = seg + (i < n - 1 ? 0.3 : 0), t = thick + (i % 2 ? 0.08 : 0), g = new RoundedBoxGeometry(horiz ? l : t, hh, horiz ? t : l, 7, Math.min(0.3, thick * 0.42, hh * 0.3));
      const c0 = (horiz ? p.x0 : p.z0) + seg * i + l / 2; this.put(g, 'hedge', horiz ? c0 : (p.x0 + p.x1) / 2, hh / 2, horiz ? (p.z0 + p.z1) / 2 : c0);
    }
  }
  p_tree(p) { // 树冠：几个大圆球，纯色，上亮下暗
    const s = p.s ?? 1, c1 = p.c1 ?? 0x4fc257, c2 = p.c2 ?? 0x6fd966, far = !!p.far, trunk = 'paint:a8713f:0.95'; this.push(p.x, 0, p.z, this.rnd() * 6);
    this.put(lathe([[0.42 * s, 0], [0.31 * s, 0.12 * s], [0.25 * s, 0.45 * s], [0.21 * s, 1.3 * s], [0.19 * s, 2.0 * s], [0.25 * s, 2.5 * s]], 20), trunk, 0, 0, 0);
    if (!far) { for (let k = 0; k < 5; k++) { const a = k * 1.257 + 0.3, g = new THREE.SphereGeometry(0.16 * s, 10, 8); g.scale(1.5, 0.75, 0.8); g.rotateY(-a); this.put(g, trunk, Math.cos(a) * 0.36 * s, 0.05 * s, Math.sin(a) * 0.36 * s); }
      for (const [a, len] of [[0.6, 0.95], [-2.2, 0.85]]) { const g = new THREE.CylinderGeometry(0.06 * s, 0.11 * s, len * s, 10); g.translate(0, len * s / 2, 0); g.rotateZ(0.9); g.rotateY(a); this.put(g, trunk, 0, 1.65 * s, 0); } }
    const y0 = 1.5 * s, y1 = 5.0 * s;
    for (const [bx, by, bz, R, c] of [[0, 3.05, 0, 1.5, c1], [1.05, 2.65, 0.3, 1.1, c2], [-0.95, 2.75, -0.4, 1.15, c2], [0.1, 3.95, 0.2, 1.05, c2], [-0.2, 2.55, 1.0, 0.9, c1]]) this.puff(bx * s, by * s, bz * s, R * s, c, y0, y1, far ? 2 : 3, 0.9);
    this.pop();
  }
  p_flowerbed(p) {
    const { x0, z0, x1, z1 } = p, cols = [0xff7a6b, 0xffc94a, 0xffb7c8, 0xffffff, 0xb48cff, 0xff6b6b, 0x6ba8ff];
    this.box(x0, 0, z0, x1, 0.4, z1, 'clay:f0a98c', { r: 0.05 }); for (const [a, b, c, d] of [[x0 - 0.03, z0 - 0.03, x1 + 0.03, z0 + 0.1], [x0 - 0.03, z1 - 0.1, x1 + 0.03, z1 + 0.03], [x0 - 0.03, z0, x0 + 0.1, z1], [x1 - 0.1, z0, x1 + 0.03, z1]]) this.box(a, 0.36, b, c, 0.46, d, 'clay:ffb99c', { r: 0.03 }); this.box(x0 + 0.08, 0.3, z0 + 0.08, x1 - 0.08, 0.41, z1 - 0.08, 'paint:6b4a35:1', { sharp: true, cast: false });
    for (let x = x0 + 0.3; x < x1 - 0.15; x += 0.4) for (let z = z0 + 0.28; z < z1 - 0.15; z += 0.4) {
      const jx = x + (this.rnd() - 0.5) * 0.16, jz = z + (this.rnd() - 0.5) * 0.14, hh = 0.66 + this.rnd() * 0.28, c = cols[Math.floor(this.rnd() * cols.length)].toString(16), tilt = (this.rnd() - 0.5) * 0.5, yaw = this.rnd() * 6.28;
      this.put(new THREE.CylinderGeometry(0.012, 0.016, hh - 0.4, 5), 'paint:4fae58:0.7', jx, (hh + 0.4) / 2, jz, { cast: false });
      this.push(jx, hh, jz, yaw); const head = (g, key, x2, y2, z2) => { g.translate(x2, y2, z2); g.rotateX(0.5 + tilt); this.put(g, key, 0, 0, 0); };
      const pc = new THREE.SphereGeometry(0.04, 8, 6); pc.scale(1, 0.6, 1); head(pc, 'paint:ffc94a:0.6', 0, 0.02, 0);
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283, pg = new THREE.SphereGeometry(0.05, 8, 6); pg.scale(1, 0.32, 0.72); pg.rotateZ(0.25); pg.rotateY(-a); head(pg, `paint:${c}:0.55`, Math.cos(a) * 0.072, 0.005, Math.sin(a) * 0.072); }
      this.pop();
      for (const sd of [-1, 1]) { const lg = new THREE.SphereGeometry(0.07, 7, 5); lg.scale(1, 0.25, 0.5); lg.rotateZ(sd * 0.5); lg.rotateY(yaw); this.put(lg, 'leaf:46a84f', jx + Math.cos(yaw) * sd * 0.06, 0.5 + this.rnd() * 0.08, jz - Math.sin(yaw) * sd * 0.06, { cast: false }); }
    }
  }
  p_fence(p) {
    const { axis, at, from, to, gate } = p, key = 'wood:fff6e6';
    const B = (a, b, y0, y1, half, o) => { if (axis === 'x') this.box(a, y0, at - half, b, y1, at + half, key, o); else this.box(at - half, y0, a, at + half, y1, b, key, o); };
    const tip = (t) => { const g = new THREE.ConeGeometry(0.068, 0.1, 4); g.rotateY(Math.PI / 4); g.scale(axis === 'x' ? 1 : 0.34, 1, axis === 'x' ? 0.34 : 1); this.put(g, key, axis === 'x' ? t : at, 1.15, axis === 'x' ? at : t); };
    for (let t = from; t < to - 0.01; t += 2) {
      const a = t, b = Math.min(to, t + 2); if (gate && a >= gate[0] - 0.01 && b <= gate[1] + 0.01) continue;
      B(a - 0.055, a + 0.055, 0, 1.3, 0.055, { r: 0.015 }); this.put(new THREE.SphereGeometry(0.065, 10, 8), key, axis === 'x' ? a : at, 1.34, axis === 'x' ? at : a);
      B(a, b, 0.32, 0.4, 0.02, { r: 0.008 }); B(a, b, 0.86, 0.94, 0.02, { r: 0.008 });
      const n = Math.round((b - a) / 0.166); for (let i = 1; i < n; i++) { const c = a + (b - a) * i / n; B(c - 0.048, c + 0.048, 0.12, 1.1, 0.012 + 0.02, { sharp: true }); tip(c); }
    }
  }
  // 草丛、远处的小山和树
  lawn() {
    const W = this.world, pos = [], col = [], nor = [], c = new THREE.Color(), inRect = (x, z, r) => x > r[0] && x < r[2] && z > r[1] && z < r[3], skip = [[5.7, 2.7, 34.3, 18.3], [34.3, 24.5, 38.3, 28.3], [22.5, 21.1, 25.1, 23.3], [19.9, 18.2, 22.1, 29.6], [20.2, 0.2, 21.8, 3]];
    for (let i = 0; i < 26000; i++) {
      const x = -6 + this.rnd() * 52, z = -6 + this.rnd() * 42; if (skip.some((r) => inRect(x, z, r))) continue;
      const n = 3, hh = 0.05 + this.rnd() * 0.07, base = this.rnd() * 6.28; c.setHex(this.rnd() > 0.5 ? 0x8fe678 : 0x7fdc6a).lerp(new THREE.Color(0xb9f29a), this.rnd() * 0.5);
      for (let k = 0; k < n; k++) { const a = base + k * 2.1, w = 0.018, dx = Math.cos(a), dz = Math.sin(a), lean = 0.03 + this.rnd() * 0.05, bx = x + dx * 0.03, bz = z + dz * 0.03; const A = [bx - dz * w, 0, bz + dx * w], Bq = [bx + dz * w, 0, bz - dx * w], T2 = [bx + dx * lean, hh, bz + dz * lean]; for (const tri of [[A, Bq, T2], [Bq, A, T2]]) for (let q = 0; q < 3; q++) { pos.push(...tri[q]); nor.push(0, 1, 0); const f = q === 2 ? 1.12 : 1.0; col.push(c.r * f, c.g * f, c.b * f); } }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    const key = 'vcgrass|nc'; if (!this.buckets.has(key)) this.buckets.set(key, []); this.buckets.get(key).push(g);
    for (const [x, z, s, c1, c2] of [[-7, 6, 1.4], [-6, 22, 1.2], [47, 9, 1.3], [48, 25, 1.5, 0xf5a9c5, 0xffc9dc], [9, -7, 1.3], [30, -8, 1.5], [7, 37, 1.4], [33, 38, 1.2], [-9, 34, 1.6], [49, -5, 1.4]]) this.p_tree({ x, z, s, c1, c2, far: true });
    for (const [x, z, r, cc] of [[-40, -30, 30, 0x8fd88a], [20, -70, 44, 0x7fcf86], [85, -20, 34, 0x9be39a], [95, 45, 30, 0x8fd88a], [20, 100, 46, 0x86d48a], [-60, 50, 32, 0x9be39a]]) this.put(new THREE.SphereGeometry(r, 28, 14), `paint:${cc.toString(16)}:1`, x, -r * 0.55, z, { cast: false });
    void W;
  }
  // —— 地板 ——
  floors() {
    for (const f of this.world.floors) { const y = f.type === 'wood' ? 0.006 : 0.016, key = f.type === 'wood' ? 'floor' : f.type === 'carpet' ? `carpet:${f.color.toString(16)}` : f.type; this.box(f.x0, y - 0.1, f.z0, f.x1, y, f.z1, key, { sharp: true, cast: false }); }
  }
  // —— 墙：墙芯 + 两面墙皮（室内墙纸/室外木板）+ 护墙板、踢脚线、顶角线、门窗框 ——
  p_wall(w) {
    const { axis, at, from, to } = w, gaps = (w.gaps || []).slice().sort((a, b) => a.a - b.a), H = WALL_H;
    const B = (a, b, y0, y1, d0, d1, key, o) => { if (b - a < 0.004) return; if (axis === 'x') this.box(a, y0, at + d0, b, y1, at + d1, key, o); else this.box(at + d0, y0, a, at + d1, y1, b, key, o); };
    const tint = (side, t) => (axis === 'x' ? this.tintAt(t, at + side * 0.4) : this.tintAt(at + side * 0.4, t));
    // 把 [a,b] 按房间边界切开
    const spans = (side, a, b) => { const cuts = [a, b]; for (const r of this.world.roomTints) for (const v of axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1]) if (v > a + 0.02 && v < b - 0.02) cuts.push(v); cuts.sort((p, q) => p - q); const out = []; for (let i = 0; i < cuts.length - 1; i++) if (cuts[i + 1] - cuts[i] > 0.02) out.push([cuts[i], cuts[i + 1], tint(side, (cuts[i] + cuts[i + 1]) / 2)]); return out; };
    const skin = (a, b, y0, y1, wains) => {
      if (b - a < 0.01 || y1 - y0 < 0.01) return; B(a, b, y0, y1, -WT / 2 + 0.012, WT / 2 - 0.012, 'plaster:ffffff', { sharp: true });
      for (const side of [-1, 1]) for (const [p, q, c] of spans(side, a, b)) {
        const d = (t0, t1) => (side > 0 ? [WT / 2 - 0.012 + t0, WT / 2 - 0.012 + t1] : [-WT / 2 + 0.012 - t1, -WT / 2 + 0.012 - t0]);
        if (c === null) { B(p, q, y0, y1, ...d(0, 0.012), 'siding:fff0d6', { sharp: true }); if (y0 < 0.01) B(p, q, 0, 0.3, ...d(0.012, 0.035), 'plaster:d9d2c5', { sharp: true, cast: false }); continue; }
        B(p, q, y0, y1, ...d(0, 0.012), `wall:${c.toString(16)}`, { sharp: true, cast: false });
        if (y1 > H - 0.02) B(p, q, H - 0.1, H, ...d(0.012, 0.06), 'trim', { r: 0.015, cast: false });
        const top = wains === true ? 0.95 : wains; if (!top || y0 > 0.01) continue;
        B(p, q, 0.1, top, ...d(0.012, 0.026), 'trim', { sharp: true, cast: false }); B(p, q, top, top + 0.05, ...d(0.012, 0.045), 'trim', { r: 0.012, cast: false }); B(p, q, 0, 0.11, ...d(0.012, 0.038), 'trim', { r: 0.008, cast: false });
        if (top < 0.5) continue; const n = Math.max(1, Math.round((q - p) / 0.8)), pw = (q - p) / n;
        for (let i = 0; i < n; i++) { const a0 = p + i * pw + 0.09, a1 = p + (i + 1) * pw - 0.09; if (a1 - a0 < 0.1) continue; B(a0, a1, top - 0.11, top - 0.095, ...d(0.026, 0.036), 'trim', { sharp: true, cast: false }); B(a0, a1, 0.2, 0.215, ...d(0.026, 0.036), 'trim', { sharp: true, cast: false }); B(a0, a0 + 0.015, 0.2, top - 0.095, ...d(0.026, 0.036), 'trim', { sharp: true, cast: false }); B(a1 - 0.015, a1, 0.2, top - 0.095, ...d(0.026, 0.036), 'trim', { sharp: true, cast: false }); }
      }
    };
    let cur = from;
    for (const g of gaps) {
      skin(cur, g.a, 0, H, true);
      const top = g.type === 'door' ? 2.1 : g.type === 'open' ? 2.3 : g.type === 'vault' ? 2.0 : 2.1, bot = g.type === 'window' ? 0.9 : g.type === 'vault' ? 0.35 : 0;
      skin(g.a, g.b, top, H, false); if (bot > 0) skin(g.a, g.b, 0, bot, bot > 0.5 ? bot - 0.07 : 0.28);
      const fk = 'wood:fff6e6', dep = 0.125;
      B(g.a - 0.07, g.a + 0.025, bot, top + 0.07, -dep, dep, fk, { r: 0.012 }); B(g.b - 0.025, g.b + 0.07, bot, top + 0.07, -dep, dep, fk, { r: 0.012 }); B(g.a - 0.07, g.b + 0.07, top - 0.02, top + 0.08, -dep, dep, fk, { r: 0.012 });
      if (bot > 0) { B(g.a - 0.11, g.b + 0.11, bot - 0.05, bot + 0.005, -0.2, 0.2, fk, { r: 0.018 }); }
      if (g.type === 'window') { const n = Math.max(2, Math.round((g.b - g.a) / 1.0)); for (let i = 1; i < n; i++) { const t = g.a + (g.b - g.a) * i / n; B(t - 0.02, t + 0.02, bot, top, -0.03, 0.03, fk, { r: 0.008 }); } B(g.a, g.b, bot + (top - bot) * 0.62, bot + (top - bot) * 0.62 + 0.04, -0.03, 0.03, fk, { r: 0.008 });
        const pg = new THREE.PlaneGeometry(g.b - g.a, top - bot); if (axis === 'x') this.put(pg, 'glass', (g.a + g.b) / 2, (top + bot) / 2, at, { uv: 'keep', cast: false }); else this.put(pg, 'glass', at, (top + bot) / 2, (g.a + g.b) / 2, { uv: 'keep', cast: false, ry: Math.PI / 2 }); }
      cur = g.b;
    }
    skin(cur, to, 0, H, true);
  }
  // —— 家具 ——
  oriented(x0, z0, x1, z1, side, fn) { // 局部坐标：长边沿 x，“背面/正面”朝 +z
    const horiz = side === 'n' || side === 's', w = horiz ? x1 - x0 : z1 - z0, d = horiz ? z1 - z0 : x1 - x0; this.push((x0 + x1) / 2, 0, (z0 + z1) / 2, { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[side]); fn(w, d); this.pop();
  }
  p_sofa(p) {
    const m = `fabric:${p.color.toString(16)}`, c1 = `fabric:${p.cushion.toString(16)}`, c2 = 'fabric:fff1dc';
    this.oriented(p.x0, p.z0, p.x1, p.z1, p.back, (w, d) => {
      this.put(rbox(w, 0.3, d, 0.08, 3), m, 0, 0.27, 0); this.put(puffy(w - 0.06, 0.58, 0.28, 0.12, 0.05), m, 0, 0.7, d / 2 - 0.15, { rx: 0.12 });
      for (const s of [-1, 1]) this.put(puffy(0.25, 0.48, d + 0.02, 0.11, 0.035), m, s * (w / 2 - 0.125), 0.49, 0);
      const n = Math.max(1, Math.round((w - 0.5) / 0.85)), sw = (w - 0.52) / n;
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * sw; this.put(puffy(sw - 0.03, 0.19, d - 0.3, 0.07, 0.055), m, x, 0.5, -0.11); this.put(puffy(sw - 0.06, 0.42, 0.19, 0.08, 0.06), m, x, 0.82, d / 2 - 0.3, { rx: 0.22 }); }
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.put(new THREE.CylinderGeometry(0.035, 0.025, 0.12, 10), 'wood:b07642', x * (w / 2 - 0.12), 0.06, z * (d / 2 - 0.1));
      this.put(puffy(0.4, 0.4, 0.13, 0.07, 0.08), c1, -(w / 2 - 0.5), 0.8, d / 2 - 0.47, { rx: 0.3, rz: 0.2 }); if (n > 1) { this.put(puffy(0.4, 0.4, 0.13, 0.07, 0.08), c1, w / 2 - 0.5, 0.8, d / 2 - 0.47, { rx: 0.3, rz: -0.22 }); this.put(puffy(0.34, 0.34, 0.12, 0.06, 0.07), c2, -(w / 2 - 0.92), 0.78, d / 2 - 0.5, { rx: 0.32, rz: -0.12 }); }
    });
  }
  p_table(p) {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, w = p.x1 - p.x0, d = p.z1 - p.z0, top = this.surf(p.color), leg = this.surf(p.legColor ?? 0xb07642);
    this.put(rbox(w, 0.06, d, 0.025, 3), top, cx, p.topY + 0.045, cz); this.put(rbox(w - 0.14, 0.07, d - 0.14, 0.01, 1), leg, cx, p.topY - 0.02, cz);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.put(new THREE.CylinderGeometry(0.036, 0.026, p.topY, 12), leg, cx + sx * (w / 2 - 0.08), p.topY / 2, cz + sz * (d / 2 - 0.08));
  }
  p_chair(p) {
    const m = this.surf(p.color), leg = 'wood:b07642'; this.push(p.x, 0, p.z, { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[p.dir]);
    this.put(puffy(0.44, 0.06, 0.44, 0.03, 0.02, 4), m, 0, 0.45, 0); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.put(new THREE.CylinderGeometry(0.022, 0.018, sz > 0 ? 1.0 : 0.43, 8), leg, sx * 0.18, sz > 0 ? 0.5 : 0.215, sz * 0.18);
    this.put(rbox(0.42, 0.26, 0.035, 0.03, 2), m, 0, 0.86, 0.185, { rx: 0.06 }); this.put(rbox(0.38, 0.05, 0.03, 0.012, 1), m, 0, 0.62, 0.183); this.pop();
  }
  p_bed(p) {
    const frame = this.surf(p.color), bl = `fabric:${p.blanket.toString(16)}`;
    this.oriented(p.x0, p.z0, p.x1, p.z1, p.head === 'w' ? 'w' : p.head === 'e' ? 'e' : p.head, (wRaw, dRaw) => { // 局部：床头在 +z，床长沿 z
      const w = wRaw, L = dRaw; this.put(rbox(w, 0.12, L, 0.03, 2), 'wood:b07642', 0, 0.56, 0); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.put(new THREE.CylinderGeometry(0.05, 0.04, 0.5, 10), 'wood:b07642', sx * (w / 2 - 0.08), 0.25, sz * (L / 2 - 0.08));
      this.put(puffy(w - 0.06, 0.24, L - 0.06, 0.09, 0.03), 'fabric:ffffff', 0, 0.74, 0); this.put(puffy(w + 0.02, 0.2, L * 0.62, 0.09, 0.05), bl, 0, 0.8, -L * 0.19 + 0.01); this.put(rbox(w + 0.03, 0.06, 0.16, 0.03, 2), 'fabric:ffffff', 0, 0.905, L * 0.12 + 0.02);
      const np = w > 1.4 ? 2 : 1; for (let i = 0; i < np; i++) this.put(puffy(np > 1 ? w / 2 - 0.16 : w - 0.3, 0.13, 0.4, 0.06, 0.07), 'fabric:ffffff', np > 1 ? (i - 0.5) * (w / 2) : 0, 0.93, L / 2 - 0.3, { rx: -0.12 });
      this.put(rbox(w + 0.06, 1.25, 0.1, 0.05, 3), frame, 0, 0.625, L / 2 + 0.01); this.put(puffy(w - 0.12, 0.5, 0.06, 0.03, 0.03, 4), bl, 0, 0.92, L / 2 - 0.045);
    });
  }
  p_cabinet(p) {
    const { x0, z0, x1, z1, h, front } = p, body = this.surf(p.color), horiz = front === 'n' || front === 's', fridge = h > 1.8 && !isWoody(p.color), bk = fridge ? `gloss:${p.color.toString(16)}` : body;
    this.box(x0, 0.05, z0, x1, h, z1, bk, { r: 0.03 }); if (!fridge) { this.box(x0 - 0.012, h - 0.01, z0 - 0.012, x1 + 0.012, h + 0.03, z1 + 0.012, body, { r: 0.012 }); this.box(x0 + 0.03, 0, z0 + 0.03, x1 - 0.03, 0.06, z1 - 0.03, 'paint:3a3550:0.6', { sharp: true }); }
    const len = horiz ? x1 - x0 : z1 - z0, n = Math.max(1, Math.round(len / 0.6)), rows = h > 1.5 ? [[0.1, h * 0.62], [h * 0.62 + 0.03, h - 0.06]] : h > 0.7 ? [[0.1, h - 0.3], [h - 0.27, h - 0.06]] : [[0.1, h - 0.06]];
    const door = shade(p.color, isWhite(p.color) ? 0.96 : 1.08) , dk = fridge ? bk : this.surf(Math.min(0xffffff, door)), knob = fridge ? 'metal:d9dde6' : `metal:${(p.knob ?? 0xffc94a).toString(16)}`;
    for (const [y0, y1] of rows) for (let i = 0; i < n; i++) { const a = (horiz ? x0 : z0) + len * i / n + 0.025, b = (horiz ? x0 : z0) + len * (i + 1) / n - 0.025, f = front === 's' ? z1 : front === 'n' ? z0 : front === 'e' ? x1 : x0, sgn = front === 's' || front === 'e' ? 1 : -1, mid = (a + b) / 2 + (i % 2 ? -1 : 1) * (b - a) * 0.3, ky = y1 - y0 > 0.5 ? (y0 + y1) / 2 : (y0 + y1) / 2;
      if (horiz) { this.box(a, y0, Math.min(f, f + sgn * 0.02), b, y1, Math.max(f, f + sgn * 0.02), dk, { r: 0.008, cast: false }); if (fridge) this.box(mid - 0.012, ky - 0.14, Math.min(f + sgn * 0.02, f + sgn * 0.055), mid + 0.012, ky + 0.14, Math.max(f + sgn * 0.02, f + sgn * 0.055), knob, { r: 0.01 }); else this.put(new THREE.SphereGeometry(0.022, 10, 8), knob, mid, ky, f + sgn * 0.035); }
      else { this.box(Math.min(f, f + sgn * 0.02), y0, a, Math.max(f, f + sgn * 0.02), y1, b, dk, { r: 0.008, cast: false }); if (fridge) this.box(Math.min(f + sgn * 0.02, f + sgn * 0.055), ky - 0.14, mid - 0.012, Math.max(f + sgn * 0.02, f + sgn * 0.055), ky + 0.14, mid + 0.012, knob, { r: 0.01 }); else this.put(new THREE.SphereGeometry(0.022, 10, 8), knob, f + sgn * 0.035, ky, mid); } }
  }
  p_shelf(p) {
    const { x0, z0, x1, z1, h } = p, horiz = x1 - x0 > z1 - z0, metal = !isWoody(p.color) && !isWhite(p.color), fk = metal ? 'metal:aab4c4' : this.surf(p.color), len = horiz ? x1 - x0 : z1 - z0, dep = horiz ? z1 - z0 : x1 - x0;
    this.push(horiz ? x0 : (x0 + x1) / 2, 0, horiz ? (z0 + z1) / 2 : z0, horiz ? 0 : -Math.PI / 2); // 局部：沿 +x 延伸，厚度沿 z
    if (metal) { for (const x of [0.03, len - 0.03]) for (const z of [-dep / 2 + 0.03, dep / 2 - 0.03]) this.put(sbox(0.035, h, 0.035), fk, x, h / 2, z); }
    else { this.box(0, 0, -dep / 2, 0.04, h, dep / 2, fk, { r: 0.01 }); this.box(len - 0.04, 0, -dep / 2, len, h, dep / 2, fk, { r: 0.01 }); this.box(-0.02, h - 0.03, -dep / 2 - 0.015, len + 0.02, h + 0.02, dep / 2 + 0.015, fk, { r: 0.012 }); if (len > 1.6) this.box(len / 2 - 0.02, 0, -dep / 2, len / 2 + 0.02, h, dep / 2, fk, { r: 0.008 }); }
    const cols = [0xff7a6b, 0xffc94a, 0x6ba8ff, 0x57c2b8, 0xb48cff, 0xfff1dc, 0xff8a3d, 0x4a5a8c, 0xff9db5, 0x8fd16d], pick = () => cols[Math.floor(this.rnd() * cols.length)];
    const step = metal ? 0.6 : 0.42;
    for (let y = 0.08; y < h - 0.25; y += step) {
      this.box(0.01, y - 0.03, -dep / 2 + 0.005, len - 0.01, y, dep / 2 - 0.005, fk, { r: 0.006 }); if (p.stuff === false) continue; let t = 0.07;
      while (t < len - 0.12) {
        if (metal) { const k = this.rnd(), s = 0.22 + this.rnd() * 0.16; if (k < 0.5) { this.put(rbox(s, s * 0.8, Math.min(dep - 0.06, s), 0.012, 1), `card:${k < 0.25 ? 'e8c98f' : 'dcb97c'}`, t + s / 2, y + s * 0.4, 0, { ry: (this.rnd() - 0.5) * 0.2 }); } else if (k < 0.8) { const r = 0.07 + this.rnd() * 0.03; this.put(new THREE.CylinderGeometry(r, r, 0.2, 14), `gloss:${pick().toString(16)}`, t + r, y + 0.1, 0); this.put(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.015, 14), 'metal:d9dde6', t + r, y + 0.207, 0); } t += s + 0.05 + this.rnd() * 0.2; continue; }
        if (len - t > 0.5 && this.rnd() < 0.1) { const c = pick(); if (this.rnd() < 0.5) { this.put(new THREE.SphereGeometry(0.1, 16, 12), `gloss:${c.toString(16)}`, t + 0.14, y + 0.13, 0); this.put(new THREE.CylinderGeometry(0.04, 0.055, 0.04, 12), 'metal:d9c38a', t + 0.14, y + 0.02, 0); } else this.put(lathe([[0, 0], [0.05, 0.003], [0.075, 0.07], [0.05, 0.17], [0.026, 0.23], [0.038, 0.25], [0.03, 0.25], [0, 0.23]], 18), `gloss:${c.toString(16)}`, t + 0.14, y, 0); t += 0.32; continue; }
        if (len - t > 0.4 && this.rnd() < 0.1) { for (let k = 0; k < 3; k++) this.put(rbox(0.25, 0.038, Math.min(0.19, dep - 0.04), 0.006, 1), `paint:${pick().toString(16)}:0.6`, t + 0.14, y + 0.02 + k * 0.039, 0, { ry: (this.rnd() - 0.5) * 0.3 }); t += 0.31; continue; }
        const bw = 0.03 + this.rnd() * 0.04, bh = Math.min(step - 0.08, 0.2 + this.rnd() * 0.13), lean = this.rnd() < 0.07 ? 0.18 : 0; this.put(rbox(bw, bh, Math.min(dep - 0.05, 0.2 + this.rnd() * 0.06), 0.006, 1), `paint:${pick().toString(16)}:0.55`, t + bw / 2 + lean * bh * 0.5, y + bh / 2, 0, { rz: -lean }); t += bw + 0.006 + lean * bh + (this.rnd() < 0.06 ? 0.1 : 0);
      }
    }
    this.pop();
  }
  p_plant(p) {
    const s = p.s ?? 1, pot = `clay:${(p.potColor ?? 0xff7a6b).toString(16)}`; this.push(p.x, 0, p.z);
    this.put(lathe([[0, 0], [0.16 * s, 0.004], [0.2 * s, 0.17 * s], [0.235 * s, 0.38 * s], [0.25 * s, 0.41 * s], [0.225 * s, 0.41 * s], [0.2 * s, 0.36 * s], [0, 0.34 * s]], 24), pot, 0, 0, 0); this.put(new THREE.CircleGeometry(0.205 * s, 18), 'paint:6b4a35:1', 0, 0.36 * s, 0, { rx: -Math.PI / 2, cast: false });
    const n = 13; for (let i = 0; i < n; i++) { const ring = i / n, len = 0.72 * s * (0.7 + this.rnd() * 0.5), g = leafGeo(len, len * 0.42, 0.9 + this.rnd() * 0.7), tilt = -(0.15 + ring * 0.75 + this.rnd() * 0.2), yaw = i * 2.4 + this.rnd() * 0.4, y = 0.36 * s + 0.12 * s + (1 - ring) * 0.3 * s; g.rotateX(tilt); g.translate(0, y, 0); g.rotateY(yaw); this.put(g, i % 3 ? 'leaf:46a84f' : 'leaf:6cc463', 0, 0, 0, { uv: 'keep' }); const st = new THREE.CylinderGeometry(0.01 * s, 0.014 * s, y - 0.3 * s, 5); st.translate(0, (y + 0.3 * s) / 2, 0); this.put(st, 'leaf:6cc463', 0, 0, 0); }
    this.pop();
  }
  p_lamp(p) {
    const c = (p.color ?? 0xffc94a).toString(16); this.put(new THREE.CylinderGeometry(0.17, 0.19, 0.03, 24), 'metal:d9c38a', p.x, 0.015, p.z); this.put(new THREE.CylinderGeometry(0.014, 0.014, 1.5, 8), 'metal:d9c38a', p.x, 0.76, p.z);
    this.put(new THREE.CylinderGeometry(0.17, 0.25, 0.32, 24, 1, true), `shade:${c}`, p.x, 1.62, p.z, { cast: false }); this.lights.push({ x: p.x, y: 1.5, z: p.z, i: 2.2, d: 5.5 });
  }
  p_crate(p) {
    const { x, z, s, h } = p, top = h + s * 0.85, m = `card:${p.color.toString(16)}`; this.push(x, 0, z, (this.rnd() - 0.5) * 0.16);
    this.put(rbox(s, s * 0.85, s, 0.015, 1), m, 0, h + s * 0.425, 0); this.put(sbox(s + 0.004, 0.003, 0.07), 'paint:f1dfb4:0.4', 0, top + 0.001, 0, { cast: false }); this.put(sbox(0.07, s * 0.3, s + 0.004), 'paint:f1dfb4:0.4', 0, top - s * 0.15, 0, { cast: false }); this.put(sbox(s + 0.002, 0.004, 0.006), 'paint:8a6a3c:0.9', 0, top + 0.001, s * 0.25, { cast: false }); this.pop();
  }
  p_rug(p) {
    const w = p.x1 - p.x0, d = p.z1 - p.z0, horiz = w >= d, g = rbox(horiz ? w : d, 0.028, horiz ? d : w, 0.012, 1), pos = g.attributes.position, uv = g.attributes.uv, W2 = horiz ? w : d, D2 = horiz ? d : w;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W2 + 0.5, 0.5 - pos.getZ(i) / D2);
    this.put(g, `rug:${p.c1.toString(16)}:${p.c2.toString(16)}`, (p.x0 + p.x1) / 2, 0.026, (p.z0 + p.z1) / 2, { uv: 'keep', cast: false, ry: horiz ? 0 : Math.PI / 2 });
  }
  p_picture(p) {
    const { axis, at, c, y, w, h } = p, tint = axis === 'x' ? this.tintAt(c, at + 0.3) : this.tintAt(at + 0.3, c), sgn = tint !== null ? 1 : -1; this.picN = (this.picN || 0) + 1; // 朝有房间的那一侧
    this.push(axis === 'x' ? c : at, y + h / 2, axis === 'x' ? at : c, axis === 'x' ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? Math.PI / 2 : -Math.PI / 2));
    this.put(rbox(w + 0.09, h + 0.09, 0.035, 0.012, 1), 'wood:e2a968', 0, 0, 0.012); this.put(new THREE.PlaneGeometry(w + 0.01, h + 0.01), 'paint:fffaf0:0.9', 0, 0, 0.031, { uv: 'keep', cast: false }); this.put(new THREE.PlaneGeometry(w - 0.07, h - 0.07), `pic:${this.picN % 3}`, 0, 0, 0.033, { uv: 'keep', cast: false }); this.pop();
  }
  p_curtain(p) {
    const horiz = p.x1 - p.x0 > p.z1 - p.z0, w = Math.max(horiz ? p.x1 - p.x0 : p.z1 - p.z0, 0.3) * 1.25, h = 2.32, g = new THREE.PlaneGeometry(w, h, 30, 8), pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const u = pos.getX(i) / w + 0.5, v = pos.getY(i) / h + 0.5; pos.setZ(i, Math.sin(u * Math.PI * 2 * 3.5) * 0.045 * (0.75 + 0.25 * (1 - v)) + Math.sin(u * 31) * 0.008); pos.setX(i, pos.getX(i) * (0.92 + 0.08 * (1 - v))); uv.setXY(i, u * w * 3, v * h * 1.4); }
    g.computeVertexNormals(); const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2; this.put(g, `fabric:${p.color.toString(16)}:ds`, cx, 0.1 + h / 2, cz, { uv: 'keep', ry: horiz ? 0 : Math.PI / 2 });
    const rod = new THREE.CylinderGeometry(0.016, 0.016, w + 0.16, 8); this.put(rod, 'metal:d9c38a', cx, 2.44, cz, horiz ? { rz: Math.PI / 2 } : { rx: Math.PI / 2 });
  }
}
