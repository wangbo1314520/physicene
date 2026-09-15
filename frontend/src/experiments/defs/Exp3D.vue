<script setup lang="ts">
/**
 * B3 共享 3D 实验面板：three.js 场景 + OrbitControls（鼠标+触屏+笔）+ 场力可视化。
 * mode 切换 9 种实验：感应条件/电动势/楞次/安培力/洛伦兹/粒子磁场/变压器/布朗/α散射。
 * 全部为逐帧动画（播放/暂停/重置）：每个实验有真实元件（磁棒/线圈/导轨/探测器环/灯泡），
 * 粒子沿轨迹运动、轨迹随播放生长、读数实时刷新。调整滑杆后按「重置」按新参数重建。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  Vec3, rk4Trajectory, lorentzAccel, coulombAccel, brownianAccel,
  magneticFlux, inducedEMF, lenzDirection, transformerRatio, ampereForce, norm,
} from '../renderers/canvas3d/FieldEngine'

const props = defineProps<{ mode: string }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()

const containerRef = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let animId = 0

// ── 参数 ──
const B = ref(1.0)
const v0 = ref(2)
const q = ref(1)
const fieldR = ref(6)   // 磁场区域半径（有界磁场：区域外无场，粒子出界后直线飞出）
const N1 = ref(200)
const N2 = ref(50)
const U1 = ref(220)
const barAngle = ref(0)
const barSpeed = ref(1)
const temperature = ref(300)
const playing = ref(false)
const resultText = ref('')

// ── 动画框架：build 建场景，tick 每帧推进 ──
interface Anim { build(): void; tick(dt: number): void }
let anim: Anim | null = null
let frameNo = 0

// ── 通用工具 ──
const UP = new THREE.Vector3(0, 1, 0)

function mkMesh(geo: THREE.BufferGeometry, color: number,
                opts: { emissive?: number; opacity?: number; basic?: boolean } = {}): THREE.Mesh {
  const transparent = opts.opacity !== undefined
  const mat = opts.basic
    ? new THREE.MeshBasicMaterial({ color, transparent, opacity: opts.opacity ?? 1 })
    : new THREE.MeshStandardMaterial({
        color, roughness: 0.4, metalness: 0.2,
        emissive: opts.emissive !== undefined ? color : 0x000000,
        emissiveIntensity: opts.emissive ?? 0,
        transparent, opacity: opts.opacity ?? 1,
      })
  return new THREE.Mesh(geo, mat)
}

/** 带箭头的方向线（圆柱杆 + 锥头），以组原点为中心、沿 dir 跨 [-len/2, len/2] */
function arrowMesh(dir: THREE.Vector3, len: number, color: number,
                   opts: { radius?: number; opacity?: number } = {}): THREE.Group {
  const g = new THREE.Group()
  const d = dir.clone().normalize()
  const r = opts.radius ?? Math.max(0.03, len * 0.03)
  const head = Math.min(len * 0.35, r * 6)
  const shaftLen = len - head
  const rot = new THREE.Quaternion().setFromUnitVectors(UP, d)
  const shaft = mkMesh(new THREE.CylinderGeometry(r, r, shaftLen, 6), color, { opacity: opts.opacity, basic: true })
  shaft.quaternion.copy(rot)
  shaft.position.copy(d.clone().multiplyScalar(-len / 2 + shaftLen / 2))
  const tip = mkMesh(new THREE.ConeGeometry(r * 2.2, head, 8), color, { opacity: opts.opacity, basic: true })
  tip.quaternion.copy(rot)
  tip.position.copy(d.clone().multiplyScalar(len / 2 - head / 2))
  g.add(shaft, tip)
  return g
}

/** 竖直匀强 B 场箭头网格（沿 +y） */
function bFieldYGrid(count: number, span: number, len: number): THREE.Group {
  const g = new THREE.Group()
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const a = arrowMesh(UP, len, 0xb06ce6, { opacity: 0.55 })
      a.position.set((i - (count - 1) / 2) * span, 0, (j - (count - 1) / 2) * span)
      g.add(a)
    }
  }
  return g
}

/** 可生长轨迹线（预分配缓冲，逐点推进） */
class GrowingTrail {
  readonly line: THREE.Line
  private readonly buf: Float32Array
  private n = 0
  constructor(color: number, private readonly cap: number) {
    this.buf = new Float32Array(cap * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.buf, 3))
    geo.setDrawRange(0, 0)
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }))
  }
  push(p: Vec3) {
    if (this.n >= this.cap) return
    this.buf.set([p.x, p.y, p.z], this.n * 3)
    this.n++
    this.line.geometry.setDrawRange(0, this.n)
    ;(this.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }
}

/** 场景内可清理对象：重置/重建时统一移除并释放 GPU 资源 */
let tracked: THREE.Object3D[] = []
function track<T extends THREE.Object3D>(o: T): T {
  tracked.push(o)
  scene?.add(o)
  return o
}
function clearTracked() {
  for (const o of tracked) {
    scene?.remove(o)
    o.traverse((c: any) => { c.geometry?.dispose?.(); c.material?.dispose?.() })
  }
  tracked = []
}

/** 预计算轨迹的回放器：按物理时间比例推进游标，粒子跟随、轨迹生长 */
class TrackPlayer {
  private cursor = 0
  constructor(private readonly pts: { pos: Vec3 }[], private readonly dtPhys: number,
              private readonly trail: GrowingTrail, private readonly particle: THREE.Mesh,
              private readonly speed: number) {
    trail.push(pts[0].pos)
    particle.position.set(pts[0].pos.x, pts[0].pos.y, pts[0].pos.z)
  }
  get finished() { return this.cursor >= this.pts.length - 1 }
  tick(dt: number) {
    const target = Math.min(this.pts.length - 1, this.cursor + Math.max(1, Math.round((dt * this.speed) / this.dtPhys)))
    for (let k = this.cursor + 1; k <= target; k++) this.trail.push(this.pts[k].pos)
    this.cursor = target
    const p = this.pts[this.cursor].pos
    this.particle.position.set(p.x, p.y, p.z)
  }
}

// ══════════ 各实验实现 ══════════

/** 洛伦兹力 / 带电粒子在匀强磁场中：有界圆形磁场区域（半径可调），区域内圆周运动、出界后直线；particleB 加第二粒子对比半径 */
function buildLorentz(): Anim {
  const two = props.mode === 'particleB'
  let players: TrackPlayer[] = []
  return {
    build() {
      clearTracked()
      const R = fieldR.value
      // 磁场区域：边界环 + 区域内 B 箭头阵列
      const ring = track(mkMesh(new THREE.TorusGeometry(R, 0.05, 8, 96), 0xb06ce6, { basic: true, opacity: 0.8 }))
      ring.rotation.x = Math.PI / 2
      const n = Math.max(3, Math.min(7, Math.round(R / 1.2)))
      const grid = bFieldYGrid(n, (2 * R * 0.85) / (n - 1), 5)
      grid.children.forEach((a) => { if (Math.hypot(a.position.x, a.position.z) > R) a.visible = false })
      track(grid)
      const inside = lorentzAccel({ x: 0, y: 0, z: 0 }, { x: 0, y: B.value, z: 0 }, q.value, 1)
      const accel = (p: Vec3, v: Vec3, t: number) => (Math.hypot(p.x, p.z) <= R ? inside(p, v, t) : { x: 0, y: 0, z: 0 })
      const T = 2 * Math.PI / (Math.abs(q.value) * B.value)
      const speeds = two ? [v0.value, v0.value * 0.6] : [v0.value]
      const colors = [0xF5C542, 0x4A90D9]
      players = speeds.map((v, i) => {
        const r = v / (Math.abs(q.value) * B.value)
        // 从区域左边界处沿 +z 射入（半径 r 的圆心在原点右侧 r 处）；r > R 时粒子走一段圆弧后出界
        const pts = rk4Trajectory({ x: Math.min(r, R * 0.999), y: 0, z: r > R ? -Math.sqrt(Math.max(0, R * R - Math.min(r, R * 0.999) ** 2)) : 0 },
          { x: 0, y: 0, z: v }, 0.005, 3 * T, accel, (p) => norm(p) > R + 8)
        const trail = new GrowingTrail(colors[i], 8000)
        track(trail.line)
        const particle = track(mkMesh(new THREE.SphereGeometry(0.14, 16, 16), colors[i], { emissive: 0.6 }))
        return new TrackPlayer(pts, 0.005, trail, particle, 1.4)
      })
      const r = v0.value / (Math.abs(q.value) * B.value)
      resultText.value = `r = mv/(qB) = ${r.toFixed(3)} m　T = 2πm/(qB) = ${T.toFixed(3)} s　磁场区域 R = ${R.toFixed(1)} m`
        + (r > R ? '　→ r > R：粒子转过一段圆弧后出界直线飞出（有界磁场）' : '　→ r ≤ R：在区域内做完整圆周')
        + (two ? `　（蓝粒子 v′=0.6v → r′=${(r * 0.6).toFixed(3)} m）` : '')
      emit('record', { r, T, B: B.value, v: v0.value, q: q.value, fieldR: R, exits: r > R })
    },
    tick(dt) { players.forEach((p) => p.tick(dt)) },
  }
}

/** α粒子散射：金核 + 核电场线 + 探测器环 + 5 条不同瞄准距离的粒子扇面 */
function buildAlpha(): Anim {
  const ALPHAS = [
    { b: 0.05, color: 0xE05555 }, { b: 0.35, color: 0xF5C542 },
    { b: 1.0, color: 0x3ecf8e }, { b: 2.0, color: 0x4A90D9 }, { b: 3.5, color: 0xb0b0cc },
  ]
  let players: TrackPlayer[] = []
  return {
    build() {
      clearTracked()
      track(mkMesh(new THREE.SphereGeometry(0.22, 20, 20), 0xE05555, { emissive: 0.9 }))
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0)
        const line = track(arrowMesh(dir, 1.6, 0xE05555, { radius: 0.02, opacity: 0.45 }))
        line.position.copy(dir.clone().multiplyScalar(1.1))
      }
      track(mkMesh(new THREE.TorusGeometry(11, 0.06, 8, 96), 0x3a3a5e, { basic: true, opacity: 0.85 }))
      const accel = coulombAccel({ x: 0, y: 0, z: 0 }, 3, 20, 1, 1)
      players = ALPHAS.map(({ b, color }) => {
        const pts = rk4Trajectory({ x: -12, y: b, z: 0 }, { x: 8, y: 0, z: 0 }, 0.004, 4.5, accel,
          (p) => norm(p) > 12.5)
        const trail = new GrowingTrail(color, 4000)
        track(trail.line)
        const particle = track(mkMesh(new THREE.SphereGeometry(0.1, 12, 12), color, { emissive: 0.6 }))
        return new TrackPlayer(pts, 0.004, trail, particle, 0.9)
      })
      resultText.value = '瞄准距离 b = 0.05 / 0.35 / 1.0 / 2.0 / 3.5：越靠近核偏转越大，正对核近乎原路弹回'
      emit('record', { note: '五条轨迹对应 b=0.05/0.35/1/2/3.5' })
    },
    tick(dt) { players.forEach((p) => p.tick(dt)) },
  }
}

/** 布朗运动：30 个微粒连续随机行走（活仿真，温度即时生效） */
function buildBrownian(): Anim {
  const N = 30
  let particles: THREE.Mesh[] = []
  let trails: GrowingTrail[] = []
  let vels: Vec3[] = []
  return {
    build() {
      clearTracked()
      track(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4, 4, 4)),
        new THREE.LineBasicMaterial({ color: 0x3a3a5e })))
      particles = []; trails = []; vels = []
      for (let i = 0; i < N; i++) {
        const p = track(mkMesh(new THREE.SphereGeometry(0.06, 10, 10), 0xF5C542, { emissive: 0.7 }))
        p.position.set((Math.random() - 0.5) * 3.6, (Math.random() - 0.5) * 3.6, (Math.random() - 0.5) * 3.6)
        particles.push(p)
        const trail = new GrowingTrail(0xF5C542, 400)
        track(trail.line)
        trail.push({ x: p.position.x, y: p.position.y, z: p.position.z })
        trails.push(trail)
        vels.push({ x: 0, y: 0, z: 0 })
      }
      resultText.value = `T = ${temperature.value} K：30 个悬浮微粒的三维随机行走（温度越高越剧烈）`
      emit('record', { T: temperature.value, particles: N })
    },
    tick(dt) {
      const accel = brownianAccel(temperature.value, 2)
      const h = 0.02
      const steps = Math.max(1, Math.round(dt / h))
      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < N; i++) {
          const pos = particles[i].position
          const a = accel({ x: pos.x, y: pos.y, z: pos.z }, vels[i], 0)
          const v = vels[i]
          v.x += a.x * h; v.y += a.y * h; v.z += a.z * h
          pos.x += v.x * h; pos.y += v.y * h; pos.z += v.z * h
          // 容器壁反弹
          for (const c of ['x', 'y', 'z'] as const) {
            if (Math.abs(pos[c]) > 1.9) { pos[c] = Math.sign(pos[c]) * 1.9; v[c] *= -0.6 }
          }
        }
      }
      if (frameNo % 4 === 0) {
        for (let i = 0; i < N; i++) {
          trails[i].push({ x: particles[i].position.x, y: particles[i].position.y, z: particles[i].position.z })
        }
      }
      if (frameNo % 30 === 0) {
        resultText.value = `T = ${temperature.value} K：30 个悬浮微粒的三维随机行走（温度越高越剧烈）`
      }
    },
  }
}

/** 电磁感应三连（条件/大小/楞次）：磁棒 + 线圈 + 感应电流方向箭头 + 实时 Φ/ε 读数 */
function buildInduction(): Anim {
  let magnet = new THREE.Group()
  let coilRings: THREE.Mesh[] = []
  let arrowsCCW: THREE.Group[] = []
  let arrowsCW: THREE.Group[] = []
  let bArrows: THREE.Group[] = []
  const AREA = 0.01
  let phase = 0
  let lastPhi = 0
  return {
    build() {
      clearTracked()
      phase = 0
      // 磁棒：N 红 / S 蓝，沿 x 轴放置，N 极朝向线圈
      magnet = new THREE.Group()
      const nHalf = mkMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 16), 0xE05555, { emissive: 0.2 })
      nHalf.position.y = 0.35
      const sHalf = mkMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 16), 0x4A90D9, { emissive: 0.2 })
      sHalf.position.y = -0.35
      magnet.add(nHalf, sHalf)
      magnet.rotation.z = -Math.PI / 2
      magnet.position.set(-2.4, 0, 0)
      track(magnet)
      // 线圈：4 匝铜色圆环，法线沿 x
      coilRings = []
      for (let i = 0; i < 4; i++) {
        const ring = mkMesh(new THREE.TorusGeometry(1, 0.06, 10, 40), 0xd9a05a, { emissive: 0.2 })
        ring.rotation.y = Math.PI / 2
        ring.position.set((i - 1.5) * 0.3, 0, 0)
        coilRings.push(track(ring))
      }
      // B 场箭头：从 N 极指向线圈（沿 +x）
      bArrows = []
      for (let i = 0; i < 3; i++) {
        const a = arrowMesh(new THREE.Vector3(1, 0, 0), 2.4, 0xb06ce6, { opacity: 0.5 })
        a.position.set(-1.9, (i - 1) * 1.3, 0)
        bArrows.push(track(a))
      }
      // 感应电流箭头：线圈外缘 6 个切向小箭头，逆时针/顺时针两套，按楞次显示其一
      arrowsCCW = []; arrowsCW = []
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const pos = new THREE.Vector3(0.62, Math.sin(a) * 1.2, -Math.cos(a) * 1.2)
        const tangent = new THREE.Vector3(0, Math.cos(a), Math.sin(a))
        const ccw = arrowMesh(tangent, 0.5, 0xF5C542, { radius: 0.045 })
        ccw.position.copy(pos)
        arrowsCCW.push(track(ccw))
        const cw = arrowMesh(tangent.clone().negate(), 0.5, 0xF5C542, { radius: 0.045 })
        cw.position.copy(pos)
        arrowsCW.push(track(cw))
      }
      lastPhi = magneticFlux(B.value, AREA, barAngle.value)
      resultText.value = props.mode === 'lenz'
        ? '按 ▶ 播放：磁场周期性增强/减弱，观察线圈感应电流方向如何"阻碍"磁通变化'
        : '按 ▶ 播放：磁棒往复插拔 → 穿过线圈的磁通变化 → 产生感应电流；暂停后磁通不变、电流消失'
    },
    tick(dt) {
      phase += dt
      const w = barSpeed.value * 1.3
      let effB: number
      if (props.mode === 'lenz') {
        // 磁棒不动，B 强弱呼吸（箭头伸缩）
        const k = 0.55 + 0.45 * Math.sin(phase * w)
        bArrows.forEach((a) => (a.scale.x = k))
        effB = B.value * k
      } else {
        // 磁棒往复插拔：越靠近线圈穿过的磁通越大
        magnet.position.x = -2.4 + Math.sin(phase * w) * 1.4
        const dist = Math.abs(magnet.position.x + 2.4)
        effB = B.value * Math.max(0.05, 1 - dist / 1.7)
      }
      const phi = magneticFlux(effB, AREA, barAngle.value)
      const dPhi = (phi - lastPhi) / Math.max(dt, 1e-4)
      lastPhi = phi
      const emf = inducedEMF(N1.value, dPhi)
      const active = Math.abs(emf) > 0.02
      const dir = lenzDirection('out', dPhi > 0)
      const strength = Math.min(1.2, Math.abs(emf) / 2)
      arrowsCCW.forEach((a) => { a.visible = active && dir === 'ccw'; a.scale.setScalar(0.6 + strength) })
      arrowsCW.forEach((a) => { a.visible = active && dir === 'cw'; a.scale.setScalar(0.6 + strength) })
      coilRings.forEach((r) => {
        ;(r.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 0.3 + strength : 0.15
      })
      if (frameNo % 6 === 0) {
        resultText.value = `Φ = ${phi.toFixed(5)} Wb　dΦ/dt = ${dPhi.toFixed(4)} Wb/s　ε = -N·dΦ/dt = ${emf.toFixed(3)} V\n`
          + (active
            ? `感应电流：${dir === 'cw' ? '顺时针' : '逆时针'}（${dPhi > 0 ? '磁通增大→阻碍增大' : '磁通减小→阻碍减小'}）`
            : '磁通不变 → 无感应电流')
      }
      if (frameNo % 30 === 0 && active) {
        emit('record', { phi, emf, direction: dir, B: effB, angle: barAngle.value, N: N1.value })
      }
    },
  }
}

/** 变压器：口字铁芯 + 原/副线圈 + 交流方向箭头 + 灯泡亮度 ∝ U₂ */
function buildTransformer(): Anim {
  let pArrows: THREE.Group[] = []
  let sArrows: THREE.Group[] = []
  let bulb: THREE.Mesh | null = null
  let phase = 0
  const ringCount = (n: number) => Math.max(2, Math.min(8, Math.round(n / 60)))
  return {
    build() {
      clearTracked()
      phase = 0
      const core = (w: number, h: number, x: number, y: number) => {
        const m = track(mkMesh(new THREE.BoxGeometry(w, h, 0.5), 0x8a8aa0))
        m.position.set(x, y, 0)
      }
      core(0.35, 4, -1.2, 0); core(0.35, 4, 1.2, 0); core(2.75, 0.35, 0, 1.85); core(2.75, 0.35, 0, -1.85)
      const pRings = ringCount(N1.value), sRings = ringCount(N2.value)
      for (let i = 0; i < pRings; i++) {
        const r = track(mkMesh(new THREE.TorusGeometry(0.62, 0.055, 10, 36), 0xd9a05a, { emissive: 0.3 }))
        r.rotation.x = Math.PI / 2
        r.position.set(-1.2, (i - (pRings - 1) / 2) * 0.42, 0)
      }
      for (let i = 0; i < sRings; i++) {
        const r = track(mkMesh(new THREE.TorusGeometry(0.62, 0.055, 10, 36), 0x3ecf8e, { emissive: 0.3 }))
        r.rotation.x = Math.PI / 2
        r.position.set(1.2, (i - (sRings - 1) / 2) * 0.42, 0)
      }
      pArrows = []; sArrows = []
      for (let i = 0; i < 3; i++) {
        const a = arrowMesh(UP, 0.9, 0xE05555, { radius: 0.05 })
        a.position.set(-2.2, (i - 1) * 0.8, 0)
        pArrows.push(track(a))
        const b = arrowMesh(UP, 0.9, 0x3ecf8e, { radius: 0.05 })
        b.position.set(2.2, (i - 1) * 0.8, 0)
        sArrows.push(track(b))
      }
      bulb = track(mkMesh(new THREE.SphereGeometry(0.32, 16, 16), 0xF5C542, { emissive: 1 }))
      bulb.position.set(2.7, 1.3, 0)
      const { U2, ratio } = transformerRatio(N1.value, N2.value, U1.value)
      resultText.value = `U₁/U₂ = N₁/N₂ = ${ratio.toFixed(2)} → U₂ = ${U2.toFixed(1)} V（红=原边交流，绿=副边感应，灯泡亮度 ∝ U₂）`
      emit('record', { N1: N1.value, N2: N2.value, U1: U1.value, U2, ratio })
    },
    tick(dt) {
      phase += dt
      const ac = Math.sin(phase * 3)
      const flip = ac >= 0 ? 0 : Math.PI // 交流换向：箭头绕 z 翻转 180°（负缩放会被背面剔除）
      pArrows.forEach((a) => { a.rotation.z = flip; a.scale.y = 0.3 + Math.abs(ac) })
      sArrows.forEach((a) => { a.rotation.z = flip === 0 ? Math.PI : 0; a.scale.y = 0.3 + Math.abs(ac) })
      const { U2 } = transformerRatio(N1.value, N2.value, U1.value)
      if (bulb) (bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + Math.abs(ac) * Math.min(2.5, U2 / 300)
      if (frameNo % 10 === 0) {
        resultText.value = `N₁=${N1.value}　N₂=${N2.value}　U₁=${U1.value} V → U₂=${U2.toFixed(1)} V（${N2.value > N1.value ? '升压' : '降压'}，灯泡亮度 ∝ U₂）`
      }
    },
  }
}

/** 安培力：竖直 B 场 + 双导轨 + 通电导杆，F = I·L×B 推杆沿导轨加速 */
function buildAmpere(): Anim {
  let rod: THREE.Mesh | null = null
  let fArrow: THREE.Group | null = null
  let iArrow: THREE.Group | null = null
  let vx = 0
  const I = 2
  const L: Vec3 = { x: 0, y: 0, z: -1 } // 电流沿 −z，使 F = I·L×B 指向 +x
  return {
    build() {
      clearTracked()
      track(bFieldYGrid(3, 1.8, 3.2))
      for (const z of [-0.55, 0.55]) {
        const rail = track(mkMesh(new THREE.BoxGeometry(8, 0.12, 0.12), 0xd9a05a, { emissive: 0.2 }))
        rail.position.set(0, 0, z)
      }
      rod = track(mkMesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 12), 0xE07B39, { emissive: 0.4 }))
      rod.rotation.x = Math.PI / 2
      rod.position.set(-3.2, 0.12, 0)
      iArrow = track(arrowMesh(new THREE.Vector3(0, 0, -1), 1.1, 0xE05555, { radius: 0.04 }))
      iArrow.position.set(-3.2, 0.32, 0)
      fArrow = track(arrowMesh(new THREE.Vector3(1, 0, 0), 1, 0x3ecf8e, { radius: 0.06 }))
      fArrow.position.set(-3.2, 0.75, 0)
      vx = 0
      const F = norm(ampereForce({ x: 0, y: B.value, z: 0 }, I, L))
      resultText.value = `F = I·L×B，|F| = BIL = ${F.toFixed(2)} N：通电导杆受安培力沿导轨加速（红=电流方向，绿=安培力）`
      emit('record', { B: B.value, I, L, F })
    },
    tick(dt) {
      const Fv = ampereForce({ x: 0, y: B.value, z: 0 }, I, L)
      const F = Fv.x
      vx += F * dt
      if (rod && fArrow && iArrow) {
        rod.position.x += vx * dt
        if (rod.position.x > 3.6) { rod.position.x = -3.6; vx = 0 }
        fArrow.position.x = rod.position.x
        iArrow.position.x = rod.position.x
        fArrow.scale.x = Math.max(0.3, Math.abs(F) * 0.9)
      }
      if (frameNo % 8 === 0) {
        resultText.value = `B=${B.value.toFixed(1)} T　I=${I} A　L=1 m → F=BIL=${Math.abs(F).toFixed(2)} N（+x）　v=${vx.toFixed(2)} m/s（右手定则：F = I·L×B）`
      }
    },
  }
}

function buildAnim(): Anim {
  switch (props.mode) {
    case 'lorentz': case 'particleB': return buildLorentz()
    case 'alpha': return buildAlpha()
    case 'brownian': return buildBrownian()
    case 'induction': case 'emf': case 'lenz': return buildInduction()
    case 'transformer': return buildTransformer()
    case 'ampere': return buildAmpere()
  }
  return { build() {}, tick() {} }
}

function reset() {
  anim = buildAnim()
  anim.build()
  frameNo = 0
}
function togglePlay() {
  if (!anim) reset()
  playing.value = !playing.value
}
function resetAndStop() {
  playing.value = false
  reset()
}

onMounted(() => {
  if (!containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight || 400
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(window.devicePixelRatio)
  containerRef.value.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x14142a)
  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200)
  camera.position.set(props.mode === 'alpha' ? 0 : 6, props.mode === 'alpha' ? 3 : 4, props.mode === 'alpha' ? 17 : 8)

  scene.add(new THREE.AmbientLight(0xffffff, 2.0))
  const light = new THREE.DirectionalLight(0xffffff, 2.5)
  light.position.set(5, 10, 5)
  scene.add(light)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  reset()

  let last = performance.now()
  const loop = () => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (playing.value && anim) {
      frameNo++
      anim.tick(dt)
    }
    controls?.update()
    renderer?.render(scene!, camera!)
  }
  loop()
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  clearTracked()
  controls?.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<template>
  <div class="exp">
    <div class="panel">
      <template v-if="mode === 'lorentz' || mode === 'particleB'">
        <h3>带电粒子在匀强磁场中的运动</h3>
        <label>磁感应强度 B = {{ B.toFixed(1) }} T<input type="range" min="0.5" max="3" step="0.1" v-model.number="B"></label>
        <label>初速度 v = {{ v0 }} m/s<input type="range" min="0.5" max="4" step="0.5" v-model.number="v0"></label>
        <label>电荷量 q = {{ q }} C<input type="range" min="0.5" max="2" step="0.5" v-model.number="q"></label>
        <label>磁场区域半径 R = {{ fieldR.toFixed(1) }} m（有界磁场，出界后直线）<input type="range" min="1" max="10" step="0.5" v-model.number="fieldR"></label>
        <p class="desc">调参后按「重置」按新参数重建轨迹；r = mv/(qB) 大于 R 时粒子走一段圆弧后飞出</p>
      </template>
      <template v-else-if="mode === 'alpha'">
        <h3>α粒子散射（卢瑟福）</h3>
        <p class="desc">五条不同瞄准距离的 α 粒子射向金核：近核近乎原路弹回，远核只偏小角——原子核式结构的证据</p>
      </template>
      <template v-else-if="mode === 'brownian'">
        <h3>布朗运动（三维随机行走）</h3>
        <label>温度 T = {{ temperature }} K<input type="range" min="100" max="1000" step="50" v-model.number="temperature"></label>
        <p class="desc">温度即时生效：越高微粒运动越剧烈；可暂停观察无规则折线</p>
      </template>
      <template v-else-if="mode === 'induction' || mode === 'emf' || mode === 'lenz'">
        <h3>{{ mode === 'lenz' ? '楞次定律' : mode === 'emf' ? '感应电动势的大小' : '感应电流产生的条件' }}</h3>
        <label>磁感应强度 B = {{ B.toFixed(1) }} T<input type="range" min="0.5" max="3" step="0.1" v-model.number="B"></label>
        <label>线圈角度 θ = {{ barAngle }}°<input type="range" min="0" max="90" step="5" v-model.number="barAngle"></label>
        <label>线圈匝数 N = {{ N1 }}<input type="range" min="50" max="500" step="50" v-model.number="N1"></label>
        <label>{{ mode === 'lenz' ? '磁场变化速率' : '磁棒运动速率' }} = {{ barSpeed.toFixed(1) }}×<input type="range" min="0.3" max="3" step="0.1" v-model.number="barSpeed"></label>
      </template>
      <template v-else-if="mode === 'transformer'">
        <h3>变压器 U₁/U₂ = N₁/N₂</h3>
        <label>原线圈 N₁ = {{ N1 }} 匝<input type="range" min="50" max="500" step="10" v-model.number="N1"></label>
        <label>副线圈 N₂ = {{ N2 }} 匝<input type="range" min="10" max="200" step="10" v-model.number="N2"></label>
        <label>输入电压 U₁ = {{ U1 }} V<input type="range" min="12" max="380" step="12" v-model.number="U1"></label>
        <p class="desc">匝数改变后按「重置」重建线圈</p>
      </template>
      <template v-else-if="mode === 'ampere'">
        <h3>安培力方向（右手定则）</h3>
        <label>磁感应强度 B = {{ B.toFixed(1) }} T<input type="range" min="0.5" max="3" step="0.1" v-model.number="B"></label>
        <p class="desc">F = I·L×B：通电导杆沿导轨加速滑动，B 越大加速越快（即时生效）</p>
      </template>

      <div class="controls">
        <button class="run" @click="togglePlay">{{ playing ? '⏸ 暂停' : '▶ 播放实验' }}</button>
        <button class="ghost" @click="resetAndStop">⟲ 重置</button>
      </div>
      <div v-if="resultText" class="result">{{ resultText }}</div>
      <p class="hint">🖱 左键旋转 · 滚轮缩放 · 右键平移</p>
    </div>
    <div ref="containerRef" class="canvas3d"></div>
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 300px 1fr; gap: 10px; min-height: 440px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 10px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 10px; line-height: 1.5; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 10px; }
label input { width: 100%; }
.controls { display: flex; gap: 8px; margin-top: 6px; }
.run { flex: 1; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; }
.ghost { background: transparent; color: #8a8aa0; border: 1px solid #2f2f4a;
  border-radius: 8px; padding: 9px 12px; font-size: 13px; cursor: pointer; }
.result { margin-top: 10px; padding: 8px; background: #23402e; color: #7fe3b3;
  border-radius: 6px; font: 12px Consolas; line-height: 1.6; white-space: pre-line; }
.hint { margin-top: 8px; font-size: 11px; color: #565675; }
.canvas3d { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px;
  overflow: hidden; min-height: 400px; position: relative; }
.canvas3d canvas { touch-action: none; }
</style>
