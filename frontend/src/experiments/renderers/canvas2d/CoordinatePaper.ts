/**
 * CoordinatePaper —— 坐标纸图层（B1 核心）：网格/坐标轴/多数据集描点/拟合线/误差棒/
 * 异常点/残差小图/图例/公式。交互（描点/拖动/删除）由 GraphPaper.vue 绑定引擎事件后
 * 调用本类方法。serialize/deserialize 支撑撤销重做。
 */
import type { ViewState } from './Engine'
import { svgCircle, svgLine, svgText } from './Engine'
import type { PaperState, PaperPoint, PaperSeries } from '../../core/processedData'

const AXIS = '#6c6c85'
const GRID = '#23233a'
const TEXT = '#8a8aa0'

export class CoordinatePaperLayer {
  id = 'paper'
  name = '坐标纸'
  interactive = true
  visible = true
  state: PaperState

  /** 拖拽中的点（高亮） */
  draggingKey: string | null = null
  hoverKey: string | null = null

  constructor(state: PaperState) {
    this.state = state
  }

  series(id?: string): PaperSeries | undefined {
    if (id) return this.state.series.find((s) => s.id === id)
    return this.state.series[0]
  }

  /** 命中：返回 `${seriesId}:${index}` */
  hitPoint(world: { x: number; y: number }, tolWorld = 0.05): string | null {
    for (const s of this.state.series) {
      for (let i = s.points.length - 1; i >= 0; i--) {
        const p = s.points[i]
        if (Math.abs(p.x - world.x) <= tolWorld && Math.abs(p.y - world.y) <= tolWorld) {
          return `${s.id}:${i}`
        }
      }
    }
    return null
  }

  addPoint(seriesId: string, p: PaperPoint) {
    this.series(seriesId)?.points.push(p)
  }
  movePoint(key: string, x: number, y: number) {
    const [sid, i] = this.parseKey(key)
    const p = this.series(sid)?.points[+i]
    if (p) { p.x = x; p.y = y }
  }
  removePoint(key: string) {
    const [sid, i] = this.parseKey(key)
    const s = this.series(sid)
    if (s) s.points.splice(+i, 1)
  }
  toggleOutlier(key: string) {
    const [sid, i] = this.parseKey(key)
    const p = this.series(sid)?.points[+i]
    if (p) p.outlier = !p.outlier
  }
  private parseKey(key: string): [string, number] {
    const i = key.indexOf(':')
    return [key.slice(0, i), Number(key.slice(i + 1))]
  }

  // ===== 渲染 =====
  render(ctx: CanvasRenderingContext2D, view: ViewState) {
    this.drawGrid(ctx, view)
    this.drawAxes(ctx, view)
    for (const s of this.state.series) {
      this.drawSeries(ctx, view, s)
    }
    if (this.state.showFitLine) this.drawFits(ctx, view)
    if (this.state.showResiduals) this.drawResiduals(ctx, view)
    this.drawLegend(ctx, view)
    if (this.state.showFormula) this.drawFormula(ctx, view)
  }

  /** 数据包围盒（自动量程用） */
  bounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const s of this.state.series) {
      for (const p of s.points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
    }
    if (!Number.isFinite(minX)) return { minX: 0, maxX: 10, minY: 0, maxY: 10 }
    return { minX, maxX, minY, maxY }
  }

  private sx(view: ViewState, x: number) { return x * view.scale + view.ox }
  private sy(view: ViewState, y: number) { return -y * view.scale + view.oy }

  private drawGrid(ctx: CanvasRenderingContext2D, view: ViewState) {
    // 1 世界单位主网格；缩放大时细分
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    const stepWorld = view.scale > 80 ? 0.5 : view.scale > 25 ? 1 : 5
    const x0 = Math.floor(this.toWorldX(view, 0) / stepWorld) * stepWorld
    const x1 = this.toWorldX(view, view.width)
    ctx.beginPath()
    for (let x = x0; x <= x1; x += stepWorld) {
      const s = this.sx(view, x)
      ctx.moveTo(s, 0); ctx.lineTo(s, view.height)
    }
    const y0 = Math.floor(this.toWorldY(view, view.height) / stepWorld) * stepWorld
    const y1 = this.toWorldY(view, 0)
    for (let y = y0; y <= y1; y += stepWorld) {
      const s = this.sy(view, y)
      ctx.moveTo(0, s); ctx.lineTo(view.width, s)
    }
    ctx.stroke()
  }

  private drawAxes(ctx: CanvasRenderingContext2D, view: ViewState) {
    const a = this.state.axes
    ctx.strokeStyle = AXIS
    ctx.lineWidth = 1.5
    const ox = this.sx(view, 0), oy = this.sy(view, 0)
    ctx.beginPath()
    ctx.moveTo(0, oy); ctx.lineTo(view.width, oy)
    ctx.moveTo(ox, 0); ctx.lineTo(ox, view.height)
    ctx.stroke()
    ctx.fillStyle = TEXT
    ctx.font = '12px Consolas,monospace'
    ctx.fillText(`${a.xLabel}${a.xUnit ? ' / ' + a.xUnit : ''}`, view.width - 90, oy - 8)
    ctx.fillText(`${a.yLabel}${a.yUnit ? ' / ' + a.yUnit : ''}`, ox + 8, 14)
    // 刻度
    const stepWorld = view.scale > 80 ? 0.5 : view.scale > 25 ? 1 : 5
    ctx.textAlign = 'center'
    for (let x = Math.ceil(x0Tick(view, stepWorld) / stepWorld) * stepWorld; ; x += stepWorld) {
      const s = this.sx(view, x)
      if (s > view.width) break
      if (Math.abs(x) < 1e-9) continue
      ctx.fillRect(s - 0.5, oy - 4, 1, 8)
      ctx.fillText(fmtTick(x, stepWorld), s, oy + 16)
    }
    ctx.textAlign = 'right'
    for (let y = 0; ; y += stepWorld) {
      const s = this.sy(view, y)
      if (s < 0) break
      if (y > 0) { ctx.fillRect(ox - 4, s - 0.5, 8, 1); ctx.fillText(fmtTick(y, stepWorld), ox - 8, s + 4) }
      const sNeg = this.sy(view, -y)
      if (sNeg < view.height && y > 0) { ctx.fillRect(ox - 4, sNeg - 0.5, 8, 1); ctx.fillText(fmtTick(-y, stepWorld), ox - 8, sNeg + 4) }
    }
    ctx.textAlign = 'left'
  }

  private drawSeries(ctx: CanvasRenderingContext2D, view: ViewState, s: PaperSeries) {
    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i]
      const x = this.sx(view, p.x), y = this.sy(view, p.y)
      // 误差棒
      if (this.state.showErrorBars && p.sy != null && p.sy > 0) {
        ctx.strokeStyle = s.color + '99'
        ctx.lineWidth = 1
        const h = p.sy * view.scale
        ctx.beginPath()
        ctx.moveTo(x, y - h); ctx.lineTo(x, y + h)
        ctx.moveTo(x - 4, y - h); ctx.lineTo(x + 4, y - h)
        ctx.moveTo(x - 4, y + h); ctx.lineTo(x + 4, y + h)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(x, y, p.outlier ? 5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = p.outlier ? '#e05555' : s.color
      if (p.manual) ctx.fillStyle = '#3ecf8e'
      ctx.fill()
      const key = `${s.id}:${i}`
      if (key === this.draggingKey || key === this.hoverKey) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }

  private drawFits(ctx: CanvasRenderingContext2D, view: ViewState) {
    for (const fit of this.state.fits) {
      const s = this.series(fit.seriesId)
      if (!s || !Number.isFinite(fit.k)) continue
      ctx.strokeStyle = s.color
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5
      const b = this.bounds()
      const x1 = b.minX - 1, x2 = b.maxX + 1
      ctx.beginPath()
      ctx.moveTo(this.sx(view, x1), this.sy(view, fit.k * x1 + fit.b))
      ctx.lineTo(this.sx(view, x2), this.sy(view, fit.k * x2 + fit.b))
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  /** 残差小图（右下角内嵌 120×70） */
  private drawResiduals(ctx: CanvasRenderingContext2D, view: ViewState) {
    for (const fit of this.state.fits) {
      const s = this.series(fit.seriesId)
      if (!s) continue
      const W = 130, H = 64
      const px = view.width - W - 12, py = view.height - H - 12
      ctx.fillStyle = '#191930'
      ctx.fillRect(px, py, W, H)
      ctx.strokeStyle = '#2f2f4a'
      ctx.strokeRect(px, py, W, H)
      const maxR = Math.max(1e-9, ...fit.residuals.filter((v) => v != null).map(Math.abs))
      ctx.fillStyle = TEXT
      ctx.font = '9px Consolas'
      ctx.fillText('残差', px + 4, py + 10)
      for (let i = 0; i < s.points.length; i++) {
        const r = fit.residuals[i]
        if (r == null) continue
        const cx = px + 10 + (i / Math.max(1, s.points.length - 1)) * (W - 20)
        const cy = py + H / 2 - (r / maxR) * (H / 2 - 10)
        ctx.fillStyle = s.points[i].outlier ? '#e05555' : s.color
        ctx.fillRect(cx - 2, cy - 2, 4, 4)
      }
      ctx.strokeStyle = '#3d3d5e'
      ctx.beginPath()
      ctx.moveTo(px + 8, py + H / 2); ctx.lineTo(px + W - 8, py + H / 2)
      ctx.stroke()
    }
  }

  private drawLegend(ctx: CanvasRenderingContext2D, view: ViewState) {
    if (this.state.series.length < 2) return
    ctx.font = '11px sans-serif'
    let y = 30
    for (const s of this.state.series) {
      ctx.fillStyle = s.color
      ctx.fillRect(12, y - 8, 10, 4)
      ctx.fillStyle = TEXT
      ctx.fillText(s.name, 28, y - 3)
      y += 16
    }
  }

  private drawFormula(ctx: CanvasRenderingContext2D, view: ViewState) {
    const fit = this.state.fits[0]
    if (!fit || !Number.isFinite(fit.k)) return
    ctx.fillStyle = '#e8e8f0'
    ctx.font = '13px Consolas,monospace'
    const kStr = fit.k.toFixed(3)
    const bStr = Math.abs(fit.b) < 1e-9 ? '' : (fit.b >= 0 ? ' + ' : ' − ') + Math.abs(fit.b).toFixed(3)
    ctx.fillText(`y = ${kStr}x${bStr}`, 14, 26)
    ctx.fillStyle = TEXT
    ctx.font = '11px Consolas'
    ctx.fillText(`R² = ${fit.r2.toFixed(4)}   n = ${fit.n}`, 14, 42)
  }

  toSvg(view: ViewState): string {
    let out = ''
    for (const s of this.state.series) {
      for (const p of s.points) {
        out += svgCircle(view, p.x, p.y, 4, p.outlier ? '#e05555' : s.color)
      }
    }
    for (const fit of this.state.fits) {
      const s = this.series(fit.seriesId)
      if (!s || !Number.isFinite(fit.k)) continue
      const b = this.bounds()
      const x1 = b.minX - 1, x2 = b.maxX + 1
      out += svgLine(view, x1, fit.k * x1 + fit.b, x2, fit.k * x2 + fit.b, s.color, 1.5, '6,4')
    }
    const fit = this.state.fits[0]
    if (fit && Number.isFinite(fit.k)) {
      out += svgText(view, this.toInvX(view, 14), this.toInvY(view, 26),
        `y = ${fit.k.toFixed(3)}x${Math.abs(fit.b) > 1e-9 ? ' + ' + fit.b.toFixed(3) : ''}   R²=${fit.r2.toFixed(4)}`)
    }
    return out
  }
  private toInvX(view: ViewState, screenX: number) { return (screenX - view.ox) / view.scale }
  private toInvY(view: ViewState, screenY: number) { return -(screenY - view.oy) / view.scale }

  // 撤销重做支撑
  serialize() { return this.state }
  deserialize(data: unknown) { this.state = JSON.parse(JSON.stringify(data)) as PaperState }

  private toWorldX(view: ViewState, screenX: number) { return (screenX - view.ox) / view.scale }
  private toWorldY(view: ViewState, screenY: number) { return -(screenY - view.oy) / view.scale }
}

function x0Tick(view: ViewState, step: number) { return (0 - view.ox) / view.scale - step }
function fmtTick(v: number, step: number) {
  const dec = step < 1 ? 1 : 0
  return v.toFixed(dec)
}
