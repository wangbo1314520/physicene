<script setup lang="ts">
/**
 * 高考电磁综合·场景 9：加速电场 → 速度筛选器 → 偏转磁场（纯 3D）
 * 区域Ⅰ x∈[-14,-9] 加速电场 E₁=U/d（+x）；区域Ⅱ x∈[-7,-1] 正交 E（−y）与 B（−z），v=E/B 才能直线通过，否则撞极板；
 * 区域Ⅲ x∈[1,13] 匀强磁场 B₃（+z）：半圆 r=mv/(qB₃)，打到 x=1 处的照相底片，落点距入口 2r（质谱仪原型）
 * 单位归一化：q=1 C，m=1 kg（可调 q/m）
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import * as THREE from 'three'
import { rk4Trajectory, lorentzAccel, type Vec3 } from '../../renderers/canvas3d/FieldEngine'
import { mkMesh, arrowMesh, GrowingTrail, TrackPlayer, makeTracker, textSprite, setupThree } from '../../renderers/canvas3d/three-kit'
import { ProcessTimeline } from '../../engine/multiProcess'
import { fmt, type SolutionTemplate } from '../../engine/solution'
import SolutionExplainer from '../apparatus/SolutionExplainer.vue'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const containerRef = ref<HTMLDivElement | null>(null)
const U = ref(8), E2 = ref(8), B2 = ref(2), B3 = ref(1), qm = ref(1)
const playing = ref(false)
const tl = reactive(new ProcessTimeline()) as ProcessTimeline
const outcome = ref('')

const R1 = { x0: -14, x1: -9 }, R2 = { x0: -7, x1: -1, gap: 1.5 }, R3 = { x0: 1, x1: 13, yMin: -9 }
let three: ReturnType<typeof setupThree> | null = null
const { track, clearTracked } = makeTracker(() => three?.scene ?? null)
let animId = 0, last = 0
let player: TrackPlayer | null = null
let pts: { t: number; pos: Vec3; vel: Vec3 }[] = []
let lastIdx = 0

const theory = computed(() => {
  const v = Math.sqrt(2 * qm.value * U.value)
  const vSel = E2.value / B2.value
  const Ueq = (E2.value ** 2) / (2 * qm.value * B2.value ** 2)
  const r = v / (qm.value * B3.value)
  return { v, vSel, Ueq, r, pass: Math.abs(v - vSel) / vSel < 0.01, hit: 2 * r <= -R3.yMin }
})

function region(p: Vec3): 0 | 1 | 2 | 3 {
  if (p.x >= R1.x0 && p.x < R1.x1) return 1
  if (p.x >= R2.x0 && p.x < R2.x1) return 2
  if (p.x >= R3.x0 && p.x < R3.x1) return 3
  return 0
}
function build() {
  clearTracked(); tl.start('Ⅰ 加速电场：静止释放', '#3ecf8e'); outcome.value = ''; lastIdx = 0
  const box = (x0: number, x1: number, hy: number, color: number) => { const b = track(mkMesh(new THREE.BoxGeometry(x1 - x0, hy * 2, 3), color, { opacity: 0.12 })); b.position.set((x0 + x1) / 2, 0, 0); return b }
  // Ⅰ 加速电场：两极板 + E 箭头
  box(R1.x0, R1.x1, 2, 0x3ecf8e)
  for (const x of [R1.x0, R1.x1]) { const pl = track(mkMesh(new THREE.BoxGeometry(0.15, 4.2, 3.2), 0x8a8aa0)); pl.position.set(x, 0, 0) }
  for (let k = -1; k <= 1; k++) { const a = track(arrowMesh(new THREE.Vector3(1, 0, 0), 4.2, 0x3ecf8e, { opacity: 0.6, radius: 0.04 })); a.position.set((R1.x0 + R1.x1) / 2, k * 1.2, 0) }
  const l1 = track(textSprite(`Ⅰ 加速电场 U=${U.value} V`, { color: '#3ecf8e' })); l1.position.set((R1.x0 + R1.x1) / 2, 3.2, 0)
  // Ⅱ 速度筛选器：上下极板 + E(−y) + B(−z)
  box(R2.x0, R2.x1, R2.gap, 0xF5C542)
  for (const s of [-1, 1]) { const pl = track(mkMesh(new THREE.BoxGeometry(R2.x1 - R2.x0, 0.12, 3.2), 0x8a8aa0)); pl.position.set((R2.x0 + R2.x1) / 2, s * R2.gap, 0) }
  for (let k = 0; k < 4; k++) {
    const a = track(arrowMesh(new THREE.Vector3(0, -1, 0), 2.4, 0x3ecf8e, { opacity: 0.6, radius: 0.035 })); a.position.set(R2.x0 + 0.8 + k * 1.5, 0, 0.9)
    const b = track(arrowMesh(new THREE.Vector3(0, 0, -1), 2.2, 0xb06ce6, { opacity: 0.6, radius: 0.035 })); b.position.set(R2.x0 + 1.5 + k * 1.5, 0.6, 0)
  }
  const l2 = track(textSprite(`Ⅱ 速度筛选器 E=${E2.value} B=${B2.value}`, { color: '#F5C542' })); l2.position.set((R2.x0 + R2.x1) / 2, 3.2, 0)
  // Ⅲ 偏转磁场：B(+z) 阵列 + 底片
  const b3 = track(mkMesh(new THREE.BoxGeometry(R3.x1 - R3.x0, -R3.yMin + 1, 3), 0xb06ce6, { opacity: 0.1 })); b3.position.set((R3.x0 + R3.x1) / 2, (R3.yMin + 1) / 2, 0)
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const a = track(arrowMesh(new THREE.Vector3(0, 0, 1), 2.2, 0xb06ce6, { opacity: 0.5, radius: 0.03 })); a.position.set(R3.x0 + 1 + i * 2.2, 0.2 - j * 2.4, 0) }
  const plate = track(mkMesh(new THREE.BoxGeometry(0.15, -R3.yMin, 3.2), 0xd4af37, { opacity: 0.9 })); plate.position.set(R3.x0 - 0.1, R3.yMin / 2, 0)
  const l3 = track(textSprite(`Ⅲ 磁场 B₃=${B3.value} T`, { color: '#b06ce6' })); l3.position.set((R3.x0 + R3.x1) / 2, 3.2, 0)
  const l4 = track(textSprite('照相底片 / 荧光屏', { color: '#d4af37', scale: 0.8 })); l4.position.set(R3.x0 - 1.6, R3.yMin / 2, 0)
  // 轨迹：分段场 RK4
  const q = qm.value, mm = 1
  const aAcc = lorentzAccel({ x: U.value / (R1.x1 - R1.x0), y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, q, mm)
  const aSel = lorentzAccel({ x: 0, y: -E2.value, z: 0 }, { x: 0, y: 0, z: -B2.value }, q, mm)
  const aMag = lorentzAccel({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: B3.value }, q, mm)
  const accel = (p: Vec3, v: Vec3, t: number): Vec3 => { const r = region(p); return r === 1 ? aAcc(p, v, t) : r === 2 ? aSel(p, v, t) : r === 3 ? aMag(p, v, t) : { x: 0, y: 0, z: 0 } }
  let blocked = false, hitPlate = false
  pts = rk4Trajectory({ x: R1.x0 + 0.1, y: 0, z: 0 }, { x: 0.05, y: 0, z: 0 }, 0.002, 60, accel, (p, v) => {
    if (region(p) === 2 && Math.abs(p.y) >= R2.gap) { blocked = true; return true }
    if (p.x <= R3.x0 + 0.1 && p.x >= R3.x0 - 0.3 && v.x < 0 && p.y < -0.05) { hitPlate = true; return true }
    return p.x > R3.x1 + 1 || p.y < R3.yMin - 0.5 || p.y > 6 || p.x < R1.x0 - 1
  })
  const trail = new GrowingTrail(0xF5C542, 40000); track(trail.line)
  const particle = track(mkMesh(new THREE.SphereGeometry(0.16, 16, 16), 0xF5C542, { emissive: 0.8 }))
  const total = pts[pts.length - 1].t
  player = new TrackPlayer(pts, 0.002, trail, particle, Math.max(0.5, total / 7))
  const th = theory.value
  outcome.value = blocked ? `v=${fmt(th.v)} ≠ E/B=${fmt(th.vSel)}：粒子在筛选器内偏转，撞到极板被拦截` : hitPlate
    ? `通过筛选器（v=E/B=${fmt(th.vSel)} m/s）→ 磁场中半圆 r=${fmt(th.r)} m → 打到底片，距入口 2r=${fmt(2 * th.r)} m`
    : `通过筛选器后在磁场中偏转，半径 r=${fmt(th.r)} m 过大（2r > 底片长度），飞出区域`
  emit('record', { U: U.value, E: E2.value, B: B2.value, B3: B3.value, qm: qm.value, ...th, blocked, hitPlate })
}
function tick(dt: number) {
  if (!player || player.finished) { if (player?.finished) playing.value = false; return }
  const prevRegion = region(pts[lastIdx].pos)
  player.tick(dt)
  lastIdx = player.index
  const p = pts[lastIdx]
  const r = region(p.pos)
  if (r !== prevRegion) {
    const name = r === 2 ? 'Ⅱ 速度筛选器：qE 与 qvB 竞争' : r === 3 ? 'Ⅲ 磁场：洛伦兹力提供向心力，半圆' : r === 0 && prevRegion === 3 ? '飞出磁场' : '区间漂移（无场，匀速）'
    tl.switchTo(name, r === 2 ? '#F5C542' : r === 3 ? '#b06ce6' : '#8a8aa0', p.t, `t=${fmt(p.t, 3)}s 进入${name}，v=${fmt(Math.hypot(p.vel.x, p.vel.y))} m/s`)
  }
  tl.advance(p.t)
  if (player.finished) tl.log(p.t, outcome.value)
}
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  if (playing.value) tick(dt)
  three?.controls.update(); if (three) three.renderer.render(three.scene, three.camera)
  animId = requestAnimationFrame(loop)
}
function reset() { playing.value = false; build() }
onMounted(() => { if (!containerRef.value) return; three = setupThree(containerRef.value, [0, 8, 26], [-1, -2, 0]); build(); last = performance.now(); animId = requestAnimationFrame(loop) })
onUnmounted(() => { cancelAnimationFrame(animId); clearTracked(); three?.dispose() })

const solution = computed<SolutionTemplate>(() => {
  const th = theory.value
  return {
    problemType: '带电粒子多过程：加速电场 → 速度筛选器 → 匀强磁场（质谱仪原型）',
    hints: ['三个区域三个过程，逐个写规律', '加速电场只做功不改方向：用动能定理', '筛选器里电场力与洛伦兹力反向：能直线通过的条件是什么？', '磁场中只有洛伦兹力：它提供向心力，半径与什么有关？'],
    processes: ['过程一：静止释放，在加速电场中被加速到 v', '过程二：进入正交电磁场（速度筛选器），只有 v=E/B 的粒子直线通过', '过程三：进入匀强磁场做匀速圆周运动，半圆后打到底片'],
    forces: ['过程一：电场力 qE₁（沿 +x）', '过程二：电场力 qE（−y）+ 洛伦兹力 qvB（+y）', '过程三：洛伦兹力 qvB₃（始终垂直速度）'],
    laws: ['过程一：动能定理 qU = ½mv²', '过程二：受力平衡 qE = qvB → v = E/B', '过程三：洛伦兹力提供向心力 qvB₃ = mv²/r'],
    critical: ['筛选器：只有 v = E/B 的粒子通过；v 大 → 洛伦兹力占优向 +y 偏；v 小 → 电场力占优向 −y 偏', '磁场：r = mv/(qB₃)，底片长度 ≥ 2r 才能接收到'],
    derivation: ['v = √(2qU/m)', 'v_通过 = E/B', '联立：√(2qU/m) = E/B → U = mE²/(2qB²)', 'r = mv/(qB₃)，落点距入口 2r'],
    numeric: [`v = √(2·${qm.value}·${U.value}) = ${fmt(th.v)} m/s`, `E/B = ${E2.value}/${B2.value} = ${fmt(th.vSel)} m/s → ${th.pass ? '匹配，直线通过 ✓' : '不匹配，将被极板拦截 ✗'}`,
      `恰好通过所需 U = mE²/(2qB²) = ${fmt(th.Ueq)} V（当前 ${U.value} V）`, `r = mv/(qB₃) = ${fmt(th.r)} m，落点 2r = ${fmt(2 * th.r)} m（底片 ${-R3.yMin} m，${th.hit ? '可接收' : '超出'}）`],
    pitfalls: ['筛选器 E、B 方向搞错，导致两力同向', '洛伦兹力方向用左手定则时忘记电荷正负', '把筛选器当成“加速器”——它只筛速度不改速度大小', '磁场中周期 T=2πm/(qB) 与速度无关'],
    similar: ['质谱仪测同位素质量', '回旋加速器', '磁流体发电机', '霍尔效应'],
    competition: ['非均匀磁场中的漂移', '相对论修正 m=γm₀', '多级加速与同步'],
  }
})
</script>

<template>
  <div class="exp">
    <div class="panel">
      <h3>加速电场 → 速度筛选器 → 磁场（质谱仪原型）</h3>
      <p class="desc">粒子（q/m 归一化）在区域Ⅰ被电压 U 加速，进入区域Ⅱ正交电磁场：只有 v=E/B 的粒子直线通过，否则撞极板；通过后进入区域Ⅲ匀强磁场做半圆运动，打到底片上，落点距入口 2r。</p>
      <label>加速电压 U = {{ U }} V<input type="range" min="2" max="50" step="1" v-model.number="U"></label>
      <label>筛选器电场 E = {{ E2 }} N/C<input type="range" min="2" max="40" step="1" v-model.number="E2"></label>
      <label>筛选器磁场 B = {{ B2.toFixed(1) }} T<input type="range" min="0.5" max="5" step="0.1" v-model.number="B2"></label>
      <label>偏转磁场 B₃ = {{ B3.toFixed(1) }} T<input type="range" min="0.3" max="4" step="0.1" v-model.number="B3"></label>
      <label>比荷 q/m = {{ qm.toFixed(1) }}<input type="range" min="0.5" max="2" step="0.1" v-model.number="qm"></label>
      <div class="result">v = {{ fmt(theory.v) }} m/s · E/B = {{ fmt(theory.vSel) }} m/s · {{ theory.pass ? '✓ 可通过' : '✗ 被拦截' }} · r = {{ fmt(theory.r) }} m
{{ outcome }}</div>
      <div class="controls">
        <button class="run" @click="playing = !playing">{{ playing ? '⏸ 暂停' : '▶ 播放实验' }}</button>
        <button class="ghost" @click="reset">⟲ 重置（按新参数）</button>
      </div>
      <div v-if="tl.events.length" class="result" style="color:#b0b0cc"><div v-for="(e, i) in tl.events" :key="i">• {{ e.text }}</div></div>
      <SolutionExplainer :template="solution" title="加速 → 筛选 → 磁场" />
      <p class="hint">🖱 左键旋转 · 滚轮缩放 · 右键平移</p>
    </div>
    <div ref="containerRef" class="canvas3d"></div>
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 330px 1fr; gap: 10px; min-height: 560px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 8px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 10px; line-height: 1.5; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 8px; }
label input { width: 100%; }
.controls { display: flex; gap: 8px; margin-top: 6px; }
.run { flex: 1; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9; border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; }
.ghost { background: transparent; color: #8a8aa0; border: 1px solid #2f2f4a; border-radius: 8px; padding: 9px 12px; cursor: pointer; }
.result { margin-top: 8px; background: #14142a; border-radius: 6px; padding: 9px 10px; font: 12px Consolas, monospace; color: #7fe3b3; line-height: 1.6; white-space: pre-line; }
.hint { font-size: 11px; color: #565675; margin-top: 8px; }
.canvas3d { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; min-height: 560px; }
.canvas3d :deep(canvas) { display: block; width: 100% !important; height: 100% !important; touch-action: none; }
</style>
