/**
 * 实验注册表（40 个 = 阶段一 22 + 阶段二 18）
 * B0 上线 7 个（电磁三件套批次已开发的实验）；其余锁定并标注目标批次。
 * B1=2D 引擎 B2=2.5D 引擎 B3=3D 引擎 P1=阶段一 P2=阶段二
 */
import type { ExperimentModule, ExperimentPreset } from '../core/types'

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
    id: 'xb2-mass-spectrometer',
    name: '质谱仪原理（r=mv/qB）',
    book: '选择性必修第二册', chapter: '第一章 安培力与洛伦兹力', dimension: '2.5D',
    summary: '相同电荷不同速率进入匀强磁场，做半径 r=mv/qB 的圆周运动。',
    available: true, batch: 'B0',
    preset: p([
      pc('fast', -8, 0, 0, 4, 1, 1),
      pc('slow', 8, 0, 0, 2, 1, 1, '#3ecf8e'),
      { id: 'bf', type: 'b_field', position: { x: 0, y: 0 }, scale: { x: 30, y: 30 }, properties: { bField: 1, bDirection: 'out' } },
    ], { gravity: { x: 0, y: 0 }, maxDuration: 9 }),
    steps: simSteps(),
  },
  {
    id: 'xb3-alpha-scatter',
    name: 'α粒子散射实验（卢瑟福）',
    book: '选择性必修第三册', chapter: '第四章 原子结构和波粒二象性', dimension: '2.5D',
    summary: '瞄准距离越小偏转角越大——原子核式结构的证据。',
    available: true, batch: 'B0',
    preset: p([
      { id: 'nucleus', type: 'point_charge', position: { x: 0, y: 0 }, color: '#E05555', properties: { mass: 1000, charge: 8 }, initialState: { velocity: { x: 0, y: 0 } }, isFixed: true },
      pc('a_top', -12, 3, 6, 0, 1, 1),
      pc('a_mid', -12, 0.9, 6, 0, 1, 1, '#3ecf8e'),
    ], { gravity: { x: 0, y: 0 }, maxDuration: 6 }),
    steps: simSteps(),
  },
]

/** 阶段一其余 15 个 + 阶段二 18 个（锁定占位，标注目标批次） */
function locked(id: string, name: string, book: string, chapter: string,
                dimension: '2D' | '2.5D' | '3D', batch: string, summary: string): ExperimentModule {
  return { id, name, book, chapter, dimension, summary, available: false, batch, steps: [] }
}

const LOCKED: ExperimentModule[] = [
  // ── 阶段一（B1 纸带/作图类 → B2 2.5D 约束类 → B4 电路 → B5 光学）──
  locked('bx1-timer-practice', '练习使用打点计时器', '必修第一册', '第二章 匀变速直线运动的研究', '2.5D', 'B2', '打点计时器操作规范与纸带读取'),
  locked('bx1-tape-velocity', '测量纸带的平均速度和瞬时速度', '必修第一册', '第二章 匀变速直线运动的研究', '2D', 'B1', '纸带读数 → 平均/瞬时速度 → 描点作图'),
  locked('bx1-trolley-vt', '探究小车速度随时间变化的规律', '必修第一册', '第二章 匀变速直线运动的研究', '2.5D', 'B2', '斜面小车 + 纸带 + v-t 图像拟合'),
  locked('bx1-freefall-timer', '用打点计时器研究自由落体运动', '必修第一册', '第二章 匀变速直线运动的研究', '2.5D', 'B2', '自由落体纸带测重力加速度'),
  locked('bx1-hooke', '探究弹簧弹力与形变量的关系', '必修第一册', '第三章 相互作用——力', '2.5D', 'B2', '弹簧 F-x 图像与劲度系数'),
  locked('bx1-force-composition', '探究两个互成角度的力的合成规律', '必修第一册', '第三章 相互作用——力', '2D', 'B1', '平行四边形定则矢量作图'),
  locked('bx2-centripetal', '探究向心力与半径、角速度、质量的关系', '必修第二册', '第六章 圆周运动', '2.5D', 'B2', 'F=mrω² 控制变量探究'),
  locked('bx2-work-velocity', '探究功与速度变化的关系', '必修第二册', '第八章 机械能守恒定律', '2.5D', 'B2', 'W∝v²/2 数据拟合'),
  locked('bx2-projectile', '探究平抛运动的特点', '必修第二册', '第五章 抛体运动', '2D', 'B1', '平抛轨迹描绘与分解验证'),
  locked('bx3-capacitor-charge', '观察电容器的充、放电现象', '必修第三册', '第十章 静电场中的能量', '2D', 'B4', 'RC 充放电曲线与时间常数'),
  locked('bx3-resistivity', '导体电阻率的测量', '必修第三册', '第十一章 电路及其应用', '2D', 'B4', '伏安法 + 游标卡尺 + R=ρL/S'),
  locked('bx3-multimeter', '练习使用多用电表', '必修第三册', '第十一章 电路及其应用', '2.5D', 'B4', '档位/量程/读数规范'),
  locked('bx3-emf-internal', '电池电动势和内阻的测量', '必修第三册', '第十二章 电能 能量守恒定律', '2D', 'B4', 'U-I 图线截距斜率法'),
  locked('xb1-pendulum-g', '用单摆测量重力加速度', '选择性必修第一册', '第二章 机械振动', '2.5D', 'B2', 'T²-L 图线测 g'),
  locked('xb1-refraction', '测量玻璃的折射率', '选择性必修第一册', '第四章 光', '2D', 'B5', '插针法光路 + 折射定律'),
  locked('xb1-double-slit', '用双缝干涉测量光的波长', '选择性必修第一册', '第四章 光', '2D', 'B5', 'Δy=λL/d 测波长'),
  locked('xb3-oil-film', '用油膜法估测油酸分子的大小', '选择性必修第三册', '第一章 分子动理论', '2D', 'B1', '数格子估面积 → 分子直径数量级'),
  locked('xb3-gas-isotherm', '探究气体等温变化的规律', '选择性必修第三册', '第二章 气体、固体和液体', '2.5D', 'B2', 'pV 图像与玻意耳定律'),
  locked('xb3-photoelectric', '观察光电效应现象', '选择性必修第三册', '第四章 原子结构和波粒二象性', '2D', 'B1', '遏止电压与截止频率，U-ν 图线测 h'),
  // ── 阶段二（B3 3D 引擎 + B6/B7）──
  locked('bx1-newton-tube', '牛顿管实验（真空落体）', '必修第一册', '第二章 匀变速直线运动的研究', '2.5D', 'B2', '抽真空前后羽毛与硬币下落对比'),
  locked('bx1-static-friction', '静摩擦力的大小随拉力的变化', '必修第一册', '第三章 相互作用——力', '2D', 'B1', 'F-t 曲线与最大静摩擦'),
  locked('bx1-action-reaction', '探究作用力和反作用力的关系', '必修第一册', '第四章 运动和力的关系', '2.5D', 'B2', '牛顿第三定律双力传感器'),
  locked('bx1-conical-pendulum', '用圆锥摆粗略验证向心力公式', '必修第一册', '第六章 圆周运动', '2.5D', 'B2', '圆锥摆 F=mrω² 验证'),
  locked('bx3-coulomb-balance', '库仑扭秤实验（定量探究）', '必修第三册', '第九章 静电场及其应用', '2D', 'B1', 'F∝q₁q₂/r² 控制变量数据表'),
  locked('bx3-induction-condition', '探究感应电流产生的条件', '必修第三册', '第十三章 电磁感应与电磁波初步', '3D', 'B3', '磁通变化 → 感应电流条件'),
  locked('bx3-emf-factors', '探究影响感应电动势大小的因素', '必修第三册', '第十三章 电磁感应与电磁波初步', '3D', 'B3', '磁通变化率与电动势'),
  locked('bx3-lenz-law', '探究楞次定律', '必修第三册', '第十三章 电磁感应与电磁波初步', '3D', 'B3', '感应电流方向与磁通变化'),
  locked('xb1-wave-interference', '观察波的干涉、衍射现象', '选择性必修第一册', '第三章 机械波', '2D', 'B5', '波场叠加渲染'),
  locked('xb1-light-phenomena', '观察光的干涉、衍射、偏振现象', '选择性必修第一册', '第四章 光', '2D', 'B5', '条纹/偏振可视化'),
  locked('xb2-ampere-force', '观察安培力方向', '选择性必修第二册', '第一章 安培力与洛伦兹力', '3D', 'B3', 'B/I/F 右手定则三维演示'),
  locked('xb2-lorentz-demo', '洛伦兹力演示', '选择性必修第二册', '第一章 安培力与洛伦兹力', '3D', 'B3', '电子束三维磁场偏转'),
  locked('xb2-particle-bfield', '带电粒子在匀强磁场中的运动（模型）', '选择性必修第二册', '第一章 安培力与洛伦兹力', '3D', 'B3', '三维螺旋线/圆周运动'),
  locked('xb2-transformer', '探究变压器电压与匝数的关系', '选择性必修第二册', '第三章 交变电流', '3D', 'B3', 'U₁/U₂=N₁/N₂ 三维结构'),
  locked('xb2-self-induction', '探究自感现象', '选择性必修第二册', '第二章 电磁感应', '2D', 'B4', '通断电自感电路与曲线'),
  locked('xb2-lc-ac', '探究电感器和电容器对交流电的影响', '选择性必修第二册', '第三章 交变电流', '2D', 'B4', '感抗/容抗与频率'),
  locked('xb3-brownian', '观察布朗运动', '选择性必修第三册', '第一章 分子动理论', '3D', 'B3', '三维随机行走与分子热运动'),
]

export const EXPERIMENTS: ExperimentModule[] = [...AVAILABLE, ...LOCKED]

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
