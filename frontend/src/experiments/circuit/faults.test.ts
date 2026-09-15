import { describe, it, expect } from 'vitest'
import { circuitBuilder, solveDC, detectFaults, gradeCircuit, meterReadings, type CircuitTemplate } from './index'

const codes = (c: ReturnType<typeof circuitBuilder>['circuit']) => detectFaults(c, solveDC(c)).map((f) => f.code)

describe('故障检测', () => {
  it('电源被导线/闭合开关直接短接 → short', () => {
    const b = circuitBuilder()
    b.add('battery', 'E', { emf: 1.5, r: 1 }); b.add('switch', 'S', { closed: true })
    b.chain('E:0', 'S:0', 'S:1', 'E:1')
    const f = detectFaults(b.circuit, solveDC(b.circuit))
    expect(f.some((x) => x.code === 'short' && x.compIds.includes('S'))).toBe(true)
  })

  it('开关未闭合 → switch_open 并定位到该开关', () => {
    const b = circuitBuilder()
    b.add('battery', 'E'); b.add('resistor', 'R'); b.add('switch', 'S', { closed: false })
    b.chain('E:0', 'S:0', 'S:1', 'R:0', 'R:1', 'E:1')
    const f = detectFaults(b.circuit, solveDC(b.circuit))
    expect(f.find((x) => x.code === 'switch_open')?.compIds).toEqual(['S'])
  })

  it('少接一根导线 → dangling_pin 定位到引脚悬空的元件', () => {
    const b = circuitBuilder()
    b.add('battery', 'E'); b.add('resistor', 'R')
    b.chain('E:0', 'R:0')
    const f = detectFaults(b.circuit, solveDC(b.circuit))
    const d = f.find((x) => x.code === 'dangling_pin')
    expect(d?.severity).toBe('error')
    expect(d?.compIds).toContain('R')
  })

  it('电流表并联在电阻两端 → ammeter_parallel', () => {
    const b = circuitBuilder()
    b.add('battery', 'E'); b.add('resistor', 'R', { R: 10 }); b.add('ammeter', 'A')
    b.chain('E:0', 'R:0', 'R:1', 'E:1', 'A:0', 'R:0', 'A:1', 'R:1')
    expect(codes(b.circuit)).toContain('ammeter_parallel')
  })

  it('电压表串进主回路 → voltmeter_series', () => {
    const b = circuitBuilder()
    b.add('battery', 'E'); b.add('lamp', 'L'); b.add('voltmeter', 'V')
    b.chain('E:0', 'V:0', 'V:1', 'L:0', 'L:1', 'E:1')
    expect(codes(b.circuit)).toContain('voltmeter_series')
  })

  it('电流表正负接反 → meter_reversed；量程过小 → over_range；量程过大 → range_too_large', () => {
    const rev = circuitBuilder()
    rev.add('dc_source', 'E', { emf: 3, r: 0 }); rev.add('resistor', 'R', { R: 10 }); rev.add('ammeter', 'A', { rangeKey: '0.6A' })
    rev.chain('E:0', 'A:1', 'A:0', 'R:0', 'R:1', 'E:1')
    expect(codes(rev.circuit)).toContain('meter_reversed')

    const over = circuitBuilder()
    over.add('dc_source', 'E', { emf: 6, r: 0 }); over.add('resistor', 'R', { R: 4 }); over.add('ammeter', 'A', { rangeKey: '0.6A' })
    over.chain('E:0', 'A:0', 'A:1', 'R:0', 'R:1', 'E:1')
    expect(codes(over.circuit)).toContain('over_range')

    const big = circuitBuilder()
    big.add('battery', 'E', { emf: 1.5, r: 0 }); big.add('resistor', 'R', { R: 100 }); big.add('voltmeter', 'V', { rangeKey: '15V' })
    big.chain('E:0', 'R:0', 'R:1', 'E:1', 'V:0', 'R:0', 'V:1', 'R:1')
    expect(codes(big.circuit)).toContain('range_too_large')
  })

  it('正确的伏安法电路没有 error 级故障', () => {
    const b = circuitBuilder()
    b.add('battery', 'E', { emf: 1.5, r: 1 }); b.add('rheostat', 'Rh', { Rmax: 20, pos: 0.3 })
    b.add('ammeter', 'A'); b.add('voltmeter', 'V'); b.add('switch', 'S', { closed: true })
    b.chain('E:0', 'V:0', 'E:1', 'V:1', 'E:0', 'S:0', 'S:1', 'A:0', 'A:1', 'Rh:0', 'Rh:2', 'E:1')
    const errs = detectFaults(b.circuit, solveDC(b.circuit)).filter((f) => f.severity === 'error')
    expect(errs).toEqual([])
  })
})

describe('多用电表', () => {
  it('欧姆挡 ×100 单独测 470Ω：读数 470Ω，偏转 r₀/(r₀+R)', () => {
    const b = circuitBuilder()
    b.add('multimeter', 'M', { mode: 'ohm', rangeKey: '×100' }); b.add('resistor', 'R', { R: 470 })
    b.chain('M:0', 'R:0', 'M:1', 'R:1')
    const sol = solveDC(b.circuit)
    const m = meterReadings(b.circuit, sol)[0]
    expect(Math.abs(m.value - 470)).toBeLessThan(0.5)
    expect(Math.abs(m.deflection - 1500 / 1970)).toBeLessThan(1e-3)
    expect(detectFaults(b.circuit, sol).filter((f) => f.severity === 'error')).toEqual([])
  })
  it('欧姆挡带电测量 → ohm_live_circuit；待测电阻未断开 → ohm_not_isolated', () => {
    const b = circuitBuilder()
    b.add('battery', 'E'); b.add('resistor', 'R1', { R: 100 }); b.add('resistor', 'R2', { R: 100 })
    b.add('multimeter', 'M', { mode: 'ohm', rangeKey: '×10' })
    b.chain('E:0', 'R1:0', 'R1:1', 'R2:0', 'R2:1', 'E:1', 'M:0', 'R1:0', 'M:1', 'R1:1')
    const c = detectFaults(b.circuit, solveDC(b.circuit)).map((f) => f.code)
    expect(c).toContain('ohm_live_circuit'); expect(c).toContain('ohm_not_isolated')
  })
  it('欧姆挡测二极管：黑表笔接阳极读小阻值，红表笔接阳极读极大', () => {
    const mk = (blackOnAnode: boolean) => {
      const b = circuitBuilder()
      b.add('multimeter', 'M', { mode: 'ohm', rangeKey: '×100' }); b.add('diode', 'D')
      if (blackOnAnode) b.chain('M:1', 'D:0', 'M:0', 'D:1'); else b.chain('M:0', 'D:0', 'M:1', 'D:1')
      return meterReadings(b.circuit, solveDC(b.circuit))[0].value
    }
    expect(mk(true)).toBeLessThan(2000)
    expect(mk(false)).toBeGreaterThan(1e6)
  })
  it('直流电压挡 10V 并联测 6V 电源两端；直流电流挡 500mA 串联测 60mA', () => {
    const b = circuitBuilder()
    b.add('dc_source', 'E', { emf: 6, r: 0 }); b.add('resistor', 'R', { R: 100 })
    b.add('multimeter', 'V', { mode: 'dcv', rangeKey: '10V' }); b.add('multimeter', 'A', { mode: 'dca', rangeKey: '500mA' })
    b.chain('E:0', 'A:0', 'A:1', 'R:0', 'R:1', 'E:1', 'V:0', 'E:0', 'V:1', 'E:1')
    const rd = meterReadings(b.circuit, solveDC(b.circuit))
    const v = rd.find((m) => m.compId === 'V')!, a = rd.find((m) => m.compId === 'A')!
    expect(Math.abs(v.value - 6)).toBeLessThan(0.01)
    expect(Math.abs(a.value - 0.06)).toBeLessThan(0.0005)
  })
})

const EMF_TEMPLATE: CircuitTemplate = {
  name: '伏安法测电动势内阻',
  roles: { src: 'battery', A: 'ammeter', V: 'voltmeter', Rh: 'rheostat', S: 'switch' },
  series: [['src', 'S', 'A', 'Rh']],
  parallel: [['V', 'src']],
  requireClosed: true,
}

describe('智能判分', () => {
  it('正确电路满分通过', () => {
    const b = circuitBuilder()
    b.add('battery', 'E', { emf: 1.5, r: 1 }); b.add('rheostat', 'Rh', { Rmax: 20, pos: 0.3 })
    b.add('ammeter', 'A'); b.add('voltmeter', 'V'); b.add('switch', 'S', { closed: true })
    b.chain('E:0', 'V:0', 'E:1', 'V:1', 'E:0', 'S:0', 'S:1', 'A:0', 'A:1', 'Rh:0', 'Rh:2', 'E:1')
    const g = gradeCircuit(b.circuit, EMF_TEMPLATE)
    expect(g.passed).toBe(true)
    expect(g.score).toBe(g.max)
  })

  it('电压表错接到变阻器两端 → not_parallel 定位到 V 与电源', () => {
    const b = circuitBuilder()
    b.add('battery', 'E', { emf: 1.5, r: 1 }); b.add('rheostat', 'Rh', { Rmax: 20, pos: 0.3 })
    b.add('ammeter', 'A'); b.add('voltmeter', 'V'); b.add('switch', 'S', { closed: true })
    b.chain('E:0', 'S:0', 'S:1', 'A:0', 'A:1', 'Rh:0', 'Rh:2', 'E:1', 'V:0', 'Rh:0', 'V:1', 'Rh:2')
    const g = gradeCircuit(b.circuit, EMF_TEMPLATE)
    expect(g.passed).toBe(false)
    const issue = g.issues.find((i) => i.code === 'not_parallel')
    expect(issue?.compIds.sort()).toEqual(['E', 'V'])
  })

  it('缺电流表 → missing_role；开关未闭合 → not_closed + fault', () => {
    const b = circuitBuilder()
    b.add('battery', 'E'); b.add('rheostat', 'Rh'); b.add('voltmeter', 'V'); b.add('switch', 'S', { closed: false })
    b.chain('E:0', 'V:0', 'E:1', 'V:1', 'E:0', 'S:0', 'S:1', 'Rh:0', 'Rh:2', 'E:1')
    const g = gradeCircuit(b.circuit, EMF_TEMPLATE)
    const c = g.issues.map((i) => i.code)
    expect(c).toContain('missing_role'); expect(c).toContain('not_closed'); expect(c).toContain('fault')
    expect(g.passed).toBe(false)
  })
})
