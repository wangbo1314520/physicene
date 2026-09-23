/**
 * 热学静力学装置——共享纯函数模块（P3 批 2 · 决策 1：单一物理源）。
 * 使用方：builder 装置引擎（RunBridge TS 面）+ 高考场景卡（thermo1/thermo2.ts 内联收编）。
 * 单位约定与教学口径一致：液封/U 形管用 cmHg（p₀=76）、长度 cm、温度 K；
 * 打气/抽气 p 以 p₀ 的倍数（无量纲比率）表达——三组公式均单位自洽。
 *
 * 物理：
 * - 液封（卡 51）：汞柱长 h 封闭气柱，开口向上 p=p₀+h、向下 p=p₀−h（倾斜 ×cosθ）
 * - 变质量气体（卡 53）：打气 pₙ=p₀(1+nV₀/V)（等效总体积法）；抽气 pₙ=p₀[V/(V+V₀)]ⁿ
 * - U 形管（卡 54）：p=p₀+Δh；升温 (p₁+2x)(L₁+x)/T₂=p₁L₁/T₁；注汞 (p₁+2x+Δ)(L₁−x)=p₁L₁（二次方程）
 */

/** 液封气压强（cmHg）：orientation 0=开口向上（液柱压气体），π=开口向下 */
export function liquidSealPressure(p0: number, hColumn: number, orientationRad: number): number {
  return p0 + hColumn * Math.cos(orientationRad)
}

/** 打气/抽气末压强比率（×p₀）：mode 0=打气（线性增长），1=抽气（等比衰减） */
export function pumpPressureRatio(n: number, v0: number, v: number, mode: number): number {
  return mode === 0 ? 1 + (n * v0) / v : Math.pow(v / (v + v0), n)
}

/** U 形管过程解：左液面下降量 x（cm）。
 *  升温 mode 0：(p₁+2x)(L₁+x)=p₁L₁T₂/T₁ → 2x²+(p₁+2L₁)x+(p₁L₁−K)=0
 *  注汞 mode 1：(p₁+2x+Δ)(L₁−x)=p₁L₁ → 2x²+(p₁+Δ−2L₁)x−ΔL₁=0（取正根） */
export function uTubeSolveX(p0: number, dh0: number, l1: number, t1: number, t2: number, dAdd: number, mode: number): number {
  const p1 = p0 + dh0
  if (mode === 0) {
    const K = (p1 * l1 * t2) / t1, b = p1 + 2 * l1, c = p1 * l1 - K
    return (-b + Math.sqrt(b * b - 8 * c)) / 4
  }
  const B = p1 + dAdd - 2 * l1
  return (-B + Math.sqrt(B * B + 8 * dAdd * l1)) / 4
}

/** U 形管末态全解（供装置读数与自洽校验） */
export function uTubeFinal(p0: number, dh0: number, l1: number, t1: number, t2: number, dAdd: number, mode: number): {
  x: number; p2: number; l2: number; t2v: number; dh: number
} {
  const x = uTubeSolveX(p0, dh0, l1, t1, t2, dAdd, mode)
  const p2 = p0 + dh0 + 2 * x + (mode === 1 ? dAdd : 0)
  const l2 = mode === 0 ? l1 + x : l1 - x
  return { x, p2, l2, t2v: mode === 0 ? t2 : t1, dh: dh0 + 2 * x + (mode === 1 ? dAdd : 0) }
}

// ───────────────────────────────────────────────────────────────
// builder 装置面：帧序列（30fps，读数每帧静态——参数面板即装置）
// ───────────────────────────────────────────────────────────────

export interface ThermoBody {
  id: string
  type: 'liquid_seal' | 'pump_syringe' | 'u_tube'
  x: number; y: number; angle: number
  params: Record<string, number>
}

export interface ThermoFrame {
  t: number
  readings: Record<string, number>
}

const CMHG_TO_KPA = 1.33322

/** 装置主入口：单装置参数 → 帧序列（与 runOptics/runModern 同契约） */
export function runThermal(elements: ThermoBody[], maxDuration = 3): ThermoFrame[] {
  const seal = elements.find((e) => e.type === 'liquid_seal')
  if (seal) {
    const p0 = seal.params.p0 ?? 76, h = seal.params.h ?? 10, mode = seal.params.mode ?? 0
    const p = liquidSealPressure(p0, h, mode === 1 ? Math.PI : 0)
    const frames: ThermoFrame[] = []
    for (let i = 0; i <= 60; i++) {
      frames.push({ t: i / 30, readings: { p0, h, mode, p_cmhg: p, p_kpa: p * CMHG_TO_KPA } })
    }
    return frames
  }
  const pump = elements.find((e) => e.type === 'pump_syringe')
  if (pump) {
    const v = pump.params.V ?? 5, v0 = pump.params.V0 ?? 0.25, n = Math.round(pump.params.n ?? 10), mode = pump.params.mode ?? 0
    const ratio = pumpPressureRatio(n, v0, v, mode)
    const frames: ThermoFrame[] = []
    for (let i = 0; i <= 60; i++) {
      frames.push({ t: i / 30, readings: { V: v, V0: v0, n, mode, p_ratio: ratio, p_kpa: 101.325 * ratio } })
    }
    return frames
  }
  const tube = elements.find((e) => e.type === 'u_tube')
  if (tube) {
    const l1 = tube.params.L1 ?? 20, dh0 = tube.params.dh0 ?? 4, mode = tube.params.mode ?? 0
    const t1 = tube.params.T1 ?? 300, t2 = tube.params.T2 ?? 360, dAdd = tube.params.dAdd ?? 10
    const p0 = tube.params.p0 ?? 76
    const f = uTubeFinal(p0, dh0, l1, t1, t2, dAdd, mode)
    const p1 = p0 + dh0
    const frames: ThermoFrame[] = []
    for (let i = 0; i <= 60; i++) {
      frames.push({
        t: i / 30,
        readings: {
          L1: l1, dh0, mode, x_cm: f.x, p2_cmhg: f.p2, L2_cm: f.l2, dh_cm: f.dh,
          plT2: (f.p2 * f.l2) / f.t2v, plT1: (p1 * l1) / t1,  // 末/初 pL/T（自洽不变量）
        },
      })
    }
    return frames
  }
  return []
}
