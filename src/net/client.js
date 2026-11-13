// 客户端：本机先按输入移动自己（预测），收到房主快照后从房主确认过的状态重放没确认的输入（对齐）。
// 别人的位置按房主时间延后 INTERP_DELAY 秒插值显示，事件也按同样的时间放出来，画面和声音对得上。
// game 只用来显示和预测，客户端从不调用 game.update()。不依赖浏览器。
import { CONFIG as C } from '../config.js';
import { lerp, angDiff } from '../sim.js';
import { SNAP_HZ, INTERP_DELAY, SEND_HZ, RESEND, makeInput, packInput, packMe, applyMe, unStance, unHState, setConfig, setConfigPath } from './protocol.js';

export class NetClient {
  constructor(game, link, uid) {
    this.game = game; this.link = link; this.uid = uid; link.onmsg = (m) => this.onMsg(m);
    this.now = 0; this.round = 0; this.key = null; this.seq = 0;
    this.pending = []; this.sends = []; this.sendT = 0; this.pingT = 0;
    this.snaps = []; this.latest = null; this.evq = []; this.off = null; this.rtt = 0.1; this.bestRtt = 1e9; this.rttT = 0;
    this.predShots = []; // 自己开的、还没对上房主编号的颜料弹
    this.stats = { corrections: 0, maxErr: 0, snaps: 0 };
    this.onStart = null; // 开局时回调（界面用）
  }
  me() { return this.key ? this.game.actor(this.key) : null; }
  hostNow() { return this.now + (this.off ?? 0); }

  onMsg(m) {
    switch (m.type) {
      case 'start': {
        setConfig(m.cfg); this.round = m.r; this.game.start(m.setup); this.key = null;
        for (const a of [...this.game.hiders, ...this.game.hunters]) { const s = (a.kind === 'hider' ? m.setup.hiders : m.setup.hunters)[a.id]; a.uid = s.uid || null; if (s.uid === this.uid && s.ctrl === 'human') this.key = a.key; }
        this.pending = []; this.sends = []; this.snaps = []; this.latest = null; this.evq = []; this.predShots = [];
        if (this.onStart) this.onStart(this.me());
        break;
      }
      case 's': if (m.r === this.round) this.onSnap(m); break;
      case 'ev': if (m.r === this.round) for (const e of m.list) this.evq.push({ t: m.t, e }); break;
      case 'cfg': setConfigPath(m.path, m.v); break;
      case 'pong': {
        // 往返时间和房主时钟的偏差：取往返最快的那次估计最准，慢慢放宽，适应网络变化
        const rtt = this.now - m.c; this.rtt = lerp(this.rtt, rtt, 0.2);
        if (rtt <= this.bestRtt * 1.2 || this.off === null) { const off = m.t + rtt / 2 - this.now; this.off = this.off === null ? off : lerp(this.off, off, 0.3); this.bestRtt = Math.min(this.bestRtt, rtt); }
        break;
      }
    }
  }
  onSnap(m) {
    this.stats.snaps++;
    // 快照可能乱序到达：按房主时间排好，太旧的丢掉
    if (this.latest && m.t <= this.latest.t) { if (!this.snaps.some((s) => s.t === m.t)) { this.snaps.push(m); this.snaps.sort((a, b) => a.t - b.t); } return; }
    this.latest = m; this.snaps.push(m); if (this.snaps.length > 40) this.snaps.shift();
    if (this.off === null) this.off = m.t - this.now; // 还没测到延迟时先粗略对上
    const g = this.game; g.phase = m.ph; g.result = m.res; g.why = m.why; g.hideLeft = m.hl; g.timeLeft = m.tl;
    const me = this.me(); if (!me || !m.me) return;
    // 对齐：回到房主确认过的状态，再把没确认的输入重放一遍
    this.pending = this.pending.filter((i) => i.seq > m.ack);
    const px = me.x, pz = me.z, evLen = g.events.length;
    applyMe(me, m.me);
    if (!(me.kind === 'hider' && me.caught)) for (const i of this.pending) this.step(me, i, true);
    g.events.length = evLen; // 重放不产生事件
    const err = Math.hypot(px - me.x, pz - me.z);
    // 被喷中那一刻的回退是正常的（房主不再移动它），不算预测出错
    if (err > 1e-6 && !(me.kind === 'hider' && me.caught)) { this.stats.corrections++; this.stats.maxErr = Math.max(this.stats.maxErr, err); }
  }
  // 按一条输入移动自己（和房主用的是同一段代码）
  step(me, i, replay) {
    const g = this.game;
    if (me.kind === 'hider') { g.stepHider(me, i.dt, i); return; }
    const shot = g.stepHunter(me, i.dt, i);
    if (shot && !replay) {
      const [x, y, z, vx, vy, vz] = shot, s = { sid: null, x, y, z, vx, vy, vz, color: me.color, owner: me.id, life: 4, near: [] };
      g.shots.push(s); this.predShots.push(s); g.emit('fire', { id: me.id, x, y, z, ammo: me.ammo });
      if (me.ammo <= 0) g.emit('empty', { id: me.id });
    }
  }

  // 每帧调用。input：本机输入。之后 game.events 里是要显示的事件
  frame(dt, input) {
    const g = this.game; this.now += dt;
    this.pingT -= dt; if (this.pingT <= 0) { this.pingT = 0.5; this.link.send('u', { type: 'ping', c: this.now }); }
    const me = this.me();
    // 1. 预测自己
    if (me && (g.phase === 'hide' || g.phase === 'seek') && !(me.kind === 'hider' && me.caught)) {
      const i = makeInput(++this.seq, dt, input); this.step(me, i, false); this.pending.push(i);
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 1 / SEND_HZ; const fresh = this.pending.filter((p) => !p.sent); for (const p of fresh) p.sent = true;
        this.sends.push(fresh.map(packInput)); if (this.sends.length > RESEND) this.sends.shift();
        this.link.send('u', { type: 'in', r: this.round, list: this.sends.flat() });
      }
    }
    // 2. 别人：插值
    const rt = this.hostNow() - INTERP_DELAY;
    if (this.snaps.length) this.interpolate(rt, me);
    if (g.phase === 'seek' && this.latest) g.timeLeft = Math.max(0, this.latest.tl - Math.max(0, this.hostNow() - this.latest.t));
    if (g.phase === 'hide' && this.latest) g.hideLeft = Math.max(0, this.latest.hl - Math.max(0, this.hostNow() - this.latest.t));
    // 3. 事件：到了显示时间再放；自己开的枪和它的落点马上放
    const myHunter = me && me.kind === 'hunter' ? me.id : -1;
    this.evq.sort((a, b) => a.t - b.t);
    while (this.evq.length) {
      const { t, e } = this.evq[0], urgent = (e.type === 'fire' || e.type === 'splat') && (e.id === myHunter || e.owner === myHunter) && myHunter >= 0;
      if (t > rt && !urgent) break;
      this.evq.shift(); this.release(e, me);
    }
    // 4. 颜料弹只画弹道
    g.updateShots(dt, true);
  }
  release(e, me) {
    const g = this.game, myHider = me && me.kind === 'hider' ? me.id : -1, myHunter = me && me.kind === 'hunter' ? me.id : -1;
    if (e.type === 'start') return; // 本机开局时已经有了
    if ((e.type === 'stance' || e.type === 'bump') && e.hid === myHider) return; // 本机预测时已经放过
    if (e.type === 'fire') {
      if (e.id === myHunter) { const s = this.predShots.shift(); if (s) s.sid = e.sid; return; }
      g.shots.push({ sid: e.sid, x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz, color: e.color, owner: e.id, life: 4, near: [] });
    }
    if (e.type === 'empty' && e.id === myHunter) return;
    if (e.type === 'splat') for (const s of g.shots) if (s.sid === e.sid) s.dead = true;
    g.events.push(e);
  }
  interpolate(rt, me) {
    const g = this.game, S = this.snaps;
    let a = S[0], b = S[S.length - 1];
    for (let k = 0; k < S.length - 1; k++) if (S[k].t <= rt && S[k + 1].t >= rt) { a = S[k]; b = S[k + 1]; break; }
    if (rt >= b.t) a = b; // 没有更新的快照：停在最新的
    const u = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1, D = u < 0.5 ? a : b;
    // 丢掉用不到的旧快照
    while (S.length > 2 && S[1].t < rt - 0.5) S.shift();
    g.hiders.forEach((q, i) => {
      const A = a.H[i], B = b.H[i], L = this.latest.H[i]; if (!A || !B) return;
      q.score = L[9]; q.caught = !!(L[5] & 4); q.caughtColor = L[8] || null;
      if (this.latest.S) q.stats = { ...this.latest.S[i], moved: q === me ? q.stats.moved : this.latest.S[i].moved };
      if (q === me) { if (q.caught) q.vis = 1; return; }
      const d = D.H[i];
      q.x = lerp(A[0], B[0], u); q.z = lerp(A[1], B[1], u); q.yaw = A[2] + angDiff(B[2], A[2]) * u; q.floorY = lerp(A[7], B[7], u); q.vis = lerp(A[4], B[4], u); q.pitch = lerp(A[10], B[10], u);
      q.stance = unStance(d[3]); q.moving = !!(d[5] & 1); q.running = !!(d[5] & 2); q.noise = d[6];
    });
    g.hunters.forEach((h, i) => {
      const A = a.K[i], B = b.K[i], L = this.latest.K[i]; if (!A || !B) return;
      h.fired = L[13];
      if (h === me) return;
      const d = D.K[i];
      h.x = lerp(A[0], B[0], u); h.z = lerp(A[1], B[1], u); h.ang = A[2] + angDiff(B[2], A[2]) * u; h.yaw = A[3] + angDiff(B[3], A[3]) * u; h.pitch = lerp(A[4], B[4], u);
      h.hop = lerp(A[11], B[11], u); h.speed = d[10];
      h.state = unHState(d[5]); h.ammo = d[6]; h.detect = d[7]; h.target = d[8]; h.bend = !!(d[9] & 1); h.running = !!(d[9] & 2); h.moving = !!(d[9] & 4); h.det = d[12];
      h.dist = me ? Math.hypot(h.x - me.x, h.z - me.z) : 99;
    });
  }
}
