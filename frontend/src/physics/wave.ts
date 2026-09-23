/**
 * 波动装置引擎（P3 批 4 · 卡 58/59/60）——设计契约 docs/波源引擎设计-P3批4.md。
 * 物理：y(x,t)=A·sin[2π(t/T ∓ x/λ)]；v=λ/T；同侧法=∂y/∂t 符号；多解 Δx=nλ+Δx₀；
 * 干涉 Δr=|PS₁−PS₂|，同相 Δr=kλ 加强、(k+½)λ 减弱。
 * 断言分级：方法独立（数值波峰追踪/首峰扫描/叠加振幅扫描 vs 闭式）· 教材规律（同侧法/v=λ/T）。
 */

/** 单列简谐波（dir=+1 沿 +x 传播：相位 t/T − x/λ；−x 反之） */
export function waveY(x: number, t: number, a: number, lambda: number, period: number, dir: 1 | -1): number {
  return a * Math.sin(2 * Math.PI * (t / period - (dir * x) / lambda))
}

/** 质点速度方向 = ∂y/∂t 符号（同侧法的解析实现；+1 向 +y） */
export function particleVelDir(x: number, t: number, _a: number, lambda: number, period: number, dir: 1 | -1): 1 | -1 {
  const c = Math.cos(2 * Math.PI * (t / period - (dir * x) / lambda))
  return c >= 0 ? 1 : -1
}

/** 卡 58 多解通式：v=Δx/Δt，T=λ/v */
export function waveMultiSolution(lambda: number, dx0: number, dt: number, dir: 1 | -1, n: number): { dx: number; v: number; T: number } {
  const dx = dir === 1 ? n * lambda + dx0 : n * lambda + (lambda - dx0)
  const v = dx / dt
  return { dx, v, T: lambda / v }
}

/** 卡 59 P 点首次到波峰（t>0 最小相位解：t/T − dir·x_P/λ = 1/4） */
export function firstCrestTime(xP: number, lambda: number, period: number, dir: 1 | -1): number {
  // 相位条件 t/T − dir·x_P/λ = 1/4 (mod 1) → t/T = 1/4 + dir·x_P/λ 的最小正值
  let k = 0.25 + (dir * xP) / lambda
  while (k <= 0) k += 1
  return k * period
}

/** 卡 60 双源路程差 */
export function pathDiff(px: number, py: number, s1: [number, number], s2: [number, number]): number {
  return Math.abs(Math.hypot(px - s1[0], py - s1[1]) - Math.hypot(px - s2[0], py - s2[1]))
}

/** 卡 60 两波叠加（同频同波长沿各自方向到点 x 的一维简化：反相加 π） */
export function superpositionY(x: number, t: number, lambda: number, period: number, a1: number, a2: number, antiPhase: boolean): number {
  const y1 = a1 * Math.sin(2 * Math.PI * (t / period - x / lambda))
  const y2 = a2 * Math.sin(2 * Math.PI * (t / period - x / lambda) + (antiPhase ? Math.PI : 0))
  return y1 + y2
}

// ───────── 装置面 ─────────

export interface WaveBody {
  id: string
  type: 'wave_multi' | 'wave_graphs' | 'wave_super'
  x: number; y: number; angle: number
  params: Record<string, number>
}
export interface WaveFrame {
  t: number
  readings: Record<string, number>
  /** 波形采样（y-x 图，60 点）与探针 y-t 序列（供画布） */
  samples: { x: number; y: number }[]
}

export function runWave(elements: WaveBody[], maxDuration = 3): WaveFrame[] {
  const frames: WaveFrame[] = []

  // ── 卡 58 波多解：两方向解集（默认 n=1）──
  const wm = elements.find((e) => e.type === 'wave_multi')
  if (wm) {
    const lambda = wm.params.lambda ?? 4, dx0 = wm.params.dx0 ?? 1, dt = wm.params.dt ?? 1, n = Math.round(wm.params.n ?? 1)
    const p = waveMultiSolution(lambda, dx0, dt, 1, n)
    const m = waveMultiSolution(lambda, dx0, dt, -1, n)
    for (let i = 0; i <= 60; i++) {
      frames.push({
        t: i / 30,
        readings: {
          lambda, dx0, dt, n,
          dx_plus: p.dx, v_plus: p.v, T_plus: p.T,
          dx_minus: m.dx, v_minus: m.v, T_minus: m.T,
        },
        samples: Array.from({ length: 60 }, (_, k) => ({ x: (k / 59) * 3 * lambda, y: waveY((k / 59) * 3 * lambda, 0, 1, lambda, lambda / p.v, 1) })),
      })
    }
    return frames
  }

  // ── 卡 59 振动+波动图：v=λ/T、首峰、同侧法 ──
  const wg = elements.find((e) => e.type === 'wave_graphs')
  if (wg) {
    const a = wg.params.a ?? 1, lambda = wg.params.lambda ?? 4, period = wg.params.T ?? 2
    const dir = (wg.params.dir ?? 1) >= 1 ? 1 : -1
    const xP = wg.params.x_p ?? 1
    const v = lambda / period
    const tCrest = firstCrestTime(xP, lambda, period, dir)
    for (let i = 0; i <= 60; i++) {
      const t = (i / 30) * 2 * period
      frames.push({
        t,
        readings: {
          a, lambda, T: period, dir, x_p: xP,
          v, f: 1 / period, t_crest: tCrest,
          p_vel_dir: particleVelDir(xP, t, a, lambda, period, dir),
          y_p: waveY(xP, t, a, lambda, period, dir),
        },
        samples: Array.from({ length: 60 }, (_, k) => ({ x: (k / 59) * 3 * lambda, y: waveY((k / 59) * 3 * lambda, t, a, lambda, period, dir) })),
      })
    }
    return frames
  }

  // ── 卡 60 波叠加：Δr 判加强/减弱 ──
  const ws = elements.find((e) => e.type === 'wave_super')
  if (ws) {
    const lambda = ws.params.lambda ?? 2, d = ws.params.d ?? 4
    const px = ws.params.px ?? 1, py = ws.params.py ?? 0
    const anti = (ws.params.phase ?? 0) === 1
    const s1: [number, number] = [-d / 2, 0], s2: [number, number] = [d / 2, 0]
    const dr = pathDiff(px, py, s1, s2)
    const k = dr / lambda
    // 同相源：Δr=kλ（k 整数）加强；反相互换
    const isInteger = Math.abs(k - Math.round(k)) < 1e-9
    const enhanced = anti ? !isInteger || Math.abs(k - Math.round(k) - 0.5) < 1e-9 ? Math.abs(k - Math.round(k)) > 1e-9 : false : isInteger
    for (let i = 0; i <= 60; i++) {
      frames.push({
        t: i / 30,
        readings: {
          lambda, d, px, py, anti_phase: anti ? 1 : 0,
          ps1: Math.hypot(px - s1[0], py - s1[1]), ps2: Math.hypot(px - s2[0], py - s2[1]),
          delta_r: dr, k_ratio: k, enhanced: enhanced ? 1 : 0,
        },
        samples: Array.from({ length: 60 }, (_, q) => ({ x: (q / 59) * 4, y: superpositionY((q / 59) * 4, i / 30, lambda, 0.5, 1, 1, anti) })),
      })
    }
    return frames
  }
  return []
}
