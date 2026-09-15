/**
 * RK4 积分器 + 3D 场力引擎核心（B3 冻结）
 * 纯数学模块，无 DOM 依赖，可单测。
 */

export interface Vec3 { x: number; y: number; z: number }

export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}
export function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z }
export function scale(a: Vec3, s: number): Vec3 { return { x: a.x * s, y: a.y * s, z: a.z * s } }
export function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z } }
export function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } }
export function norm(a: Vec3): number { return Math.sqrt(dot(a, a)) }
export function normalize(a: Vec3): Vec3 { const n = norm(a); return n < 1e-12 ? { x: 0, y: 0, z: 0 } : scale(a, 1 / n) }

/** 质点状态 */
export interface Particle3D {
  pos: Vec3
  vel: Vec3
  mass: number
  charge: number
}

/** 加速度函数：a = F(pos, vel) / m */
export type AccelFn = (p: Vec3, v: Vec3, t: number) => Vec3

/**
 * RK4 积分器（B3 冻结）：单个步进，可迭代调用。
 * y = [pos, vel]；y' = [vel, accel(pos, vel)]
 */
export function rk4Step(p: Vec3, v: Vec3, dt: number, accel: AccelFn, t = 0): { pos: Vec3; vel: Vec3 } {
  const a1 = accel(p, v, t)
  const p2 = add(p, scale(v, dt / 2)); const v2 = add(v, scale(a1, dt / 2))
  const a2 = accel(p2, v2, t + dt / 2)
  const p3 = add(p, scale(v2, dt / 2)); const v3 = add(v, scale(a2, dt / 2))
  const a3 = accel(p3, v3, t + dt / 2)
  const p4 = add(p, scale(v3, dt)); const v4 = add(v, scale(a3, dt))
  const a4 = accel(p4, v4, t + dt)

  const pos = add(p, scale(add(add(v, scale(v2, 2)), add(scale(v3, 2), v4)), dt / 6))
  const vel = add(v, scale(add(add(a1, scale(a2, 2)), add(scale(a3, 2), a4)), dt / 6))
  return { pos, vel }
}

/** 完整轨迹：迭代 RK4 直到 duration 或停止条件 */
export function rk4Trajectory(p0: Vec3, v0: Vec3, dt: number, durationS: number,
                               accel: AccelFn, stopFn?: (p: Vec3, v: Vec3, t: number) => boolean) {
  let pos = p0, vel = v0, t = 0
  const pts: { t: number; pos: Vec3; vel: Vec3 }[] = [{ t, pos, vel }]
  const n = Math.ceil(durationS / dt)
  for (let i = 0; i < n; i++) {
    if (stopFn?.(pos, vel, t)) break
    const r = rk4Step(pos, vel, dt, accel, t)
    pos = r.pos; vel = r.vel; t += dt
    pts.push({ t, pos: { ...pos }, vel: { ...vel } })
  }
  return pts
}

// ===== 场力模型 =====

/** 洛伦兹力：F = q(E + v×B) → a = q(E + v×B)/m */
export function lorentzAccel(E: Vec3, B: Vec3, charge: number, mass: number): AccelFn {
  return (p, v) => {
    const vxB = cross(v, B)
    return scale(add(E, vxB), charge / mass)
  }
}

/** 库仑斥力（α 散射）：a = K·q₁·q₂·r̂ / (m·r²)，指向远离核方向 */
export function coulombAccel(nucleusPos: Vec3, nucleusCharge: number, K: number,
                              particleCharge: number, particleMass: number): AccelFn {
  return (p) => {
    const r = sub(p, nucleusPos)
    const dist = norm(r)
    if (dist < 0.1) return { x: 0, y: 0, z: 0 }
    const rHat = normalize(r)
    const f = K * nucleusCharge * particleCharge / (dist * dist)
    return scale(rHat, f / particleMass)
  }
}

/** 布朗运动：随机加速度（热运动） */
export function brownianAccel(temperatureK: number, damping = 1.5): AccelFn {
  return (p, v, t) => {
    const sigma = Math.sqrt(2 * temperatureK * damping) * 0.01
    return {
      x: (Math.random() - 0.5) * sigma - v.x * damping,
      y: (Math.random() - 0.5) * sigma - v.y * damping,
      z: (Math.random() - 0.5) * sigma - v.z * damping,
    }
  }
}

// ===== 电磁感应模型 =====

/** 磁通量：Φ = B·A·cosθ */
export function magneticFlux(B: number, area: number, thetaDeg: number): number {
  return B * area * Math.cos((thetaDeg * Math.PI) / 180)
}

/** 法拉第定律：ε = -N·dΦ/dt */
export function inducedEMF(N: number, dPhiDt: number): number {
  return -N * dPhiDt
}

/** 楞次定律：感应电流方向 = 阻碍磁通变化 */
export function lenzDirection(BDirection: 'in' | 'out', fluxIncreasing: boolean): 'cw' | 'ccw' {
  // B 向外增强 → 感应电流逆时针（产生向内 B 阻碍增强）
  // B 向外减弱 → 感应电流顺时针（产生向外 B 阻碍减弱）
  if (BDirection === 'out') return fluxIncreasing ? 'ccw' : 'cw'
  return fluxIncreasing ? 'cw' : 'ccw'
}

/** 变压器：U₁/U₂ = N₁/N₂ */
export function transformerRatio(N1: number, N2: number, U1: number): { U2: number; ratio: number } {
  const ratio = N1 / N2
  return { U2: U1 / ratio, ratio }
}

// ===== 安培力 / 右手定则 =====

/** 安培力：F = BIL·sinθ，方向由右手定则确定 */
export function ampereForce(B: Vec3, I: number, L: Vec3): Vec3 {
  // F = I·L×B
  return scale(cross(L, B), I)
}

/** 右手定则验证：F = qv×B 的方向 */
export function rightHandRule(v: Vec3, B: Vec3): Vec3 {
  return cross(v, B)
}
