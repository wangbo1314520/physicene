/**
 * 近代物理共享模块（P3 收口包）：光电效应/氢能级/物质波/玻尔共振——单一物理源。
 * 使用方：builder ModernRunner + 场景卡 mod1/mod2（内联收编）。
 * 常数统一（收口项）：λ=hc/ΔE 采用教学速算值 hc=1240 eV·nm（原 Runner 用 H_EV·C=1240.71、
 * 场景 mod1 用 1240——两处漂移，统一为 1240：与教材巴耳末表（656/486/434/410）口径一致，
 * 避免显示层整型舍入矛盾）。
 */

export const H_EV = 4.1357e-15   // eV·s（普朗克常量）
export const C = 3e8             // m/s
export const E1 = -13.6          // eV（氢基态）
export const HC_EV_NM = 1240     // eV·nm（教学速算值：λ(nm)=1240/ΔE(eV)）
export const H_SI = 6.626e-34
export const M_E = 9.11e-31, Q_E = 1.602e-19

/** 光电效应最大初动能 Eₖ=hν−W₀（ν₀ 以下为 0）；ν 单位 Hz，W 单位 eV */
export function photoelectricEk(nu: number, workFunction: number): number {
  return Math.max(0, H_EV * nu - workFunction)
}

/** 截止频率 ν₀=W₀/h（Hz） */
export function cutoffFrequency(workFunction: number): number {
  return workFunction / H_EV
}

/** 氢原子能级 Eₙ=−13.6/n²（eV） */
export function energyLevel(n: number): number {
  return E1 / (n * n)
}

/** 跃迁能量 ΔE=Eₘ−Eₙ（m>n 为正=释放） */
export function transitionEnergy(m: number, n: number): number {
  return energyLevel(m) - energyLevel(n)
}

/** 跃迁波长 λ=hc/ΔE（nm，统一 1240 口径） */
export function transitionWavelength(m: number, n: number): number {
  const dE = transitionEnergy(m, n)
  if (dE <= 0) return Infinity
  return HC_EV_NM / dE
}

/** 电子物质波 λ=h/√(2meU)（m） */
export function deBroglieWavelength(voltage: number): number {
  return H_SI / Math.sqrt(2 * M_E * Q_E * voltage)
}

/** 任意粒子物质波（mod2 多粒子收编用）：λ=h/√(2m·eU)（m） */
export function deBroglieWavelengthM(mass: number, voltage: number): number {
  return H_SI / Math.sqrt(2 * mass * Q_E * voltage)
}

/** 玻尔碰撞共振：电子能量 E 恰等于某跃迁 ΔE 时共振吸收（|Δ|<0.01eV） */
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
