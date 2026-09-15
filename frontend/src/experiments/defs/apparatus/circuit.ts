/**
 * 电路元件 Canvas 绘制原语（教材符号标准画法，供 RC/伏安法/自感/LC 等电路实验共用）。
 * 约定：横向导线沿 y 中线，纵向沿 x 中线；线宽 2，颜色 #d9a05a（铜）/ #8a8aa0（普通）。
 */

export type Ctx = CanvasRenderingContext2D

const WIRE = '#8a8aa0'
const CU = '#d9a05a'

export function wire(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color = WIRE) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** 电池（长线=正极，短线=负极），纵向放置在竖直导线上 */
export function battery(ctx: Ctx, x: number, y: number, plus = true) {
  const long = 22, short = 12
  wire(ctx, x, y - 26, x, y - long / 2 - 4)
  wire(ctx, x, y + 26, x, y + short / 2 + 4)
  // 长线（正极在上）
  ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(x - long / 2, y - long / 2); ctx.lineTo(x + long / 2, y - long / 2); ctx.stroke()
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(x - short / 2, y + short / 2); ctx.lineTo(x + short / 2, y + short / 2); ctx.stroke()
  if (!plus) ctx.scale(1, 1) // 极性反转时由调用方翻转画布
  label(ctx, plus ? '+' : '−', x + 16, y - 14)
}

/** 交流电源（圆圈内正弦） */
export function acSource(ctx: Ctx, x: number, y: number, r = 18) {
  wire(ctx, x, y - r - 10, x, y - r)
  wire(ctx, x, y + r + 10, x, y + r)
  ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const px = x - r * 0.6 + t * r * 1.2
    const py = y + Math.sin(t * Math.PI * 2) * r * 0.32
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.stroke()
}

/** 电阻（矩形），horizontal 沿水平导线 */
export function resistor(ctx: Ctx, x: number, y: number, horizontal = true, name = 'R') {
  const w = 44, h = 18
  if (horizontal) {
    wire(ctx, x - w / 2 - 10, y, x - w / 2, y)
    wire(ctx, x + w / 2, y, x + w / 2 + 10, y)
    ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2
    ctx.strokeRect(x - w / 2, y - h / 2, w, h)
  } else {
    wire(ctx, x, y - h / 2 - 10, x, y - h / 2)
    wire(ctx, x, y + h / 2, x, y + h / 2 + 10)
    ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2
    ctx.strokeRect(x - h / 2, y - w / 2, h, w)
  }
  label(ctx, name, x, y - (horizontal ? 18 : 26))
}

/** 电容器（双平行线，垂直于导线方向） */
export function capacitor(ctx: Ctx, x: number, y: number, horizontal = true, name = 'C') {
  const gap = 8, len = 22
  ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 3
  if (horizontal) {
    wire(ctx, x - gap - 10, y, x - gap / 2, y)
    wire(ctx, x + gap / 2, y, x + gap + 10, y)
    ctx.beginPath(); ctx.moveTo(x - gap / 2, y - len / 2); ctx.lineTo(x - gap / 2, y + len / 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + gap / 2, y - len / 2); ctx.lineTo(x + gap / 2, y + len / 2); ctx.stroke()
  } else {
    wire(ctx, x, y - gap - 10, x, y - gap / 2)
    wire(ctx, x, y + gap / 2, x, y + gap + 10)
    ctx.beginPath(); ctx.moveTo(x - len / 2, y - gap / 2); ctx.lineTo(x + len / 2, y - gap / 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - len / 2, y + gap / 2); ctx.lineTo(x + len / 2, y + gap / 2); ctx.stroke()
  }
  label(ctx, name, x + 18, y)
}

/** 电感（四个半圆弧） */
export function inductor(ctx: Ctx, x: number, y: number, horizontal = true, name = 'L') {
  ctx.strokeStyle = CU; ctx.lineWidth = 2.5
  const r = 7, n = 4
  ctx.beginPath()
  if (horizontal) {
    wire(ctx, x - (n * r + 10), y, x - n * r, y, CU)
    wire(ctx, x + n * r, y, x + n * r + 10, y, CU)
    for (let i = 0; i < n; i++) ctx.arc(x - n * r + r + i * 2 * r, y, r, Math.PI, 0)
  } else {
    wire(ctx, x, y - (n * r + 10), x, y - n * r, CU)
    wire(ctx, x, y + n * r, x, y + n * r + 10, CU)
    for (let i = 0; i < n; i++) ctx.arc(x, y - n * r + r + i * 2 * r, r, -Math.PI / 2, Math.PI / 2)
  }
  ctx.stroke()
  label(ctx, name, x, y - (horizontal ? 16 : n * r + 16))
}

/** 小灯泡（圆 + 交叉），亮度 0~1 */
export function lamp(ctx: Ctx, x: number, y: number, brightness: number) {
  const r = 14
  wire(ctx, x, y - r - 10, x, y - r)
  wire(ctx, x, y + r, x, y + r + 10)
  const glow = ctx.createRadialGradient(x, y, 2, x, y, r * 2.2)
  const a = 0.55 * brightness
  glow.addColorStop(0, `rgba(245,197,66,${a})`)
  glow.addColorStop(1, 'rgba(245,197,66,0)')
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = brightness > 0.05 ? '#F5C542' : '#8a8aa0'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.7); ctx.lineTo(x + r * 0.7, y + r * 0.7)
  ctx.moveTo(x + r * 0.7, y - r * 0.7); ctx.lineTo(x - r * 0.7, y + r * 0.7); ctx.stroke()
}

/** 开关（闭合/断开） */
export function switchSym(ctx: Ctx, x: number, y: number, closed: boolean, horizontal = true) {
  const w = 34
  wire(ctx, x - w / 2 - 10, y, x - w / 2, y)
  wire(ctx, x + w / 2, y, x + w / 2 + 10, y)
  ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.arc(x - w / 2, y, 3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + w / 2, y, 3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath()
  closed ? ctx.moveTo(x - w / 2, y) : ctx.moveTo(x - w / 2, y)
  ctx.lineTo(closed ? x + w / 2 : x + w / 2 - 4, closed ? y : y - 18)
  ctx.stroke()
}

/** 圆形表计（A/V），指针按 value/vmax 偏转 */
export function meter(ctx: Ctx, x: number, y: number, kind: 'A' | 'V', value: number, vmax: number) {
  const r = 17
  wire(ctx, x - r - 10, y, x - r, y)
  wire(ctx, x + r, y, x + r + 10, y)
  ctx.fillStyle = '#14142a'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2; ctx.stroke()
  // 指针：-120°..-60°（左偏）映射 0..vmax
  const frac = Math.max(-1, Math.min(1, value / vmax))
  const ang = -Math.PI * 0.75 + frac * Math.PI * 0.5
  ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * (r - 4), y + Math.sin(ang) * (r - 4)); ctx.stroke()
  label(ctx, kind, x, y + 26)
}

/** 沿折线路径流动的电流点（phase 0~1 循环推进） */
export function currentDots(ctx: Ctx, path: [number, number][], phase: number, speed = 1, color = '#F5C542') {
  if (path.length < 2) return
  const segs: { len: number; p1: [number, number]; p2: [number, number] }[] = []
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1])
    segs.push({ len, p1: path[i], p2: path[i + 1] })
    total += len
  }
  const count = Math.max(3, Math.round(total / 60))
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    let d = ((phase * speed + i / count) % 1) * total
    for (const s of segs) {
      if (d <= s.len) {
        const t = s.len === 0 ? 0 : d / s.len
        ctx.beginPath()
        ctx.arc(s.p1[0] + (s.p2[0] - s.p1[0]) * t, s.p1[1] + (s.p2[1] - s.p1[1]) * t, 3, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      d -= s.len
    }
  }
}

export function label(ctx: Ctx, text: string, x: number, y: number, color = '#8a8aa0', size = 12) {
  ctx.fillStyle = color
  ctx.font = `${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

/** 按 devicePixelRatio 适配画布尺寸并返回 2D 上下文（CSS 像素坐标系） */
export function fitCanvas(c: HTMLCanvasElement): { ctx: Ctx; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, c.clientWidth)
  const h = Math.max(1, c.clientHeight)
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

/** 通用 rAF 动画循环器（组件卸载时调 stop） */
export function makeLoop(fn: (dt: number, t: number) => void): { stop: () => void } {
  let id = 0
  let last = performance.now()
  let elapsed = 0
  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    elapsed += dt
    fn(dt, elapsed)
    id = requestAnimationFrame(step)
  }
  id = requestAnimationFrame(step)
  return { stop: () => cancelAnimationFrame(id) }
}
