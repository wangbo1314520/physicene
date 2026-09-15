/**
 * B10 AI 解题讲解器——模板类型
 * 每个高考/竞赛场景提供一个 SolutionBuilder：由当前参数实时生成八段讲解（数值随参数联动，天然支持“变式训练”）。
 * 与教材实验 AI（阶梯提示、不给答案）不同：这里按“题型—过程—受力—规律—临界—推导—数值—易错—同类—竞赛”完整讲题。
 */
export interface SolutionTemplate {
  /** 题型识别 */
  problemType: string
  /** 过程拆解（按时间顺序） */
  processes: string[]
  /** 受力分析（与过程一一对应） */
  forces: string[]
  /** 物理规律（与过程一一对应） */
  laws: string[]
  /** 临界条件 */
  critical: string[]
  /** 公式推导（逐步） */
  derivation: string[]
  /** 数值计算（已代入当前参数） */
  numeric: string[]
  /** 易错点 */
  pitfalls: string[]
  /** 同类题 */
  similar: string[]
  /** 竞赛扩展 */
  competition: string[]
  /** 提示模式的思路要点（不给公式与答案） */
  hints: string[]
}
export type SolutionBuilder<P> = (p: P) => SolutionTemplate

export const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—')
