import { CONFIG as C } from '../src/config.js';
import { buildWorld } from '../src/world.js';
import { Game } from '../src/sim.js';
let seed = 12345; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const W = buildWorld(); console.log('boxes', W.boxes.length, 'parts', W.parts.length);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const g = new Game(W, rng); const dt = 1 / 60;
const run = (t, inp) => { for (let i = 0; i < t / dt; i++) g.update(dt, { yaw: g.player.yaw, ...inp }); };
// nav: every patrol point reachable from hunter spawn, and spawn free
let unreach = 0; for (const p of W.patrol) { if (!g.nav.isFree(p.x, p.z)) { console.log(' patrol blocked', p); unreach++; continue; } const path = g.nav.path(W.hunterSpawns[0].x, W.hunterSpawns[0].z, p.x, p.z); if (!path) { console.log(' unreachable', p); unreach++; } }
ok(unreach === 0, 'all patrol points reachable');
ok(!g.collides(W.spawn.x, W.spawn.z, 1.7), 'player spawn free');
// speeds
g.start(); C.invincible = true;
const speed = (st, runKey) => { g.reset(); g.phase = 'hide'; g.player.x = 13; g.player.z = 20; g.player.yaw = -Math.PI / 2; if (st !== 'walk') g.setStance(st); const x0 = g.player.x; run(1, { f: 1, run: runKey }); return g.player.x - x0; };
ok(Math.abs(speed('walk') - 2.2) < 0.1, 'walk speed'); ok(Math.abs(speed('walk', true) - 4.0) < 0.1, 'run speed');
ok(Math.abs(speed('crouch') - 1.4) < 0.1, 'crouch speed'); ok(Math.abs(speed('prone') - 0.7) < 0.1, 'prone speed');
// visibility fade
g.reset(); g.phase = 'hide'; g.player.x = 10; g.player.z = 21; run(0.3, { f: 1, run: true }); ok(g.player.vis > 0.99, 'running fully visible ' + g.player.vis.toFixed(2));
run(4.4, {}); ok(g.player.vis > C.visFloor, 'not yet at floor at 4.4s ' + g.player.vis.toFixed(3)); run(0.2, {}); ok(g.player.vis <= C.visFloor + 1e-6, 'at floor after 4.6s ' + g.player.vis.toFixed(3));
// prone under bed, crouch cannot
g.reset(); g.phase = 'hide'; g.player.x = 9.2; g.player.z = 8.3; g.player.yaw = Math.PI / 2; g.setStance('crouch'); run(2, { f: 1 }); ok(g.player.x > 8.7, 'crouch blocked by bed x=' + g.player.x.toFixed(2));
g.setStance('prone'); run(3, { f: 1 }); ok(g.player.x < 8.0, 'prone goes under bed x=' + g.player.x.toFixed(2)); ok(g.setStance('prone') === false, 'cannot stand under bed');
// sofa occlusion: player crouched north of living sofa (z<15.6), hunter south... sofa at x 9.2..12.8 z 15.6..16.6
g.reset(); g.phase = 'seek'; g.player.x = 11; g.player.z = 15.3; g.setStance('crouch'); const h = g.hunters[0];
let see = g.bodyPoints().filter((q) => g.los(11, C.hunterEye, 17.4, q[0], q[1], q[2])).length; ok(see === 0, 'crouched behind sofa hidden from 1.8m away, pts=' + see);
g.setStance('crouch'); see = g.bodyPoints().filter((q) => g.los(11, C.hunterEye, 17.4, q[0], q[1], q[2])).length; ok(see > 0, 'standing behind sofa visible pts=' + see);
// window vault
g.reset(); g.phase = 'hide'; g.player.x = 10.7; g.player.z = 17; g.player.yaw = Math.PI; run(1.5, { f: 1 }); ok(g.player.z > 18.5, 'vault through window z=' + g.player.z.toFixed(2));
ok(g.nav.path(10.7, 17, 10.7, 19.5).length > 2, 'hunter must detour around vault window');
// full rounds with a wandering bot
C.invincible = false; const results = {};
for (let r = 0; r < 12; r++) {
  g.start(); let t = 0, yaw = 0, mode = 0, stuck = 0, maxStuck = 0; const last = g.hunters.map((q) => ({ x: q.x, z: q.z })); let ev = {};
  while (g.phase !== 'over' && t < 400) {
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) { if (rng() < 0.3) yaw = rng() * 6.28; mode = rng(); }
    g.update(dt, { yaw, f: mode < 0.5 ? 1 : 0, run: mode < 0.12 }); t += dt;
    for (const e of g.events) ev[e.type] = (ev[e.type] || 0) + 1; g.events.length = 0;
    g.hunters.forEach((q, i) => { if (g.phase === 'seek' && q.speed > 0 && Math.hypot(q.x - last[i].x, q.z - last[i].z) < 1e-5) { stuck++; maxStuck = Math.max(maxStuck, stuck); } else stuck = 0; last[i].x = q.x; last[i].z = q.z; if (!(q.x > 0 && q.z > 0)) throw new Error('NaN hunter'); });
  }
  results[g.result] = (results[g.result] || 0) + 1;
  console.log(` round ${r}: ${g.result} t=${t.toFixed(0)} score=${g.score.toFixed(0)} ammo=${g.hunters.map((q) => q.ammo)} stuck=${maxStuck}`, JSON.stringify(ev));
}
console.log(results);
// a still, hidden player: prone under bed for whole round
g.start(); g.player.x = 7.3; g.player.z = 8.3; g.player.stance = 'prone'; let t = 0; while (g.phase !== 'over' && t < 400) { g.update(dt, { yaw: 0 }); t += dt; } console.log(' camper under bed:', g.result, t.toFixed(0), 'score', g.score.toFixed(0), g.stats);
process.exit(fails ? 1 : 0);
