// 假网络：一对互相连着的 link，可以设单程延迟、抖动、丢包。不依赖浏览器。
// 'u' 通道会丢包、会乱序；'r' 通道不丢、保持顺序（模拟可靠通道，只有延迟）。
// clock()：当前时间（秒）。消息不会自己送达，要定时调用 pump() 投递到期的消息。
export function fakePair({ lat = 0.05, jitter = 0.015, loss = 0.05, rng = Math.random } = {}, clock) {
  const mk = () => ({ onmsg: null, inbox: [], lastR: 0, sent: 0, bytes: 0, dropped: 0 });
  const a = mk(), b = mk();
  const wire = (from, to) => (ch, msg) => {
    const s = JSON.stringify(msg); from.sent++; from.bytes += s.length;
    if (ch === 'u' && rng() < loss) { from.dropped++; return; }
    let at = clock() + lat + rng() * jitter;
    if (ch === 'r') { at = Math.max(at, to.lastR); to.lastR = at; }
    to.inbox.push({ at, s, n: to.inbox.length });
  };
  a.send = wire(a, b); b.send = wire(b, a);
  const pump = () => {
    const now = clock();
    for (const x of [a, b]) {
      if (!x.inbox.length) continue;
      const due = x.inbox.filter((m) => m.at <= now).sort((p, q) => p.at - q.at || p.n - q.n);
      if (!due.length) continue;
      x.inbox = x.inbox.filter((m) => m.at > now);
      for (const m of due) if (x.onmsg) x.onmsg(JSON.parse(m.s));
    }
  };
  return { a, b, pump };
}
