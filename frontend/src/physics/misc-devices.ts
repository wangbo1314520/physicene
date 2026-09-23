/**
 * 批 4 剩余三装置（卡 63 核反应 / 66 微元积分 / 24 超重失重）——装置计算面。
 * 断言分级：核反应（教材核反应方程规范 + D+T 聚变 17.6MeV 教材经典值）·
 * 微元（解析 vs 辛普森两法 + 弹簧 ½kx² 教材闭式）· 超重失重（牛顿闭式 vs 数值微分两法）。
 */

// ───────── 卡 63 核反应 ─────────

/** 常用核素质量（u）——教材/核素表常用值 */
const NUCLEON_MASS_U: Record<string, number> = {
  n: 1.008665, p: 1.007276, H2: 2.014102, H3: 3.016049, He3: 3.016029, He4: 4.002603,
  Li6: 6.0151, Li7: 7.0160, Be7: 7.0169, B10: 10.0129, B11: 11.0093,
  C12: 12.0, N14: 14.0031, O16: 15.9949, U235: 235.0439, U238: 238.0508,
  Pu239: 239.0522, Xe135: 134.9072, Sr90: 89.9077, Ba141: 140.9144, Kr92: 91.9262,
}
const U_PER_MEV = 931.5  // 1u = 931.5 MeV/c²（教材常数）

/** 核反应：A/Z 守恒校验 + 质量亏损 + 释能（MeV） */
export function nuclearReaction(
  reactants: { sp: string; a: number; z: number }[],
  products: { sp: string; a: number; z: number }[],
): { aOk: boolean; zOk: boolean; dMassU: number; energyMeV: number } {
  const aR = reactants.reduce((s, r) => s + r.a, 0), aP = products.reduce((s, r) => s + r.a, 0)
  const zR = reactants.reduce((s, r) => s + r.z, 0), zP = products.reduce((s, r) => s + r.z, 0)
  const mR = reactants.reduce((s, r) => s + (NUCLEON_MASS_U[r.sp] ?? 0), 0)
  const mP = products.reduce((s, r) => s + (NUCLEON_MASS_U[r.sp] ?? 0), 0)
  const dMassU = mR - mP
  return { aOk: aR === aP, zOk: zR === zP, dMassU, energyMeV: dMassU * U_PER_MEV }
}

/** D+T→He4+n 聚变（教材经典） */
export function dtFusion() {
  return nuclearReaction(
    [{ sp: 'H2', a: 2, z: 1 }, { sp: 'H3', a: 3, z: 1 }],
    [{ sp: 'He4', a: 4, z: 2 }, { sp: 'n', a: 1, z: 0 }],
  )
}

// ───────── 卡 66 微元积分（变力做功）─────────

/** 弹簧功 W=∫₀ˣ kx dx = ½kx²（解析闭式） */
export function springWork(k: number, x: number): number {
  return 0.5 * k * x * x
}
/** 辛普森数值积分 W=∫₀ˣ F(x)dx（与解析两法互证） */
export function simpsonWork(f: (x: number) => number, xMax: number, n = 1000): number {
  const h = xMax / n
  let s = f(0) + f(xMax)
  for (let i = 1; i < n; i++) s += f(i * h) * (i % 2 ? 4 : 2)
  return (h / 3) * s
}

// ───────── 卡 24 超重失重（力学组 TS 计算面）─────────

/** 电梯三阶段：加速 a₀(T₁) → 匀速(T₂) → 减速 −a₀(T₁)。台秤读数 N(t)=M(g+a(t)) */
export interface ElevatorPhase { t0: number; t1: number; a: number; label: string }
export function elevatorSchedule(a0: number, tAcc: number, tConst: number): ElevatorPhase[] {
  return [
    { t0: 0, t1: tAcc, a: a0, label: '加速上升（超重）' },
    { t0: tAcc, t1: tAcc + tConst, a: 0, label: '匀速（N=Mg）' },
    { t0: tAcc + tConst, t1: 2 * tAcc + tConst, a: -a0, label: '减速上升（失重）' },
  ]
}
export function scaleReading(mass: number, a: number, g = 9.8): number {
  return mass * (g + a)   // N=m(g±a)：牛顿第二定律（超重 + / 失重 −）
}

// ───────── 装置入口 ─────────

export interface MiscBody {
  id: string
  type: 'nuclear_react' | 'micro_integral' | 'elevator_scale'
  x: number; y: number; angle: number
  params: Record<string, number>
}
export interface MiscFrame { t: number; readings: Record<string, number> }

export function runMisc(elements: MiscBody[], maxDuration = 3): MiscFrame[] {
  const frames: MiscFrame[] = []
  const push = (readings: Record<string, number>) => { for (let i = 0; i <= 60; i++) frames.push({ t: i / 30, readings }) }

  const nr = elements.find((e) => e.type === 'nuclear_react')
  if (nr) {
    const r = dtFusion()
    push({ d_mass_u: r.dMassU, energy_mev: r.energyMeV, energy_j: r.energyMeV * 1.602e-13, a_ok: r.aOk ? 1 : 0, z_ok: r.zOk ? 1 : 0 })
    return frames
  }

  const mi = elements.find((e) => e.type === 'micro_integral')
  if (mi) {
    const k = mi.params.k ?? 100, x = mi.params.x ?? 0.5
    const wAnalytic = springWork(k, x)
    const wNumeric = simpsonWork((xx) => k * xx, x)
    push({ k, x, w_analytic: wAnalytic, w_numeric: wNumeric, f_end: k * x })
    return frames
  }

  const ev = elements.find((e) => e.type === 'elevator_scale')
  if (ev) {
    const m = ev.params.m ?? 60, a0 = ev.params.a ?? 2, tAcc = ev.params.t_acc ?? 2, tConst = ev.params.t_const ?? 2
    const g = 9.8
    // 帧序贯穿三阶段：读数 N + 速度（供数值微分互证）
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * (2 * tAcc + tConst)
      const ph = t < tAcc ? a0 : t < tAcc + tConst ? 0 : -a0
      const v = t < tAcc ? a0 * t : t < tAcc + tConst ? a0 * tAcc : a0 * tAcc - a0 * (t - tAcc - tConst)
      frames.push({ t, readings: { m, a: ph, v, N: scaleReading(m, ph, g), mg: m * g, a0,
        n_acc: scaleReading(m, a0, g), n_const: scaleReading(m, 0, g), n_dec: scaleReading(m, -a0, g) } })
    }
    return frames
  }
  return []
}
