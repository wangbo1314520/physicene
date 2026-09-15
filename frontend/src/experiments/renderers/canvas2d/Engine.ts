/**
 * Canvas2DEngine —— 2D 画布核心（B1 冻结接口）
 * 职责：图层栈 / 世界↔屏幕坐标变换（缩放平移）/ 统一指针事件（鼠标+触屏+触控笔）/
 *       撤销重做（快照命令栈）/ 网格吸附 / 命中测试 / 导出 PNG·SVG·JSON。
 * 框架无关：Vue 组件负责绑定 DOM，本类只认 canvas + 回调。
 */

export interface Point { x: number; y: number }

export interface Layer {
  id: string
  name: string
  /** 渲染（世界坐标系已由引擎变换好 ctx） */
  render(ctx: CanvasRenderingContext2D, view: ViewState): void
  /** 命中测试（世界坐标）→ 命中对象 key（供引擎回调层处理） */
  hitTest?(p: Point, view: ViewState): string | null
  /** 导出为 SVG 片段（可选；引擎导出 SVG 时逐层拼接） */
  toSvg?(view: ViewState): string
  /** 是否可交互（false 则事件穿透） */
  interactive?: boolean
  visible?: boolean
}

export interface ViewState {
  /** 缩放（像素/世界单位） */
  scale: number
  /** 世界原点在屏幕上的位置 */
  ox: number
  oy: number
  /** 画布 CSS 尺寸 */
  width: number
  height: number
}

export interface EngineOptions {
  /** 网格吸附间距（世界单位；0=关闭） */
  snap?: number
  /** 最大撤销步数 */
  undoLimit?: number
}

export type PointerTool = 'none' | 'pan' | 'draw' | 'select'

/** 指针事件统一抽象（鼠标/触屏/触控笔） */
export interface EnginePointerEvent {
  world: Point
  screen: Point
  button: number
  /** 触屏触笔：触点类型 */
  pointerType: string
  isPrimary: boolean
  shiftKey: boolean
  ctrlKey: boolean
}

export class Canvas2DEngine {
  view: ViewState
  layers: Layer[] = []
  snap: number
  locked = false

  onPointerDown?: (e: EnginePointerEvent) => boolean | void
  onPointerMove?: (e: EnginePointerEvent) => boolean | void
  onPointerUp?: (e: EnginePointerEvent) => void
  onWheel?: (e: { world: Point; deltaY: number }) => boolean | void
  onViewChange?: () => void

  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private undoStack: string[] = []
  private redoStack: string[] = []
  private undoLimit: number
  private raf = 0
  private cleanupFns: (() => void)[] = []

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.snap = opts.snap ?? 0
    this.undoLimit = opts.undoLimit ?? 50
    this.view = { scale: 40, ox: canvas.clientWidth / 2, oy: canvas.clientHeight / 2,
      width: canvas.clientWidth, height: canvas.clientHeight }
    this.bindEvents()
    this.requestRender()
  }

  // ===== 图层 =====
  addLayer(layer: Layer) {
    this.layers.push(layer)
    this.requestRender()
  }
  removeLayer(id: string) {
    this.layers = this.layers.filter((l) => l.id !== id)
    this.requestRender()
  }
  layer<T extends Layer = Layer>(id: string): T | undefined {
    return this.layers.find((l) => l.id === id) as T | undefined
  }

  // ===== 变换 =====
  toWorld(screen: Point): Point {
    return { x: (screen.x - this.view.ox) / this.view.scale,
             y: -(screen.y - this.view.oy) / this.view.scale }
  }
  toScreen(world: Point): Point {
    return { x: world.x * this.view.scale + this.view.ox,
             y: -world.y * this.view.scale + this.view.oy }
  }
  /** 平移（世界系增量） */
  pan(dx: number, dy: number) {
    this.view.ox += dx * this.view.scale
    this.view.oy -= dy * this.view.scale
    this.onViewChange?.()
    this.requestRender()
  }
  /** 以屏幕点为中心缩放 */
  zoomAt(screen: Point, factor: number) {
    const before = this.toWorld(screen)
    this.view.scale = Math.min(5000, Math.max(0.05, this.view.scale * factor))
    const after = this.toWorld(screen)
    this.view.ox += (after.x - before.x) * this.view.scale
    this.view.oy -= (after.y - before.y) * this.view.scale
    this.onViewChange?.()
    this.requestRender()
  }
  resetView(scale = 40) {
    this.view.scale = scale
    this.view.ox = this.view.width / 2
    this.view.oy = this.view.height / 2
    this.onViewChange?.()
    this.requestRender()
  }
  /** 自适应世界包围盒（留边距） */
  fitBounds(minX: number, maxX: number, minY: number, maxY: number, margin = 60) {
    const w = Math.max(1e-6, maxX - minX)
    const h = Math.max(1e-6, maxY - minY)
    // 画布小于两倍边距时可用区取下限，否则缩放为负 → 刻度循环永不越界（曾致渲染进程崩溃）
    const usableW = Math.max(40, this.view.width - 2 * margin)
    const usableH = Math.max(40, this.view.height - 2 * margin)
    let scale = Math.min(usableW / w, usableH / h)
    if (!Number.isFinite(scale) || scale <= 0) scale = 40
    this.view.scale = scale
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    this.view.ox = this.view.width / 2 - cx * this.view.scale
    this.view.oy = this.view.height / 2 + cy * this.view.scale
    this.onViewChange?.()
    this.requestRender()
  }

  snapPoint(p: Point): Point {
    if (!this.snap) return p
    return { x: Math.round(p.x / this.snap) * this.snap, y: Math.round(p.y / this.snap) * this.snap }
  }

  // ===== 撤销/重做（快照式：对 layers 序列化 JSON） =====
  snapshot(): string {
    return JSON.stringify(this.layers.map((l) => ({ id: l.id, name: l.name, data: (l as any).serialize?.() ?? null })))
  }
  pushUndo() {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > this.undoLimit) this.undoStack.shift()
    this.redoStack = []
  }
  undo() { this.restore(this.undoStack, this.redoStack) }
  redo() { this.restore(this.redoStack, this.undoStack) }
  private restore(from: string[], to: string[]) {
    const snap = from.pop()
    if (!snap) return
    to.push(this.snapshot())
    const parsed = JSON.parse(snap) as { id: string; data: any }[]
    for (const entry of parsed) {
      const layer = this.layer(entry.id)
      if (layer && entry.data != null) (layer as any).deserialize?.(entry.data)
    }
    this.requestRender()
  }

  // ===== 导出 =====
  exportPNG(): string {
    this.renderOnce()
    return this.canvas.toDataURL('image/png')
  }
  exportSVG(): string {
    const { width, height } = this.view
    const parts = this.layers.filter((l) => l.visible !== false)
      .map((l) => l.toSvg?.(this.view) ?? '').join('\n')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#14142a"/>${parts}</svg>`
  }

  requestRender() {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.renderOnce()
    })
  }
  renderOnce() {
    const { width, height } = this.view
    const dpr = window.devicePixelRatio || 1
    if (this.canvas.width !== width * dpr) {
      this.canvas.width = width * dpr
      this.canvas.height = height * dpr
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.fillStyle = '#14142a'
    this.ctx.fillRect(0, 0, width, height)
    for (const layer of this.layers) {
      if (layer.visible === false) continue
      layer.render(this.ctx, this.view)
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.cleanupFns.forEach((f) => f())
  }

  // ===== 事件（pointer events 统一三端；wheel 缩放；中键/空白右键平移） =====
  private bindEvents() {
    const cv = this.canvas
    let dragging = false
    let last: Point | null = null
    let panMode = false
    let panning = false

    const pos = (ev: PointerEvent | WheelEvent): Point => {
      const r = cv.getBoundingClientRect()
      return { x: ev.clientX - r.left, y: ev.clientY - r.top }
    }
    const emit = (ev: PointerEvent, phase: 'down' | 'move' | 'up') => {
      const screen = pos(ev)
      const world = this.toWorld(screen)
      const e: EnginePointerEvent = {
        world, screen, button: ev.button, pointerType: ev.pointerType,
        isPrimary: ev.isPrimary, shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey,
      }
      if (phase === 'down') return this.onPointerDown?.(e)
      if (phase === 'move') return this.onPointerMove?.(e)
      this.onPointerUp?.(e)
    }

    const onDown = (ev: PointerEvent) => {
      try { cv.setPointerCapture(ev.pointerId) } catch { /* 合成事件无 active pointer，忽略 */ }
      panMode = ev.button === 1 || ev.button === 2
      if (panMode || this.locked) {
        panning = panMode
        dragging = true
        last = pos(ev)
        return
      }
      dragging = emit(ev, 'down') !== false ? true : false
      last = pos(ev)
    }
    const onMove = (ev: PointerEvent) => {
      if (panning && dragging && last) {
        const cur = pos(ev)
        this.view.ox += cur.x - last.x
        this.view.oy += cur.y - last.y
        last = cur
        this.onViewChange?.()
        this.requestRender()
        return
      }
      if (dragging) emit(ev, 'move')
    }
    const onUp = (ev: PointerEvent) => {
      if (dragging) emit(ev, 'up')
      dragging = false
      panning = false
      last = null
    }
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      if (this.onWheel?.({ world: this.toWorld(pos(ev)), deltaY: ev.deltaY }) === false) return
      this.zoomAt(pos(ev), ev.deltaY > 0 ? 1 / 1.12 : 1.12)
    }
    const onCtx = (ev: Event) => ev.preventDefault()

    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointercancel', onUp)
    cv.addEventListener('wheel', onWheel, { passive: false })
    cv.addEventListener('contextmenu', onCtx)
    this.cleanupFns.push(() => {
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointercancel', onUp)
      cv.removeEventListener('wheel', onWheel)
      cv.removeEventListener('contextmenu', onCtx)
    })
  }
}

// ===== SVG 工具（图层导出用） =====
export function svgLine(view: ViewState, x1: number, y1: number, x2: number, y2: number,
                        stroke: string, width = 1.5, dash?: string): string {
  const a = { x: x1 * view.scale + view.ox, y: -y1 * view.scale + view.oy }
  const b = { x: x2 * view.scale + view.ox, y: -y2 * view.scale + view.oy }
  return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
}
export function svgCircle(view: ViewState, x: number, y: number, r: number, fill: string): string {
  const s = { x: x * view.scale + view.ox, y: -y * view.scale + view.oy }
  return `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${r}" fill="${fill}" />`
}
export function svgText(view: ViewState, x: number, y: number, text: string,
                        fill = '#e8e8f0', size = 12, anchor = 'start'): string {
  const s = { x: x * view.scale + view.ox, y: -y * view.scale + view.oy }
  return `<text x="${s.x.toFixed(1)}" y="${s.y.toFixed(1)}" fill="${fill}" font-size="${size}" text-anchor="${anchor}" font-family="Consolas,monospace">${text}</text>`
}
