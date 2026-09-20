/**
 * data 目录隔离单测（第二十四轮补盲区）：
 * tidyMath / withExperimentContext / AutosaveManager 曾无隔离单测（仅 E2E 间接覆盖）——
 * gitignore 事故暴露"E2E 绿 ≠ 源码受保护"性质，按用户要求本轮补齐。
 * （node 环境 stub window：AutosaveManager 依赖 window.setTimeout/clearTimeout）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tidyMath, withExperimentContext } from './aiAgent'
import { AutosaveManager } from './api'
import { http } from '../../api/http'

vi.mock('../../api/http', () => ({
  http: { post: vi.fn(), put: vi.fn(), get: vi.fn() },
}))
const putMock = http.put as unknown as ReturnType<typeof vi.fn>

describe('tidyMath —— LaTeX 轻量转写（纯文本侧栏可读）', () => {
  it('去展示层定界符 \\\\[ \\\\] \\\\( \\\\)', () => {
    expect(tidyMath(String.raw`\[E_k\]`)).toBe('E_k')
    expect(tidyMath(String.raw`\(m\)`)).toBe('m')
  })
  it('frac → (a)/(b)，sqrt → √(a)', () => {
    expect(tidyMath(String.raw`\frac{mv^2}{2}`)).toBe('(mv^2)/(2)')
    expect(tidyMath(String.raw`\sqrt{2gh}`)).toBe('√(2gh)')
  })
  it('cdot/times → ·/×；希腊字母映射', () => {
    expect(tidyMath(String.raw`F\cdot s`)).toBe('F· s')  // 当前行为：替换不吞后随空格（如实锁定）
    expect(tidyMath('3\\times 4')).toBe('3× 4')  // 同上：替换不吞后随空格（如实锁定）
    expect(tidyMath(String.raw`\mu mg\cos\theta`)).toBe('μ mg\\cosθ')  // 空格保留 + \cos 不在映射表（当前行为如实锁定）
    expect(tidyMath(String.raw`\Delta\phi`)).toBe('Δφ')
  })
  it('排版命令剥离（text/mathrm/left/right/逗号分号）+ 上下标花括号展开', () => {
    expect(tidyMath(String.raw`\left(x\right)`)).toBe('(x)')
    expect(tidyMath('a^{2}b_{1}')).toBe('a^2b_1')
  })
  it('三连换行压成两连', () => {
    expect(tidyMath('a\n\n\n\nb')).toBe('a\n\nb')
  })
})

describe('withExperimentContext —— 上下文前缀组装', () => {
  it('完整参数：实验/步骤/目标/数据/提问 5 段结构化', () => {
    const s = withExperimentContext({ experiment: '验证动量守恒', step: '步骤2 气垫导轨', goal: '测碰撞前后速度', records: { m1: 0.2, v1: 1.5 }, ask: '为什么守恒' })
    expect(s).toContain('实验：《验证动量守恒》')
    expect(s).toContain('当前步骤：步骤2 气垫导轨（目标：测碰撞前后速度）')
    expect(s).toContain('已记录数据：')
    expect(s).toContain('请解释并回答：为什么守恒')
    expect(s.split('\n')).toHaveLength(5)
  })
  it('无 step 无 records：空段被过滤 + 尚未记录占位', () => {
    const s = withExperimentContext({ experiment: '平抛', ask: '怎么求落点' })
    expect(s).toContain('尚未记录数据')
    expect(s).not.toContain('当前步骤')
    expect(s.split('\n')).toHaveLength(4) // 标题/占位/提问/要求
  })
  it('records 序列化截断 600 字符', () => {
    const big = { blob: 'x'.repeat(2000) }
    const s = withExperimentContext({ experiment: 'e', records: big, ask: 'q' })
    expect(s.length).toBeLessThan(800)
  })
})

describe('AutosaveManager —— 2s 防抖 / 互斥 / 冲突 / 网络错误回滚', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout, clearTimeout })  // node 环境无 window，桩为全局 timer
    putMock.mockReset()
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('patch 合并 pending，2s 防抖后一次 flush', async () => {
    putMock.mockResolvedValue({ id: 1 })
    const saved: unknown[] = []
    const m = new AutosaveManager(7, () => {}, (s) => saved.push(s))
    m.patch({ stepState: { a: 1 } })
    m.patch({ conclusion: 'c' })          // 2s 内二次 patch 重置计时
    expect(putMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(putMock).toHaveBeenCalledTimes(1)
    expect(putMock).toHaveBeenCalledWith('/experiments/sessions/7', { stepState: { a: 1 }, conclusion: 'c' })
    expect(saved).toHaveLength(1)
  })

  it('flush 进行中互斥：并发两次只发一次请求', async () => {
    let release!: (v: unknown) => void
    putMock.mockReturnValue(new Promise((r) => { release = r }))
    const m = new AutosaveManager(1, () => {})
    m.patch({ a: 1 })
    const f1 = m.flush()
    const f2 = m.flush()                   // saving=true 直接返回
    await release({ id: 1 })
    await Promise.all([f1, f2])
    expect(putMock).toHaveBeenCalledTimes(1)
  })

  it('冲突错误（已被/其他设备/已提交）触发 onConflict', async () => {
    putMock.mockRejectedValue(new Error('会话已被其他设备编辑'))
    const conflicts: string[] = []
    const m = new AutosaveManager(2, (msg) => conflicts.push(msg))
    m.patch({ a: 1 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toContain('其他设备')
  })

  it('网络错误：pending 回滚，下次 flush 重发', async () => {
    putMock.mockRejectedValueOnce(new Error('network down')).mockResolvedValue({ id: 3 })
    const m = new AutosaveManager(3, () => {})
    m.patch({ a: 1 })
    await vi.advanceTimersByTimeAsync(2000)  // 第一次失败
    expect(putMock).toHaveBeenCalledTimes(1)
    await m.flush()                          // 立即重试（pending 已回滚）
    expect(putMock).toHaveBeenCalledTimes(2)
    expect(putMock).toHaveBeenLastCalledWith('/experiments/sessions/3', { a: 1 })
  })

  it('空 pending 的 flush 是 no-op', async () => {
    const m = new AutosaveManager(4, () => {})
    await m.flush()
    expect(putMock).not.toHaveBeenCalled()
  })
})
