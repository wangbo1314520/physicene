/**
 * 实验注册表（40 个 = 阶段一 22 + 阶段二 18）
 * B0 上线 7 个（电磁三件套批次已开发的实验）；其余锁定并标注目标批次。
 * B1=2D 引擎 B2=2.5D 引擎 B3=3D 引擎 P1=阶段一 P2=阶段二
 */
import type { Component } from 'vue'
import type { ExperimentModule, ExperimentPreset } from '../core/types'
import ExpEmf from '../defs/ExpEmf.vue'
import ExpHookePhoto from '../defs/ExpHookePhoto.vue'
import ExpCanvasPanels from '../defs/ExpCanvasPanels.vue'
import ExpForceComposition from '../defs/ExpForceComposition.vue'
import ExpProjectile from '../defs/ExpProjectile.vue'
import ExpOilFilm from '../defs/ExpOilFilm.vue'
import ExpDoubleSlit from '../defs/ExpDoubleSlit.vue'
import ExpTapePractice from '../defs/ExpTapePractice.vue'
import ExpTrolleyVT from '../defs/ExpTrolleyVT.vue'
import ExpFreefallTape from '../defs/ExpFreefallTape.vue'
import ExpSpringOsc from '../defs/ExpSpringOsc.vue'
import ExpPendulumG from '../defs/ExpPendulumG.vue'
import ExpConicalPend from '../defs/ExpConicalPend.vue'
import ExpNewtonTube from '../defs/ExpNewtonTube.vue'
import ExpGasIsotherm from '../defs/ExpGasIsotherm.vue'
import ExpWorkVelocity from '../defs/ExpWorkVelocity.vue'
import ExpActionReaction from '../defs/ExpActionReaction.vue'
import ExpMultimeter from '../defs/ExpMultimeter.vue'
import ExpInduction from '../defs/ExpInduction.vue'
import ExpEmfFactors from '../defs/ExpEmfFactors.vue'
import ExpLenzLaw from '../defs/ExpLenzLaw.vue'
import ExpAmpereForce from '../defs/ExpAmpereForce.vue'
import ExpLorentzDemo from '../defs/ExpLorentzDemo.vue'
import ExpParticleBField from '../defs/ExpParticleBField.vue'
import ExpTransformer from '../defs/ExpTransformer.vue'
import ExpBrownian from '../defs/ExpBrownian.vue'
import ExpAlphaScatter3D from '../defs/ExpAlphaScatter3D.vue'
import ExpAlt from '../defs/ExpAlt.vue'
import ExpTapeVelocity from '../defs/ExpTapeVelocity.vue'
import ExpCapacitorCharge from '../defs/ExpCapacitorCharge.vue'
import ExpResistivity from '../defs/ExpResistivity.vue'
import ExpRefraction from '../defs/ExpRefraction.vue'
import ExpStaticFriction from '../defs/ExpStaticFriction.vue'
import ExpCoulombBalance from '../defs/ExpCoulombBalance.vue'
import ExpWaveInterference from '../defs/ExpWaveInterference.vue'
import ExpLightPhenomena from '../defs/ExpLightPhenomena.vue'
import ExpSelfInduction from '../defs/ExpSelfInduction.vue'
import ExpLcAc from '../defs/ExpLcAc.vue'

/** 通用四步流程（2.5D 仿真实验共用骨架，B0 7 个实验的步骤） */
function simSteps(extra: { goal: string; hint: string }[] = []): ExperimentModule['steps'] {
  return [
    { id: 'read', title: '阅读实验目的', goal: '明确本实验要探究的物理规律', hint: '阅读左侧实验简介，理解目标后进入下一步' },
    {
      id: 'run',
      title: '运行实验并观察现象',
      goal: '完成一次完整仿真运行',
      hint: '点击「▶ 运行实验」，观察元件运动与曲线变化',
      check: (ctx) => ctx.lastEvent?.type === 'sim-ended',
      errorHints: { default: '需要等实验运行结束（收到 ended 事件）才能进入下一步' },
      scoreWeight: 2,
    },
    {
      id: 'record',
      title: '记录实验数据',
      goal: '采集本实验的关键数据（自动记录极值与关键事件）',
      hint: '点击「📋 记录数据」，系统自动采集速度/能量极值与关键事件',
      check: (ctx) => Object.keys(ctx.records).length > 0 && ctx.records['record'] != null,
      errorHints: { default: '请先点击「记录数据」按钮完成采集' },
      scoreWeight: 3,
    },
    {
      id: 'conclude',
      title: '填写实验结论',
      goal: extra[0]?.goal ?? '用自己的话总结实验验证了什么规律',
      hint: extra[0]?.hint ?? '在结论框中写下你观察到的物理规律（如动量守恒、F=Kq₁q₂/r²），然后提交',
      scoreWeight: 3,
    },
  ]
}

function panelSteps(recordHint: string): ExperimentModule['steps'] {
  return [
    { id: 'read', title: '阅读实验目的', goal: '明确本实验要探究的物理规律', hint: '阅读左侧实验简介，理解目标后进入下一步' },
    { id: 'operate', title: '操作仪器获取数据', goal: '调节参数并记录读数（至少 4-6 组）', hint: recordHint, scoreWeight: 2 },
    {
      id: 'record', title: '记录并分析数据',
      goal: '记录实验数据（自动进入坐标纸/图示）',
      hint: '点击仪器面板上的「📏 记录」按钮完成采集',
      check: (ctx) => ctx.lastEvent?.type === 'data-recorded',
      errorHints: { default: '请先点击仪器面板的记录按钮' },
      scoreWeight: 3,
    },
    { id: 'conclude', title: '填写实验结论', goal: '总结实验验证的规律', hint: '在结论框写下规律（可参考拟合结果），然后提交', scoreWeight: 3 },
  ]
}

const p = (elements: unknown[], config: Record<string, unknown>): ExperimentPreset =>
  ({ elements, config })

const pc = (id: string, x: number, y: number, vx: number, vy: number, m: number, q: number, color = '#F5C542') =>
  ({ id, type: 'point_charge', position: { x, y }, properties: { mass: m, charge: q, ...(color ? { color } : {}) }, initialState: { velocity: { x: vx, y: vy } }, color })

/** 7 个 B0 上线实验（沿用演示实验库的物理参数，物理已单测验证） */
const AVAILABLE: ExperimentModule[] = [
  {
    id: 'bx1-inertia',
    name: '惯性：光滑冰面匀速直线运动',
    book: '必修第一册', chapter: '第四章 运动和力的关系', dimension: '2.5D',
    summary: '摩擦力为零时物体保持匀速直线运动——牛顿第一定律。',
    available: true, batch: 'B0',
    preset: p([
      { id: 'cube', type: 'cube', position: { x: -8, y: 0.5 }, color: '#4A90D9', properties: { mass: 1, friction: 0, restitution: 0 }, initialState: { velocity: { x: 6, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 }, color: '#8a8aa0', properties: { friction: 0 } },
    ], { gravity: { x: 0, y: -9.8 }, maxDuration: 6 }),
    steps: simSteps(),
  },
  {
    id: 'bx1-f-ma',
    name: '探究加速度与力、质量的关系（a=F/m）',
    book: '必修第一册', chapter: '第四章 运动和力的关系', dimension: '2.5D',
    summary: '相同电场力下，质量 1kg 与 2kg 的电荷加速度之比应为 2:1。',
    available: true, batch: 'B0',
    preset: p([
      pc('light', -6, 1.5, 0, 0, 1, 1),
      pc('heavy', -6, -1.5, 0, 0, 2, 1, '#E05555'),
      { id: 'ef', type: 'e_field', position: { x: 0, y: 0 }, scale: { x: 24, y: 10 }, properties: { eFieldX: 1, eFieldY: 0 } },
    ], { gravity: { x: 0, y: 0 }, maxDuration: 5 }),
    steps: simSteps(),
  },
  {
    id: 'bx2-energy',
    name: '验证机械能守恒定律（20m 落差）',
    book: '必修第二册', chapter: '第八章 机械能守恒定律', dimension: '2.5D',
    summary: '自由下落中动能增量 = 重力势能减少量，Ek-t 为抛物线。',
    available: true, batch: 'B0',
    preset: p([
      { id: 'ball', type: 'sphere', position: { x: 0, y: 20 }, color: '#F5C542', properties: { mass: 1, friction: 0, restitution: 0.3 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 }, color: '#8a8aa0' },
    ], { gravity: { x: 0, y: -9.8 }, maxDuration: 4 }),
    steps: simSteps(),
  },
  {
    id: 'bx3-coulomb-repulsion',
    name: '库仑定律：同种电荷相互排斥',
    book: '必修第三册', chapter: '第九章 静电场及其应用', dimension: '2.5D',
    summary: 'F=Kq₁q₂/r²，同号电荷沿连线相互远离，电量大的加速度小。',
    available: true, batch: 'B0',
    preset: p([
      pc('q1', -2, 0, 0, 0, 1, 2, '#E05555'),
      pc('q2', 2, 0, 0, 0, 1, 1),
    ], { gravity: { x: 0, y: 0 }, maxDuration: 6 }),
    steps: simSteps(),
  },
  {
    id: 'bx3-coulomb-attraction',
    name: '库仑定律：异种电荷相互吸引',
    book: '必修第三册', chapter: '第九章 静电场及其应用', dimension: '2.5D',
    summary: '异号电荷相向加速，接触碰撞后弹开再吸引——振荡系统。',
    available: true, batch: 'B0',
    preset: p([
      pc('q1', -5, 0, 0, 0, 2, 2, '#E05555'),
      pc('q2', 5, 0, 0, 0, 1, -1),
    ], { gravity: { x: 0, y: 0 }, maxDuration: 8 }),
    steps: simSteps(),
  },


  {
    id: 'bx3-emf-internal',
    name: '电池电动势和内阻的测量',
    book: '必修第三册', chapter: '第十二章 电能 能量守恒定律', dimension: '2D',
    summary: 'U-I 图线：截距=电动势 E，斜率=−内阻 r。',
    available: true, batch: 'B1', component: ExpEmf as Component,
    steps: panelSteps('调节滑动变阻器 R，点击「记录此组 (I, U)」采集不同 R 下的读数，至少 6 组'),
  },
  {
    id: 'bx1-hooke',
    name: '探究弹簧弹力与形变量的关系（胡克定律）',
    book: '必修第一册', chapter: '第三章 相互作用——力', dimension: '2D',
    summary: 'F-x 图线过原点，斜率=劲度系数 k。',
    available: true, batch: 'B1', component: ExpHookePhoto as unknown as Component,
    steps: panelSteps('选择砝码档位，点击「📏 记录读数」采集 (x, F) 数据，至少 5 组'),
  },
  {
    id: 'xb3-photoelectric',
    name: '观察光电效应现象（Uc-ν 测普朗克常量）',
    book: '选择性必修第三册', chapter: '第四章 原子结构和波粒二象性', dimension: '2D',
    summary: 'Uc-ν 直线：斜率=h/e，截距=−W/e。',
    available: true, batch: 'B1', component: ExpHookePhoto as unknown as Component,
    steps: panelSteps('调节频率档位，点击「📏 记录读数」采集 (ν, Uc) 数据，至少 5 组'),
  },
  {
    id: 'bx1-force-composition',
    name: '探究两个互成角度的力的合成规律',
    book: '必修第一册', chapter: '第三章 相互作用——力', dimension: '2D',
    summary: '平行四边形定则：合力=对角线矢量。',
    available: true, batch: 'B1', component: ExpForceComposition as unknown as Component,
    steps: panelSteps('调节 F1/F2/夹角，观察合力是否始终等于平行四边形对角线，点击「记录验证数据」'),
  },
  {
    id: 'bx2-projectile',
    name: '探究平抛运动的特点',
    book: '必修第二册', chapter: '第五章 抛体运动', dimension: '2D',
    summary: '水平匀速 + 竖直自由落体：y = h − (g/2v₀²)x²。',
    available: true, batch: 'B1', component: ExpProjectile as unknown as Component,
    steps: panelSteps('调节 v₀ 与 h，点击「▶ 播放并采样轨迹」，观察轨迹形状'),
  },
  {
    id: 'xb1-double-slit',
    name: '用双缝干涉测量光的波长',
    book: '选择性必修第一册', chapter: '第四章 光', dimension: '2D',
    summary: '条纹间距 Δy=λL/d，测 Δy 反推波长。',
    available: true, batch: 'B1', component: ExpDoubleSlit as unknown as Component,
    steps: panelSteps('调节 λ/d/L 观察条纹变化，用游标测 Δy，点击「记录测量结果」'),
  },
  {
    id: 'xb3-oil-film',
    name: '用油膜法估测油酸分子的大小',
    book: '选择性必修第三册', chapter: '第一章 分子动理论', dimension: '2D',
    summary: '单分子油膜：d = V/S，数量级 10⁻⁹m。',
    available: true, batch: 'B1', component: ExpOilFilm as unknown as Component,
    steps: panelSteps('点击轮廓内格子计数（约 35-45 格），点击「记录计数结果」'),
  }
]

/** 阶段一其余 15 个 + 阶段二 18 个（锁定占位，标注目标批次） */
function locked(id: string, name: string, book: string, chapter: string,
                dimension: '2D' | '2.5D' | '3D', batch: string, summary: string): ExperimentModule {
  return { id, name, book, chapter, dimension, summary, available: false, batch, steps: [] }
}

const LOCKED: ExperimentModule[] = [
  // ── 阶段一（B1 纸带/作图类 → B2 2.5D 约束类 → B4 电路 → B5 光学）──
    {
    id: 'bx1-timer-practice',
    name: '练习使用打点计时器',
    book: '必修第一册', chapter: '第二章 匀变速直线运动的研究', dimension: '2.5D',
    summary: '50Hz 打点，逐差法求 a',
    available: true, batch: 'B2', component: ExpTapePractice as unknown as Component,
    steps: panelSteps('点击「打出纸带」→ 观察计数点 → 记录逐差法分析'),
  },
    {
    id: 'bx1-tape-velocity',
    name: '测量纸带的平均速度和瞬时速度',
    book: '必修第一册', chapter: '第二章 匀变速直线运动的研究', dimension: '2D',
    summary: '纸带读数→速度计算',
    available: true, batch: 'B8', component: ExpTapeVelocity as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'bx1-trolley-vt',
    name: '探究小车速度随时间变化的规律',
    book: '必修第一册', chapter: '第二章 匀变速直线运动的研究', dimension: '2.5D',
    summary: '纸带 → v-t 图 → 加速度',
    available: true, batch: 'B2', component: ExpTrolleyVT as unknown as Component,
    steps: panelSteps('点击「打出纸带」→ 观察计数点 → 记录逐差法分析'),
  },
    {
    id: 'bx1-freefall-timer',
    name: '用打点计时器研究自由落体运动',
    book: '必修第一册', chapter: '第二章 匀变速直线运动的研究', dimension: '2.5D',
    summary: '纸带 → 逐差法测 g',
    available: true, batch: 'B2', component: ExpFreefallTape as unknown as Component,
    steps: panelSteps('点击「打出纸带」→ 观察计数点 → 记录逐差法分析'),
  },
    {
    id: 'bx2-centripetal',
    name: '探究向心力大小与半径、角速度、质量的关系',
    book: '必修第二册', chapter: '第六章 圆周运动', dimension: '2.5D',
    summary: 'F = mrω² 控制变量',
    available: true, batch: 'B2', component: ExpConicalPend as unknown as Component,
    steps: panelSteps('调节 L/θ → 计算 → 记录验证数据'),
  },
    {
    id: 'bx2-work-velocity',
    name: '探究功与速度变化的关系',
    book: '必修第二册', chapter: '第八章 机械能守恒定律', dimension: '2.5D',
    summary: 'W = ½mv² 数据拟合',
    available: true, batch: 'B2', component: ExpWorkVelocity as unknown as Component,
    steps: panelSteps('采集 W-v² 数据 → 记录'),
  },
    {
    id: 'bx3-capacitor-charge',
    name: '观察电容器的充、放电现象',
    book: '必修第三册', chapter: '第十章 静电场中的能量', dimension: '2D',
    summary: 'RC 充放电曲线',
    available: true, batch: 'B8', component: ExpCapacitorCharge as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'bx3-resistivity',
    name: '导体电阻率的测量',
    book: '必修第三册', chapter: '第十一章 电路及其应用', dimension: '2D',
    summary: '伏安法+R=ρL/S',
    available: true, batch: 'B8', component: ExpResistivity as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'bx3-multimeter',
    name: '练习使用多用电表（虚拟仪表）',
    book: '必修第三册', chapter: '第十一章 电路及其应用', dimension: '2.5D',
    summary: '虚拟多用电表读数练习',
    available: true, batch: 'B2', component: ExpMultimeter as unknown as Component,
    steps: panelSteps('虚拟仪表读数练习 → 记录'),
  },
    {
    id: 'xb1-pendulum-g',
    name: '用单摆测量重力加速度',
    book: '选择性必修第一册', chapter: '第二章 机械振动', dimension: '2.5D',
    summary: 'T²-L 图线测 g',
    available: true, batch: 'B2', component: ExpPendulumG as unknown as Component,
    steps: panelSteps('调节摆长/摆角 → 启动计时 → 停止测 g'),
  },
    {
    id: 'xb1-refraction',
    name: '测量玻璃的折射率',
    book: '选择性必修第一册', chapter: '第四章 光', dimension: '2D',
    summary: 'n=sinθ₁/sinθ₂',
    available: true, batch: 'B8', component: ExpRefraction as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'xb3-gas-isotherm',
    name: '探究气体等温变化的规律',
    book: '选择性必修第三册', chapter: '第二章 气体、固体和液体', dimension: '2.5D',
    summary: 'pV = C 玻意耳定律',
    available: true, batch: 'B2', component: ExpGasIsotherm as unknown as Component,
    steps: panelSteps('采集 pV 数据 → 记录'),
  },
  // ── 阶段二（B3 3D 引擎 + B6/B7）──
    {
    id: 'bx1-newton-tube',
    name: '牛顿管实验（真空落体）',
    book: '必修第一册', chapter: '第二章 匀变速直线运动的研究', dimension: '2.5D',
    summary: '真空 vs 有空气的落体对比',
    available: true, batch: 'B2', component: ExpNewtonTube as unknown as Component,
    steps: panelSteps('调气压 → 释放 → 记录'),
  },
    {
    id: 'bx1-static-friction',
    name: '静摩擦力的大小随拉力的变化',
    book: '必修第一册', chapter: '第三章 相互作用——力', dimension: '2D',
    summary: 'F-t 曲线与最大静摩擦',
    available: true, batch: 'B8', component: ExpStaticFriction as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'bx1-action-reaction',
    name: '探究作用力和反作用力的关系',
    book: '必修第一册', chapter: '第四章 运动和力的关系', dimension: '2.5D',
    summary: 'F₁=-F₂，m₁v₁+m₂v₂=0',
    available: true, batch: 'B2', component: ExpActionReaction as unknown as Component,
    steps: panelSteps('调 m₁/m₂/冲量 → 记录验证'),
  },
    {
    id: 'bx1-conical-pendulum',
    name: '用圆锥摆粗略验证向心力公式',
    book: '必修第一册', chapter: '第六章 圆周运动', dimension: '2.5D',
    summary: 'T=2π√(Lcosθ/g)',
    available: true, batch: 'B2', component: ExpConicalPend as unknown as Component,
    steps: panelSteps('调 L/θ → 计算 → 记录'),
  },
    {
    id: 'bx3-coulomb-balance',
    name: '库仑扭秤实验（定量探究）',
    book: '必修第三册', chapter: '第九章 静电场及其应用', dimension: '2D',
    summary: 'F∝q₁q₂/r²',
    available: true, batch: 'B8', component: ExpCoulombBalance as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'bx3-induction-condition',
    name: '探究感应电流产生的条件（3D）',
    book: '必修第三册', chapter: '第十三章 电磁感应与电磁波初步', dimension: '3D',
    summary: '磁通变化 → 感应电流产生条件',
    available: true, batch: 'B3', component: ExpInduction as unknown as Component,
    steps: panelSteps('调节 B/角度 → 观察磁通变化与感应电流'),
  },
    {
    id: 'bx3-emf-factors',
    name: '探究影响感应电动势大小的因素（3D）',
    book: '必修第三册', chapter: '第十三章 电磁感应与电磁波初步', dimension: '3D',
    summary: 'ε = N·dΦ/dt',
    available: true, batch: 'B3', component: ExpEmfFactors as unknown as Component,
    steps: panelSteps('调节参数 → 观察感应电动势大小变化'),
  },
    {
    id: 'bx3-lenz-law',
    name: '探究楞次定律（3D）',
    book: '必修第三册', chapter: '第十三章 电磁感应与电磁波初步', dimension: '3D',
    summary: '感应电流方向阻碍磁通变化',
    available: true, batch: 'B3', component: ExpLenzLaw as unknown as Component,
    steps: panelSteps('调节磁通变化 → 观察感应电流方向'),
  },
  {
    id: 'xb1-momentum-conservation',
    name: '验证动量守恒定律',
    book: '选择性必修第一册', chapter: '第一章 动量守恒定律', dimension: '2.5D',
    summary: '碰撞前后 m1v1+m2v2 = 常量。',
    available: true, batch: 'B2',
    preset: p([
      { id: 'car1', type: 'cube', position: { x: -3, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 0.5 },
        initialState: { velocity: { x: 4, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 3, y: 0.5 }, color: '#E05555',
        properties: { mass: 2, friction: 0, restitution: 0.5 },
        initialState: { velocity: { x: -2, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 30, y: 0.2 },
        color: '#8a8aa0' },
    ], { gravity: { x: 0, y: 0 }, maxDuration: 5 }),
    steps: simSteps(),
  },
    {
    id: 'xb1-wave-interference',
    name: '观察波的干涉、衍射现象',
    book: '选择性必修第一册', chapter: '第三章 机械波', dimension: '2D',
    summary: '波场叠加',
    available: true, batch: 'B8', component: ExpWaveInterference as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'xb1-light-phenomena',
    name: '观察光的干涉、衍射、偏振现象',
    book: '选择性必修第一册', chapter: '第四章 光', dimension: '2D',
    summary: '条纹/偏振',
    available: true, batch: 'B8', component: ExpLightPhenomena as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'xb2-ampere-force',
    name: '观察安培力方向（3D 右手定则）',
    book: '选择性必修第二册', chapter: '第一章 安培力与洛伦兹力', dimension: '3D',
    summary: 'F = I·L×B',
    available: true, batch: 'B3', component: ExpAmpereForce as unknown as Component,
    steps: panelSteps('调节 B → 观察安培力方向'),
  },
    {
    id: 'xb2-lorentz-demo',
    name: '洛伦兹力演示（3D）',
    book: '选择性必修第二册', chapter: '第一章 安培力与洛伦兹力', dimension: '3D',
    summary: 'F = qv×B',
    available: true, batch: 'B3', component: ExpLorentzDemo as unknown as Component,
    steps: panelSteps('调节 B/v/q → 观察洛伦兹力方向'),
  },
    {
    id: 'xb2-particle-bfield',
    name: '带电粒子在匀强磁场中的运动（3D）',
    book: '选择性必修第二册', chapter: '第一章 安培力与洛伦兹力', dimension: '3D',
    summary: 'r = mv/qB',
    available: true, batch: 'B3', component: ExpParticleBField as unknown as Component,
    steps: panelSteps('调节 B/v → 观察圆周/螺旋运动'),
  },
    {
    id: 'xb2-transformer',
    name: '探究变压器电压与匝数的关系（3D）',
    book: '选择性必修第二册', chapter: '第三章 交变电流', dimension: '3D',
    summary: 'U₁/U₂ = N₁/N₂',
    available: true, batch: 'B3', component: ExpTransformer as unknown as Component,
    steps: panelSteps('调节匝数 → 验证电压比'),
  },
    {
    id: 'xb2-self-induction',
    name: '探究自感现象',
    book: '选择性必修第二册', chapter: '第二章 电磁感应', dimension: '2D',
    summary: '通电/断电自感',
    available: true, batch: 'B8', component: ExpSelfInduction as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'xb2-lc-ac',
    name: '探究电感器和电容器对交流电的影响',
    book: '选择性必修第二册', chapter: '第三章 交变电流', dimension: '2D',
    summary: '感抗/容抗与频率',
    available: true, batch: 'B8', component: ExpLcAc as unknown as Component,
    steps: panelSteps('调节参数 → 记录读数 → 坐标纸拟合'),
  },
    {
    id: 'xb3-brownian',
    name: '观察布朗运动（3D）',
    book: '选择性必修第三册', chapter: '第一章 分子动理论', dimension: '3D',
    summary: '三维微粒无规则热运动',
    available: true, batch: 'B3', component: ExpBrownian as unknown as Component,
    steps: panelSteps('调温度 → 观察三维随机运动'),
  },
]


function get3d_name(eid: string) {
  const m: Record<string, string> = {
    'bx3-induction-condition': '探究感应电流产生的条件（3D）',
    'bx3-emf-factors': '探究影响感应电动势大小的因素（3D）',
    'bx3-lenz-law': '探究楞次定律（3D）',
    'xb2-ampere-force': '观察安培力方向（3D 右手定则）',
    'xb2-lorentz-demo': '洛伦兹力演示（3D）',
    'xb2-particle-bfield': '带电粒子在匀强磁场中的运动（3D 模型）',
    'xb2-transformer': '探究变压器电压与匝数的关系（3D）',
    'xb3-brownian': '观察布朗运动（3D）',
    'xb3-alpha-scatter3d': 'α粒子散射实验（3D）',
  }
  return m[eid] ?? eid
}
function get3d_book(eid: string) {
  if (eid.startsWith('bx3')) return '必修第三册'
  if (eid.startsWith('xb2')) return '选择性必修第二册'
  return '选择性必修第三册'
}
function get3d_chapter(eid: string) {
  const m: Record<string, string> = {
    'bx3-induction-condition': '第十三章 电磁感应与电磁波初步',
    'bx3-emf-factors': '第十三章 电磁感应与电磁波初步',
    'bx3-lenz-law': '第十三章 电磁感应与电磁波初步',
    'xb2-ampere-force': '第一章 安培力与洛伦兹力',
    'xb2-lorentz-demo': '第一章 安培力与洛伦兹力',
    'xb2-particle-bfield': '第一章 安培力与洛伦兹力',
    'xb2-transformer': '第三章 交变电流',
    'xb3-brownian': '第一章 分子动理论',
    'xb3-alpha-scatter3d': '第四章 原子结构和波粒二象性',
  }
  return m[eid] ?? ''
}
function get3d_summary(eid: string) {
  const m: Record<string, string> = {
    'bx3-induction-condition': '磁通变化 → 感应电流产生条件',
    'bx3-emf-factors': 'ε = N·dΦ/dt，影响电动势大小的因素',
    'bx3-lenz-law': '感应电流方向阻碍磁通变化',
    'xb2-ampere-force': 'F = I·L×B，右手定则三维演示',
    'xb2-lorentz-demo': 'F = qv×B，洛伦兹力三维演示',
    'xb2-particle-bfield': 'r = mv/qB，三维圆周/螺旋运动',
    'xb2-transformer': 'U₁/U₂ = N₁/N₂，三维铁芯线圈',
    'xb3-brownian': '三维微粒无规则热运动',
    'xb3-alpha-scatter3d': '瞄准距离→偏转角，卢瑟福核式结构',
  }
  return m[eid] ?? ''
}

const ALT_EXPERIMENTS: ExperimentModule[] = [
  {
    id: 'xb3-alpha-scatter',
    name: 'α粒子散射实验（3D）',
    book: '选择性必修第三册', chapter: '第四章 原子结构和波粒二象性', dimension: '3D',
    summary: '瞄准距离→偏转角，卢瑟福核式结构。',
    available: true, batch: 'B3', component: ExpAlphaScatter3D as unknown as Component,
    steps: panelSteps('观察三条不同瞄准距离的 α 粒子散射轨迹'),
  },
  {
    id: 'bx1-reaction-time',
    name: '测反应时间（第三阶段替代）',
    book: '必修第一册', chapter: '第一章 运动的描述', dimension: '2D',
    summary: '轻量交互计时器',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'bx1-galileo-ramp',
    name: '伽利略斜面实验（第三阶段替代）',
    book: '必修第一册', chapter: '第四章 运动和力的关系', dimension: '2D',
    summary: '动画+理想化推理',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'bx1-center-of-gravity',
    name: '悬挂法确定物体的重心（第三阶段替代）',
    book: '必修第一册', chapter: '第三章 相互作用——力', dimension: '2D',
    summary: '轻量交互+视频',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'bx1-mirror-deformation',
    name: '通过平面镜观察桌面的微小形变（第三阶段替代）',
    book: '必修第一册', chapter: '第三章 相互作用——力', dimension: '2D',
    summary: '动画+光路放大',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'bx2-circular-life',
    name: '生活中的圆周运动（第三阶段替代）',
    book: '必修第二册', chapter: '第六章 圆周运动', dimension: '2D',
    summary: '动画+参数调节',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'bx2-motion-composition',
    name: '运动的合成与分解（第三阶段替代）',
    book: '必修第二册', chapter: '第五章 抛体运动', dimension: '2D',
    summary: '轻量矢量交互',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'bx3-static-phenomena',
    name: '观察静电现象（第三阶段替代）',
    book: '必修第三册', chapter: '第九章 静电场及其应用', dimension: '2D',
    summary: '视频+动画',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'bx3-field-lines-model',
    name: '电场线、等势面（第三阶段替代）',
    book: '必修第三册', chapter: '第九章 静电场及其应用', dimension: '2D',
    summary: '轻量2D交互',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'bx3-particle-accel',
    name: '带电粒子在电场中的加速与偏转（第三阶段替代）',
    book: '必修第三册', chapter: '第十章 静电场中的能量', dimension: '2D',
    summary: '轻量2D交互',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'xb1-total-reflection',
    name: '观察全反射现象（第三阶段替代）',
    book: '选择性必修第一册', chapter: '第四章 光', dimension: '2D',
    summary: '动画+光路',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'xb2-em-oscillation',
    name: '观察电磁振荡（第三阶段替代）',
    book: '选择性必修第二册', chapter: '第四章 电磁振荡与电磁波', dimension: '2D',
    summary: '动画+波形',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
  {
    id: 'xb2-sensor-control',
    name: '利用传感器制作简单的自动控制装置（第三阶段替代）',
    book: '选择性必修第二册', chapter: '第五章 传感器', dimension: '2D',
    summary: '轻量交互+接线',
    available: true, batch: 'B8', component: ExpAlt as unknown as Component,
    steps: panelSteps('按交互提示操作 → 记录实验数据'),
  },
]

export const EXPERIMENTS: ExperimentModule[] = [...AVAILABLE, ...LOCKED, ...ALT_EXPERIMENTS]

export function findExperiment(id: string): ExperimentModule | undefined {
  return EXPERIMENTS.find((e) => e.id === id)
}

/** 目录分组：书 → 章节 → 实验 */
export function groupedByChapter(): Record<string, Record<string, ExperimentModule[]>> {
  const books: Record<string, Record<string, ExperimentModule[]>> = {}
  for (const exp of EXPERIMENTS) {
    const chapters = (books[exp.book] ??= {})
    const list = (chapters[exp.chapter] ??= [])
    list.push(exp)
  }
  return books
}
