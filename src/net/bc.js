// 同一台电脑上几个标签页之间的假网络（BroadcastChannel），带人为延迟、抖动和丢包，用来试手感。
// 第 3 步换成 WebRTC 后，这个文件只留着做本机测试。
export class BcNet {
  constructor(id, { lat = 0.05, jitter = 0.01, loss = 0 } = {}) {
    this.id = id; this.opt = { lat, jitter, loss }; this.links = new Map(); this.onHello = null;
    this.ch = new BroadcastChannel('jfs-net');
    this.ch.onmessage = (e) => {
      const d = e.data; if (d.to !== this.id) return;
      if (d.hello) { if (this.onHello) this.onHello(d.from, d.hello); return; }
      const l = this.links.get(d.from); if (l && l.onmsg) l.onmsg(JSON.parse(d.m));
    };
  }
  hello(to, info) { this.ch.postMessage({ from: this.id, to, hello: info }); }
  link(peer) {
    if (this.links.has(peer)) return this.links.get(peer);
    const o = this.opt, l = { onmsg: null, lastR: 0, bytes: 0 };
    l.send = (ch, msg) => {
      const m = JSON.stringify(msg); l.bytes += m.length;
      if (ch === 'u' && Math.random() < o.loss) return;
      let at = performance.now() + (o.lat + Math.random() * o.jitter) * 1000;
      if (ch === 'r') { at = Math.max(at, l.lastR); l.lastR = at; }
      setTimeout(() => this.ch.postMessage({ from: this.id, to: peer, m }), Math.max(0, at - performance.now()));
    };
    this.links.set(peer, l); return l;
  }
}
