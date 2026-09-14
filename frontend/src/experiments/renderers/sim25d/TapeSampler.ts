/**
 * TapeSampler —— 纸带采样与逐差法（B2 冻结）
 * 电磁/电火花打点计时器 50Hz（T=0.02s），每 5 个间隔取计数点（Δt=0.1s）。
 * 逐差法：a = [(x₇+x₆+x₅)-(x₄+x₃+x₂)] / (9T²)（四组时 4T²）
 */

export interface TapePoint { index: number; t: number; x: number }
export interface CountingPoint { index: number; t: number; x: number; interval: number }

export interface TapeAnalysis {
  /** 原始点（0.02s 间隔） */
  raw: TapePoint[]
  /** 计数点（每 5 间隔 = 0.1s） */
  counting: CountingPoint[]
  /** 各计数段位移 x₂…xₙ (m) */
  intervals: number[]
  /** 逐差法加速度（m/s²） */
  acceleration: number | null
  /** 各计数点瞬时速度 v = (x_{n-1}+x_{n+1})/(2T)（m/s） */
  instantaneousVelocities: number[]
  /** 平均速度 */
  averageVelocity: number
}

export class TapeSampler {
  /** 打点周期 s */
  readonly period: number
  /** 计数点间隔数（5 → 0.1s） */
  readonly nInterval: number
  /** 已采集的位置序列（索引 = 打点序号） */
  private positions: number[] = []

  constructor(period = 0.02, nInterval = 5) {
    this.period = period
    this.nInterval = nInterval
  }

  /** 打一个点（世界坐标 x） */
  punch(x: number) {
    this.positions.push(x)
  }

  /** 从运动学公式生成整条纸带：x(t) = x₀ + v₀t + ½at²（含噪声） */
  static generate(x0: number, v0: number, a: number, durationS: number,
                  period = 0.02, noise = 0.0003): TapeSampler {
    const ts = new TapeSampler(period)
    const n = Math.floor(durationS / period)
    for (let i = 0; i <= n; i++) {
      const t = i * period
      const x = x0 + v0 * t + 0.5 * a * t * t + (Math.random() - 0.5) * noise
      ts.punch(x)
    }
    return ts
  }

  /** 从 SimResult dataTable 生成（v 已有则积分） */
  static fromPositions(positions: number[], period = 0.02): TapeSampler {
    const ts = new TapeSampler(period)
    positions.forEach((x) => ts.punch(x))
    return ts
  }

  get points(): TapePoint[] {
    return this.positions.map((x, i) => ({ index: i, t: i * this.period, x }))
  }

  /** 计数点：每 nInterval 个取一个 */
  get countingPoints(): CountingPoint[] {
    const pts: CountingPoint[] = []
    for (let i = 0; i < this.positions.length; i += this.nInterval) {
      pts.push({
        index: i / this.nInterval,
        t: i * this.period,
        x: this.positions[i],
        interval: 0,
      })
    }
    // 计算段位移
    for (let j = 1; j < pts.length; j++) {
      pts[j].interval = pts[j].x - pts[j - 1].x
    }
    return pts
  }

  /** 完整分析：计数点 → 段位移 → 逐差法 → 瞬时速度 */
  analyze(): TapeAnalysis {
    const cps = this.countingPoints
    if (cps.length < 3) {
      return { raw: this.points, counting: cps, intervals: [], acceleration: null,
               instantaneousVelocities: [], averageVelocity: 0 }
    }
    // 段位移 x₁…xₙ（全部相邻计数点间距）
    const intervals: number[] = []
    for (let j = 1; j < cps.length; j++) {
      intervals.push(cps[j].x - cps[j - 1].x)
    }
    // 逐差法
    const n = intervals.length
    let acc: number | null = null
    const T = this.period * this.nInterval
    if (n >= 4 && n % 2 === 0) {
      const half = n / 2
      let sumFront = 0, sumBack = 0
      for (let i = 0; i < half; i++) { sumFront += intervals[i]; sumBack += intervals[half + i] }
      acc = (sumBack - sumFront) / (half * half * T * T)
    } else if (n >= 5) {
      // 奇数段：丢中间，前后各 (n-1)/2
      const m = (n - 1) / 2
      let sumFront = 0, sumBack = 0
      for (let i = 0; i < m; i++) { sumFront += intervals[i]; sumBack += intervals[m + 1 + i] }
      acc = (sumBack - sumFront) / (m * (m + 1) * T * T)
    } else if (n >= 2) {
      acc = (intervals[1] - intervals[0]) / (T * T)
    }
    // 瞬时速度 v_n = (x_{n+1} - x_{n-1}) / (2T)（T 已在上方声明）
    const vels: number[] = []
    for (let j = 1; j < cps.length - 1; j++) {
      vels.push((cps[j + 1].x - cps[j - 1].x) / (2 * T))
    }
    // 平均速度
    const totalTime = cps[cps.length - 1].t - cps[0].t
    const avg = totalTime > 0 ? (cps[cps.length - 1].x - cps[0].x) / totalTime : 0
    return { raw: this.points, counting: cps, intervals, acceleration: acc,
             instantaneousVelocities: vels, averageVelocity: avg }
  }

  serialize() { return { period: this.period, nInterval: this.nInterval, positions: this.positions } }
  static deserialize(d: { period: number; nInterval: number; positions: number[] }) {
    const ts = new TapeSampler(d.period, d.nInterval)
    d.positions.forEach((x) => ts.punch(x))
    return ts
  }
}
