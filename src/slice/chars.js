// 角色：果冻小家伙（躲藏方）和穿雨衣的喷漆猎人。都是原创造型。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const lathe = (pts, seg = 48) => new THREE.LatheGeometry(new THREE.SplineCurve(pts.map((q) => new THREE.Vector2(q[0], q[1]))).getPoints(pts.length * 8), seg);
const cap = (r, len, seg = 16) => new THREE.CapsuleGeometry(r, len, 8, seg);

// —— 果冻 ——  vis: 1 完全显形 → 0.15 几乎透明（真折射 + 彩虹膜）
export function makeJelly() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x9aefdc, roughness: 0.16, transmission: 0.05, thickness: 0.7, ior: 1.22, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.25, iridescenceIOR: 1.3,  attenuationColor: new THREE.Color(0x7fe8d0), attenuationDistance: 0.6, sheen: 0.5, sheenColor: new THREE.Color(0xe6fff8), sheenRoughness: 0.4, emissive: 0x2fae98, emissiveIntensity: 0.12, envMapIntensity: 1.3 });
  const blob = new THREE.Mesh(lathe([[0, 0], [0.22, 0.0], [0.33, 0.035], [0.385, 0.13], [0.4, 0.3], [0.375, 0.5], [0.31, 0.7], [0.2, 0.86], [0.09, 0.93], [0, 0.95]], 56), mat); blob.castShadow = true; body.add(blob);
  // 顶上的小揪揪
  const tuft = new THREE.Mesh(lathe([[0, 0], [0.05, 0.0], [0.045, 0.04], [0.06, 0.09], [0.035, 0.14], [0, 0.16]], 20), mat); tuft.position.set(0.02, 0.92, 0); tuft.rotation.z = -0.25; body.add(tuft);
  const arms = []; for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), mat); a.scale.set(0.9, 1.25, 0.9); a.position.set(s * 0.39, 0.4, 0.06); a.castShadow = true; body.add(a); arms.push(a); }
  const feet = []; for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 12), mat); f.scale.set(1, 0.55, 1.35); f.position.set(s * 0.17, 0.05, 0.12); f.castShadow = true; g.add(f); feet.push(f); }
  // 脸
  const face = new THREE.Group(); body.add(face); const faceMats = [];
  const fm = (o) => { const m = new THREE.MeshPhysicalMaterial({ transparent: true, ...o }); faceMats.push(m); return m; };
  const eyes = []; for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.058, 24, 16), fm({ color: 0x2a2540, roughness: 0.08, clearcoat: 1 })); e.scale.set(1, 1.28, 0.6); e.position.set(s * 0.13, 0.56, 0.345); e.rotation.x = -0.18; const hl = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), fm({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 })); hl.position.set(0.018, 0.026, 0.048); e.add(hl); const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), hl.material); hl2.position.set(-0.02, -0.02, 0.05); e.add(hl2); face.add(e); eyes.push(e); }
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), fm({ color: 0xff9db5, roughness: 0.9, opacity: 0.75 })); b.scale.set(1.25, 0.75, 1); b.position.set(s * 0.235, 0.47, 0.322); b.rotation.set(-0.15, s * 0.62, 0); face.add(b); }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 8, 18, Math.PI), fm({ color: 0x2a2540, roughness: 0.4 })); mouth.rotation.set(-0.1, 0, Math.PI); mouth.position.set(0, 0.49, 0.386); face.add(mouth);
  // 被喷中后身上的颜料块
  const paintMat = new THREE.MeshPhysicalMaterial({ color: 0xff8a3d, roughness: 0.12, clearcoat: 1 }), blots = new THREE.Group(); blots.visible = false; body.add(blots);
  for (const [a, y, r] of [[0.3, 0.62, 0.13], [-0.9, 0.38, 0.16], [1.7, 0.7, 0.1], [2.6, 0.3, 0.15], [-2.2, 0.55, 0.12], [0.9, 0.2, 0.11], [-0.2, 0.84, 0.09]]) { const rad = 0.4 * Math.sqrt(Math.max(0.05, 1 - Math.pow((y - 0.3) / 0.68, 2))) * (y < 0.3 ? 1 : 1), b = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), paintMat); b.scale.set(1, 1, 0.3); b.position.set(Math.sin(a) * rad * 0.97, y, Math.cos(a) * rad * 0.97); b.rotation.y = a; blots.add(b); }
  const mint = new THREE.Color(0x9aefdc), base = mint.clone(), white = new THREE.Color(0xffffff);
  g.setPaint = (c) => { if (c == null) { blots.visible = false; base.copy(mint); } else { blots.visible = true; paintMat.color.setHex(c); base.copy(mint).lerp(new THREE.Color(c), 0.45); } };
  g.setLayer = (n) => g.traverse((o) => o.layers.set(n));
  const st = { vis: 1, stance: 1, t: 0, h: 1, paint: 0 }; g.userData = st;
  g.update = (dt, vis, stance, moving) => { // stance: 1 站, 0.55 蹲, 0.26 趴
    st.t += dt; st.h += (stance - st.h) * Math.min(1, dt * 8); const k = st.h, wide = 1 + (1 - k) * 0.55, wob = Math.sin(st.t * (moving ? 11 : 2.2)) * (moving ? 0.045 : 0.018);
    const wideC = Math.max(0.55, Math.min(1.5, wide)), sy = k * (1 + wob);
    body.scale.set(wideC * (1 - wob * 0.6), sy, wideC * (1 - wob * 0.6) * (k < 0.6 ? 1.25 : 1)); body.position.y = moving ? Math.abs(Math.sin(st.t * 5.5)) * 0.05 : 0;
    // 身体拉长或压扁时，脸不跟着变形
    const fs = 1 / sy, yc = k > 1.2 ? 0.66 : 0.53; face.scale.y = fs; face.position.y = yc * (1 - fs); tuft.scale.y = fs; for (const a of arms) a.scale.y = 1.25 * fs;
    arms[0].position.y = arms[1].position.y = 0.4 + Math.sin(st.t * 2.2 + 1) * 0.012; feet[0].position.z = 0.12 + (moving ? Math.sin(st.t * 11) * 0.09 : 0); feet[1].position.z = 0.12 - (moving ? Math.sin(st.t * 11) * 0.09 : 0); feet[0].scale.x = feet[1].scale.x = wide;
    const blink = Math.sin(st.t * 0.9) > 0.985 ? 0.12 : 1; for (const e of eyes) e.scale.y = 1.28 * blink;
    // 可见度 → 材质：越透明，越接近一层带彩虹光泽的清水
    const s = THREE.MathUtils.smoothstep(vis, 0.12, 0.95), inv = 1 - s;
    mat.transmission = 0.04 + inv * 0.96; mat.roughness = 0.16 - inv * 0.13; mat.iridescence = 0.25 + inv * 0.75; mat.thickness = 0.7 - inv * 0.5; mat.ior = 1.22 - inv * 0.16; mat.clearcoat = 1 - inv * 0.55; mat.sheen = 0.5 * s; mat.emissiveIntensity = 0.12 * s; mat.envMapIntensity = 1.3 - inv * 0.75;
    mat.color.copy(base).lerp(white, inv * 0.96); mat.attenuationDistance = 0.6 + inv * 30; mat.specularIntensity = 1 - inv * 0.6;
    for (const m of faceMats) m.opacity = (m.color.getHex() === 0xff9db5 ? 0.75 : 1) * Math.pow(s, 1.6) + 0.02; face.visible = s > 0.02; st.s = s;
    blob.castShadow = arms[0].castShadow = arms[1].castShadow = feet[0].castShadow = feet[1].castShadow = s > 0.55;
  };
  return g;
}

// —— 猎人：黄雨衣、雨靴、渔夫帽，背着颜料罐 ——
export function makeHunter(paintColor = 0xff8a3d) {
  const g = new THREE.Group(), up = new THREE.Group(); g.add(up);
  const P = (o) => new THREE.MeshPhysicalMaterial(o), S = (o) => new THREE.MeshStandardMaterial(o);
  const coat = P({ color: 0xffc928, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25 }), coatDark = P({ color: 0xf0a81c, roughness: 0.35, clearcoat: 0.6 }), skin = P({ color: 0xffc9a3, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffe9da) });
  const boot = P({ color: 0xff5d4d, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }), dark = S({ color: 0x3a3550, roughness: 0.5 }), white = P({ color: 0xffffff, roughness: 0.25, clearcoat: 0.6 }), paint = P({ color: paintColor, roughness: 0.15, clearcoat: 1, emissive: paintColor, emissiveIntensity: 0.12 }), metal = S({ color: 0xc9cfda, roughness: 0.3, metalness: 0.85 });
  const mesh = (geo, m, x, y, z, parent = up) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  // 靴子和腿
  const legs = []; for (const s of [-1, 1]) { const L = new THREE.Group(); L.position.set(s * 0.15, 0, 0); g.add(L); mesh(lathe([[0, 0], [0.1, 0.0], [0.105, 0.05], [0.095, 0.2], [0.11, 0.24], [0.1, 0.25], [0, 0.25]], 20), boot, 0, 0, 0, L); const toe = mesh(new THREE.SphereGeometry(0.105, 20, 12), boot, 0, 0.065, 0.085, L); toe.scale.set(1, 0.62, 1.25); mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20), white, 0, 0.012, 0.02, L).scale.set(1.04, 1, 1.5); legs.push(L); }
  // 雨衣身体（梨形）+ 下摆
  mesh(lathe([[0, 0.2], [0.33, 0.2], [0.37, 0.24], [0.36, 0.42], [0.31, 0.62], [0.24, 0.8], [0.17, 0.9], [0.13, 0.94], [0, 0.95]], 48), coat, 0, 0, 0);
  mesh(new THREE.TorusGeometry(0.345, 0.03, 10, 40), coatDark, 0, 0.22, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) mesh(new THREE.SphereGeometry(0.028, 12, 8), white, 0, 0.42 + i * 0.16, 0.355 - i * 0.047);
  mesh(new THREE.TorusGeometry(0.17, 0.045, 10, 28), coatDark, 0, 0.92, 0).rotation.x = Math.PI / 2;
  // 头
  const head = new THREE.Group(); head.position.y = 1.18; head.scale.setScalar(1.12); up.add(head);
  mesh(new THREE.SphereGeometry(0.27, 40, 28), skin, 0, 0, 0, head).scale.set(1.04, 0.96, 1);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.06, 14, 10), skin, s * 0.27, -0.02, 0, head).scale.set(0.6, 1, 0.9);
  mesh(new THREE.SphereGeometry(0.045, 16, 12), P({ color: 0xffa98a, roughness: 0.45 }), 0, -0.035, 0.265, head);
  const eyeM = P({ color: 0x2a2540, roughness: 0.08, clearcoat: 1 }), hlM = S({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });
  const eyes = []; for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.05, 20, 14), eyeM, s * 0.108, 0.02, 0.238, head); e.scale.set(1, 1.3, 0.55); e.castShadow = false; const pu = mesh(new THREE.SphereGeometry(0.017, 10, 8), hlM, 0.014, 0.02, 0.042, e); mesh(new THREE.SphereGeometry(0.008, 8, 6), hlM, -0.016, -0.016, 0.045, e); eyes.push({ e, pu }); mesh(new THREE.CapsuleGeometry(0.011, 0.06, 4, 8), dark, s * 0.11, 0.118, 0.238, head).rotation.z = Math.PI / 2 + s * 0.18; mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshStandardMaterial({ color: 0xff9db5, transparent: true, opacity: 0.6, roughness: 1 }), s * 0.19, -0.06, 0.196, head).rotation.y = s * 0.72; }
  mesh(new THREE.TorusGeometry(0.045, 0.011, 8, 16, Math.PI), dark, 0, -0.1, 0.235, head).rotation.z = Math.PI;
  // 渔夫帽
  const hat = new THREE.Group(); hat.position.set(0, 0.15, -0.03); hat.rotation.x = -0.3; head.add(hat);
  mesh(lathe([[0.0, 0.26], [0.12, 0.255], [0.22, 0.2], [0.27, 0.1], [0.285, 0.03], [0.34, -0.02], [0.44, -0.075], [0.46, -0.085], [0.44, -0.095], [0.33, -0.045], [0.27, 0.0]], 48), coat, 0, 0, 0, hat);
  mesh(new THREE.TorusGeometry(0.283, 0.022, 8, 40), paint, 0, 0.045, 0, hat).rotation.x = Math.PI / 2;
  // 背上的颜料罐
  const tankGlass = P({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, envMapIntensity: 2 });
  mesh(cap(0.13, 0.26, 20), tankGlass, 0, 0.62, -0.34).castShadow = false; const fill = mesh(cap(0.105, 0.16, 16), paint, 0, 0.57, -0.34); mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), metal, 0, 0.89, -0.34); mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 20), metal, 0, 0.46, -0.34);
  for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 24, Math.PI * 1.1), dark, s * 0.15, 0.68, -0.1).rotation.set(0, Math.PI / 2 - s * 0.3, 0.2);
  // 手臂 + 喷色枪
  const armR = new THREE.Group(); armR.position.set(-0.27, 0.8, 0.05); up.add(armR); mesh(cap(0.075, 0.2, 14), coat, 0, -0.12, 0.08, armR).rotation.x = -0.9; mesh(cap(0.07, 0.16, 14), coat, 0.06, -0.21, 0.27, armR).rotation.set(-1.45, 0, -0.5); mesh(new THREE.SphereGeometry(0.075, 16, 12), skin, 0.12, -0.2, 0.41, armR);
  const armL = new THREE.Group(); armL.position.set(0.27, 0.8, 0.05); up.add(armL); mesh(cap(0.075, 0.2, 14), coat, 0, -0.12, 0.08, armL).rotation.x = -0.9; mesh(cap(0.07, 0.16, 14), coat, -0.04, -0.2, 0.28, armL).rotation.set(-1.45, 0, 0.35); mesh(new THREE.SphereGeometry(0.075, 16, 12), skin, -0.07, -0.18, 0.43, armL);
  const gun = new THREE.Group(); gun.position.set(0.02, 0.63, 0.5); up.add(gun);
  mesh(new RoundedBoxGeometry(0.16, 0.17, 0.36, 4, 0.06), white, 0, 0, 0, gun); mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 20), metal, 0, 0.01, 0.24, gun).rotation.x = Math.PI / 2; mesh(lathe([[0.04, 0], [0.05, 0.01], [0.09, 0.09], [0.1, 0.1], [0.085, 0.1], [0.04, 0.03]], 28), paint, 0, 0.01, 0.3, gun).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.085, 20, 14), tankGlass, 0, 0.13, -0.04, gun).castShadow = false; const gunFill = mesh(new THREE.SphereGeometry(0.066, 16, 12), paint, 0, 0.125, -0.04, gun); mesh(new RoundedBoxGeometry(0.07, 0.15, 0.08, 2, 0.03), dark, 0, -0.14, -0.08, gun).rotation.x = 0.3; mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16), paint, 0, -0.085, 0.03, gun).rotation.y = Math.PI / 2;
  // 软管：枪 → 背后的罐子
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.05, 0.6, 0.36), new THREE.Vector3(0.36, 0.42, 0.2), new THREE.Vector3(0.4, 0.4, -0.15), new THREE.Vector3(0.14, 0.5, -0.36)]), 28, 0.018, 8), dark); hose.castShadow = true; up.add(hose);
  // 动作状态：moving 走/跑, phase 步伐相位, run 跑, bend 弯腰找人, aim 举枪, wait 闭眼等待, empty 颜料用完, ammo 0..1, recoil 0..1
  let t = 0; const cur = { lean: 0, drop: 0, aim: 0, bow: 0, mv: 0 };
  g.update = (dt, look = 0, s = {}) => {
    t += dt; const k = Math.min(1, dt * 9), L = (key, v) => { cur[key] += (v - cur[key]) * k; return cur[key]; };
    const mv = L('mv', s.moving ? 1 : 0), ph = s.phase ?? t * 6, lean = L('lean', s.bend ? 0.36 : s.moving ? (s.run ? 0.2 : 0.07) : 0), drop = L('drop', s.bend ? 0.3 : 0), aim = L('aim', s.aim ? 1 : s.bend ? 0.6 : 0), bow = L('bow', s.wait ? 0.38 : s.empty ? 0.3 : 0);
    const br = Math.sin(t * 2.4), hopY = Math.abs(Math.sin(ph)) * (s.run ? 0.07 : 0.04) * mv;
    up.position.y = br * 0.012 * (1 - mv) + hopY + lean * 0.3; up.rotation.x = lean; up.rotation.z = Math.sin(ph) * 0.05 * mv; up.scale.set(1 + br * 0.008 + drop * 0.25, 1 - br * 0.008 - drop * 0.85, 1 + br * 0.008 + drop * 0.25);
    legs.forEach((Lg, i) => { const sg = i ? 1 : -1, a = Math.sin(ph) * sg * mv; Lg.position.z = a * (s.run ? 0.2 : 0.13); Lg.position.y = Math.max(0, Math.cos(ph) * sg) * 0.08 * mv; Lg.rotation.x = -a * 0.45; });
    head.rotation.y = (s.aim || s.moving || s.wait || s.empty ? 0 : Math.sin(t * 0.7) * 0.5) * (1 - aim * 0.5) + look; head.rotation.x = bow - lean * 0.6; head.rotation.z = s.empty ? Math.sin(t * 1.5) * 0.06 - 0.12 : Math.sin(t * 0.9 + 1) * 0.05 * (1 - mv);
    const rc = s.recoil || 0; gun.position.set(0.02, 0.63 + aim * 0.13 + Math.sin(t * 2.4 + 0.5) * 0.008, 0.5 + aim * 0.04 - rc * 0.1); gun.rotation.x = 0.42 * (1 - aim) - rc * 0.45 + (s.empty ? 0.5 : 0); gun.rotation.y = s.aim ? 0 : Math.sin(t * 0.7) * 0.18 * (1 - mv);
    armR.rotation.x = armL.rotation.x = -aim * 0.22 + 0.1 * (1 - aim) - rc * 0.1;
    const closed = s.wait, blink = closed ? 0.08 : Math.sin(t * 1.1 + 2) > 0.98 ? 0.1 : 1; for (const { e } of eyes) e.scale.y = 1.3 * blink;
    const am = s.ammo ?? 1; fill.scale.set(1, Math.max(0.04, am) * (0.97 + Math.sin(t * 3) * 0.02), 1); fill.position.y = 0.385 + 0.185 * Math.max(0.04, am); fill.visible = gunFill.visible = am > 0.001; gunFill.scale.setScalar(Math.max(0.2, Math.cbrt(am)));
  };
  return g;
}
