/**
 * B11 电磁场景组 1：加速电场→偏转电场→荧光屏（场景10）· 磁场→电场组合（场景11）
 * 单位归一化：q/m 可调，长度 m，时间 s
 */
import type { EMSceneDef } from '../../../engine/emScene'
import { C, f1, f2, fieldBox, plate, arrowGrid, bFieldZ, label, Mover, lorentz, ZERO } from './em-kit'

/* ══════════ 场景 10：加速电场 → 偏转电场 → 荧光屏（类平抛） ══════════ */
const X1A = -14, X1B = -10, D1 = 4, X2A = -6, GAP = 2
interface S10 { m: Mover; ph: 0 | 1 | 2 | 3; done: boolean; y1?: number; theta?: number; Y?: number; blocked: boolean }
function th10(p: Record<string, number>) {
  const v0 = Math.sqrt(2 * p.qm * p.U1)
  const a = (p.qm * p.U2) / GAP
  const t1 = p.L / v0
  const y1 = 0.5 * a * t1 * t1
  const tanT = (a * t1) / v0
  const Y = y1 + p.D * tanT
  return { v0, a, t1, y1, tanT, theta: (Math.atan(tanT) * 180) / Math.PI, Y, blocked: y1 > GAP / 2, xs: X2A + p.L + p.D }
}
export const accelDeflectScreen: EMSceneDef<S10> = {
  id: 'gk-accel-deflect-screen',
  title: '加速电场 → 偏转电场 → 荧光屏（类平抛）',
  desc: '粒子由静止经电压 U₁ 加速（qU₁=½mv₀²），进入平行板偏转电场做类平抛（沿板 L 匀速、垂直板 a=qU₂/(md)），出板后沿直线打到距板 D 的荧光屏。侧移 y 与比荷无关；偏转后速度反向延长线过板中点。',
  formula: 'v₀=√(2qU₁/m)　y₁=U₂L²/(4dU₁)　tanθ=U₂L/(2dU₁)　Y=y₁+D·tanθ=(U₂L/2dU₁)(L/2+D)',
  params: [
    { key: 'U1', label: '加速电压 U₁', min: 4, max: 40, step: 1, default: 10, unit: 'V' },
    { key: 'U2', label: '偏转电压 U₂', min: 0, max: 10, step: 0.5, default: 2, unit: 'V' },
    { key: 'L', label: '板长 L', min: 2, max: 6, step: 0.5, default: 4, unit: 'm' },
    { key: 'D', label: '板到屏距离 D', min: 2, max: 8, step: 0.5, default: 4, unit: 'm' },
    { key: 'qm', label: '比荷 q/m', min: 0.5, max: 2, step: 0.1, default: 1 },
  ],
  camera: { pos: [-2, 6, 26], target: [-3, 0, 0] },
  init(p, tl, kit) {
    tl.start('Ⅰ 加速电场（动能定理）', '#3ecf8e')
    // Ⅰ 加速电场：两极板 + E(+x)
    fieldBox(kit, X1A, X1B, -2, 2, C.E)
    plate(kit, X1A, 0, 0.15, 4.2); plate(kit, X1B, 0, 0.15, 4.2)
    arrowGrid(kit, { x: 1, y: 0, z: 0 }, X1A, X1B, -1.2, 1.2, 1, 3, 3.6, C.E)
    label(kit, `Ⅰ 加速 U₁=${p.U1} V`, (X1A + X1B) / 2, 3.2, 0, '#3ecf8e')
    // Ⅱ 偏转电场：上下极板 + E(+y)
    fieldBox(kit, X2A, X2A + p.L, -GAP / 2, GAP / 2, C.E)
    plate(kit, X2A + p.L / 2, GAP / 2, p.L, 0.12); plate(kit, X2A + p.L / 2, -GAP / 2, p.L, 0.12)
    arrowGrid(kit, { x: 0, y: 1, z: 0 }, X2A, X2A + p.L, -0.8, 0.8, Math.max(2, Math.round(p.L / 1.2)), 1, 1.6, C.E, 0.9)
    label(kit, `Ⅱ 偏转 U₂=${p.U2} V，L=${p.L} m`, X2A + p.L / 2, 3.2, 0, '#3ecf8e')
    // Ⅲ 荧光屏
    const xs = X2A + p.L + p.D
    plate(kit, xs, 0, 0.15, 12, C.screen, 0.9)
    label(kit, '荧光屏', xs + 1.4, 5.5, 0, '#d4af37', 0.8)
    label(kit, `D=${p.D} m`, X2A + p.L + p.D / 2, -2.4, 0, '#8a8aa0', 0.8)
    const m = new Mover(kit, { x: X1A + 0.001, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 })
    return { m, ph: 0, done: false, blocked: false }
  },
  step(s, p, d, t, tl) {
    const x = s.m.pos.x
    const acc = x < X1B ? lorentz({ x: p.U1 / D1, y: 0, z: 0 }, ZERO, p.qm)
      : x >= X2A && x < X2A + p.L ? lorentz({ x: 0, y: p.U2 / GAP, z: 0 }, ZERO, p.qm) : lorentz(ZERO, ZERO, p.qm)
    s.m.advance(d, acc, t)
    const th = th10(p), P = s.m.pos
    if (s.ph === 0 && P.x >= X1B) { s.ph = 1; tl.switchTo('漂移（无场，匀速）', '#8a8aa0', t, `t=${f2(t)}s 出加速电场 v₀=${f2(s.m.speed)} m/s（理论 √(2qU₁/m)=${f2(th.v0)}）`) }
    if (s.ph === 1 && P.x >= X2A) { s.ph = 2; tl.switchTo('Ⅱ 偏转电场：类平抛', '#F5C542', t, `t=${f2(t)}s 进入偏转电场，a=qU₂/(md)=${f2(th.a)} m/s²`) }
    if (s.ph === 2) {
      if (Math.abs(P.y) >= GAP / 2) { s.blocked = true; s.done = true; tl.switchTo('撞到极板（偏转过大）', '#E05555', t, `t=${f2(t)}s 侧移达 d/2=${GAP / 2} m，粒子打在极板上（y₁=${f2(th.y1)} > ${GAP / 2}）`); return false }
      if (P.x >= X2A + p.L) {
        s.ph = 3; s.y1 = P.y; s.theta = (Math.atan2(s.m.vel.y, s.m.vel.x) * 180) / Math.PI
        tl.switchTo('Ⅲ 出板后匀速直线 → 屏', '#4A90D9', t, `t=${f2(t)}s 出板：y₁=${f2(P.y)} m（理论 ${f2(th.y1)}），θ=${f1(s.theta)}°（理论 ${f1(th.theta)}°）`)
      }
    }
    if (s.ph === 3 && P.x >= th.xs) { s.Y = P.y; s.done = true; tl.log(t, `打到荧光屏：Y=${f2(P.y)} m（理论 y₁+D·tanθ=${f2(th.Y)} m）`); return false }
    if (Math.abs(P.y) > 6.5 || P.x > th.xs + 1) return false
    return true
  },
  sync(s) { s.m.sync() },
  readout(p, s) {
    const th = th10(p)
    return `v₀=√(2qU₁/m)=${f2(th.v0)} m/s　a=qU₂/(md)=${f2(th.a)} m/s²
板内侧移 y₁=U₂L²/(4dU₁)=${f2(th.y1)} m（d=${GAP} m，${th.blocked ? '✗ 大于 d/2，撞板' : '✓ 可飞出'}）
tanθ=U₂L/(2dU₁)=${f2(th.tanT)}（θ=${f1(th.theta)}°）　屏上 Y=${f2(th.Y)} m${s ? `\n当前 x=${f2(s.m.pos.x)}，y=${f2(s.m.pos.y)}，v=${f2(s.m.speed)} m/s` : ''}`
  },
  solution(p) {
    const th = th10(p)
    return {
      problemType: '带电粒子：加速电场 → 偏转电场（类平抛）→ 荧光屏（示波管原理）',
      hints: ['三段：加速（动能定理）→ 偏转（类平抛：分解为沿板匀速、垂直板匀加速）→ 出板直线', '偏转段的时间由沿板方向的匀速决定：t=L/v₀', '出板后速度方向反向延长线过板的中点——这是求屏上落点的捷径', '把 v₀² 用 U₁ 表示后，y₁ 里 q/m 会消掉'],
      processes: ['过程一：静止 → 经 U₁ 加速到 v₀', '过程二：进入平行板，沿板匀速、垂直板匀加速（类平抛）', '过程三：出板后不受力，沿直线飞到荧光屏'],
      forces: ['过程一：电场力 qE₁ 沿 +x（只做功）', '过程二：电场力 qE₂=qU₂/d 沿 +y（垂直初速度）', '过程三：无场，不受力'],
      laws: ['动能定理：qU₁=½mv₀²', '类平抛：x=v₀t，y=½at²，a=qU₂/(md)', '几何：Y=y₁+D·tanθ，tanθ=v_y/v₀'],
      critical: ['能飞出板的条件：y₁=U₂L²/(4dU₁) ≤ d/2', '侧移 y₁、偏角 θ 都与 q/m 无关：同一装置对任何比荷粒子偏转相同（若初速由同一 U₁ 加速）', 'U₂ 越大/L 越长/U₁ 越小 → 偏转越大'],
      derivation: ['v₀=√(2qU₁/m)', 't₁=L/v₀；y₁=½·(qU₂/md)·(L/v₀)²=U₂L²/(4dU₁)', 'tanθ=at₁/v₀=U₂L/(2dU₁)', 'Y=y₁+D·tanθ=(U₂L/(2dU₁))·(L/2+D)（等价于“反向延长线过板中点”）'],
      numeric: [`v₀=${f2(th.v0)} m/s，a=${f2(th.a)} m/s²`, `y₁=${f2(th.y1)} m（d/2=${GAP / 2}：${th.blocked ? '撞板' : '飞出'}）`, `θ=${f1(th.theta)}°，Y=${f2(th.Y)} m（屏距板 D=${p.D} m）`],
      pitfalls: ['把偏转电场当作也在做加速（速度大小变化只来自 y 方向分量）', '用 D 当作类平抛的水平位移（板长才是）', '忘记出板后是直线而不是继续抛物线', '比荷不同以为偏转不同（若 v₀ 由同一 U₁ 加速则相同）'],
      similar: ['示波管/CRT 电子束偏转', '喷墨打印机带电墨滴偏转', '电子在电容器边缘的运动'],
      competition: ['电场边缘效应下的修正', '相对论电子的偏转', '交变偏转电压下的李萨如图形'],
    }
  },
}

/* ══════════ 场景 11：磁场 → 电场组合 ══════════ */
const BX0 = -10, BX1 = -2, EX1 = 6, Y0 = -3, YMIN = -5, YMAX = 9
interface S11 { m: Mover; ph: 0 | 1 | 2 | 3; done: boolean; theta?: number; yExit?: number; yScreen?: number }
function th11(p: Record<string, number>) {
  const r = p.v / (p.qm * p.B)
  const W = BX1 - BX0
  if (r <= W) return { r, turn: true, theta: 180, yExit: Y0 + 2 * r, yScreen: NaN, tE: NaN }
  const sinT = W / r, cosT = Math.sqrt(1 - sinT * sinT)
  const yExit = Y0 + r * (1 - cosT)
  const vx = p.v * cosT, vy = p.v * sinT
  const tE = (EX1 - BX1) / vx
  const yScreen = yExit + vy * tE - 0.5 * p.qm * p.E * tE * tE
  return { r, turn: false, theta: (Math.asin(sinT) * 180) / Math.PI, yExit, yScreen, tE }
}
export const bThenE: EMSceneDef<S11> = {
  id: 'gk-b-then-e',
  title: '磁场 → 电场组合（圆周 → 类平抛）',
  desc: '粒子以 v 垂直射入宽 W 的匀强磁场（B 垂直纸面向里，正电荷向上偏）：r=mv/(qB)。r>W 时以 sinθ=W/r 的偏角穿出，进入竖直向下的匀强电场做类平抛打到屏；r≤W 时在磁场中转半圆从入射边折返。',
  formula: 'qvB=mv²/r → r=mv/(qB)　穿出条件 r>W，sinθ=W/r，出射点上移 r(1−cosθ)　电场中：x=v cosθ·t，y=v sinθ·t−½(qE/m)t²',
  params: [
    { key: 'v', label: '入射速度 v', min: 3, max: 12, step: 0.5, default: 8, unit: 'm/s' },
    { key: 'B', label: '磁感应强度 B', min: 0.2, max: 1.5, step: 0.1, default: 0.6, unit: 'T' },
    { key: 'E', label: '电场强度 E（竖直向下）', min: 0, max: 8, step: 0.5, default: 3, unit: 'N/C' },
    { key: 'qm', label: '比荷 q/m', min: 0.5, max: 2, step: 0.1, default: 1 },
  ],
  camera: { pos: [-2, 4, 26], target: [-2, 1, 0] },
  init(p, tl, kit) {
    tl.start('Ⅰ 磁场：洛伦兹力提供向心力', '#b06ce6')
    fieldBox(kit, BX0, BX1, YMIN, YMAX, C.B, 0.1)
    bFieldZ(kit, -1, BX0, BX1, YMIN, YMAX, 4, 6)
    label(kit, `Ⅰ 磁场 B=${p.B} T（⊗，宽 W=${BX1 - BX0} m）`, (BX0 + BX1) / 2, YMAX + 1.2, 0, '#b06ce6')
    fieldBox(kit, BX1, EX1, YMIN, YMAX, C.E, 0.08)
    arrowGrid(kit, { x: 0, y: -1, z: 0 }, BX1, EX1, YMIN + 1, YMAX - 1, 4, 3, 2.4, C.E, 1.2)
    label(kit, `Ⅱ 电场 E=${p.E} N/C（↓）`, (BX1 + EX1) / 2, YMAX + 1.2, 0, '#3ecf8e')
    plate(kit, EX1, (YMIN + YMAX) / 2, 0.15, YMAX - YMIN, C.screen, 0.9)
    label(kit, '屏', EX1 + 1, YMAX - 0.5, 0, '#d4af37', 0.8)
    label(kit, '入射点', BX0 - 1.6, Y0, 0, '#8a8aa0', 0.7)
    const m = new Mover(kit, { x: BX0 - 1, y: Y0, z: 0 }, { x: p.v, y: 0, z: 0 })
    return { m, ph: 0, done: false }
  },
  step(s, p, d, t, tl) {
    const x = s.m.pos.x
    const acc = x >= BX0 && x < BX1 ? lorentz(ZERO, { x: 0, y: 0, z: -p.B }, p.qm) : x >= BX1 && x < EX1 ? lorentz({ x: 0, y: -p.E, z: 0 }, ZERO, p.qm) : lorentz(ZERO, ZERO, p.qm)
    s.m.advance(d, acc, t)
    const th = th11(p), P = s.m.pos
    if (s.ph === 0 && P.x >= BX0) { s.ph = 1; tl.switchTo('Ⅰ 磁场：匀速圆周', '#b06ce6', t, `t=${f2(t)}s 进入磁场，r=mv/(qB)=${f2(th.r)} m（W=${BX1 - BX0}：${th.turn ? '转半圆折返' : '可穿出'}）`) }
    if (s.ph === 1) {
      if (P.x >= BX1) { s.ph = 2; s.theta = (Math.atan2(s.m.vel.y, s.m.vel.x) * 180) / Math.PI; s.yExit = P.y; tl.switchTo('Ⅱ 电场：类平抛', '#3ecf8e', t, `t=${f2(t)}s 穿出磁场：θ=${f1(s.theta)}°（理论 arcsin(W/r)=${f1(th.theta)}°），出射点 y=${f2(P.y)}（理论 ${f2(th.yExit)}）`) }
      else if (P.x < BX0 && s.m.vel.x < 0) { s.done = true; tl.switchTo('折返：从入射边飞出', '#8a8aa0', t, `t=${f2(t)}s 半圆后从入射边飞出，y=${f2(P.y)} m（理论 y₀+2r=${f2(th.yExit)}）`); return false }
    }
    if (s.ph === 2 && P.x >= EX1) { s.yScreen = P.y; s.done = true; tl.log(t, `打到屏：y=${f2(P.y)} m（理论 ${f2(th.yScreen)} m）`); return false }
    if (P.y < YMIN - 0.5 || P.y > YMAX + 0.5 || P.x < BX0 - 3) { tl.log(t, `飞出区域（y=${f2(P.y)}）`); return false }
    return true
  },
  sync(s) { s.m.sync() },
  readout(p, s) {
    const th = th11(p)
    return `r=mv/(qB)=${f2(th.r)} m，W=${BX1 - BX0} m → ${th.turn ? `r≤W：磁场内转半圆折返，出射点 y=y₀+2r=${f2(th.yExit)} m` : `穿出：sinθ=W/r → θ=${f1(th.theta)}°，出射点 y=${f2(th.yExit)} m`}
${th.turn ? '' : `电场中类平抛 t=${f2(th.tE)} s → 屏上 y=${f2(th.yScreen)} m`}${s ? `\n当前 x=${f2(s.m.pos.x)}，y=${f2(s.m.pos.y)}，v=${f2(s.m.speed)}（磁场不改变速率）` : ''}`
  },
  solution(p) {
    const th = th11(p)
    return {
      problemType: '组合场（先磁后电）：磁场中圆周 + 电场中类平抛',
      hints: ['磁场里先画圆：找圆心（过入射点作速度的垂线）、定半径 r=mv/(qB)', '能否穿出看 r 与场宽 W 的大小关系', '穿出时的偏转角 = 圆心角，几何关系 sinθ=W/r', '进入电场后按类平抛分解：沿速度方向匀速？不——沿 x 匀速、沿 y 匀变速（E 竖直）'],
      processes: ['过程一：进入磁场做匀速圆周（速率不变）', '过程二：r>W 时穿出（偏角 θ）；r≤W 时转半圆折返', '过程三：电场中类平抛（x 匀速，y 匀减速/加速）', '过程四：打到屏'],
      forces: ['磁场：洛伦兹力 qvB，始终垂直速度，不做功', '电场：电场力 qE 竖直向下（恒力）'],
      laws: ['qvB=mv²/r → r=mv/(qB)', '几何：sinθ=W/r，出射点上移 r(1−cosθ)', '电场：x=v cosθ·t，y=v sinθ·t−½(qE/m)t²'],
      critical: ['临界穿出：r=W（恰好与右边界相切）', 'r 越大偏转越小；B 越强越容易折返', '电场中若 E 足够大，粒子在到屏前可能掉头向下'],
      derivation: ['r=mv/(qB)', th.turn ? 'r≤W：半圆后回到入射边，纵向位移 2r' : 'sinθ=W/r，cosθ=√(1−(W/r)²)；出射点 y=y₀+r(1−cosθ)', '电场中 t=(x_屏−W′)/(v cosθ)；y=y_出+v sinθ·t−½(qE/m)t²'],
      numeric: [`r=${f2(th.r)} m（W=${BX1 - BX0} m）`, th.turn ? `折返：出射 y=${f2(th.yExit)} m` : `θ=${f1(th.theta)}°，出射 y=${f2(th.yExit)} m，电场中 t=${f2(th.tE)} s，屏上 y=${f2(th.yScreen)} m`],
      pitfalls: ['磁场中用动能定理算速度变化（洛伦兹力不做功，速率不变）', '把偏转角当成与 v 成正比', '电场中沿速度方向分解（应沿场的方向与垂直场方向分解）', '忘记出射点已经有纵向位移 r(1−cosθ)'],
      similar: ['先电后磁（加速/偏转后进磁场）', '圆形磁场中的“磁聚焦/磁发散”', '磁场边界为圆的偏转'],
      competition: ['非匀强边界场中的绝热不变量', '磁场 + 电场叠加区域的摆线运动', '多段磁场的往复聚焦'],
    }
  },
}
