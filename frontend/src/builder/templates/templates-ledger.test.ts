/**
 * 模板对账（阶段四 §6.1）：每个几何模板结构合法——
 * 元件类型在目录、参数键在 ParamSpec、连线目标/锚点存在、criticalChecks 完整、id 唯一。
 * 新批次模板加入 TEMPLATES 自动纳入对账。
 */
import { describe, it, expect } from 'vitest'
import { TEMPLATES } from './registry'
import { byType } from '../catalog'

describe('几何模板对账', () => {
  it('批次 1 至少 8 个力学模板', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(8)
    expect(TEMPLATES.every((t) => t.group === '力学')).toBe(true)
  })

  it('id 唯一', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s：元件类型/参数/连线合法', (_id, t) => {
    expect(t.elements.length).toBeGreaterThanOrEqual(2)
    for (const e of t.elements) {
      const spec = byType.get(e.type)
      expect(spec, `未知类型 ${e.type}`).toBeDefined()
      for (const k of Object.keys(e.params)) {
        expect(spec!.params.some((p) => p.key === k), `${e.type} 无参数 ${k}`).toBe(true)
      }
      for (const l of e.links) {
        const target = t.elements.find((x) => x.id === l.toId)
        expect(target, `连线目标 ${l.toId} 不存在`).toBeDefined()
        expect(byType.get(e.type)!.anchors?.some((a) => a.id === l.anchorA), `${e.type} 无锚点 ${l.anchorA}`).toBe(true)
        expect(byType.get(target!.type)!.anchors?.some((a) => a.id === l.anchorB), `${target!.type} 无锚点 ${l.anchorB}`).toBe(true)
      }
    }
    // 每模板至少 1 条物理断言（交付标准 §1：无断言不算模板）
    expect(t.criticalChecks.length).toBeGreaterThanOrEqual(1)
    for (const c of t.criticalChecks) {
      expect(c.tol).toBeGreaterThan(0)
      expect(['event', 'final', 'max-y', 'no-event']).toContain(c.from.kind)
    }
    // 讲解模板挂接字段存在（批次 labeler 接入后强校验 solutionId 可解析）
    expect(t.solutionId).toBeTruthy()
  })
})
