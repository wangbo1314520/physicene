/**
 * B13 通用场景求解器 · 识别层：把画布上的元件组合映射到一个可运行的求解器。
 *  - 62 个高考/竞赛场景定义（MechSceneDef / EMSceneDef，真实物理 + 时间轴 + 讲解模板）
 *  - 3 个独立场景组件（板块 / 平抛+圆周 / 加速→筛选→磁场）
 *  - 电路引擎（CircuitEditor，节点电压法 + 相量，自由连线）
 *  - 刚体沙盒（/lab，Java dyn4j：任意方块/小球/斜面/墙/场的组合）
 *  - 教材实验直达（α 散射）
 * 规则按“需要的标签集合”匹配，取命中标签最多者；元件参数按规则映射为求解器参数。
 */
import type { Component } from 'vue'
import type { MechSceneDef } from '../experiments/engine/mechScene'
import type { EMSceneDef } from '../experiments/engine/emScene'
import type { ComponentKind } from '../experiments/circuit/types'
import { byType } from './catalog'
import { slopeSpring, conveyorBoard, connectedBodies } from '../experiments/defs/gaokao/scenes/mech1'
import { collisionSpring, circularCritical, collisionChain } from '../experiments/defs/gaokao/scenes/mech2'
import { isochrone, clothesline } from '../experiments/defs/gaokao/scenes/mech3'
import { multistage, impulseMicro } from '../experiments/defs/gaokao/scenes/mech4'
import { obliqueProjectile, weightChange } from '../experiments/defs/gaokao/scenes/mech5'
import { prismRefraction, waveMultiSolution } from '../experiments/defs/gaokao/scenes/opt1'
import { thinFilm, diffractionVsInterference, waveSuperposition } from '../experiments/defs/gaokao/scenes/opt2'
import { photoelectricEkNu, hydrogenLevels } from '../experiments/defs/gaokao/scenes/mod1'
import { nuclearReaction, bohrCollision, matterWave } from '../experiments/defs/gaokao/scenes/mod2'
import { liquidSealTube, cylinderPiston } from '../experiments/defs/gaokao/scenes/thermo1'
import { variableMassGas, uTube } from '../experiments/defs/gaokao/scenes/thermo2'
import { variableForce, smallQuantity, noninertial } from '../experiments/defs/gaokao/scenes/comp1'
import { accelDeflectScreen, bThenE } from '../experiments/defs/gaokao/scenes/em1'
import { velocitySelector, massSpectrometer, eBEMulti } from '../experiments/defs/gaokao/scenes/em2'
import { compositeField, cyclotron } from '../experiments/defs/gaokao/scenes/em3'
import { railRod } from '../experiments/defs/gaokao/scenes/em4'
import { voltAmmeterResistance, meterConversion } from '../experiments/defs/gaokao/scenes/em5'
import { transformerTransmission, acFourValues } from '../experiments/defs/gaokao/scenes/em6'
import { bbCombo, frameThroughB, rodInclineB } from '../experiments/defs/gaokao/scenes/em7'
import { mhdGenerator, hallEffect } from '../experiments/defs/gaokao/scenes/em8'
import { rodSpring, blackBox } from '../experiments/defs/gaokao/scenes/em9'
import { rigidBody, inductionOde } from '../experiments/defs/gaokao/scenes/comp2'
import GkBoardBlock from '../experiments/defs/gaokao/GkBoardBlock.vue'
import GkProjectileLoop from '../experiments/defs/gaokao/GkProjectileLoop.vue'
import GkAccelSelectorB from '../experiments/defs/gaokao/GkAccelSelectorB.vue'

export interface Placed { id: string; type: string; x: number; y: number; params: Record<string, number>; links: string[] }
export type Target =
  | { kind: 'mech'; def: MechSceneDef<any> }
  | { kind: 'em'; def: EMSceneDef<any> }
  | { kind: 'component'; component: Component; name: string }
  | { kind: 'circuit'; palette: ComponentKind[] }
  | { kind: 'dyn4j' }
  | { kind: 'link'; to: string; name: string }
export interface Recognition {
  family: string; title: string; target: Target | null; params: Record<string, number>
  confidence: number; used: string[]; missing: string[]; notes: string[]
}

type Els = Placed[]
const tagsOf = (e: Placed) => byType.get(e.type)?.tags ?? []
const has = (els: Els, tag: string) => els.some((e) => tagsOf(e).includes(tag))
const count = (els: Els, tag: string) => els.filter((e) => tagsOf(e).includes(tag)).length
const one = (els: Els, tag: string) => els.find((e) => tagsOf(e).includes(tag))
const num = (e: Placed | undefined, key: string, fb: number) => (e && Number.isFinite(e.params[key]) ? e.params[key] : fb)

interface Rule {
  id: string; title: string; need: string[]; forbid?: string[]; bonus?: string[]
  build(els: Els): { target: Target; params?: Record<string, number>; notes?: string[] }
}
const M = (def: MechSceneDef<any>): Target => ({ kind: 'mech', def })
const E = (def: EMSceneDef<any>): Target => ({ kind: 'em', def })
const CIRCUIT_KIND: Record<string, ComponentKind> = { battery: 'battery', resistor: 'resistor', switch: 'switch', ammeter: 'ammeter', voltmeter: 'voltmeter', rheostat: 'rheostat', capacitor: 'capacitor', inductor: 'inductor', diode: 'diode', lamp: 'lamp', ac_src: 'ac_source', multimeter: 'multimeter', galvanometer: 'galvanometer' }

const RULES: Rule[] = [
  // ── 力学 ──
  { id: 'slope-spring', title: '斜面 + 弹簧 + 滑块（模型 3）', need: ['斜面', '弹簧', '运动体'], build: (els) => ({ target: M(slopeSpring), params: { th: num(one(els, '斜面'), 'th', 30), mu: num(one(els, '斜面'), 'mu', 0.1), k: num(one(els, '弹簧'), 'k', 60), m: num(one(els, '运动体'), 'm', 1) } }) },
  { id: 'conveyor', title: '传送带 + 物块（模型 4/30）', need: ['传送带', '运动体'], build: (els) => { const c = one(els, '传送带')!; return { target: M(conveyorBoard), params: { setup: num(c, 'th', 0) > 0 ? 1 : 0, vb: num(c, 'vb', 3), th: num(c, 'th', 15), mu: num(c, 'mu', 0.2), L: num(c, 'L', 6), v0: num(one(els, '运动体'), 'v0', 0) } } } },
  { id: 'board-block', title: '平板小车 + 滑块（板块模型 1）', need: ['小车', '滑块'], build: () => ({ target: { kind: 'component', component: GkBoardBlock, name: '板块模型' }, notes: ['板块模型为独立场景组件：请在其面板内设置 m、M、μ、v₀、L'] }) },
  { id: 'connected', title: '连接体 + 绳 / 滑轮（模型 5/21）', need: ['绳', '运动体'], forbid: ['竖直杆', '圆轨道'], build: (els) => { const bodies = els.filter((e) => tagsOf(e).includes('运动体')); const pulley = one(els, '滑轮'); return { target: M(connectedBodies), params: { setup: pulley ? (num(pulley, 'kind', 0) === 1 ? 2 : 1) : 0, m1: num(bodies[0], 'm', 2), m2: num(bodies[1], 'm', 1), mu: num(bodies[0], 'mu', 0.1), th: num(one(els, '斜面'), 'th', 30) } } } },
  { id: 'collision-spring', title: '碰撞 + 弹簧（模型 6/29）', need: ['弹簧', '运动体'], forbid: ['斜面', '导轨'], build: (els) => { const b = els.filter((e) => tagsOf(e).includes('运动体')); const s = one(els, '弹簧')!; return { target: M(collisionSpring), params: { setup: b.length >= 2 && num(b[0], 'v0', 0) === 0 && num(b[1], 'v0', 0) === 0 ? 1 : 0, m1: num(b[0], 'm', 1), m2: num(b[1], 'm', 2), v1: num(b[0], 'v0', 4), k: num(s, 'k', 100), x0: num(s, 'x0', 0.4) } } } },
  { id: 'circular', title: '竖直圆周临界（模型 7/28）', need: ['圆轨道', '运动体'], forbid: ['平抛'], build: (els) => { const l = one(els, '圆轨道')!; return { target: M(circularCritical), params: { type: num(l, 'kind', 0), R: num(l, 'R', 1), v0: num(one(els, '运动体'), 'v0', 6), m: num(one(els, '运动体'), 'm', 1) } } } },
  { id: 'projectile-loop', title: '平抛 + 竖直圆周（场景 2）', need: ['平抛', '圆轨道'], build: () => ({ target: { kind: 'component', component: GkProjectileLoop, name: '平抛 + 竖直圆周' } }) },
  { id: 'chain', title: '多体碰撞链（场景 8）', need: ['质点'], forbid: ['斜面', '弹簧', '绳', '圆轨道', '传送带', '变力', '非惯性系', '图像', '平抛'], build: (els) => { const balls = els.filter((e) => e.type === 'particle'); if (balls.length < 2) throw new Error('need2'); return { target: M(collisionChain), params: { n: Math.min(5, balls.length), v0: num(balls[0], 'v0', 3), e: num(one(els, '碰撞'), 'e', 1) } } } },
  { id: 'isochrone', title: '等时圆（模型 22）', need: ['圆轨道', '杆'], build: (els) => ({ target: M(isochrone), params: { R: num(one(els, '圆轨道'), 'R', 0.8) } }) },
  { id: 'clothesline', title: '晾衣绳动态平衡（模型 23）', need: ['竖直杆', '绳'], build: (els) => ({ target: M(clothesline), params: { L: num(one(els, '绳'), 'L', 2), Tmax: num(one(els, '绳'), 'Tmax', 40), m: num(one(els, '砝码') ?? one(els, '运动体'), 'm', 2) } }) },
  { id: 'multistage', title: '多过程直线运动 + v–t（模型 25）', need: ['运动体', '图像'], forbid: ['斜面', '弹簧', '圆轨道', '传送带', '变力'], build: (els) => ({ target: M(multistage), params: { v0: num(one(els, '运动体'), 'v0', 6) } }) },
  { id: 'oblique', title: '斜抛运动（模型 26）', need: ['质点'], forbid: ['圆轨道', '弹簧', '绳', '传送带', '变力', '图像', '非惯性系', '刚体'], build: (els) => { const p = els.find((e) => e.type === 'particle')!; if (!(num(p, 'ang', 0) > 0) || els.filter((e) => e.type === 'particle').length > 1) throw new Error('not oblique'); return { target: M(obliqueProjectile), params: { v0: num(p, 'v0', 10), th: num(p, 'ang', 30) } } } },
  { id: 'impulse', title: '动量定理 + 微元（模型 31）', need: ['变力', '运动体'], build: (els) => { const f = one(els, '变力')!; if (num(f, 'kind', 0) !== 0) throw new Error('F(x)'); return { target: M(impulseMicro), params: { F0: num(f, 'F0', 20), T: num(f, 'T', 2), m: num(one(els, '运动体'), 'm', 1) } } } },
  { id: 'variable-force', title: '微元法 + 积分 W=∫F dx（模型 66）', need: ['变力', '运动体'], build: (els) => { const f = one(els, '变力')!; if (num(f, 'kind', 0) !== 1) throw new Error('F(t)'); return { target: M(variableForce), params: { F0: num(f, 'F0', 20), L: num(f, 'T', 4), m: num(one(els, '运动体'), 'm', 2) } } } },
  { id: 'weight', title: '超重失重（模型 24）', need: ['非惯性系', '运动体'], build: (els) => { const e = one(els, '非惯性系')!; if (num(e, 'dir', 0) !== 0) throw new Error('horizontal'); return { target: M(weightChange), params: { a: num(e, 'a', 2), m: Math.max(40, num(one(els, '运动体'), 'm', 60)) } } } },
  { id: 'noninertial', title: '相对运动 + 非惯性系（模型 68）', need: ['非惯性系'], build: (els) => { const e = one(els, '非惯性系')!; if (num(e, 'dir', 0) !== 1) throw new Error('vertical'); return { target: M(noninertial), params: { a: num(e, 'a', 3) } } } },
  { id: 'pendulum', title: '单摆与小量近似（模型 67）', need: ['绳', '质点'], forbid: ['竖直杆', '滑轮', '物块', '滑块'], build: (els) => ({ target: M(smallQuantity), params: { L: num(one(els, '绳'), 'L', 1), th0: Math.max(5, num(one(els, '质点'), 'ang', 60)) } }) },
  { id: 'rigid', title: '刚体纯滚动竞速（模型 69）', need: ['刚体', '斜面'], build: (els) => ({ target: E(rigidBody), params: { th: num(one(els, '斜面'), 'th', 30), L: num(one(els, '斜面'), 'L', 6) } }) },
  // ── 电磁：粒子 ──
  { id: 'accel-selector-b', title: '加速电场 → 速度筛选器 → 磁场（场景 9）', need: ['加速电场', '筛选器', '磁场'], build: () => ({ target: { kind: 'component', component: GkAccelSelectorB, name: '加速 → 筛选 → 磁场' } }) },
  { id: 'accel-deflect', title: '加速电场 → 偏转电场 → 荧光屏（场景 10）', need: ['加速电场', '偏转电场', '荧光屏'], build: (els) => ({ target: E(accelDeflectScreen), params: { U1: num(one(els, '加速电场'), 'U', 10), U2: num(one(els, '偏转电场'), 'U', 2), L: num(one(els, '偏转电场'), 'L', 4), D: num(one(els, '荧光屏'), 'D', 4), qm: num(one(els, '带电粒子'), 'qm', 1) } }) },
  { id: 'b-then-e', title: '磁场 → 电场组合（场景 11）', need: ['磁场', '偏转电场', '带电粒子'], forbid: ['加速电场', '筛选器'], build: (els) => ({ target: E(bThenE), params: { v: num(one(els, '带电粒子'), 'v', 8), B: num(one(els, '磁场'), 'B', 0.6), E: num(one(els, '偏转电场'), 'E', 3), qm: num(one(els, '带电粒子'), 'qm', 1) } }) },
  { id: 'selector', title: '速度选择器（模型 32）', need: ['筛选器', '带电粒子'], forbid: ['加速电场', '磁场'], build: (els) => { const s = one(els, '筛选器')!, p = one(els, '带电粒子')!; return { target: E(velocitySelector), params: { U: num(s, 'U', 12), d: num(s, 'd', 3), B: num(s, 'B', 1), v: num(p, 'v', 4), sign: num(p, 'sign', 0) === 1 ? -1 : 1 } } } },
  { id: 'mass-spec', title: '质谱仪（场景 13）', need: ['加速电场', '磁场', '荧光屏'], forbid: ['筛选器', '偏转电场'], build: (els) => ({ target: E(massSpectrometer), params: { U: num(one(els, '加速电场'), 'U', 10), B: num(one(els, '磁场'), 'B', 1) } }) },
  { id: 'e-b-e', title: '电场 → 磁场 → 电场往复（模型 37）', need: ['加速电场', '磁场'], forbid: ['筛选器', '荧光屏', '偏转电场'], build: (els) => ({ target: E(eBEMulti), params: { U: num(one(els, '加速电场'), 'U', 8), B: num(one(els, '磁场'), 'B', 1.5) } }) },
  { id: 'cyclotron', title: '回旋加速器（场景 12）', need: ['回旋'], build: (els) => { const c = one(els, '回旋')!; return { target: E(cyclotron), params: { U: num(c, 'U', 2), B: num(c, 'B', 1), R: num(c, 'R', 6) } } } },
  { id: 'composite', title: '带电粒子在复合场中（场景 16）', need: ['复合场'], build: (els) => { const c = one(els, '复合场')!; return { target: E(compositeField), params: { setup: num(c, 'setup', 1), B: num(c, 'B', 2), E: num(c, 'E', 6), v: num(one(els, '带电粒子'), 'v', 4) } } } },
  { id: 'bb-combo', title: '磁场与磁场组合 / 磁聚焦（模型 36）', need: ['磁场', '带电粒子'], forbid: ['偏转电场', '加速电场', '导轨', '线圈'], build: (els) => { const bs = els.filter((e) => tagsOf(e).includes('磁场')); return { target: E(bbCombo), params: { setup: bs.length >= 2 ? (num(bs[0], 'dir', 0) !== num(bs[1], 'dir', 0) ? 0 : 1) : 2, B1: num(bs[0], 'B', 1.5), B2: num(bs[1], 'B', 1), v: num(one(els, '带电粒子'), 'v', 6), qm: num(one(els, '带电粒子'), 'qm', 1) } } } },
  // ── 电磁：感应 ──
  { id: 'rod-incline', title: '导体棒 + 倾斜导轨 + 磁场（模型 44）', need: ['导轨', '导体棒', '磁场'], build: (els) => { const r = one(els, '导轨')!; if (!(num(r, 'th', 0) > 0)) throw new Error('flat'); return { target: E(rodInclineB), params: { th: num(r, 'th', 30), L: num(r, 'L', 1), B: num(one(els, '磁场'), 'B', 1), R: num(one(els, '导体棒'), 'R', 1), m: num(one(els, '导体棒'), 'm', 1) } } } },
  { id: 'rod-spring', title: '导体棒 + 弹簧 + 磁场（模型 43）', need: ['导轨', '导体棒', '磁场', '弹簧'], build: (els) => ({ target: E(rodSpring), params: { k: num(one(els, '弹簧'), 'k', 20), B: num(one(els, '磁场'), 'B', 1), L: num(one(els, '导轨'), 'L', 1), R: num(one(els, '导体棒'), 'R', 1), m: num(one(els, '导体棒'), 'm', 1) } }) },
  { id: 'rail-rod', title: '导轨 + 导体棒 + 磁场（模型 14/38–41）', need: ['导轨', '导体棒', '磁场'], forbid: ['弹簧'], build: (els) => { const bars = els.filter((e) => tagsOf(e).includes('导体棒')); const setup = bars.length >= 2 ? 2 : has(els, '电容') ? 3 : has(els, '变力') ? 1 : 0; return { target: E(railRod), params: { setup, B: num(one(els, '磁场'), 'B', 1), L: num(one(els, '导轨'), 'L', 1), R: num(bars[0], 'R', 1), m: num(bars[0], 'm', 1), v0: num(bars[0], 'v0', 4), mu: num(one(els, '导轨'), 'mu', 0), C: num(one(els, '电容'), 'C', 2), m2: num(bars[1], 'm', 1), F: num(one(els, '变力'), 'F0', 2) } } } },
  { id: 'frame', title: '线框进出磁场（模型 42）', need: ['线圈', '磁场'], forbid: ['交流源', '磁铁', '电阻'], build: (els) => ({ target: E(frameThroughB), params: { B: num(one(els, '磁场'), 'B', 1), a: num(one(els, '线圈'), 'a', 1), d: Math.max(1, num(one(els, '磁场'), 'W', 2.5) / 3) } }) },
  { id: 'ac-four', title: '交变电流四值（模型 47）', need: ['线圈', '磁铁'], build: (els) => ({ target: E(acFourValues), params: { N: num(one(els, '线圈'), 'N', 100), S: num(one(els, '线圈'), 'S', 0.02), B: num(one(els, '磁铁'), 'B', 0.5), R: num(one(els, '电阻'), 'R', 50) } }) },
  { id: 'induction-ode', title: '电磁感应微分方程（模型 70）', need: ['导轨', '导体棒', '磁场', '时间轴'], build: (els) => ({ target: E(inductionOde), params: { B: num(one(els, '磁场'), 'B', 1), L: num(one(els, '导轨'), 'L', 1), R: num(one(els, '导体棒'), 'R', 1), m: num(one(els, '导体棒'), 'm', 1) } }) },
  { id: 'transformer', title: '变压器 + 远距离输电（场景 15/45/46）', need: ['变压器'], build: (els) => { const t = one(els, '变压器')!; const line = one(els, '输电线'); return { target: E(transformerTransmission), params: { setup: line ? 1 : 0, N1: num(t, 'N1', 200), N2: num(t, 'N2', 50), R: num(one(els, '电阻'), 'R', 22), U1: num(one(els, '交流源'), 'U', 220), k: num(line, 'k', 10), r: num(line, 'r', 5) } } } },
  { id: 'mhd', title: '磁流体发电机（模型 33）', need: ['磁流体'], build: (els) => { const m = one(els, '磁流体')!; return { target: E(mhdGenerator), params: { v: num(m, 'v', 6), d: num(m, 'd', 0.5), B: num(m, 'B', 1), R: num(one(els, '电阻'), 'R', 2) } } } },
  { id: 'hall', title: '霍尔效应（模型 35）', need: ['霍尔'], build: (els) => { const h = one(els, '霍尔')!; return { target: E(hallEffect), params: { I: num(h, 'I', 2), B: num(h, 'B', 1), carrier: num(h, 'carrier', 0) === 1 ? 1 : -1 } } } },
  // ── 电磁：电路 ──
  { id: 'volt-ammeter', title: '伏安法测电阻（模型 49）', need: ['电池', '电阻', '电流表', '电压表'], build: (els) => ({ target: E(voltAmmeterResistance), params: { Rx: num(one(els, '电阻'), 'R', 100), RA: num(one(els, '电流表'), 'RA', 1), RV: num(one(els, '电压表'), 'RV', 3000), E: num(one(els, '电池'), 'E', 6), r: num(one(els, '电池'), 'r', 0.5) }, notes: ['也可切到「电路编辑器」自由连线，验证内接 / 外接读数差异'] }) },
  { id: 'meter-conv', title: '电表改装（模型 48）', need: ['电流计', '电阻'], forbid: ['电池'], build: (els) => ({ target: E(meterConversion), params: { Ig: num(one(els, '电流计'), 'Ig', 1), Rg: num(one(els, '电流计'), 'Rg', 100) } }) },
  { id: 'black-box', title: '电学黑箱（模型 50）', need: ['黑箱'], build: (els) => ({ target: E(blackBox), params: { R: num(one(els, '电阻'), 'R', 20) } }) },
  { id: 'circuit', title: '自由电路（节点电压法 / 相量）', need: ['电路'], build: (els) => { const kinds = [...new Set(els.map((e) => CIRCUIT_KIND[e.type]).filter(Boolean))] as ComponentKind[]; return { target: { kind: 'circuit', palette: kinds.length ? kinds : ['battery', 'resistor', 'switch', 'ammeter', 'voltmeter'] }, notes: ['进入电路编辑器：拖到面板、连线、合上开关即得电流电压；错接会被故障检测提示'] } } },
  // ── 热学 ──
  { id: 'liquid-seal', title: '玻璃管液封气体（模型 51）', need: ['玻璃管', '液柱'], build: (els) => { const t = one(els, '玻璃管')!; return { target: M(liquidSealTube), params: { mode: num(t, 'open', 0), h: num(one(els, '液柱'), 'h', 10), L1: num(t, 'L1', 20), T1: num(one(els, '气体'), 'T1', 300), T2: num(one(els, '温度源') ?? one(els, '气体'), 'T2', 360) } } } },
  { id: 'piston', title: '汽缸活塞（模型 52）', need: ['汽缸', '活塞'], build: (els) => { const c = one(els, '汽缸')!; return { target: M(cylinderPiston), params: { mode: num(c, 'orient', 0) === 1 ? 2 : 0, M: num(one(els, '活塞'), 'M', 10), S: num(c, 'S', 0.01), T1: num(one(els, '气体'), 'T1', 300), T2: num(one(els, '温度源') ?? one(els, '气体'), 'T2', 360) } } } },
  { id: 'u-tube', title: 'U 形管（模型 54）', need: ['U形管'], build: (els) => { const u = one(els, 'U形管')!; return { target: M(uTube), params: { dh0: num(u, 'dh0', 4), L1: num(u, 'L1', 20), T2: num(one(els, '温度源') ?? one(els, '气体'), 'T2', 360) } } } },
  { id: 'pump', title: '变质量气体（模型 53）', need: ['打气筒'], build: (els) => { const p = one(els, '打气筒')!; return { target: M(variableMassGas), params: { mode: num(p, 'mode', 0), V0: num(p, 'V0', 0.5), n: num(p, 'n', 8), V: num(one(els, '容器'), 'V', 10) } } } },
  // ── 光学 ──
  { id: 'prism', title: '棱镜 / 玻璃砖折射（模型 55）', need: ['光源'], bonus: ['棱镜', '玻璃砖', '半圆砖'], forbid: ['单缝', '双缝', '劈尖'], build: (els) => { const p = one(els, '棱镜'), g = one(els, '玻璃砖'), hd = one(els, '半圆砖'); if (!p && !g && !hd) throw new Error('no optic'); return { target: M(prismRefraction), params: { mode: p ? 1 : hd ? 2 : 0, n: num(p ?? g ?? hd, 'n', 1.5), th1: num(one(els, '光源'), 'th1', 40), A: num(p, 'A', 60), h: num(g, 'h', 2.5) } } } },
  { id: 'thin-film', title: '薄膜干涉（模型 56）', need: ['光源', '劈尖'], build: (els) => ({ target: M(thinFilm), params: { lam: num(one(els, '光源'), 'lam', 600), alpha: num(one(els, '劈尖'), 'alpha', 2), n: num(one(els, '劈尖'), 'n', 1) } }) },
  { id: 'slits', title: '单缝衍射 vs 双缝干涉（模型 57）', need: ['光源'], bonus: ['单缝', '双缝', '光屏'], forbid: ['棱镜', '玻璃砖'], build: (els) => { if (!has(els, '单缝') && !has(els, '双缝')) throw new Error('no slit'); return { target: M(diffractionVsInterference), params: { lam: num(one(els, '光源'), 'lam', 600), a: num(one(els, '单缝'), 'a', 0.05), d: num(one(els, '双缝'), 'd', 0.2), L: num(one(els, '光屏'), 'L', 1) } } } },
  { id: 'wave-super', title: '波的叠加与干涉（模型 60）', need: ['波源'], build: (els) => { const w = one(els, '波源')!; return { target: M(waveSuperposition), params: { lam: num(w, 'lam', 2), d: num(w, 'd', 4), phase: num(w, 'phase', 0) } } } },
  { id: 'wave-multi', title: '波的多解（模型 58）', need: ['波源', '图像'], build: (els) => ({ target: M(waveMultiSolution), params: { lam: num(one(els, '波源'), 'lam', 4) } }) },
  // ── 近代 ──
  { id: 'photoelectric', title: '光电效应 + Eₖ–ν（模型 61）', need: ['光电管'], build: (els) => ({ target: M(photoelectricEkNu), params: { mat: num(one(els, '光电管'), 'mat', 0), nu: num(one(els, '可调光源'), 'nu', 6), I: num(one(els, '可调光源'), 'I', 2) } }) },
  { id: 'hydrogen', title: '氢原子能级跃迁（模型 62）', need: ['氢原子'], forbid: ['光子', '电子束'], build: (els) => ({ target: M(hydrogenLevels), params: { m: num(one(els, '氢原子'), 'm', 3), n: num(one(els, '氢原子'), 'n', 2) } }) },
  { id: 'bohr', title: '玻尔模型 + 碰撞（模型 64）', need: ['氢原子'], bonus: ['光子', '电子束'], build: (els) => { const ph = one(els, '光子'), eb = one(els, '电子束'); if (!ph && !eb) throw new Error('no probe'); return { target: M(bohrCollision), params: { kind: ph ? 1 : 0, E: num(ph ?? eb, 'E', 12.5) } } } },
  { id: 'matter-wave', title: '物质波 / 电子衍射（模型 65）', need: ['电子束', '晶体'], build: (els) => ({ target: M(matterWave), params: { U: num(one(els, '电子束'), 'U', 100), d: num(one(els, '晶体'), 'd', 0.2) } }) },
  { id: 'nuclear', title: '核反应 + 质量亏损（模型 63）', need: ['原子核'], build: (els) => ({ target: M(nuclearReaction), params: { rxn: num(one(els, '原子核'), 'rxn', 2) } }) },
  { id: 'alpha', title: 'α 粒子散射（教材 xb3）', need: ['α散射'], build: () => ({ target: { kind: 'link', to: '/exp/xb3-alpha-scatter', name: 'α 粒子散射实验' } }) },
  // ── 兜底：刚体沙盒 ──
  { id: 'dyn4j', title: '刚体沙盒（dyn4j 任意组合）', need: [], build: () => ({ target: { kind: 'dyn4j' }, notes: ['未匹配到专用求解器：可把方块 / 小球 / 斜面 / 墙 / 场交给刚体实验台（/lab）自由运行'] }) },
]

export function recognize(els: Placed[]): Recognition {
  const domains = new Set(els.map((e) => byType.get(e.type)?.domain))
  let best: { rule: Rule; score: number; built: ReturnType<Rule['build']> } | null = null
  const partial: { rule: Rule; missing: string[] }[] = []
  for (const rule of RULES) {
    const missing = rule.need.filter((t) => !has(els, t))
    if (rule.forbid?.some((t) => has(els, t))) continue
    if (missing.length) { if (rule.need.length && missing.length <= Math.ceil(rule.need.length / 2)) partial.push({ rule, missing }); continue }
    try {
      const built = rule.build(els)
      const score = rule.need.length * 2 + (rule.bonus?.filter((t) => has(els, t)).length ?? 0) + (rule.id === 'dyn4j' ? -1 : 0)
      if (!best || score > best.score) best = { rule, score, built }
    } catch { /* 规则内部条件不满足 */ }
  }
  if (!best || best.rule.id === 'dyn4j') {
    const mechOnly = els.length > 0 && [...domains].every((d) => d === 'mech' || d === 'util' || d === 'em')
    const notes = els.length === 0 ? ['画布为空：从左侧元件面板拖入元件开始搭建'] : (best?.built.notes ?? [])
    const sugg = partial.slice(0, 3).map((p) => `再加「${p.missing.join('、')}」即可成为「${p.rule.title}」`)
    return { family: els.length && mechOnly ? 'dyn4j' : 'none', title: els.length ? (mechOnly ? '刚体沙盒（dyn4j）' : '未识别到可运行的组合') : '空画布', target: els.length && mechOnly ? { kind: 'dyn4j' } : null, params: {}, confidence: els.length ? 0.4 : 0, used: [], missing: partial[0]?.missing ?? [], notes: [...notes, ...sugg] }
  }
  const used = best.rule.need.concat(best.rule.bonus?.filter((t) => has(els, t)) ?? [])
  const total = Math.max(1, els.length)
  const usedCount = els.filter((e) => tagsOf(e).some((t) => used.includes(t))).length
  const extra = els.filter((e) => !tagsOf(e).some((t) => used.includes(t) || t === '传感器' || t === '图像' || t === '数据表' || t === '能量条' || t === '矢量' || t === '轨迹' || t === '时间轴' || t === '计时' || t === '量角器' || t === '压强计' || t === '碰撞')).map((e) => byType.get(e.type)?.label ?? e.type)
  const notes = [...(best.built.notes ?? [])]
  if (extra.length) notes.push(`未参与本求解的元件：${extra.join('、')}（求解器按主要元件建模）`)
  return { family: best.rule.id, title: best.rule.title, target: best.built.target, params: best.built.params ?? {}, confidence: Math.min(1, 0.6 + 0.4 * (usedCount / total)), used, missing: [], notes }
}

export { count }
