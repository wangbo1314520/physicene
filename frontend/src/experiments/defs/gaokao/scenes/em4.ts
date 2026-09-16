/**
 * B11 电磁场景组 4：电磁感应 + 导轨 + 导体棒（场景14）——四种搭法即模型 38 单杆无外力 / 39 单杆恒外力 / 40 双杆 / 41 含容单杆
 */
import * as THREE from 'three'
import type { EMSceneDef } from '../../../engine/emScene'
import { mkMesh, arrowMesh } from '../../../renderers/canvas3d/three-kit'
import { C, f2, f3, arrowGridXZ, bar, label } from './em-kit'

const G = 9.8, ZW = 4, RAIL0 = -10, RAIL1 = 10
const SETUPS = [{ value: 0, label: '模型 38：单杆无外力（v₀ 滑行，接电阻 R）' }, { value: 1, label: '模型 39：单杆恒外力 F（由静止 → 终速）' }, { value: 2, label: '模型 40：双杆（一杆 v₀，另一杆静止 → 共速）' }, { value: 3, label: '模型 41：含容单杆（恒力 F，接电容 C）' }]
interface Rod { x: number; v: number; m: number; mesh: THREE.Mesh; vArrow: THREE.Group; iArrow: THREE.Group }
interface S14 { rods: Rod[]; q: number; Q: number; i: number; done: boolean; fArrow?: THREE.Group; t99?: number }

function th14(p: Record<string, number>) {
  const k = (p.B * p.L) ** 2 / p.R
  return {
    k, tau: p.m / k,
    xFree: p.mu > 0 ? NaN : (p.m * p.v0) / k, qFree: p.mu > 0 ? NaN : (p.B * p.L * (p.m * p.v0) / k) / p.R,
    vTerm: (p.F - p.mu * p.m * G) / k,
    vCommon: (p.m * p.v0) / (p.m + p.m2), Qpair: 0.5 * p.m * p.v0 ** 2 - 0.5 * (p.m + p.m2) * ((p.m * p.v0) / (p.m + p.m2)) ** 2,
    aCap: p.F / (p.m + p.C * (p.B * p.L) ** 2),
  }
}

export const railRod: EMSceneDef<S14> = {
  id: 'gk-rail-rod',
  title: '导轨 + 导体棒（电磁感应 · 安培力 · 动量与能量）',
  desc: '水平光滑（可加 μ）平行导轨间距 L，竖直向下的匀强磁场 B。导体棒切割磁感线产生 E=BLv，回路电流 I=E/R，安培力 F_A=BIL=B²L²v/R 始终阻碍相对运动。四种搭法对应四个高考模型：无外力滑行（动量定理求位移）、恒力拉动（终速）、双杆（动量守恒共速）、含电容（匀加速）。',
  formula: 'E=BLv　I=BLv/R　F_A=B²L²v/R　无外力：x=mv₀R/(B²L²)，q=BLx/R　恒力：v_m=(F−μmg)R/(B²L²)　双杆：v_共=m₁v₁/(m₁+m₂)　含容：a=F/(m+CB²L²)，q=CBLv',
  params: [
    { key: 'setup', label: '搭法 / 模型', min: 0, max: 3, step: 1, default: 0, options: SETUPS },
    { key: 'B', label: '磁感应强度 B（竖直向下）', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'L', label: '导轨间距 L', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
    { key: 'R', label: '回路总电阻 R', min: 0.5, max: 4, step: 0.1, default: 1, unit: 'Ω' },
    { key: 'm', label: '导体棒质量 m', min: 0.5, max: 3, step: 0.1, default: 1, unit: 'kg' },
    { key: 'v0', label: '初速 v₀（模型 38/40）', min: 1, max: 6, step: 0.5, default: 4, unit: 'm/s' },
    { key: 'F', label: '恒外力 F（模型 39/41）', min: 0.5, max: 5, step: 0.5, default: 2, unit: 'N' },
    { key: 'mu', label: '导轨摩擦系数 μ（38/39）', min: 0, max: 0.3, step: 0.05, default: 0 },
    { key: 'C', label: '电容 C（模型 41）', min: 0.5, max: 4, step: 0.5, default: 2, unit: 'F' },
    { key: 'm2', label: '第二根棒质量 m₂（模型 40）', min: 0.5, max: 3, step: 0.1, default: 1, unit: 'kg' },
  ],
  camera: { pos: [0, 11, 17], target: [0, 0, 0] },
  init(p, tl, kit) {
    const names = ['① 切割 → 感应电流 → 安培力阻碍（减速）', '① 恒力加速，安培力随 v 增大', '① 棒 1 切割 → 电流 → 两棒受反向安培力', '① 电容充电：i=CBLa 恒定，匀加速']
    tl.start(names[p.setup], '#b06ce6')
    for (const z of [-ZW / 2, ZW / 2]) bar(kit, { x: RAIL0, y: 0, z }, { x: RAIL1, y: 0, z }, 0.09, 0x8a8aa0)
    arrowGridXZ(kit, { x: 0, y: -1, z: 0 }, RAIL0 + 1.5, RAIL1 - 1, -ZW / 2 + 0.4, ZW / 2 - 0.4, 8, 2, 1.6, C.B, 1.5)
    label(kit, `B=${p.B} T（竖直向下）　L=${p.L} m　R=${p.R} Ω`, 0, 3.2, 0, '#b0b0cc')
    if (p.setup === 0 || p.setup === 1) {
      const res = kit.track(mkMesh(new THREE.BoxGeometry(0.9, 0.45, 1.6), 0xF5C542)); res.position.set(RAIL0 + 0.6, 0.25, 0)
      bar(kit, { x: RAIL0 + 0.6, y: 0, z: -ZW / 2 }, { x: RAIL0 + 0.6, y: 0, z: ZW / 2 }, 0.05, 0xF5C542)
      label(kit, `电阻 R`, RAIL0 + 0.6, 1.2, 0, '#F5C542', 0.7)
    }
    if (p.setup === 3) {
      for (const dz of [-0.35, 0.35]) { const pl = kit.track(mkMesh(new THREE.BoxGeometry(0.12, 1.2, 1.4), 0x4A90D9)); pl.position.set(RAIL0 + 0.6 + dz, 0.5, 0) }
      bar(kit, { x: RAIL0 + 0.6, y: 0, z: -ZW / 2 }, { x: RAIL0 + 0.6, y: 0, z: ZW / 2 }, 0.05, 0x4A90D9)
      label(kit, `电容 C=${p.C} F`, RAIL0 + 0.6, 1.8, 0, '#4A90D9', 0.7)
    }
    const UP = new THREE.Vector3(0, 1, 0)
    const mkRod = (x: number, v: number, m: number, color: number): Rod => {
      const mesh = kit.track(mkMesh(new THREE.BoxGeometry(0.36, 0.36, ZW + 0.5), color, { emissive: 0.25 })); mesh.position.set(x, 0.22, 0)
      // 箭头沿局部 +y 建模，再用四元数指向目标方向：这样 scale.y 才沿箭头轴伸缩
      const vArrow = kit.track(arrowMesh(UP, 1, C.particle, { radius: 0.06 })); vArrow.position.set(x, 0.9, 0); vArrow.quaternion.setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0))
      const iArrow = kit.track(arrowMesh(UP, 1, 0x3ecf8e, { radius: 0.06 })); iArrow.position.set(x, 0.22, 0)
      return { x, v, m, mesh, vArrow, iArrow }
    }
    const rods: Rod[] = p.setup === 2 ? [mkRod(-3, p.v0, p.m, 0xE05555), mkRod(2, 0, p.m2, 0x4A90D9)] : [mkRod(p.setup === 0 ? -6 : -7, p.setup === 0 ? p.v0 : 0, p.m, 0xE05555)]
    let fArrow: THREE.Group | undefined
    if (p.setup === 1 || p.setup === 3) { fArrow = kit.track(arrowMesh(new THREE.Vector3(1, 0, 0), 1.6, 0xE05555, { radius: 0.07 })); label(kit, `F=${p.F} N`, rods[0].x + 2.2, 1.6, 0, '#E05555', 0.7) }
    return { rods, q: 0, Q: 0, i: 0, done: false, fArrow }
  },
  step(s, p, d, t, tl) {
    const th = th14(p), BL = p.B * p.L
    if (p.setup === 0) {
      const r = s.rods[0]
      s.i = (BL * r.v) / p.R
      const a = -(BL * s.i) / r.m - (r.v > 0 ? p.mu * G : 0)
      r.v = Math.max(0, r.v + a * d); r.x += r.v * d
      s.q += s.i * d; s.Q += s.i * s.i * p.R * d
      if (r.v <= (p.mu > 0 ? 1e-4 : 0.004 * p.v0)) {
        tl.switchTo('② 停止', '#8a8aa0', t, `t=${f2(t)}s 停止：x=${f2(r.x + 6)} m${p.mu > 0 ? '' : `（理论 mv₀R/(B²L²)=${f2(th.xFree)}）`}，q=${f3(s.q)} C${p.mu > 0 ? '' : `（理论 BLx/R=${f3(th.qFree)}）`}，Q=${f2(s.Q)} J${p.mu > 0 ? '' : `（=½mv₀²=${f2(0.5 * p.m * p.v0 ** 2)}）`}`)
        return false
      }
      return true
    }
    if (p.setup === 1) {
      const r = s.rods[0]
      s.i = (BL * r.v) / p.R
      const a = (p.F - BL * s.i - p.mu * r.m * G) / r.m
      r.v += a * d; r.x += r.v * d; s.q += s.i * d; s.Q += s.i * s.i * p.R * d
      if (s.t99 === undefined && r.v >= 0.99 * th.vTerm) { s.t99 = t; tl.switchTo('② 接近终速（F=F_A+μmg）', '#3ecf8e', t, `t=${f2(t)}s v=${f2(r.v)} m/s 达终速 99%（v_m=(F−μmg)R/(B²L²)=${f2(th.vTerm)}）；此时 F·v=${f2(p.F * r.v)} W ≈ I²R+μmgv=${f2(s.i * s.i * p.R + p.mu * r.m * G * r.v)} W`) }
      if (r.x >= RAIL1 - 0.6) { tl.log(t, `到达导轨末端：v=${f2(r.v)} m/s，累计 Q=${f2(s.Q)} J`); return false }
      return true
    }
    if (p.setup === 2) {
      const [r1, r2] = s.rods
      s.i = (BL * (r1.v - r2.v)) / p.R
      r1.v += (-(BL * s.i) / r1.m) * d; r2.v += ((BL * s.i) / r2.m) * d
      r1.x += r1.v * d; r2.x += r2.v * d; s.q += Math.abs(s.i) * d; s.Q += s.i * s.i * p.R * d
      if (Math.abs(r1.v - r2.v) <= 0.005 * p.v0) {
        tl.switchTo('② 共速：电流为零，一起匀速', '#3ecf8e', t, `t=${f2(t)}s 共速 v=${f2(r1.v)} m/s（理论 m₁v₀/(m₁+m₂)=${f2(th.vCommon)}），Q=${f2(s.Q)} J（理论 ΔE_k=${f2(th.Qpair)}），动量 ${f2(r1.m * r1.v + r2.m * r2.v)}=${f2(p.m * p.v0)} ✓`)
        return false
      }
      if (r2.x - r1.x < 0.6) { tl.log(t, '两棒相碰（间距不足）'); return false }
      return true
    }
    const r = s.rods[0]
    const a = th.aCap
    s.i = p.C * BL * a
    r.v += a * d; r.x += r.v * d; s.q = p.C * BL * r.v
    if (t >= 2 && t - d < 2) tl.log(t, `t=2 s：v=${f2(r.v)} m/s=a·t（a=F/(m+CB²L²)=${f2(a)} m/s²），q=CBLv=${f3(s.q)} C，i=CBLa=${f3(s.i)} A 恒定`)
    if (r.x >= RAIL1 - 0.6) { tl.log(t, `到达末端：v=${f2(r.v)} m/s（匀加速，非终速）`); return false }
    return true
  },
  sync(s, p) {
    for (const r of s.rods) {
      r.mesh.position.x = r.x
      const vLen = Math.max(0.3, r.v * 0.5)
      r.vArrow.position.x = r.x + vLen / 2; r.vArrow.scale.set(1, vLen, 1); r.vArrow.visible = r.v > 0.02
      const iLen = Math.max(0.3, Math.min(ZW, Math.abs(s.i) * 1.2))
      r.iArrow.visible = Math.abs(s.i) > 0.01
      r.iArrow.position.set(r.x, 0.22, 0)
      // 棒中电流方向：v×B 沿 −z（棒 1 / 单杆）；双杆时另一棒电流反向
      const dirSign = (p.setup === 2 && r === s.rods[1] ? 1 : -1) * Math.sign(s.i || 1)
      r.iArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, dirSign))
      r.iArrow.scale.set(1, iLen, 1)
    }
    if (s.fArrow) { s.fArrow.position.set(s.rods[0].x + 1.0, 0.5, 0) }
  },
  readout(p, s) {
    const th = th14(p)
    const head = p.setup === 0 ? `安培力 F_A=B²L²v/R，动量定理 −B²L²x/R=0−mv₀ → x=mv₀R/(B²L²)=${p.mu > 0 ? '（有摩擦需数值）' : f2(th.xFree) + ' m'}\n电荷量 q=BLx/R=${p.mu > 0 ? '—' : f3(th.qFree) + ' C'}　焦耳热 Q=½mv₀²=${f2(0.5 * p.m * p.v0 ** 2)} J（μ=0）　时间常数 τ=mR/(B²L²)=${f2(th.tau)} s`
      : p.setup === 1 ? `终速 F=B²L²v_m/R+μmg → v_m=(F−μmg)R/(B²L²)=${f2(th.vTerm)} m/s\n稳态：P_F=Fv_m=${f2(p.F * th.vTerm)} W = I²R+μmgv_m`
        : p.setup === 2 ? `双杆系统合外力为零：动量守恒 m₁v₀=(m₁+m₂)v_共 → v_共=${f2(th.vCommon)} m/s\n焦耳热 Q=½m₁v₀²−½(m₁+m₂)v_共²=${f2(th.Qpair)} J　（能量分配：Q/E_k0=m₂/(m₁+m₂)=${f2(p.m2 / (p.m + p.m2))}）`
          : `电容电压 U=BLv，q=CBLv → i=dq/dt=CBLa（恒定）\nF−BiL=ma → a=F/(m+CB²L²)=${f2(th.aCap)} m/s²（无电容时 a=F/m=${f2(p.F / p.m)}）`
    return `${head}${s ? `\n当前 v=${f2(s.rods[0].v)}${s.rods[1] ? `/${f2(s.rods[1].v)}` : ''} m/s，I=${f3(Math.abs(s.i))} A，q=${f3(s.q)} C，Q=${f2(s.Q)} J` : ''}`
  },
  solution(p) {
    const th = th14(p)
    const byS = [
      { type: '单杆无外力：求总位移、通过电荷量、焦耳热', laws: ['E=BLv，I=BLv/R，F_A=B²L²v/R（变力）', '动量定理：−Σ B²L²v/R·Δt = −B²L²x/R = 0−mv₀', '电荷量 q=ΔΦ/R=BLx/R；能量守恒 Q=½mv₀²'], crit: ['v 指数衰减，理论上无穷长时间停下，但位移有限', '有摩擦时能停下，需数值或分段处理'], num: [`x=${f2(th.xFree)} m，q=${f3(th.qFree)} C，Q=${f2(0.5 * p.m * p.v0 ** 2)} J`, `τ=mR/(B²L²)=${f2(th.tau)} s`] },
      { type: '单杆恒外力：求终速与稳态能量转化', laws: ['F−B²L²v/R−μmg=ma', 'a=0 时 v_m=(F−μmg)R/(B²L²)', '稳态 Fv_m=I²R+μmgv_m'], crit: ['终速时安培力与外力（减摩擦）平衡', 'v 先快后慢地趋近 v_m'], num: [`v_m=${f2(th.vTerm)} m/s`, `稳态功率 Fv_m=${f2(p.F * th.vTerm)} W`] },
      { type: '双杆：求共速与焦耳热', laws: ['两杆受等大反向安培力 → 系统动量守恒', 'm₁v₀=(m₁+m₂)v_共', 'Q=½m₁v₀²−½(m₁+m₂)v_共²'], crit: ['共速后电流为零，两棒一起匀速', '若一杆固定则退化为单杆问题'], num: [`v_共=${f2(th.vCommon)} m/s`, `Q=${f2(th.Qpair)} J`] },
      { type: '含容单杆：求加速度与电荷量', laws: ['q=CU=CBLv → i=CBLa', 'F−BiL=ma → a=F/(m+CB²L²)', '匀加速：v=at，q=CBLv'], crit: ['电流恒定（与电阻回路的“终速”不同）', 'C→0 退化为 a=F/m'], num: [`a=${f2(th.aCap)} m/s²`, `i=CBLa=${f3(p.C * p.B * p.L * th.aCap)} A`] },
    ][p.setup]
    return {
      problemType: `导轨导体棒（${SETUPS[p.setup].label}）：${byS.type}`,
      hints: ['先写 E=BLv → I → F_A=B²L²v/R，注意它随 v 变化（变力）', '变力问题优先用动量定理或能量守恒，避免解微分方程', '双杆看系统：安培力是内力，动量守恒', '含电容时电流由 dv/dt 决定，不是由 v 决定'],
      processes: ['过程一：导体棒切割磁感线产生感应电动势', '过程二：回路电流受安培力，改变棒的运动', '过程三：达到终态（停止 / 终速 / 共速 / 持续匀加速）'],
      forces: ['安培力 F_A=BIL，方向阻碍相对运动（楞次定律）', '外力 F（若有）、摩擦 μmg（若有）', '竖直方向重力与支持力平衡'],
      laws: byS.laws,
      critical: byS.crit,
      derivation: ['E=BLv → I=BLv/R → F_A=B²L²v/R', p.setup === 0 ? '动量定理 −B²L²x/R=−mv₀ → x=mv₀R/(B²L²)' : p.setup === 1 ? 'a=0 → F=B²L²v_m/R+μmg' : p.setup === 2 ? 'm₁v₀=(m₁+m₂)v_共' : 'q=CBLv，i=CBLa，F−CB²L²a=ma'],
      numeric: byS.num,
      pitfalls: ['安培力当恒力用匀变速公式', '忘记 q=ΔΦ/R 与位移的关系', '双杆时把安培力当外力', '含容电路误用“终速”结论'],
      similar: ['线框进出磁场', '电磁阻尼', '电磁炮 / 磁悬浮'],
      competition: ['导轨有电阻率随位置变化', '磁场随时间变化叠加感生电动势', '含电感回路的 LR 暂态'],
    }
  },
}
