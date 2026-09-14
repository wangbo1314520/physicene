/**
 * 最小二乘拟合（B1 冻结）：斜率/截距/R²/残差/过原点/σ 加权/剔除异常点。
 * 纯函数，无 DOM 依赖，可单测。
 */
import type { PaperPoint, PaperFit } from '../../core/processedData'

export interface FitResult {
  k: number
  b: number
  r2: number
  residuals: (number | null)[]
  n: number
}

/** 普通最小二乘 y = kx + b；throughOrigin 时 b≡0 */
export function linearFit(points: PaperPoint[], throughOrigin = false,
                          excludeOutliers = true): FitResult {
  const used = points.filter((p) => !(excludeOutliers && p.outlier)
    && Number.isFinite(p.x) && Number.isFinite(p.y))
  const n = used.length
  const residuals: (number | null)[] = points.map((p) =>
    (excludeOutliers && p.outlier) || !Number.isFinite(p.x) || !Number.isFinite(p.y) ? null : 0)

  if (n === 0) return { k: NaN, b: NaN, r2: NaN, residuals, n: 0 }
  if (n === 1 || (throughOrigin === false && n === 1)) {
    const p = used[0]
    return { k: NaN, b: p.y, r2: NaN, residuals, n }
  }

  let k: number, b: number
  if (throughOrigin) {
    const sxx = used.reduce((s, p) => s + p.x * p.x, 0)
    const sxy = used.reduce((s, p) => s + p.x * p.y, 0)
    k = sxx === 0 ? NaN : sxy / sxx
    b = 0
  } else {
    const sx = used.reduce((s, p) => s + p.x, 0)
    const sy = used.reduce((s, p) => s + p.y, 0)
    const sxx = used.reduce((s, p) => s + p.x * p.x, 0)
    const sxy = used.reduce((s, p) => s + p.x * p.y, 0)
    const den = n * sxx - sx * sx
    k = den === 0 ? NaN : (n * sxy - sx * sy) / den
    b = (sy - k * sx) / n
  }

  // R² 与残差
  const meanY = used.reduce((s, p) => s + p.y, 0) / n
  let ssTot = 0
  let ssRes = 0
  let iUsed = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if ((excludeOutliers && p.outlier) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    const pred = k * p.x + b
    const r = p.y - pred
    residuals[i] = r
    ssTot += (p.y - meanY) ** 2
    ssRes += r * r
    iUsed++
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  return { k, b, r2, residuals, n: iUsed }
}

/** 把拟合结果转为 PaperFit（schema 冻结结构） */
export function toPaperFit(seriesId: string, r: FitResult, throughOrigin: boolean): PaperFit {
  return {
    seriesId, throughOrigin,
    k: round(r.k), b: round(r.b), r2: round(r.r2),
    residuals: r.residuals.map((v) => (v == null ? null : round(v))),
    n: r.n,
  }
}

/** σ 加权拟合（误差棒作为权重 w=1/σ²），用于有误差棒的数据集 */
export function weightedFit(points: PaperPoint[], throughOrigin = false): FitResult {
  const used = points.filter((p) => !p.outlier && Number.isFinite(p.x) && Number.isFinite(p.y))
  const residuals: (number | null)[] = points.map((p) => (p.outlier ? null : 0))
  const n = used.length
  if (n < 2) return { k: NaN, b: NaN, r2: NaN, residuals, n }

  const w = (p: PaperPoint) => 1 / Math.max(1e-9, (p.sy ?? 1) ** 2)
  let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0
  for (const p of used) {
    const wi = w(p)
    sw += wi; swx += wi * p.x; swy += wi * p.y
    swxx += wi * p.x * p.x; swxy += wi * p.x * p.y
  }
  let k: number, b: number
  if (throughOrigin) {
    k = swxx === 0 ? NaN : swxy / swxx
    b = 0
  } else {
    const den = sw * swxx - swx * swx
    k = den === 0 ? NaN : (sw * swxy - swx * swy) / den
    b = (swy - k * swx) / sw
  }
  let ssTot = 0, ssRes = 0
  const meanY = used.reduce((s, p) => s + p.y, 0) / n
  for (const p of used) {
    const r = p.y - (k * p.x + b)
    ssTot += (p.y - meanY) ** 2
    ssRes += r * r
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  const usedSet = new Set(used)
  points.forEach((p, i) => {
    residuals[i] = usedSet.has(p) ? p.y - (k * p.x + b) : null
  })
  return { k, b, r2, residuals, n }
}

function round(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v
}
