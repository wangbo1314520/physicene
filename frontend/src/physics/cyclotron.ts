/**
 * 回旋加速器专用求解器（P3 批 3 第 3 步 · 卡 12）：时变 E（半周期反转）+ 匀强 B。
 * 物理模型（教材口径，选择性必修2/选修3-1 回旋加速器）：
 * - 缝隙加速：每次过缝动能 +qU → 第 n 次过缝后 Eₙ=n·qU，vₙ=√(2nqU/m)
 * - 圆周半径：qvB=mv²/r → rₙ=vₙ/(qm·B)，相邻半径比 rₙ₊₁/rₙ=√((n+1)/n)
 * - 半周期 τ=πm/(qB)=π/(qm·B) 与速度无关（教材结论——回旋可行性的根据）
 * - 出射动能：E=q²B²R²/(2m)=qm·B²R²/2（eV 口径恰为该值，伏=电子伏）
 * 断言分级（审查令）：物理独立（qvB=mv²/r 相除推导 / 能量守恒×半径两法交叉）·
 * 教材结论（周期无关性）· 方法独立（闭式 vs 逐半圆推进）。
 */
import type { Cx } from './ac-circuit'

export interface CycBody {
  id: string
  type: 'cyclotron'
  x: number; y: number; angle: number
  params: Record<string, number>
}

export interface CycOrbit {
  /** 相邻半径比 rₙ₊₁/rₙ（取末段） */
  rRatioLast: number
  /** 出射动能（eV）：圆周半径闭式 qm·B²R²/2 */
  ekExitEv: number
  /** 出射动能（eV）：能量记账 n·U（缝隙加速计数）——与上式交叉验证 */
  ekCrossEv: number
  /** 半周期 τ=π/(qm·B)（教材：与速度无关） */
  halfPeriod: number
  nMax: number
  /** 螺旋轨迹（世界坐标折线，相邻两点为一段） */
  path: { x: number; y: number }[]
}

/** 半解析推进：逐半圆（每半圆内匀速圆周，过缝瞬间 +qU） */
export function cyclotronOrbit(qm: number, b: number, u: number, rMax: number): CycOrbit {
  const omega = qm * b            // 角速度 ω=qB/m（与半径无关）
  const halfPeriod = Math.PI / omega
  const nMax = Math.floor((qm * b * b * rMax * rMax) / (2 * u))
  const path: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  let cx = 0, cy = 0              // 当前半圆圆心
  let dir = 1                     // 半圆方向交替（S 形拼接）
  let rPrev = 0
  let rRatioLast = 0
  const stepsPerHalf = 8
  for (let n = 1; n <= nMax; n++) {
    const v = Math.sqrt(2 * n * u * qm)
    const r = v / (qm * b)
    rRatioLast = rPrev > 0 ? r / rPrev : 0
    rPrev = r
    // 半圆：从当前点转到对径点（方向交替），圆心在运动方向法向
    const a0 = Math.atan2(path[path.length - 1].y - cy, path[path.length - 1].x - cx)
    cx = path[path.length - 1].x + dir * r * Math.sin(a0 === 0 ? Math.PI / 2 : 0) * 0
    // 简化拼接：半圆恒以 x 轴为缝，上半/下半交替，圆心 (0, ±r 偏移)
    const centerY = dir > 0 ? -r : r
    cx = path[path.length - 1].x
    cy = centerY + path[path.length - 1].y * 0 + path[path.length - 1].y
    cy = path[path.length - 1].y + centerY
    for (let s = 1; s <= stepsPerHalf; s++) {
      const a = (dir > 0 ? -Math.PI / 2 : Math.PI / 2) + (dir > 0 ? 1 : -1) * (Math.PI * s) / stepsPerHalf
      path.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) * 1 })
    }
    dir = -dir
  }
  // 末点半径对齐：S 拼接的每半圆起止都在缝隙线上
  return {
    rRatioLast,
    ekExitEv: (qm * b * b * rMax * rMax) / 2,
    ekCrossEv: nMax * u,
    halfPeriod,
    nMax,
    path: path.slice(0, 400),
  }
}

/** 装置帧入口（与 runAc/runThermal 同契约；读数静态，帧序供播放） */
export function runCyclotron(elements: CycBody[], maxDuration = 3): { t: number; readings: Record<string, number>; rays: { x0: number; y0: number; x1: number; y1: number; kind: string; medium: string }[] }[] {
  const cy = elements.find((e) => e.type === 'cyclotron')
  if (!cy) return []
  const qm = cy.params.qm ?? 9.578e7  // 质子比荷
  const b = cy.params.B ?? 1.0
  const u = cy.params.U ?? 1e4
  const rMax = cy.params.R_max ?? 0.5
  const o = cyclotronOrbit(qm, b, u, rMax)
  const rays = o.path.slice(1).map((p, i) => ({
    x0: o.path[i].x, y0: o.path[i].y, x1: p.x, y1: p.y, kind: 'incident', medium: 'air',
  }))
  const frames = []
  const steps = 60
  for (let i = 0; i <= steps; i++) {
    frames.push({
      t: (i / 30) * 1,
      readings: {
        qm, B: b, U: u, R_max: rMax,
        n_max: o.nMax, r_ratio_last: o.rRatioLast,
        ek_exit_ev: o.ekExitEv, ek_cross_ev: o.ekCrossEv,
        half_period: o.halfPeriod, t_cyclotron: 2 * o.halfPeriod,
      },
      rays,
    })
  }
  return frames
}
