/**
 * 步骤引擎（B0 最小闭环）：init → step → validate → record → next → complete
 * 三模式：guided（提示全开+软推进）/ free（无检查）/ exam（硬检查+计分）
 */
import type {
  ExperimentEventData, ExperimentModule, ExperimentStep,
  RunMode, StepCheckContext, StepSnapshot,
} from '../core/types'

export interface StepEngineState {
  snapshot: StepSnapshot
  /** 当前步骤是否已通过检查（可进入下一步） */
  validated: boolean
  /** 上一次检查失败的纠错提示 */
  lastErrorHint: string | null
  /** 全部步骤完成 */
  done: boolean
  /** 过程性得分（exam 模式，按权重） */
  score: number | null
}

export class StepEngine {
  private module: ExperimentModule
  private snapshot: StepSnapshot
  private lastEvent: ExperimentEventData | null = null
  private errorHint: string | null = null
  private scores: Record<string, boolean> = {}

  constructor(module: ExperimentModule, snapshot?: Partial<StepSnapshot>) {
    this.module = module
    this.snapshot = {
      current: 0,
      completed: [],
      records: {},
      mode: 'guided',
      ...snapshot,
    }
  }

  get mode(): RunMode {
    return this.snapshot.mode
  }

  setMode(mode: RunMode) {
    this.snapshot.mode = mode
  }

  get steps(): ExperimentStep[] {
    return this.module.steps
  }

  currentStep(): ExperimentStep | null {
    return this.module.steps[this.snapshot.current] ?? null
  }

  /** 渲染器事件推送（仿真结束/数据记录等） */
  emitEvent(event: ExperimentEventData) {
    this.lastEvent = event
  }

  private ctx(): StepCheckContext {
    return { lastEvent: this.lastEvent, records: this.snapshot.records }
  }

  /** validate：当前步骤的检查（free 恒过；无 check 恒过） */
  validate(): boolean {
    const step = this.currentStep()
    if (!step) {
      return true
    }
    if (this.snapshot.mode === 'free' || !step.check) {
      return true
    }
    const pass = step.check(this.ctx())
    if (!pass) {
      this.errorHint = step.errorHints?.default ?? '检查点未通过：' + (step.goal ?? step.title)
    } else {
      this.errorHint = null
    }
    return pass
  }

  /** record：把数据绑定到当前步骤 */
  record(data: unknown) {
    const step = this.currentStep()
    if (step) {
      this.snapshot.records[step.id] = data
    }
  }

  /** next：exam 硬检查（不过返回 false 并留纠错提示）；guided 软推进 */
  next(): boolean {
    const step = this.currentStep()
    if (!step) {
      return true
    }
    const pass = this.validate()
    if (!pass && this.snapshot.mode === 'exam') {
      return false
    }
    if (!this.snapshot.completed.includes(step.id)) {
      this.snapshot.completed.push(step.id)
    }
    this.scores[step.id] = pass
    this.snapshot.current = Math.min(this.snapshot.current + 1, this.module.steps.length)
    return true
  }

  /** 是否全部完成（complete 状态） */
  get done(): boolean {
    return this.snapshot.current >= this.module.steps.length - 0 && this.allDone
  }

  private get allDone(): boolean {
    return this.module.steps.every((s) => this.snapshot.completed.includes(s.id))
  }

  /** 过程性得分（exam 模式：权重和） */
  getScore(): number | null {
    if (this.snapshot.mode !== 'exam') {
      return null
    }
    let got = 0
    let total = 0
    for (const s of this.module.steps) {
      const w = s.scoreWeight ?? 1
      total += w
      if (this.scores[s.id]) {
        got += w
      }
    }
    return total === 0 ? null : got / total
  }

  /** 持久化快照（供自动保存） */
  export(): StepSnapshot {
    return JSON.parse(JSON.stringify(this.snapshot))
  }

  /** 恢复（断点续做） */
  static from(module: ExperimentModule, snap?: Record<string, unknown> | null): StepEngine {
    return new StepEngine(module, (snap ?? {}) as Partial<StepSnapshot>)
  }
}
