/**
 * ModernRunner：近代物理 TS 本地引擎（P1·阶段四批次 5）——光电效应 + 氢原子能级 + 物质波。
 *
 * 数据源：mod1.ts（光电效应 Eₖ=hν−W₀ + 能级跃迁）+ mod2.ts（玻尔碰撞 + 物质波 λ=h/p + 核反应）。
 * 引擎契约：输入 GeoElement[]（含 photo_tube / h_atom / point_charge），输出 Frame[]。
 *
 * 物理核心：
 * - 光电效应：Eₖ = hν − W₀（ν < ν₀ = W₀/h 时 Eₖ = 0）
 * - 氢原子能级：Eₙ = −13.6/n² eV，ΔE = 13.6(1/n² − 1/m²) eV
 * - 物质波：λ = h/√(2m·qU)（德布罗意）
 * - 玻尔碰撞：仅 E = ΔEₙₘ 时共振吸收（非弹性碰撞）
 */

export interface ModernBody {
  id: string
  type: 'photo_tube' | 'h_atom' | 'point_charge' | 'light_source' | 'electron_gun' | 'bohr_collision'
  x: number; y: number; angle: number
  params: Record<string, number>
}

export interface ModernFrame {
  t: number
  readings: Record<string, number>
  transitions: { from: number; to: number; energy: number; wavelength: number }[]
}

// 物理常量（SI / eV 混用按教学惯例）
export const H_EV = 4.1357e-15   // eV·s
export const C = 3e8             // m/s
export const E1 = -13.6          // eV（氢原子基态）

/** 光电效应：给定频率和材料功函数，返回最大动能 */
export function photoelectricEk(nu: number, workFunction: number): number {
  const nu0 = workFunction / H_EV
  if (nu < nu0) return 0
  return H_EV * nu - workFunction
}

/** 截止频率 */
export function cutoffFrequency(workFunction: number): number {
  return workFunction / H_EV
}

/** 氢原子能级 Eₙ = −13.6/n² */
export function energyLevel(n: number): number {
  return E1 / (n * n)
}

/** 跃迁能量 ΔE（m→n，m>n 为释放光子 → 正值） */
export function transitionEnergy(m: number, n: number): number {
  return energyLevel(m) - energyLevel(n)  // Eₘ−Eₙ：m>n 时为正=释放光子
}

/** 跃迁波长 λ = hc/ΔE（返回 nm） */
export function transitionWavelength(m: number, n: number): number {
  const dE = transitionEnergy(m, n)
  if (dE <= 0) return Infinity
  return (H_EV * C / dE) * 1e9  // eV·s × m/s / eV = m → nm
}

/** 物质波德布罗意波长（经电压 U 加速的电子） */
export function deBroglieWavelength(voltage: number): number {
  // λ = h/√(2meU)，电子 m=9.11e-31, e=1.602e-19, h=6.626e-34
  return 6.626e-34 / Math.sqrt(2 * 9.11e-31 * 1.602e-19 * voltage)  // m
}

/** 玻尔碰撞：电子能量 E 恰等于某跃迁 ΔE 时共振吸收 */
export function bohrResonance(electronEnergy: number, maxN: number): { n: number; m: number } | null {
  for (let m = 1; m <= maxN; m++) {
    for (let n = m + 1; n <= maxN; n++) {
      if (Math.abs(electronEnergy - Math.abs(transitionEnergy(m, n))) < 0.01) {
        return { n, m }
      }
    }
  }
  return null
}

/**
 * 主入口：从 GeoElement[] 提取近代物理体，运行计算，输出帧。
 */
export function runModern(elements: ModernBody[], maxDuration = 3): ModernFrame[] {
  const tube = elements.find(e => e.type === 'photo_tube')
  const atom = elements.find(e => e.type === 'h_atom')
  const charge = elements.find(e => e.type === 'point_charge')

  const frames: ModernFrame[] = []
  const steps = 60

  // 光电效应模式
  if (tube) {
    const mat = tube.params.mat ?? 0
    const workFunctions = [2.28, 2.25, 1.94, 4.2, 4.36]  // 钠/钾/铯/锌/铂
    const W = workFunctions[Math.min(4, mat)]
    const nu = (tube.params.lam ? C / (tube.params.lam * 1e-9) : tube.params.nu ?? 6e14)

    for (let i = 0; i <= steps; i++) {
      const t = i / 30
      const ek = photoelectricEk(nu, W)
      frames.push({
        t,
        readings: {
          nu: nu / 1e14,
          work_function: W,
          cutoff_freq: cutoffFrequency(W) / 1e14,
          max_ek: ek,
          Ek_h: H_EV,  // 斜率
        },
        transitions: [],
      })
    }
    return frames
  }

  // 氢原子能级模式
  if (atom) {
    const m = atom.params.m ?? 3
    const n = atom.params.n ?? 2
    const dE = transitionEnergy(m, n)
    const lambda = transitionWavelength(m, n)
    for (let i = 0; i <= steps; i++) {
      frames.push({
        t: i / 30,
        readings: {
          E_m: energyLevel(m),
          E_n: energyLevel(n),
          delta_E: dE,
          wavelength_nm: lambda,
        },
        transitions: [{ from: m, to: n, energy: dE, wavelength: lambda }],
      })
    }
    return frames
  }

  // 清偿5·卡 65：电子枪物质波 λ=h/√(2meU)（deBroglieWavelength 产品函数）
  if (elements.some(e => e.type === 'electron_gun')) {
    const gun = elements.find(e => e.type === 'electron_gun')!
    const U = gun.params.U ?? 100
    const lambda = deBroglieWavelength(U)
    for (let i = 0; i <= steps; i++) {
      frames.push({
        t: i / 30,
        readings: { U, lambda_nm: lambda * 1e9, lambda_pm: lambda * 1e12 },
        transitions: [],
      })
    }
    return frames
  }

  // 清偿5·卡 64：玻尔碰撞——电子能量匹配能级差则共振激发（bohrResonance 产品函数）
  if (elements.some(e => e.type === 'bohr_collision')) {
    const bo = elements.find(e => e.type === 'bohr_collision')!
    const E = bo.params.E ?? 12.75
    const maxN = Math.round(bo.params.maxN ?? 4)
    const res = bohrResonance(E, maxN)
    const dE = res ? Math.abs(transitionEnergy(res.m, res.n)) : 0
    const lambda = res ? transitionWavelength(res.m, res.n) : 0
    for (let i = 0; i <= steps; i++) {
      frames.push({
        t: i / 30,
        readings: {
          E, max_n: maxN, resonant: res ? 1 : 0,
          res_n: res?.n ?? 0, res_m: res?.m ?? 0,
          delta_E: dE, wavelength_nm: lambda,
        },
        transitions: res ? [{ from: res.m, to: res.n, energy: dE, wavelength: lambda }] : [],
      })
    }
    return frames
  }

  // 物质波模式
  if (charge) {
    const qm = charge.params.qm ?? 1
    const v0 = charge.params.v0 ?? 4
    const p = 9.11e-31 * v0 * Math.abs(qm)  // 简化动量
    const lambda = 6.626e-34 / p
    for (let i = 0; i <= steps; i++) {
      frames.push({
        t: i / 30,
        readings: {
          momentum: p,
          lambda_m: lambda,
          lambda_nm: lambda * 1e9,
          v0,
        },
        transitions: [],
      })
    }
    return frames
  }

  return []
}
