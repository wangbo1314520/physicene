import { describe, it, expect } from 'vitest'
import { mergeProcessed, detectConflict } from './merge'
import type { ProcessedData } from './processedData'

/**
 * 夹具：只填测试关心的字段，其余留空（schema 允许全部可选字段缺省）。
 * 用 unknown 中转是为了让 tape/paper 等复合字段可以只给局部结构。
 */
const pd = (fields: Record<string, unknown> = {}): ProcessedData =>
  ({ version: 1, ...fields }) as unknown as ProcessedData

const points = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 2 * i }))
const paperWith = (n: number, extra: Record<string, unknown> = {}) => ({
  mode: 'auto', locked: false,
  series: [{ id: 's1', name: 'U-I', color: '#000', points: points(n) }],
  fits: [], showFitLine: true, ...extra,
})
const tapeWith = (intervals: number[], extra: Record<string, unknown> = {}) => ({
  period: 0.02, nInterval: 5, intervals, acceleration: 2, ...extra,
})

describe('merge —— 三类 processedData 字段级合并（B6 冻结）', () => {
  // #1
  it('两个空对象合并：只剩 version', () => {
    expect(mergeProcessed(pd(), pd())).toEqual({ version: 1 })
  })

  // #2 —— 2.5D tape
  it('2.5D tape：仅一方有 tape 时原样保留', () => {
    const tape = tapeWith([0.1, 0.12, 0.14])
    expect((mergeProcessed(pd({ tape }), pd()) as any).tape).toEqual(tape)
    expect((mergeProcessed(pd(), pd({ tape })) as any).tape).toEqual(tape)
  })

  // #3
  it('标量字段 Last-Write-Wins：remote 优先', () => {
    const m = mergeProcessed(
      pd({ tape: tapeWith([], { acceleration: 1.9, averageVelocity: 0.5 }) }),
      pd({ tape: tapeWith([], { acceleration: 2.1 }) }),
    ) as any
    expect(m.tape.acceleration).toBe(2.1)
    expect(m.tape.averageVelocity).toBe(0.5) // 仅 local 有 → 保留
  })

  // #4
  it('数组字段取更长一方；等长时取 local', () => {
    const short = [0.1, 0.12], long = [0.1, 0.12, 0.14, 0.16]
    const l2r = mergeProcessed(pd({ tape: tapeWith(short) }), pd({ tape: tapeWith(long) })) as any
    expect(l2r.tape.intervals).toBe(long)
    const r2l = mergeProcessed(pd({ tape: tapeWith(long) }), pd({ tape: tapeWith(short) })) as any
    expect(r2l.tape.intervals).toBe(long)
    const localArr = [1, 2], remoteArr = [3, 4]
    const eq = mergeProcessed(pd({ tape: tapeWith(localArr) }), pd({ tape: tapeWith(remoteArr) })) as any
    expect(eq.tape.intervals).toBe(localArr)
  })

  // #5 —— 2D paper
  it('2D paper：嵌套递归——series 数组取长、显示开关 LWW、单侧字段保留', () => {
    const local = pd({ paper: paperWith(8, { showFitLine: false, showErrorBars: true }) })
    const remote = pd({ paper: paperWith(5, { showFitLine: true, showResiduals: true }) })
    const m = mergeProcessed(local, remote) as any
    expect(m.paper.series[0].points).toHaveLength(8) // series 数组等长取 local，其 points 为 8
    expect(m.paper.showFitLine).toBe(true)          // 双方都有的标量 → remote 优先
    expect(m.paper.showErrorBars).toBe(true)        // 仅 local 有
    expect(m.paper.showResiduals).toBe(true)        // 仅 remote 有
  })

  // #6 —— 三类互不干扰（含 3D 场线 fieldLines）
  it('顶层字段独立合并：paper(2D)/tape(2.5D)/fieldLines(3D 场) 互不干扰', () => {
    const local = pd({
      paper: paperWith(3),
      fieldLines: { charges: [{ x: 0, y: 0, q: 1 }], linesPerCharge: 8 },
    })
    const remote = pd({
      tape: tapeWith([0.1, 0.2]),
      fieldLines: { charges: [{ x: 0, y: 0, q: 1 }, { x: 1, y: 0, q: -1 }], linesPerCharge: 12 },
    })
    const m = mergeProcessed(local, remote) as any
    expect(m.paper).toEqual(local.paper)                 // 仅 local
    expect(m.tape).toEqual((remote as any).tape)         // 仅 remote
    expect(m.fieldLines.charges).toHaveLength(2)         // 数组取长
    expect(m.fieldLines.linesPerCharge).toBe(12)         // 标量 LWW
    expect(Object.keys(m).sort()).toEqual(['fieldLines', 'paper', 'tape', 'version'])
  })

  // #7 —— 断网恢复（本地增量不丢）
  it('断网恢复：离线期间本地追加的数据点在 flush 合并后全部保留', () => {
    const serverSnapshot = pd({ paper: paperWith(5) })       // 断网前双端一致
    const localPending = pd({ paper: paperWith(8) })         // 离线又描了 3 个点
    const m = mergeProcessed(localPending, serverSnapshot) as any
    expect(m.paper.series[0].points).toHaveLength(8)
    expect(m.paper.series[0].points[7]).toEqual({ x: 7, y: 14 })
  })

  // #8 —— 断网恢复（双端各自演进）
  it('断网恢复：本地改 tape、服务端改 paper，合并后两侧修改都在', () => {
    const base = { paper: paperWith(5), tape: tapeWith([0.1, 0.12]) }
    const local = pd({ ...base, tape: tapeWith([0.1, 0.12, 0.14, 0.16]) })
    const remote = pd({ ...base, paper: paperWith(5, { showFitLine: false, fits: [{ seriesId: 's1', k: 2, b: 0 }] }) })
    const m = mergeProcessed(local, remote) as any
    expect(m.tape.intervals).toHaveLength(4)      // 本地的纸带增量
    expect(m.paper.showFitLine).toBe(false)       // 服务端的坐标纸修改
    expect(m.paper.fits).toHaveLength(1)
    expect(m.paper.series[0].points).toHaveLength(5)
  })

  // #9
  it('exports 只取 local；local 无 exports 时结果不带 exports', () => {
    const localExports = { csv: 'x,y\n1,2' }
    const withLocal = mergeProcessed(pd({ exports: localExports }), pd({ exports: { csv: 'server' } }))
    expect(withLocal.exports).toBe(localExports)
    const noLocal = mergeProcessed(pd(), pd({ exports: { csv: 'server' } }))
    expect('exports' in noLocal).toBe(false)
  })

  // #10
  it('version 取双方最大值', () => {
    const m = mergeProcessed(pd({ version: 2 }), pd({ version: 1 }))
    expect(m.version).toBe(2)
    expect(mergeProcessed(pd(), pd()).version).toBe(1)
  })

  // #11
  it('null 按标量处理：remote 优先（null 与对象互换时均取 remote）', () => {
    const tape = tapeWith([0.1])
    expect((mergeProcessed(pd({ tape: null }), pd({ tape })) as any).tape).toEqual(tape)
    expect((mergeProcessed(pd({ tape }), pd({ tape: null })) as any).tape).toBeNull()
  })

  // #12
  it('三层嵌套对象递归合并', () => {
    const local = pd({ simulation: { kind: 'spring', results: { a: 1, b: 2 }, params: { k: 10 } } })
    const remote = pd({ simulation: { kind: 'spring', results: { b: 3, c: 4 }, params: { m: 0.5 } } })
    const m = mergeProcessed(local, remote) as any
    expect(m.simulation.results).toEqual({ a: 1, b: 3, c: 4 })
    expect(m.simulation.params).toEqual({ k: 10, m: 0.5 })
  })

  // #13
  it('detectConflict：内容一致返回空；version/exports 差异不计入', () => {
    const l = pd({ paper: paperWith(3), version: 1, exports: { csv: 'a' } })
    const r = pd({ paper: paperWith(3), version: 2, exports: { csv: 'b' } })
    expect(detectConflict(l, r)).toEqual([])
  })

  // #14
  it('detectConflict：同字段双方都有且不同才算冲突，按 local 键序报出', () => {
    const l = pd({ paper: paperWith(3), tape: tapeWith([0.1]), simulation: { kind: 'spring' } })
    const r = pd({ paper: paperWith(4), tape: tapeWith([0.2]) })
    expect(detectConflict(l, r)).toEqual(['paper', 'tape']) // simulation 仅 local 有，不算
  })

  // #15
  it('mergeProcessed 不修改输入对象', () => {
    const local = pd({ paper: paperWith(3), tape: tapeWith([0.1, 0.2]) })
    const remote = pd({ paper: paperWith(5), tape: tapeWith([0.3]) })
    const before = [JSON.stringify(local), JSON.stringify(remote)]
    mergeProcessed(local, remote)
    expect([JSON.stringify(local), JSON.stringify(remote)]).toEqual(before)
  })
})
