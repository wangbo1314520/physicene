/**
 * 高考场景共享绘图助手（2.5D 侧视 + 顶面透视条）
 */
export type Ctx = CanvasRenderingContext2D
const DEP = 12

export function ground(ctx: Ctx, y: number, x0: number, x1: number, text?: string, label?: (t: string, x: number, y: number, c?: string) => void) {
  ctx.fillStyle = '#23233a'; ctx.fillRect(x0, y, x1 - x0, 6)
  for (let x = x0; x < x1; x += 40) { ctx.fillStyle = '#2f2f4a'; ctx.fillRect(x, y + 8, 1, 6) }
  if (text && label) label(text, (x0 + x1) / 2, y + 24, '#565675')
}

/** 方块：左下角 (x, y) 向上画，w×h 像素，带顶面 */
export function block(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, top = '#ffffff33') {
  ctx.fillStyle = color; ctx.fillRect(x, y - h, w, h)
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + DEP, y - h - DEP * 0.6); ctx.lineTo(x + w + DEP, y - h - DEP * 0.6); ctx.lineTo(x + w, y - h); ctx.fill()
}

export function ball(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r)
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, color); g.addColorStop(1, color)
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

/** 弹簧：从 (x0,y0) 到 (x1,y1) 的锯齿，coils 圈，amp 振幅像素 */
export function spring(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, coils = 8, amp = 8, color = '#F5C542') {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy)
  if (L < 1) return
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0)
  const lead = Math.min(10, L * 0.1)
  ctx.lineTo(x0 + ux * lead, y0 + uy * lead)
  const n = coils * 2
  for (let i = 1; i <= n; i++) {
    const s = lead + ((L - 2 * lead) * i) / n
    const side = i % 2 ? 1 : -1
    ctx.lineTo(x0 + ux * s + nx * amp * side * (i === n ? 0 : 1), y0 + uy * s + ny * amp * side * (i === n ? 0 : 1))
  }
  ctx.lineTo(x1, y1); ctx.stroke()
}

export function pulley(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = '#5c5c7a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = '#14142a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
}

export function rope(ctx: Ctx, pts: [number, number][], color = '#d9a05a', width = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
}

/** 斜面：直角在右下 (x, y)，向左延伸 base 像素、向上 height 像素（左高右低）或 mirrored */
export function incline(ctx: Ctx, x: number, y: number, base: number, height: number, color = '#3ecf8e', leftHigh = true) {
  ctx.fillStyle = color + '33'; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
  if (leftHigh) { ctx.moveTo(x, y); ctx.lineTo(x - base, y); ctx.lineTo(x - base, y - height) } else { ctx.moveTo(x, y); ctx.lineTo(x + base, y); ctx.lineTo(x + base, y - height) }
  ctx.closePath(); ctx.fill(); ctx.stroke()
}

/** 传送带：两滚轮 + 皮带 + 随 phase 移动的条纹 */
export function belt(ctx: Ctx, x0: number, x1: number, y: number, phase: number, r = 12) {
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(x0, y - r); ctx.lineTo(x1, y - r); ctx.moveTo(x0, y + r); ctx.lineTo(x1, y + r); ctx.stroke()
  for (const cx of [x0, x1]) { ctx.beginPath(); ctx.arc(cx, y, r, 0, Math.PI * 2); ctx.stroke() }
  ctx.strokeStyle = '#565675'; ctx.lineWidth = 2
  const step = 24
  for (let s = ((phase % step) + step) % step; s < x1 - x0; s += step) { ctx.beginPath(); ctx.moveTo(x0 + s, y - r + 2); ctx.lineTo(x0 + s + 6, y - r + 8); ctx.stroke() }
}

export function scratch(ctx: Ctx, xa: number, xb: number, y: number) {
  ctx.fillStyle = 'rgba(224,85,85,0.8)'; ctx.fillRect(Math.min(xa, xb), y, Math.max(2, Math.abs(xb - xa)), 3)
}
