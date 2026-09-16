/**
 * B9 电磁场景定义接口（EMScene 3D 运行器的“场景构建函数”）：
 * 每个高考电磁场景只需提供参数表、init（搭元件 + 初始状态）、step（逐子步物理）、sync（同步 3D 对象）、readout、solution，
 * 相机/渲染循环/参数面板/时间轴/事件/记录/讲解器由 EMScene.vue 统一提供。
 */
import type * as THREE from 'three'
import type { ProcessTimeline } from './multiProcess'
import type { SolutionTemplate } from './solution'
import type { ParamDef, Params } from './mechScene'

export interface EMKit {
  scene: THREE.Scene
  /** 登记可清理对象（重置时统一移除并释放 GPU 资源） */
  track<T extends THREE.Object3D>(o: T): T
}

export interface EMSceneDef<S = Record<string, unknown>> {
  id: string
  title: string
  desc: string
  formula: string
  params: ParamDef[]
  camera: { pos: [number, number, number]; target: [number, number, number] }
  /** 仿真时间流速：每真实秒推进多少仿真秒（默认 1） */
  timeScale?: number
  /** 子步长（仿真秒，默认 1/2000） */
  h?: number
  /** 搭建静态元件 + 创建动态对象，返回初始状态；同时在 tl 上 start 第一个过程 */
  init(p: Params, tl: ProcessTimeline, kit: EMKit): S
  /** 推进一个子步 d（仿真秒）；返回 false 表示结束 */
  step(s: S, p: Params, d: number, t: number, tl: ProcessTimeline): boolean
  /** 每帧把状态同步到 3D 对象（位置 / 轨迹 / 发光 / 读数精灵） */
  sync(s: S, p: Params, t: number): void
  /** 面板只读区：理论量 + 实时量（s 为 null 表示尚未初始化） */
  readout(p: Params, s: S | null): string
  solution(p: Params): SolutionTemplate
}
