/**
 * 渲染尾项判定纯函数（第三十四轮提取自 BuilderCanvas.syncLinks 以便单测）：
 * 弹簧拉压着色态 / 绳松弛虚线态。
 */
export type SpringTension = 'compressed' | 'natural' | 'stretched'

/** 弹簧形变态：压缩红 / 拉伸蓝 / 自然长中性黄（阈值 1mm 容差防边界抖动） */
export function springTensionState(dist: number, L0: number): SpringTension {
  if (dist < L0 - 1e-3) return 'compressed'
  if (dist > L0 + 1e-3) return 'stretched'
  return 'natural'
}

/** 绳松弛判定：锚距 < 绳长即松弛（虚线）——绷紧走实线 */
export function isRopeSlack(dist: number, L: number): boolean {
  return dist < L - 1e-3
}
