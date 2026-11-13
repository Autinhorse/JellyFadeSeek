import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { buildTextures } from './tex.js';
import { buildScene } from './scene.js';
import { makeJelly, makeHunter } from './chars.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, 1.5); renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(58, 1, 0.08, 400); camera.rotation.order = 'YXZ';

// —— 天空 + 环境光照（用天空本身生成反射和环境光）——
function skyDome(r) { const g = new THREE.SphereGeometry(r, 32, 20), p = g.attributes.position, c = new Float32Array(p.count * 3), top = new THREE.Color(0x4aa8ff), mid = new THREE.Color(0xa8dcff), hor = new THREE.Color(0xeaf7ff), gnd = new THREE.Color(0xbfe6a8); for (let i = 0; i < p.count; i++) { const t = p.getY(i) / r, col = t < -0.02 ? gnd : t < 0.25 ? hor.clone().lerp(mid, Math.max(0, t) / 0.25) : mid.clone().lerp(top, Math.min(1, (t - 0.25) / 0.6)); c.set([col.r, col.g, col.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); }
{ const env = new THREE.Scene(); env.add(skyDome(50)); const sun = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7.2, 5.6) })); sun.position.set(-18, 34, 26); env.add(sun); const floorGlow = new THREE.Mesh(new THREE.CircleGeometry(40, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.78, 0.66) })); floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.y = -6; env.add(floorGlow);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.03).texture; scene.environmentIntensity = 0.55; pm.dispose(); }
const sky = skyDome(300); scene.add(sky);
{ const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }); let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 12; i++) { const grp = new THREE.Group(), sc = 5 + rnd() * 7; for (const [dx, dy, dz, k] of [[0, 0, 0, 1], [1.1, -0.1, 0.2, 0.75], [-1.1, -0.15, -0.1, 0.8], [0.4, 0.4, 0, 0.7], [2, -0.25, 0, 0.5], [-1.9, -0.3, 0.1, 0.5]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(sc * k, 14, 10), cm); m.position.set(dx * sc, dy * sc, dz * sc); m.scale.y = 0.62; grp.add(m); } grp.position.set(-120 + rnd() * 260, 45 + rnd() * 40, 60 + rnd() * 140); scene.add(grp); } }

// —— 灯光：阳光从西南方向透过南窗照进来 ——
const sun = new THREE.DirectionalLight(0xfff0d2, 5.2); sun.position.set(7 - 9, 15, 3 + 14.5); sun.target.position.set(7, 0, 3); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
{ const c = sun.shadow.camera; c.left = -11; c.right = 11; c.top = 9; c.bottom = -9; c.near = 2; c.far = 50; sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 5; sun.shadow.blurSamples = 16; }
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xdff1ff, 0xffd9a8, 0.45));
const bounce = new THREE.PointLight(0xffe2b8, 2.2, 8, 1.6); bounce.position.set(5.6, 0.6, 4.0); scene.add(bounce); // 阳光打在地板上的反弹光
const lamps = [[5.4, 1.9, 3.05, 5], [1.25, 1.05, 4.75, 2.2], [0.7, 1.6, 0.7, 3]].map(([x, y, z, i]) => { const l = new THREE.PointLight(0xffc98a, i, 7, 1.8); l.position.set(x, y, z); scene.add(l); return l; });

// —— 场景 ——
const tex = buildTextures(); const { M, root } = buildScene(scene, tex);
// 阳光光束 + 灰尘
const beams = new THREE.Group(); scene.add(beams);
{ const dir = new THREE.Vector3().subVectors(sun.target.position, sun.position).normalize(), mat = new THREE.MeshBasicMaterial({ map: tex.beam, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = (x0, x1, y0, y1, z) => { const L = 5.2, g = new THREE.BufferGeometry(), v = [], uv = [], n = 5; for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i + 0.5) / n, hw = (x1 - x0) / n * 0.42; for (const [a, b] of [[y0, y1]]) { const p = [[x - hw, b, z], [x + hw, b, z], [x + hw + dir.x * L, b + dir.y * L, z + dir.z * L], [x - hw + dir.x * L, b + dir.y * L, z + dir.z * L]]; void a; v.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]); uv.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0); const q = [[x, y0, z], [x, y1, z], [x + dir.x * L, y1 + dir.y * L, z + dir.z * L], [x + dir.x * L, y0 + dir.y * L, z + dir.z * L]]; v.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); uv.push(0.5, 1, 0.5, 1, 0.5, 0, 0.5, 1, 0.5, 0, 0.5, 0); } } g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); beams.add(new THREE.Mesh(g, mat)); };
  beam(3.4, 7.4, 0.95, 2.25, 6.0); beam(9.7, 11.5, 0.95, 2.25, 6.0); }
const dust = (() => { const n = 260, pos = new Float32Array(n * 3), ph = new Float32Array(n); for (let i = 0; i < n; i++) { pos[i * 3] = 2.5 + Math.random() * 9.5; pos[i * 3 + 1] = 0.2 + Math.random() * 2.2; pos[i * 3 + 2] = 1.6 + Math.random() * 4.2; ph[i] = Math.random() * 6.28; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ map: tex.dot, size: 0.035, transparent: true, opacity: 0.55, color: 0xfff1cf, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })); p.userData.ph = ph; scene.add(p); return p; })();

// —— 角色 ——
const jelly = makeJelly(); jelly.position.set(6.9, 0, 2.55); jelly.rotation.y = 2.0; scene.add(jelly);
const hunter = makeHunter(); hunter.position.set(9.6, 0, 4.3); hunter.rotation.y = -2.14; scene.add(hunter);

let vis = 1, auto = true, stance = 1;
// —— 后期：环境遮蔽、泛光、抗锯齿 ——
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 4, 4); gtao.blendIntensity = 1.0; gtao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1.4, scale: 1.25, samples: 12, screenSpaceRadius: false }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 }); composer.addPass(gtao);
// 光束、玻璃、透明状态的果冻不参与环境遮蔽（否则会被当成实心物体，画出黑块或暴露位置）
const noAO = () => { const list = [...beams.children]; root.traverse((o) => { if (o.material === M.glass) list.push(o); }); if (vis < 0.6) list.push(jelly); return list; };
{ const ov = gtao._overrideVisibility.bind(gtao), rs = gtao._restoreVisibility.bind(gtao); let mine = []; gtao._overrideVisibility = () => { ov(); mine = noAO().filter((o) => o.visible); for (const o of mine) o.visible = false; }; gtao._restoreVisibility = () => { rs(); for (const o of mine) o.visible = true; mine = []; }; }
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.13, 0.7, 0.95); composer.addPass(bloom);
composer.addPass(new OutputPass()); const smaa = new SMAAPass(); composer.addPass(smaa);
let fx = true;

// —— 镜头和操作 ——
const VIEWS = [{ p: [2.6, 1.5, 1.2], yaw: -2.05, pitch: -0.13 }, { p: [8.4, 0.72, 1.6], yaw: 2.135, pitch: -0.06 }, { p: [12.4, 1.6, 1.2], yaw: 2.0, pitch: -0.12 }, { p: [7.9, 1.2, 3.3], yaw: -2.1, pitch: -0.1 }];
const cam = { x: 0, y: 1.5, z: 0, yaw: 0, pitch: 0 }, goal = { ...cam }; let fly = 0;
function setView(i, instant) { const v = VIEWS[i]; Object.assign(goal, { x: v.p[0], y: v.p[1], z: v.p[2], yaw: v.yaw, pitch: v.pitch }); if (instant) Object.assign(cam, goal); else { let d = goal.yaw - cam.yaw; d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; goal.yaw = cam.yaw + d; fly = 1; } document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', +b.dataset.view === i)); }
const keys = {}; let drag = false;
canvas.addEventListener('pointerdown', (e) => { drag = true; canvas.setPointerCapture(e.pointerId); fly = 0; });
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; cam.yaw -= e.movementX * 0.004; cam.pitch = Math.max(-1.3, Math.min(1.3, cam.pitch - e.movementY * 0.004)); });
window.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys[e.code] = true; if (/^Digit[1-4]$/.test(e.code)) setView(+e.code.slice(5) - 1); if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) fly = 0; if (e.code === 'Space') e.preventDefault(); });
window.addEventListener('keyup', (e) => { keys[e.code] = false; }); window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(+b.dataset.view)));
const slider = $('vis');
slider.addEventListener('input', () => { vis = +slider.value / 100; auto = false; $('auto').classList.remove('on'); });
$('auto').addEventListener('click', () => { auto = !auto; $('auto').classList.toggle('on', auto); });
document.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { stance = +b.dataset.st; document.querySelectorAll('[data-st]').forEach((q) => q.classList.toggle('on', q === b)); }));
$('fx').addEventListener('click', () => { fx = !fx; $('fx').classList.toggle('on', fx); $('fx').textContent = fx ? '后期效果：开' : '后期效果：关'; beams.visible = dust.visible = fx; });

function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); composer.setPixelRatio(DPR); composer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 1 ? 78 : 58; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize(); setView(0, true);

let last = performance.now(), T = 0, fpsN = 0, fpsT = 0, slow = 0, lowQ = false;
const TEST = location.hash === '#test';
function frame(now) {
  if (!TEST) requestAnimationFrame(frame); const dt = TEST ? 0.05 : Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  if (fly > 0) { const k = 1 - Math.pow(0.002, dt); for (const a of ['x', 'y', 'z', 'yaw', 'pitch']) cam[a] += (goal[a] - cam[a]) * k; if (Math.abs(goal.x - cam.x) + Math.abs(goal.z - cam.z) + Math.abs(goal.yaw - cam.yaw) < 0.002) fly = 0; }
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), sp = (keys.ShiftLeft ? 4 : 1.8) * dt;
  cam.x += (-Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * s) * sp; cam.z += (-Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * s) * sp; cam.y = Math.max(0.25, Math.min(2.5, cam.y + ((keys.KeyE || keys.Space ? 1 : 0) - (keys.KeyQ || keys.KeyC ? 1 : 0)) * 1.2 * dt));
  cam.x = Math.max(0.3, Math.min(13.7, cam.x)); cam.z = Math.max(0.3, Math.min(5.7, cam.z));
  camera.position.set(cam.x, cam.y, cam.z); camera.rotation.set(cam.pitch, cam.yaw, 0);
  if (auto) { const c = (T % 12) / 12; vis = c < 0.25 ? 1 : c < 0.55 ? 1 - (c - 0.25) / 0.3 * 0.85 : c < 0.85 ? 0.15 : 0.15 + (c - 0.85) / 0.15 * 0.85; slider.value = Math.round(vis * 100); }
  $('visNum').textContent = Math.round(vis * 100) + '%'; $('visWord').textContent = vis <= 0.16 ? '几乎看不见' : vis < 0.45 ? '半透明' : vis < 0.8 ? '比较显眼' : '完全显形';
  const moving = auto && vis > 0.97; jelly.update(dt, vis, stance, moving); hunter.update(dt);
  for (const lf of root.userData.leaves || []) lf.rotation.z = Math.sin(T * 0.9 + lf.userData.sway) * 0.035;
  { const p = dust.geometry.attributes.position, ph = dust.userData.ph; for (let i = 0; i < p.count; i++) { p.setY(i, p.getY(i) + Math.sin(T * 0.4 + ph[i]) * 0.0006 - 0.0002); p.setX(i, p.getX(i) + Math.cos(T * 0.3 + ph[i]) * 0.0005); if (p.getY(i) < 0.1) p.setY(i, 2.4); } p.needsUpdate = true; }
  lamps[0].intensity = 5 + Math.sin(T * 9) * 0.03;
  if (fx) composer.render(dt); else renderer.render(scene, camera);
  fpsN++; fpsT += dt; if (fpsT > 0.6) { const f = fpsN / fpsT; $('fps').textContent = Math.round(f) + ' fps' + (lowQ ? ' · 已自动降低画质' : ''); fpsN = 0; fpsT = 0; if (!TEST && T > 3 && f < 26 && ++slow >= 3 && !lowQ) { lowQ = true; renderer.setPixelRatio(1); composer.setPixelRatio(1); resize(); sun.shadow.mapSize.set(2048, 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } gtao.updateGtaoMaterial({ samples: 8 }); } else if (f >= 26) slow = 0; }
}
$('loading').remove(); requestAnimationFrame(frame);
if (TEST) window.__s = { frame: (n = 1) => { for (let i = 0; i < n; i++) frame(0); }, info: () => renderer.info.render, setView, cam, set: (o) => { if (o.vis !== undefined) { vis = o.vis; auto = false; } if (o.stance !== undefined) stance = o.stance; if (o.fx !== undefined && o.fx !== fx) $('fx').click(); }, renderer, scene, jelly, hunter, M, sun, gtao, bloom };
