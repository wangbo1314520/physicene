/**
 * 模板对账（阶段四 §6.1）：每个几何模板结构合法——
 * 元件类型在目录、参数键在 ParamSpec、连线目标/锚点存在、criticalChecks 完整、id 唯一。
 * 新批次模板加入 TEMPLATES 自动纳入对账。
 */
import { describe, it, expect } from 'vitest'
import { TEMPLATES } from './registry'
import { byType } from '../catalog'

describe('几何模板对账', () => {
  it('批次 1+2：力学 8 + 电磁 8 共 16 个', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(17)
    expect(TEMPLATES.filter((t) => t.group === '力学').length).toBeGreaterThanOrEqual(8)
    expect(TEMPLATES.filter((t) => t.group === '电磁').length).toBeGreaterThanOrEqual(8)
  })

  it('id 唯一', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s：元件类型/参数/连线合法', (_id, t) => {
    // 装置模板（dv-*）：方案 §6.2 单一元件承载整套参数化装置——允许 1 元件；几何模板仍 ≥2
    const isDevice = t.id.startsWith('dv-')
    expect(t.elements.length).toBeGreaterThanOrEqual(isDevice ? 1 : 2)
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
      expect(['event', 'final', 'max-y', 'max-x', 'no-event', 'tsreading', 'probe']).toContain(c.from.kind)
    }
    // 讲解模板挂接字段存在（批次 labeler 接入后强校验 solutionId 可解析）
    expect(t.solutionId).toBeTruthy()
  })
})

/** 永久规则静态检查（交付标准 §0.1）：theory 禁止纯数字字面量（sentinel 0/±1 例外），必须引用参数变量 */
describe('理论值代码推导静态检查', () => {
  it('registry.ts 源码无 theory 纯字面量', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const src = readFileSync(fileURLToPath(new URL('./registry.ts', import.meta.url)), 'utf-8')
    const bad: string[] = []
    const re = /theory:\s*(-?\d+(?:\.\d+)?)\s*[,}]/g
    for (const m of src.matchAll(re)) {
      const v = parseFloat(m[1])
      if (v !== 0 && v !== 1 && v !== -1) bad.push(m[0])
    }
    expect(bad, `以下 theory 为手算字面量（改为参数变量表达式）：\n${bad.join('\n')}`).toEqual([])
  })
})

/** 数字口径闸门（口径审计制度）：目录/模板计数以代码常量为源，变更须同步数字口径审计文档 */
describe('数字口径闸门', () => {
  it('PLAN_COUNT 与 TEMPLATES 计数锁定（变更须同步 docs/统一实验台-数字口径审计.md）', async () => {
    const { PLAN_COUNT, CATALOG } = await import('../catalog')
    const { TEMPLATES } = await import('./registry')
    expect(PLAN_COUNT).toBe(CATALOG.length)
    expect(PLAN_COUNT).toBe(74)   // 69 + B1 批1 电路基础五件（battery/resistor/rheostat/switch_spst/switch_spdt，2026-10-07）  // 变更须同步数字口径审计
    expect(TEMPLATES.length).toBe(64)   // 62 + 方案B Step3 迁移 2（卡71反弹/卡72电偶极子）
  })
})
