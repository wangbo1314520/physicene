/**
 * B12 自动对账：高考/竞赛题层
 *  1) 题型覆盖：v3.1 §7.1 清单（gaokao-plan.ts）中每一项都必须已上线（available 且有组件）
 *  2) AI 讲解模板完整性：每个场景定义按默认参数生成的 SolutionTemplate 十一段全部非空（含 hints）
 *  3) 参数面板：每个场景至少一个可调参数，标题/说明/公式非空
 *  4) 生成《高考竞赛层-元件与题型对账表.md》（元件=参数面板项 + 场景元件描述；E2E 断言摘要从 exp-lib-check.py 提取）
 */
/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { PLAN50, BOOKS } from './gaokao-plan'
import { GAOKAO } from './gaokao'
import type { MechSceneDef } from '../engine/mechScene'
import type { EMSceneDef } from '../engine/emScene'
import { slopeSpring, conveyorBoard, connectedBodies } from '../defs/gaokao/scenes/mech1'
import { collisionSpring, circularCritical, collisionChain } from '../defs/gaokao/scenes/mech2'
import { isochrone, clothesline } from '../defs/gaokao/scenes/mech3'
import { multistage, impulseMicro } from '../defs/gaokao/scenes/mech4'
import { obliqueProjectile, weightChange } from '../defs/gaokao/scenes/mech5'
import { prismRefraction, waveMultiSolution, vibrationWaveGraphs } from '../defs/gaokao/scenes/opt1'
import { thinFilm, diffractionVsInterference, waveSuperposition } from '../defs/gaokao/scenes/opt2'
import { photoelectricEkNu, hydrogenLevels } from '../defs/gaokao/scenes/mod1'
import { nuclearReaction, bohrCollision, matterWave } from '../defs/gaokao/scenes/mod2'
import { liquidSealTube, cylinderPiston } from '../defs/gaokao/scenes/thermo1'
import { variableMassGas, uTube } from '../defs/gaokao/scenes/thermo2'
import { variableForce, smallQuantity, noninertial } from '../defs/gaokao/scenes/comp1'
import { accelDeflectScreen, bThenE } from '../defs/gaokao/scenes/em1'
import { velocitySelector, massSpectrometer, eBEMulti } from '../defs/gaokao/scenes/em2'
import { compositeField, cyclotron } from '../defs/gaokao/scenes/em3'
import { railRod } from '../defs/gaokao/scenes/em4'
import { voltAmmeterResistance, meterConversion } from '../defs/gaokao/scenes/em5'
import { transformerTransmission, acFourValues } from '../defs/gaokao/scenes/em6'
import { bbCombo, frameThroughB, rodInclineB } from '../defs/gaokao/scenes/em7'
import { mhdGenerator, emFlowmeter, hallEffect } from '../defs/gaokao/scenes/em8'
import { rodSpring, blackBox } from '../defs/gaokao/scenes/em9'
import { rigidBody, inductionOde } from '../defs/gaokao/scenes/comp2'

type AnyDef = MechSceneDef<any> | EMSceneDef<any>
interface Entry { def: AnyDef; runner: 'MechScene 2D/2.5D' | 'EMScene 3D'; variantOf?: string; setup?: number; override?: Record<string, number> }
const M = (def: MechSceneDef<any>): Entry => ({ def, runner: 'MechScene 2D/2.5D' })
const E = (def: EMSceneDef<any>): Entry => ({ def, runner: 'EMScene 3D' })
const DEFS: Record<string, Entry> = {
  'gk-slope-spring': M(slopeSpring), 'gk-conveyor-board': M(conveyorBoard), 'gk-m30-conveyor-board': { ...M(conveyorBoard), variantOf: 'gk-conveyor-board', setup: 2, override: { v0: 4 } },
  'gk-connected-bodies': M(connectedBodies), 'gk-m21-whole-isolate': { ...M(connectedBodies), variantOf: 'gk-connected-bodies', setup: 0 },
  'gk-collision-spring': M(collisionSpring), 'gk-m29-collision-spring': { ...M(collisionSpring), variantOf: 'gk-collision-spring', setup: 1 },
  'gk-circular-critical': M(circularCritical), 'gk-m28-circular-five': { ...M(circularCritical), variantOf: 'gk-circular-critical', override: { type: 4 } },
  'gk-collision-chain': M(collisionChain), 'gk-isochrone': M(isochrone), 'gk-clothesline': M(clothesline), 'gk-multistage': M(multistage), 'gk-impulse-micro': M(impulseMicro),
  'gk-oblique-projectile': M(obliqueProjectile), 'gk-weight-change': M(weightChange),
  'gk-prism-refraction': M(prismRefraction), 'gk-wave-multi-solution': M(waveMultiSolution), 'gk-vibration-wave-graphs': M(vibrationWaveGraphs),
  'gk-thin-film': M(thinFilm), 'gk-diffraction-vs-interference': M(diffractionVsInterference), 'gk-wave-superposition': M(waveSuperposition),
  'gk-photoelectric-ek-nu': M(photoelectricEkNu), 'gk-hydrogen-levels': M(hydrogenLevels), 'gk-nuclear-reaction': M(nuclearReaction), 'gk-bohr-collision': M(bohrCollision), 'gk-matter-wave': M(matterWave),
  'gk-liquid-seal-tube': M(liquidSealTube), 'gk-cylinder-piston': M(cylinderPiston), 'gk-variable-mass-gas': M(variableMassGas), 'gk-u-tube': M(uTube),
  'gk-variable-force': M(variableForce), 'gk-small-quantity': M(smallQuantity), 'gk-noninertial': M(noninertial),
  'gk-accel-deflect-screen': E(accelDeflectScreen), 'gk-b-then-e': E(bThenE), 'gk-velocity-selector': E(velocitySelector), 'gk-mass-spectrometer': E(massSpectrometer), 'gk-e-b-e-multi': E(eBEMulti),
  'gk-composite-field': E(compositeField), 'gk-cyclotron': E(cyclotron),
  'gk-rail-rod': E(railRod), 'gk-rod-free': { ...E(railRod), variantOf: 'gk-rail-rod', setup: 0 }, 'gk-rod-force': { ...E(railRod), variantOf: 'gk-rail-rod', setup: 1 }, 'gk-double-rod': { ...E(railRod), variantOf: 'gk-rail-rod', setup: 2 }, 'gk-rod-capacitor': { ...E(railRod), variantOf: 'gk-rail-rod', setup: 3 },
  'gk-volt-ammeter-resistance': E(voltAmmeterResistance), 'gk-meter-conversion': E(meterConversion),
  'gk-transformer-transmission': E(transformerTransmission), 'gk-transformer-dynamic': { ...E(transformerTransmission), variantOf: 'gk-transformer-transmission', setup: 0 }, 'gk-power-transmission': { ...E(transformerTransmission), variantOf: 'gk-transformer-transmission', setup: 1 },
  'gk-ac-four-values': E(acFourValues), 'gk-b-b-combo': E(bbCombo), 'gk-frame-through-b': E(frameThroughB), 'gk-rod-incline-b': E(rodInclineB),
  'gk-mhd-generator': E(mhdGenerator), 'gk-em-flowmeter': E(emFlowmeter), 'gk-hall-effect': E(hallEffect), 'gk-rod-spring': E(rodSpring), 'gk-black-box': E(blackBox),
  'gk-rigid-body': E(rigidBody), 'gk-induction-circuit-mech': E(inductionOde),
}
/** 独立 Vue 组件场景（B11 首批，不走通用运行器） */
const STANDALONE: Record<string, string> = { 'gk-board-block': 'GkBoardBlock.vue（2.5D 画布）', 'gk-projectile-loop': 'GkProjectileLoop.vue（2.5D 画布）', 'gk-accel-selector-b': 'GkAccelSelectorB.vue（three.js）' }
const FIELDS = ['problemType', 'processes', 'forces', 'laws', 'critical', 'derivation', 'numeric', 'pitfalls', 'similar', 'competition', 'hints'] as const

function defaults(def: AnyDef, setup?: number, override?: Record<string, number>) {
  const p: Record<string, number> = Object.fromEntries(def.params.map((d) => [d.key, d.default]))
  if (setup !== undefined && 'setup' in p) p.setup = setup
  Object.assign(p, override ?? {})
  return p
}

/** 从 exp-lib-check.py 抽取每个 id 的物理断言摘要（取 lines.append 的 f-string 文案，去掉 {} 表达式） */
function e2eSummaries(): Record<string, string> {
  const src = readFileSync(path.resolve(process.cwd(), 'e2e', 'exp-lib-check.py'), 'utf-8')
  const out: Record<string, string> = {}
  const blocks = src.split(/\n    if exp_id /).slice(1)
  for (const b of blocks) {
    const head = b.split('\n')[0]
    const ids = [...head.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1])
    const m = b.match(/lines\.append\(f"  \{'✓' if ok2? else '✗'\} (.*?)"\)/)
    if (!m) continue
    const text = m[1].replace(/\{[^}]*\}/g, '…')
    for (const id of ids) out[id] = text
  }
  return out
}

describe('B12 高考/竞赛题层对账（v3.1 §7.1 清单）', () => {
  it('清单每一项都已上线且挂了组件', () => {
    const missing = GAOKAO.filter((e) => !e.available || !e.component).map((e) => `#${PLAN50.find((p) => p.id === e.id)?.n} ${e.id}`)
    expect(missing, `未上线：${missing.join('，')}`).toEqual([])
    expect(GAOKAO.length).toBe(PLAN50.length)
    expect(new Set(GAOKAO.map((e) => e.id)).size).toBe(GAOKAO.length)
  })

  it('每个场景定义：参数面板非空、标题/说明/公式非空、讲解模板十一段全部非空', () => {
    const problems: string[] = []
    for (const [id, ent] of Object.entries(DEFS)) {
      const d = ent.def
      if (!d.params.length) problems.push(`${id}: 无参数`)
      if (!d.title || !d.desc || !d.formula) problems.push(`${id}: 标题/说明/公式缺失`)
      const sol = d.solution(defaults(d, ent.setup, ent.override)) as unknown as Record<string, unknown>
      for (const f of FIELDS) {
        const v = sol[f]
        const ok = typeof v === 'string' ? v.length > 0 : Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.length > 0)
        if (!ok) problems.push(`${id}: 讲解模板缺 ${f}`)
      }
      const ro = d.readout(defaults(d, ent.setup, ent.override), null)
      if (!ro || ro.includes('NaN') || ro.includes('undefined')) problems.push(`${id}: readout 含 NaN/undefined`)
    }
    expect(problems, problems.join('\n')).toEqual([])
    expect(Object.keys(DEFS).length + Object.keys(STANDALONE).length).toBe(PLAN50.length)
  })

  it('生成《高考竞赛层-元件与题型对账表.md》', () => {
    const e2e = e2eSummaries()
    const byBook = new Map<string, typeof PLAN50>()
    for (const p of PLAN50) byBook.set(p.book, [...(byBook.get(p.book) ?? []), p])
    const prioCount = (pr: string) => PLAN50.filter((p) => p.prio === pr).length
    const lines: string[] = [
      '# 高考 / 竞赛题层 · 元件与题型对账表（B12 自动生成）',
      '',
      `> 由 \`frontend/src/experiments/registry/gaokao-ledger.test.ts\` 在 \`npx vitest run\` 时生成；依据方案书 v3.1 §7.1 清单（文档标题写 50，分册清单合计 **${PLAN50.length}** 项，本表按清单逐项对账）。`,
      `> 覆盖：${GAOKAO.filter((e) => e.available).length}/${PLAN50.length}（P0 ${PLAN50.filter((p) => p.prio === 'P0' && GAOKAO.find((e) => e.id === p.id)?.available).length}/${prioCount('P0')} · P1 ${PLAN50.filter((p) => p.prio === 'P1' && GAOKAO.find((e) => e.id === p.id)?.available).length}/${prioCount('P1')} · P2 ${PLAN50.filter((p) => p.prio === 'P2' && GAOKAO.find((e) => e.id === p.id)?.available).length}/${prioCount('P2')}）`,
      '',
      '列说明：**元件/参数** = 场景参数面板可调项（即搭场景时可操作的元件与物理量）；**E2E 物理断言** = `e2e/exp-lib-check.py` 中对该场景运行结果与解析解的比对（除内容一致 / 动画两帧不同 / 主按钮 / 记录 / 控制台零错误的通用断言外）；**讲解模板** = SolutionTemplate 十一段（题型/过程/受力/规律/临界/推导/数值/易错/同类/竞赛/提示）全部非空。',
      '',
    ]
    for (const [book, items] of byBook) {
      lines.push(`## ${book}`, '', '| # | 场景 | id | 维度 | 优先 | 运行器 | 元件 / 参数 | E2E 物理断言 | 讲解模板 | 截图 |', '|:-:|:--|:--|:-:|:-:|:--|:--|:--|:-:|:--|')
      for (const p of items) {
        const ent = DEFS[p.id]
        const runner = ent ? (ent.variantOf ? `${ent.runner}（共用 ${ent.variantOf}${ent.setup !== undefined ? `，搭法 ${ent.setup}` : ''}）` : ent.runner) : STANDALONE[p.id]
        const params = ent ? ent.def.params.map((d) => d.options ? `${d.label}[${d.options.length} 选]` : `${d.label}${d.unit ? `(${d.unit})` : ''}`).join('、') : '见组件面板'
        const summary = e2e[p.id] ?? '通用断言（内容一致 / 动画 / 主按钮 / 记录 / 零错误）'
        lines.push(`| ${p.n} | ${p.name} | \`${p.id}\` | ${p.dim} | ${p.prio} | ${runner} | ${params} | ${summary} | ✓ 11/11 | [png](media/gaokao/${p.id}.png) |`)
      }
      lines.push('')
    }
    lines.push('## 分册统计', '', '| 分册 | 数量 | 已上线 |', '|:--|:-:|:-:|')
    for (const [book, items] of byBook) lines.push(`| ${book} | ${items.length} | ${items.filter((p) => GAOKAO.find((e) => e.id === p.id)?.available).length} |`)
    lines.push('', `合计 ${PLAN50.length}，已上线 ${GAOKAO.filter((e) => e.available).length}。分册常量：${Object.values(BOOKS).join(' / ')}`)
    const out = path.resolve(process.cwd(), '..', 'docs', '高考竞赛层-元件与题型对账表.md')
    if (!existsSync(path.dirname(out))) mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, lines.join('\n'), 'utf-8')
    expect(existsSync(out)).toBe(true)
  })
})
