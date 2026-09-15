import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cross, dot, scale, add, sub, norm, normalize,
  rk4Step, rk4Trajectory,
  lorentzAccel, coulombAccel, brownianAccel,
  magneticFlux, inducedEMF, lenzDirection, transformerRatio,
  ampereForce, rightHandRule,
  type Vec3,
} from './FieldEngine'

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const X = v(1, 0, 0), Y = v(0, 1, 0), Z = v(0, 0, 1), O = v(0, 0, 0)

const expectVec = (a: Vec3, b: Vec3, digits = 9) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
  expect(a.z).toBeCloseTo(b.z, digits)
}

describe('FieldEngine —— 向量运算', () => {
  it('cross：右手系 x̂×ŷ=ẑ、ŷ×ẑ=x̂、ẑ×x̂=ŷ，反交换，自叉积为零', () => {
    expectVec(cross(X, Y), Z)
    expectVec(cross(Y, Z), X)
    expectVec(cross(Z, X), Y)
    const a = v(1, 2, 3), b = v(-2, 0.5, 4)
    expectVec(cross(a, b), scale(cross(b, a), -1))
    expectVec(cross(a, a), O)
  })

  it('dot/scale：正交向量点积为 0，a·a=|a|²，缩放线性', () => {
    expect(dot(X, Y)).toBe(0)
    const a = v(1, 2, 3)
    expect(dot(a, a)).toBe(14)
    expectVec(scale(a, 2), v(2, 4, 6))
    expectVec(scale(a, 0), O)
  })

  it('add/sub/norm：(3,4,0) 模长 5，加减互逆', () => {
    expect(norm(v(3, 4, 0))).toBe(5)
    const a = v(1, -2, 3), b = v(0.5, 7, -1)
    expectVec(sub(add(a, b), b), a)
    expectVec(add(a, O), a)
  })

  it('normalize：得到单位向量；零向量返回零向量而非 NaN', () => {
    const n = normalize(v(3, 4, 0))
    expect(norm(n)).toBeCloseTo(1, 12)
    expectVec(n, v(0.6, 0.8, 0))
    expectVec(normalize(O), O)
    expectVec(normalize(v(1e-13, 0, 0)), O)
  })
})

describe('FieldEngine —— RK4 积分器', () => {
  it('零加速度：匀速直线，pos = p₀ + v₀·t', () => {
    let pos = v(0, 0, 0), vel = v(1, 2, -0.5)
    for (let i = 0; i < 100; i++) ({ pos, vel } = rk4Step(pos, vel, 0.01, () => O))
    expectVec(pos, v(1, 2, -0.5), 9)
    expectVec(vel, v(1, 2, -0.5), 12)
  })

  it('常加速度（重力）：RK4 对二次多项式精确，y = y₀ + v₀t − ½gt²', () => {
    const g = 9.8
    let pos = v(0, 10, 0), vel = v(3, 5, 0)
    const dt = 0.05, steps = 20
    for (let i = 0; i < steps; i++) ({ pos, vel } = rk4Step(pos, vel, dt, () => v(0, -g, 0)))
    const t = dt * steps
    expectVec(pos, v(3 * t, 10 + 5 * t - 0.5 * g * t * t, 0), 9)
    expectVec(vel, v(3, 5 - g * t, 0), 9)
  })

  it('简谐振子 a=−ω²x：1000 步后能量守恒误差 <1e-6', () => {
    const omega = 1
    let pos = v(1, 0, 0), vel = v(0, 0, 0)
    const energy = (p: Vec3, q: Vec3) => 0.5 * dot(q, q) + 0.5 * omega * omega * dot(p, p)
    const e0 = energy(pos, vel)
    for (let i = 0; i < 1000; i++) {
      ({ pos, vel } = rk4Step(pos, vel, 0.01, (p) => scale(p, -omega * omega)))
    }
    expect(Math.abs(energy(pos, vel) - e0) / e0).toBeLessThan(1e-6)
    // t=10s 时解析解 x = cos(10)
    expect(pos.x).toBeCloseTo(Math.cos(10), 6)
  })

  it('rk4Trajectory：步数 = ceil(duration/dt)+1，t 单调递增；stopFn 提前终止', () => {
    const full = rk4Trajectory(O, X, 0.1, 1, () => O)
    expect(full).toHaveLength(11)
    for (let i = 1; i < full.length; i++) expect(full[i].t).toBeGreaterThan(full[i - 1].t)
    expectVec(full[10].pos, v(1, 0, 0), 9)

    const stopped = rk4Trajectory(O, X, 0.1, 1, () => O, (p) => p.x >= 0.45)
    expect(stopped.length).toBeLessThan(full.length)
    expect(stopped[stopped.length - 1].pos.x).toBeCloseTo(0.5, 9)
  })
})

describe('FieldEngine —— 场力模型', () => {
  afterEach(() => vi.restoreAllMocks())

  it('洛伦兹力·纯电场：a = qE/m', () => {
    const accel = lorentzAccel(v(0, 100, 0), O, 2, 4)
    expectVec(accel(O, O, 0), v(0, 50, 0))
  })

  it('洛伦兹力·纯磁场 v⊥B：a⊥v、|a|=qvB/m，轨迹为半径 r=mv/qB 的圆且速率守恒', () => {
    const q = 1, m = 1, B = v(0, 0, 1)
    const accel = lorentzAccel(O, B, q, m)
    const a0 = accel(O, X, 0)
    expect(dot(a0, X)).toBeCloseTo(0, 12)
    expect(norm(a0)).toBeCloseTo(q * 1 * 1 / m, 12)

    // 从原点以 v=(1,0,0) 出发，圆心 (0,−1,0)，r = 1；解析解 pos(t) = (sin t, cos t − 1, 0)
    const traj = rk4Trajectory(O, X, 0.001, Math.PI / 2, accel)
    const center = v(0, -1, 0)
    const last = traj[traj.length - 1]
    expect(norm(sub(last.pos, center))).toBeCloseTo(1, 6)
    expect(norm(last.vel)).toBeCloseTo(1, 6)
    expectVec(last.pos, v(Math.sin(last.t), Math.cos(last.t) - 1, 0), 6)
  })

  it('洛伦兹力·v∥B：不受力', () => {
    const accel = lorentzAccel(O, v(0, 0, 2), 1, 1)
    expectVec(accel(O, v(0, 0, 5), 0), O)
  })

  it('库仑力（α 散射）：方向沿 r̂ 远离核，大小 K·q₁q₂/(m·r²)', () => {
    const accel = coulombAccel(O, 2, 1, 1, 1)
    expectVec(accel(v(2, 0, 0), O, 0), v(0.5, 0, 0))
    // 一般方向：沿 r̂
    const p = v(3, 4, 0)
    const a = accel(p, O, 0)
    expectVec(normalize(a), normalize(p))
    expect(norm(a)).toBeCloseTo(2 / 25, 12)
  })

  it('库仑力：核心区 r<0.1 返回零向量（奇点保护）', () => {
    const accel = coulombAccel(O, 79, 1, 2, 4)
    expectVec(accel(v(0.05, 0, 0), O, 0), O)
    expectVec(accel(O, O, 0), O)
  })

  it('布朗运动：随机项均值为 0 时只剩阻尼项 a = −γv', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const accel = brownianAccel(300, 1.5)
    expectVec(accel(O, v(2, -1, 0.5), 0), v(-3, 1.5, -0.75))
  })
})

describe('FieldEngine —— 电磁感应 / 安培力', () => {
  it('磁通量 Φ=BAcosθ：0° 取满值、60° 减半、90° 为零', () => {
    expect(magneticFlux(0.5, 2, 0)).toBeCloseTo(1, 12)
    expect(magneticFlux(0.5, 2, 60)).toBeCloseTo(0.5, 12)
    expect(magneticFlux(0.5, 2, 90)).toBeCloseTo(0, 12)
  })

  it('法拉第定律 ε=−N·dΦ/dt：符号相反、与匝数成正比', () => {
    expect(inducedEMF(100, 0.02)).toBeCloseTo(-2, 12)
    expect(inducedEMF(200, 0.02)).toBeCloseTo(-4, 12)
    expect(inducedEMF(100, -0.02)).toBeCloseTo(2, 12)
    expect(inducedEMF(100, 0)).toBeCloseTo(0, 12)
  })

  it('楞次定律：感应电流方向阻碍磁通变化（四种组合）', () => {
    expect(lenzDirection('out', true)).toBe('ccw')
    expect(lenzDirection('out', false)).toBe('cw')
    expect(lenzDirection('in', true)).toBe('cw')
    expect(lenzDirection('in', false)).toBe('ccw')
  })

  it('变压器 U₁/U₂=N₁/N₂：降压与升压', () => {
    const down = transformerRatio(100, 50, 220)
    expect(down.ratio).toBe(2)
    expect(down.U2).toBeCloseTo(110, 12)
    const up = transformerRatio(50, 200, 220)
    expect(up.U2).toBeCloseTo(880, 12)
  })

  it('安培力 F=I·L×B 与右手定则 v×B', () => {
    expectVec(ampereForce(Y, 2, X), v(0, 0, 2))
    expectVec(ampereForce(Y, 2, Y), O) // L∥B 无力
    expectVec(rightHandRule(X, Y), Z)
    expectVec(rightHandRule(Y, X), scale(Z, -1))
  })
})
