// 房主：跑完整的模拟（sim.js），按客户端的输入重放远端玩家，定时广播状态快照和事件。
// 不依赖浏览器。时间由外面传进来（frame(dt)），方便 Node 里用虚拟时钟测试。
import { SNAP_HZ, JITTER_BUF, packShared, packMe, unpackInput, getConfig } from './protocol.js';

export class NetHost {
  // uid：房主自己的玩家编号
  constructor(game, uid = 'host') {
    this.game = game; this.uid = uid; this.peers = new Map(); this.now = 0; this.snapT = 0; this.round = 0; this.localKey = null;
    this.stats = { starve: 0 }; // 远端输入断流（需要重新攒）的次数
  }
  addPeer(uid, link, info = {}) {
    const p = { uid, link, info, key: null, q: [], lastQueued: 0, lastSeq: 0, budget: 0, flowing: false };
    link.onmsg = (m) => this.onMsg(p, m); this.peers.set(uid, p); return p;
  }
  removePeer(uid) { const p = this.peers.get(uid); if (!p) return; this.peers.delete(uid); if (p.key) { const a = this.game.actor(p.key); if (a) a.remote = false; } }
  onMsg(p, m) {
    if (m.type === 'in') {
      if (m.r !== this.round || !p.key) return; // 上一局留下的输入
      for (const a of m.list) { const i = unpackInput(a); if (i.seq <= p.lastQueued) continue; p.q.push(i); p.lastQueued = i.seq; }
    } else if (m.type === 'ping') p.link.send('u', { type: 'pong', c: m.c, t: this.now });
  }
  // 开局。setup 里每个角色可以带 uid：房主自己的、某个客户端的，或者没有（AI）
  begin(setup) {
    const g = this.game; this.round++; g.start(setup);
    this.localKey = null;
    for (const a of [...g.hiders, ...g.hunters]) {
      const s = (a.kind === 'hider' ? setup.hiders : setup.hunters)[a.id]; a.uid = s.uid || null; a.remote = false;
      if (!s.uid || s.ctrl !== 'human') continue;
      if (s.uid === this.uid) this.localKey = a.key;
      else { const p = this.peers.get(s.uid); if (p) { a.remote = true; p.key = a.key; } }
    }
    for (const p of this.peers.values()) { if (!p.key || !g.actor(p.key)?.remote) p.key = null; p.q = []; p.budget = 0; p.flowing = false; p.lastSeq = p.lastQueued; }
    const msg = { type: 'start', r: this.round, setup, cfg: getConfig() };
    for (const p of this.peers.values()) p.link.send('r', msg);
    this.snapT = 0;
  }
  sendConfig(path, v) { for (const p of this.peers.values()) p.link.send('r', { type: 'cfg', path, v }); }

  // 每帧调用。localInput：房主自己的输入。之后 game.events 里是这一帧的全部事件（外面照常处理）
  frame(dt, localInput) {
    const g = this.game; this.now += dt;
    // 远端玩家：按他们当时的帧时长逐条重放。先攒一点再开始，断流了就重新攒
    for (const p of this.peers.values()) {
      if (!p.key) continue;
      const queued = p.q.reduce((s, i) => s + i.dt, 0);
      if (!p.flowing) { if (queued < JITTER_BUF) continue; p.flowing = true; p.budget = 0; }
      p.budget += dt;
      if (queued > JITTER_BUF * 4) p.budget += queued - JITTER_BUF * 2; // 积压太多（对方时钟偏快或者网络突然通畅）：加速追上
      while (p.q.length && p.budget >= p.q[0].dt) { const i = p.q.shift(); p.budget -= i.dt; g.applyRemote(p.key, i.dt, i); p.lastSeq = i.seq; }
      if (!p.q.length && p.budget > JITTER_BUF) { p.flowing = false; this.stats.starve++; }
    }
    g.update(dt, this.localKey ? { [this.localKey]: localInput || {} } : {});
    // 事件：原样转发，客户端自己挑和自己有关的
    if (g.events.length && this.peers.size) { const msg = { type: 'ev', r: this.round, t: this.now, list: g.events.map((e) => ({ ...e })) }; for (const p of this.peers.values()) p.link.send('r', msg); }
    // 状态快照
    this.snapT -= dt;
    if (this.snapT <= 0 && this.peers.size && g.phase !== 'menu') {
      this.snapT += 1 / SNAP_HZ; if (this.snapT < 0) this.snapT = 0;
      const shared = packShared(g, this.now);
      for (const p of this.peers.values()) p.link.send('u', { type: 's', r: this.round, ...shared, ack: p.lastSeq, me: p.key ? packMe(g.actor(p.key)) : null });
    }
  }
}
