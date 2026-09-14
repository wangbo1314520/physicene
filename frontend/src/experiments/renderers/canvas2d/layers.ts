/**
 * 2D 图形图层族（B1）：矢量 / 轨迹 / 光路 / 方格计数 / 场线。
 * 全部实现 Layer 形状（id/name/render/visible），供 Canvas2DEngine 使用。
 */
import type { ViewState } from './Engine'
import { svgLine, svgText } from './Engine'
import type { VectorState, TrajectoryState, OpticalState, GridCountState, FieldLineState } from '../../core/processedData'

function arrow(ctx: CanvasRenderingContext2D, view: ViewState,
               x1: number, y1: number, x2: number, y2: number, color: string, width = 2.5) {
  const a = { x: x1 * view.scale + view.ox, y: -y1 * view.scale + view.oy }
  const b = { x: x2 * view.scale + view.ox, y: -y2 * view.scale + view.oy }
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  // 箭头头部
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const head = 9 + width * 2
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - head * Math.cos(ang - 0.42), b.y - head * Math.sin(ang - 0.42))
  ctx.lineTo(b.x - head * Math.cos(ang + 0.42), b.y - head * Math.sin(ang + 0.42))
  ctx.closePath()
  ctx.fill()
  // 虚线平行四边形补全（力的合成）
  ctx.setLineDash([4, 4])
  ctx.lineWidth = 1
  ctx.strokeStyle = color + '66'
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(2 * b.x - a.x, 2 * b.y - a.y)
  ctx.stroke()
  ctx.setLineDash([])
}

/** 矢量图层：力的合成 / 运动的合成 */
export class VectorLayer {
  id = 'vector'
  name = '矢量图'
  visible = true
  interactive = true
  state: VectorState

  constructor(state: VectorState) { this.state = state }

  /** 合力 = A + B（由前两个非 resultant 箭头求和） */
  static resultantOf(a: { x2: number; y2: number }, b: { x2: number; y2: number }) {
    return { x: a.x2 + b.x2, y: a.y2 + b.y2 }
  }

  hitTest(p: { x: number; y: number }): string | null {
    // 箭头端点命中（容差 0.15）
    for (let i = this.state.arrows.length - 1; i >= 0; i--) {
      const a = this.state.arrows[i]
      if (Math.hypot(a.x2 - p.x, a.y2 - p.y) < 0.18) return `tip:${i}`
    }
    return null
  }

  render(ctx: CanvasRenderingContext2D, view: ViewState) {
    // 网格
    ctx.strokeStyle = '#23233a'
    ctx.lineWidth = 1
    const g = this.state.gridScale * view.scale
    ctx.beginPath()
    for (let x = view.ox % g; x < view.width; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, view.height) }
    for (let y = view.oy % g; y < view.height; y += g) { ctx.moveTo(0, y); ctx.lineTo(view.width, y) }
    ctx.stroke()
    for (const a of this.state.arrows) {
      arrow(ctx, view, a.x1, a.y1, a.x2, a.y2, a.color, a.resultant ? 3.5 : 2.5)
      const tx = a.x2 * view.scale + view.ox + 6
      const ty = -a.y2 * view.scale + view.oy - 6
      ctx.fillStyle = '#e8e8f0'
      ctx.font = '12px Consolas'
      ctx.fillText(`${a.name}=${Math.hypot(a.x2 - a.x1, a.y2 - a.y1).toFixed(1)}N`, tx, ty)
    }
  }
  serialize() { return this.state }
  deserialize(d: unknown) { this.state = JSON.parse(JSON.stringify(d)) as VectorState }
}

/** 轨迹图层：采样点连线（平抛/偏转） */
export class TrajectoryLayer {
  id = 'trajectory'
  name = '轨迹图'
  visible = true
  state: TrajectoryState

  constructor(state: TrajectoryState) { this.state = state }

  render(ctx: CanvasRenderingContext2D, view: ViewState) {
    const pts = this.state.samples
    if (!pts.length) return
    ctx.strokeStyle = '#4A90D9'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(pts[0].x * view.scale + view.ox, -pts[0].y * view.scale + view.oy)
    for (const p of pts) ctx.lineTo(p.x * view.scale + view.ox, -p.y * view.scale + view.oy)
    ctx.stroke()
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x * view.scale + view.ox, -p.y * view.scale + view.oy, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = '#F5C542'
      ctx.fill()
    }
  }
  serialize() { return this.state }
  deserialize(d: unknown) { this.state = JSON.parse(JSON.stringify(d)) as TrajectoryState }
}

/** 光路图层：折射光路（可调入射角）+ 双缝干涉条纹图样 */
export class OpticalLayer {
  id = 'optical'
  name = '光路图'
  visible = true
  state: OpticalState
  /** 折射界面 y=0；入射点在原点 */
  showSlit = false

  constructor(state: OpticalState) { this.state = state }

  render(ctx: CanvasRenderingContext2D, view: ViewState) {
    if (this.showSlit) { this.renderSlits(ctx, view); return }
    this.renderRefraction(ctx, view)
  }

  /** 折射：介质分界面 + 入射/折射/反射光线 + 角度标注 */
  private renderRefraction(ctx: CanvasRenderingContext2D, view: ViewState) {
    const cx = view.ox, cy = view.oy
    // 界面（玻璃砖上表面）
    ctx.strokeStyle = '#8a8aa0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, cy); ctx.lineTo(view.width, cy)
    ctx.stroke()
    ctx.fillStyle = '#4a90d918'
    ctx.fillRect(0, cy, view.width, view.height - cy)
    ctx.fillStyle = '#8a8aa0'
    ctx.font = '11px sans-serif'
    ctx.fillText('空气', 8, cy - 8)
    ctx.fillText('玻璃', 8, cy + 16)

    const L = 120
    for (const r of this.state.refraction ?? []) {
      const inc = (r.incidentDeg * Math.PI) / 180
      const ref = (r.refractDeg * Math.PI) / 180
      // 入射线（从左上方射向原点）
      ctx.strokeStyle = '#F5C542'
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(cx - L * Math.sin(inc), cy - L * Math.cos(inc))
      ctx.lineTo(cx, cy)
      ctx.stroke()
      // 折射线
      ctx.strokeStyle = '#3ecf8e'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + L * Math.sin(ref), cy + L * Math.cos(ref))
      ctx.stroke()
      // 法线
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = '#6c6c85'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy + L)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#F5C542'
      ctx.fillText(`${r.incidentDeg}°`, cx - 34, cy - L * Math.cos(inc) / 2)
      ctx.fillStyle = '#3ecf8e'
      ctx.fillText(`${r.refractDeg}°`, cx + 20, cy + L * Math.cos(ref) / 2)
      const n = Math.sin(inc) / Math.sin(ref)
      ctx.fillStyle = '#e8e8f0'
      ctx.fillText(`n = sin${r.incidentDeg}°/sin${r.refractDeg}° = ${n.toFixed(3)}`, 14, 28)
      break // 只画最新一组
    }
  }

  /** 双缝干涉强度条纹 I = I₀·cos²(πdy/λL)·sinc²(πay/λL) 简化为等间距条纹 */
  private renderSlits(ctx: CanvasRenderingContext2D, view: ViewState) {
    const ds = this.state.doubleSlit
    if (!ds) return
    const { lambdaNm, dMm, Lm } = ds
    // Δy = λL/d（mm）
    const fringeMm = (lambdaNm * 1e-9 * Lm) / (dMm * 1e-3) * 1000
    // 条纹区域
    const barW = Math.min(360, view.width - 80)
    const x0 = (view.width - barW) / 2
    const y0 = 60, H = 140
    // 强度剖面 → 颜色
    for (let i = 0; i < barW; i++) {
      const yMm = ((i / barW) * 2 - 1) * fringeMm * 6 // 展示 ±3 级
      const beta = Math.PI * (dMm * 1e-3) * (yMm * 1e-3) / (lambdaNm * 1e-9) / (Lm)
      const sinc = beta === 0 ? 1 : Math.sin(beta) / beta
      const I = Math.cos(beta) ** 2 * sinc ** 2
      const bright = Math.round(40 + 215 * I)
      ctx.fillStyle = `rgb(${bright},${bright},${Math.round(bright * 0.92)})`
      ctx.fillRect(x0 + i, y0, 1, H)
    }
    ctx.strokeStyle = '#2f2f4a'
    ctx.strokeRect(x0, y0, barW, H)
    ctx.fillStyle = '#8a8aa0'
    ctx.font = '12px Consolas'
    ctx.fillText(`λ=${lambdaNm}nm  d=${dMm}mm  L=${Lm}m  →  Δy = λL/d = ${fringeMm.toFixed(3)} mm`, x0, y0 + H + 22)
    // 刻度
    const px = fringeMm / (fringeMm * 12) * barW
    ctx.strokeStyle = '#3ecf8e'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(view.width / 2, y0 - 6); ctx.lineTo(view.width / 2, y0 + H + 6)
    ctx.moveTo(view.width / 2 + px, y0 - 6); ctx.lineTo(view.width / 2 + px, y0 + H + 6)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#3ecf8e'
    ctx.fillText('Δy', view.width / 2 + px / 2, y0 - 10)
  }

  /** 估算波长（学生测 Δy → λ = Δy·d/L） */
  static lambdaFromMf(measuredMm: number, dMm: number, Lm: number): number {
    return (measuredMm * 1e-3 * dMm * 1e-3 / Lm) * 1e9 // nm
  }

  serialize() { return { ...this.state, showSlit: this.showSlit } }
  deserialize(d: any) { this.state = { refraction: d.refraction, doubleSlit: d.doubleSlit, measuredFringeMm: d.measuredFringeMm, derived: d.derived }; this.showSlit = !!d.showSlit }
}

/** 方格计数图层（油膜法）：随机轮廓 + 点击标记格子 */
export class GridCountLayer {
  id = 'grid'
  name = '方格计数'
  visible = true
  interactive = true
  state: GridCountState
  /** 轮廓（固定种子生成的油膜形状，1 格 = 1cm） */
  outline: { x: number; y: number }[] = []

  constructor(state: GridCountState, outline?: { x: number; y: number }[]) {
    this.state = state
    this.outline = outline ?? []
  }

  render(ctx: CanvasRenderingContext2D, view: ViewState) {
    // 网格（1 格 = state.cellSize 世界单位）
    const cs = this.state.cellSize * view.scale
    ctx.strokeStyle = '#23233a'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = view.ox % cs; x < view.width; x += cs) { ctx.moveTo(x, 0); ctx.lineTo(x, view.height) }
    for (let y = view.oy % cs; y < view.height; y += cs) { ctx.moveTo(0, y); ctx.lineTo(view.width, y) }
    ctx.stroke()
    // 已标记格子
    for (const m of this.state.marked) {
      ctx.fillStyle = '#4a90d955'
      ctx.fillRect(m.c * cs + view.ox, -((m.r + 1) * cs) + view.oy, cs, cs)
    }
    // 油膜轮廓
    if (this.outline.length > 2) {
      ctx.strokeStyle = '#F5C542'
      ctx.lineWidth = 2
      ctx.beginPath()
      this.outline.forEach((p, i) => {
        const s = { x: p.x * view.scale + view.ox, y: -p.y * view.scale + view.oy }
        i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)
      })
      ctx.closePath()
      ctx.stroke()
      ctx.fillStyle = '#f5c54215'
      ctx.fill()
    }
    // 统计
    const count = this.state.marked.length
    const area = count * this.state.cellSize ** 2
    ctx.fillStyle = '#e8e8f0'
    ctx.font = '13px Consolas'
    ctx.fillText(`已标记 ${count} 格 ≈ ${area.toFixed(1)} cm²`, 14, 28)
  }

  hitCell(world: { x: number; y: number }): { c: number; r: number } {
    return { c: Math.floor(world.x / this.state.cellSize), r: Math.floor(world.y / this.state.cellSize) }
  }
  toggleMark(cell: { c: number; r: number }) {
    const i = this.state.marked.findIndex((m) => m.c === cell.c && m.r === cell.r)
    if (i >= 0) this.state.marked.splice(i, 1)
    else this.state.marked.push(cell)
  }
  serialize() { return this.state }
  deserialize(d: unknown) { this.state = JSON.parse(JSON.stringify(d)) as GridCountState }
}

/** 场线图层（预留渲染）：点电荷辐射状场线 */
export class FieldLineLayer {
  id = 'fieldlines'
  name = '场线'
  visible = true
  state: FieldLineState

  constructor(state: FieldLineState) { this.state = state }

  render(ctx: CanvasRenderingContext2D, view: ViewState) {
    const { charges, linesPerCharge } = this.state
    ctx.lineWidth = 1.2
    for (const ch of charges) {
      const sign = Math.sign(ch.q)
      for (let i = 0; i < linesPerCharge; i++) {
        const ang = (i / linesPerCharge) * Math.PI * 2
        ctx.strokeStyle = ch.q > 0 ? '#E0555599' : '#4A90D999'
        ctx.beginPath()
        for (let r = 0.5; r < 6; r += 0.3) {
          // 场线弯曲（多电荷叠加导向）
          let dx = Math.cos(ang), dy = Math.sin(ang)
          for (const other of charges) {
            if (other === ch) continue
            const rx = ch.x + r * dx - other.x, ry = ch.y + r * dy - other.y
            const d2 = rx * rx + ry * ry + 0.01
            const f = (other.q * sign > 0 ? 0.02 : -0.02) / d2
            dx += f * rx; dy += f * ry
          }
          const len = Math.hypot(dx, dy) || 1
          const px = (ch.x + (r * dx) / len) * view.scale + view.ox
          const py = -(ch.y + (r * dy) / len) * view.scale + view.oy
          r === 0.5 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.stroke()
        // 箭头方向
      }
    }
    // 电荷本体
    for (const ch of charges) {
      const x = ch.x * view.scale + view.ox, y = -ch.y * view.scale + view.oy
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fillStyle = ch.q > 0 ? '#E05555' : '#4A90D9'
      ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(ch.q > 0 ? '+' : '−', x, y + 5)
      ctx.textAlign = 'left'
    }
  }
  serialize() { return this.state }
  deserialize(d: unknown) { this.state = JSON.parse(JSON.stringify(d)) as FieldLineState }
}
