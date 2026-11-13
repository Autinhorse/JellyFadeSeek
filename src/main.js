import { CONFIG as C } from './config.js';
import { buildWorld } from './world.js';
import { Game, lineup, MAX_HIDERS, MAX_HUNTERS } from './sim.js';
import { View } from './render.js';
import { Radar, Hud, DebugPanel } from './ui.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const hexs = (c) => '#' + c.toString(16).padStart(6, '0');
const world = buildWorld(), game = new Game(world), canvas = $('gl');
const view = new View(canvas, world, game), radar = new Radar($('radar'), game), hud = new Hud(game), sfx = new Sfx();
const debug = new DebugPanel();
const TEST = location.hash === '#test';

// 本机控制的角色。菜单时是 0 号躲藏方（相机停在后院看房子）
let me = game.hiders[0]; view.local = hud.local = me;
const keys = {}; let yaw = world.spawn.yaw, pitch = 0, locked = false, dragLook = false, dragging = false, paused = false, endShown = false, lockTried = false;
const input = { f: 0, s: 0, run: false, yaw, pitch, fire: false, stance: null }; let fireQ = false, stanceQ = null;
// 旁观（被喷中后）：自由飞行的相机
let spec = null, specT = 0;

function resize() { view.resize(window.innerWidth, window.innerHeight); const m = view.mirrorRect(), f = $('mirror'); f.style.left = m.x - 6 + 'px'; f.style.bottom = m.y - 6 + 'px'; f.style.width = f.style.height = m.s + 'px'; }
window.addEventListener('resize', resize); resize();

// —— 输入 ——
const playing = () => game.phase === 'hide' || game.phase === 'seek';
const isHunter = () => me.kind === 'hunter';
function tryLock() {
  if (TEST || dragLook) return; lockTried = true;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => useDrag()); } catch (e) { useDrag(); }
  setTimeout(() => { if (!locked && playing() && !dragLook) useDrag(); }, 900);
}
function useDrag() { if (dragLook) return; dragLook = true; paused = false; $('pause').classList.remove('show'); hud.toast('按住鼠标左键拖动来转视角（也可以用 Q / E 键）', 'info'); }
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && playing() && !dragLook && !TEST) { paused = true; $('pause').classList.add('show'); } if (locked) { paused = false; $('pause').classList.remove('show'); } });
document.addEventListener('pointerlockerror', useDrag);
document.addEventListener('mousemove', (e) => { if (!playing() || paused) return; if (locked || (dragLook && dragging)) { yaw -= e.movementX * 0.0023; pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * 0.0023)); } });
canvas.addEventListener('mousedown', () => { dragging = true; sfx.resume(); if (playing() && !locked && !dragLook) tryLock(); else if (locked && isHunter() && !spec) fireQ = true; });
window.addEventListener('mouseup', () => { dragging = false; });
$('pause').addEventListener('click', () => { if (dragLook) { paused = false; $('pause').classList.remove('show'); } else tryLock(); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') { const on = debug.toggle(); if (on && locked) document.exitPointerLock(); e.preventDefault(); return; }
  if (e.target && e.target.tagName === 'INPUT') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return; keys[e.code] = true;
  if (e.code === 'KeyM') { sfx.muted = !sfx.muted; hud.toast(sfx.muted ? '已静音' : '声音已打开', 'info'); }
  if (e.code === 'Enter' && !playing()) startGame($('end').classList.contains('show') ? lastSetup : undefined);
  if (e.code === 'KeyF' && isHunter() && playing() && !paused) fireQ = true;
  if (isHunter() || spec) { if (e.code === 'Escape' && dragLook && playing()) { paused = !paused; $('pause').classList.toggle('show', paused); } return; }
  if (!playing() || paused) { if (e.code === 'Escape' && dragLook && playing()) { paused = false; $('pause').classList.remove('show'); } return; }
  if (e.code === 'KeyC' || e.code === 'ControlLeft') stanceQ = 'crouch';
  if (e.code === 'KeyZ' || e.code === 'KeyX') stanceQ = 'prone';
  if (e.code === 'Space' && me.stance !== 'walk') stanceQ = 'stand';
  if (e.code === 'Escape' && dragLook) { paused = true; $('pause').classList.add('show'); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// —— 开始界面：身份和人数 ——
const pick = { role: 'hider', hider: { hunters: C.hunterCount, hiders: 1 }, hunter: { hunters: 1, hiders: 1 } };
const LIMIT = { hunters: MAX_HUNTERS, hiders: MAX_HIDERS };
function drawSetup() {
  const n = pick[pick.role]; $('nHunters').textContent = n.hunters; $('nHiders').textContent = n.hiders;
  for (const b of document.querySelectorAll('#roleSeg button')) b.classList.toggle('on', b.dataset.role === pick.role);
  for (const b of document.querySelectorAll('.stp button')) { const v = n[b.dataset.k] + +b.dataset.d; b.disabled = v < 1 || v > LIMIT[b.dataset.k]; }
  $('setupNote').textContent = pick.role === 'hider'
    ? (n.hiders > 1 ? `你和 ${n.hiders - 1} 个 AI 队友` : '你自己') + `，躲开 ${n.hunters} 个 AI 猎人`
    : (n.hunters > 1 ? `你和 ${n.hunters - 1} 个 AI 猎人` : '你自己') + `，找出 ${n.hiders} 个 AI 躲藏方`;
}
for (const b of document.querySelectorAll('#roleSeg button')) b.addEventListener('click', () => { pick.role = b.dataset.role; drawSetup(); });
for (const b of document.querySelectorAll('.stp button')) b.addEventListener('click', () => { const n = pick[pick.role], k = b.dataset.k; n[k] = Math.max(1, Math.min(LIMIT[k], n[k] + +b.dataset.d)); drawSetup(); });
drawSetup();

let lastSetup = null;
function startGame(setup) {
  if (typeof setup === 'string') { pick.role = setup; drawSetup(); setup = null; } // 测试钩子：start('hider') / start('hunter')
  if (!setup) { const n = pick[pick.role]; setup = lineup(pick.role, n.hunters, n.hiders); }
  lastSetup = setup; sfx.init(); sfx.resume(); game.start(setup);
  me = game.firstHuman(); view.local = hud.local = me; spec = view.spec = null; specT = 0; document.body.classList.remove('spec');
  document.body.classList.toggle('hunter', isHunter()); hud.buildPills(); view.resetRound(); hud.clearSplat(); endShown = false; paused = false;
  yaw = isHunter() ? 0 : world.spawn.yaw; pitch = 0; $('menu').classList.remove('show'); $('end').classList.remove('show'); $('pause').classList.remove('show'); $('hud').classList.add('show');
  hopPhase.length = 0; botStep.length = 0; tryLock();
}
$('startBtn').addEventListener('click', () => startGame()); $('againBtn').addEventListener('click', () => startGame(lastSetup));
$('menuBtn').addEventListener('click', () => { $('end').classList.remove('show'); $('hud').classList.remove('show'); hud.clearSplat(); $('menu').classList.add('show'); });

// 被喷中后进入旁观：从自己的位置稍微抬高开始
function startSpectate() {
  spec = view.spec = { x: me.x, y: 2.6, z: me.z, yaw, pitch: Math.max(-0.6, pitch - 0.25), moving: false, running: false };
  document.body.classList.add('spec'); hud.clearSplat(); hud.toast('现在是旁观者，可以自由飞行。别告诉队友猎人在哪哦', 'info');
}
function moveSpectator(dt) {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), u = (keys.Space ? 1 : 0) - (keys.KeyC || keys.ControlLeft ? 1 : 0);
  const sp = keys.ShiftLeft || keys.ShiftRight ? 12 : 5, cp = Math.cos(pitch);
  spec.yaw = yaw; spec.pitch = pitch;
  spec.x += (-Math.sin(yaw) * cp * f + Math.cos(yaw) * s) * sp * dt; spec.z += (-Math.cos(yaw) * cp * f - Math.sin(yaw) * s) * sp * dt; spec.y += (Math.sin(pitch) * f + u) * sp * dt;
  spec.x = Math.max(-15, Math.min(55, spec.x)); spec.z = Math.max(-15, Math.min(45, spec.z)); spec.y = Math.max(0.3, Math.min(30, spec.y)); spec.moving = false;
}

// —— 事件 → 声音和画面反馈 ——
// 听者：本机角色或旁观相机
const ear = () => spec || me;
function panOf(x, z) { const p = ear(), dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; return Math.max(-1, Math.min(1, (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d)); }
const distOf = (x, z) => { const p = ear(); return Math.hypot(x - p.x, z - p.z); };
// 防挂机提示给真人猎人：说一个大致方向
function dirWords(x, z) { const p = ear(), dx = x - p.x, dz = z - p.z, a = Math.atan2(dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw), -(dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw))), k = Math.round(a / (Math.PI / 4)); return ['前方', '右前方', '右边', '右后方', '后方', '后方', '左后方', '左边', '左前方'][(k + 8) % 8] || '附近'; }
let lastTick = 99, wasFloor = false, stepPhase = 0; const botStep = [], hopPhase = [];
function handleEvents() {
  const mine = (e) => !isHunter() && e.hid === me.id; // 和本机躲藏方有关的事件
  for (const e of game.events) {
    switch (e.type) {
      case 'start': if (!isHunter()) hud.banner('快躲起来！', `猎人 ${C.hideTime} 秒后出发`, 3200); break;
      case 'seek': if (isHunter()) hud.banner('开始找！', game.hiders.length > 1 ? `一共 ${game.hiders.length} 个，停下不动时几乎是透明的` : '它停下不动时几乎是透明的', 2600); else if (!spec) hud.banner('猎人出发了！', '停下不动会慢慢变透明', 2600); sfx.go(); break;
      case 'spotted': if (mine(e)) { hud.flash('rgba(255,138,61,0.75)'); sfx.spotted(); hud.toast('被发现了！挡住视线再停下来', 'warn'); } break;
      case 'lost': if (mine(e)) { sfx.lost(); hud.toast('猎人跟丢了…别动', 'info'); } break;
      case 'score': if (mine(e)) { sfx.score(); hud.toast(`${e.label} +${e.v}`, 'good'); } break;
      case 'fire': { view.recoil(e.id); if (isHunter() && e.id === me.id) { sfx.fire(0, 0); if (e.ammo === 3) hud.toast('只剩 3 发颜料了', 'warn'); break; } sfx.fire(distOf(e.x, e.z), panOf(e.x, e.z)); if (e.ammo === 3 && !isHunter()) hud.toast('有个猎人只剩 3 发颜料了', 'info'); break; }
      case 'splat': view.addSplat(e); sfx.splat(distOf(e.x, e.z), panOf(e.x, e.z)); break;
      case 'dodged': if (mine(e)) hud.toast('好险！躲开了', 'good'); else if (isHunter()) hud.toast('差一点！', 'warn'); break;
      case 'caught':
        if (mine(e)) { hud.splatScreen(hexs(e.color)); sfx.lose(); }
        else if (isHunter()) { const left = game.alive().length; sfx.win(); hud.banner('喷中了！', game.hiders.length > 1 && left > 0 ? `还剩 ${left} 个` : '', 1800); }
        else hud.toast(game.alive().length ? `一个队友被喷中了，还剩 ${game.alive().length} 个` : '最后一个队友被喷中了', 'warn');
        break;
      case 'over': { if (e.why === 'allCaught') break; // 喷中最后一个时已经放过音效
        const win = isHunter() ? e.winner === 'hunters' : e.winner === 'hiders'; if (win) sfx.win(); else sfx.lose(); if (!isHunter() && win) hud.banner(e.why === 'paintout' ? '颜料用完了！' : '时间到！', me.caught ? '躲藏方赢了' : '你赢了', 2000); break; }
      case 'campHint':
        if (mine(e)) { sfx.hint(); hud.toast(e.level >= 2 ? '你待得太久，猎人快找到这里了！' : '你待太久了，猎人收到了提示', 'warn'); }
        else if (isHunter()) { sfx.hint(); view.campMark(e.x, e.z, e.r); hud.toast(`提示：有人在你${dirWords(e.x, e.z)} ${Math.round(distOf(e.x, e.z))} 米附近待了很久`, 'warn'); }
        break;
      case 'investigate': if (e.why === 'noise' && mine(e)) hud.toast('猎人听到了动静', 'warn'); break;
      case 'empty': if (!(isHunter() && e.id === me.id)) hud.toast(isHunter() ? '一个队友的颜料用完了' : '一个猎人的颜料用完了！', isHunter() ? 'info' : 'good'); else hud.toast('颜料用完了', 'warn'); break;
      case 'stance': if (mine(e)) sfx.stance(); break;
      case 'bump': if (mine(e)) { sfx.bump(); hud.toast('上面有东西，站不起来', 'info'); } break;
    }
  }
  game.events.length = 0;
  if (game.phase === 'hide') { const t = Math.ceil(game.hideLeft); if (t <= 5 && t !== lastTick && t > 0) { sfx.tick(); } lastTick = t; }
  const floor = !isHunter() && me.vis <= C.visFloor + 0.005; if (floor && !wasFloor && playing() && !me.caught) sfx.hidden(); wasFloor = floor;
  // 自己的脚步
  if (!spec && me.moving && playing()) { const ph = Math.floor(view.bob / Math.PI); if (ph !== stepPhase) { stepPhase = ph; if (isHunter()) sfx.step('walk', me.running); else sfx.step(me.stance, me.running); } }
  // 别的躲藏方的脚步（当猎人或旁观时）
  if (isHunter() || spec) game.hiders.forEach((q, i) => { if (q === me || !(q.moving && q.noise > 0 && game.phase === 'seek')) return; botStep[i] = (botStep[i] || 0) - 1 / 60; if (botStep[i] <= 0) { botStep[i] = q.running ? 0.24 : 0.4; const d = distOf(q.x, q.z); if (d < q.noise * 1.6) sfx.hunterStep(d * 16 / (q.noise * 1.6), panOf(q.x, q.z)); } });
  // 猎人的脚步
  game.hunters.forEach((h, i) => { if (isHunter() && h === me) return; const ph = Math.floor(h.hop / Math.PI); if (ph !== hopPhase[i]) { hopPhase[i] = ph; if (h.speed > 0 && game.phase === 'seek') sfx.hunterStep(distOf(h.x, h.z), panOf(h.x, h.z)); } });
}

// —— 主循环 ——
let last = performance.now(), fpsT = 0, fpsN = 0, overT = 0, slowN = 0;
function frame(now) {
  if (!TEST) requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (TEST && window.__dt) dt = window.__dt;
  const turn = (keys.KeyE || keys.ArrowRight ? 1 : 0) - (keys.KeyQ || keys.ArrowLeft ? 1 : 0); if (turn && playing() && !paused) yaw -= turn * 2.2 * dt;
  if (spec) { input.f = input.s = 0; input.run = false; } else { input.f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0); input.s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); input.run = !!(keys.ShiftLeft || keys.ShiftRight); }
  input.yaw = yaw; input.pitch = pitch; input.fire = fireQ; fireQ = false; input.stance = stanceQ; stanceQ = null;
  if (TEST && window.__input) Object.assign(input, window.__input);
  if (!paused) game.update(dt, { [me.key]: input });
  handleEvents();
  // 自己被喷中、但这一局还没结束：过一会儿进入旁观
  if (!isHunter() && me.caught && game.phase !== 'over' && !spec) { specT += dt; if (specT > 1.7) startSpectate(); }
  if (spec && !paused) moveSpectator(dt);
  if (game.phase === 'over') { overT += dt; if (!endShown && overT > (!isHunter() && me.caught && !spec ? 1.7 : 1.2)) { endShown = true; hud.showEnd(); if (locked) document.exitPointerLock(); } } else overT = 0;
  view.render(paused ? 0 : dt, game.phase !== 'menu');
  if (game.phase !== 'menu') { hud.update(); if (!isHunter() && !spec) radar.draw(me); }
  fpsN++; fpsT += dt; if (fpsT > 0.5) { const el = $('fps'), f = fpsN / fpsT; if (!TEST && now > 6000) { if (f < 26) { if (++slowN >= 4 && !view.low) { view.lowQuality(); hud.toast('帧率偏低，已自动降低画质', 'info'); } } else slowN = 0; } if (el) el.textContent = Math.round(f) + ' fps' + (view.low ? '（低画质）' : ''); $('fps2').textContent = Math.round(f) + ' fps' + (view.low ? '（低画质）' : ''); fpsN = 0; fpsT = 0; if ($('debug').classList.contains('show')) debug.info(game.hunters.map((h, i) => `猎人${i + 1}${h.ctrl === 'human' ? '（真人）' : ''}: ${h.state} 发现值 ${h.detect.toFixed(2)} 最近 ${h.dist.toFixed(1)}m 颜料 ${h.ammo}`).join('\n') + '\n' + game.hiders.map((q, i) => `躲藏方${i + 1}${q.ctrl === 'human' ? '（真人）' : ''}: ${q.caught ? '已被喷中' : `可见度 ${q.vis.toFixed(2)}  位置 ${q.x.toFixed(1)}, ${q.z.toFixed(1)}`}`).join('\n')); }
}
// 菜单背景：从后院看房子
me.x = 20; me.z = 27.5; yaw = 0.25; pitch = 0.12; me.yaw = yaw; me.pitch = pitch;
requestAnimationFrame(frame);
if (TEST) window.__t = { frame: (n = 1) => { for (let i = 0; i < n; i++) frame(performance.now()); }, game, view, C, lineup, start: startGame, me: () => me, step: (n, inp) => { for (let i = 0; i < n; i++) { game.update(1 / 60, { [me.key]: { ...input, ...(inp || {}) } }); handleEvents(); } }, setLook: (y, p) => { yaw = y; pitch = p; }, hud };
