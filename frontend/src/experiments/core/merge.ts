/**
 * 字段级合并模块（B6 冻结）：2D/2.5D/3D 三类 processedData 统一合并策略。
 * 单测覆盖：标量LWW / 数组取长 / 嵌套递归 / exports保留本地 / 版本号递增。
 */
import type { ProcessedData } from '../core/processedData'

/** 字段时间戳（模拟——实际由 AutosaveManager 记录） */
interface TimestampedData extends ProcessedData {
  _timestamps?: Record<string, number>
}

/**
 * 合并两条 processedData：local（本地暂存）+ remote（服务端最新）→ merged
 * 策略：
 *   顶层字段独立合并（paper/tape/simulation/field3d 互不干扰）
 *   标量字段 → Last-Write-Wins（remote 优先）
 *   数组字段 → 取长度更长的一方
 *   exports → 取 local（本地生成的资源文件）
 *   version → 取双方最大值
 */
export function mergeProcessed(
  local: ProcessedData,
  remote: ProcessedData,
): ProcessedData {
  const merged: ProcessedData = {
    version: Math.max(local.version, remote.version),
  } as ProcessedData

  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])

  for (const key of keys) {
    if (key === 'version') continue
    if (key === 'exports') {
      // exports 取 local（本地生成的 PNG/SVG/CSV 资源）
      if (local.exports) (merged as any).exports = local.exports
      continue
    }

    const l = (local as any)[key]
    const r = (remote as any)[key]

    if (l === undefined && r === undefined) continue
    if (l === undefined) { (merged as any)[key] = r; continue }
    if (r === undefined) { (merged as any)[key] = l; continue }

    // 两方都有 → 按类型合并
    if (Array.isArray(l) && Array.isArray(r)) {
      // 数组取长度更长的一方
      ;(merged as any)[key] = l.length >= r.length ? l : r
    } else if (typeof l === 'object' && typeof r === 'object' && l !== null && r !== null) {
      // 嵌套对象递归合并
      ;(merged as any)[key] = mergeNested(l, r)
    } else {
      // 标量 → remote 优先（服务端较新）
      ;(merged as any)[key] = r
    }
  }

  return merged
}

/** 嵌套对象递归合并 */
function mergeNested(l: Record<string, unknown>, r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(l), ...Object.keys(r)])
  for (const k of keys) {
    const lv = l[k]
    const rv = r[k]
    if (lv === undefined) { out[k] = rv; continue }
    if (rv === undefined) { out[k] = lv; continue }
    if (Array.isArray(lv) && Array.isArray(rv)) {
      out[k] = lv.length >= rv.length ? lv : rv
    } else if (typeof lv === 'object' && typeof rv === 'object' && lv !== null && rv !== null) {
      out[k] = mergeNested(lv as Record<string, unknown>, rv as Record<string, unknown>)
    } else {
      out[k] = rv // LWW
    }
  }
  return out
}

/** 检测是否真冲突（同一字段双方都改且不同） */
export function detectConflict(
  local: ProcessedData,
  remote: ProcessedData,
): string[] {
  const conflicts: string[] = []
  for (const key of Object.keys(local)) {
    if (key === 'version' || key === 'exports') continue
    const l = (local as any)[key]
    const r = (remote as any)[key]
    if (l !== undefined && r !== undefined && JSON.stringify(l) !== JSON.stringify(r)) {
      conflicts.push(key)
    }
  }
  return conflicts
}
