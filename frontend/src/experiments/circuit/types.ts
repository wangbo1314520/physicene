/**
 * CircuitEngine 数据模型（P0-2）
 * 约定：二端元件 pin0 = a（+ / 阳极 / 一端），pin1 = b（− / 阴极 / 另一端）；
 * v = Va − Vb，i 为元件内部由 a 流向 b 的电流；电表读数按 pin0(+) → pin1(−) 记正。
 */
export type ComponentKind =
  | 'battery'        // 干电池（EMF + 内阻）
  | 'dc_source'      // 学生电源（EMF + 小内阻）
  | 'ac_source'      // 低频信号发生器 / 交流源（Vrms + f）
  | 'resistor'       // 定值电阻
  | 'rheostat'       // 滑动变阻器（三端：A=0, B=1, 滑片 C=2）
  | 'lamp'           // 小灯泡（额定 U/P）
  | 'switch'         // 单刀单掷
  | 'spdt_switch'    // 单刀双掷（公共端=0，触点 1、2）
  | 'ammeter'        // 电流表（量程 + 内阻）
  | 'voltmeter'      // 电压表（量程 + 内阻）
  | 'galvanometer'   // 灵敏电流计（μA 级）
  | 'capacitor'      // 电容器（可为电解电容，带极性）
  | 'inductor'       // 电感器（L + 线圈电阻）
  | 'diode'          // 二极管（阳极=0，阴极=1）
  | 'photoresistor'  // 光敏电阻（Rdark / Rlight，light∈[0,1]）
  | 'wire_sample'    // 待测金属丝（电阻率实验：ρ、L、d 决定 R）
  | 'multimeter'     // 多用电表（mode: dcv / dca / ohm；欧姆挡内含 1.5V 电源与中值电阻 r₀）
  | 'relay'          // 继电器：线圈(0,1) 电压 ≥ vOn 时触点(2,3) 吸合
  | 'coil'           // 感应线圈：EMF 由外部磁通变化驱动（props.emf 随时间由实验设置），带线圈电阻

export interface PinRef { comp: string; pin: number }

export interface CircuitComponent {
  id: string
  kind: ComponentKind
  x: number
  y: number
  rot: 0 | 90 | 180 | 270
  props: Record<string, number | boolean | string>
}

export interface Wire {
  id: string
  a: PinRef
  b: PinRef
  /** 虚接（接触不良）：求解时按断开处理，故障检测报 loose_contact */
  loose?: boolean
}

export interface Circuit {
  components: CircuitComponent[]
  wires: Wire[]
}

/** 单个元件的求解结果 */
export interface ElementResult {
  v: number   // Va − Vb
  i: number   // a → b
  p: number   // 吸收功率（源为负）
}

export interface DCSolution {
  ok: boolean
  nodeCount: number
  /** 每个引脚所属节点 */
  nodeOf: (ref: PinRef) => number
  nodeV: number[]
  elements: Record<string, ElementResult>
  /** 电源外部输出：i_out 为流出 + 端的电流，vTerm 为端电压 */
  sources: Record<string, { iOut: number; vTerm: number; rExt: number }>
}

export type FaultCode =
  | 'no_source'
  | 'short'
  | 'open'
  | 'switch_open'
  | 'dangling_pin'
  | 'loose_contact'
  | 'ammeter_parallel'
  | 'voltmeter_series'
  | 'meter_reversed'
  | 'over_range'
  | 'range_too_large'
  | 'capacitor_reversed'
  | 'lamp_overload'
  | 'ohm_live_circuit'
  | 'ohm_not_isolated'

export interface Fault {
  code: FaultCode
  severity: 'error' | 'warning'
  compIds: string[]
  wireIds?: string[]
  message: string
}

export interface MeterReading {
  compId: string
  kind: 'ammeter' | 'voltmeter' | 'galvanometer' | 'multimeter'
  /** 多用电表当前挡位（仅 multimeter） */
  mode?: 'dcv' | 'dca' | 'ohm'
  value: number       // 有符号读数（按 + → − 记正；欧姆挡为电阻值 Ω）
  range: number       // 满偏值（欧姆挡为中值电阻 r₀）
  deflection: number  // 指针偏转 0..1（欧姆挡 = r₀/(r₀+R)），可为负或 > 1
  reversed: boolean
  overRange: boolean
}
