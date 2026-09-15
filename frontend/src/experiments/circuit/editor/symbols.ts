/**
 * 编辑器元件符号（局部坐标：元件中心为原点，水平放置，二端引脚在 (±30, 0)）
 * 调用方负责 translate/rotate；这里只画符号本体、引脚、数值标签、读数。
 */
import type { CircuitComponent, ElementResult, MeterReading } from '../types'
import { DEFS, lampResistance, meterSpec, multimeterSpec, num, wireSampleResistance } from '../components'

export type Ctx = CanvasRenderingContext2D
export const PIN_R = 5
const INK = '#e8e8f0', DIM = '#8a8aa0', CU = '#d9a05a', WARN = '#E05555', OK = '#3ecf8e', GOLD = '#F5C542'

/** 引脚局部偏移 */
export function pinOffsets(c: CircuitComponent): [number, number][] {
  switch (c.kind) {
    case 'rheostat': return [[-30, 0], [30, 0], [0, 20]]
    case 'spdt_switch': return [[-30, 0], [30, -12], [30, 12]]
    case 'relay': return [[-30, -12], [-30, 12], [30, -12], [30, 12]]
    default: return [[-30, 0], [30, 0]]
  }
}

/** 局部 → 世界（含旋转） */
export function toWorld(c: CircuitComponent, lx: number, ly: number): [number, number] {
  const a = (c.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
  return [c.x + lx * cos - ly * sin, c.y + lx * sin + ly * cos]
}
export function pinWorld(c: CircuitComponent, pin: number): [number, number] {
  const [lx, ly] = pinOffsets(c)[pin] ?? [0, 0]
  return toWorld(c, lx, ly)
}
/** 元件包围盒半宽/半高（世界坐标，随旋转交换） */
export function halfSize(c: CircuitComponent): [number, number] {
  const tall = c.kind === 'rheostat' || c.kind === 'spdt_switch' || c.kind === 'multimeter' || c.kind === 'relay'
  const [hw, hh] = [32, tall ? 24 : 18]
  return c.rot === 90 || c.rot === 270 ? [hh, hw] : [hw, hh]
}

export function valueLabel(c: CircuitComponent): string {
  if (c.props.hidden === true) return '？'
  switch (c.kind) {
    case 'battery': case 'dc_source': return `${num(c, 'emf').toFixed(1)} V`
    case 'ac_source': return `${num(c, 'vrms').toFixed(1)} V · ${fmtHz(num(c, 'freq'))}`
    case 'resistor': return fmtOhm(num(c, 'R'))
    case 'rheostat': return `${fmtOhm(num(c, 'Rmax'))} · ${(num(c, 'pos') * 100).toFixed(0)}%`
    case 'lamp': return `${num(c, 'ratedU')}V ${num(c, 'ratedI')}A`
    case 'ammeter': case 'voltmeter': case 'galvanometer': return String(c.props.rangeKey ?? '')
    case 'multimeter': { const s = multimeterSpec(c); return `${s.mode === 'dcv' ? 'DCV' : s.mode === 'dca' ? 'DCmA' : 'Ω'} ${String(c.props.rangeKey ?? '')}` }
    case 'capacitor': return fmtF(num(c, 'C'))
    case 'inductor': return `${num(c, 'L').toFixed(num(c, 'L') < 1 ? 2 : 1)} H`
    case 'diode': return `Vf ${num(c, 'vf')}V`
    case 'photoresistor': return `光照 ${(num(c, 'light') * 100).toFixed(0)}%`
    case 'wire_sample': return `L=${num(c, 'L').toFixed(2)}m d=${num(c, 'd').toFixed(2)}mm`
    case 'relay': return `吸合 ≥ ${num(c, 'vOn').toFixed(1)} V`
    case 'coil': return `N=${num(c, 'N').toFixed(0)}  ε=${num(c, 'emf').toFixed(3)} V`
    default: return ''
  }
}

export function fmtOhm(r: number): string {
  if (!Number.isFinite(r)) return '∞'
  if (r >= 1e6) return `${(r / 1e6).toFixed(2)} MΩ`
  if (r >= 1e3) return `${(r / 1e3).toFixed(r >= 1e4 ? 1 : 2)} kΩ`
  return `${r.toFixed(r < 10 ? 2 : 1)} Ω`
}
export function fmtF(f: number): string { return f >= 1e-3 ? `${(f * 1e3).toFixed(1)} mF` : `${(f * 1e6).toFixed(0)} μF` }
export function fmtHz(f: number): string { return f >= 1e3 ? `${(f / 1e3).toFixed(1)} kHz` : `${f.toFixed(0)} Hz` }
export function fmtReading(m: MeterReading): string {
  if (m.mode === 'ohm') return Number.isFinite(m.value) ? fmtOhm(m.value) : '∞'
  const v = m.value, a = Math.abs(v)
  const unit = m.kind === 'voltmeter' || m.mode === 'dcv' ? 'V' : 'A'
  if (unit === 'A' && a < 1) return a < 1e-3 ? `${(v * 1e6).toFixed(0)} μA` : `${(v * 1e3).toFixed(1)} mA`
  return `${v.toFixed(2)} ${unit}`
}

function text(ctx: Ctx, s: string, x: number, y: number, color = DIM, size = 11, align: CanvasTextAlign = 'center') {
  ctx.fillStyle = color; ctx.font = `${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'
  ctx.fillText(s, x, y)
}
function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color = INK, w = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}
function leads(ctx: Ctx, inner: number) { line(ctx, -30, 0, -inner, 0, DIM); line(ctx, inner, 0, 30, 0, DIM) }
function needle(ctx: Ctx, cx: number, cy: number, r: number, deflection: number) {
  const f = Math.max(-0.15, Math.min(1.15, deflection))
  const ang = -Math.PI * 0.8 + f * Math.PI * 0.6   // 0 → 左偏 144°，1 → 右偏 36°
  line(ctx, cx, cy, cx + Math.cos(ang) * (r - 3), cy + Math.sin(ang) * (r - 3), WARN, 1.5)
  ctx.fillStyle = WARN; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill()
}

export interface DrawInfo {
  result?: ElementResult
  reading?: MeterReading
  selected?: boolean
  faulted?: boolean
  phase?: number
}

/** 在局部坐标系画元件本体（不含引脚圆点） */
export function drawSymbol(ctx: Ctx, c: CircuitComponent, info: DrawInfo = {}) {
  const r = info.result
  switch (c.kind) {
    case 'battery': {
      leads(ctx, 8)
      line(ctx, -5, -12, -5, 12, INK, 2)      // 长线 = 正极（pin0）
      line(ctx, 5, -7, 5, 7, INK, 5)          // 短粗线 = 负极
      text(ctx, '+', -14, -14, INK, 12); text(ctx, '−', 14, -14, INK, 12)
      break
    }
    case 'dc_source': {
      leads(ctx, 14)
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke()
      line(ctx, -7, -3, 7, -3, INK, 2); line(ctx, -7, 3, -2, 3, INK, 2); line(ctx, 2, 3, 7, 3, INK, 2)
      text(ctx, '+', -22, -14, INK, 12); text(ctx, '−', 22, -14, INK, 12)
      break
    }
    case 'ac_source': {
      leads(ctx, 14)
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath()
      for (let i = 0; i <= 16; i++) { const t = i / 16; const px = -9 + t * 18, py = Math.sin(t * Math.PI * 2) * 5; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) }
      ctx.stroke()
      break
    }
    case 'resistor': case 'wire_sample': case 'photoresistor': {
      leads(ctx, 22)
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-22, -8, 44, 16)
      if (c.kind === 'wire_sample') { for (let x = -18; x <= 18; x += 6) line(ctx, x, -8, x - 4, 8, CU, 1) }
      if (c.kind === 'photoresistor') {
        const lit = num(c, 'light', 1)
        for (const dx of [-8, 0]) { line(ctx, dx - 8, -22, dx, -10, lit > 0.3 ? GOLD : DIM, 1.5); ctx.fillStyle = lit > 0.3 ? GOLD : DIM; ctx.beginPath(); ctx.moveTo(dx, -10); ctx.lineTo(dx - 4, -13); ctx.lineTo(dx - 1, -15); ctx.fill() }
      }
      break
    }
    case 'rheostat': {
      leads(ctx, 22)
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-22, -8, 44, 16)
      const sx = -22 + Math.min(1, Math.max(0, num(c, 'pos', 0.5))) * 44
      line(ctx, 0, 20, sx, 10, CU, 2)
      ctx.fillStyle = CU; ctx.beginPath(); ctx.moveTo(sx, 8); ctx.lineTo(sx - 4, 14); ctx.lineTo(sx + 4, 14); ctx.fill()
      text(ctx, 'A', -30, -12, DIM, 10); text(ctx, 'B', 30, -12, DIM, 10); text(ctx, 'C', 8, 22, DIM, 10)
      break
    }
    case 'lamp': {
      leads(ctx, 12)
      const bright = r ? Math.min(1.3, Math.abs(r.p) / (num(c, 'ratedU', 2.5) * num(c, 'ratedI', 0.3))) : 0
      if (bright > 0.02) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30)
        g.addColorStop(0, `rgba(245,197,66,${0.6 * Math.min(1, bright)})`); g.addColorStop(1, 'rgba(245,197,66,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill()
      }
      ctx.strokeStyle = bright > 0.05 ? (bright > 1.15 ? WARN : GOLD) : DIM; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke()
      line(ctx, -8, -8, 8, 8, ctx.strokeStyle as string, 2); line(ctx, 8, -8, -8, 8, ctx.strokeStyle as string, 2)
      break
    }
    case 'switch': {
      leads(ctx, 16)
      const closed = c.props.closed === true
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-16, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(16, 0, 3, 0, Math.PI * 2); ctx.fill()
      line(ctx, -16, 0, closed ? 16 : 12, closed ? 0 : -16, closed ? OK : INK, 2.5)
      break
    }
    case 'spdt_switch': {
      line(ctx, -30, 0, -12, 0, DIM); line(ctx, 22, -12, 30, -12, DIM); line(ctx, 22, 12, 30, 12, DIM)
      ctx.fillStyle = INK
      for (const [px, py] of [[-12, 0], [22, -12], [22, 12]]) { ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill() }
      const pos = num(c, 'pos', 0)
      const tip: [number, number] = pos === 1 ? [22, -12] : pos === 2 ? [22, 12] : [18, -22]
      line(ctx, -12, 0, tip[0], tip[1], pos ? OK : INK, 2.5)
      text(ctx, '1', 30, -22, DIM, 10); text(ctx, '2', 30, 22, DIM, 10)
      break
    }
    case 'ammeter': case 'voltmeter': case 'galvanometer': {
      leads(ctx, 16)
      ctx.fillStyle = '#14142a'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = info.reading?.overRange || info.reading?.reversed ? WARN : INK; ctx.lineWidth = 2; ctx.stroke()
      ctx.strokeStyle = DIM; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 2, 11, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke()
      needle(ctx, 0, 2, 12, info.reading?.deflection ?? 0)
      text(ctx, c.kind === 'ammeter' ? 'A' : c.kind === 'voltmeter' ? 'V' : 'G', 0, 9, INK, 10)
      text(ctx, '+', -24, -12, WARN, 11)
      if (info.reading) text(ctx, fmtReading(info.reading), 0, -26, info.reading.overRange || info.reading.reversed ? WARN : OK, 11)
      break
    }
    case 'multimeter': {
      leads(ctx, 20)
      const s = multimeterSpec(c)
      ctx.fillStyle = '#1d1d33'; ctx.strokeStyle = INK; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(-20, -18, 40, 36, 4); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = DIM; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 4, 13, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke()
      needle(ctx, 0, 4, 14, info.reading?.deflection ?? 0)
      text(ctx, s.mode === 'dcv' ? 'V' : s.mode === 'dca' ? 'mA' : 'Ω', 0, 12, GOLD, 9)
      text(ctx, '红+', -28, -14, WARN, 9); text(ctx, '黑−', 28, -14, INK, 9)
      if (info.reading) text(ctx, fmtReading(info.reading), 0, -28, info.reading.overRange || info.reading.reversed ? WARN : OK, 11)
      break
    }
    case 'capacitor': {
      leads(ctx, 4)
      line(ctx, -4, -11, -4, 11, INK, 3); line(ctx, 4, -11, 4, 11, INK, 3)
      if (c.props.polarized === true) text(ctx, '+', -12, -14, INK, 11)
      break
    }
    case 'inductor': {
      line(ctx, -30, 0, -24, 0, CU); line(ctx, 24, 0, 30, 0, CU)
      ctx.strokeStyle = CU; ctx.lineWidth = 2.5; ctx.beginPath()
      for (let i = 0; i < 4; i++) ctx.arc(-18 + i * 12, 0, 6, Math.PI, 0)
      ctx.stroke()
      break
    }
    case 'diode': {
      leads(ctx, 8)
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(8, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill()
      line(ctx, 8, -9, 8, 9, INK, 2.5)
      break
    }
    case 'relay': {
      // 左：线圈（pin0/1）；右：触点（pin2/3），吸合时闭合
      line(ctx, -30, -12, -18, -12, DIM); line(ctx, -30, 12, -18, 12, DIM)
      ctx.strokeStyle = CU; ctx.lineWidth = 2; ctx.strokeRect(-18, -14, 14, 28)
      for (let y = -10; y <= 10; y += 5) line(ctx, -18, y, -4, y, CU, 1)
      line(ctx, 30, -12, 18, -12, DIM); line(ctx, 30, 12, 18, 12, DIM)
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(18, -12, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(18, 12, 3, 0, Math.PI * 2); ctx.fill()
      const on = r ? Math.abs(r.v) >= num(c, 'vOn', 2.5) * 0.8 && Math.abs(r.v) > 0 : false
      const closed = on !== (c.props.normallyClosed === true)
      line(ctx, 18, 12, closed ? 18 : 8, closed ? -12 : -6, closed ? OK : INK, 2.5)
      ctx.setLineDash([2, 3]); line(ctx, -4, 0, 10, 0, DIM, 1); ctx.setLineDash([])
      break
    }
    case 'coil': {
      line(ctx, -30, 0, -24, 0, CU); line(ctx, 24, 0, 30, 0, CU)
      ctx.strokeStyle = CU; ctx.lineWidth = 2.5; ctx.beginPath()
      for (let i = 0; i < 6; i++) ctx.arc(-20 + i * 8, 0, 4, Math.PI, 0)
      ctx.stroke()
      const e = num(c, 'emf', 0)
      if (Math.abs(e) > 1e-4) text(ctx, e > 0 ? '⟵ ε' : 'ε ⟶', 0, -16, GOLD, 10)
      break
    }
  }
  // 数值标签
  const lbl = valueLabel(c)
  if (lbl) text(ctx, lbl, 0, c.kind === 'rheostat' ? 34 : 24, info.selected ? GOLD : DIM, 10)
  // 编号
  text(ctx, DEFS[c.kind].label, 0, c.kind === 'rheostat' ? -24 : -38, info.selected ? GOLD : '#5c5c7a', 9)
}

/** 元件等效电阻（供参数面板显示） */
export function displayResistance(c: CircuitComponent): string | null {
  if (c.kind === 'lamp') return fmtOhm(lampResistance(c))
  if (c.kind === 'wire_sample') return fmtOhm(wireSampleResistance(c))
  if (c.kind === 'ammeter' || c.kind === 'voltmeter' || c.kind === 'galvanometer') return `内阻 ${fmtOhm(meterSpec(c).r)}`
  return null
}
