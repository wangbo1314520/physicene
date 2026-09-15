/**
 * 元件库：引脚定义、默认参数、量程表、等效阻值
 */
import type { CircuitComponent, ComponentKind } from './types'

export interface ComponentDef {
  kind: ComponentKind
  label: string
  pins: string[]                     // 引脚名，索引即 pin 号
  defaults: Record<string, number | boolean | string>
  category: '电源' | '元件' | '控制' | '电表' | '储能' | '半导体' | '被测'
}

/** 学生用电表标准量程（量程 → 内阻） */
export const AMMETER_RANGES: Record<string, { range: number; r: number }> = {
  '0.6A': { range: 0.6, r: 0.125 },
  '3A': { range: 3, r: 0.025 },
}
export const VOLTMETER_RANGES: Record<string, { range: number; r: number }> = {
  '3V': { range: 3, r: 3000 },
  '15V': { range: 15, r: 15000 },
}
export const GALVANOMETER_RANGES: Record<string, { range: number; r: number }> = {
  '300μA': { range: 300e-6, r: 100 },
  '3mA': { range: 3e-3, r: 30 },
}
/** 多用电表（MF47 型近似）：电压挡灵敏度 20kΩ/V；电流挡内阻；欧姆挡中值电阻 r₀（电池 1.5V） */
export const MULTIMETER_RANGES = {
  dcv: { '2.5V': { range: 2.5, r: 50000 }, '10V': { range: 10, r: 200000 }, '50V': { range: 50, r: 1e6 } } as Record<string, { range: number; r: number }>,
  dca: { '0.5mA': { range: 0.5e-3, r: 200 }, '5mA': { range: 5e-3, r: 20 }, '50mA': { range: 50e-3, r: 2 }, '500mA': { range: 0.5, r: 0.2 } } as Record<string, { range: number; r: number }>,
  ohm: { '×1': { range: 15, r: 15 }, '×10': { range: 150, r: 150 }, '×100': { range: 1500, r: 1500 }, '×1k': { range: 15000, r: 15000 } } as Record<string, { range: number; r: number }>,
}
export const OHM_EMF = 1.5
export type MultimeterMode = 'dcv' | 'dca' | 'ohm'

export const DEFS: Record<ComponentKind, ComponentDef> = {
  battery: { kind: 'battery', label: '干电池', pins: ['+', '−'], category: '电源',
    defaults: { emf: 1.5, r: 1.0 } },
  dc_source: { kind: 'dc_source', label: '学生电源', pins: ['+', '−'], category: '电源',
    defaults: { emf: 6, r: 0.05 } },
  ac_source: { kind: 'ac_source', label: '信号发生器', pins: ['~', '~'], category: '电源',
    defaults: { vrms: 3, freq: 50, r: 1 } },
  resistor: { kind: 'resistor', label: '定值电阻', pins: ['1', '2'], category: '元件',
    defaults: { R: 100 } },
  rheostat: { kind: 'rheostat', label: '滑动变阻器', pins: ['A', 'B', 'C'], category: '控制',
    defaults: { Rmax: 20, pos: 0.5 } },
  lamp: { kind: 'lamp', label: '小灯泡', pins: ['1', '2'], category: '元件',
    defaults: { ratedU: 2.5, ratedI: 0.3 } },
  switch: { kind: 'switch', label: '开关', pins: ['1', '2'], category: '控制',
    defaults: { closed: false } },
  spdt_switch: { kind: 'spdt_switch', label: '单刀双掷', pins: ['公共', '1', '2'], category: '控制',
    defaults: { pos: 0 } },
  ammeter: { kind: 'ammeter', label: '电流表', pins: ['+', '−'], category: '电表',
    defaults: { rangeKey: '0.6A' } },
  voltmeter: { kind: 'voltmeter', label: '电压表', pins: ['+', '−'], category: '电表',
    defaults: { rangeKey: '3V' } },
  galvanometer: { kind: 'galvanometer', label: '灵敏电流计', pins: ['+', '−'], category: '电表',
    defaults: { rangeKey: '300μA' } },
  capacitor: { kind: 'capacitor', label: '电容器', pins: ['+', '−'], category: '储能',
    defaults: { C: 1000e-6, polarized: true, v0: 0 } },
  inductor: { kind: 'inductor', label: '电感器', pins: ['1', '2'], category: '储能',
    defaults: { L: 1.0, rw: 5, i0: 0 } },
  diode: { kind: 'diode', label: '二极管', pins: ['阳', '阴'], category: '半导体',
    defaults: { vf: 0.7 } },
  photoresistor: { kind: 'photoresistor', label: '光敏电阻', pins: ['1', '2'], category: '半导体',
    defaults: { rDark: 100000, rLight: 500, light: 1 } },
  wire_sample: { kind: 'wire_sample', label: '待测金属丝', pins: ['1', '2'], category: '被测',
    defaults: { rho: 1.1e-6, L: 0.5, d: 0.5 } },
  multimeter: { kind: 'multimeter', label: '多用电表', pins: ['+红', '−黑'], category: '电表',
    defaults: { mode: 'dcv', rangeKey: '10V' } },
  relay: { kind: 'relay', label: '继电器', pins: ['线圈+', '线圈−', '触点1', '触点2'], category: '控制',
    defaults: { rCoil: 5000, vOn: 2.5, normallyClosed: false } },
  coil: { kind: 'coil', label: '感应线圈', pins: ['1', '2'], category: '被测',
    defaults: { N: 100, rw: 2, emf: 0 } },
}

let seq = 0
export function createComponent(kind: ComponentKind, x = 0, y = 0, id?: string,
                                props: Record<string, number | boolean | string> = {}): CircuitComponent {
  const def = DEFS[kind]
  return { id: id ?? `${kind}_${++seq}`, kind, x, y, rot: 0, props: { ...def.defaults, ...props } }
}

export function pinCount(kind: ComponentKind): number { return DEFS[kind].pins.length }

export function num(c: CircuitComponent, key: string, fallback = 0): number {
  const v = c.props[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** 电表量程与内阻 */
export function meterSpec(c: CircuitComponent): { range: number; r: number } {
  if (c.kind === 'multimeter') return multimeterSpec(c)
  const key = String(c.props.rangeKey ?? '')
  const table = c.kind === 'ammeter' ? AMMETER_RANGES : c.kind === 'voltmeter' ? VOLTMETER_RANGES : GALVANOMETER_RANGES
  return table[key] ?? Object.values(table)[0]
}

/** 多用电表当前挡位规格；欧姆挡 range = r₀（中值电阻），r = r₀ */
export function multimeterSpec(c: CircuitComponent): { mode: MultimeterMode; range: number; r: number } {
  const mode = (c.props.mode === 'dca' || c.props.mode === 'ohm' ? c.props.mode : 'dcv') as MultimeterMode
  const table = MULTIMETER_RANGES[mode]
  const key = String(c.props.rangeKey ?? '')
  const spec = table[key] ?? Object.values(table)[0]
  return { mode, ...spec }
}

/** 小灯泡冷态电阻（线性模型） */
export function lampResistance(c: CircuitComponent): number {
  const U = num(c, 'ratedU', 2.5), I = num(c, 'ratedI', 0.3)
  return I > 0 ? U / I : 1e9
}

/** 金属丝电阻 R = ρL / (π d²/4)，d 以 mm 给出 */
export function wireSampleResistance(c: CircuitComponent): number {
  const rho = num(c, 'rho', 1.1e-6), L = num(c, 'L', 0.5), dmm = num(c, 'd', 0.5)
  const d = dmm * 1e-3
  const S = Math.PI * d * d / 4
  return S > 0 ? (rho * L) / S : 1e9
}

export function photoResistance(c: CircuitComponent): number {
  const rd = num(c, 'rDark', 1e5), rl = num(c, 'rLight', 500), light = Math.min(1, Math.max(0, num(c, 'light', 1)))
  // 对数插值：光照 0→暗阻，1→亮阻
  return Math.exp(Math.log(rd) + (Math.log(rl) - Math.log(rd)) * light)
}

/** 二端电阻类元件的等效阻值（不含电源/储能/开关/三端） */
export function twoTerminalResistance(c: CircuitComponent): number | null {
  switch (c.kind) {
    case 'resistor': return Math.max(1e-6, num(c, 'R', 100))
    case 'lamp': return lampResistance(c)
    case 'ammeter': case 'voltmeter': case 'galvanometer': return meterSpec(c).r
    case 'multimeter': { const s = multimeterSpec(c); return s.mode === 'ohm' ? null : s.r }
    case 'photoresistor': return photoResistance(c)
    case 'wire_sample': return wireSampleResistance(c)
    default: return null
  }
}
