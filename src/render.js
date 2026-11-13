// 画面：把地图数据变成卡通风格的 Three.js 场景
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { CONFIG as C } from './config.js';
import { buildTextures } from './slice/tex.js';
import { Builder } from './props.js';
import { makeJelly, makeHunter } from './slice/chars.js';
import { HUNTER_COLORS, MAX_HIDERS, MAX_HUNTERS } from './sim.js';

const tmpC = new THREE.Color();
const OUT = 0.022; // 轮廓线粗细（米）

function toonGradient() {
  const d = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
export const GRADIENT = toonGradient();

function shapeGeo(p, o = 0) {
  let g;
  if (p.shape === 'box') {
    const sx = p.sx + 2 * o, sy = p.sy + 2 * o, sz = p.sz + 2 * o, m = Math.min(sx, sy, sz);
    if (p.hard || m < 0.03) g = new THREE.BoxGeometry(sx, sy, sz);
    else g = new RoundedBoxGeometry(sx, sy, sz, m > 0.45 ? 2 : 1, Math.min(p.rad ?? 0.05, m * 0.45) + o * 0.5);
  } else if (p.shape === 'cyl') {
    const axis = p.rz || p.rx90 ? 'z' : p.rx90len ? 'x' : 'y', r = p.sx / 2 + o;
    const len = (axis === 'y' ? p.sy : (p.thin || p.rx90len || 0.05)) + 2 * o;
    g = new THREE.CylinderGeometry(r * (p.top || 1), r, len, Math.max(p.seg || 12, r > 0.04 ? 16 : 8));
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
  } else if (p.shape === 'sphere') {
    const s = Math.max(p.seg || 10, Math.max(p.sx, p.sy, p.sz) > 0.15 ? 18 : 10); g = new THREE.SphereGeometry(0.5, s, Math.max(5, Math.round(s * 0.7))); g.scale(p.sx + 2 * o, p.sy + 2 * o, p.sz + 2 * o);
  } else if (p.shape === 'cone') g = new THREE.ConeGeometry(p.sx / 2 + o, p.sy + 2 * o, p.seg || 10);
  if (p.rx) g.rotateX(p.rx); if (p.rz2) g.rotateZ(p.rz2);
  return g;
}
function finish(g, p, colorFn) {
  if (!p.local) g.translate(p.x, p.y, p.z);
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const c = colorFn(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const outlineColor = (hex) => { tmpC.setHex(hex); const hsl = {}; tmpC.getHSL(hsl); tmpC.setHSL(hsl.h, Math.min(1, hsl.s * 1.05 + 0.05), hsl.l * 0.52); return tmpC; };

export class View {
  constructor(canvas, world, game) {
    this.world = world; this.game = game;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5); r.setPixelRatio(this.dpr); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.autoClear = false; r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.12;
    const scene = this.scene = new THREE.Scene(); this.noAO = []; this.fx = true;
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.06, 450); this.camera.rotation.order = 'YXZ';
    this.mirrorCam = new THREE.PerspectiveCamera(42, 1, 0.1, 450); this.mirrorCam.layers.enable(1);
    // 小窗先画到一张贴图上，再贴到屏幕角落（折射材质在局部视口里直接画会错位）
    this.mirrorRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 4 }); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene(); this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.mirrorRT.texture, depthTest: false, depthWrite: false })));
    this.toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRADIENT });
    this.outlineMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    this.buildSky(); this.buildLights(); this.buildStatic(); this.buildHunters(); this.buildJellies(); this.buildFx(); this.buildCampMark();
    this.local = null; this.spec = null; // 本机控制的角色；旁观时的自由相机 {x, y, z, yaw, pitch, moving}
    this.buildPost();
    this.eyeY = 1.6; this.bob = 0; this.time = 0; this.buildFpGun();
  }
  buildSky() {
    const dome = (rad) => { const g = new THREE.SphereGeometry(rad, 32, 20), p = g.attributes.position, c = new Float32Array(p.count * 3), top = new THREE.Color(0x4aa8ff), mid = new THREE.Color(0xa8dcff), hor = new THREE.Color(0xeaf7ff), gnd = new THREE.Color(0xbfe6a8); for (let i = 0; i < p.count; i++) { const t = p.getY(i) / rad, col = t < -0.02 ? gnd : t < 0.25 ? hor.clone().lerp(mid, Math.max(0, t) / 0.25) : mid.clone().lerp(top, Math.min(1, (t - 0.25) / 0.6)); c.set([col.r, col.g, col.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); };
    // 用天空本身生成环境光和反射
    const env = new THREE.Scene(); env.add(dome(50)); const sunBall = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7.2, 5.6) })); sunBall.position.set(-18, 34, 26); env.add(sunBall);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(40, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.78, 0.66) })); glow.rotation.x = -Math.PI / 2; glow.position.y = -6; env.add(glow);
    const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(env, 0.03).texture; this.scene.environmentIntensity = 0.55; pm.dispose();
    const sky = dome(300); sky.position.set(20, 0, 15); this.scene.add(sky);
    const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }); this.clouds = new THREE.Group();
    for (const c of this.world.clouds) { const grp = new THREE.Group(), sc = c.s * 2.2; for (const [dx, dy, dz, s] of [[0, 0, 0, 1], [1.1, -0.1, 0.2, 0.75], [-1.1, -0.15, -0.1, 0.8], [0.4, 0.45, 0, 0.7], [2.0, -0.25, 0, 0.5], [-1.9, -0.3, 0.1, 0.5]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(sc * s, 12, 9), cm); m.position.set(dx * sc, dy * sc, dz * sc); m.scale.y = 0.62; grp.add(m); } grp.position.set(c.x * 2.4 - 30, c.y + 38, c.z * 2.4 - 30); this.clouds.add(grp); }
    this.scene.add(this.clouds);
  }
  buildLights() {
    // 阳光从西南方向照过来，透过南窗和西窗进屋
    const d = this.sun = new THREE.DirectionalLight(0xfff0d2, 5.2); d.position.set(20 - 14, 24, 15 + 22); d.target.position.set(20, 0, 15);
    d.castShadow = true; d.shadow.mapSize.set(4096, 4096); const s = d.shadow.camera; s.left = -27; s.right = 27; s.top = 24; s.bottom = -24; s.near = 4; s.far = 80; d.shadow.bias = -0.0004; d.shadow.normalBias = 0.03; d.shadow.radius = 4;
    this.scene.add(d, d.target); this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0xffd9a8, 0.45));
  }
  buildStatic() {
    const W = this.world, tex = this.tex = buildTextures(), B = this.builder = new Builder(tex, W); this.swayers = [];
    B.floors(); for (const p of W.props) B.build(p); B.lawn();
    // 没有整件模型的零件：用通用的圆角几何体 + 顶点颜色
    const col = new THREE.Color();
    for (const p of W.parts) {
      if (p.fromProp && (p.fromProp === 'floor' || B.has(p.fromProp))) continue;
      if (p.tag === 'patch') continue; // 草地上的色块边缘太硬，不要了
      if (p.sway) { this.addLoose(p); continue; }
      let g = shapeGeo(p); let key = p.mat ? (p.mat === 'roof' ? `roof:${p.color.toString(16)}` : p.mat === 'plaster' ? 'plaster:ffffff' : p.mat) : p.glow ? 'vcglow' : 'vc';
      if (!p.mat) { if (g.index) g = g.toNonIndexed(); col.setHex(p.color); const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
      B.put(g, key, p.x, p.y, p.z, { cast: !p.noShadow && !p.glow });
    }
    // 每个房间一盏吊灯
    const lamp = (x, z, i, dist) => { B.put(new THREE.SphereGeometry(0.19, 20, 14), 'shade:fff0c2', x, 2.0, z, { cast: false }); B.put(new THREE.CylinderGeometry(0.006, 0.006, 0.62, 5), 'paint:3a3550:0.5', x, 2.5, z, { cast: false }); B.put(new THREE.CylinderGeometry(0.06, 0.085, 0.06, 14), 'metal:d9c38a', x, 2.17, z, { cast: false }); const l = new THREE.PointLight(0xffd4a0, i, dist, 1.7); l.position.set(x, 1.95, z); this.scene.add(l); };
    for (const r of W.rooms) { const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; if (w > 20) { lamp(r.x0 + w * 0.25, cz, 3.2, 9); lamp(r.x0 + w * 0.75, cz, 3.2, 9); } else if (w > 10) { lamp(cx - w * 0.22, cz, 4.2, 9); lamp(cx + w * 0.22, cz, 4.2, 9); } else lamp(cx, cz, Math.min(w, d) < 3 ? 2.6 : 4.6, Math.max(w, d) + 3); }
    this.staticMeshes = B.finish(this.scene); for (const m of this.staticMeshes) if (m.userData.noAO) this.noAO.push(m);
    // 阳光光束（南面的窗）
    const dir = new THREE.Vector3().subVectors(this.sun.target.position, this.sun.position).normalize(), bm = new THREE.MeshBasicMaterial({ map: tex.beam, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.beams = new THREE.Group(); this.scene.add(this.beams);
    for (const [x0, x1, y0, y1] of [[9.6, 11.9, 0.4, 1.95], [15.1, 16.9, 0.95, 2.05], [27.6, 29.4, 0.4, 1.95]]) { const L = 4.6, v = [], uv = [], n = 4, z = 17.95; for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i + 0.5) / n, hw = (x1 - x0) / n * 0.42, a = [[x - hw, y1, z], [x + hw, y1, z], [x + hw + dir.x * L, y1 + dir.y * L, z + dir.z * L], [x - hw + dir.x * L, y1 + dir.y * L, z + dir.z * L]]; v.push(...a[0], ...a[1], ...a[2], ...a[0], ...a[2], ...a[3]); uv.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0); const q = [[x, y0, z], [x, y1, z], [x + dir.x * L, y1 + dir.y * L, z + dir.z * L], [x + dir.x * L, y0 + dir.y * L, z + dir.z * L]]; v.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); uv.push(0.5, 1, 0.5, 1, 0.5, 0, 0.5, 1, 0.5, 0, 0.5, 0); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); const m = new THREE.Mesh(g, bm); this.beams.add(m); this.noAO.push(m); }
  }
  buildPost() {
    const c = this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
    c.addPass(new RenderPass(this.scene, this.camera));
    const gtao = this.gtao = new GTAOPass(this.scene, this.camera, 4, 4); gtao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1.4, scale: 1.25, samples: 12, screenSpaceRadius: false }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 }); c.addPass(gtao);
    // 光束、玻璃、标记、半透明的身体不参与环境遮蔽
    const ov = gtao._overrideVisibility.bind(gtao), rs = gtao._restoreVisibility.bind(gtao); let mine = [];
    gtao._overrideVisibility = () => { ov(); mine = this.noAO.filter((o) => o.visible); for (const j of this.jellies) if (j.visible && j.dispVis < 0.6) mine.push(j); for (const o of mine) o.visible = false; }; gtao._restoreVisibility = () => { rs(); for (const o of mine) o.visible = true; mine = []; };
    c.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), 0.13, 0.7, 0.95)); c.addPass(new OutputPass()); c.addPass(new SMAAPass());
  }
  addLoose(p) { // 会轻轻摆动的布（晾衣绳上的床单）
    const q = { ...p, local: true }, g = shapeGeo(q), m = new THREE.Mesh(g, this.builder.mat(`fabric:${p.color.toString(16)}:ds`));
    g.translate(0, -p.sy / 2, 0); const piv = new THREE.Group(); piv.position.set(p.x, p.y + p.sy / 2, p.z); piv.add(m); m.castShadow = m.receiveShadow = true; this.scene.add(piv); this.swayers.push({ piv, axisX: p.sx > p.sz, ph: p.x * 1.7 + p.z });
  }

  // —— 猎人 ——
  buildHunters() {
    this.hunterViews = [];
    for (let i = 0; i < MAX_HUNTERS; i++) {
      const color = HUNTER_COLORS[i % HUNTER_COLORS.length], g = makeHunter(color); g.visible = false; this.scene.add(g);
      // 头顶的 ? / ! 标记
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false })); mark.scale.setScalar(0.62); mark.renderOrder = 10; this.scene.add(mark);
      // 调试用视野锥
      const cone = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })); cone.frustumCulled = false; cone.visible = false; this.scene.add(cone);
      this.noAO.push(mark, cone); this.hunterViews.push({ g, mark, cv, tex, cone, markKey: '-', recoil: 0 });
    }
  }
  drawMark(v, h) {
    const key = h.state === 'human' ? '' : h.state === 'chase' ? '!' : h.state === 'empty' ? 'e' : h.state === 'wait' ? 'z' : h.detect > 0.03 ? '?' + Math.round(h.detect * 12) : (h.state === 'investigate' || h.state === 'search') ? 's' : '';
    if (key === v.markKey) return; v.markKey = key; const x = v.cv.getContext('2d'); x.clearRect(0, 0, 128, 128); v.mark.visible = key !== '';
    if (!key) { v.tex.needsUpdate = true; return; }
    const ch = key[0] === '?' || key === 's' ? '?' : key === '!' ? '!' : key === 'z' ? 'z' : '…';
    x.beginPath(); x.arc(64, 64, 52, 0, 7); x.fillStyle = key === '!' ? '#ff5d5d' : '#fff'; x.fill(); x.lineWidth = 9; x.strokeStyle = '#3a3550'; x.stroke();
    if (key[0] === '?') { x.beginPath(); x.arc(64, 64, 52, -Math.PI / 2, -Math.PI / 2 + h.detect * Math.PI * 2); x.strokeStyle = '#ff8a3d'; x.lineWidth = 11; x.stroke(); }
    x.font = '900 78px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = key === '!' ? '#fff' : '#3a3550'; x.fillText(ch, 64, 70); v.tex.needsUpdate = true;
  }
  updateHunters(dt) {
    const game = this.game;
    const L = this.local, mine = L && L.kind === 'hunter' && !this.spec ? L.id : -1; // 第一人称时不画自己
    this.hunterViews.forEach((v, i) => { v.g.visible = i < game.hunters.length && i !== mine; if (!v.g.visible) { v.cone.visible = false; v.mark.visible = false; } });
    game.hunters.forEach((h, i) => {
      const v = this.hunterViews[i]; if (i === mine) return; v.g.position.set(h.x, 0, h.z); v.g.rotation.y = Math.PI / 2 - h.ang; v.recoil = Math.max(0, v.recoil - dt * 5);
      v.g.update(dt, 0, { moving: h.speed > 0, phase: h.hop, run: h.state === 'chase' || (h.running && h.moving), bend: !!h.bend, aim: h.state === 'chase' || h.state === 'human', wait: h.state === 'wait', empty: h.state === 'empty', ammo: h.ammo / C.ammo, recoil: v.recoil });
      this.drawMark(v, h); v.mark.position.set(h.x, h.bend ? 1.75 : 2.05, h.z);
      // 调试视野锥
      v.cone.visible = C.debugCones && h.state !== 'wait';
      if (v.cone.visible) { const n = 24, fov = C.fovDeg * Math.PI / 180, pts = [h.x, 0.06, h.z]; for (let k = 0; k <= n; k++) { const a = h.ang - fov / 2 + fov * k / n, d = game.rayDist(h.x, C.hunterEye, h.z, a, C.viewDist); pts.push(h.x + Math.cos(a) * d, 0.06, h.z + Math.sin(a) * d); } const idx = []; for (let k = 1; k <= n; k++) idx.push(0, k, k + 1); v.cone.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); v.cone.geometry.setIndex(idx); }
    });
  }

  // —— 躲藏方的身体：每个躲藏方一个果冻。自己的只在“猎人眼中的你”小窗里出现（图层 1）——
  buildJellies() {
    this.jellies = [];
    for (let i = 0; i < MAX_HIDERS; i++) { const g = makeJelly(); g.visible = false; g.layer = 0; g.bodyH = 1.7; g.dispVis = 1; g.paintKey = null; this.scene.add(g); this.jellies.push(g); }
  }
  updateJellies(dt) {
    const game = this.game, L = this.local, cam = this.camera.position;
    this.jellies.forEach((g, i) => { if (i >= game.hiders.length) g.visible = false; });
    for (const q of game.hiders) {
      const g = this.jellies[q.id], h = game.height(q), own = L === q && !q.caught && !this.spec; g.visible = true;
      const layer = own ? 1 : 0; if (g.layer !== layer) { g.layer = layer; g.setLayer(layer); }
      const paint = q.caught ? q.caughtColor : null; if (g.paintKey !== paint) { g.paintKey = paint; g.setPaint(paint); }
      g.bodyH += (h - g.bodyH) * Math.min(1, dt * 10);
      // 猎人走到近处一定能看出轮廓（真人猎人的画面也照这条规则）
      let vis = q.caught ? 1 : q.vis;
      if (L && L.kind === 'hunter' && !this.spec && Math.hypot(cam.x - q.x, cam.z - q.z) < C.closeRevealDist) vis = Math.max(vis, C.closeRevealVis);
      g.dispVis = vis; g.position.set(q.x, q.floorY, q.z); g.rotation.y = q.yaw + Math.PI; g.update(dt, vis, h / 0.95, q.moving && !q.caught);
    }
  }

  // —— 防挂机提示圈（只有真人猎人看得到）——
  buildCampMark() {
    const m = this.campRing = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff7a6b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5; this.scene.add(m); this.noAO.push(m); this.campT = 0;
  }
  campMark(x, z, r) { this.campRing.position.set(x, 0.035, z); this.campRing.scale.setScalar(r); this.campRing.visible = true; this.campT = 10; }

  // —— 颜料弹和颜料溅点 ——
  buildFx() {
    this.shotMeshes = []; this.splats = []; this.particles = [];
    this.shotGeo = new THREE.SphereGeometry(0.11, 10, 8); this.dropGeo = new THREE.SphereGeometry(0.05, 6, 5);
    this.splatGroup = new THREE.Group(); this.scene.add(this.splatGroup);
  }
  syncShots() {
    const shots = this.game.shots;
    while (this.shotMeshes.length < shots.length) { const m = new THREE.Mesh(this.shotGeo, new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1 })); m.castShadow = true; this.scene.add(m); this.shotMeshes.push(m); }
    this.shotMeshes.forEach((m, i) => { const s = shots[i]; m.visible = !!s; if (s) { m.position.set(s.x, s.y, s.z); m.material.color.setHex(s.color); m.material.emissive.setHex(s.color); m.material.emissiveIntensity = 0.25; const sp = Math.hypot(s.vx, s.vy, s.vz); m.scale.set(1, 1, 1); m.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz); m.scale.z = 1 + sp * 0.03; if (Math.random() < 0.5) this.spawnDrop(s.x, s.y, s.z, s.color, 0.6); } });
  }
  spawnDrop(x, y, z, color, speed, n = null) {
    const m = new THREE.Mesh(this.dropGeo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, clearcoat: 1, emissive: color, emissiveIntensity: 0.2 })); m.position.set(x, y, z); this.scene.add(m);
    const a = Math.random() * 6.28, u = Math.random();
    const v = n ? new THREE.Vector3(n.x * (1.5 + u * 2) + Math.cos(a) * speed, n.y * (1.5 + u * 2) + 1.5 + Math.random() * speed, n.z * (1.5 + u * 2) + Math.sin(a) * speed) : new THREE.Vector3(Math.cos(a) * speed * 0.3, Math.random() * speed * 0.5, Math.sin(a) * speed * 0.3);
    this.particles.push({ m, v, life: n ? 0.7 : 0.25, s: 0.6 + Math.random() * 0.9 });
  }
  addSplat(e) {
    const n = new THREE.Vector3(e.nx, e.ny, e.nz); if (n.lengthSq() < 0.5) n.set(0, 1, 0);
    for (let i = 0; i < 12; i++) this.spawnDrop(e.x, e.y, e.z, e.color, 2.2, n);
    if (e.onPlayer) return;
    const grp = new THREE.Group(), mat = new THREE.MeshPhysicalMaterial({ color: e.color, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08, emissive: e.color, emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const R = C.paintSplatRadius; const blob = (x, y, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat); m.rotation.x = Math.PI / 2; m.scale.y = Math.min(0.14, 0.012 / r + 0.06); m.position.set(x, y, 0); m.receiveShadow = true; grp.add(m); };
    blob(0, 0, R * 0.8); for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + Math.random() * 0.6, d = R * (0.55 + Math.random() * 0.5); blob(Math.cos(a) * d, Math.sin(a) * d, R * (0.18 + Math.random() * 0.26)); }
    for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, d = R * (1.2 + Math.random() * 0.9); blob(Math.cos(a) * d, Math.sin(a) * d, R * (0.06 + Math.random() * 0.1)); }
    if (n.y < 0.5) for (let i = 0; i < 3; i++) { const x = (Math.random() - 0.5) * R, len = 0.15 + Math.random() * 0.4; const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, len), mat); m.position.set(x, -R * 0.6 - len / 2, 0); grp.add(m); blob(x, -R * 0.6 - len, 0.04); }
    grp.position.set(e.x + n.x * 0.012, e.y + n.y * 0.012, e.z + n.z * 0.012); grp.lookAt(e.x + n.x, e.y + n.y, e.z + n.z); grp.scale.setScalar(0.1); grp.userData.t = 0;
    this.splatGroup.add(grp); this.splats.push(grp);
    if (this.splats.length > 70) { const old = this.splats.shift(); this.splatGroup.remove(old); old.traverse((o) => o.geometry && o.geometry.dispose()); }
  }
  clearSplats() { for (const s of this.splats) { this.splatGroup.remove(s); s.traverse((o) => o.geometry && o.geometry.dispose()); } this.splats = []; }
  resetRound() { this.clearSplats(); this.campRing.visible = false; this.campT = 0; }
  recoil(id) { const L = this.local; if (L && L.kind === 'hunter' && L.id === id) this.fpRecoil = 1; else if (this.hunterViews[id]) this.hunterViews[id].recoil = 1; }

  // 当猎人时手里的喷色枪
  buildFpGun() {
    const toon = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: c === 0xffffff ? 0.25 : 0.2, clearcoat: 0.8 }); const g = this.fpGun = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.12, 0.34, 2, 0.045), toon(0xffffff)); g.add(body);
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.12, 12), toon(0xff8a3d)); noz.rotation.x = -Math.PI / 2; noz.position.z = -0.22; g.add(noz);
    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.14, 0.08, 1, 0.03), toon(0x3a3550)); grip.position.set(0, -0.11, 0.08); grip.rotation.x = 0.25; g.add(grip);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })); glass.position.set(0, 0.12, 0.04); g.add(glass);
    this.fpTank = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff8a3d })); this.fpTank.position.set(0, 0.12, 0.04); g.add(this.fpTank);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), toon(0xff8a3d)); hand.position.set(0.01, -0.13, 0.1); g.add(hand);
    g.scale.setScalar(0.62); g.position.set(0.23, -0.2, -0.5); g.visible = false; this.camera.add(g); this.scene.add(this.camera); this.fpRecoil = 0;
  }
  // 帧率太低时降一档画质
  lowQuality() { if (this.low) return; this.low = true; this.dpr = 1; this.renderer.setPixelRatio(1); this.resize(this.w, this.h); this.sun.shadow.mapSize.set(2048, 2048); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } this.gtao.updateGtaoMaterial({ samples: 8 }); }
  // 调试：看屏幕上某一点是什么（x,y 为 -1..1）
  pick(x, y) { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(x, y), this.camera); const h = rc.intersectObjects(this.scene.children, true).filter((q) => q.object.visible && !q.object.isSprite).slice(0, 3); return h.map((q) => { let key = ''; for (const [k, m] of this.builder.matCache) if (m === q.object.material) key = k; return [key || q.object.material.type, q.point.toArray().map((n) => Math.round(n * 10) / 10).join(','), Math.round(q.distance * 10) / 10]; }); }
  resize(w, h) { this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.composer.setPixelRatio(this.dpr); this.composer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  // 小窗在屏幕上的位置（CSS 像素，左下角）
  mirrorRect() { const s = Math.round(Math.min(190, this.h * 0.24)); return { x: 22, y: 22, s }; }

  render(dt, showMirror) {
    const game = this.game, p = this.local, spec = this.spec; this.time += dt;
    // 第一人称相机：跟着本机控制的角色；旁观时是自由相机
    const hm = !spec && p.kind === 'hunter', cp = spec || p;
    const eye = spec ? spec.y : hm ? C.hunterEye : C.stances[p.stance].eye; this.eyeY = spec ? eye : this.eyeY + (eye - this.eyeY) * Math.min(1, dt * 9);
    if (cp.moving) this.bob += dt * (cp.running ? 13 : !hm && !spec && p.stance === 'prone' ? 5 : 8.5);
    const bobY = cp.moving && !spec ? Math.sin(this.bob) * (cp.running ? 0.045 : 0.022) : 0;
    this.camera.position.set(cp.x, (hm || spec ? 0 : p.floorY) + this.eyeY + bobY, cp.z); this.camera.rotation.set(cp.pitch, cp.yaw, cp.moving && !spec ? Math.sin(this.bob * 0.5) * 0.006 : 0);
    this.fpGun.visible = hm && game.phase !== 'menu';
    if (hm) { this.fpRecoil = Math.max(0, this.fpRecoil - dt * 4.5); this.fpGun.position.set(0.23 + (cp.moving ? Math.sin(this.bob * 0.5) * 0.008 : 0), -0.2 + (cp.moving ? Math.abs(Math.sin(this.bob * 0.5)) * 0.012 : 0), -0.5 + this.fpRecoil * 0.09); this.fpGun.rotation.x = this.fpRecoil * 0.35; this.fpTank.scale.setScalar(Math.max(0.05, Math.cbrt(p.ammo / C.ammo))); }
    const fov = 74 + (cp.running && cp.moving ? 5 : 0); if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6); this.camera.updateProjectionMatrix(); }
    this.updateHunters(dt); this.updateJellies(dt); this.syncShots();
    if (this.campT > 0) { this.campT -= dt; this.campRing.visible = hm && this.campT > 0; this.campRing.material.opacity = 0.9 * Math.min(1, this.campT / 2) * (0.75 + 0.25 * Math.sin(this.time * 5)); }
    for (const s of this.swayers) { const a = Math.sin(this.time * 1.4 + s.ph) * 0.035; if (s.axisX) s.piv.rotation.x = a; else s.piv.rotation.z = a; }
    for (const s of this.splats) if (s.userData.t < 1) { s.userData.t = Math.min(1, s.userData.t + dt * 7); const t = s.userData.t; s.scale.setScalar(0.1 + 0.9 * (1 - Math.pow(1 - t, 3)) * (1 + 0.15 * Math.sin(t * 3.14))); }
    this.particles = this.particles.filter((q) => { q.life -= dt; q.v.y -= 9 * dt; q.m.position.addScaledVector(q.v, dt); q.m.scale.setScalar(q.s * Math.max(0.05, Math.min(1, q.life * 3))); if (q.life <= 0 || q.m.position.y < 0) { this.scene.remove(q.m); q.m.material.dispose(); return false; } return true; });
    this.clouds.position.x = Math.sin(this.time * 0.01) * 30;
    const r = this.renderer; r.setScissorTest(false); r.setViewport(0, 0, this.w, this.h);
    if (this.fx) this.composer.render(dt); else { r.clear(); r.render(this.scene, this.camera); }
    if (showMirror && !hm && !spec && !p.caught) {
      // “猎人眼中的你”：从正前方看自己
      const m = this.mirrorRect(), H = this.jellies[p.id].bodyH, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const cy = p.floorY + Math.max(0.35, H * 0.55), want = 1.9 + H * 0.9, ang = Math.atan2(fz, fx);
      const d = Math.max(0.5, Math.min(want, game.rayDist(p.x, cy + 0.15, p.z, ang, want + 0.3) - 0.25));
      this.mirrorCam.position.set(p.x + fx * d, Math.min(cy + 0.5, H < 0.6 ? 0.42 : 9), p.z + fz * d); this.mirrorCam.lookAt(p.x, cy, p.z);
      r.setRenderTarget(this.mirrorRT); r.setViewport(0, 0, 512, 512); r.clear(); r.render(this.scene, this.mirrorCam); r.setRenderTarget(null);
      r.setScissorTest(true); r.setScissor(m.x, m.y, m.s, m.s); r.setViewport(m.x, m.y, m.s, m.s); r.render(this.quadScene, this.quadCam); r.setScissorTest(false); r.setViewport(0, 0, this.w, this.h);
    }
  }
}
