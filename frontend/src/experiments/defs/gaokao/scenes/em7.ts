/**
 * B11 电磁场景组 7：磁场与磁场组合（模型36）· 线框进出磁场（模型42）· 导体棒 + 斜面 + 磁场（模型44）
 */
import * as THREE from 'three'
import type { EMSceneDef, EMKit } from '../../../engine/emScene'
import { mkMesh, arrowMesh, GrowingTrail } from '../../../renderers/canvas3d/three-kit'
import { C, f1, f2, f3, fieldBox, bFieldZ, label, Mover, lorentz, ZERO, bar, arrowGridXZ } from './em-kit'

const G = 9.8

/* ══════════ 模型 36：磁场与磁场组合 ══════════ */
const SETUPS36 = [{ value: 0, label: '两区反向磁场（S 形 / 蛇形）' }, { value: 1, label: '两区同向不等磁场（半径突变）' }, { value: 2, label: '圆形磁场磁聚焦（r=R，一点发散 → 平行射出）' }]
interface S36 { ms: Mover[]; ph: number[]; done: boolean }
export const bbCombo: EMSceneDef<S36> = {
  id: 'gk-b-b-combo',
  title: '磁场与磁场组合（反向 S 形 · 半径突变 · 磁聚焦）',
  desc: '①左右两区磁场方向相反：粒子在两区分别做半径相同、旋向相反的圆周，轨迹呈 S/蛇形；②同向但大小不同：过边界瞬间速率不变、半径按 r=mv/(qB) 突变；③圆形磁场且 r=R：从边界一点以任意方向射入的粒子都平行射出（磁聚焦），反之平行入射会聚于一点。',
  formula: 'r=mv/(qB)　过边界速率不变、半径按 B 反比突变　磁聚焦条件 r=R（轨迹圆与场区圆等半径 → 四边形为菱形）',
  params: [
    { key: 'setup', label: '组合方式', min: 0, max: 2, step: 1, default: 2, options: SETUPS36 },
    { key: 'v', label: '速率 v', min: 2, max: 10, step: 0.5, default: 6, unit: 'm/s' },
    { key: 'B1', label: '区域Ⅰ B₁', min: 0.5, max: 3, step: 0.1, default: 1.5, unit: 'T' },
    { key: 'B2', label: '区域Ⅱ B₂', min: 0.5, max: 3, step: 0.1, default: 1.0, unit: 'T' },
    { key: 'qm', label: '比荷 q/m', min: 0.5, max: 2, step: 0.1, default: 1 },
  ],
  camera: { pos: [0, 3, 24], target: [0, 0, 0] },
  init(p, tl, kit) {
    const ms: Mover[] = []
    if (p.setup <= 1) {
      tl.start('区域Ⅰ：r₁=mv/(qB₁)', '#b06ce6')
      const r1 = p.v / (p.qm * p.B1)
      fieldBox(kit, -10, 0, -8, 8, C.B, 0.08); fieldBox(kit, 0, 10, -8, 8, C.B, p.setup === 0 ? 0.14 : 0.05)
      bFieldZ(kit, -1, -9.5, -0.5, -7, 7, 4, 6); bFieldZ(kit, p.setup === 0 ? 1 : -1, 0.5, 9.5, -7, 7, 4, 6)
      label(kit, `Ⅰ B₁=${p.B1} T（⊗）`, -5, 8.8, 0, '#b06ce6'); label(kit, `Ⅱ B₂=${p.B2} T（${p.setup === 0 ? '⊙' : '⊗'}）`, 5, 8.8, 0, '#b06ce6')
      const y0 = Math.min(6, r1)
      ms.push(new Mover(kit, { x: -10.5, y: -y0, z: 0 }, { x: p.v, y: 0, z: 0 }))
    } else {
      tl.start('圆形磁场：r=R 磁聚焦', '#b06ce6')
      const R = p.v / (p.qm * p.B1)
      const disc = kit.track(mkMesh(new THREE.CircleGeometry(R, 64), 0xb06ce6, { opacity: 0.14, basic: true, side: THREE.DoubleSide })); (disc.material as THREE.Material).depthWrite = false; disc.position.set(0, 0, -0.2)
      bFieldZ(kit, -1, -R + 0.6, R - 0.6, -R + 0.6, R - 0.6, Math.max(2, Math.round(R)), Math.max(2, Math.round(R)))
      label(kit, `圆形磁场 R=${f2(R)} m=r（B=${p.B1} T ⊗）`, 0, R + 1.2, 0, '#b06ce6')
      label(kit, '同一点 P 发散射入', -R - 1.8, 0, 0, '#F5C542', 0.8)
      const colors = [0xF5C542, 0x3ecf8e, 0x4A90D9, 0xE05555, 0xb0b0cc]
      for (let k = 0; k < 5; k++) { const ang = ((k - 2) * 22 * Math.PI) / 180; ms.push(new Mover(kit, { x: -R, y: 0, z: 0 }, { x: p.v * Math.cos(ang), y: p.v * Math.sin(ang), z: 0 }, colors[k], 0.12)) }
    }
    return { ms, ph: ms.map(() => 0), done: false }
  },
  step(s, p, d, t, tl) {
    let alive = false
    s.ms.forEach((m, i) => {
      if (!m.alive) return
      let B = 0
      if (p.setup <= 1) B = m.pos.x < 0 ? -p.B1 : m.pos.x < 10 ? (p.setup === 0 ? p.B2 : -p.B2) : 0
      else B = Math.hypot(m.pos.x, m.pos.y) < p.v / (p.qm * p.B1) + 1e-6 ? -p.B1 : 0
      m.advance(d, lorentz(ZERO, { x: 0, y: 0, z: B }, p.qm), t)
      if (p.setup <= 1) {
        if (s.ph[i] === 0 && m.pos.x >= 0) { s.ph[i] = 1; tl.switchTo(`区域Ⅱ：r₂=mv/(qB₂)`, '#F5C542', t, `t=${f2(t)}s 过边界：速率 ${f2(m.speed)} 不变，r₁=${f2(p.v / (p.qm * p.B1))} → r₂=${f2(p.v / (p.qm * p.B2))} m，旋向${p.setup === 0 ? '反转（S 形）' : '相同'}`) }
        if (m.pos.x >= 10 || Math.abs(m.pos.y) > 8.5 || (m.pos.x < -10.5 && m.vel.x < 0)) { m.alive = false; tl.log(t, `飞出：(${f1(m.pos.x)}, ${f1(m.pos.y)})，方向 ${f1((Math.atan2(m.vel.y, m.vel.x) * 180) / Math.PI)}°`) }
      } else {
        const R = p.v / (p.qm * p.B1)
        if (s.ph[i] === 0 && Math.hypot(m.pos.x, m.pos.y) >= R + 0.02 && t > 0.05) { s.ph[i] = 1; tl.log(t, `粒子 ${i + 1} 射出磁场：速度方向 ${f1((Math.atan2(m.vel.y, m.vel.x) * 180) / Math.PI)}°（都平行于 +y，磁聚焦 ✓）`) }
        if (Math.abs(m.pos.y) > R + 4 || Math.abs(m.pos.x) > R + 4) m.alive = false
      }
      if (m.alive) alive = true
    })
    return alive && t < 15
  },
  sync(s) { s.ms.forEach((m) => m.sync()) },
  readout(p) {
    const r1 = p.v / (p.qm * p.B1), r2 = p.v / (p.qm * p.B2)
    if (p.setup === 2) return `圆形磁场半径 R=${f2(r1)} m 恰等于轨迹半径 r=mv/(qB)：从边界一点 P 以任意方向射入 → 均沿垂直于 OP 的方向平行射出\n（几何：O、P、圆心 C、出射点 Q 构成菱形）`
    return `r₁=mv/(qB₁)=${f2(r1)} m　r₂=mv/(qB₂)=${f2(r2)} m（r₂/r₁=B₁/B₂=${f2(p.B1 / p.B2)}）\n过边界：洛伦兹力不做功 → 速率不变；${p.setup === 0 ? '磁场反向 → 偏转方向反转，两段圆弧在边界处相切' : '同向 → 继续同旋向，半径突变'}\n周期 T₁=2πm/(qB₁)=${f2((2 * Math.PI) / (p.qm * p.B1))} s，T₂=${f2((2 * Math.PI) / (p.qm * p.B2))} s`
  },
  solution(p) {
    const r1 = p.v / (p.qm * p.B1), r2 = p.v / (p.qm * p.B2)
    return {
      problemType: `磁场组合（${SETUPS36[p.setup].label}）：分段画圆、边界处衔接`,
      hints: ['每个区域单独画圆：找圆心（过边界点作速度垂线）、定半径', '边界处速度连续（大小方向都不变），只是圆心跳到速度另一侧（反向场）或半径改变', '磁聚焦的判据只有一个：r=R', '用几何（菱形/等腰）求圆心角与出射方向'],
      processes: ['区域Ⅰ：圆周 r₁', '边界：速度不变，进入区域Ⅱ', '区域Ⅱ：圆周 r₂（旋向/半径变化）'],
      forces: ['各区域：洛伦兹力 qvB 提供向心力，方向由左手定则'],
      laws: ['r=mv/(qB)，T=2πm/(qB)', '洛伦兹力不做功：速率守恒', '磁聚焦几何：入射点 P、出射点 Q、两圆心构成菱形'],
      critical: ['反向场：两段弧在边界相切、旋向相反', '同向不等：半径与 B 成反比', 'r=R：一点发散 ↔ 平行射出'],
      derivation: ['r₁=mv/(qB₁)，r₂=mv/(qB₂)', '出射方向由各段圆心角决定；圆心角 θ=ωt=qBt/m', '磁聚焦：四边形 OPCQ 四边等长 → 出射速度 ⊥ OP'],
      numeric: [`r₁=${f2(r1)} m，r₂=${f2(r2)} m`, `T₁=${f2((2 * Math.PI) / (p.qm * p.B1))} s，T₂=${f2((2 * Math.PI) / (p.qm * p.B2))} s`],
      pitfalls: ['过边界后仍用原圆心', '认为过边界速度大小会变', '磁聚焦条件写成 r=2R', '旋向判断忘记电荷正负'],
      similar: ['回旋加速器', '磁谱仪的 180° 聚焦', '带电粒子在环形磁场中的运动'],
      competition: ['非均匀磁场的绝热不变量与磁镜', '托卡马克磁约束', '磁透镜'],
    }
  },
}

/* ══════════ 模型 42：线框进出磁场 ══════════ */
interface S42 { grp: THREE.Group; x: number; v: number; ph: number; i: number; q: number; Q: number; trail: GrowingTrail; lastT: number; done: boolean }
export const frameThroughB: EMSceneDef<S42> = {
  id: 'gk-frame-through-b',
  title: '线框进出磁场（三阶段 · 只有一边切割 · i–t 图）',
  desc: '矩形线框（宽 L、长 a、质量 m、电阻 R）以 v₀ 滑向宽 d≥a 的匀强磁场区。进入阶段只有前边切割：i=BLv/R、安培力 B²L²v/R 减速；完全在场内时磁通量不变、无电流、匀速；穿出阶段后边切割再次减速。每次进/出通过电荷量 q=BLa/R 与速度无关。',
  formula: '进入/穿出：i=BLv/R，F=B²L²v/R；动量定理 Δv=−B²L²a/(mR)　完全在内：ΔΦ=0，i=0　q=ΔΦ/R=BLa/R',
  params: [
    { key: 'mode', label: '外力', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '无外力（减速—匀速—再减速）' }, { value: 1, label: '恒外力维持匀速（i 为方波脉冲）' }] },
    { key: 'v0', label: '初速 v₀', min: 2, max: 8, step: 0.5, default: 4, unit: 'm/s' },
    { key: 'B', label: '磁感应强度 B', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'L', label: '线框宽 L（切割边）', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
    { key: 'a', label: '线框长 a', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
    { key: 'd', label: '磁场区宽 d', min: 1, max: 4, step: 0.5, default: 2.5, unit: 'm' },
    { key: 'm', label: '质量 m', min: 0.5, max: 3, step: 0.1, default: 1, unit: 'kg' },
    { key: 'R', label: '电阻 R', min: 0.5, max: 4, step: 0.1, default: 1, unit: 'Ω' },
  ],
  camera: { pos: [0, 4, 20], target: [0, 0.5, 0] },
  init(p, tl, kit) {
    tl.start('① 场外匀速接近', '#8a8aa0')
    const X0 = -1.25 * 2, X1 = X0 + p.d * 2
    fieldBox(kit, X0, X1, -3, 3, C.B, 0.12); bFieldZ(kit, -1, X0 + 0.5, X1 - 0.5, -2.4, 2.4, Math.max(2, Math.round(p.d * 2)), 3)
    label(kit, `B=${p.B} T（⊗），场区宽 d=${p.d} m`, (X0 + X1) / 2, 3.8, 0, '#b06ce6')
    bar(kit, { x: -12, y: -3.2, z: 0 }, { x: 12, y: -3.2, z: 0 }, 0.05, 0x3a3a5e)
    const grp = kit.track(new THREE.Group())
    const w2 = p.L, h2 = p.a
    const pts: [THREE.Vector3, THREE.Vector3][] = [[new THREE.Vector3(-h2, -w2, 0), new THREE.Vector3(h2, -w2, 0)], [new THREE.Vector3(h2, -w2, 0), new THREE.Vector3(h2, w2, 0)], [new THREE.Vector3(h2, w2, 0), new THREE.Vector3(-h2, w2, 0)], [new THREE.Vector3(-h2, w2, 0), new THREE.Vector3(-h2, -w2, 0)]]
    pts.forEach(([a, b], k) => { const Lb = a.distanceTo(b); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, Lb, 10), new THREE.MeshStandardMaterial({ color: k === 1 ? 0xE05555 : k === 3 ? 0x4A90D9 : 0xd9a05a })); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); grp.add(m) })
    label(kit, '前边（红）先切割，后边（蓝）后切割；比例尺 1 m = 2 单位', 0, -4.4, 0, '#8a8aa0', 0.8)
    const board = kit.track(mkMesh(new THREE.PlaneGeometry(10, 3.2), 0x1d1d33, { basic: true, opacity: 0.9 })); board.position.set(0, -6.6, -2)
    bar(kit, { x: -4.8, y: -6.6, z: -1.9 }, { x: 4.8, y: -6.6, z: -1.9 }, 0.02, 0x565675)
    label(kit, 'i–t（进入：脉冲；场内：0；穿出：反向脉冲）', 0, -8.5, -1.9, '#8a8aa0', 0.6)
    const trail = new GrowingTrail(0x3ecf8e, 3000); kit.track(trail.line)
    return { grp, x: -8, v: p.v0, ph: 0, i: 0, q: 0, Q: 0, trail, lastT: -1, done: false }
  },
  step(s, p, d, t, tl) {
    const X0 = -2.5, X1 = X0 + p.d * 2
    const front = s.x + p.a, back = s.x - p.a           // 场景单位（1 m = 2 单位）
    const cutting = (front > X0 && front < X1) !== (back > X0 && back < X1)
    const sign = front > X0 && front < X1 ? 1 : -1
    const BL = p.B * p.L
    s.i = cutting ? (sign * BL * s.v) / p.R : 0
    const F = cutting ? -(BL * BL * s.v) / p.R : 0
    if (p.mode === 0) s.v = Math.max(0, s.v + (F / p.m) * d)
    s.x += s.v * 2 * d
    s.q += Math.abs(s.i) * d; s.Q += s.i * s.i * p.R * d
    const Δv = (BL * BL * p.a) / (p.m * p.R)
    if (s.ph === 0 && front >= X0) { s.ph = 1; tl.switchTo('② 进入：前边切割，i=BLv/R，减速', '#E05555', t, `t=${f2(t)}s 前边入场 v=${f2(s.v)}；预计进入结束 v=${f2(Math.max(0, p.v0 - Δv))}（Δv=B²L²a/mR=${f2(Δv)}）`) }
    if (s.ph === 1 && back >= X0) { s.ph = 2; tl.switchTo('③ 完全在场内：ΔΦ=0，i=0，匀速', '#3ecf8e', t, `t=${f2(t)}s 完全进入：v=${f2(s.v)} m/s，q=${f3(s.q)} C（理论 BLa/R=${f3((BL * p.a) / p.R)}），Q=${f2(s.Q)} J`) ; if (p.mode === 0 && s.v < 1e-3) { tl.log(t, '速度减为零，停在场内'); return false } }
    if (s.ph === 2 && front >= X1) { s.ph = 3; tl.switchTo('④ 穿出：后边切割，电流反向，减速', '#4A90D9', t, `t=${f2(t)}s 前边出场，开始穿出`) }
    if (s.ph === 3 && back >= X1) { s.ph = 4; tl.switchTo('⑤ 完全穿出：匀速', '#8a8aa0', t, `t=${f2(t)}s 完全穿出：v=${f2(s.v)} m/s，总电荷量 ${f3(s.q)} C，总焦耳热 Q=${f2(s.Q)} J`) }
    if (s.ph === 4 && s.x > 10) return false
    if (p.mode === 0 && s.v <= 1e-4) { tl.log(t, `停在场区边界内（v=0）`); return false }
    return t < 20
  },
  sync(s, _p, t) {
    s.grp.position.set(s.x, 0, 0)
    if (t - s.lastT >= 0.02) { s.lastT = t; s.trail.push({ x: -4.8 + Math.min(9.6, t * 1.2), y: -6.6 + s.i * 0.35, z: -1.9 }) }
  },
  readout(p, s) {
    const BL = p.B * p.L, Δv = (BL * BL * p.a) / (p.m * p.R)
    return `进入阶段：i=BLv/R，动量定理 −B²L²a/R=mΔv → Δv=${f2(Δv)} m/s → 进入结束 v₁=${f2(Math.max(0, p.v0 - Δv))}，穿出结束 v₂=${f2(Math.max(0, p.v0 - 2 * Δv))} m/s
每次进/出 q=BLa/R=${f3((BL * p.a) / p.R)} C（与速度无关）；场内 ΔΦ=0 无电流${s ? `\n当前 v=${f2(s.v)} m/s，i=${f3(s.i)} A，Q=${f2(s.Q)} J` : ''}`
  },
  solution(p) {
    const BL = p.B * p.L, Δv = (BL * BL * p.a) / (p.m * p.R)
    return {
      problemType: '线框进出磁场：分阶段判断电流、安培力，求速度变化、电荷量与焦耳热',
      hints: ['只有正在切割磁感线的边有电动势；完全在匀强场内时磁通量不变', '进入与穿出电流方向相反（楞次定律：都阻碍相对运动）', '变力减速用动量定理：−B²L²x/R=mΔv', '电荷量 q=ΔΦ/R 与快慢无关'],
      processes: ['场外匀速 → 进入（前边切割，减速）→ 完全在内（匀速）→ 穿出（后边切割，减速）→ 场外匀速'],
      forces: ['切割边受安培力 BiL，方向阻碍运动', '非切割阶段不受安培力'],
      laws: ['e=BLv，i=e/R，F=BiL=B²L²v/R', '动量定理：−B²L²a/R=mΔv（每次进/出）', 'q=ΔΦ/R=BLa/R；Q=能量损失'],
      critical: ['d≥a 才有完全在内的匀速阶段', '若 v₀ 太小，进入过程中就停下（v₀<Δv）', '匀速拉动时 i 为方波，外力功全部变为焦耳热'],
      derivation: ['i=BLv/R', 'Δv=B²L²a/(mR)（进入）', 'Q=½mv₀²−½mv₁²（进入阶段）'],
      numeric: [`Δv=${f2(Δv)} m/s，v₁=${f2(Math.max(0, p.v0 - Δv))}，v₂=${f2(Math.max(0, p.v0 - 2 * Δv))} m/s`, `q=${f3((BL * p.a) / p.R)} C`, `进入阶段 Q=${f2(0.5 * p.m * (p.v0 ** 2 - Math.max(0, p.v0 - Δv) ** 2))} J`],
      pitfalls: ['认为完全在场内也有电流', '穿出电流方向与进入相同（错，反向）', '用 v 算 q（q 只与位移有关）', '安培力当恒力用匀变速公式'],
      similar: ['导轨导体棒', '电磁阻尼摆', '线圈进出磁场的 i–t 图像题'],
      competition: ['非匀强场中的线框', '线框进入时的电磁感应与自感耦合', '涡流制动'],
    }
  },
}

/* ══════════ 模型 44：导体棒 + 斜面 + 磁场 ══════════ */
interface S44 { rod: THREE.Mesh; vArrow: THREE.Group; x: number; v: number; i: number; Q: number; t99?: number }
export const rodInclineB: EMSceneDef<S44> = {
  id: 'gk-rod-incline-b',
  title: '导体棒 + 倾斜导轨 + 磁场（终速 · 能量转化）',
  desc: '倾角 θ 的光滑导轨，顶端接电阻 R，磁场 B 垂直斜面向上（或竖直向上）。导体棒由静止释放：mg sinθ 加速，切割产生电流，安培力 B²L²v/R（竖直 B 时为 B²L²v cos²θ/R 沿斜面分量）随 v 增大直到与重力分量平衡 → 终速；稳态重力功率 = 焦耳热功率。',
  formula: 'B⊥斜面：mg sinθ−B²L²v/R=ma → v_m=mgR sinθ/(B²L²)　B 竖直：v_m=mgR sinθ/(B²L²cos²θ)　稳态 mg v_m sinθ=I²R',
  params: [
    { key: 'bdir', label: 'B 的方向', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '垂直斜面向上' }, { value: 1, label: '竖直向上' }] },
    { key: 'th', label: '倾角 θ', min: 10, max: 60, step: 5, default: 30, unit: '°' },
    { key: 'B', label: '磁感应强度 B', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'L', label: '导轨间距 L', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
    { key: 'R', label: '电阻 R', min: 0.5, max: 4, step: 0.1, default: 1, unit: 'Ω' },
    { key: 'm', label: '棒质量 m', min: 0.2, max: 2, step: 0.1, default: 1, unit: 'kg' },
  ],
  camera: { pos: [4, 6, 24], target: [3, -1.5, 0] },
  init(p, tl, kit) {
    tl.start('① 释放：mg sinθ 加速，安培力随 v 增大', '#F5C542')
    const th = (p.th * Math.PI) / 180
    const grp = kit.track(new THREE.Group()); grp.rotation.z = -th
    const gk: EMKit = { scene: kit.scene, track: (o) => { grp.add(o); return o } }
    for (const z of [-2, 2]) bar(gk, { x: -9, y: 0, z }, { x: 15, y: 0, z }, 0.09, 0x8a8aa0)
    const res = gk.track(mkMesh(new THREE.BoxGeometry(0.8, 0.4, 1.4), 0xF5C542)); res.position.set(-8.6, 0.2, 0)
    bar(gk, { x: -8.6, y: 0, z: -2 }, { x: -8.6, y: 0, z: 2 }, 0.05, 0xF5C542)
    label(gk, `R=${p.R} Ω`, -8.6, 1.2, 0, '#F5C542', 0.7)
    if (p.bdir === 0) arrowGridXZ(gk, { x: 0, y: 1, z: 0 }, -7, 14, -1.5, 1.5, 10, 2, 1.6, C.B, 1.4)
    const rod = gk.track(mkMesh(new THREE.BoxGeometry(0.36, 0.36, 4.5), 0xE05555, { emissive: 0.25 })); rod.position.set(-7, 0.22, 0)
    const vArrow = gk.track(arrowMesh(new THREE.Vector3(0, 1, 0), 1, C.particle, { radius: 0.06 })); vArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)); vArrow.position.set(-7, 0.9, 0)
    if (p.bdir === 1) { for (let i = 0; i < 10; i++) { const a = kit.track(arrowMesh(new THREE.Vector3(0, 1, 0), 1.6, C.B, { opacity: 0.55, radius: 0.035 })); const xr = -6 + i * 2; a.position.set(xr * Math.cos(th), -xr * Math.sin(th) + 1.4, 0.8) } }
    label(kit, `θ=${p.th}°　B=${p.B} T（${p.bdir === 0 ? '⊥ 斜面' : '竖直'}）　L=${p.L} m`, 0, 4.2, 0, '#b0b0cc')
    const g = kit.track(arrowMesh(new THREE.Vector3(0, -1, 0), 1.2, 0xE05555, { radius: 0.05 })); g.position.set(-9.5, -2.5, 0); label(kit, 'g', -9.5, -3.4, 0, '#E05555', 0.6)
    return { rod, vArrow, x: -7, v: 0, i: 0, Q: 0 }
  },
  step(s, p, d, t, tl) {
    const th = (p.th * Math.PI) / 180, c = p.bdir === 0 ? 1 : Math.cos(th)
    const BLe = p.B * p.L * c
    s.i = (BLe * s.v) / p.R
    const a = G * Math.sin(th) - (BLe * BLe * s.v) / (p.m * p.R)
    s.v += a * d; s.x += s.v * d; s.Q += s.i * s.i * p.R * d
    const vm = (p.m * G * p.R * Math.sin(th)) / (BLe * BLe)
    if (s.t99 === undefined && s.v >= 0.99 * vm) { s.t99 = t; tl.switchTo('② 终速：mg sinθ = 安培力沿斜面分量', '#3ecf8e', t, `t=${f2(t)}s 达终速 99%：v_m=${f2(vm)} m/s；稳态 mg·v_m·sinθ=${f2(p.m * G * vm * Math.sin(th))} W = I²R=${f2(((BLe * vm) / p.R) ** 2 * p.R)} W`) }
    if (s.x >= 14.5) { tl.log(t, `到达导轨末端：v=${f2(s.v)} m/s，累计 Q=${f2(s.Q)} J`); return false }
    return t < 30
  },
  sync(s) {
    s.rod.position.x = s.x
    const len = Math.max(0.3, s.v * 0.4)
    s.vArrow.position.x = s.x + len / 2; s.vArrow.scale.set(1, len, 1); s.vArrow.visible = s.v > 0.02
  },
  readout(p, s) {
    const th = (p.th * Math.PI) / 180, c = p.bdir === 0 ? 1 : Math.cos(th), BLe = p.B * p.L * c
    const vm = (p.m * G * p.R * Math.sin(th)) / (BLe * BLe)
    return `${p.bdir === 0 ? 'B⊥斜面：有效切割 BL' : 'B 竖直：有效切割 BL cosθ，安培力水平、沿斜面分量再乘 cosθ'}
v_m=mgR sinθ/(B²L²${p.bdir === 1 ? 'cos²θ' : ''})=${f2(vm)} m/s　稳态 P_重=mg v_m sinθ=${f2(p.m * G * vm * Math.sin(th))} W = I²R${s ? `\n当前 v=${f2(s.v)} m/s，I=${f3(s.i)} A，Q=${f2(s.Q)} J` : ''}`
  },
  solution(p) {
    const th = (p.th * Math.PI) / 180, c = p.bdir === 0 ? 1 : Math.cos(th), BLe = p.B * p.L * c
    const vm = (p.m * G * p.R * Math.sin(th)) / (BLe * BLe)
    return {
      problemType: '斜面导轨导体棒：求终速、稳态能量转化率，B 方向不同时的有效切割',
      hints: ['沿斜面列牛顿第二定律：mg sinθ − F_A∥ = ma', 'B 垂直斜面时最简单；B 竖直时只有垂直斜面的分量 B cosθ 切割，安培力水平还要再投影', '终速时 a=0', '稳态：重力功率全部变成焦耳热功率'],
      processes: ['释放：加速度 g sinθ', '加速：安培力随 v 线性增大', '终速：合力为零，匀速下滑'],
      forces: ['重力 mg（沿斜面分量 mg sinθ）', '支持力', '安培力 BIL（B⊥斜面时沿斜面向上；B 竖直时水平）'],
      laws: ['e=B_⊥Lv，I=e/R，F=BIL', 'mg sinθ−F_A∥=ma', '稳态 mg v_m sinθ=I²R'],
      critical: ['终速 v_m 与 R 成正比、与 B²L² 成反比', 'B 竖直时 v_m 多一个 1/cos²θ', '若导轨有摩擦：mg sinθ−μmg cosθ 代替 mg sinθ'],
      derivation: ['a=0：mg sinθ=B_⊥L·(B_⊥Lv_m/R)·(投影因子)', p.bdir === 0 ? 'v_m=mgR sinθ/(B²L²)' : 'v_m=mgR sinθ/(B²L²cos²θ)'],
      numeric: [`v_m=${f2(vm)} m/s`, `稳态 I=${f3((BLe * vm) / p.R)} A，P=${f2(p.m * G * vm * Math.sin(th))} W`],
      pitfalls: ['B 竖直时仍用 BLv 算电动势', '安培力方向沿斜面（B 竖直时是水平的）', '终速时认为速度为零', '忘记稳态时重力功率=焦耳热功率'],
      similar: ['水平导轨恒力拉动（模型 39）', '电磁阻尼下落', '磁悬浮列车制动'],
      competition: ['含自感回路的暂态', '两根棒在斜面上的相互作用', '变磁场斜面导轨'],
    }
  },
}
