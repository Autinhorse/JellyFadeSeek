import { CONFIG as C } from '../src/config.js';
import { buildWorld } from '../src/world.js';
import { Game, lineup } from '../src/sim.js';
let seed = 12345; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const W = buildWorld(); console.log('boxes', W.boxes.length, 'parts', W.parts.length);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const g = new Game(W, rng); const dt = 1 / 60;
const P = () => g.hiders[0];
const run = (t, inp) => { for (let i = 0; i < t / dt; i++) g.update(dt, { yaw: P().yaw, ...inp }); };
// nav: every patrol point reachable from hunter spawn, and spawn free
let unreach = 0; for (const p of W.patrol) { if (!g.nav.isFree(p.x, p.z)) { console.log(' patrol blocked', p); unreach++; continue; } const path = g.nav.path(W.hunterSpawns[0].x, W.hunterSpawns[0].z, p.x, p.z); if (!path) { console.log(' unreachable', p); unreach++; } }
ok(unreach === 0, 'all patrol points reachable');
ok(!g.collides(W.spawn.x, W.spawn.z, 1.7), 'player spawn free');
// speeds
g.start('hider'); C.invincible = true;
const speed = (st, runKey) => { g.reset(); g.phase = 'hide'; P().x = 13; P().z = 20; P().yaw = -Math.PI / 2; if (st !== 'walk') g.setStance(P(), st); const x0 = P().x; run(1, { f: 1, run: runKey }); return P().x - x0; };
ok(Math.abs(speed('walk') - 2.2) < 0.1, 'walk speed'); ok(Math.abs(speed('walk', true) - 4.0) < 0.1, 'run speed');
ok(Math.abs(speed('crouch') - 1.4) < 0.1, 'crouch speed'); ok(Math.abs(speed('prone') - 0.7) < 0.1, 'prone speed');
// visibility fade
g.reset(); g.phase = 'hide'; P().x = 10; P().z = 21; run(0.3, { f: 1, run: true }); ok(P().vis > 0.99, 'running fully visible ' + P().vis.toFixed(2));
run(4.4, {}); ok(P().vis > C.visFloor, 'not yet at floor at 4.4s ' + P().vis.toFixed(3)); run(0.2, {}); ok(P().vis <= C.visFloor + 1e-6, 'at floor after 4.6s ' + P().vis.toFixed(3));
// prone under bed, crouch cannot
g.reset(); g.phase = 'hide'; P().x = 9.2; P().z = 8.3; P().yaw = Math.PI / 2; g.setStance(P(), 'crouch'); run(2, { f: 1 }); ok(P().x > 8.7, 'crouch blocked by bed x=' + P().x.toFixed(2));
g.setStance(P(), 'prone'); run(3, { f: 1 }); ok(P().x < 8.0, 'prone goes under bed x=' + P().x.toFixed(2)); ok(g.setStance(P(), 'prone') === false, 'cannot stand under bed');
// sofa occlusion: player crouched north of living sofa (z<15.6), hunter south... sofa at x 9.2..12.8 z 15.6..16.6
g.reset(); g.phase = 'seek'; P().x = 11; P().z = 15.3; g.setStance(P(), 'crouch');
let see = g.bodyPoints(P()).filter((q) => g.los(11, C.hunterEye, 17.4, q[0], q[1], q[2])).length; ok(see === 0, 'crouched behind sofa hidden from 1.8m away, pts=' + see);
g.setStance(P(), 'crouch'); see = g.bodyPoints(P()).filter((q) => g.los(11, C.hunterEye, 17.4, q[0], q[1], q[2])).length; ok(see > 0, 'standing behind sofa visible pts=' + see);
// window vault
g.reset(); g.phase = 'hide'; P().x = 10.7; P().z = 17; P().yaw = Math.PI; run(1.5, { f: 1 }); ok(P().z > 18.5, 'vault through window z=' + P().z.toFixed(2));
ok(g.nav.path(10.7, 17, 10.7, 19.5).length > 2, 'hunter must detour around vault window');
// stance via input (network-friendly path)
g.reset(); g.phase = 'hide'; g.update(dt, { yaw: 0, stance: 'crouch' }); const s1 = P().stance; g.update(dt, { yaw: 0, stance: 'stand' }); ok(s1 === 'crouch' && P().stance === 'walk', 'stance change through input');

// —— 多人规则 ——
const shootAt = (h, q) => { g.shots.push({ x: q.x + 1, y: q.floorY + 0.8, z: q.z, vx: -20, vy: 0, vz: 0, color: h.color, owner: h.id, life: 4, near: [] }); };
C.invincible = false;
g.start(lineup('hider', 2, 3)); ok(g.hiders.length === 3 && g.hunters.length === 2 && g.hiders.filter((q) => q.ctrl === 'human').length === 1, 'lineup 1 human + 2 AI hiders, 2 AI hunters');
ok(new Set(g.hiders.map((q) => `${q.x},${q.z}`)).size === 3 && g.hiders.every((q) => !g.collides(q.x, q.z, 1.7)), 'hider spawns distinct and free');
g.start(lineup('none', 3, 6)); ok(g.hunters.every((h) => g.nav.isFree(h.x, h.z)) && g.hiders.length === 6, '3 hunter spawns walkable, 6 hiders');
g.start(lineup('hider', 1, 3)); g.phase = 'seek'; g.hideLeft = 0;
shootAt(g.hunters[0], g.hiders[1]); run(0.2, {}); ok(g.hiders[1].caught && g.phase === 'seek', 'one of three caught: round goes on');
shootAt(g.hunters[0], g.hiders[0]); run(0.2, {}); ok(g.hiders[0].caught && g.phase === 'seek', 'two of three caught: round goes on');
const h0 = g.hunters[0]; ok(h0.det[0] === 0 && h0.det[1] === 0, 'caught hiders drop out of detection');
shootAt(g.hunters[0], g.hiders[2]); run(0.2, {}); ok(g.phase === 'over' && g.result === 'hunters' && g.why === 'allCaught', 'all caught: hunters win');
g.start(lineup('hider', 2, 2)); g.phase = 'seek'; for (const h of g.hunters) h.ammo = 0; g.pendingPaintOut = true; run(0.1, {}); ok(g.result === 'hiders' && g.why === 'paintout', 'all paint used: hiders win');
g.start(lineup('hider', 1, 2)); g.phase = 'seek'; shootAt(g.hunters[0], g.hiders[1]); run(0.2, {}); g.timeLeft = 0.01; run(0.1, {}); ok(g.result === 'hiders' && g.why === 'timeout' && g.hiders[0].score > g.hiders[1].score, 'timeout with a survivor: hiders win, survivor scores more');
// AI hunter does not chase a caught hider; it keeps working on the others
g.start(lineup('hider', 1, 2)); g.phase = 'seek'; const k = g.hunters[0]; g.nextPatrol(k); k.state = 'chase'; k.target = 1; k.chasedId = 1; k.lastSeen = { x: g.hiders[1].x, z: g.hiders[1].z }; g.hiders[1].caught = true; g.update(dt, { yaw: 0 }); ok(k.state === 'patrol' && k.target === -1, 'chasing hunter drops caught target');
// human hunter catches the AI hider (single-player hunter mode) and ends the round
g.start('hunter'); ok(g.hunters[0].ctrl === 'human' && g.hiders[0].ctrl === 'ai' && g.hideLeft === C.hideTimeBots, 'hunter practice mode lineup');

// full rounds with a wandering human hider + AI hunters (+ AI teammates in later rounds)
const results = {};
for (let r = 0; r < 12; r++) {
  g.start(lineup('hider', 2, r < 8 ? 1 : 3)); let t = 0, yaw = 0, mode = 0, stuck = 0, maxStuck = 0; const last = g.hunters.map((q) => ({ x: q.x, z: q.z })); let ev = {};
  while (g.phase !== 'over' && t < 400) {
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) { if (rng() < 0.3) yaw = rng() * 6.28; mode = rng(); }
    g.update(dt, { yaw, f: mode < 0.5 ? 1 : 0, run: mode < 0.12 }); t += dt;
    for (const e of g.events) ev[e.type] = (ev[e.type] || 0) + 1; g.events.length = 0;
    g.hunters.forEach((q, i) => { if (g.phase === 'seek' && q.speed > 0 && Math.hypot(q.x - last[i].x, q.z - last[i].z) < 1e-5) { stuck++; maxStuck = Math.max(maxStuck, stuck); } else stuck = 0; last[i].x = q.x; last[i].z = q.z; if (!(q.x > 0 && q.z > 0)) throw new Error('NaN hunter'); });
  }
  const key = `${g.hiders.length}h:${g.result}`; results[key] = (results[key] || 0) + 1;
  console.log(` round ${r}: ${g.result}/${g.why} t=${t.toFixed(0)} caught=${g.hiders.filter((q) => q.caught).length}/${g.hiders.length} score=${P().score.toFixed(0)} ammo=${g.hunters.map((q) => q.ammo)} stuck=${maxStuck}`, JSON.stringify(ev));
}
console.log(results);
ok(Object.keys(results).length > 0 && !Object.keys(results).some((k) => k.endsWith('null')), 'every round finished');
// a still, hidden player: prone under bed for whole round
g.start('hider'); P().x = 7.3; P().z = 8.3; P().stance = 'prone'; let t = 0; while (g.phase !== 'over' && t < 400) { g.update(dt, { yaw: 0 }); t += dt; } console.log(' camper under bed:', g.result, g.why, t.toFixed(0), 'score', P().score.toFixed(0), P().stats);
process.exit(fails ? 1 : 0);
