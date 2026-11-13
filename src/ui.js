// 界面：小地图、可见度指示器、提示、调试面板
import { CONFIG as C, DEBUG_ITEMS } from './config.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export class Radar {
  constructor(canvas, game) {
    this.cv = canvas; this.game = game; this.S = 210; const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = this.S * dpr; canvas.style.width = canvas.style.height = this.S + 'px'; this.ctx = canvas.getContext('2d'); this.ctx.scale(dpr, dpr);
    this.items = game.world.boxes.filter((b) => b.map && b.y0 < 1.3);
  }
  draw(p) { // p：本机控制的躲藏方
    const g = this.game, x = this.ctx, S = this.S, R = C.radarRadius, sc = (S / 2 - 6) / R, blur = C.radarBlurWhenRunning && p.running && p.moving;
    x.clearRect(0, 0, S, S); x.save(); x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 4, 0, 7); x.clip();
    x.fillStyle = '#9fe08e'; x.fillRect(0, 0, S, S);
    x.translate(S / 2, S / 2); x.rotate(p.yaw); x.scale(sc, sc); x.translate(-p.x, -p.z);
    x.fillStyle = '#fff6e2'; x.fillRect(6, 3, 28, 15); x.fillStyle = '#8ad67a'; x.fillRect(-20, -20, 80, 20); x.fillRect(-20, 30, 80, 20); x.fillRect(-20, 0, 20, 30); x.fillRect(40, 0, 20, 30);
    const col = { wall: '#3a3550', window: '#7cc4f5', vault: '#ffc94a', furn: '#e2ae72', hedge: '#3f9e4d', tree: '#3f9e4d', fence: '#ffffff', cloth: '#ff9db5' };
    for (const b of this.items) {
      if (b.x1 < p.x - R - 2 || b.x0 > p.x + R + 2 || b.z1 < p.z - R - 2 || b.z0 > p.z + R + 2) continue;
      x.fillStyle = col[b.map] || '#e2ae72';
      if (b.map === 'tree') { x.beginPath(); x.arc((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 1.1, 0, 7); x.globalAlpha = 0.7; x.fill(); x.globalAlpha = 1; }
      else x.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    }
    // 猎人和视野锥
    const edge = [];
    for (const h of g.hunters) {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (C.radarRangeLimit && d > R) { edge.push(h); continue; }
      if (!blur && h.state !== 'wait' && h.state !== 'empty') {
        const n = 22, fov = C.fovDeg * Math.PI / 180; x.beginPath(); x.moveTo(h.x, h.z);
        for (let k = 0; k <= n; k++) { const a = h.ang - fov / 2 + fov * k / n, r = g.rayDist(h.x, C.hunterEye, h.z, a, C.viewDist); x.lineTo(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r); }
        x.closePath(); x.fillStyle = h.state === 'chase' ? 'rgba(255,70,70,0.42)' : hex(h.color) + '55'; x.fill(); x.lineWidth = 0.12; x.strokeStyle = h.state === 'chase' ? '#ff4646' : hex(h.color); x.stroke();
      }
      x.beginPath(); x.arc(h.x, h.z, Math.max(0.8, 4.5 / sc), 0, 7); x.fillStyle = hex(h.color); x.fill(); x.lineWidth = 1.6 / sc; x.strokeStyle = '#3a3550'; x.stroke();
      const det = h.det[p.id] || 0; if (det > 0.02 && h.state !== 'chase') { x.beginPath(); x.arc(h.x, h.z, 8 / sc, -Math.PI / 2, -Math.PI / 2 + det * 6.283); x.lineWidth = 3 / sc; x.strokeStyle = '#ff4646'; x.stroke(); }
    }
    // 队友（调试面板里可以打开）
    if (C.radarShowTeammates) for (const q of g.hiders) { if (q === p) continue; x.beginPath(); x.arc(q.x, q.z, Math.max(0.6, 3.5 / sc), 0, 7); x.fillStyle = q.caught ? '#c9c4d6' : '#a8f0e0'; x.fill(); x.lineWidth = 1.4 / sc; x.strokeStyle = '#3a3550'; x.stroke(); }
    // 自己的噪音圈
    if (p.noise > 0 && p.moving) { x.beginPath(); x.arc(p.x, p.z, p.noise, 0, 7); x.lineWidth = 1.5 / sc; x.setLineDash([0.6, 0.6]); x.strokeStyle = 'rgba(58,53,80,0.45)'; x.stroke(); x.setLineDash([]); }
    x.restore();
    // 标记（屏幕坐标）
    const w2s = (wx, wz) => { const dx = wx - p.x, dz = wz - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw); return [S / 2 + (dx * c - dz * s) * sc, S / 2 + (dx * s + dz * c) * sc]; };
    x.font = '900 15px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const h of g.hunters) {
      const [sx, sy] = w2s(h.x, h.z);
      if (edge.includes(h)) { const a = Math.atan2(sy - S / 2, sx - S / 2), ex = S / 2 + Math.cos(a) * (S / 2 - 15), ey = S / 2 + Math.sin(a) * (S / 2 - 15); x.save(); x.translate(ex, ey); x.rotate(a); x.beginPath(); x.moveTo(8, 0); x.lineTo(-5, -7); x.lineTo(-5, 7); x.closePath(); x.fillStyle = hex(h.color); x.fill(); x.lineWidth = 2; x.strokeStyle = '#3a3550'; x.stroke(); x.restore(); continue; }
      if (h.state === 'chase') { x.fillStyle = '#ff4646'; x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeText('!', sx, sy - 15); x.fillText('!', sx, sy - 15); }
      else if (h.state === 'wait') { x.fillStyle = '#3a3550'; x.fillText('z', sx + 8, sy - 10); }
    }
    // 自己
    x.beginPath(); x.moveTo(S / 2, S / 2 - 9); x.lineTo(S / 2 + 7, S / 2 + 7); x.lineTo(S / 2, S / 2 + 3); x.lineTo(S / 2 - 7, S / 2 + 7); x.closePath(); x.fillStyle = '#a8f0e0'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#3a3550'; x.lineJoin = 'round'; x.stroke();
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 4, 0, 7); x.lineWidth = 6; x.strokeStyle = '#fff'; x.stroke(); x.lineWidth = 2; x.strokeStyle = '#3a3550'; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 1.5, 0, 7); x.stroke();
    this.cv.style.filter = blur ? 'blur(1.6px) saturate(0.7)' : '';
  }
}

export class Hud {
  constructor(game) {
    this.game = game; this.local = null; this.eye = $('eye').getContext('2d'); this.toastT = {}; this.last = {};
    const dpr = Math.min(window.devicePixelRatio || 1, 2); $('eye').width = 96 * dpr; $('eye').height = 60 * dpr; this.eye.scale(dpr, dpr);
  }
  set(id, text) { if (this.last[id] !== text) { this.last[id] = text; $(id).textContent = text; } }
  cls(id, name, on) { const k = id + '.' + name; if (this.last[k] !== on) { this.last[k] = on; $(id).classList.toggle(name, on); } }
  // 顶部每个猎人的颜料指示，开局时按人数重建
  buildPills() {
    const box = $('pills'); box.innerHTML = ''; this.last = {};
    this.game.hunters.forEach((h, i) => { const p = document.createElement('div'); p.className = 'pill'; p.id = 'pill' + i; const c = document.createElement('i'); c.style.background = hex(h.color); const b = document.createElement('b'); b.id = 'ammo' + i; b.textContent = h.ammo; p.append(c, b); box.appendChild(p); });
    const me = this.local; if (me && me.kind === 'hunter') $('myPill').querySelector('i').style.background = hex(me.color);
  }
  update() {
    const g = this.game, p = this.local, hm = p.kind === 'hunter', hide = g.phase === 'hide';
    const t = Math.max(0, hide ? g.hideLeft : g.timeLeft); this.set('timer', hide ? `${hm ? '闭眼' : '躲藏'} ${Math.ceil(t)}` : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    this.cls('timer', 'hide', hide); if (!hm) this.set('score', String(Math.floor(p.score)));
    g.hunters.forEach((h, i) => { this.set('ammo' + i, String(h.ammo)); this.cls('pill' + i, 'empty', h.ammo <= 0); this.cls('pill' + i, 'alert', h.state === 'chase'); });
    if (hm) { this.set('myAmmo', String(p.ammo)); this.set('blindNum', String(Math.max(1, Math.ceil(g.hideLeft)))); this.cls('blind', 'show', hide); this.set('left', `还剩 ${g.alive().length} / ${g.hiders.length}`); return; }
    this.set('left', g.hiders.length > 1 ? `躲藏方 ${g.alive().length} / ${g.hiders.length}` : '');
    const st = p.stance === 'walk' ? (p.running && p.moving ? '跑' : '站') : p.stance === 'crouch' ? '蹲' : '趴'; this.set('stance', st);
    this.set('stanceTip', p.stance === 'walk' ? (p.running && p.moving ? '跑步 · 很吵' : '悄悄走') : p.stance === 'crouch' ? '蹲行' : '匍匐 · 无声');
    // 可见度“眼睛”
    const v = p.vis, x = this.eye, open = Math.max(0.04, Math.sqrt(Math.max(0, (v - C.visFloor) / (1 - C.visFloor)))); x.clearRect(0, 0, 96, 60);
    const danger = g.hunters.some((h) => h.state === 'chase' && h.target === p.id), seen = g.hunters.some((h) => h.det[p.id] > 0.05 && !(h.state === 'chase' && h.target === p.id));
    x.lineWidth = 5; x.lineJoin = 'round'; x.strokeStyle = '#3a3550'; x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(8, 30); x.quadraticCurveTo(48, 30 - 34 * open, 88, 30); x.quadraticCurveTo(48, 30 + 34 * open, 8, 30); x.closePath(); x.fill(); x.stroke();
    if (open > 0.12) { x.save(); x.clip(); x.beginPath(); x.arc(48, 30, 13, 0, 7); x.fillStyle = danger ? '#ff4646' : seen ? '#ff8a3d' : '#3a3550'; x.fill(); x.beginPath(); x.arc(52, 26, 4, 0, 7); x.fillStyle = '#fff'; x.fill(); x.restore(); }
    const bar = $('visFill'); const w = Math.round(v * 100); if (this.last.vw !== w) { this.last.vw = w; bar.style.width = w + '%'; bar.style.background = v <= C.visFloor + 0.01 ? '#5fc9c0' : v < 0.5 ? '#ffc94a' : '#ff7a6b'; }
    this.set('visLabel', v <= C.visFloor + 0.01 ? '几乎看不见' : v < 0.4 ? '半透明' : v < 0.8 ? '比较显眼' : '完全显形');
    const nr = $('noise'); const ns = p.moving ? Math.min(1, p.noise / 12) : 0; if (this.last.ns !== ns) { this.last.ns = ns; nr.style.transform = `scale(${0.25 + ns * 0.75})`; nr.style.opacity = ns > 0 ? 1 : 0.35; }
    this.cls('hud', 'danger', danger);
  }
  toast(text, kind = '') { const now = performance.now(); if (this.toastT[text] && now - this.toastT[text] < 2500) return; this.toastT[text] = now; const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text; $('toasts').appendChild(el); setTimeout(() => el.classList.add('out'), 2200); setTimeout(() => el.remove(), 2700); while ($('toasts').children.length > 4) $('toasts').firstChild.remove(); }
  banner(text, sub = '', ms = 2600) { const b = $('banner'); b.innerHTML = ''; const a = document.createElement('div'); a.className = 'big'; a.textContent = text; b.appendChild(a); if (sub) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub; b.appendChild(s); } b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(this.bt); this.bt = setTimeout(() => b.classList.remove('show'), ms); }
  flash(color) { const f = $('flash'); f.style.boxShadow = `inset 0 0 140px 50px ${color}`; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  splatScreen(color) { const s = $('splat'); s.innerHTML = ''; for (let i = 0; i < 9; i++) { const d = document.createElement("i"); const sz = 10 + Math.random() * 30; d.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${sz}vmin;height:${sz}vmin;background:${color};animation-delay:${Math.random() * 0.25}s;border-radius:${40 + Math.random() * 20}% ${40 + Math.random() * 20}% ${40 + Math.random() * 20}% ${40 + Math.random() * 20}%`; s.appendChild(d); } s.classList.add('on'); }
  clearSplat() { $('splat').classList.remove('on'); $('splat').innerHTML = ''; }
  showEnd() {
    const g = this.game, p = this.local, hm = p.kind === 'hunter', win = hm ? g.result === 'hunters' : g.result === 'hiders', solo = g.hiders.length === 1;
    const caught = g.hiders.filter((q) => q.caught).length, used = Math.floor(C.roundTime - Math.max(0, g.timeLeft));
    $('endTitle').textContent = hm ? (win ? (solo ? '喷中了！' : '全部找到了！') : g.why === 'paintout' ? '颜料用完了…' : solo ? '时间到，没找到…' : '时间到！')
      : g.why === 'allCaught' ? (solo ? '被喷中啦！' : '全被喷中啦！') : g.why === 'paintout' ? '猎人的颜料用完了！' : p.caught ? '队友撑到了最后！' : '成功躲到最后！';
    $('endSub').textContent = hm ? (win ? (solo ? '你找到了躲起来的小家伙' : `${caught} 个小家伙全被喷中`) : solo ? '它躲过了你，再来一局？' : `喷中了 ${caught} / ${g.hiders.length} 个，再来一局？`)
      : win ? (p.caught ? '你被喷中了，但躲藏方赢了' : '你赢了这一局') : '被找到了，再来一局？';
    $('end').classList.toggle('win', win);
    $('endScore').textContent = hm ? `${used} 秒` : Math.floor(p.score); $('endUnit').textContent = hm ? '用时' : '分';
    const rows = [];
    if (hm) {
      rows.push(['用掉的颜料', `${p.fired} 发`]);
      if (solo) rows.push(['它换了多远的地方', `${Math.round(g.hiders[0].stats.moved)} 米`]); else rows.push(['喷中', `${caught} / ${g.hiders.length} 个`]);
    } else {
      const s = p.stats;
      rows.push(['坚持时间', `${p.caught ? Math.floor(s.survived) : used} 秒`], ['移动距离', `${Math.round(s.moved)} 米`], ['擦肩而过', `${s.brushes} 次`], ['甩掉猎人', `${s.escapes} 次`], ['躲开的颜料弹', `${s.shotsDodged} 发`], ['在猎人眼皮底下', `${s.coneTime.toFixed(1)} 秒`]);
      if (!solo) rows.splice(1, 0, ['躲藏方剩下', `${g.hiders.length - caught} / ${g.hiders.length}`]);
      if (s.closest < 50) rows.push(['最惊险时刻', `猎人离你只有 ${s.closest.toFixed(1)} 米，当时可见度 ${Math.round(s.closestVis * 100)}%`]);
    }
    const tb = $('endStats'); tb.innerHTML = ''; for (const [k, v] of rows) { const r = document.createElement('div'); r.className = 'row'; const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v; r.append(a, b); tb.appendChild(r); }
    $('end').classList.add('show');
  }
}

export class DebugPanel {
  constructor(onChange) {
    const root = $('debug'); const get = (path) => path.split('.').reduce((o, k) => o[k], C); const set = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], C)[last] = v; onChange && onChange(path, v); };
    const head = document.createElement('div'); head.className = 'dh'; head.innerHTML = '<b>调试面板</b><span id="fps"></span>'; root.appendChild(head);
    const info = document.createElement('div'); info.id = 'dbgInfo'; info.className = 'di'; root.appendChild(info);
    for (const [path, label, min, max, step] of DEBUG_ITEMS) {
      const row = document.createElement('label'); row.className = 'dr'; const name = document.createElement('span'); name.textContent = label; row.appendChild(name);
      if (min === null) { const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!get(path); cb.oninput = () => set(path, cb.checked); row.appendChild(cb); }
      else { const val = document.createElement('em'); val.textContent = get(path); const sl = document.createElement('input'); sl.type = 'range'; sl.min = min; sl.max = max; sl.step = step; sl.value = get(path); sl.oninput = () => { set(path, parseFloat(sl.value)); val.textContent = sl.value; }; row.append(sl, val); }
      root.appendChild(row);
    }
    const note = document.createElement('div'); note.className = 'di'; note.textContent = '修改立即生效。姿态的其他数值在 config.js 里。'; root.appendChild(note);
  }
  toggle() { $('debug').classList.toggle('show'); return $('debug').classList.contains('show'); }
  info(text) { $('dbgInfo').textContent = text; }
}
