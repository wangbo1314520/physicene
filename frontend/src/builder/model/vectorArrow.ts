/**
 * vector_arrow 纯函数核心（第三十一轮提取自 BuilderCanvas 以便单测）：
 * 加速度=速度窗口最小二乘斜率（8 采样，30fps subjects 帧距）；显示/隐藏滞回。
 */
export interface VelSample { vx: number; vy: number }

/** 速度采样窗 → 加速度（最小二乘斜率，t 以 subjects 帧距 1/30s 为单位）。
 *  与 accel_sensor 同法（两点差分噪声 13-34% → 拟合 0.3% 的历史经验）；窗口 <4 返回 0。 */
export function accelFromWindow(win: VelSample[]): { ax: number; ay: number } {
  const n = win.length
  if (n < 4) return { ax: 0, ay: 0 }
  const sx = win.reduce((a, _, i) => a + i, 0)
  const sxx = win.reduce((a, _, i) => a + i * i, 0)
  const syx = win.reduce((a, w, i) => a + i * w.vx, 0)
  const syy = win.reduce((a, w, i) => a + i * w.vy, 0)
  const svx = win.reduce((a, w) => a + w.vx, 0)
  const svy = win.reduce((a, w) => a + w.vy, 0)
  const denom = n * sxx - sx * sx
  if (denom <= 0) return { ax: 0, ay: 0 }
  return { ax: ((n * syx - sx * svx) / denom) * 30, ay: ((n * syy - sx * svy) / denom) * 30 }
}

/** 滞回显示判定：显示态速度 >0.02 保持、隐藏态需 >0.05 才显示（防边界抖动闪烁） */
export function shouldShowArrow(speed: number, currentlyHidden: boolean): boolean {
  return currentlyHidden ? speed > 0.05 : speed > 0.02
}
