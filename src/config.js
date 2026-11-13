// 所有可调参数。调试面板（` 键）可以实时修改。
export const CONFIG = {
  // —— 一局 ——
  roundTime: 180,
  hideTime: 20,
  hideTimeBots: 10,     // 躲藏方全是 AI 时的躲藏时间（AI 躲得快）
  hunterCount: 2,       // 当躲藏方练习时默认的猎人数

  // —— 躲藏方姿态 ——  speed 米/秒, visTarget 移动时可见度目标, rise 每秒上升, noise 噪音半径, eye 视线高度, height 身体高度
  stances: {
    prone:  { speed: 0.7, visTarget: 0.35, rise: 0.10, noise: 0,  eye: 0.35, height: 0.42 },
    crouch: { speed: 1.4, visTarget: 0.50, rise: 0.25, noise: 2,  eye: 0.8,  height: 0.9 },
    walk:   { speed: 2.2, visTarget: 0.65, rise: 0.40, noise: 4,  eye: 1.6,  height: 1.7 },
    run:    { speed: 4.0, visTarget: 1.00, rise: 2.00, noise: 12, eye: 1.6,  height: 1.7 },
  },
  playerRadius: 0.3,

  // —— 可见度 ——
  fadeDelay: 0.5,        // 停下多久后开始变透明
  fadeTime: 4.0,         // 从 1.0 降到下限的时间
  visFloor: 0.15,        // 可见度下限
  closeRevealDist: 2.5,  // 近距离必现轮廓
  closeRevealVis: 0.6,
  stancePenalty: 0.1,    // 切换姿态的可见度惩罚

  // —— 猎人 ——
  hunterPatrolSpeed: 3.0,
  hunterChaseSpeed: 5.0,
  hunterRadius: 0.38,
  hunterEye: 1.45,
  fovDeg: 90,
  viewDist: 18,
  detectGain: 3,         // 发现值增长系数
  visPower: 2,           // 可见度对发现速度的指数（2 = 半透明时很难被远处发现）
  detectDecay: 0.5,      // 每秒衰减
  stillLookBonus: 1.5,   // 猎人静止观察加成
  loseSightTime: 3,      // 丢失视线多久转入搜索
  searchTime: 8,
  searchRadius: 6,
  lookAroundTime: 2,
  investigateLookTime: 3,
  noiseError: 3,         // 听到噪音的位置误差

  // —— 喷色枪 ——
  ammo: 10,
  fireCooldown: 1.0,
  paintSpeed: 20,
  paintGravity: 4,
  paintSplatRadius: 0.4,
  aimDelay: 0.3,
  aimError: 0.5,
  fireRange: 14,         // AI 超过这个距离不开枪（子弹本身没有射程限制）
  probeShots: 3,         // 每个猎人最多几发试探射击

  // —— 小地图 ——
  radarRadius: 25,
  radarBlurWhenRunning: true,
  radarRangeLimit: true,
  radarShowTeammates: false, // 小地图上显示其他躲藏方（默认不显示，保持“不知道队友在哪”）

  // —— 防挂机 ——
  campTime: 45,
  campDist: 5,
  campHintRadius: 10,

  // —— 计分 ——
  scorePerSecond: 1,
  scoreInCone: 3,        // 在视野锥内 10 米内未被发现，每秒
  scoreInConeDist: 10,
  scoreBrush: 50,        // 擦肩而过
  brushDist: 3,
  scoreEscape: 30,
  scoreSurvive: 100,

  // —— 调试 ——
  debugCones: false,
  invincible: false,
};

// 调试面板里显示的条目：[路径, 标签, 最小, 最大, 步长]
export const DEBUG_ITEMS = [
  ['fadeDelay', '静止后变透明延迟(秒)', 0, 3, 0.1],
  ['fadeTime', '降到下限时间(秒)', 0.5, 10, 0.5],
  ['visFloor', '可见度下限', 0, 0.6, 0.05],
  ['closeRevealDist', '近距离必现半径(米)', 0, 6, 0.5],
  ['stancePenalty', '切换姿态惩罚', 0, 0.5, 0.05],
  ['stances.prone.speed', '匍匐速度', 0.2, 2, 0.1],
  ['stances.crouch.speed', '蹲行速度', 0.5, 3, 0.1],
  ['stances.walk.speed', '悄悄走速度', 1, 4, 0.1],
  ['stances.run.speed', '跑步速度', 2, 7, 0.1],
  ['hunterPatrolSpeed', '猎人巡逻速度', 1, 6, 0.1],
  ['hunterChaseSpeed', '猎人追击速度', 2, 8, 0.1],
  ['fovDeg', '猎人视野角度', 40, 160, 5],
  ['viewDist', '猎人视野长度(米)', 6, 30, 1],
  ['detectGain', '发现值增长系数', 0.5, 8, 0.25],
  ['visPower', '可见度指数', 1, 3, 0.25],
  ['detectDecay', '发现值衰减/秒', 0.1, 2, 0.1],
  ['stillLookBonus', '猎人静止观察加成', 1, 3, 0.1],
  ['loseSightTime', '丢失视线转搜索(秒)', 1, 8, 0.5],
  ['searchTime', '搜索时长(秒)', 2, 20, 1],
  ['fireCooldown', '喷色枪冷却(秒)', 0.3, 3, 0.1],
  ['paintSpeed', '颜料弹速度', 8, 40, 1],
  ['aimDelay', 'AI 反应延迟(秒)', 0, 1, 0.05],
  ['aimError', 'AI 瞄准偏差(米)', 0, 2, 0.1],
  ['fireRange', 'AI 开枪距离(米)', 4, 25, 1],
  ['radarRadius', '小地图半径(米)', 10, 45, 1],
  ['campTime', '防挂机时间(秒)', 10, 120, 5],
  ['radarBlurWhenRunning', '跑动时小地图模糊', null],
  ['radarRangeLimit', '小地图距离限制', null],
  ['radarShowTeammates', '小地图显示队友', null],
  ['debugCones', '显示猎人视野/发现值', null],
  ['invincible', '无敌（颜料打不中）', null],
];
