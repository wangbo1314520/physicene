<script setup lang="ts">
/**
 * B3 共享 3D 实验面板：three.js 场景 + OrbitControls（鼠标+触屏+笔）+ 场力可视化。
 * mode 切换 9 种实验：感应条件/电动势/楞次/安培力/洛伦兹/粒子磁场/变压器/布朗/α散射。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  Vec3, rk4Trajectory, lorentzAccel, coulombAccel, brownianAccel,
  magneticFlux, inducedEMF, lenzDirection, transformerRatio, ampereForce, cross,
} from '../renderers/canvas3d/FieldEngine'

const props = defineProps<{ mode: string }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()

const containerRef = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let animId = 0
let particleMeshes: THREE.Mesh[] = []
let trailLines: THREE.Line[] = []
let fieldArrows: THREE.Object3D[] = []

// ── 参数 ──
const B = ref(1.0)
const v0 = ref(2)
const q = ref(1)
const N1 = ref(200)
const N2 = ref(50)
const U1 = ref(220)
const barAngle = ref(0)
const barSpeed = ref(1)
const temperature = ref(300)
const isRunning = ref(false)
const resultText = ref('')

// ── 场可视化：⊙⊗ 符号 ──
function buildBFieldVisual(scene: THREE.Scene, strength: number) {
  fieldArrows.forEach((a) => scene.remove(a))
  fieldArrows = []
  const n = 4
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i - 1.5) * 2, z = (j - 1.5) * 2
      // ⊙ = 圆圈+点（向外）；⊗ = 圆圈+叉（向内）
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.15, 0.02, 8, 16),
        new THREE.MeshBasicMaterial({ color: 0xb06ce6 }),
      )
      ring.position.set(x, -3, z)
      ring.rotation.x = Math.PI / 2
      scene.add(ring)
      fieldArrows.push(ring)
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xb06ce6 }),
      )
      dot.position.set(x, -3, z)
      scene.add(dot)
      fieldArrows.push(dot)
    }
  }
}

// ── 粒子轨迹 ──
function clearParticles() {
  particleMeshes.forEach((m) => scene?.remove(m))
  trailLines.forEach((l) => scene?.remove(l))
  particleMeshes = []
  trailLines = []
}
function addParticle(pos: Vec3, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
  )
  mesh.position.set(pos.x, pos.y, pos.z)
  scene?.add(mesh)
  particleMeshes.push(mesh)
}
function updateTrail(pts: { pos: Vec3 }[], color: number) {
  if (pts.length < 2) return
  const geo = new THREE.BufferGeometry().setFromPoints(
    pts.map((p) => new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z)),
  )
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 2 }))
  scene?.add(line)
  trailLines.push(line)
}

// ── 各实验运行 ──
function runLorentz() {
  clearParticles()
  const Bv: Vec3 = { x: 0, y: B.value, z: 0 }
  const accel = lorentzAccel({ x: 0, y: 0, z: 0 }, Bv, q.value, 1)
  const pts = rk4Trajectory({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: v0.value }, 0.001, 2 * Math.PI * 4, accel)
  updateTrail(pts, 0x4a90d9)
  if (pts.length > 0) addParticle(pts[pts.length - 1].pos, 0x4a90d9)
  const r = 1 * v0.value / (Math.abs(q.value) * B.value)
  resultText.value = `r = mv/(qB) = ${r.toFixed(3)} m, T = 2πm/(qB) = ${(2 * Math.PI / (Math.abs(q.value) * B.value)).toFixed(3)} s`
  emit('record', { r, T: 2 * Math.PI / (Math.abs(q.value) * B.value), B: B.value, v: v0.value, q: q.value })
}

function runAlphaScatter() {
  clearParticles()
  const accel = coulombAccel({ x: 0, y: 0, z: 0 }, 3, 20, 1, 1)
  // 核
  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xE05555, emissive: 0xE05555, emissiveIntensity: 0.8 }),
  )
  scene?.add(nucleus)
  particleMeshes.push(nucleus)
  // 三条不同瞄准距离的 α 粒子
  for (const b of [1, 2, 3.5]) {
    const pts = rk4Trajectory({ x: -12, y: b, z: 0 }, { x: 4, y: 0, z: 0 }, 0.001, 6, accel)
    updateTrail(pts, b === 1 ? 0xF5C542 : b === 2 ? 0x3ecf8e : 0x4a90d9)
  }
  resultText.value = '瞄准距离越小偏转角越大——原子核式结构'
  emit('record', { note: '三条轨迹对应 b=1, 2, 3.5' })
}

function runBrownian() {
  clearParticles()
  const accel = brownianAccel(temperature.value, 2)
  for (let p = 0; p < 30; p++) {
    const pts = rk4Trajectory(
      { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 },
      { x: 0, y: 0, z: 0 }, 0.005, 5, accel,
    )
    updateTrail(pts, 0xF5C542)
  }
  resultText.value = `T=${temperature.value}K，30 个微粒的三维随机行走`
  emit('record', { T: temperature.value, particles: 30 })
}

function runInduction() {
  const phi = magneticFlux(B.value, 0.01, barAngle.value)
  const prevPhi = magneticFlux(B.value, 0.01, barAngle.value - barSpeed.value * 5)
  const emf = inducedEMF(N1.value, (phi - prevPhi) / 0.1)
  const dir = lenzDirection(B.value > 0 ? 'out' : 'in', phi > prevPhi)
  resultText.value = `Φ = ${phi.toFixed(5)} Wb, ε = ${emf.toFixed(4)} V, 感应电流方向 = ${dir === 'cw' ? '顺时针' : '逆时针'}`
  emit('record', { phi, emf, direction: dir, B: B.value, angle: barAngle.value, N: N1.value })
}

function runTransformer() {
  const { U2, ratio } = transformerRatio(N1.value, N2.value, U1.value)
  resultText.value = `U₁/U₂ = N₁/N₂ = ${ratio} → U₂ = ${U2.toFixed(1)} V`
  emit('record', { N1: N1.value, N2: N2.value, U1: U1.value, U2, ratio })
}

function runAmpere() {
  const Bv: Vec3 = { x: 0, y: B.value, z: 0 }
  const Lv: Vec3 = { x: 0.5, y: 0, z: 0 }
  const F = ampereForce(Bv, 2, Lv)
  const dir = F.y > 0 ? '+z' : F.z > 0 ? '+z' : '-z'
  resultText.value = `F = BIL×sinθ, |F| = |B×I×L| → 方向由右手定则确定（F = I·L×B）`
  emit('record', { B: Bv, I: 2, L: Lv, F })
}

function run() {
  isRunning.value = true
  switch (props.mode) {
    case 'lorentz': case 'particleB': runLorentz(); break
    case 'alpha': runAlphaScatter(); break
    case 'brownian': runBrownian(); break
    case 'induction': case 'emf': case 'lenz': runInduction(); break
    case 'transformer': runTransformer(); break
    case 'ampere': runAmpere(); break
  }
  isRunning.value = false
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
  camera.position.set(6, 4, 8)

  scene.add(new THREE.AmbientLight(0xffffff, 2.0))
  const dir = new THREE.DirectionalLight(0xffffff, 2.5)
  dir.position.set(5, 10, 5)
  scene.add(dir)

  // 网格
  const grid = new THREE.GridHelper(20, 20, 0x3a3a5e, 0x23233a)
  scene.add(grid)

  // OrbitControls（鼠标+触屏+笔）
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  buildBFieldVisual(scene, B.value)

  const loop = () => {
    animId = requestAnimationFrame(loop)
    controls?.update()
    renderer?.render(scene!, camera!)
  }
  loop()
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
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
      </template>
      <template v-else-if="mode === 'alpha'">
        <h3>α粒子散射（卢瑟福）</h3>
        <p class="desc">三条不同瞄准距离的 α 粒子射向金核</p>
      </template>
      <template v-else-if="mode === 'brownian'">
        <h3>布朗运动（三维随机行走）</h3>
        <label>温度 T = {{ temperature }} K<input type="range" min="100" max="1000" step="50" v-model.number="temperature"></label>
      </template>
      <template v-else-if="mode === 'induction' || mode === 'emf' || mode === 'lenz'">
        <h3>{{ mode === 'lenz' ? '楞次定律' : mode === 'emf' ? '感应电动势' : '感应电流条件' }}</h3>
        <label>磁感应强度 B = {{ B.toFixed(1) }} T<input type="range" min="0.5" max="3" step="0.1" v-model.number="B"></label>
        <label>线圈角度 θ = {{ barAngle }}°<input type="range" min="0" max="90" step="5" v-model.number="barAngle"></label>
        <label>线圈匝数 N = {{ N1 }}<input type="range" min="50" max="500" step="50" v-model.number="N1"></label>
      </template>
      <template v-else-if="mode === 'transformer'">
        <h3>变压器 U₁/U₂ = N₁/N₂</h3>
        <label>原线圈 N₁ = {{ N1 }} 匝<input type="range" min="50" max="500" step="10" v-model.number="N1"></label>
        <label>副线圈 N₂ = {{ N2 }} 匝<input type="range" min="10" max="200" step="10" v-model.number="N2"></label>
        <label>输入电压 U₁ = {{ U1 }} V<input type="range" min="12" max="380" step="12" v-model.number="U1"></label>
      </template>
      <template v-else-if="mode === 'ampere'">
        <h3>安培力方向（右手定则）</h3>
        <label>磁感应强度 B = {{ B.toFixed(1) }} T<input type="range" min="0.5" max="3" step="0.1" v-model.number="B"></label>
        <p class="desc">F = I·L×B，方向由右手定则确定</p>
      </template>

      <button class="run" @click="run" :disabled="isRunning">▶ 运行实验</button>
      <div v-if="resultText" class="result">{{ resultText }}</div>
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
.run { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; margin-top: 6px; }
.run:disabled { opacity: 0.4; }
.result { margin-top: 10px; padding: 8px; background: #23402e; color: #7fe3b3;
  border-radius: 6px; font: 12px Consolas; }
.canvas3d { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px;
  overflow: hidden; min-height: 400px; position: relative; }
.canvas3d canvas { touch-action: none; }
</style>
