<script setup lang="ts">
/**
 * α粒子散射实验（卢瑟福，纯 3D）——7 类元件齐全：
 *  ① α粒子源（镭，铅盒准直）② 准直狭缝 ③ 金箔 ④ 环形荧光屏/探测器（72 片，击中闪烁计数）
 *  ⑤ 多条散射轨迹（均匀瞄准距离分布 + 2 条近核反弹，逐个发射）⑥ 散射角量角器 ⑦ 原子核 / 卢瑟福模型（核 + 核电场 + 原子壳）
 * 物理：a = K·Z·q/(m r²)，tan(θ/2) = KZq/(m v² b)；直方图对照卢瑟福公式 dN/dΩ ∝ 1/sin⁴(θ/2)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { rk4Trajectory, coulombAccel, norm } from '../renderers/canvas3d/FieldEngine'
import { mkMesh, arrowMesh, GrowingTrail, TrackPlayer, makeTracker, textSprite, setupThree } from '../renderers/canvas3d/three-kit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const containerRef = ref<HTMLDivElement | null>(null)
const histRef = ref<HTMLCanvasElement | null>(null)

// ── 参数 ──
const Z = ref(79)          // 金核电荷数
const v0 = ref(8)          // α 粒子速度（相对单位）
const count = ref(24)      // 主束粒子数（另加 2 条近核轨迹）
const playing = ref(false)

const RING_R = 11, SOURCE_X = -16, SLIT_X = -12.5, TILE_N = 72
const K_CONST = 5.6 / 79   // 标定：Z=79、v=8 时 b=1 → θ≈10°，b=0.03 → θ≈140°

let three: ReturnType<typeof setupThree> | null = null
const { track, clearTracked } = makeTracker(() => three?.scene ?? null)
let animId = 0
let last = 0
let simTime = 0

interface Shot { player: TrackPlayer; startAt: number; theta: number; hitAngle: number; counted: boolean }
let shots: Shot[] = []
let tiles: THREE.Mesh[] = []
let tileGlow: number[] = []

const BINS = 12   // 每 15°
const hist = ref<number[]>(new Array(BINS).fill(0))
const emitted = ref(0), landed = ref(0), backscatter = ref(0), maxTheta = ref(0)
const total = computed(() => count.value + 2)
const ELEMENTS = [
  '① α粒子源（镭，铅盒）', '② 准直狭缝', '③ 金箔', '④ 环形荧光屏/探测器（72 片）',
  '⑤ 散射轨迹（多条，逐个发射）', '⑥ 散射角量角器', '⑦ 原子核 / 卢瑟福模型',
]

function colorByTheta(theta: number): number {
  return theta < 10 ? 0x7fb3ff : theta < 30 ? 0x3ecf8e : theta < 90 ? 0xF5C542 : 0xE05555
}

function build() {
  clearTracked()
  shots = []; tiles = []; tileGlow = []
  simTime = 0; emitted.value = 0; landed.value = 0; backscatter.value = 0; maxTheta.value = 0
  hist.value = new Array(BINS).fill(0)

  // ① α 源：铅盒 + 镭 + 出射孔道
  const lead = track(mkMesh(new THREE.BoxGeometry(2.2, 1.6, 1.6), 0x3a3a4e)); lead.position.set(SOURCE_X - 0.6, 0, 0)
  const radium = track(mkMesh(new THREE.SphereGeometry(0.28, 16, 16), 0x9be7ff, { emissive: 1.2 })); radium.position.set(SOURCE_X - 0.6, 0, 0)
  const channel = track(mkMesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 12), 0x14142a)); channel.rotation.z = Math.PI / 2; channel.position.set(SOURCE_X + 0.5, 0, 0)
  const l1 = track(textSprite('① α源（镭）', { color: '#9be7ff' })); l1.position.set(SOURCE_X - 0.6, 1.9, 0)
  // ② 准直狭缝：两块铅板，中间留束宽
  for (const s of [-1, 1]) { const plate = track(mkMesh(new THREE.BoxGeometry(0.25, 2.4, 1.4), 0x5c5c7a)); plate.position.set(SLIT_X, s * 5.1, 0) }
  const l2 = track(textSprite('② 准直狭缝', { color: '#b0b0cc' })); l2.position.set(SLIT_X, 7.2, 0)
  // ③ 金箔（薄、半透明）
  track(mkMesh(new THREE.BoxGeometry(0.08, 9, 6), 0xd4af37, { opacity: 0.32 }))
  const l3 = track(textSprite('③ 金箔', { color: '#d4af37' })); l3.position.set(0, 5.6, 0)
  // ⑦ 原子核 + 核电场箭头 + 原子壳（卢瑟福模型：核极小、原子很大）
  track(mkMesh(new THREE.SphereGeometry(0.22, 20, 20), 0xE05555, { emissive: 0.9 }))
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0)
    const ar = track(arrowMesh(dir, 1.4, 0xE05555, { radius: 0.02, opacity: 0.4 })); ar.position.copy(dir.clone().multiplyScalar(1.0))
  }
  track(new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0x4A90D9, wireframe: true, transparent: true, opacity: 0.12 })))
  const l7 = track(textSprite('⑦ 原子核（卢瑟福模型）', { color: '#E05555' })); l7.position.set(0, -4.2, 0)
  // ④ 环形荧光屏：72 片瓦，切向摆放
  for (let i = 0; i < TILE_N; i++) {
    const a = (i / TILE_N) * Math.PI * 2
    const tile = track(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.45, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x2b2b44, emissive: 0xF5C542, emissiveIntensity: 0 })))
    tile.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0)
    tile.rotation.z = a + Math.PI / 2
    tiles.push(tile); tileGlow.push(0)
  }
  const l4 = track(textSprite('④ 环形荧光屏 / 探测器', { color: '#F5C542' })); l4.position.set(0, RING_R + 1.4, 0)
  // ⑥ 量角器：半径 9.3 的刻度环，每 15° 一刻度，每 30° 标注（以入射方向 +x 为 0°）
  const tickPts: number[] = []
  for (let deg = 0; deg < 360; deg += 15) {
    const a = (deg * Math.PI) / 180, r0 = 9.3, r1 = deg % 30 === 0 ? 9.9 : 9.6
    tickPts.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0)
  }
  const tickGeo = new THREE.BufferGeometry()
  tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3))
  track(new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: 0x8a8aa0 })))
  track(mkMesh(new THREE.TorusGeometry(9.3, 0.03, 6, 120), 0x8a8aa0, { basic: true, opacity: 0.6 }))
  for (const deg of [0, 30, 60, 90, 120, 150, 180]) {
    for (const s of deg === 0 || deg === 180 ? [1] : [1, -1]) {
      const a = (s * deg * Math.PI) / 180
      const sp = track(textSprite(`${deg}°`, { color: '#8a8aa0', scale: 0.7 })); sp.position.set(Math.cos(a) * 8.4, Math.sin(a) * 8.4, 0)
    }
  }
  const l6 = track(textSprite('⑥ 散射角量角器', { color: '#8a8aa0' })); l6.position.set(-7.5, -8.8, 0)
  // ⑤ 轨迹：主束 b 在 [-3.8, 3.8] 均匀分布 + 2 条近核（b=±0.03）保证出现反弹
  const accel = coulombAccel({ x: 0, y: 0, z: 0 }, Z.value, K_CONST, 1, 1)
  const bs: number[] = []
  for (let i = 0; i < count.value; i++) bs.push(-3.8 + (7.6 * (i + 0.5)) / count.value)
  bs.push(0.03, -0.03)
  bs.forEach((b, i) => {
    let inside = false   // 先进入探测环内部，再穿出环才算击中（起点在环外，不能直接用 |p|>R 判定）
    const pts = rk4Trajectory({ x: SOURCE_X + 1.2, y: b, z: 0 }, { x: v0.value, y: 0, z: 0 }, 0.004, 8, accel,
      (p) => { const r = norm(p); if (r < RING_R - 1) inside = true; return inside && r > RING_R - 0.4 })
    const vf = pts[pts.length - 1].vel
    const theta = (Math.atan2(Math.hypot(vf.y, vf.z), vf.x) * 180) / Math.PI
    const pf = pts[pts.length - 1].pos
    const hitAngle = ((Math.atan2(pf.y, pf.x) * 180) / Math.PI + 360) % 360
    const color = colorByTheta(theta)
    const trail = new GrowingTrail(color, 2400); track(trail.line)
    const particle = track(mkMesh(new THREE.SphereGeometry(0.09, 10, 10), color, { emissive: 0.7 }))
    particle.visible = false
    shots.push({ player: new TrackPlayer(pts, 0.004, trail, particle, 1.3), startAt: i * 0.13, theta, hitAngle, counted: false })
  })
  drawHist()
}

function tick(dt: number) {
  simTime += dt
  for (const s of shots) {
    if (simTime < s.startAt) continue
    if (!s.player.particle.visible && !s.counted) { s.player.particle.visible = true; emitted.value++ }
    if (!s.player.finished) s.player.tick(dt)
    else if (!s.counted) {
      s.counted = true; landed.value++
      const bin = Math.min(BINS - 1, Math.floor(s.theta / 15))
      hist.value[bin]++
      if (s.theta > 90) backscatter.value++
      maxTheta.value = Math.max(maxTheta.value, s.theta)
      const idx = Math.round(s.hitAngle / (360 / TILE_N)) % TILE_N
      tileGlow[idx] = 2.2
      s.player.particle.visible = false
      drawHist()
      if (landed.value === shots.length) {
        playing.value = false
        emit('record', { Z: Z.value, v: v0.value, N: shots.length, hist: [...hist.value], backscatter: backscatter.value, maxTheta: +maxTheta.value.toFixed(1) })
      }
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (tileGlow[i] > 0.01) { tileGlow[i] *= Math.pow(0.05, dt); (tiles[i].material as THREE.MeshStandardMaterial).emissiveIntensity = tileGlow[i] }
  }
}

/** 直方图：模拟计数 vs 卢瑟福曲线（面束：dN/dθ ∝ sinθ / sin⁴(θ/2)，归一到首个非空仓） */
function drawHist() {
  const cv = histRef.value; if (!cv) return
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr }
  const ctx = cv.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#14142a'; ctx.fillRect(0, 0, w, h)
  const L = 8, B = 18, pw = w - L - 8, ph = h - B - 16
  const maxC = Math.max(1, ...hist.value)
  const bw = pw / BINS
  for (let i = 0; i < BINS; i++) {
    const bh = (hist.value[i] / maxC) * ph
    ctx.fillStyle = colorHex(colorByTheta(i * 15 + 7.5)) + 'cc'
    ctx.fillRect(L + i * bw + 1, h - B - bh, bw - 2, bh)
  }
  const ref = hist.value[1] > 0 ? 1 : hist.value.findIndex((c) => c > 0)
  if (ref > 0) {
    const f = (deg: number) => { const t = (deg * Math.PI) / 180; return Math.sin(t) / Math.pow(Math.sin(t / 2), 4) }
    const k = hist.value[ref] / f(ref * 15 + 7.5)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath()
    for (let i = ref; i < BINS; i++) {
      const y = h - B - Math.min(ph, ((k * f(i * 15 + 7.5)) / maxC) * ph)
      i === ref ? ctx.moveTo(L + i * bw + bw / 2, y) : ctx.lineTo(L + i * bw + bw / 2, y)
    }
    ctx.stroke(); ctx.setLineDash([])
  }
  ctx.fillStyle = '#6c6c85'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'
  for (const d of [0, 45, 90, 135, 180]) ctx.fillText(`${d}°`, L + (d / 180) * pw, h - 5)
  ctx.textAlign = 'left'; ctx.fillStyle = '#b0b0cc'; ctx.fillText('散射角分布：柱 = 模拟计数；虚线 = 卢瑟福 ∝ 1/sin⁴(θ/2)', L, 10)
}
function colorHex(c: number) { return '#' + c.toString(16).padStart(6, '0') }

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  if (playing.value) tick(dt)
  three?.controls.update()
  if (three) three.renderer.render(three.scene, three.camera)
  animId = requestAnimationFrame(loop)
}
function togglePlay() { playing.value = !playing.value }
function reset() { playing.value = false; build() }

onMounted(() => {
  if (!containerRef.value) return
  three = setupThree(containerRef.value, [-5, 9, 31], [-3.5, 0, 0])
  build()
  last = performance.now()
  animId = requestAnimationFrame(loop)
})
onUnmounted(() => { cancelAnimationFrame(animId); clearTracked(); three?.dispose() })
const resultText = computed(() =>
  `已发射 ${emitted.value}/${total.value} · 击中 ${landed.value} · 偏转 <10°：${hist.value[0]} · 10°–90°：${hist.value.slice(1, 6).reduce((a, b) => a + b, 0)} · >90° 反弹：${backscatter.value}${maxTheta.value ? ` · 最大偏转 ${maxTheta.value.toFixed(1)}°` : ''}`)
</script>

<template>
  <div class="exp">
    <div class="panel">
      <h3>α粒子散射（卢瑟福）</h3>
      <p class="desc">镭源发出的 α 粒子经狭缝准直射向金箔，环形荧光屏记录每个粒子的落点并闪烁。绝大多数粒子几乎不偏转，少数偏转较大，极少数近乎原路返回——原子的核式结构证据。</p>
      <label>金核电荷数 Z = {{ Z }}<input type="range" min="20" max="100" step="1" v-model.number="Z"></label>
      <label>α 粒子速度 v = {{ v0 }}<input type="range" min="4" max="12" step="0.5" v-model.number="v0"></label>
      <label>主束粒子数 {{ count }}（另加 2 条近核轨迹）<input type="range" min="12" max="48" step="12" v-model.number="count"></label>
      <p class="desc">tan(θ/2) = kZq/(mv²b)：Z 越大、v 越小、瞄准距离 b 越小 → 偏转越大。改参数后按「重置」重建。</p>
      <div class="controls">
        <button class="run" @click="togglePlay">{{ playing ? '⏸ 暂停' : '▶ 播放实验' }}</button>
        <button class="ghost" @click="reset">⟲ 重置</button>
      </div>
      <div class="result">{{ resultText }}</div>
      <canvas ref="histRef" class="hist"></canvas>
      <details class="elements" open>
        <summary>元件清单（7 类）</summary>
        <ul><li v-for="e in ELEMENTS" :key="e">{{ e }}</li></ul>
      </details>
      <p class="hint">🖱 左键旋转 · 滚轮缩放 · 右键平移</p>
    </div>
    <div ref="containerRef" class="canvas3d"></div>
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 320px 1fr; gap: 10px; min-height: 540px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 10px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 10px; line-height: 1.5; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 10px; }
label input { width: 100%; }
.controls { display: flex; gap: 8px; margin-top: 6px; }
.run { flex: 1; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9; border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; }
.ghost { background: transparent; color: #8a8aa0; border: 1px solid #2f2f4a; border-radius: 8px; padding: 9px 12px; cursor: pointer; }
.result { margin-top: 10px; background: #14142a; border-radius: 6px; padding: 9px 10px; font: 12px Consolas, monospace; color: #7fe3b3; line-height: 1.6; }
.hist { display: block; width: 100%; height: 130px; margin-top: 10px; border: 1px solid #2f2f4a; border-radius: 6px; }
.elements { margin-top: 10px; font-size: 12px; color: #8a8aa0; }
.elements summary { cursor: pointer; color: #b0b0cc; }
.elements ul { margin: 6px 0 0 16px; padding: 0; line-height: 1.7; }
.hint { font-size: 11px; color: #565675; margin-top: 8px; }
.canvas3d { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; min-height: 540px; }
.canvas3d :deep(canvas) { display: block; width: 100% !important; height: 100% !important; touch-action: none; }
</style>
