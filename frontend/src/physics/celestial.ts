/**
 * 天体运动引擎（批 A · 2026-10-10）：中心天体+卫星+双星+逃逸判据——高考 A 档。
 * 积分器：velocity Verlet（辛）——线性动量精确守恒（双星共质心不漂）、能量误差有界
 * （圆轨道 ~1e-6/周期）；成对引力 F=G·m₁m₂/r²（N≤小，全对直算）。
 * 单位：内部全 SI（m/s/kg）；时间压缩 timeScale（1 仿真秒 = timeScale 真实秒，
 * 近地轨道 T≈5300s → 10s 仿真需 ~530×）。画布换算由渲染层处理（1 单位=1e7 m）。
 * 度量（末态进 readings）：周期 T（x 符号变化计次）、平均半径/速度、最大半径（逃逸判据）、
 * 能量漂移（E_end−E_0)/|E_0|、共质心位移。
 */
export const CELESTIAL_TYPES = new Set(['central_star', 'satellite', 'binary_star'])

/** G（m³ kg⁻¹ s⁻²）——与教材一致 */
export const G_SI = 6.674e-11

export interface CelestialBody {
  id: string
  type: string
  x: number; y: number; angle: number
  params: Record<string, number>
}
export interface CelestialPose { id: string; x: number; y: number; vx: number; vy: number }
export interface CelestialFrame {
  t: number
  readings: Record<string, number>
  poses: CelestialPose[]   // 画布位姿（世界单位=米/SCALE_M）
}
export type ScaleMode = { pxPerSec: number }   // timeScale：每仿真秒对应的真实秒数

/** 画布长度换算：1 世界单位 = 1e7 m */
export const SCALE_M = 1e7

/** 内部质点（SI 单位） */
interface Point {
  id: string
  m: number
  x: number; y: number
  vx: number; vy: number
  fixed: boolean
  ax: number; ay: number
}

/** GeoElement 元件 → SI 质点组（binary_star 展开两个，自动圆 IC） */
export function buildPoints(els: CelestialBody[]): { pts: Point[]; error?: string } {
  const pts: Point[] = []
  for (const e of els) {
    const p = e.params
    if (e.type === 'central_star') {
      pts.push({ id: e.id, m: Math.max(1e20, (p.M ?? 5.97) * 1e24), x: e.x * SCALE_M, y: e.y * SCALE_M,
        vx: 0, vy: 0, fixed: true, ax: 0, ay: 0 })
    } else if (e.type === 'satellite') {
      const v0 = p.v0 ?? 0, ang = ((p.ang ?? 0) * Math.PI) / 180
      pts.push({ id: e.id, m: Math.max(1, p.m ?? 100), x: e.x * SCALE_M, y: e.y * SCALE_M,
        vx: v0 * Math.cos(ang), vy: v0 * Math.sin(ang), fixed: false, ax: 0, ay: 0 })
    } else if (e.type === 'binary_star') {
      const m1 = Math.max(1e20, (p.M1 ?? 1) * 1e24), m2 = Math.max(1e20, (p.M2 ?? 1) * 1e24)
      const L = Math.max(SCALE_M * 0.2, (p.L ?? 2) * SCALE_M)
      // 圆轨道 IC：共质心在原点（元件位置），r₁=L·M₂/(M₁+M₂)，ω=√(G(M₁+M₂)/L³)
      const r1 = (L * m2) / (m1 + m2), r2 = (L * m1) / (m1 + m2)
      const omega = Math.sqrt((G_SI * (m1 + m2)) / (L * L * L))
      pts.push({ id: `${e.id}#A`, m: m1, x: e.x * SCALE_M - r1, y: e.y * SCALE_M, vy: -omega * r1, vx: 0, fixed: false, ax: 0, ay: 0 })
      pts.push({ id: `${e.id}#B`, m: m2, x: e.x * SCALE_M + r2, y: e.y * SCALE_M, vy: omega * r2, vx: 0, fixed: false, ax: 0, ay: 0 })
    }
  }
  if (!pts.some((q) => q.m >= 1e20)) return { pts, error: '缺少中心天体（或双星）' }
  return { pts }
}

function accel(pts: Point[]) {
  for (const q of pts) { q.ax = 0; q.ay = 0 }
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const r2 = dx * dx + dy * dy
      const r = Math.sqrt(r2)
      if (r < 1) continue
      const f = (G_SI * a.m * b.m) / r2
      const ux = dx / r, uy = dy / r
      const fa = f / a.m, fb = f / b.m
      if (!a.fixed) { a.ax += fa * ux; a.ay += fa * uy }
      if (!b.fixed) { b.ax -= fb * ux; b.ay -= fb * uy }
    }
  }
}

function energy(pts: Point[]): number {
  let ke = 0, pe = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    if (!a.fixed) ke += 0.5 * a.m * (a.vx * a.vx + a.vy * a.vy)
    for (let j = i + 1; j < pts.length; j++) {
      const b = pts[j]
      const r = Math.hypot(b.x - a.x, b.y - a.y)
      if (r > 1) pe -= (G_SI * a.m * b.m) / r
    }
  }
  return ke + pe
}

/** 周期检测：x 过中心符号变化（半周期计 1）——线性插值过零时刻，首末平均去帧量化 */
function periodOf(traj: { t: number; x: number }[], cx: number): number | null {
  const crossT: number[] = []
  let prev: { t: number; x: number } | null = null
  for (const q of traj) {
    if (prev && (q.x - cx) * (prev.x - cx) < 0) {
      const frac = (prev.x - cx) / (prev.x - q.x)
      crossT.push(prev.t + frac * (q.t - prev.t))
    }
    prev = q
  }
  if (crossT.length < 2) return null
  return (2 * (crossT[crossT.length - 1] - crossT[0])) / (crossT.length - 1)
}

export interface RunOpts { maxDuration?: number; timeScale?: number }

/** 30fps 帧：每仿真帧推进 simDt=1/30·timeScale 真实秒，内部分 240 子步（dt≤T/360 量级） */
export function runCelestial(els: CelestialBody[], opts: RunOpts = {}): CelestialFrame[] {
  const maxDuration = opts.maxDuration ?? 6
  const timeScale = Math.max(1, opts.timeScale ?? 1)
  const built = buildPoints(els)
  if (built.error || !built.pts.length) return []
  const pts = built.pts.filter((q) => !q.fixed || true)
  const centers = pts.filter((q) => q.m >= 1e20)
  const E0 = energy(pts)
  const cx0 = pts.reduce((s, q) => s + q.x * q.m, 0) / pts.reduce((s, q) => s + q.m, 0)
  const cy0 = pts.reduce((s, q) => s + q.y * q.m, 0) / pts.reduce((s, q) => s + q.m, 0)

  accel(pts)
  const frames: CelestialFrame[] = []
  const traj: Record<string, { t: number; x: number }[]> = {}
  const rMax: Record<string, number> = {}
  const substeps = 240
  const simDt = (1 / 30) * timeScale
  const h = simDt / substeps
  const nFrames = Math.floor(maxDuration * 30)
  for (let f = 0; f <= nFrames; f++) {
    if (f > 0) {
      for (let s = 0; s < substeps; s++) {
        for (const q of pts) {
          if (q.fixed) continue
          q.vx += 0.5 * h * q.ax; q.vy += 0.5 * h * q.ay
          q.x += h * q.vx; q.y += h * q.vy
        }
        accel(pts)
        for (const q of pts) {
          if (q.fixed) continue
          q.vx += 0.5 * h * q.ax; q.vy += 0.5 * h * q.ay
        }
      }
    }
    const t = (f / 30)
    const realT = f * simDt
    const poses: CelestialPose[] = pts.map((q) => ({ id: q.id, x: q.x / SCALE_M, y: q.y / SCALE_M, vx: q.vx, vy: q.vy }))
    for (const q of pts) {
      if (q.fixed) continue
      ;(traj[q.id] ??= []).push({ t: realT, x: q.x })
      for (const c of centers) rMax[q.id] = Math.max(rMax[q.id] ?? 0, Math.hypot(q.x - c.x, q.y - c.y))
    }
    frames.push({ t, readings: {}, poses })
  }
  // 末帧度量（readings）
  const rd: Record<string, number> = {}
  rd.E_drift = +(((energy(pts) - E0) / Math.abs(E0 || 1))).toFixed(6)
  const cx1 = pts.reduce((s, q) => s + q.x * q.m, 0) / pts.reduce((s, q) => s + q.m, 0)
  const cy1 = pts.reduce((s, q) => s + q.y * q.m, 0) / pts.reduce((s, q) => s + q.m, 0)
  rd.bary_dx = +((cx1 - cx0) / SCALE_M).toFixed(6)
  rd.bary_dy = +((cy1 - cy0) / SCALE_M).toFixed(6)
  for (const q of pts) {
    if (q.fixed) continue
    const T = periodOf(traj[q.id] ?? [], centers[0]?.x ?? cx0)
    if (T !== null) rd[`T_${q.id}`] = +T.toFixed(1)
    rd[`rmax_${q.id}`] = +((rMax[q.id] ?? 0) / SCALE_M).toFixed(3)
    rd[`v_${q.id}`] = +Math.hypot(q.vx, q.vy).toFixed(1)
  }
  for (const f of frames) f.readings = rd
  return frames
}
