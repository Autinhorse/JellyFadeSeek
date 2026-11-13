import { CONFIG as C } from './config.js';
import { buildWorld } from './world.js';
import { Game } from './sim.js';
import { View } from './render.js';
import { Radar, Hud, DebugPanel } from './ui.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const hexs = (c) => '#' + c.toString(16).padStart(6, '0');
const world = buildWorld(), game = new Game(world), canvas = $('gl');
const view = new View(canvas, world, game), radar = new Radar($('radar'), game), hud = new Hud(game), sfx = new Sfx();
const debug = new DebugPanel();
const TEST = location.hash === '#test';

const keys = {}; let yaw = world.spawn.yaw, pitch = 0, locked = false, dragLook = false, dragging = false, paused = false, endShown = false, lockTried = false;
const input = { f: 0, s: 0, run: false, yaw, pitch, fire: false }; let fireQ = false, mode = 'hider';

function resize() { view.resize(window.innerWidth, window.innerHeight); const m = view.mirrorRect(), f = $('mirror'); f.style.left = m.x - 6 + 'px'; f.style.bottom = m.y - 6 + 'px'; f.style.width = f.style.height = m.s + 'px'; }
window.addEventListener('resize', resize); resize();

// —— 输入 ——
const playing = () => game.phase === 'hide' || game.phase === 'seek';
function tryLock() {
  if (TEST || dragLook) return; lockTried = true;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => useDrag()); } catch (e) { useDrag(); }
  setTimeout(() => { if (!locked && playing() && !dragLook) useDrag(); }, 900);
}
function useDrag() { if (dragLook) return; dragLook = true; paused = false; $('pause').classList.remove('show'); hud.toast('按住鼠标左键拖动来转视角（也可以用 Q / E 键）', 'info'); }
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && playing() && !dragLook && !TEST) { paused = true; $('pause').classList.add('show'); } if (locked) { paused = false; $('pause').classList.remove('show'); } });
document.addEventListener('pointerlockerror', useDrag);
document.addEventListener('mousemove', (e) => { if (!playing() || paused) return; if (locked || (dragLook && dragging)) { yaw -= e.movementX * 0.0023; pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * 0.0023)); } });
canvas.addEventListener('mousedown', () => { dragging = true; sfx.resume(); if (playing() && !locked && !dragLook) tryLock(); else if (locked && mode === 'hunter') fireQ = true; });
window.addEventListener('mouseup', () => { dragging = false; });
$('pause').addEventListener('click', () => { if (dragLook) { paused = false; $('pause').classList.remove('show'); } else tryLock(); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') { const on = debug.toggle(); if (on && locked) document.exitPointerLock(); e.preventDefault(); return; }
  if (e.target && e.target.tagName === 'INPUT') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return; keys[e.code] = true;
  if (e.code === 'KeyM') { sfx.muted = !sfx.muted; hud.toast(sfx.muted ? '已静音' : '声音已打开', 'info'); }
  if (e.code === 'Enter' && !playing()) startGame();
  if (e.code === 'KeyF' && mode === 'hunter' && playing() && !paused) fireQ = true;
  if (mode === 'hunter') { if (e.code === 'Escape' && dragLook && playing()) { paused = !paused; $('pause').classList.toggle('show', paused); } return; }
  if (!playing() || paused) { if (e.code === 'Escape' && dragLook && playing()) { paused = false; $('pause').classList.remove('show'); } return; }
  if (e.code === 'KeyC' || e.code === 'ControlLeft') game.setStance('crouch');
  if (e.code === 'KeyZ' || e.code === 'KeyX') game.setStance('prone');
  if (e.code === 'Space' && game.player.stance !== 'walk') game.setStance(game.player.stance);
  if (e.code === 'Escape' && dragLook) { paused = true; $('pause').classList.add('show'); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function startGame(m) {
  if (typeof m === 'string') mode = m; document.body.classList.toggle('hunter', mode === 'hunter');
  sfx.init(); sfx.resume(); game.start(mode); view.resetRound(); hud.clearSplat(); endShown = false; paused = false;
  yaw = mode === 'hunter' ? 0 : world.spawn.yaw; pitch = 0; $('menu').classList.remove('show'); $('end').classList.remove('show'); $('pause').classList.remove('show'); $('hud').classList.add('show');
  tryLock();
}
$('startBtn').addEventListener('click', () => startGame('hider')); $('hunterBtn').addEventListener('click', () => startGame('hunter')); $('againBtn').addEventListener('click', () => startGame());
$('menuBtn').addEventListener('click', () => { $('end').classList.remove('show'); $('hud').classList.remove('show'); hud.clearSplat(); $('menu').classList.add('show'); });

// 顶部的颜料指示
game.hunters.forEach((h, i) => { const p = document.createElement('div'); p.className = 'pill'; p.id = 'pill' + i; p.innerHTML = `<i style="background:${hexs(h.color)}"></i><b id="ammo${i}">${h.ammo}</b>`; $('pills').appendChild(p); });

// —— 事件 → 声音和画面反馈 ——
function panOf(x, z) { const p = game.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; return Math.max(-1, Math.min(1, (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d)); }
let lastTick = 99, wasFloor = false, stepPhase = 0, botStep = 0;
function panOfCam(x, z) { const m = game.me, dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz) || 1; return Math.max(-1, Math.min(1, (dx * Math.cos(m.yaw) - dz * Math.sin(m.yaw)) / d)); } const hopPhase = game.hunters.map(() => 0);
function handleEvents() {
  const p = game.player;
  for (const e of game.events) {
    switch (e.type) {
      case 'start': if (mode !== 'hunter') hud.banner('快躲起来！', `猎人 ${C.hideTime} 秒后出发`, 3200); break;
      case 'seek': if (mode === 'hunter') hud.banner('开始找！', '它停下不动时几乎是透明的', 2600); else hud.banner('猎人出发了！', '停下不动会慢慢变透明', 2600); sfx.go(); break;
      case 'spotted': hud.flash('rgba(255,138,61,0.75)'); sfx.spotted(); hud.toast('被发现了！挡住视线再停下来', 'warn'); break;
      case 'lost': sfx.lost(); hud.toast('猎人跟丢了…别动', 'info'); break;
      case 'score': sfx.score(); hud.toast(`${e.label} +${e.v}`, 'good'); break;
      case 'fire': { view.recoil(e.id); if (e.id < 0) { sfx.fire(0, 0); if (e.ammo === 3) hud.toast('只剩 3 发颜料了', 'warn'); break; } const h = game.hunters[e.id]; sfx.fire(Math.hypot(e.x - p.x, e.z - p.z), panOf(e.x, e.z)); if (h.ammo === 3) hud.toast('有个猎人只剩 3 发颜料了', 'info'); break; }
      case 'splat': view.addSplat(e); sfx.splat(Math.hypot(e.x - p.x, e.z - p.z), panOf(e.x, e.z)); break;
      case 'dodged': if (mode === 'hunter') hud.toast('差一点！', 'warn'); else hud.toast('好险！躲开了', 'good'); break;
      case 'caught': view.paintPlayer(e.color); if (mode === 'hunter') { sfx.win(); hud.banner('喷中了！', '', 1800); } else { hud.splatScreen(hexs(e.color)); sfx.lose(); } break;
      case 'hunterLose': sfx.lose(); break;
      case 'win': sfx.win(); hud.banner(e.why === 'paintout' ? '颜料用完了！' : '时间到！', '你赢了', 2000); break;
      case 'campHint': sfx.hint(); hud.toast(e.level >= 2 ? '你待得太久，猎人快找到这里了！' : '你待太久了，猎人收到了提示', 'warn'); break;
      case 'investigate': if (e.why === 'noise') hud.toast('猎人听到了动静', 'warn'); break;
      case 'empty': hud.toast('一个猎人的颜料用完了！', 'good'); break;
      case 'stance': sfx.stance(); break;
      case 'bump': sfx.bump(); hud.toast('上面有东西，站不起来', 'info'); break;
    }
  }
  game.events.length = 0;
  if (game.phase === 'hide') { const t = Math.ceil(game.hideLeft); if (t <= 5 && t !== lastTick && t > 0) { sfx.tick(); } lastTick = t; }
  const floor = p.vis <= C.visFloor + 0.005; if (floor && !wasFloor && playing() && mode !== 'hunter') sfx.hidden(); wasFloor = floor;
  if (mode === 'hunter' && game.me) { const m = game.me, d = Math.hypot(p.x - m.x, p.z - m.z); if (m.moving) { const ph = Math.floor(view.bob / Math.PI); if (ph !== stepPhase) { stepPhase = ph; sfx.step('walk', m.running); } } if (p.moving && p.noise > 0 && game.phase === 'seek') { botStep -= 1 / 60; if (botStep <= 0) { botStep = p.running ? 0.24 : 0.4; if (d < p.noise * 1.6) sfx.hunterStep(d * 16 / (p.noise * 1.6), panOfCam(p.x, p.z)); } } }
  else if (p.moving && playing()) { const ph = Math.floor(view.bob / Math.PI); if (ph !== stepPhase) { stepPhase = ph; sfx.step(p.stance, p.running); } }
  game.hunters.forEach((h, i) => { const ph = Math.floor(h.hop / Math.PI); if (ph !== hopPhase[i]) { hopPhase[i] = ph; if (h.speed > 0 && game.phase === 'seek') sfx.hunterStep(h.dist, panOf(h.x, h.z)); } });
}

// —— 主循环 ——
let last = performance.now(), fpsT = 0, fpsN = 0, overT = 0, slowN = 0;
function frame(now) {
  if (!TEST) requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (TEST && window.__dt) dt = window.__dt;
  const turn = (keys.KeyE || keys.ArrowRight ? 1 : 0) - (keys.KeyQ || keys.ArrowLeft ? 1 : 0); if (turn && playing() && !paused) yaw -= turn * 2.2 * dt;
  input.f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0); input.s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  input.run = !!(keys.ShiftLeft || keys.ShiftRight); input.yaw = yaw; input.pitch = pitch;
  input.fire = fireQ; fireQ = false;
  if (TEST && window.__input) Object.assign(input, window.__input);
  if (!paused) game.update(dt, input);
  handleEvents();
  if (game.phase === 'over') { overT += dt; if (!endShown && overT > (game.result === 'caught' ? 1.7 : 1.2)) { endShown = true; hud.showEnd(); if (locked) document.exitPointerLock(); } } else overT = 0;
  view.render(paused ? 0 : dt, game.phase !== 'menu');
  if (game.phase !== 'menu') { hud.update(); radar.draw(); }
  fpsN++; fpsT += dt; if (fpsT > 0.5) { const el = $('fps'), f = fpsN / fpsT; if (!TEST && now > 6000) { if (f < 26) { if (++slowN >= 4 && !view.low) { view.lowQuality(); hud.toast('帧率偏低，已自动降低画质', 'info'); } } else slowN = 0; } if (el) el.textContent = Math.round(f) + ' fps' + (view.low ? '（低画质）' : ''); $('fps2').textContent = Math.round(f) + ' fps' + (view.low ? '（低画质）' : ''); fpsN = 0; fpsT = 0; if ($('debug').classList.contains('show')) debug.info(game.hunters.map((h, i) => `猎人${i + 1}: ${h.state} 发现值 ${h.detect.toFixed(2)} 距离 ${h.dist.toFixed(1)}m`).join('\n') + `\n可见度 ${game.player.vis.toFixed(2)}  位置 ${game.player.x.toFixed(1)}, ${game.player.z.toFixed(1)}`); }
}
// 菜单背景：从后院看房子
game.player.x = 20; game.player.z = 27.5; yaw = 0.25; pitch = 0.12; game.player.yaw = yaw; game.player.pitch = pitch;
requestAnimationFrame(frame);
if (TEST) window.__t = { frame: (n = 1) => { for (let i = 0; i < n; i++) frame(performance.now()); }, game, view, C, start: startGame, step: (n, inp) => { for (let i = 0; i < n; i++) { game.update(1 / 60, { ...input, ...(inp || {}) }); handleEvents(); } }, setLook: (y, p) => { yaw = y; pitch = p; }, hud };
