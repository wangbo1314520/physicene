/**
 * B13 自动对账：自由搭建
 *  1) 元件目录：六大类齐全、类型唯一、参数默认值在范围内、每个元件有识别标签
 *  2) 识别规则：每条规则的 need/bonus/forbid 标签都存在于目录中（防止“永远匹配不到”的死规则）
 *  3) 十个验收场景（与 e2e/sandbox-check.py 同一元件清单）在识别层的结果与期望一致
 *  4) 生成《自由搭建-元件对账表.md》
 */
/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { CATALOG, DOMAINS, byType, defaultsOf } from './catalog'
import { RULES, recognize, type Placed } from './recognizer'

const mk = (type: string, params: Record<string, number> = {}, i = 0): Placed => ({ id: `${type}-${i}`, type, x: i * 100, y: 0, params: { ...defaultsOf(byType.get(type)!), ...params }, links: [] })
const SCENARIOS: { no: number; name: string; els: [string, Record<string, number>][]; family: string }[] = [
  { no: 1, name: '自由搭测电源电路', els: [['battery', {}], ['rheostat', {}], ['ammeter', {}], ['voltmeter', {}], ['switch', {}]], family: 'circuit' },
  { no: 2, name: '平抛 + 竖直圆周', els: [['launcher', {}], ['loop', {}]], family: 'projectile-loop' },
  { no: 3, name: '加速电场 + 筛选器 + 磁场', els: [['accel_field', {}], ['selector', {}], ['b_region', {}], ['screen', {}]], family: 'accel-selector-b' },
  { no: 4, name: '双杆模型', els: [['rails', {}], ['bar', { v0: 4 }], ['bar', { v0: 0 }], ['b_region', {}]], family: 'rail-rod' },
  { no: 5, name: '玻璃管液封', els: [['glass_tube', {}], ['liquid_col', {}], ['gas', {}], ['heater', {}]], family: 'liquid-seal' },
  { no: 6, name: '光电效应', els: [['phototube', {}], ['uv_light', {}], ['galvanometer', {}]], family: 'photoelectric' },
  { no: 7, name: '连接体', els: [['block', { m: 2 }], ['block', { m: 1 }], ['rope', {}], ['sensor_f', {}], ['sensor_a', {}]], family: 'connected' },
  { no: 8, name: '传送带 + 物块', els: [['conveyor', {}], ['block', {}]], family: 'conveyor' },
  { no: 9, name: '变压器', els: [['transformer', {}], ['ac_src', {}], ['resistor', {}]], family: 'transformer' },
  { no: 10, name: '斜面 + 弹簧 + 滑块', els: [['incline', {}], ['spring', {}], ['block', {}], ['energy_bar', {}], ['timeline', {}]], family: 'slope-spring' },
]

describe('B13 自由搭建对账', () => {
  it('元件目录：六大类齐全、类型唯一、默认值在范围内、有识别标签', () => {
    const domains = new Set(CATALOG.map((e) => e.domain))
    for (const d of DOMAINS) expect(domains.has(d.key), `缺分类 ${d.label}`).toBe(true)
    expect(new Set(CATALOG.map((e) => e.type)).size).toBe(CATALOG.length)
    const bad: string[] = []
    for (const e of CATALOG) {
      if (!e.tags.length) bad.push(`${e.type}: 无标签`)
      for (const p of e.params) if (p.default < p.min || p.default > p.max) bad.push(`${e.type}.${p.key}: 默认值越界`)
    }
    expect(bad, bad.join('\n')).toEqual([])
    expect(CATALOG.length).toBeGreaterThanOrEqual(80)
  })

  it('识别规则：引用的标签都存在于目录', () => {
    const tags = new Set(CATALOG.flatMap((e) => e.tags))
    const bad: string[] = []
    for (const r of RULES) for (const t of [...r.need, ...(r.bonus ?? []), ...(r.forbid ?? [])]) if (!tags.has(t)) bad.push(`${r.id}: 标签「${t}」不存在`)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('十个验收场景在识别层结果正确', () => {
    const wrong: string[] = []
    for (const s of SCENARIOS) {
      const r = recognize(s.els.map(([t, p], i) => mk(t, p, i)))
      if (r.family !== s.family) wrong.push(`#${s.no} ${s.name}: 识别为 ${r.family}（期望 ${s.family}）`)
    }
    expect(wrong, wrong.join('\n')).toEqual([])
    expect(recognize([]).family).toBe('none')
  })

  it('生成《自由搭建-元件对账表.md》', () => {
    const L: string[] = ['# 自由搭建实验 · 元件与识别规则对账表（B13 自动生成）', '', `> 由 \`frontend/src/sandbox/sandbox-ledger.test.ts\` 生成。元件 ${CATALOG.length} 项 / 识别规则 ${RULES.length} 条 / 验收场景 ${SCENARIOS.length} 个。`, '']
    for (const d of DOMAINS) {
      const items = CATALOG.filter((e) => e.domain === d.key)
      L.push(`## ${d.icon} ${d.label}（${items.length}）`, '', '| 元件 | type | 维度 | 可调参数 | 识别标签 |', '|:--|:--|:--|:--|:--|')
      for (const e of items) L.push(`| ${e.label} | \`${e.type}\` | ${e.dims.join('/')} | ${e.params.map((p) => (p.options ? `${p.label}[${p.options.map((o) => o.label).join('/')}]` : `${p.label}${p.unit ? `(${p.unit})` : ''}`)).join('、') || '—'} | ${e.tags.join('、')} |`)
      L.push('')
    }
    L.push('## 识别规则 → 求解器', '', '| 规则 | 场景 | 需要的元件标签 | 加分 | 排斥 |', '|:--|:--|:--|:--|:--|')
    for (const r of RULES) L.push(`| \`${r.id}\` | ${r.title} | ${r.need.join(' + ') || '（兜底）'} | ${r.bonus?.join('、') ?? ''} | ${r.forbid?.join('、') ?? ''} |`)
    L.push('', '## 十个验收场景（e2e/sandbox-check.py）', '', '| # | 场景 | 元件 | 识别 | 物理断言 |', '|:-:|:--|:--|:--|:--|')
    const asserts: Record<number, string> = { 1: '电路编辑器挂载，托盘元件齐', 2: '切入/最高点/脱离事件', 3: 'v=E/B 通过、r 输出', 4: '共速 v=m₁v₀/(m₁+m₂)=2.00', 5: 'L₂=L₁T₂/T₁=24.00 cm', 6: 'ν₀=W₀/h=5.51，拟合斜率≈h', 7: 'a=(F−μΣm g)/Σm=5.69', 8: '共速 v=v_带=3.00', 9: 'U₂=55 V，I₁=0.625 A', 10: '最大压缩 x=0.59 m' }
    for (const s of SCENARIOS) L.push(`| ${s.no} | ${s.name} | ${s.els.map(([t]) => byType.get(t)?.label).join(' + ')} | \`${s.family}\` | ${asserts[s.no]} |`)
    writeFileSync(path.resolve(process.cwd(), '..', 'docs', '自由搭建-元件对账表.md'), L.join('\n'), 'utf-8')
    expect(true).toBe(true)
  })
})
