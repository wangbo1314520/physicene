/** 实验库核心契约（B0 定死，B1-B8 不改接口只加实现） */

export type Dimension = '2D' | '2.5D' | '3D'
export type RunMode = 'guided' | 'free' | 'exam'

/** 步骤检查上下文：渲染器产出的事件数据 + 已记录数据 */
export interface StepCheckContext {
  /** 渲染器最近一次事件（如仿真 ended 的数据摘要） */
  lastEvent: ExperimentEventData | null
  /** 各步骤已记录的数据 */
  records: Record<string, unknown>
}

export interface ExperimentEventData {
  type: 'sim-ended' | 'sim-frame' | 'data-recorded' | 'custom'
  payload?: unknown
}

export interface ExperimentStep {
  id: string
  title: string
  /** 步骤目标（显示） */
  goal?: string
  /** 操作提示（AI 助教同源引用） */
  hint?: string
  /** 条件触发：通过才可进入下一步（exam 模式强制，guided 模式软提示，free 跳过） */
  check?: (ctx: StepCheckContext) => boolean
  /** 纠错引导 {错误情形: 提示} */
  errorHints?: Record<string, string>
  scoreWeight?: number
}

export interface ExperimentPreset {
  elements: unknown[]
  config: Record<string, unknown>
}

export interface ExperimentModule {
  /** 注册键（全库唯一），如 em-coulomb-repulsion */
  id: string
  name: string
  book: string
  chapter: string
  dimension: Dimension
  summary: string
  /** B0-B3 里程碑内是否已可运行 */
  available: boolean
  /** 预计开放的批次 */
  batch?: string
  /** 2.5D 实验的仿真预置（available 且 dimension=2.5D 时必填） */
  preset?: ExperimentPreset
  steps: ExperimentStep[]
}

/** 步骤状态机快照（持久化到 experiment_session.step_state） */
export interface StepSnapshot {
  current: number
  completed: string[]
  records: Record<string, unknown>
  mode: RunMode
}

export const EMPTY_SNAPSHOT: StepSnapshot = {
  current: 0,
  completed: [],
  records: {},
  mode: 'guided',
}
