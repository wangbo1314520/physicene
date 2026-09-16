/**
 * 方案书 v3.1 §7.1 高考/竞赛题层总清单（50 场景）——题型覆盖对账的唯一依据
 * n = v3.1 编号；prio P0 高考压轴必考 / P1 高频计算题 / P2 选择题+竞赛
 */
export type Dim = '2D' | '2.5D' | '3D'
export interface PlanItem { n: number; id: string; name: string; book: string; dim: Dim; prio: 'P0' | 'P1' | 'P2'; tags: string[] }

export const BOOKS = {
  MECH: '高考·力学综合（16 · 纯 2.5D）',
  EM: '高考·电磁综合（20 · 纯 3D）',
  HEAT: '高考·热学（4 · 纯 2D）',
  OPT: '高考·光学与振动波（6 · 纯 2D）',
  MOD: '高考·近代物理（5 · 纯 2D）',
  COMP: '竞赛扩展（5）',
} as const

const M = BOOKS.MECH, E = BOOKS.EM, H = BOOKS.HEAT, O = BOOKS.OPT, N = BOOKS.MOD, C = BOOKS.COMP
const it = (n: number, id: string, name: string, book: string, dim: Dim, prio: PlanItem['prio'], tags: string[]): PlanItem => ({ n, id, name, book, dim, prio, tags })

export const PLAN50: PlanItem[] = [
  // ── 力学综合 16（纯 2.5D）──
  it(1, 'gk-board-block', '平板小车 + 滑块碰撞（板块模型）', M, '2.5D', 'P0', ['动量守恒', '相对位移', '能量损失']),
  it(2, 'gk-projectile-loop', '小球平抛 + 竖直圆周', M, '2.5D', 'P0', ['平抛', '最高点临界', '脱离角']),
  it(3, 'gk-slope-spring', '斜面 + 弹簧 + 滑块', M, '2.5D', 'P0', ['能量守恒', '弹性势能', '摩擦生热']),
  it(4, 'gk-conveyor-board', '传送带 + 物块', M, '2.5D', 'P0', ['摩擦力方向', '共速', '划痕']),
  it(5, 'gk-connected-bodies', '连接体 + 滑轮', M, '2.5D', 'P0', ['整体法', '隔离法', '绳张力']),
  it(6, 'gk-collision-spring', '碰撞 + 弹簧', M, '2.5D', 'P0', ['动量守恒', '最大压缩=共速']),
  it(7, 'gk-circular-critical', '圆周运动 + 绳/杆临界', M, '2.5D', 'P0', ['√(gR) vs 0', '√(5gR) vs 2√(gR)']),
  it(8, 'gk-collision-chain', '多体碰撞链', M, '2.5D', 'P1', ['两体碰撞公式', '恢复系数']),
  it(21, 'gk-m21-whole-isolate', '连接体 + 整体法/隔离法（模型 21）', M, '2.5D', 'P0', ['a=F/(m₁+m₂)', 'T=m₂F/(m₁+m₂)', '绳松弛']),
  it(22, 'gk-isochrone', '等时圆模型（模型 22）', M, '2.5D', 'P1', ['t=√(4R/g)', 'cosα 消去']),
  it(23, 'gk-clothesline', '晾衣杆/动态平衡（模型 23）', M, '2.5D', 'P1', ['T=mg/(2cosα)', '与杆高无关', '断绳']),
  it(24, 'gk-weight-change', '超重失重（模型 24）', M, '2.5D', 'P2', ['视重', '电梯', '完全失重']),
  it(25, 'gk-multistage', '多过程直线运动（模型 25）', M, '2.5D', 'P0', ['v–t 面积', '分段衔接']),
  it(26, 'gk-oblique-projectile', '斜抛运动（模型 26）', M, '2.5D', 'P1', ['射程 v₀²sin2θ/g', '最大高度', '对称性']),
  it(28, 'gk-m28-circular-five', '圆周 + 绳/杆/内轨/外轨/管道（模型 28）', M, '2.5D', 'P0', ['五类约束', '管道双临界']),
  it(29, 'gk-m29-collision-spring', '碰撞 + 弹簧组合（模型 29）', M, '2.5D', 'P0', ['动量+能量守恒', '分离速度']),
  it(30, 'gk-m30-conveyor-board', '传送带 + 板块（模型 30）', M, '2.5D', 'P0', ['Q=f·Δs', '板块三阶段']),
  it(31, 'gk-impulse-micro', '动量定理 + 微元法（模型 31）', M, '2.5D', 'P1', ['I=ΣF·Δt', 'F–t 面积']),
  // ── 电磁综合 20（纯 3D）──
  it(9, 'gk-accel-selector-b', '加速电场 → 速度筛选器 → 磁场', E, '3D', 'P0', ['动能定理', 'v=E/B', 'r=mv/qB']),
  it(10, 'gk-accel-deflect-screen', '加速电场 → 偏转电场 → 荧光屏', E, '3D', 'P0', ['类平抛', '偏转角', '侧移']),
  it(11, 'gk-b-then-e', '磁场 → 电场组合', E, '3D', 'P0', ['圆周', '类平抛', 'sinθ=W/r']),
  it(12, 'gk-cyclotron', '回旋加速器', E, '3D', 'P1', ['T=2πm/qB', 'Ek=q²B²R²/2m', '穿越次数']),
  it(13, 'gk-mass-spectrometer', '质谱仪', E, '3D', 'P0', ['qU=½mv²', 'r=mv/qB', '同位素分辨']),
  it(14, 'gk-rail-rod', '电磁感应 + 导轨 + 导体棒', E, '3D', 'P0', ['楞次', '安培力', '动量定理', '能量']),
  it(15, 'gk-transformer-transmission', '变压器 + 远距离输电', E, '3D', 'P1', ['匝数比', 'P损=I²r']),
  it(16, 'gk-composite-field', '带电粒子在复合场中', E, '3D', 'P0', ['三力平衡', 'qE=mg 匀速圆周', '摆线']),
  it(32, 'gk-velocity-selector', '速度选择器（模型 32）', E, '3D', 'P0', ['qE=qvB', 'v=E/B=U/(Bd)']),
  it(33, 'gk-mhd-generator', '磁流体发电机（模型 33）', E, '3D', 'P2', ['电动势 BLv', '内阻', '输出功率']),
  it(34, 'gk-em-flowmeter', '电磁流量计（模型 34）', E, '3D', 'P2', ['U=BDv', '流量 Q=πD²v/4']),
  it(35, 'gk-hall-effect', '霍尔效应（模型 35）', E, '3D', 'P2', ['U_H=BI/(nqd)', '载流子正负']),
  it(36, 'gk-b-b-combo', '磁场与磁场组合（模型 36）', E, '3D', 'P1', ['两区圆周', '半径比', '磁聚焦']),
  it(37, 'gk-e-b-e-multi', '电场→磁场→电场多过程（模型 37）', E, '3D', 'P0', ['加速', '圆周', '减速/偏转']),
  it(38, 'gk-rod-free', '单杆无外力（模型 38）', E, '3D', 'P0', ['F=B²L²v/R', 'x=mv₀R/B²L²', 'q=BLx/R']),
  it(39, 'gk-rod-force', '单杆恒外力（模型 39）', E, '3D', 'P0', ['v_m=(F−μmg)R/B²L²']),
  it(40, 'gk-double-rod', '双杆模型（模型 40）', E, '3D', 'P0', ['动量守恒', '共速', 'Q=ΔEk']),
  it(41, 'gk-rod-capacitor', '含容单杆（模型 41）', E, '3D', 'P0', ['Δq=CBLΔv', 'a=F/(m+B²L²C)']),
  it(42, 'gk-frame-through-b', '线框进出磁场（模型 42）', E, '3D', 'P1', ['只有一边切割', 'i–t 图', '焦耳热']),
  it(43, 'gk-rod-spring', '导体棒 + 弹簧（模型 43）', E, '3D', 'P2', ['电磁阻尼振动', '能量耗散']),
  it(44, 'gk-rod-incline-b', '导体棒 + 斜面 + 磁场（模型 44）', E, '3D', 'P1', ['mg sinθ=B²L²v/R', '终速']),
  it(45, 'gk-transformer-dynamic', '变压器动态分析（模型 45）', E, '3D', 'P1', ['U₁/U₂=n₁/n₂', 'I₁/I₂=n₂/n₁', '负载变化']),
  it(46, 'gk-power-transmission', '远距离输电（模型 46）', E, '3D', 'P1', ['I=P/U', 'P损=(P/U)²R']),
  it(47, 'gk-ac-four-values', '交变电流四值（模型 47）', E, '3D', 'P1', ['峰值/有效值/平均值/瞬时值']),
  it(48, 'gk-meter-conversion', '电表改装（模型 48）', E, '3D', 'P1', ['并联分流', '串联分压']),
  it(49, 'gk-volt-ammeter-resistance', '伏安法测电阻（模型 49）', E, '3D', 'P0', ['内接/外接', '大内偏大', '小外偏小']),
  it(50, 'gk-black-box', '电学黑箱（模型 50）', E, '3D', 'P2', ['多用电表探测', '二极管/电阻判别']),
  // ── 热学 4（纯 2D）──
  it(51, 'gk-liquid-seal-tube', '玻璃管液封（模型 51）', H, '2D', 'P1', ['p=p₀±ρgh', '等温/等压']),
  it(52, 'gk-cylinder-piston', '汽缸活塞（模型 52）', H, '2D', 'P1', ['p=p₀+F/S', '活塞平衡']),
  it(53, 'gk-variable-mass-gas', '变质量气体（模型 53）', H, '2D', 'P1', ['打气/抽气', '等效总体积']),
  it(54, 'gk-u-tube', 'U 形管（模型 54）', H, '2D', 'P1', ['液面差', '两侧气体']),
  // ── 光学与振动波 6（纯 2D）──
  it(55, 'gk-prism-refraction', '玻璃砖/棱镜折射（模型 55）', O, '2D', 'P0', ['n=sinθ₁/sinθ₂', 'sinC=1/n', '偏折角']),
  it(56, 'gk-thin-film', '薄膜干涉（模型 56）', O, '2D', 'P1', ['等厚条纹', '光程差 2nd']),
  it(57, 'gk-diffraction-vs-interference', '单缝衍射 vs 双缝干涉（模型 57）', O, '2D', 'P1', ['条纹宽度', 'Δx=Lλ/d']),
  it(58, 'gk-wave-multi-solution', '波的多解（模型 58）', O, '2D', 'P0', ['Δx=nλ+Δx₀', '方向不定']),
  it(59, 'gk-vibration-wave-graphs', '振动图像 + 波动图像（模型 59）', O, '2D', 'P0', ['y–t vs y–x', '同侧法']),
  it(60, 'gk-wave-superposition', '波的叠加与干涉（模型 60）', O, '2D', 'P1', ['加强/减弱点', 'Δr=nλ']),
  // ── 近代物理 5（纯 2D）──
  it(61, 'gk-photoelectric-ek-nu', '光电效应 + Eₖ–ν 图像（模型 61）', N, '2D', 'P0', ['Eₖ=hν−W₀', '斜率 h', '截距 −W₀']),
  it(62, 'gk-hydrogen-levels', '氢原子能级跃迁（模型 62）', N, '2D', 'P0', ['ΔE=hν', 'C(n,2)', '电离']),
  it(63, 'gk-nuclear-reaction', '核反应方程 + 质量亏损（模型 63）', N, '2D', 'P1', ['ΔE=Δmc²', '守恒']),
  it(64, 'gk-bohr-collision', '玻尔模型 + 碰撞（模型 64）', N, '2D', 'P1', ['碰撞激发', '能量阈值']),
  it(65, 'gk-matter-wave', '物质波（模型 65）', N, '2D', 'P2', ['λ=h/p', '电子衍射']),
  // ── 竞赛扩展 5 ──
  it(66, 'gk-variable-force', '微元法 + 积分（模型 66）', C, '2.5D', 'P1', ['W=∫F dx', 'F–x 面积']),
  it(67, 'gk-small-quantity', '小量近似（模型 67）', C, '2.5D', 'P1', ['sinθ≈θ', '泰勒展开', '单摆周期']),
  it(68, 'gk-noninertial', '相对运动 + 非惯性系（模型 68）', C, '2.5D', 'P1', ['惯性力 −ma', 'a_rel']),
  it(69, 'gk-rigid-body', '刚体动力学（模型 69）', C, '3D', 'P2', ['转动惯量', '角动量']),
  it(70, 'gk-induction-circuit-mech', '电磁感应 + 微分方程（模型 70）', C, '3D', 'P2', ['一阶 ODE', '时间常数']),
]

export const planById = new Map(PLAN50.map((p) => [p.id, p]))
