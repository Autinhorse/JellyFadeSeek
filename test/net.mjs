// 联机：1 个房主 + 2 个客户端，用假网络（延迟、抖动、丢包）跑完整局，检查预测、插值、事件、胜负和流量。
import { CONFIG as C } from '../src/config.js';
import { buildWorld } from '../src/world.js';
import { Game, lineup, angDiff } from '../src/sim.js';
import { NetHost } from '../src/net/host.js';
import { NetClient } from '../src/net/client.js';
import { fakePair } from '../src/net/fake.js';
import { INTERP_DELAY } from '../src/net/protocol.js';

const W = buildWorld();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const seeded = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;

function run(name, net, { seconds = 200, seed = 1 } = {}) {
  let now = 0; const clock = () => now; const rng = seeded(seed * 7 + 3);
  const gH = new Game(W, seeded(seed)), host = new NetHost(gH, 'H');
  const pA = fakePair({ ...net, rng }, clock), pB = fakePair({ ...net, rng }, clock);
  host.addPeer('A', pA.a); host.addPeer('B', pB.a);
  const A = new NetClient(new Game(W, seeded(seed + 1)), pA.b, 'A'), B = new NetClient(new Game(W, seeded(seed + 2)), pB.b, 'B');
  const setup = lineup('none', 2, 3); setup.hiders[0] = { ctrl: 'human', uid: 'H' }; setup.hiders[1] = { ctrl: 'human', uid: 'A' }; setup.hunters[0] = { ctrl: 'human', uid: 'B' };
  // 每台机器的帧率不一样，帧时长也有一点抖动
  const fr = { H: [1 / 60, 0], A: [1 / 100, 0], B: [1 / 75, 0] }, next = { H: 0, A: 0, B: 0 }, last = { H: 0, A: 0, B: 0 };
  const ir = seeded(seed + 9), wander = { H: { yaw: 0, f: 0, run: false }, A: { yaw: 0, f: 0, run: false } };
  const hist = { B: [], A: [] }; const errs = []; const ev = { A: {}, B: {}, H: {} }; let started = false, bFireT = 0, endT = null;
  const evCount = (who, g) => { for (const e of g.events) ev[who][e.type] = (ev[who][e.type] || 0) + 1; g.events.length = 0; };
  const randomInput = (k, me) => {
    const w = wander[k]; if (ir() < 0.02) { w.yaw = ir() * 6.28; const m = ir(); w.f = m < 0.6 ? 1 : 0; w.run = m < 0.12; }
    let stance = null; if (ir() < 0.004) stance = ['crouch', 'prone', 'stand'][Math.floor(ir() * 3)];
    return { yaw: w.yaw, pitch: 0, f: w.f, s: 0, run: w.run, stance };
  };
  const hunterInput = (g, me) => { // 追最近的躲藏方，近了就开枪
    let best = null, bd = 1e9; for (const q of g.hiders) { if (q.caught) continue; const d = Math.hypot(q.x - me.x, q.z - me.z); if (d < bd) { bd = d; best = q; } }
    if (!best || g.phase !== 'seek') return { yaw: me.yaw, pitch: 0 };
    const p = g.nav.path(me.x, me.z, best.x, best.z) || [], t = p[0] || best, yaw = Math.atan2(-(t.x - me.x), -(t.z - me.z));
    const aimYaw = Math.atan2(-(best.x - me.x), -(best.z - me.z)), fire = bd < 7 && bFireT <= 0 && Math.abs(angDiff(aimYaw, me.yaw)) < 0.1;
    if (fire) bFireT = 1.2;
    return { yaw: bd < 7 ? aimYaw : yaw, pitch: Math.atan2(best.floorY + 0.8 - C.hunterEye, bd), f: bd > 3 ? 1 : 0, run: bd > 8, fire };
  };
  const at = (h, t) => { for (let k = h.length - 1; k > 0; k--) if (h[k - 1].t <= t) { const a = h[k - 1], b = h[k], u = (t - a.t) / (b.t - a.t || 1); return [a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u]; } return null; };
  while (now < seconds && !(endT !== null && now > endT + 1)) {
    now = Math.round((now + 0.001) * 1000) / 1000; pA.pump(); pB.pump();
    if (!started && now > 0.6) { started = true; host.begin(setup); }
    for (const k of ['H', 'A', 'B']) {
      if (now < next[k]) continue; const dt = now - last[k]; last[k] = now; next[k] = now + fr[k][0] * (0.9 + 0.2 * ir());
      if (k === 'H') {
        const me = host.localKey && gH.actor(host.localKey); host.frame(dt, me ? randomInput('H', me) : {}); evCount('H', gH) ;
        for (const [who, key] of [['B', 'k0'], ['A', 'h1']]) { const a = gH.actor(key); if (a) hist[who].push({ t: host.now, x: a.x, z: a.z }); }
        if (gH.phase === 'over' && endT === null) endT = now;
      } else if (k === 'A') {
        const me = A.me(); A.frame(dt, me ? randomInput('A', me) : {});
        // 客户端 A 看到的猎人 B 位置，和房主那边同一时刻的真实位置比
        const hb = A.game.hunters[0]; if (hb && A.game.phase === 'seek' && hist.B.length > 10) { const r = at(hist.B, A.hostNow() - INTERP_DELAY); if (r) errs.push(Math.hypot(hb.x - r[0], hb.z - r[1])); }
        evCount('A', A.game);
      } else {
        const me = B.me(); bFireT -= dt; B.frame(dt, me ? hunterInput(B.game, me) : {}); evCount('B', B.game);
      }
    }
  }
  errs.sort((a, b) => a - b); const p = (q) => errs.length ? errs[Math.floor(errs.length * q)].toFixed(3) : '-';
  const kbps = (link) => (link.bytes / now / 1024).toFixed(1);
  const rA = A.game.hiders[1], rH = gH.hiders[1];
  console.log(`\n[${name}] 用时 ${now.toFixed(0)}s 结果 房主=${gH.result}/${gH.why} A=${A.game.result} B=${B.game.result}  被喷中 ${gH.hiders.filter((q) => q.caught).length}/3  B 开枪 ${gH.hunters[0].fired}`);
  console.log(`  预测对齐：A 修正 ${A.stats.corrections} 次 最大 ${A.stats.maxErr.toFixed(3)}m；B 修正 ${B.stats.corrections} 次 最大 ${B.stats.maxErr.toFixed(3)}m；房主断流重攒 ${host.stats.starve} 次`);
  console.log(`  插值误差（A 看到的猎人 B）：中位 ${p(0.5)}m  95% ${p(0.95)}m  最大 ${p(0.999)}m  延迟估计 rtt=${(A.rtt * 1000).toFixed(0)}ms`);
  console.log(`  流量 KB/s：A 上行 ${kbps(pA.b)} 下行 ${kbps(pA.a)}；B 上行 ${kbps(pB.b)} 下行 ${kbps(pB.a)}；丢包 ${pA.a.dropped + pA.b.dropped + pB.a.dropped + pB.b.dropped}`);
  console.log('  A 收到事件', JSON.stringify(ev.A)); console.log('  B 收到事件', JSON.stringify(ev.B));
  return { gH, A, B, errs, ev, host, pA, pB, rA, rH, now };
}

// 1. 没有延迟：预测应该和房主完全一致
{ const r = run('无延迟', { lat: 0, jitter: 0, loss: 0 });
  ok(r.A.stats.corrections === 0, '无延迟：躲藏方客户端零修正');
  ok(r.gH.phase === 'over' && r.A.game.result === r.gH.result && r.B.game.result === r.gH.result, '三方结果一致'); }
// 2. 100 毫秒往返、抖动、5% 丢包
{ const r = run('往返 100ms 丢包 5%', { lat: 0.05, jitter: 0.015, loss: 0.05 }, { seed: 2 });
  ok(r.A.stats.corrections === 0, '100ms：躲藏方客户端零修正（输入逐条重放，结果逐位一致）');
  ok(r.B.stats.maxErr < 0.6, `100ms：猎人客户端修正幅度小（${r.B.stats.maxErr.toFixed(3)}m，只在找人开始的瞬间）`);
  ok(r.errs.length > 100 && r.errs[Math.floor(r.errs.length * 0.95)] < 0.25, '100ms：别人位置的插值误差 95% 小于 0.25 米');
  ok(r.A.game.result === r.gH.result && r.B.game.result === r.gH.result, '100ms：三方结果一致');
  ok(r.ev.A.seek === 1 && (r.ev.B.fire || 0) >= 1, '100ms：事件送达（开始找人、开枪）');
  ok(r.gH.hiders[1].stats.moved > 20, `100ms：客户端躲藏方在房主那边确实移动了（${r.gH.hiders[1].stats.moved.toFixed(0)}m）`);
  const up = r.pA.b.bytes / r.now / 1024, down = r.pA.a.bytes / r.now / 1024; ok(up < 40 && down < 40, `100ms：每个客户端流量上行 ${up.toFixed(1)}、下行 ${down.toFixed(1)} KB/s`); }
// 3. 很差的网络：300ms 往返、大抖动、15% 丢包，也要能玩完一局
{ const r = run('往返 300ms 丢包 15%', { lat: 0.15, jitter: 0.06, loss: 0.15 }, { seed: 3 });
  ok(r.gH.phase === 'over' && r.A.game.result === r.gH.result, '300ms + 15% 丢包：能完整玩完一局，结果一致'); }
process.exit(fails ? 1 : 0);
