/**
 * B9 多过程引擎（MultiProcessEngine）：高考/竞赛场景共用
 *  - ProcessTimeline：过程分段（名称/起止/颜色），自动记录切换点（临界）
 *  - crossing：临界检测——在一步内用线性插值精确定位量 f 穿越阈值的时刻（共速、脱离、到最高点…）
 *  - EnergyMomentumTracker：多体动能 / 势能 / 动量实时汇总
 */

export interface Segment { name: string; t0: number; t1: number; color: string; note?: string }

export class ProcessTimeline {
  readonly segments: Segment[] = []
  readonly events: { t: number; text: string }[] = []
  start(name: string, color: string, t = 0, note?: string) {
    this.segments.length = 0; this.events.length = 0
    this.segments.push({ name, t0: t, t1: t, color, note })
  }
  /** 切换到新过程（记录临界事件） */
  switchTo(name: string, color: string, t: number, event?: string, note?: string) {
    const cur = this.segments[this.segments.length - 1]
    if (cur) cur.t1 = t
    this.segments.push({ name, t0: t, t1: t, color, note })
    if (event) this.events.push({ t, text: event })
  }
  advance(t: number) { const cur = this.segments[this.segments.length - 1]; if (cur) cur.t1 = t }
  log(t: number, text: string) { this.events.push({ t, text }) }
  get current(): Segment | undefined { return this.segments[this.segments.length - 1] }
  get duration(): number { return this.current?.t1 ?? 0 }
  /** 绘制到 2D 画布的一条横带 */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h = 10, tEnd = Math.max(1, this.duration)) {
    ctx.fillStyle = '#23233a'; ctx.fillRect(x, y, w, h)
    for (const s of this.segments) {
      ctx.fillStyle = s.color
      ctx.fillRect(x + (s.t0 / tEnd) * w, y, Math.max(2, ((s.t1 - s.t0) / tEnd) * w), h)
    }
    ctx.fillStyle = '#e8e8f0'
    for (const e of this.events) { const ex = x + (e.t / tEnd) * w; ctx.fillRect(ex - 1, y - 3, 2, h + 6) }
  }
}

/** 一步内 f 从 fPrev 到 fNext 穿越 0（或阈值）的比例位置 α∈[0,1]；未穿越返回 null */
export function crossing(fPrev: number, fNext: number, threshold = 0): number | null {
  const a = fPrev - threshold, b = fNext - threshold
  if (a === 0) return 0
  if ((a > 0 && b >= 0) || (a < 0 && b <= 0)) return null
  return a / (a - b)
}

export interface Body { name: string; m: number; x: number; y: number; vx: number; vy: number; color?: string }

export class EnergyMomentumTracker {
  constructor(readonly g = 9.8) {}
  kinetic(b: Body): number { return 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy) }
  potential(b: Body, yRef = 0): number { return b.m * this.g * (b.y - yRef) }
  totals(bodies: Body[], yRef = 0, extra: { heat?: number; spring?: number } = {}) {
    const Ek = bodies.reduce((s, b) => s + this.kinetic(b), 0)
    const Ep = bodies.reduce((s, b) => s + this.potential(b, yRef), 0)
    const px = bodies.reduce((s, b) => s + b.m * b.vx, 0)
    const py = bodies.reduce((s, b) => s + b.m * b.vy, 0)
    const Q = extra.heat ?? 0, Es = extra.spring ?? 0
    return { Ek, Ep, Es, Q, E: Ek + Ep + Es + Q, px, py, p: Math.hypot(px, py) }
  }
  /** 画能量条（每项相对 E0 归一） */
  drawBars(ctx: CanvasRenderingContext2D, x: number, y: number, items: { name: string; value: number; color: string }[], E0: number, w = 120) {
    items.forEach((it, i) => {
      const yy = y + i * 18
      ctx.fillStyle = '#23233a'; ctx.fillRect(x + 90, yy, w, 10)
      ctx.fillStyle = it.color; ctx.fillRect(x + 90, yy, Math.max(0, Math.min(w, (it.value / Math.max(1e-9, E0)) * w)), 10)
      ctx.fillStyle = '#8a8aa0'; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(`${it.name} ${it.value.toFixed(2)} J`, x, yy + 5)
    })
  }
}

/** 定步长子步积分器：把一帧 dt 切成 ≤ h 的小步，回调返回 false 可提前终止 */
export function substep(dt: number, h: number, fn: (d: number) => boolean | void) {
  let acc = dt
  while (acc > 1e-12) {
    const d = Math.min(h, acc); acc -= d
    if (fn(d) === false) break
  }
}
