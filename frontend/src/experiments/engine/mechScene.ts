/**
 * B9 场景定义接口（MechanicsEngine 的“场景构建函数”）：
 * 每个高考力学场景只需提供参数表、初始化、步进、绘制、理论与讲解模板，UI/时间轴/能量条/记录由 MechScene.vue 统一提供。
 */
import type { ProcessTimeline } from './multiProcess'
import type { SolutionTemplate } from './solution'

export interface ParamDef {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
  unit?: string
  /** 枚举参数：给出选项则渲染下拉框，value 为数字 */
  options?: { value: number; label: string }[]
}
export type Params = Record<string, number>

export interface DrawCtx {
  ctx: CanvasRenderingContext2D
  w: number
  h: number
  /** 世界→屏幕（由场景在 draw 内自定），此处提供常用 label */
  label: (text: string, x: number, y: number, color?: string, size?: number) => void
  arrow: (x0: number, y0: number, dx: number, dy: number, color: string, text?: string) => void
}

export interface EnergyItem { name: string; value: number; color: string }

export interface MechSceneDef<S = Record<string, number>> {
  id: string
  title: string
  desc: string
  formula: string
  params: ParamDef[]
  /** 初始状态；同时在 tl 上 start 第一个过程 */
  init(p: Params, tl: ProcessTimeline): S
  /** 推进一个子步 d（秒）；返回 false 表示运动结束 */
  step(s: S, p: Params, d: number, t: number, tl: ProcessTimeline): boolean
  /** 绘制场景本体（时间轴与能量条由运行器画） */
  draw(dc: DrawCtx, s: S, p: Params, t: number): void
  /** 能量条：各项与参考总量 E0（非力学场景可省略，运行器不画能量条） */
  energy?(s: S, p: Params): { items: EnergyItem[]; E0: number; momentum?: string }
  /** 理论量（面板只读区显示） */
  readout(p: Params, s: S | null): string
  solution(p: Params): SolutionTemplate
  /** 子步长（默认 1/800 s） */
  h?: number
}
