/**
 * 高考电磁场景共享 3D 元件库：场区盒 / 极板 / 场箭头阵列 / 文字标签 / 带生长轨迹的粒子（RK4）
 */
import * as THREE from 'three'
import { mkMesh, arrowMesh, GrowingTrail, textSprite } from '../../../renderers/canvas3d/three-kit'
import { rk4Step, type Vec3, type AccelFn } from '../../../renderers/canvas3d/FieldEngine'
import type { EMKit } from '../../../engine/emScene'

export const C = { E: 0x3ecf8e, B: 0xb06ce6, plate: 0x8a8aa0, screen: 0xd4af37, particle: 0xF5C542, p2: 0x4A90D9, red: 0xE05555, grey: 0x565675 }
export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
export const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
export const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—')

/** 半透明场区盒：x∈[x0,x1] y∈[y0,y1]，厚 dz */
export function fieldBox(kit: EMKit, x0: number, x1: number, y0: number, y1: number, color: number, opacity = 0.12, dz = 3) {
  const b = kit.track(mkMesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, dz), color, { opacity }))
  ;(b.material as THREE.Material).depthWrite = false   // 透明体积不写深度，否则盒内元件被前表面挡掉
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0)
  return b
}

/** 极板 / 屏：中心 (cx,cy,cz)，尺寸 sx×sy×sz */
export function plate(kit: EMKit, cx: number, cy: number, sx: number, sy: number, color = C.plate, opacity?: number, sz = 3.2) {
  const m = kit.track(mkMesh(new THREE.BoxGeometry(sx, sy, sz), color, opacity !== undefined ? { opacity } : {}))
  m.position.set(cx, cy, 0)
  return m
}

/** 场箭头阵列：在 [x0,x1]×[y0,y1] 均匀布 nx×ny 支沿 dir 的箭头 */
export function arrowGrid(kit: EMKit, dir: Vec3, x0: number, x1: number, y0: number, y1: number, nx: number, ny: number, len: number, color: number, z = 0, opacity = 0.55) {
  const d = new THREE.Vector3(dir.x, dir.y, dir.z)
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = kit.track(arrowMesh(d, len, color, { opacity, radius: 0.035 }))
    a.position.set(x0 + ((i + 0.5) / nx) * (x1 - x0), y0 + ((j + 0.5) / ny) * (y1 - y0), z)
  }
}

/** ⊙ / ⊗ 风格的 z 向磁场用短箭头阵列表示（沿 ±z） */
export function bFieldZ(kit: EMKit, sign: 1 | -1, x0: number, x1: number, y0: number, y1: number, nx: number, ny: number) {
  arrowGrid(kit, { x: 0, y: 0, z: sign }, x0, x1, y0, y1, nx, ny, 2.2, C.B, 0, 0.5)
}

export function label(kit: EMKit, text: string, x: number, y: number, z = 0, color = '#b0b0cc', scale = 1) {
  const s = kit.track(textSprite(text, { color, scale }))
  s.position.set(x, y, z)
  return s
}

/** 带生长轨迹的粒子：advance 按 RK4 推进一个子步；sync 每帧同步网格与轨迹 */
export class Mover {
  pos: Vec3
  vel: Vec3
  readonly mesh: THREE.Mesh
  readonly trail: GrowingTrail
  alive = true
  constructor(kit: EMKit, p0: Vec3, v0: Vec3, color = C.particle, r = 0.16, cap = 30000) {
    this.pos = { ...p0 }; this.vel = { ...v0 }
    this.trail = new GrowingTrail(color, cap); kit.track(this.trail.line)
    this.mesh = kit.track(mkMesh(new THREE.SphereGeometry(r, 16, 16), color, { emissive: 0.8 }))
    this.mesh.position.set(p0.x, p0.y, p0.z)
    this.trail.push(p0)
  }
  advance(d: number, accel: AccelFn, t: number) {
    if (!this.alive) return
    const r = rk4Step(this.pos, this.vel, d, accel, t)
    this.pos = r.pos; this.vel = r.vel
  }
  sync() {
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z)
    this.trail.push(this.pos)
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.y, this.vel.z) }
}

/** 洛伦兹力加速度（局部 E、B，随位置分区由场景给出） */
export function lorentz(E: Vec3, B: Vec3, qm: number): AccelFn {
  return (_p, v) => ({ x: qm * (E.x + v.y * B.z - v.z * B.y), y: qm * (E.y + v.z * B.x - v.x * B.z), z: qm * (E.z + v.x * B.y - v.y * B.x) })
}
export const ZERO: Vec3 = { x: 0, y: 0, z: 0 }
