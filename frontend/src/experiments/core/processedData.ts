/**
 * processedData Schema —— B1 冻结版（v1）
 * B2-B8 只允许新增可选字段（附加 # 扩展约定），不得修改/删除已有字段。
 * 写入 experiment_session.processed_data，提交时随 Report content 导出。
 */

export interface ProcessedData {
  version: 1
  /** 坐标纸（GraphPaper）：所有描点-拟合类实验 */
  paper?: PaperState
  /** 矢量图：力的合成 / 运动合成 */
  vector?: VectorState
  /** 轨迹图：平抛 / 偏转 */
  trajectory?: TrajectoryState
  /** 光路图：折射 / 双缝 */
  optical?: OpticalState
  /** 方格计数：油膜法 */
  gridCount?: GridCountState
  /** 场线（预留渲染，B1 提供图层实现） */
  fieldLines?: FieldLineState
  /** 导出物（提交时生成，随 Report 存档） */
  exports?: { pngDataUrl?: string; svg?: string; csv?: string }
}

export interface PaperPoint {
  x: number
  y: number
  /** y 轴误差（误差棒长度，可选） */
  sy?: number
  /** 异常点标记（拟合默认剔除，可含入） */
  outlier?: boolean
  /** 手动描点（学生画的）vs 自动（数据表生成） */
  manual?: boolean
}

export interface PaperSeries {
  id: string
  name: string
  color: string
  points: PaperPoint[]
  /** 数据源行号联动（可选，行 id 列表） */
  rows?: string[]
}

export interface PaperFit {
  seriesId: string
  /** 过原点拟合 y=kx */
  throughOrigin: boolean
  k: number
  b: number
  r2: number
  /** 各点残差 y_i - (k x_i + b)，顺序同 series.points（剔除 outlier 的记 null） */
  residuals: (number | null)[]
  /** 参与拟合的点数 */
  n: number
}

export interface PaperState {
  mode: 'auto' | 'manual'
  /** 考试模式锁定（禁止移动/删除/改数据） */
  locked: boolean
  axes: {
    xLabel: string
    yLabel: string
    xUnit?: string
    yUnit?: string
    xMin?: number
    xMax?: number
    yMin?: number
    yMax?: number
  }
  series: PaperSeries[]
  fits: PaperFit[]
  /** 显示选项 */
  showFitLine: boolean
  showResiduals: boolean
  showErrorBars: boolean
  showFormula: boolean
}

export interface VectorArrow {
  id: string
  name: string
  x1: number; y1: number; x2: number; y2: number
  color: string
  /** 合力/结果向量标记（渲染加粗） */
  resultant?: boolean
}

export interface VectorState {
  arrows: VectorArrow[]
  gridScale: number
}

export interface TrajectoryState {
  /** 采样点 {t, x, y} */
  samples: { t: number; x: number; y: number }[]
  /** 参数快照 */
  params?: Record<string, number>
}

export interface OpticalState {
  /** 折射：入射角/折射角（度）读数序列 */
  refraction?: { incidentDeg: number; refractDeg: number }[]
  /** 双缝参数 */
  doubleSlit?: { lambdaNm: number; dMm: number; Lm: number }
  /** 学生测得的条纹间距（mm） */
  measuredFringeMm?: number
  /** 油膜/其他计算结果 */
  derived?: Record<string, number>
}

export interface GridCountState {
  cellSize: number
  /** 已标记格子的行列索引 */
  marked: { c: number; r: number }[]
  /** 轮廓多边形（世界坐标，油膜形状） */
  outline?: { x: number; y: number }[]
  /** 估算面积（格数×格面积） */
  areaEstimate?: number
  /** 一滴溶液含纯油酸体积（m³） */
  dropVolumeM3?: number
}

export interface FieldLineState {
  charges: { x: number; y: number; q: number }[]
  linesPerCharge: number
}

export const EMPTY_PROCESSED: ProcessedData = { version: 1 }
