import { describe, it, expect } from 'vitest'
import { circuitBuilder, solveDC, simulateTransient, solveAC, reactanceC, reactanceL, linearFit, meterReadings } from './index'

const close = (a: number, b: number, relTol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * relTol + 1e-12)

describe('CircuitEngine 直流 MNA', () => {
  it('串联分压：6V 接 100Ω+200Ω，200Ω 上 4V、电流 20mA', () => {
    const b = circuitBuilder()
    b.add('dc_source', 'E', { emf: 6, r: 0 })
    b.add('resistor', 'R1', { R: 100 }); b.add('resistor', 'R2', { R: 200 }); b.add('switch', 'S', { closed: true })
    b.chain('E:0', 'S:0', 'S:1', 'R1:0', 'R1:1', 'R2:0', 'R2:1', 'E:1')
    const s = solveDC(b.circuit)
    expect(s.ok).toBe(true)
    close(s.elements.R2.v, 4, 1e-3)
    close(s.elements.R1.i, 0.02, 1e-3)
    close(s.sources.E.iOut, 0.02, 1e-3)
  })

  it('并联：两只 100Ω 并联在 6V 上，各 60mA，总 120mA', () => {
    const b = circuitBuilder()
    b.add('dc_source', 'E', { emf: 6, r: 0 })
    b.add('resistor', 'R1', { R: 100 }); b.add('resistor', 'R2', { R: 100 })
    b.chain('E:0', 'R1:0', 'E:0', 'R2:0', 'R1:1', 'E:1', 'R2:1', 'E:1')
    const s = solveDC(b.circuit)
    close(s.elements.R1.i, 0.06, 1e-3); close(s.elements.R2.i, 0.06, 1e-3); close(s.sources.E.iOut, 0.12, 1e-3)
  })

  it('伏安法测电动势内阻：改滑动变阻器取 8 组 U-I，拟合截距 E=1.5V、斜率 −r=−1Ω', () => {
    const b = circuitBuilder()
    b.add('battery', 'E', { emf: 1.5, r: 1 })
    const rh = b.add('rheostat', 'Rh', { Rmax: 20, pos: 0.5 })
    b.add('ammeter', 'A', { rangeKey: '0.6A' }); b.add('voltmeter', 'V', { rangeKey: '3V' }); b.add('switch', 'S', { closed: true })
    // 电压表并联电源两端，电流表串在外电路（限流接法只用 Rh 的 A、C）
    b.chain('E:0', 'V:0', 'E:1', 'V:1', 'E:0', 'S:0', 'S:1', 'A:0', 'A:1', 'Rh:0', 'Rh:2', 'E:1')
    const pts: { x: number; y: number }[] = []
    for (const pos of [0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1.0]) {
      rh.props.pos = pos
      const s = solveDC(b.circuit)
      const [rA, rV] = [meterReadings(b.circuit, s).find((m) => m.compId === 'A')!, meterReadings(b.circuit, s).find((m) => m.compId === 'V')!]
      pts.push({ x: rA.value, y: rV.value })
    }
    const fit = linearFit(pts)
    close(fit.b, 1.5, 0.005)           // 截距 = E
    close(-fit.k, 1.0, 0.01)           // 斜率 = −r（电压表内阻 3kΩ 带来约 0.03% 系统误差）
    expect(fit.r2).toBeGreaterThan(0.9999)
  })

  it('电流表内接/外接：5Ω 电阻，内接偏大到 5.125Ω，外接偏小到 4.992Ω', () => {
    const mk = (inner: boolean) => {
      const b = circuitBuilder()
      b.add('dc_source', 'E', { emf: 3, r: 0 }); b.add('resistor', 'Rx', { R: 5 })
      b.add('ammeter', 'A', { rangeKey: '0.6A' }); b.add('voltmeter', 'V', { rangeKey: '3V' })
      b.chain('E:0', 'A:0', 'A:1', 'Rx:0', 'Rx:1', 'E:1')
      if (inner) b.chain('V:0', 'A:0', 'V:1', 'Rx:1')   // 电压表跨过 A+Rx
      else b.chain('V:0', 'Rx:0', 'V:1', 'Rx:1')        // 电压表只跨 Rx
      const s = solveDC(b.circuit)
      return s.elements.V.v / s.elements.A.i
    }
    close(mk(true), 5.125, 1e-3)
    close(mk(false), 5 * 3000 / 3005, 1e-3)
  })

  it('二极管：正向 (6−0.7)/(100+0.5) A，反向几乎为零', () => {
    const mk = (forward: boolean) => {
      const b = circuitBuilder()
      b.add('dc_source', 'E', { emf: 6, r: 0 }); b.add('diode', 'D'); b.add('resistor', 'R', { R: 100 })
      if (forward) b.chain('E:0', 'D:0', 'D:1', 'R:0', 'R:1', 'E:1')
      else b.chain('E:0', 'D:1', 'D:0', 'R:0', 'R:1', 'E:1')
      return solveDC(b.circuit).elements.R.i
    }
    close(mk(true), 5.3 / 100.5, 2e-3)
    expect(Math.abs(mk(false))).toBeLessThan(1e-6)
  })

  it('分压器接法：滑片位置 0.25 → 负载(10kΩ)上约 1.5V', () => {
    const b = circuitBuilder()
    b.add('dc_source', 'E', { emf: 6, r: 0 }); b.add('rheostat', 'Rh', { Rmax: 20, pos: 0.25 }); b.add('resistor', 'RL', { R: 10000 })
    b.chain('E:0', 'Rh:1', 'Rh:0', 'E:1', 'Rh:2', 'RL:0', 'RL:1', 'E:1')
    const s = solveDC(b.circuit)
    close(s.elements.RL.v, 1.5, 0.01)
  })

  it('金属丝：ρ=1.1e-6 Ω·m，L=0.5m，d=0.5mm → R=2.801Ω', () => {
    const b = circuitBuilder()
    b.add('dc_source', 'E', { emf: 1, r: 0 }); b.add('wire_sample', 'W', { rho: 1.1e-6, L: 0.5, d: 0.5 })
    b.chain('E:0', 'W:0', 'W:1', 'E:1')
    const s = solveDC(b.circuit)
    close(s.elements.W.v / s.elements.W.i, 1.1e-6 * 0.5 / (Math.PI * 0.25e-3 ** 2), 1e-6)
  })
})

describe('CircuitEngine 暂态（后向欧拉）', () => {
  it('RC 充电：τ=RC=1s，t=τ 时 U_C=E(1−1/e)', () => {
    const b = circuitBuilder()
    b.add('dc_source', 'E', { emf: 6, r: 0 }); b.add('resistor', 'R', { R: 1000 }); b.add('capacitor', 'C', { C: 1e-3, v0: 0 })
    b.chain('E:0', 'R:0', 'R:1', 'C:0', 'C:1', 'E:1')
    const r = simulateTransient(b.circuit, { dt: 5e-4, tEnd: 1 })
    expect(r.ok).toBe(true)
    close(r.elements.C.v.at(-1)!, 6 * (1 - Math.exp(-1)), 5e-3)
  })

  it('RC 放电（单刀双掷从充电拨到放电）：放电 1τ 后剩 E/e', () => {
    const b = circuitBuilder()
    b.add('dc_source', 'E', { emf: 6, r: 0 }); b.add('resistor', 'R', { R: 1000 }); b.add('capacitor', 'C', { C: 1e-3, v0: 0 })
    const sw = b.add('spdt_switch', 'K', { pos: 1 })
    // 公共端接 R；触点 1 接电源 +（充电），触点 2 接电源 −（放电回路 R-C 直接短接）
    b.chain('K:1', 'E:0', 'K:2', 'E:1', 'K:0', 'R:0', 'R:1', 'C:0', 'C:1', 'E:1')
    const r = simulateTransient(b.circuit, { dt: 5e-4, tEnd: 6, control: (t) => { sw.props.pos = t < 5 ? 1 : 2 } })
    const at = (time: number) => r.elements.C.v[Math.round(time / 5e-4) - 1]
    close(at(5), 6, 0.01)                          // 5τ 后基本充满
    close(at(6), 6 * Math.exp(-1), 0.01)           // 放电 1τ
  })

  it('RL 通电：τ=L/R=0.1s，t=τ 时 I=I∞(1−1/e)', () => {
    const b = circuitBuilder()
    b.add('dc_source', 'E', { emf: 6, r: 0 }); b.add('resistor', 'R', { R: 10 }); b.add('inductor', 'L', { L: 1, rw: 0, i0: 0 })
    b.chain('E:0', 'R:0', 'R:1', 'L:0', 'L:1', 'E:1')
    const r = simulateTransient(b.circuit, { dt: 5e-5, tEnd: 0.1 })
    close(r.elements.L.i.at(-1)!, 0.6 * (1 - Math.exp(-1)), 5e-3)
  })

  it('LC 振荡：L=1H，C=1mF → T=2π√LC=0.1987s', () => {
    const b = circuitBuilder()
    b.add('capacitor', 'C', { C: 1e-3, v0: 6, polarized: false }); b.add('inductor', 'L', { L: 1, rw: 0, i0: 0 })
    b.chain('C:0', 'L:0', 'C:1', 'L:1')
    const dt = 1e-4
    const r = simulateTransient(b.circuit, { dt, tEnd: 0.5 })
    const v = r.elements.C.v
    const zeros: number[] = []
    for (let k = 1; k < v.length; k++) if (v[k - 1] > 0 && v[k] <= 0 || v[k - 1] < 0 && v[k] >= 0) zeros.push(r.t[k])
    expect(zeros.length).toBeGreaterThanOrEqual(3)
    close((zeros[2] - zeros[0]), 2 * Math.PI * Math.sqrt(1e-3), 0.01)
  })
})

describe('CircuitEngine 交流相量', () => {
  it('RC 串联 50Hz：|Z|=√(R²+Xc²)，Xc=1/(2πfC)', () => {
    const b = circuitBuilder()
    b.add('ac_source', 'G', { vrms: 3, freq: 50, r: 0 }); b.add('resistor', 'R', { R: 100 }); b.add('capacitor', 'C', { C: 10e-6, polarized: false })
    b.chain('G:0', 'R:0', 'R:1', 'C:0', 'C:1', 'G:1')
    const s = solveAC(b.circuit, 50)
    const Xc = reactanceC(10e-6, 50)
    close(s.elements.R.iRms, 3 / Math.hypot(100, Xc), 2e-3)
    close(s.elements.C.vRms / s.elements.C.iRms, Xc, 2e-3)
  })
  it('RL 串联：频率升高电流下降（感抗 2πfL）', () => {
    const mk = (f: number) => {
      const b = circuitBuilder()
      b.add('ac_source', 'G', { vrms: 3, freq: f, r: 0 }); b.add('lamp', 'La', { ratedU: 2.5, ratedI: 0.3 }); b.add('inductor', 'L', { L: 0.05, rw: 0 })
      b.chain('G:0', 'La:0', 'La:1', 'L:0', 'L:1', 'G:1')
      return solveAC(b.circuit, f).elements.La.iRms
    }
    const R = 2.5 / 0.3
    close(mk(50), 3 / Math.hypot(R, reactanceL(0.05, 50)), 2e-3)
    expect(mk(500)).toBeLessThan(mk(50))
  })
})
