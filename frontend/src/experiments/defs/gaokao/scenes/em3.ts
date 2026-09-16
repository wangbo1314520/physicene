/**
 * B11 电磁场景组 3：带电粒子在复合场中（场景16，重力+电场+磁场）· 回旋加速器（场景12）
 */
import * as THREE from 'three'
import type { EMSceneDef } from '../../../engine/emScene'
import { mkMesh } from '../../../renderers/canvas3d/three-kit'
import type { AccelFn } from '../../../renderers/canvas3d/FieldEngine'
import { C, f1, f2, f3, fieldBox, arrowGrid, bFieldZ, label, Mover, lorentz, ZERO } from './em-kit'

const G = 9.8

/* ══════════ 场景 16：复合场（重力 + 电场 + 磁场） ══════════ */
const SETUPS16 = [{ value: 0, label: '三力平衡 → 匀速直线' }, { value: 1, label: 'qE=mg → 匀速圆周' }, { value: 2, label: '重力+磁场 → 摆线' }, { value: 3, label: '自定义 E、B、v' }]
interface S16 { m: Mover; ang: number; laps: number; yMin: number; done: boolean; lastVx: number }
function E16(p: Record<string, number>): number {
  if (p.setup === 0) return Math.max(0, G / p.qm - p.v * p.B)   // qE + qvB = mg
  if (p.setup === 1) return G / p.qm                           // qE = mg
  if (p.setup === 2) return 0
  return p.E
}
export const compositeField: EMSceneDef<S16> = {
  id: 'gk-composite-field',
  title: '带电粒子在复合场中（重力 · 电场 · 磁场）',
  desc: '正电荷（m=1 kg，比荷 q/m 可调）在竖直向上的电场 E、垂直纸面向里的磁场 B 和重力中运动。三种经典情形：①qE+qvB=mg 三力平衡做匀速直线；②qE=mg 重力被抵消，只剩洛伦兹力 → 匀速圆周 r=mv/(qB)；③无电场，重力+洛伦兹力 → 摆线（平均漂移 v_d=mg/(qB)）。',
  formula: '①qE+qvB=mg　②qE=mg，r=mv/(qB)，T=2πm/(qB)　③摆线：漂移速度 v_d=mg/(qB)，最低点深度 2mg/(q²B²/m)=2g/(qB/m)²',
  params: [
    { key: 'setup', label: '情形', min: 0, max: 3, step: 1, default: 1, options: SETUPS16 },
    { key: 'v', label: '初速度 v（沿 +x）', min: 0, max: 8, step: 0.5, default: 4, unit: 'm/s' },
    { key: 'B', label: '磁感应强度 B（⊗）', min: 0.5, max: 3, step: 0.1, default: 2, unit: 'T' },
    { key: 'E', label: '电场 E（仅自定义）', min: 0, max: 20, step: 0.5, default: 6, unit: 'N/C' },
    { key: 'qm', label: '比荷 q/m', min: 0.5, max: 2, step: 0.1, default: 1 },
  ],
  camera: { pos: [0, 2, 24], target: [0, 0, 0] },
  init(p, tl, kit) {
    const names = ['三力平衡：合力为零', 'qE=mg：只剩洛伦兹力', '重力 + 洛伦兹力：摆线', '自定义复合场']
    tl.start(names[p.setup], ['#3ecf8e', '#b06ce6', '#F5C542', '#4A90D9'][p.setup])
    const E = E16(p)
    fieldBox(kit, -11, 11, -7, 7, C.B, 0.06)
    bFieldZ(kit, -1, -10, 10, -6, 6, 7, 5)
    if (E > 0) arrowGrid(kit, { x: 0, y: 1, z: 0 }, -10, 10, -5.5, 5.5, 6, 3, 2, C.E, 1.2)
    label(kit, `B=${p.B} T（⊗）　E=${f2(E)} N/C（↑）　g=9.8 m/s²（↓）　q/m=${p.qm}`, 0, 8, 0, '#b0b0cc')
    const gArrow = kit.track(mkMesh(new THREE.ConeGeometry(0.25, 0.8, 8), 0xE05555, { basic: true }))
    gArrow.position.set(-10.2, -7.6, 0); gArrow.rotation.z = Math.PI
    label(kit, 'g', -10.2, -8.4, 0, '#E05555', 0.7)
    const m = new Mover(kit, { x: p.setup === 1 ? -3 : -9, y: p.setup === 1 ? -p.v / (p.qm * p.B) : 0, z: 0 }, { x: p.setup === 2 ? 0 : p.v, y: 0, z: 0 })
    return { m, ang: 0, laps: 0, yMin: 0, done: false, lastVx: p.v }
  },
  step(s, p, d, t, tl) {
    const E = E16(p)
    const acc: AccelFn = (_q, v) => ({ x: p.qm * (v.y * -p.B), y: p.qm * (E - v.x * -p.B) - G, z: 0 })
    const prev = { ...s.m.pos }, vPrev = { ...s.m.vel }
    s.m.advance(d, acc, t)
    const P = s.m.pos, V = s.m.vel
    if (p.setup === 1) {
      const dAng = Math.atan2(V.y, V.x) - Math.atan2(vPrev.y, vPrev.x)
      s.ang += Math.abs(dAng) > Math.PI ? 0 : dAng
      if (s.ang >= 2 * Math.PI * (s.laps + 1) - 1e-3) { s.laps++; tl.log(t, `完成第 ${s.laps} 周：T=${f2(t / s.laps)} s（理论 2πm/(qB)=${f2((2 * Math.PI) / (p.qm * p.B))}），r=${f2(p.v / (p.qm * p.B))} m`); if (s.laps >= 2) return false }
    }
    if (p.setup === 2) {
      if (P.y < s.yMin) s.yMin = P.y
      if (vPrev.y < 0 && V.y >= 0) tl.log(t, `摆线最低点 y=${f2(P.y)} m（理论 −2g/(qB/m)²=${f2(-2 * G / (p.qm * p.B) ** 2)}）`)
      if (prev.y < 0 && P.y >= -1e-3 && V.y > 0 && t > 0.2) tl.log(t, `回到初始高度 x=${f2(P.x + 9)} m：一拱周长=2πv_d/ω=${f2(2 * Math.PI * G / (p.qm * p.B) ** 2)} m`)
    }
    if (p.setup === 0 && t > 2 && t - d <= 2) tl.log(t, `t=2 s：y=${f2(P.y)} m，速度 ${f2(s.m.speed)} m/s 不变 → 合力为零，匀速直线 ✓`)
    if (Math.abs(P.x) > 11 || P.y < -7 || P.y > 7) { tl.log(t, `飞出场区（x=${f2(P.x)}，y=${f2(P.y)}）`); return false }
    return t < 15
  },
  sync(s) { s.m.sync() },
  readout(p, s) {
    const E = E16(p)
    const head = p.setup === 0 ? `平衡条件 qE+qvB=mg → E=(g−vB·q/m)/(q/m)=${f2(E)} N/C（自动设定）`
      : p.setup === 1 ? `qE=mg → E=${f2(E)} N/C；r=mv/(qB)=${f2(p.v / (p.qm * p.B))} m，T=2πm/(qB)=${f2((2 * Math.PI) / (p.qm * p.B))} s（与 v 无关）`
        : p.setup === 2 ? `E=0：由静止出发的摆线，漂移速度 v_d=g/(qB/m)=${f2(G / (p.qm * p.B))} m/s，最低点深度 ${f2(2 * G / (p.qm * p.B) ** 2)} m`
          : `自定义：qE=${f2(p.qm * E)}，mg=9.8，qvB=${f2(p.qm * p.v * p.B)}（单位质量）`
    return `${head}${s ? `\n当前 x=${f2(s.m.pos.x)}，y=${f2(s.m.pos.y)}，v=${f2(s.m.speed)} m/s` : ''}`
  },
  solution(p) {
    const E = E16(p)
    return {
      problemType: `复合场（${SETUPS16[p.setup].label}）：重力、电场力、洛伦兹力共同作用下的运动类型判断`,
      hints: ['先列出三个力：mg（恒力）、qE（恒力）、qvB（随速度变、不做功）', '两个恒力若抵消，只剩洛伦兹力 → 匀速圆周', '三力平衡且速度不变 → 匀速直线（速度选择器的“重力版”）', '恒力不抵消时是摆线：可分解为匀速漂移 + 匀速圆周'],
      processes: ['判断恒力合力 F₀=mg−qE 是否为零', 'F₀=0：匀速圆周；F₀≠0 但与 qvB 平衡：匀速直线；否则摆线'],
      forces: ['重力 mg 竖直向下', '电场力 qE 竖直向上（正电荷）', '洛伦兹力 qvB 垂直速度'],
      laws: ['匀速直线：qE+qvB=mg', '匀速圆周：qE=mg，qvB=mv²/r', '摆线：漂移速度 v_d=(mg−qE)/(qB)，圆周部分 ω=qB/m'],
      critical: ['圆周条件对速度大小无要求，但 r 与 v 成正比', '直线条件对速度有唯一要求 v=(mg−qE)/(qB)', '摆线最低点速度 2v_d、最高点速度 0（由静止出发时）'],
      derivation: ['qE=mg → E=mg/q', 'qvB=mv²/r → r=mv/(qB)，T=2πm/(qB)', '摆线：把 v 分解为 v_d（使 qv_dB=mg−qE）+ 圆周速度 v−v_d'],
      numeric: [`E=${f2(E)} N/C，qE=${f2(p.qm * E)} N/kg`, p.setup === 1 ? `r=${f2(p.v / (p.qm * p.B))} m，T=${f2((2 * Math.PI) / (p.qm * p.B))} s` : p.setup === 2 ? `v_d=${f2(G / (p.qm * p.B))} m/s，深度 ${f2(2 * G / (p.qm * p.B) ** 2)} m` : `qvB=${f2(p.qm * p.v * p.B)} N/kg`],
      pitfalls: ['忘记重力（复合场题中不能忽略）', '把洛伦兹力当恒力列平衡', '认为圆周运动的 T 与 v 有关', '摆线当抛物线'],
      similar: ['速度选择器（无重力版）', '磁场中的带电小球（重力+洛伦兹力）', '霍尔效应'],
      competition: ['E×B 漂移与磁镜', '带电粒子在重力+磁场中的摆线参数方程', '非匀强场中的绝热不变量'],
    }
  },
}

/* ══════════ 场景 12：回旋加速器 ══════════ */
const GAPD = 0.6
interface S12 { m: Mover; N: number; lastSide: number; done: boolean; ek: number; full: boolean }
export const cyclotron: EMSceneDef<S12> = {
  id: 'gk-cyclotron',
  title: '回旋加速器（D 形盒 · 同步交变电场 · 引出能量）',
  desc: '两个 D 形盒置于垂直磁场中，盒间窄缝加与回旋周期同步的交变电压 U。粒子每穿越缝隙一次获能 qU，半径随 v 增大（r=mv/qB），周期 T=2πm/(qB) 与速度无关（同步的物理基础）。到达盒边缘 R 时引出：E_k,max=q²B²R²/(2m)，与 U 无关；U 只决定穿越次数 N=E_k,max/(qU)。',
  formula: 'T=2πm/(qB)（与 v 无关）　每次穿越 ΔE_k=qU　r_max=R → v_max=qBR/m　E_k,max=q²B²R²/(2m)　N=E_k,max/(qU)',
  params: [
    { key: 'U', label: '缝隙电压 U', min: 1, max: 5, step: 0.5, default: 2, unit: 'V' },
    { key: 'B', label: '磁感应强度 B', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'R', label: 'D 形盒半径 R', min: 4, max: 8, step: 0.5, default: 6, unit: 'm' },
    { key: 'qm', label: '比荷 q/m', min: 0.5, max: 2, step: 0.1, default: 1 },
  ],
  camera: { pos: [0, 4, 26], target: [0, 0, 0] },
  timeScale: 6,
  init(p, tl, kit) {
    tl.start('回旋加速：每次穿越缝隙 +qU', '#b06ce6')
    for (const side of [1, -1]) {
      const dee = kit.track(mkMesh(new THREE.CircleGeometry(p.R, 64, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), 0xb06ce6, { opacity: 0.16, basic: true, side: THREE.DoubleSide }))
      ;(dee.material as THREE.Material).depthWrite = false
      dee.position.set((side * GAPD) / 2, 0, -0.3)
      const rim = kit.track(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, i) => { const a = (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (i / 64) * Math.PI; return new THREE.Vector3((side * GAPD) / 2 + p.R * Math.cos(a), p.R * Math.sin(a), 0) })), new THREE.LineBasicMaterial({ color: 0xb06ce6 })))
      void rim
    }
    bFieldZ(kit, -1, -p.R + 1, p.R - 1, -p.R + 1, p.R - 1, 5, 5)
    arrowGrid(kit, { x: 1, y: 0, z: 0 }, -GAPD / 2, GAPD / 2, -p.R + 1, p.R - 1, 1, 6, 1.0, C.E, 0.4, 0.8)
    label(kit, `D₁`, -p.R / 2, p.R + 0.9, 0, '#b06ce6'); label(kit, `D₂`, p.R / 2, p.R + 0.9, 0, '#b06ce6')
    label(kit, `缝隙 U=${p.U} V（与 T=2πm/qB 同步交变）`, 0, -p.R - 1.2, 0, '#3ecf8e')
    label(kit, `B=${p.B} T（⊗）　R=${p.R} m`, 0, p.R + 2, 0, '#b0b0cc')
    // 各半圆圆心稳定在出发线上方 ≈0.75·r₁ 处：把出发点下移同样距离，使轨道圆心对准盒心（真实机器 r₁≪R 可忽略）
    const r1 = Math.sqrt(2 * p.qm * p.U) / (p.qm * p.B)
    const m = new Mover(kit, { x: -GAPD / 2, y: -0.75 * r1, z: 0 }, { x: 0.05, y: 0, z: 0 }, C.particle, 0.14, 60000)
    return { m, N: 0, lastSide: -1, done: false, ek: 0, full: false }
  },
  step(s, p, d, t, tl) {
    const inGap = Math.abs(s.m.pos.x) < GAPD / 2 && Math.abs(s.m.pos.y) < p.R
    const Ex = inGap && !s.full ? (p.U / GAPD) * Math.sign(s.m.vel.x || 1) : 0
    s.m.advance(d, lorentz({ x: Ex, y: 0, z: 0 }, { x: 0, y: 0, z: -p.B }, p.qm), t)
    const ekTh = 0.5 * (p.qm * p.B * p.R) ** 2
    const side = Math.sign(s.m.pos.x) || s.lastSide
    if (side !== s.lastSide && Math.abs(s.m.pos.x) >= GAPD / 2) {
      s.N++; s.lastSide = side
      s.ek = 0.5 * s.m.speed ** 2
      if (s.N <= 3 || s.N % 5 === 0) tl.log(t, `第 ${s.N} 次穿越：E_k=${f2(s.ek)} J/kg（理论 N·qU/m=${f2(s.N * p.qm * p.U)}），r=${f2(s.m.speed / (p.qm * p.B))} m`)
      if (!s.full && s.ek >= ekTh * (1 - 1e-3)) { s.full = true; tl.switchTo('r=R：最后半圈 → 引出', '#F5C542', t, `t=${f2(t)}s 第 ${s.N} 次穿越后 r=mv/(qB)=${f2(s.m.speed / (p.qm * p.B))} m 达到 R，停止加速`) }
    }
    const rr = Math.hypot(s.m.pos.x - (Math.sign(s.m.pos.x) * GAPD) / 2, s.m.pos.y)
    if ((s.full && rr >= p.R - 0.05) || rr >= p.R + 0.6) {
      s.done = true; s.ek = 0.5 * s.m.speed ** 2
      tl.log(t, `t=${f2(t)}s 引出：E_k=${f2(s.ek)} J/kg（理论 q²B²R²/2m=${f2(ekTh)}），穿越 ${s.N} 次（理论 N=E_k/qU=${f1(ekTh / (p.qm * p.U))}），用时≈N·T/2=${f2((s.N * Math.PI) / (p.qm * p.B))} s`)
      return false
    }
    return t < 400
  },
  sync(s) { s.m.sync() },
  readout(p, s) {
    const vmax = p.qm * p.B * p.R, ek = 0.5 * vmax * vmax, T = (2 * Math.PI) / (p.qm * p.B), N = ek / (p.qm * p.U)
    return `T=2πm/(qB)=${f2(T)} s（与速度无关 → 交变电压频率 f=1/T=${f3(1 / T)} Hz）
v_max=qBR/m=${f2(vmax)} m/s　E_k,max=q²B²R²/(2m)=${f2(ek)} J/kg（与 U 无关）
穿越次数 N=E_k,max/(qU)=${f1(N)}，总时间≈N·T/2=${f2((N * T) / 2)} s${s ? `\n已穿越 ${s.N} 次，当前 E_k=${f2(0.5 * s.m.speed ** 2)}，r=${f2(s.m.speed / (p.qm * p.B))} m` : ''}`
  },
  solution(p) {
    const vmax = p.qm * p.B * p.R, ek = 0.5 * vmax * vmax, T = (2 * Math.PI) / (p.qm * p.B)
    return {
      problemType: '回旋加速器：最大动能、穿越次数、加速时间与交变电压频率',
      hints: ['磁场里的周期 T=2πm/(qB) 不含 v——这是“同步”能成立的原因', '每次穿越缝隙动能增加 qU，与缝隙宽度无关', '最大半径受 D 形盒半径限制：r_max=R 决定 v_max', '最大动能只与 B、R、q、m 有关，与 U 无关；U 只影响圈数'],
      processes: ['过程一：缝隙中被电场加速（每次 +qU）', '过程二：D 形盒内匀速圆周半周（无电场）', '过程三：半径逐次增大直到 r=R 被引出'],
      forces: ['缝隙：电场力 qE=qU/d（方向随交变电压翻转，与粒子运动同步）', 'D 形盒内：洛伦兹力 qvB 提供向心力'],
      laws: ['qvB=mv²/r → r=mv/(qB)，T=2πm/(qB)', '动能定理：每穿越一次 ΔE_k=qU', '引出条件：r_max=R'],
      critical: ['同步条件：交变电压周期 = 回旋周期 T', 'v_max=qBR/m，E_k,max=q²B²R²/(2m)', '相对论：v 接近 c 时 m 增大、T 变长而失谐（回旋加速器上限）'],
      derivation: ['r=mv/(qB)，令 r=R → v_max=qBR/m', 'E_k,max=½mv_max²=q²B²R²/(2m)', 'N=E_k,max/(qU)，t≈N·T/2=πm N/(qB)'],
      numeric: [`T=${f2(T)} s，f=${f3(1 / T)} Hz`, `v_max=${f2(vmax)} m/s，E_k,max=${f2(ek)} J/kg`, `N=${f1(ek / (p.qm * p.U))} 次，t≈${f2((ek / (p.qm * p.U)) * T / 2)} s`],
      pitfalls: ['以为增大 U 能提高最大动能（只减少圈数）', '把 T 写成与 v 有关', '穿越次数与圈数混淆（一圈穿越两次）', '忽略缝隙中的运动时间会带来的相位误差（高考忽略）'],
      similar: ['质谱仪', '同步加速器', '磁约束'],
      competition: ['相对论修正与同步回旋加速器', '缝隙有限宽度对同步的影响', '螺旋轨迹的精确方程'],
    }
  },
}
