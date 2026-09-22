/**
 * OpticsRunner：光学 TS 本地引擎（P1·阶段四批次 5）——折射/反射/全反射光线追踪核心。
 *
 * 数据源：opt1.ts（Snell 矢量折射 + 棱镜/玻璃砖/劈尖/双缝）+ opt2.ts（波叠加/多解/振动图像）。
 * 引擎契约：输入 GeoElement[]（含 light_source / prism / optic_screen / graph_tag），
 * 输出 Frame[]（30fps 快照），不依赖 dyn4j。
 *
 * 物理核心：
 * - Snell 定律矢量形式：sinθ₁/sinθ₂ = n₂/n₁（非标量角度对，用方向矢量直接求）
 * - 全反射：入射角 > 临界角 arcsin(n₂/n₁) 时反射（TIR）
 * - 最小偏向角 δmin = 2A − 2arcsin(n·sin(A/2))（棱镜）
 * - 薄膜/劈尖干涉：Δx = λ/(2n·tanα)
 */

export interface OpticalBody {
  id: string
  type: 'light_source' | 'prism' | 'optic_screen' | 'glass_slab' | 'wedge_film' | 'slit_pair' | 'wedge' | 'double_slit'
  x: number; y: number; angle: number
  params: Record<string, number>
}

export interface RaySegment {
  x0: number; y0: number; x1: number; y1: number
  kind: 'incident' | 'refracted' | 'reflected' | 'tir'
  medium: 'air' | 'glass'
}

export interface OpticsFrame {
  t: number
  rays: RaySegment[]
  readings: Record<string, number>
}

/** Snell 矢量折射：d 入射方向（单位），N 法线（单位，指向入射侧），eta = n₁/n₂ */
export function refract(d: { x: number; y: number }, N: { x: number; y: number }, eta: number): { t: { x: number; y: number } | null; tir: boolean } {
  const cosI = -(d.x * N.x + d.y * N.y)
  const sin2T = eta * eta * (1 - cosI * cosI)
  if (sin2T > 1) return { t: null, tir: true }
  const cosT = Math.sqrt(1 - sin2T)
  const tx = eta * d.x + (eta * cosI - cosT) * N.x
  const ty = eta * d.y + (eta * cosI - cosT) * N.y
  return { t: { x: tx, y: ty }, tir: false }
}

/** 棱镜最小偏向角 */
export function minDeviationAngle(A: number, n: number): number {
  return 2 * (Math.asin(n * Math.sin(A / 2)) - A / 2)
}

/** 劈尖干涉条纹间距 */
export function wedgeFringeSpacing(lambda: number, n: number, alphaRad: number): number {
  return lambda / (2 * n * Math.tan(alphaRad))
}

/** 双缝干涉条纹间距 */
export function doubleSlitSpacing(lambda: number, d: number, D: number): number {
  return lambda * D / d
}

/**
 * 单步光线追踪：光源 → 棱镜（两次折射）→ 屏幕。
 * 返回全部光线段 + 读数（偏向角/折射角/条纹间距）。
 */
export function traceRay(source: OpticalBody, prism: OpticalBody, screen: OpticalBody): { rays: RaySegment[]; readings: Record<string, number> } {
  const rays: RaySegment[] = []
  const n = prism.params.n ?? 1.5
  const A = (prism.params.A ?? 60) * Math.PI / 180
  const th1 = (source.params.th1 ?? 40) * Math.PI / 180

  // 光源 → 棱镜入射面
  const srcX = source.x, srcY = source.y
  const px = prism.x, py = prism.y
  const dirX = Math.cos(th1), dirY = -Math.sin(th1)

  // 入射面法线（棱镜顶角 A 的左侧面）
  const nAng = prism.angle + Math.PI / 2 - A / 2
  const N1 = { x: Math.cos(nAng), y: Math.sin(nAng) }
  const d = { x: dirX, y: dirY }
  const r1 = refract(d, N1, 1 / n)
  const hitX = px, hitY = py + 0.5  // 简化：入射点在棱镜中心上方

  rays.push({ x0: srcX, y0: srcY, x1: hitX, y1: hitY, kind: 'incident', medium: 'air' })

  if (r1.tir) {
    // 全反射（入射角过大）
    const reflX = d.x - 2 * (d.x * N1.x + d.y * N1.y) * N1.x
    const reflY = d.y - 2 * (d.x * N1.x + d.y * N1.y) * N1.y
    rays.push({ x0: hitX, y0: hitY, x1: hitX + reflX * 5, y1: hitY + reflY * 5, kind: 'tir', medium: 'air' })
    return { rays, readings: { tir: 1, theta_c: Math.asin(1 / n) * 180 / Math.PI } }
  }

  // 第一次折射（air→glass）
  rays.push({ x0: hitX, y0: hitY, x1: hitX + r1.t!.x * 1.5, y1: hitY + r1.t!.y * 1.5, kind: 'refracted', medium: 'glass' })

  // 出射面法线（右侧面）
  const n2Ang = prism.angle + Math.PI / 2 + A / 2
  const N2 = { x: -Math.cos(n2Ang), y: -Math.sin(n2Ang) }
  const d2 = r1.t!
  const r2 = refract(d2, N2, n / 1)

  const exitX = px + 0.3, exitY = py - 0.2
  if (r2.t && !r2.tir) {
    rays.push({ x0: exitX, y0: exitY, x1: exitX + r2.t.x * 8, y1: exitY + r2.t.y * 8, kind: 'refracted', medium: 'air' })
  }

  // 读数
  const theta2 = Math.asin(Math.sin(th1) / n)
  const delta = th1 + Math.asin(n * Math.sin(A - Math.asin(Math.sin(th1) / n))) - A
  const deltaMin = minDeviationAngle(A, n)

  return {
    rays,
    readings: {
      theta_1: th1 * 180 / Math.PI,
      theta_2: theta2 * 180 / Math.PI,
      delta: delta * 180 / Math.PI,
      delta_min: deltaMin * 180 / Math.PI,
      n,
    },
  }
}

/** 主入口：从 GeoElement[] 提取光学体，运行光线追踪，输出帧序列 */
export function runOptics(elements: OpticalBody[], maxDuration = 3): OpticsFrame[] {
  const source = elements.find(e => e.type === 'light_source')
  const prism = elements.find(e => e.type === 'prism')
  const screen = elements.find(e => e.type === 'optic_screen')
  // 清偿5·卡 56/57：单元件模式（劈尖等厚干涉 / 双缝干涉）——公式已有，接 builder 面
  const wedge = elements.find(e => e.type === 'wedge')
  if (wedge) return wedgeFrames(wedge)
  const slit = elements.find(e => e.type === 'double_slit')
  if (slit) return doubleSlitFrames(slit)
  if (!source || !prism) return []

  const { rays, readings } = traceRay(source, prism, screen ?? prism)
  const frames: OpticsFrame[] = []
  const steps = 60  // 2s @ 30fps
  for (let i = 0; i <= steps; i++) {
    frames.push({ t: i / 30, rays, readings })
  }
  return frames
}

/** 卡 56 劈尖：等厚干涉 ΔL=λ/(2n·tanα)；画布=劈尖轮廓 + 三条明纹位置光线段 */
function wedgeFrames(w: OpticalBody): OpticsFrame[] {
  const lamNm = w.params.lam ?? 600
  const n = w.params.n ?? 1.5
  const alphaRad = (w.params.alpha ?? 0.1) * Math.PI / 180
  const dl = wedgeFringeSpacing(lamNm * 1e-9, n, alphaRad)  // m
  const rays: RaySegment[] = [
    { x0: -4, y0: 1.5, x1: -1, y1: 0.15, kind: 'incident', medium: 'air' },
    { x0: -4, y0: 1.0, x1: -1, y1: 0.10, kind: 'incident', medium: 'air' },
    { x0: -4, y0: 0.5, x1: -1, y1: 0.05, kind: 'incident', medium: 'air' },
    { x0: -1, y0: 0.15, x1: -1 + 3 * dl, y1: 0.15 + 3 * dl * Math.tan(alphaRad), kind: 'refracted', medium: 'glass' },
    { x0: -1, y0: 0.10, x1: -1 + 2 * dl, y1: 0.10 + 2 * dl * Math.tan(alphaRad), kind: 'refracted', medium: 'glass' },
    { x0: -1, y0: 0.05, x1: -1 + dl, y1: 0.05 + dl * Math.tan(alphaRad), kind: 'refracted', medium: 'glass' },
  ]
  const readings = { lambda_nm: lamNm, n, alpha_deg: w.params.alpha ?? 0.1, fringe_mm: dl * 1000 }
  const frames: OpticsFrame[] = []
  for (let i = 0; i <= 60; i++) frames.push({ t: i / 30, rays, readings })
  return frames
}

/** 卡 57 双缝：Δx=Lλ/d；画布=入射平行光 + 两缝出射 + 屏上 ±1 级亮纹射线 */
function doubleSlitFrames(s: OpticalBody): OpticsFrame[] {
  const lamNm = s.params.lam ?? 600
  const dMm = s.params.d ?? 0.2
  const L = s.params.L ?? 1
  const dx = doubleSlitSpacing(lamNm * 1e-9, dMm * 1e-3, L)  // m
  const dHalf = dMm * 1e-3 / 2
  const rays: RaySegment[] = [
    { x0: -4, y0: dHalf, x1: -0.05, y1: dHalf, kind: 'incident', medium: 'air' },
    { x0: -4, y0: -dHalf, x1: -0.05, y1: -dHalf, kind: 'incident', medium: 'air' },
    { x0: -0.05, y0: dHalf, x1: L, y1: 0, kind: 'refracted', medium: 'air' },
    { x0: -0.05, y0: -dHalf, x1: L, y1: 0, kind: 'refracted', medium: 'air' },
    { x0: -0.05, y0: dHalf, x1: L, y1: dx, kind: 'refracted', medium: 'air' },
    { x0: -0.05, y0: -dHalf, x1: L, y1: -dx, kind: 'refracted', medium: 'air' },
  ]
  const readings = { lambda_nm: lamNm, d_mm: dMm, L_m: L, dx_mm: dx * 1000 }
  const frames: OpticsFrame[] = []
  for (let i = 0; i <= 60; i++) frames.push({ t: i / 30, rays, readings })
  return frames
}
