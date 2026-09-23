/**
 * 光学共享物理模块（P3 收口包）：矢量 Snell 内核 + 棱镜/劈尖/双缝公式——单一物理源。
 * 使用方：builder OpticsRunner + 场景卡 opt1/opt2（内联收编）。
 */

/** 矢量 Snell 内核：d 入射方向（单位），N 迎着入射光的法线（单位），eta=n₁/n₂。
 *  返回折射方向（TIR 时为镜面反射方向）与 tir 标记 */
export function snellDir(dx: number, dy: number, nx: number, ny: number, eta: number): {
  tx: number; ty: number; tir: boolean
} {
  const cosI = -(dx * nx + dy * ny)
  const sin2T = eta * eta * (1 - cosI * cosI)
  if (sin2T > 1) {
    const d2 = 2 * (dx * nx + dy * ny)
    return { tx: dx - d2 * nx, ty: dy - d2 * ny, tir: true }
  }
  const cosT = Math.sqrt(1 - sin2T)
  return { tx: eta * dx + (eta * cosI - cosT) * nx, ty: eta * dy + (eta * cosI - cosT) * ny, tir: false }
}

/** 棱镜最小偏向角 δmin = 2·arcsin(n·sin(A/2)) − A（A 为弧度） */
export function minDeviationAngle(A: number, n: number): number {
  return 2 * (Math.asin(n * Math.sin(A / 2)) - A / 2)
}

/** 劈尖干涉条纹间距 ΔL = λ/(2n·tanα) */
export function wedgeFringeSpacing(lambda: number, n: number, alphaRad: number): number {
  return lambda / (2 * n * Math.tan(alphaRad))
}

/** 双缝干涉条纹间距 Δx = Lλ/d */
export function doubleSlitSpacing(lambda: number, d: number, D: number): number {
  return (lambda * D) / d
}
