// 地图数据：“周末的家”。纯数据，不依赖渲染。
// 坐标：x 向东 0..40，z 向南 0..30，y 向上。房子在北侧，后院在南侧。
export const PAL = {
  grass: 0x7bd16b, grassDark: 0x4faf5a, hedge: 0x4faf5a, hedgeLight: 0x6cc46a,
  wood: 0xe8b77a, woodDark: 0xc98f52, cream: 0xfff4e0, pink: 0xffd9d0, blue: 0xd7ecff,
  mint: 0xd9f5e5, lilac: 0xe9defa, coral: 0xff7a6b, yellow: 0xffc94a, sky: 0x6ba8ff,
  white: 0xffffff, dark: 0x3a3550, stone: 0xd9d2c5, teal: 0x5fc9c0, purple: 0xb48cff,
  red: 0xff6b6b, orange: 0xff8a3d, leaf: 0x58b85f, soil: 0xa9744f, metal: 0xbfc8d6,
};

export function buildWorld() {
  const W = {
    size: { x: 40, z: 30 }, wallH: 2.8,
    boxes: [],   // 碰撞/遮挡体
    parts: [],   // 渲染用零件
    rooms: [], patrol: [], steps: [],
    spawn: { x: 21, z: 11, yaw: Math.PI },
    hunterSpawns: [{ x: 19.2, z: 28.6 }, { x: 20.8, z: 28.6 }],
  };
  const P = PAL;

  // —— 基础构件 ——
  // 一个可渲染零件
  // props: 高级渲染用的“整件家具”描述；helper 里产生的零件标记 fromProp，新渲染器会用整件模型替代它们
  W.props = []; let propDepth = 0;
  let propKind = 'floor';
  const prop = (kind, args, fn) => { W.props.push({ kind, ...args }); const prev = propKind; propKind = kind; propDepth++; fn(); propDepth--; propKind = prev; };
  const part = (shape, x, y, z, sx, sy, sz, color, o = {}) => {
    W.parts.push({ shape, x, y, z, sx, sy, sz, color, ...(propDepth > 0 ? { fromProp: propKind } : {}), ...o });
  };
  // 碰撞体。opts: solid 阻挡躲藏方, occlude 挡视线, hunterBlock 阻挡猎人, map 小地图类别
  const col = (x0, z0, x1, z1, y0, y1, o = {}) => {
    W.boxes.push({ x0, z0, x1, z1, y0, y1, solid: true, occlude: true, hunterBlock: true, map: 'furn', ...o });
  };
  // 方块：渲染 + 碰撞
  const block = (x0, z0, x1, z1, y0, y1, color, o = {}) => {
    part('box', (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, o.r || {});
    if (!o.noCol) col(x0, z0, x1, z1, y0, y1, o.c || {});
  };
  const deco = (x0, z0, x1, z1, y0, y1, color, r = {}) =>
    part('box', (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, r);
  const cyl = (x, z, y0, y1, rad, color, r = {}) => part('cyl', x, (y0 + y1) / 2, z, rad * 2, y1 - y0, rad * 2, color, r);
  const ball = (x, y, z, rad, color, r = {}) => part('sphere', x, y, z, rad * 2, rad * 2, rad * 2, color, r);
  const flat = (x0, z0, x1, z1, y, color, r = {}) =>
    part('box', (x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, color, { hard: true, noOutline: true, noShadow: true, ...r });

  const T = 0.2, H = W.wallH;
  // 墙：沿 x 方向（位于 z）或沿 z 方向（位于 x），gaps: [{a,b,type}] type: door | window | vault | open
  const wall = (axis, at, from, to, gaps, colors) => { prop('wall', { axis, at, from, to, gaps, colors }, () => {
    gaps = (gaps || []).slice().sort((p, q) => p.a - q.a);
    const seg = (a, b, y0, y1, o = {}) => {
      if (b - a < 0.01) return;
      const r = { hard: true, noOutline: true, noShadow: true, faces: colors };
      if (axis === 'x') block(a, at - T / 2, b, at + T / 2, y0, y1, P.cream, { r, c: { map: y0 < 1.4 && y1 > 1.5 ? 'wall' : null, ...o } });
      else block(at - T / 2, a, at + T / 2, b, y0, y1, P.cream, { r, c: { map: y0 < 1.4 && y1 > 1.5 ? 'wall' : null, ...o } });
    };
    let cur = from;
    for (const g of gaps) {
      seg(cur, g.a, 0, H);
      if (g.type === 'door') seg(g.a, g.b, 2.1, H);
      else if (g.type === 'open') seg(g.a, g.b, 2.3, H);
      else if (g.type === 'window') { seg(g.a, g.b, 0, 0.9, { map: 'window' }); seg(g.a, g.b, 2.1, H); }
      else if (g.type === 'vault') {
        // 可翻越的矮窗：窗台不挡躲藏方，但猎人过不去
        seg(g.a, g.b, 0, 0.35, { solid: false, map: 'vault' }); seg(g.a, g.b, 2.0, H);
        if (axis === 'x') W.steps.push({ x0: g.a, x1: g.b, z0: at - 0.35, z1: at + 0.35, h: 0.35 });
        else W.steps.push({ x0: at - 0.35, x1: at + 0.35, z0: g.a, z1: g.b, h: 0.35 });
      }
      // 门框 / 窗框装饰
      const fc = g.type === 'door' || g.type === 'open' ? P.woodDark : P.white;
      const top = g.type === 'door' ? 2.1 : g.type === 'open' ? 2.3 : g.type === 'vault' ? 2.0 : 2.1;
      const bot = g.type === 'window' ? 0.9 : g.type === 'vault' ? 0.35 : 0;
      const fr = (a, b, y0, y1) => axis === 'x' ? deco(a, at - 0.14, b, at + 0.14, y0, y1, fc, { noShadow: true }) : deco(at - 0.14, a, at + 0.14, b, y0, y1, fc, { noShadow: true });
      fr(g.a - 0.06, g.a + 0.04, bot, top + 0.06); fr(g.b - 0.04, g.b + 0.06, bot, top + 0.06); fr(g.a - 0.06, g.b + 0.06, top - 0.02, top + 0.08);
      if (bot > 0) fr(g.a - 0.1, g.b + 0.1, bot - 0.04, bot + 0.04);
      cur = g.b;
    }
    seg(cur, to, 0, H);
  }); };

  // —— 地面 ——
  part('box', 20, -0.25, 15, 90, 0.5, 80, P.grass, { hard: true, noOutline: true, mat: 'grass' });
  // 草地深浅斑块和小花
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 44 - 2, z = rnd() * 34 - 2;
    if (x > 5.5 && x < 34.5 && z > 2.5 && z < 18.5) continue;
    part('cyl', x, 0.006, z, 1 + rnd() * 2.2, 0.012, 1 + rnd() * 2.2, rnd() > 0.5 ? 0x86d977 : 0x70c862, { noOutline: true, noShadow: true, seg: 14, tag: 'patch' });
  }
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 40, z = rnd() * 30;
    if (x > 5.5 && x < 34.5 && z > 2.5 && z < 18.5) continue;
    const c = [P.white, P.yellow, P.coral, P.pink, P.purple][i % 5];
    ball(x, 0.07, z, 0.06, c, { noOutline: true, noShadow: true, seg: 6 });
    ball(x + 0.12, 0.06, z + 0.05, 0.045, c, { noOutline: true, noShadow: true, seg: 6 });
  }

  // —— 房子：地板 ——
  const room = (name, x0, z0, x1, z1) => W.rooms.push({ name, x0, z0, x1, z1 });
  room('卧室', 6, 3, 13, 10); room('儿童房', 13, 3, 20, 10); room('玄关', 20, 3, 22, 10); room('厨房', 22, 3, 34, 10);
  room('走廊', 6, 10, 34, 12); room('客厅', 6, 12, 20, 18); room('后门厅', 20, 12, 22, 18); room('储物间', 22, 12, 34, 18);
  propDepth++;
  flat(6, 3, 34, 18, 0.01, P.wood);
  for (let x = 6; x < 34; x += 0.7) flat(x, 3, x + 0.03, 18, 0.014, P.woodDark);       // 木地板缝
  flat(6.1, 3.1, 12.9, 9.9, 0.016, 0xf6e3c6);                                           // 卧室浅色地毯
  flat(13.1, 3.1, 19.9, 9.9, 0.016, 0xc9ecd9);                                          // 儿童房薄荷色
  for (let i = 0; i < 12; i++) for (let j = 0; j < 7; j++)                              // 厨房棋盘砖
    flat(22 + i, 3 + j, 23 + i, 4 + j, 0.018, (i + j) % 2 ? 0xfdfaf2 : 0xbfe3f5);
  flat(22.1, 12.1, 33.9, 17.9, 0.016, 0xddd6cc);                                        // 储物间水泥
  flat(20.1, 3.1, 21.9, 9.9, 0.018, 0xf2c9a0); flat(20.1, 12.1, 21.9, 17.9, 0.018, 0xf2c9a0);
  propDepth--;
  W.floors = [
    { x0: 6, z0: 3, x1: 34, z1: 18, type: 'wood' }, { x0: 6.1, z0: 3.1, x1: 12.9, z1: 9.9, type: 'carpet', color: 0xfff0dc }, { x0: 13.1, z0: 3.1, x1: 19.9, z1: 9.9, type: 'carpet', color: 0xbfe8d2 },
    { x0: 22.1, z0: 3.1, x1: 33.9, z1: 9.9, type: 'tile' }, { x0: 22.1, z0: 12.1, x1: 33.9, z1: 17.9, type: 'concrete' },
  ];

  // —— 房子：墙 ——  faces: 各朝向的墙面颜色（nz=朝北, pz=朝南, nx=朝西, px=朝东）
  const ext = 0xfff0d6;
  wall('x', 3, 6, 34, [{ a: 8.5, b: 10.5, type: 'window' }, { a: 15.5, b: 17.5, type: 'window' }, { a: 20.3, b: 21.7, type: 'door' }, { a: 26, b: 29, type: 'window' }], { nz: ext, pz: null });
  wall('x', 18, 6, 34, [{ a: 9.5, b: 12, type: 'vault' }, { a: 15, b: 17, type: 'window' }, { a: 20.3, b: 21.7, type: 'door' }, { a: 27.5, b: 29.5, type: 'vault' }], { pz: ext });
  wall('z', 6, 3, 18, [{ a: 5.5, b: 7.5, type: 'window' }, { a: 14, b: 16, type: 'window' }], { nx: ext });
  wall('z', 34, 3, 18, [{ a: 5.5, b: 7.5, type: 'window' }], { px: ext });
  wall('x', 10, 6, 34, [{ a: 9, b: 10.4, type: 'door' }, { a: 16, b: 17.4, type: 'door' }, { a: 20.2, b: 21.8, type: 'open' }, { a: 24, b: 25.4, type: 'door' }, { a: 31, b: 32.4, type: 'door' }]);
  wall('x', 12, 6, 34, [{ a: 8, b: 9.4, type: 'door' }, { a: 15.5, b: 18, type: 'open' }, { a: 20.2, b: 21.8, type: 'open' }, { a: 24, b: 25.4, type: 'door' }]);
  wall('z', 13, 3, 10, [{ a: 5, b: 6.4, type: 'door' }]);
  wall('z', 20, 3, 10, []);
  wall('z', 22, 3, 10, [{ a: 7, b: 8.4, type: 'door' }]);
  wall('z', 20, 12, 18, [{ a: 14, b: 15.4, type: 'door' }]);
  wall('z', 22, 12, 18, []);
  W.roomTints = [ // 房间墙面色（渲染时按位置给墙面上色）
    { x0: 6, z0: 3, x1: 13, z1: 10, c: P.pink }, { x0: 13, z0: 3, x1: 20, z1: 10, c: P.blue }, { x0: 20, z0: 3, x1: 22, z1: 10, c: P.cream },
    { x0: 22, z0: 3, x1: 34, z1: 10, c: 0xfff1b8 }, { x0: 6, z0: 10, x1: 34, z1: 12, c: P.cream }, { x0: 6, z0: 12, x1: 20, z1: 18, c: P.mint },
    { x0: 20, z0: 12, x1: 22, z1: 18, c: P.cream }, { x0: 22, z0: 12, x1: 34, z1: 18, c: P.lilac },
  ];
  // 天花板和屋顶
  part('box', 20, H + 0.06, 10.5, 28.4, 0.12, 15.4, 0xfffaf0, { hard: true, noOutline: true, mat: 'plaster' });
  part('box', 20, H + 1.45, 6.6, 29.6, 0.3, 8.8, P.coral, { rx: -0.38, mat: 'roof' });
  part('box', 20, H + 1.45, 14.4, 29.6, 0.3, 8.8, P.coral, { rx: 0.38, mat: 'roof' });
  part('box', 27, H + 2.6, 8, 1.1, 1.8, 1.1, 0xe9a48a, { noShadow: true });
  part('box', 27, H + 3.55, 8, 1.3, 0.2, 1.3, P.dark, { noShadow: true });
  deco(5.75, 2.75, 34.25, 3.0, H - 0.05, H + 0.25, P.white, { noShadow: true }); deco(5.75, 18, 34.25, 18.25, H - 0.05, H + 0.25, P.white, { noShadow: true });

  // —— 家具零件库 ——
  const legs = (x0, z0, x1, z1, y1, color, t = 0.08) => {
    for (const [x, z] of [[x0 + t, z0 + t], [x1 - t, z0 + t], [x0 + t, z1 - t], [x1 - t, z1 - t]]) cyl(x, z, 0, y1, t * 0.7, color, { seg: 8 });
  };
  // 桌子：桌面下方是“底部空间”，只有匍匐能钻
  const table = (x0, z0, x1, z1, topY, color, legColor = P.woodDark) => { prop('table', { x0, z0, x1, z1, topY, color, legColor }, () => {
    block(x0, z0, x1, z1, topY, topY + 0.09, color, { c: { cover: 'under' } }); legs(x0, z0, x1, z1, topY, legColor);
  }); };
  const chair = (x, z, dir, color) => { prop('chair', { x, z, dir, color }, () => { // dir: 椅背在哪一侧
    block(x - 0.22, z - 0.22, x + 0.22, z + 0.22, 0.4, 0.48, color, { c: { y0: 0, cover: 'low' } }); legs(x - 0.22, z - 0.22, x + 0.22, z + 0.22, 0.4, P.woodDark, 0.05);
    const b = { n: [x - 0.22, z - 0.24, x + 0.22, z - 0.16], s: [x - 0.22, z + 0.16, x + 0.22, z + 0.24], w: [x - 0.24, z - 0.22, x - 0.16, z + 0.22], e: [x + 0.16, z - 0.22, x + 0.24, z + 0.22] }[dir];
    deco(b[0], b[1], b[2], b[3], 0.48, 1.0, color);
  }); };
  const sofa = (x0, z0, x1, z1, back, color, cushion) => { prop('sofa', { x0, z0, x1, z1, back, color, cushion }, () => { // back: 靠背在哪一侧
    block(x0, z0, x1, z1, 0.08, 0.48, color, { c: { y0: 0, y1: 1.0, cover: 'low' }, r: { rad: 0.12 } });
    const d = 0.28;
    const bk = { n: [x0, z0, x1, z0 + d], s: [x0, z1 - d, x1, z1], w: [x0, z0, x0 + d, z1], e: [x1 - d, z0, x1, z1] }[back];
    deco(bk[0], bk[1], bk[2], bk[3], 0.4, 0.98, color, { rad: 0.12 });
    const horiz = back === 'n' || back === 's';
    if (horiz) { deco(x0, z0, x0 + 0.24, z1, 0.3, 0.72, color, { rad: 0.1 }); deco(x1 - 0.24, z0, x1, z1, 0.3, 0.72, color, { rad: 0.1 }); }
    else { deco(x0, z0, x1, z0 + 0.24, 0.3, 0.72, color, { rad: 0.1 }); deco(x0, z1 - 0.24, x1, z1, 0.3, 0.72, color, { rad: 0.1 }); }
    const n = Math.max(1, Math.round((horiz ? x1 - x0 : z1 - z0) / 0.9));
    for (let i = 0; i < n; i++) {
      if (horiz) { const w = (x1 - x0 - 0.5) / n, cx = x0 + 0.25 + w * (i + 0.5), cz = (z0 + z1) / 2 + (back === 'n' ? 0.1 : -0.1); deco(cx - w / 2 + 0.03, cz - 0.3, cx + w / 2 - 0.03, cz + 0.3, 0.46, 0.6, cushion, { rad: 0.07 }); }
      else { const w = (z1 - z0 - 0.5) / n, cz = z0 + 0.25 + w * (i + 0.5), cx = (x0 + x1) / 2 + (back === 'w' ? 0.1 : -0.1); deco(cx - 0.3, cz - w / 2 + 0.03, cx + 0.3, cz + w / 2 - 0.03, 0.46, 0.6, cushion, { rad: 0.07 }); }
    }
  }); };
  // 床：床板下方是底部空间
  const bed = (x0, z0, x1, z1, head, color, blanket) => { prop('bed', { x0, z0, x1, z1, head, color, blanket }, () => {
    block(x0, z0, x1, z1, 0.5, 0.62, P.woodDark, { c: { cover: 'under', y1: 0.9 } }); legs(x0, z0, x1, z1, 0.5, P.woodDark, 0.09);
    deco(x0 + 0.04, z0 + 0.04, x1 - 0.04, z1 - 0.04, 0.6, 0.86, P.white, { rad: 0.1 });
    const hb = { w: [x0 - 0.02, z0, x0 + 0.12, z1], e: [x1 - 0.12, z0, x1 + 0.02, z1], n: [x0, z0 - 0.02, x1, z0 + 0.12], s: [x0, z1 - 0.12, x1, z1 + 0.02] }[head];
    block(hb[0], hb[1], hb[2], hb[3], 0, 1.25, color, { r: { rad: 0.06 } });
    const horiz = head === 'w' || head === 'e';
    if (horiz) {
      const bx0 = head === 'w' ? x0 + (x1 - x0) * 0.36 : x0 + 0.03, bx1 = head === 'w' ? x1 - 0.03 : x1 - (x1 - x0) * 0.36;
      deco(bx0, z0 + 0.01, bx1, z1 - 0.01, 0.62, 0.92, blanket, { rad: 0.1 });
      const px = head === 'w' ? x0 + 0.45 : x1 - 0.45;
      for (const pz of (z1 - z0 > 1.4 ? [z0 + (z1 - z0) * 0.27, z0 + (z1 - z0) * 0.73] : [(z0 + z1) / 2])) deco(px - 0.22, pz - 0.36, px + 0.22, pz + 0.36, 0.84, 1.0, P.white, { rad: 0.07 });
    } else {
      const bz0 = head === 'n' ? z0 + (z1 - z0) * 0.36 : z0 + 0.03, bz1 = head === 'n' ? z1 - 0.03 : z1 - (z1 - z0) * 0.36;
      deco(x0 + 0.01, bz0, x1 - 0.01, bz1, 0.62, 0.92, blanket, { rad: 0.1 });
      const pz = head === 'n' ? z0 + 0.45 : z1 - 0.45;
      deco((x0 + x1) / 2 - 0.36, pz - 0.22, (x0 + x1) / 2 + 0.36, pz + 0.22, 0.84, 1.0, P.white, { rad: 0.07 });
    }
  }); };
  const cabinet = (x0, z0, x1, z1, h, color, front, knob = P.yellow) => { prop('cabinet', { x0, z0, x1, z1, h, color, front, knob }, () => { // front: 门朝向
    block(x0, z0, x1, z1, 0, h, color, { c: { cover: h >= 1.5 ? 'high' : 'low' } });
    const horiz = front === 'n' || front === 's';
    const n = Math.max(1, Math.round((horiz ? x1 - x0 : z1 - z0) / 0.6));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      if (horiz) { const x = x0 + (x1 - x0) * f, z = front === 's' ? z1 + 0.02 : z0 - 0.02; ball(x + (i % 2 ? -0.12 : 0.12), Math.min(h * 0.55, 1.0), z, 0.04, knob, { noShadow: true, seg: 6 }); deco(x - (x1 - x0) / n / 2 + 0.03, z - 0.012, x + (x1 - x0) / n / 2 - 0.03, z + 0.012, 0.08, h - 0.08, lighten(color), { noOutline: true, noShadow: true }); }
      else { const z = z0 + (z1 - z0) * f, x = front === 'e' ? x1 + 0.02 : x0 - 0.02; ball(x, Math.min(h * 0.55, 1.0), z + (i % 2 ? -0.12 : 0.12), 0.04, knob, { noShadow: true, seg: 6 }); deco(x - 0.012, z - (z1 - z0) / n / 2 + 0.03, x + 0.012, z + (z1 - z0) / n / 2 - 0.03, 0.08, h - 0.08, lighten(color), { noOutline: true, noShadow: true }); }
    }
  }); };
  const shelf = (x0, z0, x1, z1, h, color, stuff = true) => { prop('shelf', { x0, z0, x1, z1, h, color, stuff }, () => {
    block(x0, z0, x1, z1, 0, h, color, { c: { cover: h >= 1.5 ? 'high' : 'low' }, r: { rad: 0.03 } });
    if (!stuff) return;
    const horiz = x1 - x0 > z1 - z0; const cols = [P.coral, P.yellow, P.sky, P.teal, P.purple, P.white, P.orange];
    for (let lvl = 0.35; lvl < h - 0.3; lvl += 0.5) {
      let t = 0.1; const len = horiz ? x1 - x0 : z1 - z0;
      while (t < len - 0.25) {
        const w = 0.07 + rnd() * 0.1, hh = 0.25 + rnd() * 0.16, c = cols[Math.floor(rnd() * cols.length)];
        for (const side of [-1, 1]) {
          if (horiz) { const z = side < 0 ? z0 - 0.03 : z1 + 0.03; deco(x0 + t, z - 0.02, x0 + t + w, z + 0.02, lvl, lvl + hh, c, { noOutline: true, noShadow: true, hard: true }); }
          else { const x = side < 0 ? x0 - 0.03 : x1 + 0.03; deco(x - 0.02, z0 + t, x + 0.02, z0 + t + w, lvl, lvl + hh, c, { noOutline: true, noShadow: true, hard: true }); }
        }
        t += w + 0.02 + (rnd() > 0.8 ? 0.2 : 0);
      }
      if (horiz) deco(x0 + 0.03, z0 - 0.035, x1 - 0.03, z1 + 0.035, lvl - 0.05, lvl - 0.01, darken(color), { noOutline: true, noShadow: true, hard: true });
      else deco(x0 - 0.035, z0 + 0.03, x1 + 0.035, z1 - 0.03, lvl - 0.05, lvl - 0.01, darken(color), { noOutline: true, noShadow: true, hard: true });
    }
  }); };
  const plant = (x, z, s = 1, potColor = P.coral) => { prop('plant', { x, z, s, potColor }, () => {
    cyl(x, z, 0, 0.4 * s, 0.22 * s, potColor, { top: 1.25, seg: 12 });
    ball(x, 0.75 * s, z, 0.34 * s, P.leaf); ball(x + 0.2 * s, 0.98 * s, z + 0.08 * s, 0.24 * s, P.hedgeLight); ball(x - 0.16 * s, 1.02 * s, z - 0.1 * s, 0.22 * s, P.leaf);
    col(x - 0.3 * s, z - 0.3 * s, x + 0.3 * s, z + 0.3 * s, 0, 1.15 * s, { cover: 'low' });
  }); };
  const lamp = (x, z, color = P.yellow) => { prop('lamp', { x, z, color }, () => { cyl(x, z, 0, 0.05, 0.2, P.dark, { seg: 12 }); cyl(x, z, 0.05, 1.5, 0.03, P.dark, { seg: 6 }); cyl(x, z, 1.45, 1.85, 0.24, color, { top: 0.6, seg: 12, noShadow: true, glow: true }); col(x - 0.12, z - 0.12, x + 0.12, z + 0.12, 0, 1.8, { occlude: false, map: null }); }); };
  const crate = (x, z, s, h, color) => { prop('crate', { x, z, s, h, color }, () => { block(x - s / 2, z - s / 2, x + s / 2, z + s / 2, h, h + s * 0.85, color, { c: { y0: 0, cover: 'low' }, r: { rad: 0.03 } }); deco(x - s / 2 - 0.005, z - 0.05, x + s / 2 + 0.005, z + 0.05, h + s * 0.85 - 0.02, h + s * 0.85 + 0.006, 0xe6d3a8, { noOutline: true, noShadow: true, hard: true }); }); };
  const rug = (x0, z0, x1, z1, c1, c2) => { prop('rug', { x0, z0, x1, z1, c1, c2 }, () => { flat(x0, z0, x1, z1, 0.03, c1); flat(x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, 0.036, c2); flat(x0 + 0.45, z0 + 0.45, x1 - 0.45, z1 - 0.45, 0.042, c1); }); };
  const picture = (axis, at, c, y, w, h, color) => { prop('picture', { axis, at, c, y, w, h, color }, () => {
    if (axis === 'x') { deco(c - w / 2, at - 0.02, c + w / 2, at + 0.02, y, y + h, P.woodDark, { noShadow: true, hard: true }); deco(c - w / 2 + 0.06, at - 0.028, c + w / 2 - 0.06, at + 0.028, y + 0.06, y + h - 0.06, color, { noOutline: true, noShadow: true, hard: true }); }
    else { deco(at - 0.02, c - w / 2, at + 0.02, c + w / 2, y, y + h, P.woodDark, { noShadow: true, hard: true }); deco(at - 0.028, c - w / 2 + 0.06, at + 0.028, c + w / 2 - 0.06, y + 0.06, y + h - 0.06, color, { noOutline: true, noShadow: true, hard: true }); }
  }); };
  // 窗帘：挡视线但能穿过
  const curtain = (x0, z0, x1, z1, color) => { prop('curtain', { x0, z0, x1, z1, color }, () => { part('box', (x0 + x1) / 2, 1.2, (z0 + z1) / 2, x1 - x0, 2.2, z1 - z0, color, { rad: 0.05, noShadow: true, sway: true }); col(x0, z0, x1, z1, 0.1, 2.3, { solid: false, hunterBlock: false, cover: 'high', map: null }); }); };

  // —— 客厅 (6..20, 12..18) ——
  rug(8.6, 13.3, 13.4, 16.9, P.coral, P.cream);
  sofa(9.2, 15.6, 12.8, 16.6, 's', P.sky, P.yellow);
  sofa(13.6, 13.4, 14.6, 15.6, 'e', P.sky, P.coral);
  table(10, 13.9, 12, 14.9, 0.46, P.wood);
  ball(10.6, 0.63, 14.3, 0.09, P.red, { noShadow: true }); deco(11.2, 14.2, 11.6, 14.5, 0.55, 0.59, P.teal, { noShadow: true });
  cabinet(6.15, 12.6, 6.7, 13.8, 0.6, P.wood, 'e');
  deco(6.3, 12.75, 6.42, 13.65, 0.75, 1.4, P.dark, { rad: 0.03 }); deco(6.43, 12.8, 6.44, 13.6, 0.8, 1.35, 0x8fd3ff, { noOutline: true, noShadow: true, hard: true }); // 电视
  shelf(10.2, 12.15, 14.8, 12.55, 2.0, P.wood);
  cabinet(18.5, 12.15, 19.8, 12.75, 1.3, P.dark, 's', P.white);                           // 钢琴
  deco(18.5, 12.75, 19.8, 13.0, 0.7, 0.78, P.white, { noShadow: true }); block(18.9, 13.15, 19.4, 13.5, 0.36, 0.44, P.coral, { c: { y0: 0, cover: 'low' } }); legs(18.9, 13.15, 19.4, 13.5, 0.36, P.dark, 0.05);
  sofa(17.4, 16.3, 18.6, 17.3, 's', P.yellow, P.coral);                                    // 单人椅
  lamp(19.5, 17.4); lamp(8.7, 17.3, P.coral);
  plant(6.6, 17.4, 1.2); plant(19.5, 15.9, 0.9, P.sky);
  curtain(9.25, 17.72, 9.6, 17.86, P.yellow); curtain(11.9, 17.72, 12.25, 17.86, P.yellow);
  curtain(6.14, 13.75, 6.28, 14.05, P.coral); curtain(6.14, 15.95, 6.28, 16.25, P.coral);
  picture('x', 12.11, 7.0, 1.3, 0.9, 0.7, P.yellow); picture('x', 17.89, 18.2, 1.3, 0.8, 0.6, P.coral);
  crate(15.6, 17.3, 0.7, 0, 0xe8c98f); ball(16.5, 0.22, 16.6, 0.22, P.red);

  // —— 厨房 / 餐厅 (22..34, 3..10) ——
  cabinet(23.2, 3.15, 32.9, 3.8, 0.92, P.white, 's', P.coral);
  deco(23.15, 3.12, 32.95, 3.85, 0.92, 0.98, P.woodDark, { noShadow: true });
  deco(26.6, 3.3, 27.6, 3.7, 0.985, 1.0, P.metal, { noOutline: true, noShadow: true }); cyl(27.1, 3.28, 0.98, 1.25, 0.03, P.metal, { seg: 6, noShadow: true }); // 水槽
  block(30.2, 3.2, 31.0, 3.75, 0.98, 1.25, P.red, { noCol: true, r: { rad: 0.08 } }); cyl(29.5, 3.5, 0.98, 1.22, 0.11, P.teal, { seg: 10 }); // 面包机、锅
  cabinet(33.05, 3.15, 33.85, 3.95, 1.95, P.sky, 's', P.white);                            // 冰箱
  cabinet(33.4, 8.2, 33.85, 9.8, 1.95, P.wood, 'w', P.coral);                              // 储物高柜
  block(26.4, 5.5, 29.2, 6.5, 0, 0.92, P.sky, { c: { cover: 'low', y1: 1.0 } }); deco(26.3, 5.4, 29.3, 6.6, 0.92, 0.99, P.woodDark);  // 岛台
  for (const x of [26.9, 27.8, 28.7]) { cyl(x, 6.95, 0.6, 0.68, 0.2, P.coral, { seg: 12 }); cyl(x, 6.95, 0, 0.6, 0.03, P.metal, { seg: 6 }); col(x - 0.2, 6.75, x + 0.2, 7.15, 0, 0.68, { cover: 'low', occlude: false }); }
  ball(27.3, 1.08, 6, 0.1, P.orange, { noShadow: true }); ball(27.5, 1.07, 6.1, 0.09, P.red, { noShadow: true }); ball(27.4, 1.08, 5.85, 0.09, P.yellow, { noShadow: true });
  table(23, 7.2, 25, 9.0, 0.74, P.wood); flat(23.3, 7.6, 24.7, 8.6, 0.835, P.coral, { noOutline: true });
  chair(22.65, 7.7, 'w', P.yellow); chair(22.65, 8.5, 'w', P.yellow); chair(25.35, 8.1, 'e', P.yellow);
  plant(22.55, 3.6, 1.0, P.yellow); plant(33.4, 5.0, 0.9);
  rug(29.6, 7.6, 32.4, 9.4, P.yellow, P.white);
  block(30.2, 8.0, 31.8, 9.0, 0, 0.5, 0xe8c98f, { c: { cover: 'low', y1: 0.6 }, r: { rad: 0.04 } });  // 大纸箱（快递）
  crate(31.0, 8.5, 0.55, 0.5, 0xdcb97c);
  picture('z', 22.11, 5.0, 1.4, 1.0, 0.7, P.teal);
  curtain(25.7, 3.14, 26.0, 3.28, P.coral); curtain(29.0, 3.14, 29.3, 3.28, P.coral);

  // —— 卧室 (6..13, 3..10) ——
  bed(6.2, 7.3, 8.5, 9.3, 'w', P.wood, P.lilac);
  cabinet(6.15, 6.6, 6.65, 7.15, 0.6, P.wood, 'e'); cabinet(6.15, 9.42, 6.65, 9.88, 0.6, P.wood, 'e');
  cyl(6.4, 6.85, 0.6, 0.85, 0.1, P.yellow, { top: 0.6, seg: 10, noShadow: true, glow: true });
  cabinet(10.9, 3.15, 12.85, 3.85, 2.1, P.wood, 's');                                       // 衣柜
  cabinet(6.15, 3.15, 6.75, 5.0, 1.0, P.white, 'e', P.coral);                               // 梳妆柜
  rug(8.9, 5.2, 11.4, 7.6, P.purple, P.white);
  block(11.3, 8.9, 12.7, 9.85, 0, 0.45, P.coral, { c: { cover: 'low', y1: 0.5 }, r: { rad: 0.1 } });   // 床尾凳
  cyl(8.9, 3.6, 0, 0.6, 0.28, 0xe6d3a8, { top: 1.15, seg: 12 }); col(8.6, 3.3, 9.2, 3.9, 0, 0.6, { cover: 'low' });  // 洗衣篮
  ball(8.9, 0.62, 3.6, 0.2, P.white, { noShadow: true });
  plant(12.5, 4.5, 1.1, P.sky); lamp(12.6, 9.6, P.pink);
  curtain(8.2, 3.14, 8.5, 3.28, P.purple); curtain(10.5, 3.14, 10.8, 3.28, P.purple);
  curtain(6.14, 5.25, 6.28, 5.55, P.purple); curtain(6.14, 7.45, 6.28, 7.75, P.purple);
  picture('z', 12.89, 8.2, 1.3, 0.9, 0.7, P.sky);

  // —— 儿童房 (13..20, 3..10) ——
  // 上下铺：下铺床板下是底部空间
  bed(17.7, 3.3, 19.85, 4.5, 'e', P.sky, P.yellow);
  block(17.7, 3.3, 19.85, 4.5, 1.5, 1.62, P.woodDark, { c: { cover: null } }); deco(17.74, 3.34, 19.81, 4.46, 1.62, 1.8, P.coral, { rad: 0.08 });
  for (const [x, z] of [[17.75, 3.35], [17.75, 4.45], [19.8, 3.35], [19.8, 4.45]]) cyl(x, z, 0, 2.0, 0.05, P.woodDark, { seg: 8 });
  for (let y = 0.3; y < 1.5; y += 0.3) deco(17.6, 4.3, 17.68, 4.5, y, y + 0.05, P.woodDark, { noShadow: true });
  // 游戏帐篷：三面围挡，南面开口
  part('cone', 14.6, 0.95, 4.7, 2.3, 1.9, 2.3, P.coral, { seg: 6, noShadow: false }); part('cone', 14.6, 1.98, 4.7, 0.5, 0.4, 0.5, P.yellow, { seg: 6 });
  col(13.75, 3.8, 15.45, 3.95, 0, 1.6, { cover: 'high' }); col(13.75, 3.8, 13.9, 5.6, 0, 1.6, { cover: 'high' }); col(15.3, 3.8, 15.45, 5.6, 0, 1.6, { cover: 'high' });
  col(13.9, 5.45, 14.15, 5.6, 0, 1.5, { cover: 'high' }); col(15.05, 5.45, 15.3, 5.6, 0, 1.5, { cover: 'high' });
  W.tents = [{ x: 14.6, z: 4.7 }];
  // 玩具堆
  col(13.3, 8.3, 14.9, 9.8, 0, 0.9, { cover: 'low' });
  ball(13.8, 0.4, 9.0, 0.4, P.yellow); ball(14.4, 0.3, 9.3, 0.3, P.sky); ball(14.3, 0.72, 8.8, 0.26, P.coral); deco(13.4, 8.35, 14.0, 8.8, 0, 0.5, P.teal, { rad: 0.05 }); deco(14.2, 8.4, 14.8, 8.9, 0, 0.45, P.purple, { rad: 0.05 }); deco(13.55, 9.35, 14.0, 9.75, 0, 0.4, P.red, { rad: 0.05 }); ball(13.9, 0.95, 8.9, 0.18, P.white);
  table(15.9, 6.4, 17.3, 7.4, 0.5, P.yellow, P.coral);                                      // 小桌子
  for (const [x, z, c] of [[15.6, 6.9, P.coral], [17.6, 6.9, P.sky]]) { cyl(x, z, 0, 0.3, 0.17, c, { seg: 10 }); col(x - 0.17, z - 0.17, x + 0.17, z + 0.17, 0, 0.3, { occlude: false, cover: null }); }
  deco(16.2, 6.6, 16.5, 6.9, 0.59, 0.69, P.red, { rad: 0.02 }); deco(16.6, 6.8, 16.85, 7.05, 0.59, 0.84, P.sky, { rad: 0.02 }); deco(16.25, 7.0, 16.5, 7.25, 0.59, 0.69, P.yellow, { rad: 0.02 });
  cabinet(18.6, 8.2, 19.85, 9.85, 0.75, P.sky, 'w', P.yellow);                              // 玩具箱
  shelf(13.15, 6.9, 13.5, 8.2, 1.2, P.white);
  rug(15.4, 7.7, 18.0, 9.7, P.sky, P.white);
  ball(16.2, 0.2, 5.0, 0.2, P.red); ball(17.0, 0.14, 8.6, 0.14, P.yellow); deco(16.5, 8.9, 16.9, 9.1, 0.04, 0.2, P.coral, { rad: 0.03 }); deco(16.2, 8.3, 16.4, 8.5, 0.04, 0.24, P.teal, { rad: 0.03 });
  curtain(15.2, 3.14, 15.5, 3.28, P.yellow); curtain(17.5, 3.14, 17.8, 3.28, P.yellow);
  picture('z', 19.89, 6.5, 1.4, 1.0, 0.8, P.yellow); picture('x', 9.89, 14.5, 1.3, 0.8, 0.6, P.coral);

  // —— 玄关 / 后门厅 / 走廊 ——
  cabinet(20.15, 4.2, 20.6, 5.8, 0.85, P.wood, 'e');                                         // 鞋柜
  cyl(21.7, 3.4, 0, 1.75, 0.04, P.woodDark, { seg: 6 }); ball(21.7, 1.8, 3.4, 0.08, P.woodDark); deco(21.5, 3.3, 21.9, 3.5, 1.2, 1.6, P.coral, { rad: 0.08 }); // 衣帽架
  flat(20.4, 3.2, 21.6, 4.0, 0.03, P.teal);
  block(21.45, 16.2, 21.85, 17.6, 0.36, 0.44, P.wood, { c: { y0: 0, cover: 'low' } }); legs(21.45, 16.2, 21.85, 17.6, 0.36, P.woodDark, 0.05);                  // 换鞋凳
  flat(20.4, 17.0, 21.6, 17.8, 0.03, P.coral);
  plant(6.5, 11.0, 1.1, P.yellow); plant(33.5, 11.0, 1.1, P.sky);
  rug(12, 10.45, 18, 11.55, P.teal, P.cream); rug(24, 10.45, 30, 11.55, P.teal, P.cream);
  picture('x', 10.11, 12.5, 1.3, 1.2, 0.8, P.sky); picture('x', 11.89, 12.5, 1.3, 0.9, 0.7, P.yellow); picture('x', 10.11, 28, 1.3, 1.0, 0.8, P.coral);
  table(27.2, 10.12, 28.8, 10.55, 0.75, P.wood);                                             // 走廊窄边桌
  cyl(28, 10.33, 0.84, 1.1, 0.09, P.sky, { seg: 10, noShadow: true }); ball(28, 1.22, 10.33, 0.14, P.coral, { noShadow: true });

  // —— 储物间 / 洗衣房 (22..34, 12..18) ——
  shelf(24.2, 13.6, 24.7, 16.8, 2.0, P.metal); shelf(26.4, 12.15, 26.9, 15.0, 2.0, P.metal);
  shelf(31.2, 14.6, 33.85, 15.1, 2.0, P.metal);
  for (const [x, c] of [[29.6, P.white], [30.5, P.white]]) { block(x, 12.15, x + 0.8, 12.9, 0, 0.95, c, { c: { cover: 'low' }, r: { rad: 0.05 } }); cyl(x + 0.4, 12.92, 0.3, 0.7, 0.24, P.sky, { rz: true, seg: 14, noShadow: true }); }
  crate(22.6, 12.6, 0.8, 0, 0xe8c98f); crate(22.6, 12.6, 0.6, 0.68, 0xdcb97c); crate(23.4, 12.5, 0.6, 0, 0xe8c98f);
  crate(33.3, 12.7, 0.9, 0, 0xdcb97c); crate(33.3, 12.7, 0.7, 0.77, 0xe8c98f); crate(32.5, 12.6, 0.7, 0, 0xe8c98f);
  crate(22.7, 17.3, 0.9, 0, 0xe8c98f); crate(23.6, 17.4, 0.7, 0, 0xdcb97c); crate(22.7, 17.3, 0.6, 0.77, 0xdcb97c);
  crate(29.0, 15.6, 0.8, 0, 0xe8c98f); crate(29.9, 16.6, 0.8, 0, 0xdcb97c); crate(29.9, 16.6, 0.6, 0.68, 0xe8c98f);
  table(31.5, 16.4, 33.6, 17.3, 0.78, P.wood);                                               // 工作台
  deco(32.0, 16.6, 32.5, 16.9, 0.87, 1.05, P.red, { rad: 0.03 }); cyl(33.1, 16.8, 0.87, 1.1, 0.08, P.yellow, { seg: 8 });
  // 自行车（简化）
  cyl(25.6, 17.55, 0.02, 0.7, 0.34, P.dark, { rz: true, thin: 0.06, seg: 16 }); cyl(26.7, 17.55, 0.02, 0.7, 0.34, P.dark, { rz: true, thin: 0.06, seg: 16 }); deco(25.6, 17.52, 26.7, 17.58, 0.5, 0.58, P.coral); deco(26.6, 17.5, 26.7, 17.6, 0.5, 1.0, P.coral); deco(25.8, 17.45, 26.1, 17.65, 0.85, 0.92, P.dark, { rad: 0.03 });
  col(25.25, 17.35, 27.05, 17.75, 0, 1.0, { cover: 'low', occlude: false });
  curtain(27.2, 17.72, 27.5, 17.86, P.sky); curtain(29.5, 17.72, 29.8, 17.86, P.sky);

  // —— 后院 (0..40, 18..30) 和四周 ——
  // 石板小路
  for (let i = 0; i < 9; i++) flat(20.3 + (i % 2 ? 0.15 : -0.15), 18.4 + i * 1.2, 21.7 + (i % 2 ? 0.15 : -0.15), 19.3 + i * 1.2, 0.02, P.stone, { rad: 0.1 });
  for (let i = 0; i < 3; i++) flat(20.4, 0.3 + i * 0.95, 21.6, 1.05 + i * 0.95, 0.02, P.stone);
  flat(19.5, 18.25, 22.5, 19.2, 0.03, P.woodDark);   // 后门露台
  // 围栏
  const fence = (axis, at, from, to, gate) => { prop('fence', { axis, at, from, to, gate }, () => {
    for (let t = from; t < to - 0.01; t += 2) {
      const a = t, b = Math.min(to, t + 2);
      if (gate && a >= gate[0] - 0.01 && b <= gate[1] + 0.01) continue;
      if (axis === 'x') { block(a, at - 0.06, b, at + 0.06, 0.25, 1.15, P.white, { c: { y0: 0, cover: 'low', map: 'fence' }, r: { rad: 0.04 } }); cyl(a, at, 0, 1.35, 0.09, P.white, { seg: 8 }); }
      else { block(at - 0.06, a, at + 0.06, b, 0.25, 1.15, P.white, { c: { y0: 0, cover: 'low', map: 'fence' }, r: { rad: 0.04 } }); cyl(at, a, 0, 1.35, 0.09, P.white, { seg: 8 }); }
    }
  }); };
  fence('x', 0.1, 0, 40); fence('x', 29.9, 0, 40, [19, 21]); fence('z', 0.1, 0, 30); fence('z', 39.9, 0, 30);
  col(19, 29.84, 21, 29.96, 0, 1.2, { occlude: false, map: 'fence' });   // 大门（关着）
  deco(19.05, 29.86, 20, 29.94, 0.2, 1.25, P.coral, { rad: 0.04 }); deco(20.0, 29.86, 20.95, 29.94, 0.2, 1.25, P.coral, { rad: 0.04 });
  cyl(19, 29.9, 0, 1.6, 0.13, P.white, { seg: 8 }); cyl(21, 29.9, 0, 1.6, 0.13, P.white, { seg: 8 }); ball(19, 1.7, 29.9, 0.17, P.yellow); ball(21, 1.7, 29.9, 0.17, P.yellow);
  // 绿篱（高掩体）
  const hedge = (x0, z0, x1, z1, h = 1.9) => { prop('hedge', { x0, z0, x1, z1, h }, () => {
    block(x0, z0, x1, z1, 0, h, P.hedge, { c: { cover: 'high', map: 'hedge' }, r: { rad: 0.22 } });
    const horiz = x1 - x0 > z1 - z0, len = horiz ? x1 - x0 : z1 - z0;
    for (let t = 0.5; t < len; t += 0.9 + rnd() * 0.5) {
      const px = horiz ? x0 + t : (x0 + x1) / 2 + (rnd() - 0.5) * 0.3, pz = horiz ? (z0 + z1) / 2 + (rnd() - 0.5) * 0.3 : z0 + t;
      ball(px, h - 0.05 + rnd() * 0.1, pz, 0.36 + rnd() * 0.12, rnd() > 0.5 ? P.hedgeLight : P.hedge, { noShadow: true });
    }
  }); };
  hedge(2.5, 23.6, 9.5, 24.4); hedge(11.6, 20.5, 12.4, 26.0); hedge(14.5, 26.2, 18.0, 27.0);
  hedge(26.5, 21.0, 27.3, 25.5); hedge(27.3, 21.0, 31.5, 21.8); hedge(23.0, 26.6, 26.5, 27.4);
  hedge(1.0, 19.5, 1.8, 22.0, 1.6); hedge(36.5, 19.3, 39.0, 20.1, 1.7);
  // 花坛（矮掩体）
  const flowerbed = (x0, z0, x1, z1) => { prop('flowerbed', { x0, z0, x1, z1 }, () => {
    block(x0, z0, x1, z1, 0, 0.45, 0xe9a48a, { c: { cover: 'low', y1: 1.0 }, r: { rad: 0.06 } }); deco(x0 + 0.08, z0 + 0.08, x1 - 0.08, z1 - 0.08, 0.4, 0.5, P.soil, { noOutline: true, noShadow: true });
    const cols = [P.coral, P.yellow, P.pink, P.white, P.purple, P.red];
    for (let x = x0 + 0.3; x < x1 - 0.15; x += 0.42) for (let z = z0 + 0.3; z < z1 - 0.15; z += 0.42) {
      const jx = x + (rnd() - 0.5) * 0.14, jz = z + (rnd() - 0.5) * 0.14, hh = 0.68 + rnd() * 0.25;
      cyl(jx, jz, 0.45, hh, 0.02, P.leaf, { seg: 5, noOutline: true, noShadow: true }); ball(jx, hh + 0.05, jz, 0.11 + rnd() * 0.04, cols[Math.floor(rnd() * cols.length)], { seg: 7 });
      ball(jx + 0.09, 0.56, jz + 0.03, 0.09, P.leaf, { seg: 6, noOutline: true, noShadow: true });
    }
  }); };
  flowerbed(6.2, 18.3, 9.2, 19.1); flowerbed(12.5, 18.3, 14.7, 19.1); flowerbed(23.0, 18.3, 27.0, 19.1); flowerbed(30.2, 18.3, 33.8, 19.1);
  flowerbed(15.0, 22.2, 18.2, 23.4); flowerbed(29.0, 24.0, 32.0, 25.0); flowerbed(3.0, 26.5, 4.2, 29.0);
  // 树
  const tree = (x, z, s = 1, c1 = P.leaf, c2 = P.hedgeLight) => { prop('tree', { x, z, s, c1, c2 }, () => {
    cyl(x, z, 0, 2.2 * s, 0.28 * s, P.woodDark, { top: 0.75, seg: 10 });
    ball(x, 3.0 * s, z, 1.5 * s, c1); ball(x + 0.9 * s, 2.6 * s, z + 0.3 * s, 1.0 * s, c2); ball(x - 0.8 * s, 2.7 * s, z - 0.4 * s, 1.05 * s, c2); ball(x + 0.1 * s, 3.9 * s, z + 0.2 * s, 0.95 * s, c2);
    col(x - 0.28 * s, z - 0.28 * s, x + 0.28 * s, z + 0.28 * s, 0, 2.4 * s, { cover: 'high', map: 'tree' });
  }); };
  tree(5.0, 21.2, 1.15); tree(34.5, 22.3, 1.0); tree(15.5, 28.6, 0.9, 0x6cc46a, 0x8ddc7f); tree(2.3, 3.0, 1.0); tree(37.5, 5.5, 1.1); tree(37.8, 14.5, 0.9, 0xf5a9c5, 0xffc9dc); tree(24.5, 29.0, 0.8);
  for (const [x, z] of [[4.3, 22.0], [5.9, 20.5], [34.0, 23.2], [38.3, 15.2]]) ball(x, 0.1, z, 0.1, P.red, { seg: 6, noShadow: true });
  // 野餐桌（底部空间）
  table(18.6, 24.3, 20.6, 25.5, 0.74, P.wood);
  for (const z of [23.75, 25.75]) { block(18.6, z, 20.6, z + 0.3, 0.38, 0.45, P.wood, { c: { y0: 0, cover: 'low', occlude: false } }); legs(18.6, z, 20.6, z + 0.3, 0.38, P.woodDark, 0.05); }
  cyl(19.6, 24.9, 0.83, 2.5, 0.035, P.white, { seg: 6 }); part('cone', 19.6, 2.55, 24.9, 3.0, 0.7, 3.0, P.coral, { seg: 8 }); // 阳伞
  // 蹦床（底部空间）
  cyl(7.0, 27.3, 0.55, 0.68, 1.5, P.dark, { seg: 20 }); cyl(7.0, 27.3, 0.6, 0.7, 1.25, P.sky, { seg: 20, noOutline: true, noShadow: true });
  for (let a = 0; a < 6; a++) cyl(7.0 + Math.cos(a * 1.047) * 1.35, 27.3 + Math.sin(a * 1.047) * 1.35, 0, 0.55, 0.05, P.metal, { seg: 6 });
  col(5.9, 26.2, 8.1, 28.4, 0.5, 0.7, { cover: 'under', map: 'furn' });
  // 工具棚（门朝西，可以进去）
  const sx0 = 34.4, sx1 = 38.2, sz0 = 24.6, sz1 = 28.2, sc = P.sky;
  block(sx0, sz0, sx1, sz0 + 0.14, 0, 2.3, sc, { c: { cover: 'high', map: 'wall' }, r: { hard: true, mat: 'siding:8fc0ff' } }); block(sx0, sz1 - 0.14, sx1, sz1, 0, 2.3, sc, { c: { cover: 'high', map: 'wall' }, r: { hard: true, mat: 'siding:8fc0ff' } });
  block(sx1 - 0.14, sz0, sx1, sz1, 0, 2.3, sc, { c: { cover: 'high', map: 'wall' }, r: { hard: true, mat: 'siding:8fc0ff' } });
  block(sx0, sz0, sx0 + 0.14, 25.6, 0, 2.3, sc, { c: { cover: 'high', map: 'wall' }, r: { hard: true, mat: 'siding:8fc0ff' } }); block(sx0, 27.0, sx0 + 0.14, sz1, 0, 2.3, sc, { c: { cover: 'high', map: 'wall' }, r: { hard: true, mat: 'siding:8fc0ff' } });
  block(sx0, 25.6, sx0 + 0.14, 27.0, 2.0, 2.3, sc, { c: { cover: null, map: null }, r: { hard: true, mat: 'siding:8fc0ff' } });
  part('box', (sx0 + sx1) / 2, 2.75, sz0 + 0.85, sx1 - sx0 + 0.5, 0.14, 2.3, P.coral, { rx: -0.42, mat: 'roof' }); part('box', (sx0 + sx1) / 2, 2.75, sz1 - 0.85, sx1 - sx0 + 0.5, 0.14, 2.3, P.coral, { rx: 0.42, mat: 'roof' });
  flat(sx0 + 0.1, sz0 + 0.1, sx1 - 0.1, sz1 - 0.1, 0.02, P.woodDark);
  shelf(37.5, 25.0, 37.95, 27.8, 1.8, P.wood); crate(35.2, 27.5, 0.8, 0, 0xe8c98f); crate(36.2, 27.6, 0.6, 0, 0xdcb97c);
  cyl(35.0, 25.1, 0, 0.9, 0.3, P.red, { seg: 12 }); col(34.7, 24.8, 35.3, 25.4, 0, 0.9, { cover: 'low' });
  // 晾衣绳：床单挡视线但能穿过（匍匐时能从下面看过去）
  cyl(29.5, 27.3, 0, 2.1, 0.05, P.white, { seg: 6 }); cyl(33.5, 27.3, 0, 2.1, 0.05, P.white, { seg: 6 }); deco(29.5, 27.29, 33.5, 27.31, 2.0, 2.02, P.dark, { noOutline: true, noShadow: true, hard: true });
  for (const [a, b, c] of [[29.8, 31.0, P.white], [31.2, 32.1, P.yellow], [32.3, 33.3, P.pink]]) { part('box', (a + b) / 2, 1.3, 27.3, b - a, 1.4, 0.04, c, { rad: 0.02, sway: true }); col(a, 27.25, b, 27.35, 0.6, 2.0, { solid: false, hunterBlock: false, cover: 'high', map: 'cloth' }); }
  // 狗屋、沙坑、秋千、水桶等
  block(9.5, 27.6, 10.9, 28.9, 0, 1.0, P.yellow, { c: { cover: 'low' }, r: { rad: 0.06 } }); part('box', 10.2, 1.2, 28.25, 1.7, 0.12, 1.0, P.coral, { rz2: 0.5, noShadow: true }); part('box', 10.2, 1.2, 28.25, 1.7, 0.12, 1.0, P.coral, { rz2: -0.5, noShadow: true }); cyl(10.2, 27.58, 0.1, 0.7, 0.3, P.dark, { rx90: true, thin: 0.04, seg: 12, noShadow: true });
  block(22.6, 21.2, 25.0, 23.2, 0, 0.22, P.wood, { c: { occlude: false, solid: false, hunterBlock: false, map: null }, r: { rad: 0.05 } }); flat(22.75, 21.35, 24.85, 23.05, 0.23, 0xf6e3b0, { noOutline: true }); // 沙坑
  cyl(23.3, 22.0, 0.22, 0.5, 0.16, P.red, { top: 1.2, seg: 10 }); ball(24.2, 0.36, 22.6, 0.16, P.sky); part('cone', 23.9, 0.4, 21.8, 0.5, 0.36, 0.5, 0xf6e3b0, { seg: 10 });
  // 秋千架
  for (const x of [30.2, 33.0]) { cyl(x, 22.6, 0, 2.3, 0.06, P.coral, { seg: 6 }); col(x - 0.08, 22.52, x + 0.08, 22.68, 0, 2.3, { occlude: false, map: null }); }
  deco(30.1, 22.56, 33.1, 22.64, 2.26, 2.34, P.coral, { noShadow: true });
  for (const x of [30.95, 32.25]) { deco(x - 0.25, 22.48, x + 0.25, 22.72, 0.5, 0.55, P.yellow); deco(x - 0.22, 22.59, x - 0.2, 22.61, 0.55, 2.26, P.dark, { noOutline: true, noShadow: true, hard: true }); deco(x + 0.2, 22.59, x + 0.22, 22.61, 0.55, 2.26, P.dark, { noOutline: true, noShadow: true, hard: true }); }
  // 侧院和前院杂物
  block(3.6, 8.0, 4.4, 9.2, 0, 1.1, P.teal, { c: { cover: 'low' }, r: { rad: 0.08 } }); block(3.6, 9.5, 4.4, 10.7, 0, 1.1, P.sky, { c: { cover: 'low' }, r: { rad: 0.08 } });   // 垃圾桶
  block(5.2, 12.5, 5.85, 13.7, 0.1, 0.9, P.white, { c: { y0: 0, cover: 'low' }, r: { rad: 0.06 } });   // 空调外机
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3 - (i > 2 ? 1 : 0); j++) cyl(1.0 + i * 0.0, 12.0 + j * 0.42 + i * 0.21, 0.16 + i * 0.36, 0.16 + i * 0.36 + 0.001, 0.2, P.woodDark, { rx90len: 1.4, seg: 8 });
  col(0.4, 11.7, 1.7, 13.2, 0, 1.3, { cover: 'low' });
  hedge(3.0, 14.8, 3.8, 17.5, 1.7); hedge(36.0, 9.0, 36.8, 12.5, 1.8);
  block(35.6, 16.0, 37.6, 17.2, 0, 0.5, P.wood, { c: { cover: 'low', y1: 0.6 }, r: { rad: 0.05 } }); deco(35.7, 16.1, 37.5, 17.1, 0.5, 0.56, P.soil, { noOutline: true, noShadow: true }); // 菜畦
  for (let x = 35.9; x < 37.5; x += 0.4) { ball(x, 0.66, 16.4, 0.13, P.leaf, { seg: 7 }); ball(x + 0.1, 0.66, 16.85, 0.12, P.hedgeLight, { seg: 7 }); }
  cyl(35.2, 13.5, 0, 0.9, 0.38, P.sky, { seg: 14 }); col(34.82, 13.12, 35.58, 13.88, 0, 0.9, { cover: 'low' });   // 雨水桶
  cyl(23.2, 1.3, 0, 1.1, 0.05, P.woodDark, { seg: 6 }); block(22.95, 1.1, 23.45, 1.5, 1.05, 1.4, P.red, { noCol: true, r: { rad: 0.06 } }); col(23.1, 1.2, 23.3, 1.4, 0, 1.4, { occlude: false, map: null });   // 信箱
  hedge(7.0, 1.2, 12.0, 2.0, 1.1); hedge(26.0, 1.2, 32.0, 2.0, 1.1); hedge(14.0, 1.0, 18.0, 1.8, 1.7);
  flowerbed(12.6, 2.0, 15.0, 2.7); flowerbed(22.3, 2.0, 25.5, 2.7);
  block(31.0, 19.6, 32.2, 20.2, 0, 0.5, P.wood, { c: { cover: 'low', occlude: false, y1: 0.5 }, r: { rad: 0.05 } }); // 长凳
  // 云
  W.clouds = [];
  for (let i = 0; i < 9; i++) W.clouds.push({ x: -30 + rnd() * 100, y: 22 + rnd() * 10, z: -40 + rnd() * 100, s: 2.5 + rnd() * 3 });

  // —— 猎人巡逻点（覆盖每个房间和后院四角）——
  W.patrol = [
    { x: 20, z: 26.5 }, { x: 10, z: 21.5 }, { x: 2, z: 27.5 }, { x: 14, z: 24.5 }, { x: 24, z: 24.5 }, { x: 33, z: 26.2 }, { x: 36.3, z: 26.3 }, { x: 37, z: 21.5 },
    { x: 21, z: 19.5 }, { x: 21, z: 15 }, { x: 16.5, z: 14.2 }, { x: 8, z: 14.5 }, { x: 12, z: 11 }, { x: 9.7, z: 6.5 }, { x: 11.5, z: 8.2 }, { x: 16.5, z: 5.5 }, { x: 17.2, z: 9 },
    { x: 21, z: 6.5 }, { x: 25.3, z: 6.2 }, { x: 31.5, z: 6.5 }, { x: 28, z: 9 }, { x: 28, z: 11 }, { x: 25.5, z: 13 }, { x: 28.2, z: 16.5 }, { x: 31, z: 13.6 }, { x: 32.5, z: 15.75 },
    { x: 21, z: 1.5 }, { x: 3, z: 6 }, { x: 4.6, z: 16 }, { x: 37.5, z: 10 }, { x: 35.5, z: 17.8 }, { x: 30, z: 28.5 },
  ];
  return W;
}

function lighten(c) { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; const f = (v) => Math.min(255, Math.round(v + (255 - v) * 0.25)); return (f(r) << 16) | (f(g) << 8) | f(b); }
function darken(c) { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; const f = (v) => Math.round(v * 0.8); return (f(r) << 16) | (f(g) << 8) | f(b); }
