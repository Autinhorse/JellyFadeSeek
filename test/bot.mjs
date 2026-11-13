import { CONFIG as C } from '../src/config.js'; import { buildWorld } from '../src/world.js'; import { Game } from '../src/sim.js';
let seed = 99; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const g = new Game(buildWorld(), rng); console.log('valid spots', g.hideSpots.length);
g.start('hunter'); const dt = 1 / 60; let arrivals = 0, last = 'go', moved = 0, repicks = 0, t = 0; const visited = new Set();
// human hunter: wander between patrol points to provoke the bot
let pi = 0, path = [];
while (g.phase !== 'over' && t < 200) {
  const m = g.me; if (!path.length) { const q = g.world.patrol[(pi += 7) % g.world.patrol.length]; path = g.nav.path(m.x, m.z, q.x, q.z) || []; }
  let yaw = m.yaw, f = 0; if (path.length) { const q = path[0], dx = q.x - m.x, dz = q.z - m.z; if (Math.hypot(dx, dz) < 0.3) path.shift(); else { yaw = Math.atan2(-dx, -dz); f = 1; } }
  g.update(dt, { yaw, f, pitch: 0 }); t += dt;
  if (g.bot.state !== last) { if (g.bot.state === 'hidden') { arrivals++; visited.add(g.hideSpots.indexOf(g.bot.spot)); const s = g.bot.spot; if (Math.hypot(g.player.x - s.x, g.player.z - s.z) > 0.4) console.log('  arrived far from spot', s, g.player.x.toFixed(1), g.player.z.toFixed(1)); if (g.player.stance !== s.st) console.log('  wrong stance at', s, g.player.stance); } last = g.bot.state; }
  for (const e of g.events) if (e.type === 'bump') repicks++; g.events.length = 0;
}
console.log('t', t.toFixed(0), 'phase', g.phase, g.result, 'arrivals', arrivals, 'distinct', visited.size, 'bot moved', g.stats.moved.toFixed(0), 'bumps', repicks, 'me', g.me.x.toFixed(1), g.me.z.toFixed(1));
// shooting: aim straight at bot from 5 m
g.start('hunter'); for (let i = 0; i < 700; i++) g.update(dt, { yaw: 0 }); const p = g.player; g.me.x = p.x; g.me.z = p.z + 4; if (g.collides(g.me.x, g.me.z, 1.6)) console.log('(me in wall, test approx)');
const hit0 = g.los(g.me.x, 1.3, g.me.z, p.x, 0.5, p.z); g.update(dt, { yaw: 0, pitch: -0.2, fire: true }); for (let i = 0; i < 120 && g.phase !== 'over'; i++) g.update(dt, { yaw: 0, pitch: -0.2 }); console.log('clear line', hit0, '-> result', g.result, 'ammo', g.me.ammo);
