// 联机消息格式。不依赖浏览器，Node 里能跑。
//
// 传输层只要提供 link.send(通道, 消息对象) 和 link.onmsg = (消息对象) => {}，JSON 序列化由传输层负责。
// 通道：'r' 可靠有序（开局、事件、调试数值），'u' 不保证送达（输入、状态快照、测延迟）。
//
// 房主 → 客户端
//   { type: 'start', r: 第几局, setup, cfg }          开局，cfg 是房主的全部数值
//   { type: 's', r, t, ack, me, ph, tl, hl, res, why, H, K, S? }   状态快照，每秒 SNAP_HZ 次
//   { type: 'ev', r, t, list }                        这一帧发生的事件
//   { type: 'cfg', path, v }                          调试面板改了一个数值
//   { type: 'pong', c, t }                            回应测延迟
// 客户端 → 房主
//   { type: 'in', r, list: [输入数组...] }             最近几次发送里的全部输入（丢包时靠重复送达）
//   { type: 'ping', c }
import { CONFIG as C } from '../config.js';

export const SNAP_HZ = 20;          // 状态快照频率
export const INTERP_DELAY = 0.1;    // 别人的位置延后多少秒显示（插值用）
export const SEND_HZ = 60;          // 客户端最多每秒发几次输入
export const RESEND = 4;            // 每个输入包重复带上最近几次发送的输入
export const JITTER_BUF = 0.05;     // 房主为每个远端玩家攒多少秒的输入再开始重放

const STANCES = ['walk', 'crouch', 'prone'];
const HSTATES = ['wait', 'patrol', 'investigate', 'chase', 'search', 'empty', 'human'];
const STANCE_REQ = [null, 'crouch', 'prone', 'stand'];
const r3 = (v) => Math.round(v * 1000) / 1000, r2 = (v) => Math.round(v * 100) / 100;
// 输入里的数值先在本机取整再使用，保证房主收到后算出来的结果和本机预测逐位一致
export const qa = (v) => Math.round(v * 1e4) / 1e4;
export const qdt = (v) => Math.max(1e-5, Math.min(0.05, Math.round(v * 1e5) / 1e5));

// —— 输入 ——
// 数组：[seq, dt, f, s, 标志(1 跑, 2 开枪), yaw, pitch, 姿态请求(0 无, 1 蹲, 2 趴, 3 站起)]
export function makeInput(seq, dt, inp) {
  return { seq, dt: qdt(dt), f: Math.sign(inp.f || 0), s: Math.sign(inp.s || 0), run: !!inp.run, fire: !!inp.fire, yaw: qa(inp.yaw || 0), pitch: qa(inp.pitch || 0), stance: inp.stance || null };
}
export const packInput = (i) => [i.seq, i.dt, i.f, i.s, (i.run ? 1 : 0) | (i.fire ? 2 : 0), i.yaw, i.pitch, Math.max(0, STANCE_REQ.indexOf(i.stance))];
export const unpackInput = (a) => ({ seq: a[0], dt: a[1], f: a[2], s: a[3], run: !!(a[4] & 1), fire: !!(a[4] & 2), yaw: a[5], pitch: a[6], stance: STANCE_REQ[a[7]] || null });

// —— 状态快照 ——
// 所有人共用的部分（每次快照只打包一次）
export function packShared(g, t) {
  const o = {
    t: r3(t), ph: g.phase, tl: r2(g.timeLeft), hl: r2(g.hideLeft), res: g.result, why: g.why,
    // 躲藏方：[x, z, yaw, 姿态, 可见度, 标志(1 在动, 2 跑, 4 被喷中), 噪音, 地面高度, 喷中颜色, 分数, pitch]
    H: g.hiders.map((q) => [r3(q.x), r3(q.z), r3(q.yaw), STANCES.indexOf(q.stance), r3(q.vis), (q.moving ? 1 : 0) | (q.running ? 2 : 0) | (q.caught ? 4 : 0), q.noise, r3(q.floorY), q.caughtColor || 0, Math.floor(q.score), r3(q.pitch)]),
    // 猎人：[x, z, 朝向, yaw, pitch, 状态, 颜料, 最大发现值, 目标, 标志(1 弯腰, 2 跑, 4 在动), 速度, 步伐相位, [对每个躲藏方的发现值], 已开枪数]
    K: g.hunters.map((h) => [r3(h.x), r3(h.z), r3(h.ang), r3(h.yaw), r3(h.pitch), HSTATES.indexOf(h.state), h.ammo, r2(h.detect), h.target, (h.bend ? 1 : 0) | (h.running ? 2 : 0) | (h.moving ? 4 : 0), r2(h.speed), r3(h.hop), h.det.map(r2), h.fired]),
  };
  if (g.phase === 'over') o.S = g.hiders.map((q) => q.stats);
  return o;
}
// 接收方自己的角色：本机预测需要的全部字段，不取整
export function packMe(a) {
  if (!a) return null;
  if (a.kind === 'hider') return { x: a.x, z: a.z, yaw: a.yaw, pitch: a.pitch, stance: a.stance, running: a.running, moving: a.moving, vis: a.vis, still: a.still, noise: a.noise, vx: a.vx, vz: a.vz, floorY: a.floorY, moved: a.stats.moved, caught: a.caught };
  return { x: a.x, z: a.z, yaw: a.yaw, pitch: a.pitch, ang: a.ang, running: a.running, moving: a.moving, speed: a.speed, hop: a.hop, cd: a.cd, ammo: a.ammo, fired: a.fired, state: a.state };
}
export function applyMe(a, m) {
  for (const k in m) if (k !== 'moved') a[k] = m[k];
  if (m.moved !== undefined) a.stats.moved = m.moved;
}
export const unStance = (i) => STANCES[i] || 'walk';
export const unHState = (i) => HSTATES[i] || 'patrol';

// —— 调试数值 ——
export function getConfig() { return JSON.parse(JSON.stringify(C)); }
export function setConfig(obj) { const put = (dst, src) => { for (const k in src) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') put(dst[k], src[k]); else dst[k] = src[k]; } }; put(C, obj); }
export function setConfigPath(path, v) { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], C)[last] = v; }
