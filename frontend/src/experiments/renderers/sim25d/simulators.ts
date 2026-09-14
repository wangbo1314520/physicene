/**
 * 约束元件解析模拟器（B2）：弹簧/单摆/圆锥摆/牛顿管/气垫——精确解或 RK4 数值解，
 * 不依赖后端 dyn4j（这些实验需要约束力，解析解更精确且教学一致性好）。
 */

/** 弹簧振子：T=2π√(m/k)，x(t)=A·cos(ωt) */
export function springOscillation(mass: number, k: number, amplitude: number, durationS: number, dt = 0.01) {
  const omega = Math.sqrt(k / mass)
  const pts: { t: number; x: number; v: number; a: number }[] = []
  for (let t = 0; t <= durationS; t += dt) {
    pts.push({ t, x: amplitude * Math.cos(omega * t), v: -amplitude * omega * Math.sin(omega * t), a: -omega * omega * amplitude * Math.cos(omega * t) })
  }
  return { points: pts, period: 2 * Math.PI / omega, omega, k }
}

/** 单摆：θ''=-(g/L)sinθ-d·θ'，小角度 T=2π√(L/g)；RK4 解 */
export function pendulum(L: number, theta0Deg: number, durationS: number, g = 9.8, dt = 0.001) {
  const theta0 = (theta0Deg * Math.PI) / 180
  let theta = theta0, omega = 0
  const pts: { t: number; theta: number; x: number; y: number; v: number }[] = []
  for (let t = 0; t <= durationS; t += dt) {
    pts.push({ t, theta, x: L * Math.sin(theta), y: -L * Math.cos(theta), v: omega * L })
    const k1 = { dθ: omega, dω: -(g / L) * Math.sin(theta) }
    const k2 = { dθ: omega + 0.5 * dt * k1.dω, dω: -(g / L) * Math.sin(theta + 0.5 * dt * k1.dθ) }
    const k3 = { dθ: omega + 0.5 * dt * k2.dω, dω: -(g / L) * Math.sin(theta + 0.5 * dt * k2.dθ) }
    const k4 = { dθ: omega + dt * k3.dω, dω: -(g / L) * Math.sin(theta + dt * k3.dθ) }
    theta += (dt / 6) * (k1.dθ + 2 * k2.dθ + 2 * k3.dθ + k4.dθ)
    omega += (dt / 6) * (k1.dω + 2 * k2.dω + 2 * k3.dω + k4.dω)
  }
  return { points: pts, periodSmallAngle: 2 * Math.PI * Math.sqrt(L / g), theta0 }
}

/** 圆锥摆：T=2π√(L·cosθ/g)；向心力 F=mg·tanθ=m·ω²·L·sinθ */
export function conicalPendulum(L: number, thetaDeg: number, g = 9.8) {
  const theta = (thetaDeg * Math.PI) / 180
  const cosθ = Math.cos(theta), sinθ = Math.sin(theta)
  const period = 2 * Math.PI * Math.sqrt(L * cosθ / g)
  const omega = 2 * Math.PI / period
  const centripetal = 9.8e-3 * omega * omega * L * sinθ // 假设 m=9.8g → F=mg·tanθ
  const height = L * cosθ, radius = L * sinθ
  return { period, omega, radius, height, centripetal, tanθ: Math.tan(theta) }
}

/** 牛顿管：羽毛+硬币在不同气压下的下落（drag ∝ 气压系数×v²） */
export function newtonTube(airFraction: number, durationS: number, dt = 0.01) {
  const g = 9.8
  const coinDrag = 0.002, featherDrag = 0.15 // 阻力系数（真空中 = 0）
  function fall(drag: number) {
    let v = 0, y = 2.0 // 从 2m 高处
    const pts: { t: number; y: number; v: number }[] = [{ t: 0, y, v }]
    for (let t = dt; t <= durationS && y > 0; t += dt) {
      const F = -g + drag * airFraction * v * v
      v += F * dt
      y += v * dt
      pts.push({ t, y, v })
    }
    return pts
  }
  return { coin: fall(coinDrag), feather: fall(featherDrag), airFraction }
}

/** 气体等温变化：PV=C（玻意耳定律），生成 pV 数据 */
export function gasIsotherm(n_mol = 0.001, T = 300) {
  const R = 8.314
  const C = n_mol * R * T
  const data: { V: number; p: number }[] = []
  for (let V = 2; V <= 20; V += 0.5) {
    data.push({ V: V / 1000, p: C / (V / 1000) / 1000 }) // V→L, p→kPa
  }
  return { data, constant: C, T, n: n_mol }
}

/** 功与速度：W=½mv²，弹簧推动 → v² ∝ W */
export function workVelocity(mass: number, k: number, compressions: number[]) {
  return compressions.map((x) => {
    const W = 0.5 * k * x * x
    const v = Math.sqrt(2 * W / mass)
    return { compression: x, work: W, velocity: v, vSquared: v * v }
  })
}

/** 作用力反作用力（牛顿第三定律）：两物体推离，动量守恒验证 */
export function actionReaction(m1: number, m2: number, impulse: number) {
  const v1 = -impulse / m1, v2 = impulse / m2
  return { v1, v2, momentum1: m1 * v1, momentum2: m2 * v2,
           totalMomentum: m1 * v1 + m2 * v2, impulse }
}
