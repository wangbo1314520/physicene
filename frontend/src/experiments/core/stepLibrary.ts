/**
 * 40 个实验的步骤库（B7 完整版）
 * 每实验 4 步：阅读目的 → 操作采集 → 记录分析 → 填写结论
 * AI 阶梯提示：level1=方法引导 → level2=公式提示 → level3=数值方向（不直接给答案）
 */

interface StepDef {
  id: string; title: string; goal: string; hint: string
  aiHints?: { level1: string; level2: string; level3: string }
  scoreWeight?: number; errorCategory?: 'operation' | 'reading' | 'calculation' | 'concept'
  dataBinding?: string
}

export function fullSteps(topic: string, method: string, formula: string, dataDesc: string): StepDef[] {
  return [
    {
      id: 'read', title: '阅读实验目的', goal: `理解本实验要探究的${topic}规律`,
      hint: '阅读左侧实验简介，理解目标后进入下一步', scoreWeight: 1,
      aiHints: {
        level1: `想一想：这个实验要验证什么${topic}关系？`,
        level2: `关键物理量是什么？需要控制哪些变量？`,
        level3: `实验目标是：${formula}`,
      },
    },
    {
      id: 'operate', title: '操作仪器获取数据', goal: `调节参数并${method}，至少采集 5 组数据`,
      hint: `按实验要求${method}，点击仪器面板的记录按钮采集数据`,
      scoreWeight: 2, errorCategory: 'operation',
      aiHints: {
        level1: `试试调节仪器面板上的参数（滑杆/按钮），每次调节后记录一组数据`,
        level2: `${dataDesc}，确保数据分布合理`,
        level3: `至少需要 5 组不同条件下的数据才能进行有效分析`,
      },
    },
    {
      id: 'record', title: '记录并分析数据', goal: '采集实验数据，观察图表/拟合结果',
      hint: '点击记录按钮，系统自动生成图表与拟合',
      scoreWeight: 3, errorCategory: 'reading', dataBinding: 'rawData',
      aiHints: {
        level1: '看看右侧坐标纸上的数据点分布——它们呈什么形状？',
        level2: `如果点近似在一条直线上，想想${formula}说明了什么`,
        level3: `拟合结果应该接近理论预期值`,
      },
    },
    {
      id: 'conclude', title: '填写实验结论', goal: '用自己的话总结实验验证了什么规律',
      hint: '在结论框写下你发现的物理规律，然后提交', scoreWeight: 3, errorCategory: 'concept',
      aiHints: {
        level1: '用自己的话描述：数据之间的关系是什么？',
        level2: `结合${formula}，说明实验数据支持这个规律`,
        level3: `结论应包含：${formula}，以及实验值与理论值的比较`,
      },
    },
  ]
}

/** 每个实验的定制参数 */
const STEP_CONFIG: Record<string, { topic: string; method: string; formula: string; dataDesc: string }> = {
  // B0 电磁
  'bx1-inertia': { topic: '惯性', method: '观察滑块运动', formula: '牛顿第一定律：无外力→匀速直线', dataDesc: '观察摩擦为零时滑块保持匀速' },
  'bx1-f-ma': { topic: '加速度与力、质量', method: '调电场力观察两电荷加速度', formula: 'a=F/m', dataDesc: '相同力下质量比 1:2 的两电荷加速度比应为 2:1' },
  'bx2-energy': { topic: '机械能守恒', method: '观察自由落体动能增长', formula: 'Ek增量=Ep减量', dataDesc: 'Ek-t 应为抛物线' },
  'bx3-coulomb-repulsion': { topic: '库仑力', method: '观察两电荷远离', formula: 'F=Kq₁q₂/r²', dataDesc: '电荷间距越大加速度越小' },
  'bx3-coulomb-attraction': { topic: '库仑引力', method: '观察异种电荷靠近', formula: 'F=Kq₁q₂/r²（异号相吸）', dataDesc: '靠近过程中加速→碰撞→弹开' },
  'xb2-mass-spectrometer': { topic: '质谱仪', method: '观察不同速率电荷偏转', formula: 'r=mv/qB', dataDesc: '速率大的电荷圆周半径大' },
  'xb3-alpha-scatter': { topic: 'α散射', method: '观察不同瞄准距离的散射', formula: '瞄准距离小→偏转角大', dataDesc: '三条轨迹对应不同 b 值' },
  // B1 2D
  'bx3-emf-internal': { topic: '电源电动势与内阻', method: '调变阻器记录U-I', formula: 'U=E−Ir（截距=E，斜率=−r）', dataDesc: 'U-I 图线为直线，截距≈E，斜率≈−r' },
  'bx1-hooke': { topic: '弹簧弹力与形变', method: '加砝码记录F-x', formula: 'F=kx（斜率=k）', dataDesc: 'F-x 图线过原点，斜率=劲度系数' },
  'xb3-photoelectric': { topic: '光电效应', method: '调频率记录Uc-ν', formula: 'Uc=(h/e)ν−W/e', dataDesc: 'Uc-ν 直线斜率=h/e' },
  'bx1-force-composition': { topic: '力的合成', method: '调F₁/F₂/夹角', formula: '合力=√(F₁²+F₂²+2F₁F₂cosθ)', dataDesc: '合力始终等于平行四边形对角线' },
  'bx2-projectile': { topic: '平抛运动', method: '调v₀/h播放轨迹', formula: 'y=h−(g/2v₀²)x²', dataDesc: '轨迹为抛物线' },
  'xb1-double-slit': { topic: '双缝干涉', method: '调λ/d/L测Δy', formula: 'λ=Δy·d/L', dataDesc: '条纹间距与波长成正比' },
  'xb3-oil-film': { topic: '油膜法测分子直径', method: '点击格子计数', formula: 'd=V/S', dataDesc: '面积约40cm²，直径约10⁻⁹m量级' },
  // B2 纸带
  'bx1-timer-practice': { topic: '打点计时器', method: '打出纸带', formula: '逐差法a=[(x₇+x₆+x₅)−(x₄+x₃+x₂)]/9T²', dataDesc: '50Hz打点，计数点间隔0.1s' },
  'bx1-trolley-vt': { topic: '小车速度变化', method: '打出纸带画v-t', formula: 'v-t 为线性，斜率=a', dataDesc: '计数点速度均匀递增' },
  'bx1-freefall-timer': { topic: '自由落体测g', method: '打出纸带', formula: 'g=2h/t² 或逐差法', dataDesc: 'a≈9.8m/s²' },
  'xb1-pendulum-g': { topic: '单摆测g', method: '调摆长/计时', formula: 'T=2π√(L/g)→g=4π²L/T²', dataDesc: 'T²-L 图线斜率=4π²/g' },
  'bx1-conical-pendulum': { topic: '圆锥摆', method: '调摆长/夹角', formula: 'T=2π√(Lcosθ/g)', dataDesc: '验证F向心=mω²r' },
  'bx2-centripetal': { topic: '向心力', method: '调L/θ', formula: 'F=mrω²', dataDesc: '控制变量验证' },
  'bx2-work-velocity': { topic: '功与速度', method: '采集W-v²', formula: 'W=½mv²', dataDesc: 'v²-W 图线斜率=2/m' },
  'xb3-gas-isotherm': { topic: '气体等温', method: '采集pV', formula: 'pV=C（玻意耳）', dataDesc: 'p-V 图线为双曲线' },
  'bx1-newton-tube': { topic: '牛顿管', method: '调气压释放', formula: '真空中同时落地', dataDesc: '真空时羽毛与硬币同时落地' },
  'bx1-action-reaction': { topic: '作用反作用', method: '调m₁/m₂/冲量', formula: 'F₁=−F₂，m₁v₁+m₂v₂=0', dataDesc: '总动量恒为零' },
  'bx3-multimeter': { topic: '多用电表', method: '操作仪表', formula: '读数=量程×格数', dataDesc: '选择正确档位与量程' },
  'xb1-momentum-conservation': { topic: '动量守恒', method: '观察碰撞前后', formula: 'm₁v₁+m₂v₂=常量', dataDesc: '碰撞前后总动量不变' },
  // B3 3D
  'bx3-induction-condition': { topic: '感应电流条件', method: '调B/角度', formula: '磁通变化→感应电流', dataDesc: 'Φ=B·A·cosθ 变化时产生电流' },
  'bx3-emf-factors': { topic: '感应电动势', method: '调参数', formula: 'ε=N·dΦ/dt', dataDesc: '匝数多/磁通变化快→电动势大' },
  'bx3-lenz-law': { topic: '楞次定律', method: '调磁通变化', formula: '感应电流阻碍磁通变化', dataDesc: 'B外增强→逆时针' },
  'xb2-ampere-force': { topic: '安培力', method: '调B', formula: 'F=BIL·sinθ（右手定则）', dataDesc: 'F方向由I×B确定' },
  'xb2-lorentz-demo': { topic: '洛伦兹力', method: '调B/v/q', formula: 'F=qv×B', dataDesc: '力垂直于v和B' },
  'xb2-particle-bfield': { topic: '粒子磁场运动', method: '调B/v', formula: 'r=mv/qB，T=2πm/qB', dataDesc: '圆周半径与速度成正比' },
  'xb2-transformer': { topic: '变压器', method: '调匝数', formula: 'U₁/U₂=N₁/N₂', dataDesc: '匝数比=电压比' },
  'xb3-brownian': { topic: '布朗运动', method: '调温度', formula: '温度越高运动越剧烈', dataDesc: '微粒做无规则折线运动' },
}

/** 获取实验步骤（有定制则用定制，否则用通用模板） */
export function getSteps(experimentId: string): StepDef[] {
  const cfg = STEP_CONFIG[experimentId]
  if (cfg) return fullSteps(cfg.topic, cfg.method, cfg.formula, cfg.dataDesc)
  return fullSteps('物理', '操作仪器', '实验规律', '采集多组数据')
}

/** 获取实验列表（步骤库覆盖的实验 ID） */
export const COVERED_EXPERIMENTS = Object.keys(STEP_CONFIG)
