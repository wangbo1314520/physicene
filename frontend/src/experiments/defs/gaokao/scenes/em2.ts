/**
 * B11 电磁场景组 2（P0 粒子类）：速度选择器（模型32）· 质谱仪（场景13）· 电场→磁场→电场多过程（模型37）
 */
import type { EMSceneDef } from '../../../engine/emScene'
import { C, f1, f2, f3, fieldBox, plate, arrowGrid, bFieldZ, label, Mover, lorentz, ZERO } from './em-kit'

/* ══════════ 模型 32：速度选择器 ══════════ */
const SX0 = -6, SX1 = 6
interface S32 { ms: Mover[]; vs: number[]; out: string[]; ph: number }
export const velocitySelector: EMSceneDef<S32> = {
  id: 'gk-velocity-selector',
  title: '速度选择器（正交电磁场：qE = qvB）',
  desc: '平行板间距 d、电压 U 产生向下的电场 E=U/d，同时加垂直纸面向里的磁场 B。正电荷向右运动：电场力向下 qE、洛伦兹力向上 qvB，只有 v=E/B 的粒子直线通过；v 更大向上偏、更小向下偏，撞极板。可选三粒子对比。',
  formula: 'E = U/d　qE = qvB → v₀ = E/B = U/(Bd)　v>v₀：qvB>qE 向 F_B 侧偏；v<v₀：向 F_E 侧偏',
  params: [
    { key: 'U', label: '极板电压 U', min: 2, max: 40, step: 1, default: 12, unit: 'V' },
    { key: 'd', label: '板间距 d', min: 1, max: 4, step: 0.5, default: 3, unit: 'm' },
    { key: 'B', label: '磁感应强度 B', min: 0.2, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'v', label: '入射速度 v', min: 1, max: 10, step: 0.1, default: 4, unit: 'm/s' },
    { key: 'sign', label: '电荷', min: -1, max: 1, step: 2, default: 1, options: [{ value: 1, label: '正电荷 +q' }, { value: -1, label: '负电荷 −q' }] },
    { key: 'trio', label: '粒子数', min: 0, max: 1, step: 1, default: 1, options: [{ value: 0, label: '单粒子' }, { value: 1, label: '三粒子对比（0.7v / v / 1.3v）' }] },
  ],
  camera: { pos: [0, 4, 22], target: [0, 0, 0] },
  init(p, tl, kit) {
    tl.start('进入正交电磁场', '#F5C542')
    fieldBox(kit, SX0, SX1, -p.d / 2, p.d / 2, C.E, 0.1)
    plate(kit, 0, p.d / 2, SX1 - SX0, 0.12); plate(kit, 0, -p.d / 2, SX1 - SX0, 0.12)
    label(kit, '+ + + + + +', 0, p.d / 2 + 0.5, 0, '#E05555', 0.8); label(kit, '− − − − − −', 0, -p.d / 2 - 0.5, 0, '#4A90D9', 0.8)
    arrowGrid(kit, { x: 0, y: -1, z: 0 }, SX0 + 1, SX1 - 1, -p.d / 2 + 0.3, p.d / 2 - 0.3, 5, 1, p.d * 0.7, C.E, 1.0)
    bFieldZ(kit, -1, SX0 + 0.5, SX1 - 0.5, -p.d / 2 + 0.3, p.d / 2 - 0.3, 6, 2)
    label(kit, `E=U/d=${f2(p.U / p.d)} N/C（↓）　B=${p.B} T（⊗）`, 0, p.d / 2 + 1.6, 0, '#b0b0cc')
    plate(kit, SX0 - 0.6, 0, 0.3, 0.5, C.grey); plate(kit, SX1 + 0.6, 0, 0.3, 0.5, C.grey)
    label(kit, '入口狭缝', SX0 - 0.6, 1.2 + p.d / 2, 0, '#8a8aa0', 0.7); label(kit, '出口狭缝', SX1 + 0.6, 1.2 + p.d / 2, 0, '#8a8aa0', 0.7)
    const vs = p.trio ? [0.7 * p.v, p.v, 1.3 * p.v] : [p.v]
    const colors = p.trio ? [C.p2, C.particle, C.red] : [C.particle]
    const ms = vs.map((v, i) => new Mover(kit, { x: SX0 - 3, y: 0, z: 0 }, { x: v, y: 0, z: 0 }, colors[i], 0.14))
    return { ms, vs, out: vs.map(() => ''), ph: 0 }
  },
  step(s, p, d, t, tl) {
    const v0 = p.U / (p.d * p.B)
    const inField = (x: number) => x >= SX0 && x < SX1
    let anyAlive = false
    s.ms.forEach((m, i) => {
      if (!m.alive) return
      const acc = inField(m.pos.x) ? lorentz({ x: 0, y: -p.U / p.d, z: 0 }, { x: 0, y: 0, z: -p.B }, p.sign) : lorentz(ZERO, ZERO, 1)
      m.advance(d, acc, t)
      const tag = s.vs.length > 1 ? `${['0.7v', 'v', '1.3v'][i]}（${f2(s.vs[i])} m/s）` : `v=${f2(s.vs[i])} m/s`
      if (inField(m.pos.x) && Math.abs(m.pos.y) >= p.d / 2) { m.alive = false; s.out[i] = `${m.pos.y > 0 ? '上' : '下'}极板`; tl.log(t, `粒子 ${tag}：v${s.vs[i] > v0 ? '>' : '<'}E/B=${f2(v0)}，撞${s.out[i]}`) }
      else if (m.pos.x >= SX1 + 0.6 && Math.abs(m.pos.y) < 0.25 && !s.out[i]) { m.alive = false; s.out[i] = '直线通过'; tl.log(t, `粒子 ${tag}：v=E/B=${f2(v0)} 直线通过出口狭缝 ✓`) }
      else if (m.pos.x >= SX1 + 0.6 && !s.out[i]) { m.alive = false; s.out[i] = '偏离出口'; tl.log(t, `粒子 ${tag}：偏离 y=${f2(m.pos.y)} m，未对准出口`) }
      if (m.alive) anyAlive = true
    })
    if (s.ph === 0 && s.ms[0].pos.x >= SX0) { s.ph = 1; tl.switchTo('电场力 vs 洛伦兹力', '#3ecf8e', t, `t=${f2(t)}s 进入场区：qE=${f2(Math.abs(p.U / p.d))}q，qvB=${f2(p.v * p.B)}q`) }
    return anyAlive && t < 20
  },
  sync(s) { s.ms.forEach((m) => m.sync()) },
  readout(p, s) {
    const v0 = p.U / (p.d * p.B)
    return `E=U/d=${f2(p.U / p.d)} N/C　通过速度 v₀=E/B=U/(Bd)=${f2(v0)} m/s
入射 v=${p.v} m/s → ${Math.abs(p.v - v0) < 0.02 * v0 ? '✓ 恰好直线通过' : p.v > v0 ? `qvB>qE，向洛伦兹力一侧偏（${p.sign > 0 ? '上' : '下'}）` : `qE>qvB，向电场力一侧偏（${p.sign > 0 ? '下' : '上'}）`}
${s ? s.out.map((o, i) => `${['粒子 A', '粒子 B', '粒子 C'][i]} ${f2(s.vs[i])} m/s：${o || '运动中'}`).join('　') : ''}`
  },
  solution(p) {
    const v0 = p.U / (p.d * p.B)
    return {
      problemType: '速度选择器：正交电磁场中直线通过的条件与偏转方向判断',
      hints: ['先画两个力：电场力沿 E（正电荷）、洛伦兹力用左手定则', '直线通过 ⇔ 两力等大反向（不是“合力为零就静止”）', 'E=U/d 把电压换成场强', '换成负电荷时两个力同时反向，通过条件不变'],
      processes: ['过程一：粒子从入口狭缝进入正交场区', '过程二：v=E/B 直线通过；v≠E/B 被偏转撞板'],
      forces: ['电场力 F_E=qE=qU/d（正电荷沿 E，负电荷反向）', '洛伦兹力 F_B=qvB（左手定则，负电荷反向）', '重力忽略'],
      laws: ['平衡：qE=qvB → v₀=E/B', '不平衡时合力垂直速度分量导致偏转（一般为摆线的一段）'],
      critical: ['恰好通过：v=E/B=U/(Bd)', 'v>E/B：洛伦兹力占优，向 F_B 方向偏', 'v<E/B：电场力占优，向 F_E 方向偏', '选择速度与电荷量、质量、正负都无关'],
      derivation: ['E=U/d', 'qE=qvB → v₀=E/B=U/(Bd)'],
      numeric: [`E=${f2(p.U / p.d)} N/C，v₀=${f2(v0)} m/s`, `当前 v=${p.v} m/s：${Math.abs(p.v - v0) < 0.02 * v0 ? '直线通过' : p.v > v0 ? '向洛伦兹力侧偏' : '向电场力侧偏'}`, `qvB/qE = ${f2((p.v * p.B * p.d) / p.U)}（=1 通过）`],
      pitfalls: ['以为负电荷不能通过（两力同时反向，仍可通过）', '误把 v=E/B 当成与质量有关', '洛伦兹力方向用右手定则', '把速度选择器当加速装置'],
      similar: ['质谱仪前级', '磁流体发电机（稳态 qE=qvB 建立电动势）', '霍尔效应（载流子受力平衡）'],
      competition: ['偏转粒子的摆线轨迹方程', '场强非均匀时的选择带宽', '相对论速度下的修正'],
    }
  },
}

/* ══════════ 场景 13：质谱仪（加速 → 半圆 → 底片，双同位素） ══════════ */
const AX0 = -12, AX1 = -8, BX = -6
interface S13 { ms: Mover[]; land: number[]; ph: number }
function th13(p: Record<string, number>) {
  const r = (m: number) => Math.sqrt((2 * m * p.U) / p.q) / p.B
  return { r1: r(p.m1), r2: r(p.m2), dx: 2 * (r(p.m2) - r(p.m1)), v1: Math.sqrt((2 * p.q * p.U) / p.m1), v2: Math.sqrt((2 * p.q * p.U) / p.m2) }
}
export const massSpectrometer: EMSceneDef<S13> = {
  id: 'gk-mass-spectrometer',
  title: '质谱仪（加速电场 → 匀强磁场半圆 → 照相底片）',
  desc: '两种同位素离子（同 q，质量 m₁<m₂）由静止经同一电压 U 加速，从狭缝垂直射入匀强磁场，各自转半圆后打到底片：r=√(2mU/q)/B，落点距狭缝 2r，两条谱线间距 Δx=2(r₂−r₁) 即质量分辨。',
  formula: 'qU=½mv²　qvB=mv²/r → r=mv/(qB)=√(2mU/q)/B　落点 x=2r　Δx=(2/B)√(2U/q)(√m₂−√m₁)',
  params: [
    { key: 'U', label: '加速电压 U', min: 4, max: 30, step: 1, default: 10, unit: 'V' },
    { key: 'B', label: '磁感应强度 B', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'q', label: '电荷量 q', min: 0.5, max: 2, step: 0.5, default: 1 },
    { key: 'm1', label: '同位素 1 质量 m₁', min: 0.5, max: 2, step: 0.1, default: 1 },
    { key: 'm2', label: '同位素 2 质量 m₂', min: 0.6, max: 3, step: 0.1, default: 1.3 },
  ],
  camera: { pos: [-1, 6, 24], target: [-2, 4, 0] },
  init(p, tl, kit) {
    tl.start('Ⅰ 加速电场（同 U，不同 m → 不同 v）', '#3ecf8e')
    fieldBox(kit, AX0, AX1, -1.5, 1.5, C.E)
    plate(kit, AX0, 0, 0.15, 3.2); plate(kit, AX1, 0, 0.15, 3.2)
    arrowGrid(kit, { x: 1, y: 0, z: 0 }, AX0, AX1, -0.8, 0.8, 1, 2, 3.4, C.E)
    label(kit, `加速 U=${p.U} V`, (AX0 + AX1) / 2, 2.4, 0, '#3ecf8e')
    plate(kit, BX, 0, 0.2, 1.0, C.grey); label(kit, '狭缝 S', BX, -1.4, 0, '#8a8aa0', 0.7)
    const th = th13(p), H = Math.max(6, 2 * th.r2 + 2)
    fieldBox(kit, BX, BX + Math.max(6, th.r2 + 2), -1, H, C.B, 0.08)
    bFieldZ(kit, -1, BX + 0.8, BX + Math.max(6, th.r2 + 2) - 0.5, 0.5, H - 0.5, 5, Math.max(3, Math.round(H / 2.5)))
    label(kit, `匀强磁场 B=${p.B} T（⊗）`, BX + 4, H + 1, 0, '#b06ce6')
    plate(kit, BX - 0.15, H / 2 + 0.6, 0.15, H - 1.2, C.screen, 0.9); label(kit, '照相底片', BX - 1.6, H, 0, '#d4af37', 0.8)
    for (let y = 2; y < H; y += 2) label(kit, `${y}`, BX - 0.9, y, 0, '#565675', 0.55)
    const ms = [new Mover(kit, { x: AX0 + 0.001, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 }, C.particle), new Mover(kit, { x: AX0 + 0.001, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 }, C.p2)]
    return { ms, land: [NaN, NaN], ph: 0 }
  },
  step(s, p, d, t, tl) {
    const mass = [p.m1, p.m2]
    let alive = false
    s.ms.forEach((m, i) => {
      if (!m.alive) return
      const x = m.pos.x
      const acc = x < AX1 ? lorentz({ x: p.U / (AX1 - AX0), y: 0, z: 0 }, ZERO, p.q / mass[i]) : x >= BX ? lorentz(ZERO, { x: 0, y: 0, z: -p.B }, p.q / mass[i]) : lorentz(ZERO, ZERO, 1)
      m.advance(d, acc, t)
      if (m.pos.x < BX && m.vel.x < 0 && m.pos.y > 0.5) { m.alive = false; s.land[i] = m.pos.y; tl.log(t, `同位素 ${i + 1}（m=${mass[i]}）打到底片：x=${f2(m.pos.y)} m（理论 2r=${f2(2 * (i ? th13(p).r2 : th13(p).r1))}）`) }
      if (m.alive) alive = true
    })
    if (s.ph === 0 && s.ms[0].pos.x >= BX) { s.ph = 1; tl.switchTo('Ⅱ 磁场：半圆 r=mv/(qB)', '#b06ce6', t, `t=${f2(t)}s 轻离子先到狭缝 v₁=${f2(s.ms[0].speed)} m/s（理论 ${f2(th13(p).v1)}）`) }
    if (s.ph === 1 && !s.ms[1].alive && !s.ms[0].alive) { tl.log(t, `谱线间距 Δx=${f2(Math.abs(s.land[1] - s.land[0]))} m（理论 ${f2(th13(p).dx)}）`); return false }
    return alive && t < 30
  },
  sync(s) { s.ms.forEach((m) => m.sync()) },
  readout(p, s) {
    const th = th13(p)
    return `v₁=√(2qU/m₁)=${f2(th.v1)}，v₂=${f2(th.v2)} m/s（重的慢）
r₁=√(2m₁U/q)/B=${f2(th.r1)} m，r₂=${f2(th.r2)} m → 落点 2r₁=${f2(2 * th.r1)}，2r₂=${f2(2 * th.r2)} m
质量分辨 Δx=2(r₂−r₁)=${f2(th.dx)} m（B 越小、U 越大间距越大）${s && Number.isFinite(s.land[0]) ? `\n实测落点 ${f2(s.land[0])}${Number.isFinite(s.land[1]) ? ` / ${f2(s.land[1])}` : ''} m` : ''}`
  },
  solution(p) {
    const th = th13(p)
    return {
      problemType: '质谱仪：加速 + 磁场半圆，求落点位置与同位素谱线间距',
      hints: ['同一电压加速：动能相同，速度不同（重的慢）', '磁场中半径 r=mv/(qB)，把 v 用 U 换掉', '落点距狭缝是直径 2r，不是半径', '间距 Δx=2(r₂−r₁) 正比于 √m 之差'],
      processes: ['过程一：静止 → 电压 U 加速到 v', '过程二：从狭缝垂直进入磁场做匀速圆周', '过程三：半圆后打到底片（同一平面）'],
      forces: ['加速段：电场力做功 qU', '磁场段：洛伦兹力 qvB 提供向心力'],
      laws: ['动能定理：qU=½mv²', '向心力：qvB=mv²/r', '周期 T=2πm/(qB)，半圆用时 πm/(qB)'],
      critical: ['r∝√m：质量大的半径大', '分辨条件：Δx 大于底片分辨极限', '底片长度要 ≥ 2r_max'],
      derivation: ['v=√(2qU/m)', 'r=mv/(qB)=√(2mU/q)/B', 'x=2r=(2/B)√(2mU/q)', 'Δx=(2/B)√(2U/q)(√m₂−√m₁)'],
      numeric: [`r₁=${f2(th.r1)} m，r₂=${f2(th.r2)} m`, `落点 ${f2(2 * th.r1)} m 与 ${f2(2 * th.r2)} m`, `Δx=${f2(th.dx)} m；m₂/m₁=${f2(p.m2 / p.m1)} → r₂/r₁=√(m₂/m₁)=${f3(Math.sqrt(p.m2 / p.m1))}`],
      pitfalls: ['把落点当 r（应为 2r）', '以为同电压加速后速度相同', 'Δx 与 m 成正比（实为与 √m 成正比）', '忘记不同质量的半圆用时也不同'],
      similar: ['速度选择器 + 磁场的质谱仪（场景 9）', '回旋加速器', '磁聚焦'],
      competition: ['初速度有一定角度分布时的聚焦（180° 聚焦）', '相对论修正', '双聚焦质谱仪'],
    }
  },
}

/* ══════════ 模型 37：电场 → 磁场 → 电场（往复多过程） ══════════ */
const EX0 = -9, EX1 = -3
interface S37 { m: Mover; ph: 'acc' | 'circ' | 'dec'; cycle: number; done: boolean }
function th37(p: Record<string, number>) {
  const v = Math.sqrt(2 * p.qm * p.U), r = v / (p.qm * p.B), L = EX1 - EX0
  const tAcc = (2 * L) / v, tHalf = Math.PI / (p.qm * p.B)
  return { v, r, tAcc, tHalf, cycleT: 2 * tAcc + tHalf }
}
export const eBEMulti: EMSceneDef<S37> = {
  id: 'gk-e-b-e-multi',
  title: '电场 → 磁场 → 电场（加速 · 半圆 · 减速 · 再加速）',
  desc: '粒子在电场区（宽 L，E 沿 +x）由静止加速到 v，进入右侧磁场转半圆（r=mv/qB）后反向回到电场区，被同一电场减速到零、再反向加速……每个周期上移 2r，形成阶梯式往复。',
  formula: 'qU=½mv²　r=mv/(qB)　每周期：加速 2L/v + 半圆 πm/(qB) + 减速 2L/v，纵向上移 2r',
  params: [
    { key: 'U', label: '电场区电压 U', min: 2, max: 20, step: 1, default: 8, unit: 'V' },
    { key: 'B', label: '磁感应强度 B', min: 0.5, max: 3, step: 0.1, default: 1.5, unit: 'T' },
    { key: 'qm', label: '比荷 q/m', min: 0.5, max: 2, step: 0.1, default: 1 },
    { key: 'cycles', label: '演示周期数', min: 1, max: 4, step: 1, default: 3 },
  ],
  camera: { pos: [-2, 6, 26], target: [-3, 5, 0] },
  timeScale: 2,
  init(p, tl, kit) {
    tl.start('① 加速（+x）', '#3ecf8e')
    const th = th37(p), H = 2 * th.r * p.cycles + 3
    fieldBox(kit, EX0, EX1, -1.5, H, C.E, 0.1)
    plate(kit, EX0, H / 2 - 0.75, 0.15, H + 1.5); plate(kit, EX1, H / 2 - 0.75, 0.15, H + 1.5, C.plate, 0.35)
    arrowGrid(kit, { x: 1, y: 0, z: 0 }, EX0, EX1, 0, H - 1, 1, Math.max(3, Math.round(H / 2)), 4.5, C.E)
    label(kit, `电场区 U=${p.U} V（E 沿 +x）`, (EX0 + EX1) / 2, H + 1, 0, '#3ecf8e')
    fieldBox(kit, EX1, EX1 + 2 * th.r + 2, -1.5, H, C.B, 0.08)
    bFieldZ(kit, -1, EX1 + 0.6, EX1 + 2 * th.r + 1.5, 0, H - 1, Math.max(2, Math.round(th.r)), Math.max(3, Math.round(H / 2)))
    label(kit, `磁场区 B=${p.B} T（⊗）`, EX1 + th.r + 1, H + 1, 0, '#b06ce6')
    const m = new Mover(kit, { x: EX0 + 0.001, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 })
    return { m, ph: 'acc', cycle: 1, done: false }
  },
  step(s, p, d, t, tl) {
    const x = s.m.pos.x
    const acc = x >= EX0 && x < EX1 ? lorentz({ x: p.U / (EX1 - EX0), y: 0, z: 0 }, ZERO, p.qm) : x >= EX1 ? lorentz(ZERO, { x: 0, y: 0, z: -p.B }, p.qm) : lorentz(ZERO, ZERO, 1)
    s.m.advance(d, acc, t)
    const th = th37(p)
    if (s.ph === 'acc' && s.m.pos.x >= EX1) { s.ph = 'circ'; tl.switchTo(`② 半圆（第 ${s.cycle} 周期）`, '#b06ce6', t, `t=${f2(t)}s 进入磁场 v=${f2(s.m.speed)} m/s（理论 ${f2(th.v)}），r=${f2(th.r)} m`) }
    else if (s.ph === 'circ' && s.m.pos.x < EX1 && s.m.vel.x < 0) { s.ph = 'dec'; tl.switchTo('③ 减速（逆 E 运动）', '#F5C542', t, `t=${f2(t)}s 回到电场区，y=${f2(s.m.pos.y)} m（上移 2r=${f2(2 * th.r)}）`) }
    else if (s.ph === 'dec' && s.m.vel.x >= 0) {
      s.m.vel.x = 0.01
      if (s.cycle >= p.cycles) { s.done = true; tl.log(t, `第 ${s.cycle} 周期结束：速度减为零，位置 y=${f2(s.m.pos.y)} m；周期 T=${f2(th.cycleT)} s（理论）`); return false }
      s.cycle++; s.ph = 'acc'; tl.switchTo(`① 再加速（第 ${s.cycle} 周期）`, '#3ecf8e', t, `t=${f2(t)}s 速度减为零，再次被加速`)
    }
    if (s.m.pos.x < EX0 - 0.05) { s.m.pos.x = EX0 + 0.001; s.m.vel.x = Math.abs(s.m.vel.x) }
    return t < 60
  },
  sync(s) { s.m.sync() },
  readout(p, s) {
    const th = th37(p)
    return `v=√(2qU/m)=${f2(th.v)} m/s　r=mv/(qB)=${f2(th.r)} m　每周期上移 2r=${f2(2 * th.r)} m
周期 T=2L/v+πm/(qB)+2L/v=${f2(th.tAcc)}+${f2(th.tHalf)}+${f2(th.tAcc)}=${f2(th.cycleT)} s${s ? `\n当前第 ${s.cycle} 周期，阶段 ${s.ph === 'acc' ? '加速' : s.ph === 'circ' ? '半圆' : '减速'}，v=${f2(s.m.speed)}，y=${f2(s.m.pos.y)} m` : ''}`
  },
  solution(p) {
    const th = th37(p)
    return {
      problemType: '电场—磁场—电场往复多过程：分段规律 + 周期性 + 位置累积',
      hints: ['把一个周期拆成“加速—半圆—减速”三段，每段各用一个规律', '磁场半圆不改变速率，只把速度反向并上移 2r', '减速段与加速段完全对称（同一电场、同一距离）', '第 n 个周期结束时的位置 = n·2r'],
      processes: ['过程一：电场中由静止加速（动能定理）', '过程二：磁场中半圆（洛伦兹力向心）', '过程三：反向进入电场减速到零', '过程四：再被加速，进入下一周期（位置上移 2r）'],
      forces: ['电场区：qE 沿 +x（恒力）', '磁场区：qvB 垂直速度（不做功）'],
      laws: ['qU=½mv²（加速 / 减速对称）', 'r=mv/(qB)，半圆用时 πm/(qB)', '匀变速：加速用时 t=2L/v'],
      critical: ['半圆后能否回到电场：磁场区宽度需 ≥ r', '减速到零的位置恰在左极板处（能量对称）', '若磁场区上方有边界，第 n 周期上移 2nr 后可能飞出'],
      derivation: ['v=√(2qU/m)', 'r=√(2mU/q)/B', 'T₁=2L/v，T₂=πm/(qB)，T=2T₁+T₂', 'y_n=2nr'],
      numeric: [`v=${f2(th.v)} m/s，r=${f2(th.r)} m`, `T=${f2(th.cycleT)} s（加速 ${f2(th.tAcc)}，半圆 ${f2(th.tHalf)}）`, `${p.cycles} 个周期后 y=${f2(2 * th.r * p.cycles)} m`],
      pitfalls: ['半圆用时写成 2πm/(qB)', '减速段忘记与加速段对称、重复算功', '每周期上移写成 r', '磁场里用电场力公式'],
      similar: ['回旋加速器（每次穿越都加速）', '磁约束 / 磁镜', '往复电场中的振荡'],
      competition: ['电场随时间交变时的同步条件', '相对论质量增大导致的失谐', '三维螺旋往复'],
    }
  },
}
