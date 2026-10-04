import type { GeoElement } from '../catalog'

/** 批 2·2.11：引擎实际读取的连线数上限（RunBridge/渲染只读这些条数，多连静默不生效）
 *  rope/spring/pulley 两端各一（links[0]/[1]）；六类检测器与矢量箭头单目标（links[0]）。 */
export const LINK_CAP: Record<string, number> = {
  rope: 2, spring: 2, pulley: 2,
  accel_sensor: 1, speed_sensor: 1, range_finder: 1, photogate: 1, force_sensor: 1, energy_meter: 1, vector_arrow: 1,
}

export interface AnchorRef { id: string; anchorId: string }

/** 连接冲突判定：返回提示文案则拦截（不落线）；null = 无冲突可落线。
 *  规则依据引擎消费方式：① 完全重复 ② 反向重复（对方已连回来）③ 同一条线两端接同一锚点
 *  ④ 超出该元件连线容量（多连的引擎不读）。注意 pulley 仅一个「悬挂点」锚点、两端共用，
 *  故不做"锚点占用"拦截——同锚点连不同目标是合法的。 */
export function linkConflict(
  from: AnchorRef, to: AnchorRef,
  owner: Pick<GeoElement, 'type' | 'links'> | undefined,
  target: Pick<GeoElement, 'type' | 'links'> | undefined,
  labelOf: (id: string) => string,
): string | null {
  if (!owner || !target) return null
  const fromLabel = `${labelOf(from.id)}·${from.anchorId}`
  const toLabel = `${labelOf(to.id)}·${to.anchorId}`
  if (owner.links.some((l) => l.anchorA === from.anchorId && l.toId === to.id && l.anchorB === to.anchorId))
    return `已存在相同连接：${fromLabel} ↔ ${toLabel}，勿重复连线`
  if (target.links.some((l) => l.anchorA === to.anchorId && l.toId === from.id && l.anchorB === from.anchorId))
    return `已存在相同连接（反向已连过）：${toLabel} ↔ ${fromLabel}`
  if (owner.links.some((l) => l.toId === to.id && l.anchorB === to.anchorId))
    return `${toLabel} 已被这条线占用——同一条线的两端不能接在同一锚点上`
  const cap = LINK_CAP[owner.type]
  if (cap !== undefined && owner.links.length >= cap) {
    const bound = cap === 2 ? '两处（每端一连）' : '一个目标'
    return `${labelOf(from.id)}最多连 ${bound}——引擎只读前 ${cap} 条连线，再多连不会生效`
  }
  return null
}
