import { describe, expect, it } from 'vitest'
import { buildCircuit, runCircuitBasics, type CircuitBody } from './circuit-basics'
import { solveAC, cabs } from './ac-circuit'

const bat = (id: string, EMF = 1.5, r = 0.5): CircuitBody => ({
  id, type: 'battery', x: 0, y: 0, angle: 0, params: { EMF, r }, links: [],
})
const res = (id: string, R: number): CircuitBody => ({
  id, type: 'resistor', x: 0, y: 0, angle: 0, params: { R }, links: [],
})
const rhe = (id: string, Rmax: number, pos: number): CircuitBody => ({
  id, type: 'rheostat', x: 0, y: 0, angle: 0, params: { Rmax, pos }, links: [],
})
const sw = (id: string, state: number): CircuitBody => ({
  id, type: 'switch_spst', x: 0, y: 0, angle: 0, params: { state }, links: [],
})
const spdt = (id: string, sel: number, loadA: CircuitBody, loadB: CircuitBody): CircuitBody => ({
  id, type: 'switch_spdt', x: 0, y: 0, angle: 0, params: { sel },
  links: [
    { toId: loadA.id, kind: 'wire', anchorA: '掷A', anchorB: '左端' },
    { toId: loadB.id, kind: 'wire', anchorA: '掷B', anchorB: '左端' },
  ],
})
const wire = (owner: CircuitBody, anchorA: string, target: CircuitBody, anchorB: string) => {
  owner.links.push({ toId: target.id, kind: 'wire', anchorA, anchorB })
}
const loop = (b: CircuitBody, r: CircuitBody, s?: CircuitBody) => {
  wire(b, '负极', r, '左端')
  if (s) { wire(r, '右端', s, '左端'); wire(s, '右端', b, '正极') }
  else wire(r, '右端', b, '正极')
}
const lastI = (els: CircuitBody[], id: string) => {
  const frames = runCircuitBasics(els)
  return frames[frames.length - 1].readings[`I_${id}`]
}

describe('B1 批1 · 电路基础引擎（MNA vs 闭式两法）', () => {
  it('欧姆定律（含内阻）：I=EMF/(R+r)，U_R=IR，U_端=EMF−I·r', () => {
    const b = bat('b1', 1.5, 0.5), r = res('r1', 10)
    loop(b, r)
    const frames = runCircuitBasics(b ? [b, r] : [])
    const rd = frames[frames.length - 1].readings
    const I = 1.5 / 10.5
    expect(rd['I_b1']).toBeCloseTo(I, 4)
    expect(rd['I_r1']).toBeCloseTo(I, 4)
    expect(rd['U_r1']).toBeCloseTo(I * 10, 3)
    expect(rd['U_b1']).toBeCloseTo(1.5 - I * 0.5, 3)
  })

  it('KCL 并联：I₁+I₂=I_total，反比分配 I₁/I₂=R₂/R₁', () => {
    const b = bat('b1', 3, 0.2), r1 = res('a', 10), r2 = res('c', 30)
    wire(b, '负极', r1, '左端'); wire(b, '负极', r2, '左端')
    wire(r1, '右端', b, '正极'); wire(r2, '右端', b, '正极')
    const rd = runCircuitBasics([b, r1, r2]).at(-1)!.readings
    const Rp = (10 * 30) / 40
    const Itot = 3 / (Rp + 0.2)
    expect(rd['I_a'] + rd['I_c']).toBeCloseTo(Itot, 3)
    expect(rd['I_a'] / rd['I_c']).toBeCloseTo(30 / 10, 2)
  })

  it('KVL 串联：U₁+U₂=EMF−I·r', () => {
    const b = bat('b1', 6, 0.5), r1 = res('a', 10), r2 = res('c', 20)
    wire(b, '负极', r1, '左端'); wire(r1, '右端', r2, '左端'); wire(r2, '右端', b, '正极')
    const rd = runCircuitBasics([b, r1, r2]).at(-1)!.readings
    expect(rd['U_a'] + rd['U_c']).toBeCloseTo(6 - rd['I_b1'] * 0.5, 3)
    expect(rd['I_b1']).toBeCloseTo(6 / 30.5, 4)
  })

  it('开关断开（state=0）：I≈0（R_OFF=1e9 口径）', () => {
    const b = bat('b1', 1.5, 0.5), r = res('r1', 10), s = sw('s1', 0)
    loop(b, r, s)
    expect(lastI([b, r, s], 'b1')).toBeLessThan(1e-6)
  })

  it('滑动变阻器：I=Rmax·pos 的减函数（两点闭式对照）', () => {
    const run = (pos: number) => {
      const b = bat('b1', 1.5, 0.5), rh = rhe('h1', 20, pos)
      loop(b, rh)
      return lastI([b, rh], 'b1')
    }
    expect(run(0.5)).toBeCloseTo(1.5 / (10 + 0.5), 3)
    expect(run(1.0)).toBeCloseTo(1.5 / (20 + 0.5), 3)
    expect(run(1.0)).toBeLessThan(run(0.5))
  })

  it('SPDT：sel=0 通掷A 断掷B；sel=1 反之（两支路电流互斥）', () => {
    const mk = (sel: number) => {
      const b = bat('b1', 3, 0.1), loadA = res('la', 10), loadB = res('lb', 20), s = spdt('s1', sel, loadA, loadB)
      wire(b, '负极', s, '刀端')
      wire(loadA, '右端', b, '正极'); wire(loadB, '右端', b, '正极')
      const rd = runCircuitBasics([b, s, loadA, loadB]).at(-1)!.readings
      return { selI: rd['I_s1'], la: rd['I_la'], lb: rd['I_lb'] }
    }
    const s0 = mk(0)
    expect(s0.la).toBeCloseTo(3 / 10.1, 3)      // A 支路通
    expect(s0.lb).toBeLessThan(1e-6)            // B 支路断
    const s1 = mk(1)
    expect(s1.lb).toBeCloseTo(3 / 20.1, 3)
    expect(s1.la).toBeLessThan(1e-6)
  })

  it('无电源：报错不崩', () => {
    expect('error' in buildCircuit([res('r1', 10)])).toBe(true)
  })

  it('buildCircuit 直连 MNA：两电阻并联节点电压与分立解一致（防读数层掩盖）', () => {
    const b = bat('b1', 1.5, 0.5), r1 = res('a', 10), r2 = res('c', 30)
    wire(b, '负极', r1, '左端'); wire(b, '负极', r2, '左端')
    wire(r1, '右端', b, '正极'); wire(r2, '右端', b, '正极')
    const built = buildCircuit([b, r1, r2])
    if ('error' in built) throw new Error('不应报错')
    const sol = solveAC(built.circuit, 0)
    const un = cabs(sol.uPhasors['a#U'])
    // U_a = 并联段端电压 = I·R_parallel（10∥30=7.5），非 I·R₁——原件两端电压相等（并联定义）
    expect(un).toBeCloseTo((1.5 / (7.5 + 0.5)) * 7.5, 3)
  })
})
