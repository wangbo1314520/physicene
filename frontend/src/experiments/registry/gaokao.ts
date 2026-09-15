/**
 * 高考 / 竞赛题层（B9–B11）：20 个场景，独立于教材 55 卡台账（layer: 'gaokao'）
 * 场景 1 板块模型随 v3.0 方案书首轮交付；其余 19 个按 B11 逐个接入（available:false 占位，用于题型覆盖对账）
 */
import type { Component } from 'vue'
import type { ExperimentModule } from '../core/types'
import GkBoardBlock from '../defs/gaokao/GkBoardBlock.vue'
import GkProjectileLoop from '../defs/gaokao/GkProjectileLoop.vue'
import GkAccelSelectorB from '../defs/gaokao/GkAccelSelectorB.vue'

function gkSteps(operateHint: string): ExperimentModule['steps'] {
  return [
    { id: 'read', title: '识别题型与过程', goal: '看清场景由哪些过程组成、每个过程受什么力', hint: '阅读左侧说明与公式，想清楚“先发生什么、后发生什么”' },
    { id: 'operate', title: '搭场景、调参数、观察多过程', goal: '运行一次，盯住时间轴上的过程切换点（临界）', hint: operateHint, scoreWeight: 2 },
    {
      id: 'record', title: '记录临界数据并对照理论',
      goal: '把仿真得到的临界量（共速/脱离/最高点…）与公式结果对照',
      hint: '点「📏 记录当前数据」或等待过程切换自动记录',
      check: (ctx) => ctx.lastEvent?.type === 'data-recorded',
      errorHints: { default: '先运行到出现过程切换（共速/脱离），或点记录按钮' },
      scoreWeight: 3,
    },
    { id: 'conclude', title: '写出解题思路', goal: '按“过程—受力—规律—临界—结果”写出本题的完整思路', hint: '可用「AI 讲解」核对每一步（B10 上线后）', scoreWeight: 3 },
  ]
}

const planned = (id: string, name: string, chapter: string, dimension: '2.5D' | '3D', tags: string[], book: string): ExperimentModule => ({
  id, name, book, chapter, dimension, summary: tags.join(' · '), available: false, batch: 'B11', layer: 'gaokao', tags,
  steps: gkSteps('搭场景 → 调参数 → 观察多过程 → 找临界'),
})

const MECH = '高考·力学综合（纯 2.5D）', EM = '高考·电磁综合（纯 3D）', COMP = '竞赛扩展'

export const GAOKAO: ExperimentModule[] = [
  {
    id: 'gk-board-block',
    name: '平板小车 + 滑块碰撞（板块模型）',
    book: MECH, chapter: '1 动量守恒 · 摩擦 · 相对位移 · 能量损失', dimension: '2.5D',
    summary: '滑块冲上木板 / 子弹撞入滑块 / 木板获得初速：相对滑动→共速或脱离；时间轴、能量条、临界板长。',
    available: true, batch: 'B11', layer: 'gaokao',
    tags: ['动量守恒', '摩擦力做功', '相对位移', '能量损失', '临界板长', '多过程'],
    component: GkBoardBlock as unknown as Component,
    steps: gkSteps('选起始方式（冲上/子弹/板获初速）→ 调 m、M、μ、v₀、L → ▶ 开始 → 看时间轴从“相对滑动”切到“共速”或“脱离”'),
  },
  {
    id: 'gk-projectile-loop', name: '小球平抛 + 竖直圆周', book: MECH, chapter: '2 平抛 · 临界速度 √(gR) · 最高点条件', dimension: '2.5D',
    summary: '平台平抛→落点切入竖直圆轨道→最高点临界（绳/内轨 N≥0，杆/外轨 v≥0）→脱离角与临界高度；含 AI 解题讲解。',
    available: true, batch: 'B11', layer: 'gaokao', tags: ['平抛', '机械能守恒', '最高点临界', '绳/内轨 vs 杆/外轨', '脱离角'],
    component: GkProjectileLoop as unknown as Component,
    steps: gkSteps('选绳/杆模型 → 调 v₀、h、R → ▶ 开始 → 看时间轴上“过最高点 / 脱离 / 折返”事件 → 用讲解器核对 √(5gR) 与 2√(gR)'),
  },
  planned('gk-slope-spring', '斜面 + 弹簧 + 滑块', '3 能量守恒 · 弹性势能 · 临界脱离', '2.5D', ['能量守恒', '弹性势能', '临界脱离'], MECH),
  planned('gk-conveyor', '传送带 + 物块', '4 摩擦力方向 · 相对运动 · 热量', '2.5D', ['摩擦力方向', '相对运动', '摩擦生热'], MECH),
  planned('gk-pulley-system', '连接体 + 滑轮', '5 牛顿定律 · 系统加速度 · 绳张力', '2.5D', ['牛顿第二定律', '整体隔离法', '绳张力'], MECH),
  planned('gk-collision-spring', '碰撞 + 弹簧', '6 动量守恒 · 弹性碰撞 · 最大压缩', '2.5D', ['动量守恒', '弹性碰撞', '最大压缩量'], MECH),
  planned('gk-circular-critical', '圆周运动 + 绳/杆临界', '7 绳临界 vs 杆临界', '2.5D', ['绳模型', '杆模型', '最高点临界'], MECH),
  planned('gk-collision-chain', '多体碰撞链', '8 动量守恒 · 能量分配', '2.5D', ['动量守恒', '能量分配', '多体'], MECH),
  {
    id: 'gk-accel-selector-b', name: '加速电场 → 速度筛选器 → 磁场', book: EM, chapter: '9 动能定理 · E/B 平衡 · 洛伦兹力', dimension: '3D',
    summary: '三区域多过程：qU=½mv² → v=E/B 才能直线通过筛选器 → 磁场中半圆 r=mv/(qB₃) 打到底片；含 AI 解题讲解。',
    available: true, batch: 'B11', layer: 'gaokao', tags: ['动能定理', 'v=E/B', '洛伦兹力', '质谱仪', '多过程'],
    component: GkAccelSelectorB as unknown as Component,
    steps: gkSteps('调 U 使 v=√(2qU/m) 等于 E/B → ▶ 播放 → 看粒子能否直线通过筛选器、磁场中半径 → 改 B₃ 看落点 2r'),
  },
  planned('gk-accel-deflect-screen', '加速电场 → 偏转电场 → 荧光屏', '10 类平抛 · 偏转角 · 侧移', '3D', ['类平抛', '偏转角', '侧移'], EM),
  planned('gk-b-then-e', '磁场 → 电场组合', '11 圆周 + 类平抛切换', '3D', ['圆周运动', '类平抛', '过程切换'], EM),
  planned('gk-cyclotron', '回旋加速器', '12 交变电场 · 最大动能 · 周期', '3D', ['交变电场', '最大动能', '周期'], EM),
  planned('gk-mass-spectrometer', '质谱仪', '13 加速 · 筛选 · 偏转 · 质量分辨', '3D', ['加速', '速度筛选', '偏转', '质量分辨'], EM),
  planned('gk-rail-rod', '电磁感应 + 导轨 + 导体棒', '14 楞次 · 安培力 · 动量 · 能量', '3D', ['楞次定律', '安培力', '动量', '能量'], EM),
  planned('gk-transformer-transmission', '变压器 + 远距离输电', '15 匝数比 · 功率 · 损耗', '3D', ['匝数比', '功率', '线路损耗'], EM),
  planned('gk-composite-field', '带电粒子在复合场中', '16 重力 + 电场 + 磁场平衡', '3D', ['复合场', '平衡', '匀速圆周'], EM),
  planned('gk-variable-force', '变力作用下的运动', '17 积分 · 微元', '2.5D', ['微元法', '积分'], COMP),
  planned('gk-coupled-dof', '多自由度耦合', '18 拉格朗日思想', '2.5D', ['多自由度', '拉格朗日'], COMP),
  planned('gk-noninertial', '非惯性系 + 惯性力', '19 相对运动', '2.5D', ['非惯性系', '惯性力'], COMP),
  planned('gk-induction-circuit-mech', '电磁感应 + 电路 + 力学耦合', '20 微分方程', '3D', ['电磁感应', '电路', '微分方程'], COMP),
]
