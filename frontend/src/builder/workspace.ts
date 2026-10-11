import { reactive } from 'vue'
import type { GeoElement, Domain } from './catalog'

/**
 * D1 Step1·1.1（2026-10-07）：共享场景 store——模块级 reactive 单例（useSimulationSocket 同先例）。
 * BuilderView（搭建 Tab）与 LabView（结果 Tab）读写同一份：v-if 卸载不丢 elements/undo，
 * 替代"卸载时 localStorage 快照 + toPhysicsElements 过滤"的旧 handoff（丢五类件+身份畸变根因）。
 * localStorage 保留为"整页刷新恢复"用途（mount 时仅当 store 为空才回读，防重复导入）。
 */
export interface WorkspaceState {
  elements: GeoElement[]
  undo: string[]
  redo: string[]
  seq: number   // 元件 id 序号（跨 Tab 卸载连续）
  /** 当前画布对应的后端场景 id（深链/云端加载时设置——运行前保存走 PUT 更新而非重复 POST） */
  backendSceneId: number | null
  /** 追问2 补丁（2026-10-07）：视图/会话层三件入 store——切 Tab（v-if 卸载）不再丢。
   *  相机 pan/zoom 仍在 BuilderCanvas 内部（切 Tab 重置，Step 2 单页化后整类消失） */
  viewMode: '2D' | '2.5D' | '3D'
  selectedId: string | null
  domain: Domain
  /** A+B（2026-10-10）：TS 引擎帧位姿——天体等运动型 TS 场景，BuilderCanvas/threeScene 共同消费。
   *  RunBridge setInterval 每帧写入；LabView watch 后调 threeScene.updateStates */
  tsPoses: { id: string; x: number; y: number; vx: number; vy: number }[]
}

export const workspace = reactive<WorkspaceState>({
  elements: [], undo: [], redo: [], seq: 1, backendSceneId: null,
  viewMode: '2D', selectedId: null, domain: 'mech', tsPoses: [],
})

export function wsSnapshot() {
  workspace.undo.push(JSON.stringify(workspace.elements))
  if (workspace.undo.length > 60) workspace.undo.shift()
  workspace.redo.length = 0
}

/** 后端场景元件规范化：老数据/外部来源可能缺 links/params 等字段（typed 反序列化
 *  时代的存量场景无 links）——补默认值防渲染/连线遍历崩溃（2026-10-11 深链根因） */
export function normalizeGeoElements(arr: GeoElement[]): GeoElement[] {
  return arr.map((e) => ({
    ...e,
    params: e.params ?? {},
    links: Array.isArray((e as { links?: unknown }).links) ? e.links : [],
  }))
}

export function wsRestore(json: string) {
  const arr = normalizeGeoElements(JSON.parse(json) as GeoElement[])
  workspace.elements.splice(0, workspace.elements.length, ...arr)
}

export function wsUndo(): boolean {
  const s = workspace.undo.pop()
  if (s === undefined) return false
  workspace.redo.push(JSON.stringify(workspace.elements))
  wsRestore(s)
  return true
}

export function wsRedo(): boolean {
  const s = workspace.redo.pop()
  if (s === undefined) return false
  workspace.undo.push(JSON.stringify(workspace.elements))
  wsRestore(s)
  return true
}
