/**
 * B11 电磁场景组 5（3D 电路实验台）：伏安法测电阻（模型49）· 电表改装（模型48）
 * 台面 y=0，x 向右、z 向前（靠近相机）；电流用沿导线流动的小球表示，电表用旋转指针表示
 */
import * as THREE from 'three'
import type { EMSceneDef, EMKit } from '../../../engine/emScene'
import { mkMesh } from '../../../renderers/canvas3d/three-kit'
import type { Vec3 } from '../../../renderers/canvas3d/FieldEngine'
import { f2, f3, bar, label } from './em-kit'

/* ── 实验台元件 ── */
function gauge(kit: EMKit, x: number, z: number, text: string, color: number) {
  const body = kit.track(mkMesh(new THREE.CylinderGeometry(1, 1, 0.25, 32), 0x2a2a44)); body.position.set(x, 0.12, z)
  const face = kit.track(mkMesh(new THREE.CylinderGeometry(0.92, 0.92, 0.05, 32), 0xe8e8f0)); face.position.set(x, 0.26, z)
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 3 + (i / 10) * (2 * Math.PI / 3); const tick = kit.track(mkMesh(new THREE.BoxGeometry(0.04, 0.02, i % 5 === 0 ? 0.18 : 0.1), 0x23233a)); tick.position.set(x + Math.sin(a) * 0.78, 0.3, z - Math.cos(a) * 0.78); tick.rotation.y = -a }
  const pivot = kit.track(new THREE.Group()); pivot.position.set(x, 0.32, z)
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.85), new THREE.MeshBasicMaterial({ color })); needle.position.z = -0.42; pivot.add(needle)
  label(kit, text, x, 1.4, z, `#${color.toString(16).padStart(6, '0')}`, 0.8)
  return { set(frac: number) { pivot.rotation.y = -(Math.min(1.08, Math.max(-0.08, frac)) - 0.5) * (2 * Math.PI / 3) } }
}
function box(kit: EMKit, x: number, z: number, sx: number, sz: number, color: number, text?: string, sy = 0.5) {
  const m = kit.track(mkMesh(new THREE.BoxGeometry(sx, sy, sz), color)); m.position.set(x, sy / 2, z)
  if (text) label(kit, text, x, sy + 0.7, z, '#b0b0cc', 0.7)
  return m
}
function battery(kit: EMKit, x: number, z: number, text: string) {
  box(kit, x - 0.25, z, 0.12, 1.4, 0xe8e8f0); box(kit, x + 0.25, z, 0.25, 0.7, 0x8a8aa0)
  label(kit, text, x, 1.3, z, '#F5C542', 0.7); label(kit, '+', x - 0.25, 0.4, z - 1.0, '#E05555', 0.6); label(kit, '−', x + 0.25, 0.4, z - 0.8, '#4A90D9', 0.6)
}
function wire(kit: EMKit, pts: Vec3[], color = 0xd9a05a) { for (let i = 0; i + 1 < pts.length; i++) bar(kit, pts[i], pts[i + 1], 0.045, color) }
class Flow {
  private L = 0
  private cum: number[] = []
  readonly dots: THREE.Mesh[] = []
  constructor(kit: EMKit, readonly pts: Vec3[], n: number, color = 0x3ecf8e) {
    for (let i = 0; i + 1 < pts.length; i++) { this.L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z); this.cum.push(this.L) }
    for (let k = 0; k < n; k++) this.dots.push(kit.track(mkMesh(new THREE.SphereGeometry(0.09, 10, 10), color, { basic: true })))
  }
  at(s: number): Vec3 {
    s = ((s % this.L) + this.L) % this.L
    let i = 0; while (i < this.cum.length - 1 && s > this.cum[i]) i++
    const s0 = i === 0 ? 0 : this.cum[i - 1], a = this.pts[i], b = this.pts[i + 1], u = (s - s0) / Math.max(1e-9, this.cum[i] - s0)
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u }
  }
  update(phase: number, visible = true) { this.dots.forEach((d, k) => { d.visible = visible; const p = this.at(phase + (k / this.dots.length) * this.L); d.position.set(p.x, p.y + 0.12, p.z) }) }
}

/* ══════════ 模型 49：伏安法测电阻 ══════════ */
interface S49 { phase: number; main: Flow; vBranch: Flow; A: ReturnType<typeof gauge>; V: ReturnType<typeof gauge>; logged: boolean }
function th49(p: Record<string, number>) {
  const ext = p.wiring === 0
  if (ext) { const Rp = (p.Rx * p.RV) / (p.Rx + p.RV); const I = p.E / (p.r + p.RA + Rp); const U = I * Rp; return { I, U, Rm: U / I, err: (Rp - p.Rx) / p.Rx, IV: U / p.RV } }
  const Rs = p.Rx + p.RA, Rt = (Rs * p.RV) / (Rs + p.RV); const U = (p.E * Rt) / (p.r + Rt); const I = U / Rs; return { I, U, Rm: U / I, err: p.RA / p.Rx, IV: U / p.RV }
}
export const voltAmmeterResistance: EMSceneDef<S49> = {
  id: 'gk-volt-ammeter-resistance',
  title: '伏安法测电阻（电流表内接 / 外接 · 系统误差）',
  desc: '用电压表（内阻 R_V）和电流表（内阻 R_A）测 R_x=U/I。外接法：电压表并在 R_x 两端，电流表多测了电压表的分流 → R_测=R_x∥R_V 偏小，适合小电阻；内接法：电流表串在 R_x 支路，电压表多测了电流表的分压 → R_测=R_x+R_A 偏大，适合大电阻。判据：R_x 与 √(R_A R_V) 比较（“大内偏大，小外偏小”）。',
  formula: '外接：R_测=U/I=R_xR_V/(R_x+R_V)<R_x　内接：R_测=R_x+R_A>R_x　临界 R_x=√(R_AR_V)',
  params: [
    { key: 'wiring', label: '接法', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '外接法（电压表跨 R_x）' }, { value: 1, label: '内接法（电压表跨 R_x+A）' }] },
    { key: 'Rx', label: '待测 R_x', min: 5, max: 500, step: 5, default: 100, unit: 'Ω' },
    { key: 'RA', label: '电流表内阻 R_A', min: 0.5, max: 5, step: 0.5, default: 1, unit: 'Ω' },
    { key: 'RV', label: '电压表内阻 R_V', min: 1000, max: 10000, step: 500, default: 3000, unit: 'Ω' },
    { key: 'E', label: '电源电动势 E', min: 3, max: 12, step: 0.5, default: 6, unit: 'V' },
    { key: 'r', label: '电源内阻 r', min: 0, max: 2, step: 0.1, default: 0.5, unit: 'Ω' },
  ],
  camera: { pos: [0, 10.5, 14.5], target: [0, 0, 0.3] },
  init(p, tl, kit) {
    tl.start(p.wiring === 0 ? '外接法：电流表测的是 R_x 与 R_V 的总电流' : '内接法：电压表测的是 R_x 与 R_A 的总电压', '#F5C542')
    const table = kit.track(mkMesh(new THREE.BoxGeometry(16, 0.2, 9), 0x1d1d33)); table.position.set(0, -0.1, 0)
    battery(kit, -6, 0, `E=${p.E} V，r=${p.r} Ω`)
    box(kit, 0, 0, 1.8, 0.7, 0xF5C542, `R_x=${p.Rx} Ω`)
    const A = gauge(kit, 3.6, 0, `A（R_A=${p.RA} Ω）`, 0xE05555)
    const V = gauge(kit, 0, -3.3, `V（R_V=${p.RV} Ω）`, 0x4A90D9)
    const loop: Vec3[] = [{ x: -5.6, y: 0, z: 0 }, { x: -0.9, y: 0, z: 0 }, { x: 0.9, y: 0, z: 0 }, { x: 2.6, y: 0, z: 0 }, { x: 4.6, y: 0, z: 0 }, { x: 6.2, y: 0, z: 0 }, { x: 6.2, y: 0, z: 2.6 }, { x: -6.4, y: 0, z: 2.6 }, { x: -6.4, y: 0, z: 0 }, { x: -5.6, y: 0, z: 0 }]
    wire(kit, loop)
    const vl: Vec3 = { x: -0.9, y: 0, z: 0 }, vr: Vec3 = p.wiring === 0 ? { x: 0.9, y: 0, z: 0 } : { x: 4.6, y: 0, z: 0 }
    const vPath: Vec3[] = [vl, { x: -0.9, y: 0, z: -1.6 }, { x: -0.6, y: 0, z: -2.6 }, { x: 0.6, y: 0, z: -2.6 }, { x: vr.x, y: 0, z: -1.6 }, vr]
    wire(kit, vPath, 0x4A90D9)
    label(kit, p.wiring === 0 ? '电压表接在 R_x 两端（电流表在外）' : '电压表接在 R_x+电流表 两端（电流表在内）', 0, 0.6, 4.0, '#8a8aa0', 0.8)
    const main = new Flow(kit, loop, 14), vBranch = new Flow(kit, vPath, 3, 0x9cc5ff)
    return { phase: 0, main, vBranch, A, V, logged: false }
  },
  step(s, p, d, t, tl) {
    const th = th49(p)
    s.phase += d * (0.6 + 4 * th.I)
    if (!s.logged && t >= 0.6) {
      s.logged = true
      const crit = Math.sqrt(p.RA * p.RV)
      tl.log(t, `${p.wiring === 0 ? '外接法' : '内接法'}：U=${f3(th.U)} V，I=${f3(th.I)} A → R_测=U/I=${f2(th.Rm)} Ω（真值 ${p.Rx}，${th.err >= 0 ? '偏大' : '偏小'} ${f2(Math.abs(th.err) * 100)}%）；√(R_AR_V)=${f2(crit)} Ω → R_x ${p.Rx > crit ? '>' : '<'} 临界，宜用${p.Rx > crit ? '内接' : '外接'}${(p.Rx > crit) === (p.wiring === 1) ? '（当前接法正确 ✓）' : '（当前接法误差偏大 ✗）'}`)
    }
    return t < 8
  },
  sync(s, p) {
    const th = th49(p)
    s.main.update(s.phase); s.vBranch.update(s.phase * 0.35)
    s.A.set(th.I / 0.6); s.V.set(th.U / 15)
  },
  readout(p) {
    const th = th49(p), crit = Math.sqrt(p.RA * p.RV)
    return `${p.wiring === 0 ? '外接' : '内接'}：U=${f3(th.U)} V，I=${f3(th.I)} A，R_测=${f2(th.Rm)} Ω（真值 ${p.Rx} Ω，误差 ${th.err >= 0 ? '+' : ''}${f2(th.err * 100)}%）
外接误差 −R_x/(R_x+R_V)=${f2((-p.Rx / (p.Rx + p.RV)) * 100)}%　内接误差 +R_A/R_x=${f2((p.RA / p.Rx) * 100)}%
临界 √(R_AR_V)=${f2(crit)} Ω：R_x ${p.Rx > crit ? '>' : '<'} 临界 → 应选${p.Rx > crit ? '内接（大内）' : '外接（小外）'}`
  },
  solution(p) {
    const th = th49(p), crit = Math.sqrt(p.RA * p.RV)
    return {
      problemType: '伏安法测电阻：内接/外接的选择与系统误差方向',
      hints: ['问自己：电流表读数里多了谁的电流？电压表读数里多了谁的电压？', '外接：电压表分流 → I 偏大 → R 偏小；内接：电流表分压 → U 偏大 → R 偏大', '记忆口诀“大内偏大、小外偏小”', '判据：R_x 与 √(R_AR_V) 比大小；不知内阻时用“试触法”看哪个表读数变化大'],
      processes: ['接线：电压表并联在 R_x（外接）或 R_x+A（内接）两端', '读数 U、I，算 R_测=U/I', '与真值比较，分析系统误差来源'],
      forces: ['电路问题不涉及受力；关键是电表内阻造成的分流/分压'],
      laws: ['欧姆定律 R=U/I', '并联分流：I_V=U/R_V', '串联分压：U_A=IR_A'],
      critical: ['外接 R_测=R_x∥R_V，R_V 越大越准', '内接 R_测=R_x+R_A，R_A 越小越准', '两种误差相等时 R_x=√(R_AR_V)'],
      derivation: ['外接：R_测=U/(I_x+I_V)=R_xR_V/(R_x+R_V)，相对误差 −R_x/(R_x+R_V)', '内接：R_测=(U_x+U_A)/I=R_x+R_A，相对误差 +R_A/R_x', '令两误差相等 → R_x²=R_AR_V'],
      numeric: [`当前 ${p.wiring === 0 ? '外接' : '内接'}：R_测=${f2(th.Rm)} Ω，误差 ${f2(th.err * 100)}%`, `√(R_AR_V)=${f2(crit)} Ω，R_x=${p.Rx} Ω → 宜${p.Rx > crit ? '内接' : '外接'}`, `另一种接法误差：${p.wiring === 0 ? `内接 +${f2((p.RA / p.Rx) * 100)}%` : `外接 ${f2((-p.Rx / (p.Rx + p.RV)) * 100)}%`}`],
      pitfalls: ['把“电流表内接”理解成电流表接在电源内部', '误差方向记反', '认为系统误差可以靠多次测量平均消除（不能，要换接法或修正）', '滑动变阻器分压/限流与内外接混淆'],
      similar: ['测电源电动势与内阻的系统误差', '半偏法测电表内阻', '电桥法测电阻'],
      competition: ['用已知内阻修正读数消除系统误差', '四端法测低电阻', '开尔文电桥'],
    }
  },
}

/* ══════════ 模型 48：电表改装 ══════════ */
interface S48 { phase: number; fa: Flow; fb: Flow; G: ReturnType<typeof gauge>; logged: boolean }
function th48(p: Record<string, number>) {
  const Ig = p.Ig / 1000
  if (p.mode === 0) { const R = (Ig * p.Rg) / (p.I - Ig); const Iin = p.frac * p.I; const ig = (Iin * R) / (R + p.Rg); return { R, Iin, Uin: NaN, ig, defl: ig / Ig, Rtot: (R * p.Rg) / (R + p.Rg), Ishunt: Iin - ig } }
  const R = p.U / Ig - p.Rg; const Uin = p.frac * p.U; const ig = Uin / (R + p.Rg); return { R, Iin: NaN, Uin, ig, defl: ig / Ig, Rtot: R + p.Rg, Ishunt: 0 }
}
export const meterConversion: EMSceneDef<S48> = {
  id: 'gk-meter-conversion',
  title: '电表改装（灵敏电流计 → 电流表 / 电压表）',
  desc: '灵敏电流计 G：满偏电流 I_g、内阻 R_g。改装电流表：并联小电阻分流，R_并=I_gR_g/(I−I_g)；改装电压表：串联大电阻分压，R_串=U/I_g−R_g。输入信号为量程的某一比例时，G 的偏转比例应恰好相同（刻度线性）。',
  formula: '电流表：R_并=I_gR_g/(I−I_g)，量程 I=I_g(1+R_g/R_并)　电压表：R_串=U/I_g−R_g，量程 U=I_g(R_g+R_串)',
  params: [
    { key: 'mode', label: '改装成', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '电流表（并联分流）' }, { value: 1, label: '电压表（串联分压）' }] },
    { key: 'Ig', label: '满偏电流 I_g', min: 0.5, max: 10, step: 0.5, default: 1, unit: 'mA' },
    { key: 'Rg', label: '表头内阻 R_g', min: 20, max: 500, step: 10, default: 100, unit: 'Ω' },
    { key: 'I', label: '目标电流量程 I', min: 0.1, max: 3, step: 0.1, default: 0.6, unit: 'A' },
    { key: 'U', label: '目标电压量程 U', min: 1, max: 30, step: 1, default: 15, unit: 'V' },
    { key: 'frac', label: '输入信号 / 量程', min: 0, max: 1, step: 0.05, default: 0.5 },
  ],
  camera: { pos: [0, 9, 12.5], target: [0, 0, 0] },
  init(p, tl, kit) {
    const th = th48(p)
    tl.start(p.mode === 0 ? '并联分流：大部分电流走 R_并' : '串联分压：大部分电压落在 R_串', '#F5C542')
    const table = kit.track(mkMesh(new THREE.BoxGeometry(14, 0.2, 8), 0x1d1d33)); table.position.set(0, -0.1, 0)
    const G = gauge(kit, 0, -1.2, `G（I_g=${p.Ig} mA，R_g=${p.Rg} Ω）`, 0xE05555)
    label(kit, p.mode === 0 ? `输入 I=${f3(th.Iin)} A（量程 ${p.I} A）` : `输入 U=${f2(th.Uin)} V（量程 ${p.U} V）`, -5, 1.4, 0, '#F5C542', 0.8)
    let fa: Flow, fb: Flow
    if (p.mode === 0) {
      box(kit, 0, 1.6, 1.6, 0.6, 0x3ecf8e, `R_并=${f3(th.R)} Ω`)
      const gPath: Vec3[] = [{ x: -5, y: 0, z: 0 }, { x: -2.5, y: 0, z: 0 }, { x: -2.5, y: 0, z: -1.2 }, { x: -1, y: 0, z: -1.2 }, { x: 1, y: 0, z: -1.2 }, { x: 2.5, y: 0, z: -1.2 }, { x: 2.5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]
      const sPath: Vec3[] = [{ x: -2.5, y: 0, z: 0 }, { x: -2.5, y: 0, z: 1.6 }, { x: -0.8, y: 0, z: 1.6 }, { x: 0.8, y: 0, z: 1.6 }, { x: 2.5, y: 0, z: 1.6 }, { x: 2.5, y: 0, z: 0 }]
      wire(kit, gPath); wire(kit, sPath)
      fa = new Flow(kit, gPath, 4, 0xE05555); fb = new Flow(kit, sPath, 10, 0x3ecf8e)
    } else {
      box(kit, 2.6, -1.2, 1.6, 0.6, 0x3ecf8e, `R_串=${f2(th.R)} Ω`)
      const path: Vec3[] = [{ x: -5, y: 0, z: 0 }, { x: -2.5, y: 0, z: 0 }, { x: -2.5, y: 0, z: -1.2 }, { x: -1, y: 0, z: -1.2 }, { x: 1, y: 0, z: -1.2 }, { x: 1.8, y: 0, z: -1.2 }, { x: 3.4, y: 0, z: -1.2 }, { x: 4.4, y: 0, z: -1.2 }, { x: 4.4, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]
      wire(kit, path)
      fa = new Flow(kit, path, 8, 0xE05555); fb = new Flow(kit, path.slice(0, 2), 0)
    }
    label(kit, '接线柱', -5, 0.5, 0.9, '#8a8aa0', 0.6); label(kit, '接线柱', 5, 0.5, 0.9, '#8a8aa0', 0.6)
    return { phase: 0, fa, fb, G, logged: false }
  },
  step(s, p, d, t, tl) {
    const th = th48(p)
    s.phase += d * 2
    if (!s.logged && t >= 0.6) {
      s.logged = true
      tl.log(t, p.mode === 0
        ? `R_并=I_gR_g/(I−I_g)=${f3(th.R)} Ω；输入 ${f3(th.Iin)} A 时表头电流 ${f3(th.ig * 1000)} mA（=${f2(th.defl * 100)}% 满偏），分流 ${f3(th.Ishunt)} A；改装后内阻 ${f3(th.Rtot)} Ω`
        : `R_串=U/I_g−R_g=${f2(th.R)} Ω；输入 ${f2(th.Uin)} V 时表头电流 ${f3(th.ig * 1000)} mA（=${f2(th.defl * 100)}% 满偏）；改装后内阻 ${f2(th.Rtot)} Ω`)
    }
    return t < 8
  },
  sync(s, p) {
    const th = th48(p)
    s.fa.update(s.phase * (0.3 + th.defl)); s.fb.update(s.phase * (0.3 + th.defl) * (p.mode === 0 ? 1.6 : 1), p.mode === 0)
    s.G.set(th.defl)
  },
  readout(p) {
    const th = th48(p), Ig = p.Ig / 1000
    return p.mode === 0
      ? `R_并=I_gR_g/(I−I_g)=${f3(th.R)} Ω（量程 ${p.I} A，扩大 ${f2(p.I / Ig)} 倍）\n输入 ${f3(th.Iin)} A → 表头 ${f3(th.ig * 1000)} mA，偏转 ${f2(th.defl * 100)}%（=输入/量程 ${f2(p.frac * 100)}% ✓ 线性）\n改装后内阻 R_A=R_gR_并/(R_g+R_并)=${f3(th.Rtot)} Ω`
      : `R_串=U/I_g−R_g=${f2(th.R)} Ω（量程 ${p.U} V）\n输入 ${f2(th.Uin)} V → 表头 ${f3(th.ig * 1000)} mA，偏转 ${f2(th.defl * 100)}%（=输入/量程 ✓）\n改装后内阻 R_V=R_g+R_串=${f2(th.Rtot)} Ω（每伏 ${f2(th.Rtot / p.U)} Ω）`
  },
  solution(p) {
    const th = th48(p), Ig = p.Ig / 1000
    return {
      problemType: `电表改装（${p.mode === 0 ? '电流表' : '电压表'}）：求并联/串联电阻与改装后内阻`,
      hints: ['表头满偏时电流是 I_g、电压是 I_gR_g——改装就是让“满量程输入”恰好对应表头满偏', '扩大电流量程 → 并联分流（电阻很小）；扩大电压量程 → 串联分压（电阻很大）', '并联后总内阻变小、串联后总内阻变大', '改装后刻度仍线性：偏转比例 = 输入/量程'],
      processes: ['确定表头参数 I_g、R_g', '按目标量程列满偏条件', '解出 R_并 或 R_串，再算改装后内阻'],
      forces: ['电路问题不涉及受力'],
      laws: ['并联：电压相等 I_gR_g=(I−I_g)R_并', '串联：电流相等 U=I_g(R_g+R_串)', '欧姆定律'],
      critical: ['满偏条件决定电阻值', '量程越大：R_并越小 / R_串越大', '双量程电流表：分流电阻按段计算'],
      derivation: [p.mode === 0 ? 'I_gR_g=(I−I_g)R_并 → R_并=I_gR_g/(I−I_g)' : 'U=I_g(R_g+R_串) → R_串=U/I_g−R_g', p.mode === 0 ? 'R_A=R_gR_并/(R_g+R_并)' : 'R_V=R_g+R_串'],
      numeric: [p.mode === 0 ? `R_并=${f3(th.R)} Ω，R_A=${f3(th.Rtot)} Ω` : `R_串=${f2(th.R)} Ω，R_V=${f2(th.Rtot)} Ω`, `I_g=${Ig} A，R_g=${p.Rg} Ω，满偏电压 ${f3(Ig * p.Rg)} V`],
      pitfalls: ['电流表并联电阻算成 I_gR_g/I', '电压表忘记减去 R_g', '改装后内阻方向记反', '量程扩大倍数 n=I/I_g 与电阻关系 R_并=R_g/(n−1)'],
      similar: ['多用电表欧姆挡原理', '半偏法测 R_g', '双量程电表'],
      competition: ['电表接入误差的一般修正', '分压器与惠斯通电桥', '数字表与指针表的输入阻抗'],
    }
  },
}
