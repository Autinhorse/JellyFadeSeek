import { CONFIG as C } from '../src/config.js'; import { buildWorld } from '../src/world.js'; import { Game, lineup } from '../src/sim.js';
let seed = 99; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const g = new Game(buildWorld(), rng); console.log('valid spots', g.hideSpots.length);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const dt = 1 / 60;
// human hunter: wander between patrol points to provoke the bots
function wander(nBots) {
  g.start(lineup('hunter', 1, nBots)); const m = g.hunters[0]; let pi = 0, path = [], t = 0; const st = g.hiders.map(() => ({ last: 'go', arrivals: 0, visited: new Set() })); let bumps = 0;
  while (g.phase !== 'over' && t < 200) {
    if (!path.length) { const q = g.world.patrol[(pi += 7) % g.world.patrol.length]; path = g.nav.path(m.x, m.z, q.x, q.z) || []; }
    let yaw = m.yaw, f = 0; if (path.length) { const q = path[0], dx = q.x - m.x, dz = q.z - m.z; if (Math.hypot(dx, dz) < 0.3) path.shift(); else { yaw = Math.atan2(-dx, -dz); f = 1; } }
    g.update(dt, { yaw, f, pitch: 0 }); t += dt;
    g.hiders.forEach((q, i) => {
      const s = st[i]; if (q.bot.state === s.last) return; s.last = q.bot.state; if (q.bot.state !== 'hidden') return;
      s.arrivals++; s.visited.add(g.hideSpots.indexOf(q.bot.spot)); const sp = q.bot.spot;
      if (Math.hypot(q.x - sp.x, q.z - sp.z) > 0.4) console.log('  arrived far from spot', sp, q.x.toFixed(1), q.z.toFixed(1)); if (q.stance !== sp.st) console.log('  wrong stance at', sp, q.stance);
    });
    for (const e of g.events) if (e.type === 'bump') bumps++; g.events.length = 0;
  }
  return { t, st, bumps };
}
{ const { t, st, bumps } = wander(1); const q = g.hiders[0];
  console.log('t', t.toFixed(0), 'phase', g.phase, g.result, g.why, 'arrivals', st[0].arrivals, 'distinct', st[0].visited.size, 'bot moved', q.stats.moved.toFixed(0), 'bumps', bumps, 'me', g.hunters[0].x.toFixed(1), g.hunters[0].z.toFixed(1));
  ok(st[0].visited.size >= 3, 'single bot visits several spots'); }
{ const { st } = wander(4); const spots = g.hiders.filter((q) => !q.caught).map((q) => q.bot.spot);
  console.log(' 4 bots: distinct spots each', st.map((s) => s.visited.size).join(','), 'caught', g.hiders.filter((q) => q.caught).length);
  ok(st.every((s) => s.arrivals >= 1), 'every one of 4 bots reaches a hiding spot'); ok(new Set(spots).size === spots.length, 'bots do not share a hiding spot'); }
// shooting: aim straight at bot from 4 m
g.start('hunter'); for (let i = 0; i < 700; i++) g.update(dt, { yaw: 0 }); const p = g.hiders[0], me = g.hunters[0]; me.x = p.x; me.z = p.z + 4; if (g.collides(me.x, me.z, 1.6)) console.log('(me in wall, test approx)');
const hit0 = g.los(me.x, 1.3, me.z, p.x, 0.5, p.z); g.update(dt, { yaw: 0, pitch: -0.2, fire: true }); for (let i = 0; i < 120 && g.phase !== 'over'; i++) g.update(dt, { yaw: 0, pitch: -0.2 }); console.log('clear line', hit0, '-> result', g.result, 'ammo', me.ammo);
ok(me.ammo === C.ammo - 1, 'human hunter fired one shot');
process.exit(fails ? 1 : 0);
