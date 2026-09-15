<script setup lang="ts">
/**
 * 高考力学综合·场景 2：小球平抛 + 竖直圆周（纯 2.5D）
 * 过程：①平台平抛 → ②落点处切入竖直圆轨道（能量守恒沿轨道运动）→ ③最高点临界（绳/内轨 N≥0；杆/外轨 v≥0）→ ④绕回底端出轨 / 中途脱离再平抛落地
 * 临界：v_top,min = √(gR)（绳/内轨）或 0（杆）；入轨最低速度 v₁,min = √(5gR) 或 2√(gR)；脱离角 cosθ_d = (2gR − v₁²)/(3gR)
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import LabPanel from '../apparatus/LabPanel.vue'
import SolutionExplainer from '../apparatus/SolutionExplainer.vue'
import { fitCanvas, makeLoop, label } from '../apparatus/circuit'
import { ProcessTimeline, EnergyMomentumTracker, substep } from '../../engine/multiProcess'
import { fmt, type SolutionTemplate } from '../../engine/solution'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const G = 9.8, m = 1

const v0 = ref(4), h = ref(3), R = ref(1), model = ref<'rope' | 'rod'>('rope')
type Phase = 'idle' | 'projectile' | 'loop' | 'exit' | 'fly' | 'landed' | 'swing'
const phase = ref<Phase>('idle')
const t = ref(0)
let x = 0, y = 0, vx = 0, vy = 0, theta = 0, dir = 1, xLand = 0, v1 = 0
const running = ref(false)
const tl = reactive(new ProcessTimeline()) as ProcessTimeline
const tracker = new EnergyMomentumTracker(G)
const trail: [number, number][] = []
const readouts = ref<{ vTop?: number; nTop?: number; thetaDetach?: number }>({})
let loop: { stop: () => void } | null = null

const theory = computed(() => {
  const vv1 = Math.sqrt(v0.value ** 2 + 2 * G * h.value)
  const vTop2 = vv1 ** 2 - 4 * G * R.value
  const need = model.value === 'rope' ? Math.sqrt(5 * G * R.value) : 2 * Math.sqrt(G * R.value)
  const pass = model.value === 'rope' ? vTop2 >= G * R.value : vTop2 >= 0
  const cosD = (2 * G * R.value - vv1 ** 2) / (3 * G * R.value)
  const thetaD = model.value === 'rope' && !pass && cosD >= -1 && cosD <= 1 ? Math.acos(cosD) : NaN
  const hMin = (need ** 2 - v0.value ** 2) / (2 * G)
  return { v1: vv1, vTop: vTop2 >= 0 ? Math.sqrt(vTop2) : NaN, nTop: vTop2 >= 0 ? (m * vTop2) / R.value - m * G : NaN, need, pass, thetaD, hMin,
    xLand: v0.value * Math.sqrt((2 * h.value) / G), tFall: Math.sqrt((2 * h.value) / G) }
})

function init() {
  t.value = 0; trail.length = 0; readouts.value = {}
  x = 0; y = h.value; vx = v0.value; vy = 0; theta = 0; dir = 1
  xLand = theory.value.xLand; v1 = theory.value.v1
  tl.start('① 平抛', '#4A90D9')
  phase.value = 'projectile'
}
function start() { if (phase.value === 'idle' || phase.value === 'landed' || phase.value === 'exit') init(); running.value = true }
function reset() { running.value = false; init(); phase.value = 'idle'; draw() }

function pos(): [number, number] {
  if (phase.value === 'loop' || phase.value === 'swing') return [xLand + R.value * Math.sin(theta), R.value - R.value * Math.cos(theta)]
  return [x, y]
}
function speedAt(th: number) { const v2 = v1 * v1 - 2 * G * R.value * (1 - Math.cos(th)); return v2 > 0 ? Math.sqrt(v2) : 0 }

function step(dt: number) {
  substep(dt, 1 / 800, (d) => {
    if (phase.value === 'idle' || phase.value === 'landed' || phase.value === 'exit') { running.value = false; return false }
    t.value += d
    if (phase.value === 'projectile' || phase.value === 'fly') {
      x += vx * d; vy -= G * d; y += vy * d
      if (y <= 0) {
        if (phase.value === 'projectile') {
          // 落点处切入圆轨道底端：速率由能量守恒 v₁ = √(v₀²+2gh)，方向变为切向（水平）
          y = 0; phase.value = 'loop'; theta = 0; dir = 1
          tl.switchTo('② 圆轨道（上升）', '#F5C542', t.value, `t=${fmt(t.value)}s 切入轨道底端 v₁=${fmt(v1)} m/s`)
        } else { y = 0; phase.value = 'landed'; tl.switchTo('落地', '#8a8aa0', t.value, `t=${fmt(t.value)}s 落地 x=${fmt(x)} m`); running.value = false; return false }
      }
    } else if (phase.value === 'loop' || phase.value === 'swing') {
      const v = speedAt(theta)
      const N = (m * v * v) / R.value + m * G * Math.cos(theta)
      if (model.value === 'rope' && N < 0) {
        // 绳/内轨：N<0 → 脱离，做斜抛
        const p = pos(); x = p[0]; y = p[1]; vx = v * Math.cos(theta) * dir; vy = v * Math.sin(theta) * dir
        readouts.value.thetaDetach = (theta * 180) / Math.PI
        phase.value = 'fly'
        tl.switchTo('④ 脱离轨道做斜抛', '#E05555', t.value, `t=${fmt(t.value)}s 在 θ=${fmt((theta * 180) / Math.PI, 1)}° 处 N<0 脱离（v=${fmt(v)} m/s）`)
        return
      }
      if (v < 1e-4 && theta < Math.PI) {
        // 杆/外轨：速度减到零 → 折返摆动
        dir = -dir; phase.value = 'swing'
        if (tl.current?.name !== '④ 未过最高点，折返摆动') tl.switchTo('④ 未过最高点，折返摆动', '#b06ce6', t.value, `t=${fmt(t.value)}s 在 θ=${fmt((theta * 180) / Math.PI, 1)}° 处速度为零，折返`)
      }
      const prev = theta
      theta += dir * (Math.max(v, 1e-3) / R.value) * d
      if (dir > 0 && prev < Math.PI && theta >= Math.PI) {
        readouts.value.vTop = speedAt(Math.PI); readouts.value.nTop = (m * speedAt(Math.PI) ** 2) / R.value - m * G
        tl.switchTo('③ 过最高点 → 下降', '#3ecf8e', t.value, `t=${fmt(t.value)}s 最高点 v=${fmt(readouts.value.vTop)} m/s，N=${fmt(readouts.value.nTop)} N`)
      }
      if (theta >= 2 * Math.PI) {
        const p = pos(); x = xLand; y = 0; vx = v1; vy = 0; phase.value = 'exit'
        tl.switchTo('⑤ 绕回底端出轨', '#8a8aa0', t.value, `t=${fmt(t.value)}s 完成一周，出轨速度 ${fmt(v1)} m/s`)
        void p; running.value = false
        emit('record', { event: 'loop-complete', ...readouts.value, theory: theory.value })
        return false
      }
      if (phase.value === 'swing' && theta <= 0) { theta = 0; dir = 1; phase.value = 'exit'; x = xLand; y = 0; tl.switchTo('⑤ 摆回底端', '#8a8aa0', t.value); running.value = false; return false }
    }
    tl.advance(t.value)
    const p = pos()
    if (!trail.length || Math.hypot(p[0] - trail[trail.length - 1][0], p[1] - trail[trail.length - 1][1]) > 0.02) trail.push(p)
  })
}

function draw() {
  const cv = canvasRef.value; if (!cv) return
  const { ctx, w, h: H } = fitCanvas(cv)
  ctx.clearRect(0, 0, w, H); ctx.fillStyle = '#14142a'; ctx.fillRect(0, 0, w, H)
  const spanX = Math.max(8, theory.value.xLand + 2 * R.value + 4), spanY = Math.max(h.value + 1, 2 * R.value + 1)
  const PX = Math.min((w - 60) / spanX, (H - 90) / spanY)
  const ox = 30, groundY = H - 60
  const X = (wx: number) => ox + (wx + 1) * PX, Y = (wy: number) => groundY - wy * PX
  // 地面与平台
  ctx.fillStyle = '#23233a'; ctx.fillRect(0, groundY, w, 6)
  ctx.fillStyle = '#3a3a5e'; ctx.fillRect(X(-1), Y(h.value), PX, h.value * PX)
  label(ctx, `平台 h=${h.value} m`, X(-0.5), Y(h.value) - 10, '#8a8aa0', 11)
  // 圆轨道
  const cx = X(xLand), cy = Y(R.value)
  ctx.strokeStyle = model.value === 'rope' ? '#F5C542' : '#b06ce6'; ctx.lineWidth = 4
  ctx.beginPath(); ctx.arc(cx, cy, R.value * PX, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = '#2f2f4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R.value * PX + 6, 0, Math.PI * 2); ctx.stroke()
  label(ctx, `${model.value === 'rope' ? '绳/内轨（N≥0）' : '杆/外轨（v≥0）'} R=${R.value} m`, cx, cy - R.value * PX - 14, '#8a8aa0', 11)
  ctx.fillStyle = '#565675'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill()
  // 轨迹
  if (trail.length > 1) { ctx.strokeStyle = 'rgba(74,144,217,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); trail.forEach(([tx, ty], i) => (i ? ctx.lineTo(X(tx), Y(ty)) : ctx.moveTo(X(tx), Y(ty)))); ctx.stroke() }
  // 小球 + 速度/支持力
  const p = pos()
  const bx = X(p[0]), by = Y(p[1])
  ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill()
  let vxx = vx, vyy = vy
  if (phase.value === 'loop' || phase.value === 'swing') { const v = speedAt(theta); vxx = v * Math.cos(theta) * dir; vyy = v * Math.sin(theta) * dir
    const N = (m * v * v) / R.value + m * G * Math.cos(theta)
    const nx = -Math.sin(theta), ny = Math.cos(theta)  // 指向圆心
    ctx.strokeStyle = N >= 0 ? '#3ecf8e' : '#E05555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + nx * Math.min(60, Math.abs(N) * 4), by - ny * Math.min(60, Math.abs(N) * 4)); ctx.stroke()
    label(ctx, `N=${fmt(N)} N`, bx + nx * 40, by - ny * 40 - 10, N >= 0 ? '#3ecf8e' : '#E05555', 11)
  }
  const sp = Math.hypot(vxx, vyy)
  if (sp > 0.01) { const k = Math.min(70, sp * 10) / sp; ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + vxx * k, by - vyy * k); ctx.stroke(); label(ctx, `v=${fmt(sp)}`, bx + vxx * k, by - vyy * k - 10, '#4A90D9', 11) }
  // 时间轴 + 能量
  tl.draw(ctx, 60, H - 30, w - 120, 10)
  label(ctx, `多过程时间轴 t=${fmt(t.value)} s：${tl.segments.map((s) => s.name).join(' → ')}`, w / 2, H - 40, '#8a8aa0', 11)
  const body = { name: '球', m, x: p[0], y: p[1], vx: vxx, vy: vyy }
  const tot = tracker.totals([body])
  const E0 = 0.5 * m * v0.value ** 2 + m * G * h.value
  tracker.drawBars(ctx, 16, 16, [{ name: '动能', value: tot.Ek, color: '#F5C542' }, { name: '重力势能', value: tot.Ep, color: '#4A90D9' }, { name: '机械能', value: tot.Ek + tot.Ep, color: '#3ecf8e' }], E0)
}

onMounted(() => { init(); phase.value = 'idle'; loop = makeLoop((dt) => { if (running.value) step(dt); draw() }) })
onUnmounted(() => loop?.stop())

const solution = computed<SolutionTemplate>(() => {
  const th = theory.value, rope = model.value === 'rope'
  return {
    problemType: '平抛 + 竖直圆周组合，求最高点最低速度 / 能否过最高点',
    hints: ['把运动分成三个过程：平抛 → 沿圆轨道运动 → 最高点', '平抛只受重力；圆轨道上受重力和轨道弹力（或绳拉力）', '想清楚“最高点”对绳/内轨和杆/外轨的临界条件有何不同', '用机械能守恒把入轨速度和最高点速度联系起来'],
    processes: ['过程一：小球从平台边缘水平抛出，做平抛运动', '过程二：落到轨道底端切入竖直圆轨道，沿轨道运动', '过程三：到达最高点（临界判断）；之后下降绕回底端，或中途脱离'],
    forces: ['过程一：只受重力 mg', '过程二：重力 mg + 轨道弹力 N（指向圆心，绳/内轨只能提供指向圆心的力）', '过程三：最高点 mg + N 共同提供向心力'],
    laws: ['过程一：平抛——水平匀速、竖直自由落体', '过程二：机械能守恒（轨道光滑）', '过程三：牛顿第二定律 + 临界条件'],
    critical: [rope ? '绳/内轨：最高点 N ≥ 0 → v_top ≥ √(gR)' : '杆/外轨：最高点 v_top ≥ 0（杆可提供支持力）',
      rope ? '对应入轨最低速度 v₁,min = √(5gR)' : '对应入轨最低速度 v₁,min = 2√(gR)',
      rope ? '若 v₁ < √(5gR)：在上半圆 N=0 处脱离，cosθ_d = (2gR − v₁²)/(3gR)' : '若 v₁ < 2√(gR)：速度减到零后折返摆动，不脱离'],
    derivation: ['平抛：h = ½gt²，x = v₀t → t = √(2h/g)，x_落 = v₀√(2h/g)', '入轨速率（能量守恒）：v₁ = √(v₀² + 2gh)', '最高点：mg + N = mv²/R；能量：½mv₁² = ½mv_top² + mg·2R', rope ? '临界 N=0 → v_top,min = √(gR) → v₁,min = √(5gR)' : '临界 v_top=0 → v₁,min = 2√(gR)', '反解平台高度：h_min = (v₁,min² − v₀²)/(2g)'],
    numeric: [`t_落 = √(2·${h.value}/9.8) = ${fmt(th.tFall, 3)} s，x_落 = ${fmt(th.xLand)} m`, `v₁ = √(${v0.value}² + 2·9.8·${h.value}) = ${fmt(th.v1)} m/s`,
      `v₁,min = ${fmt(th.need)} m/s → ${th.pass ? '能过最高点 ✓' : '不能过最高点 ✗'}`,
      Number.isFinite(th.vTop) ? `最高点 v_top = √(v₁² − 4gR) = ${fmt(th.vTop)} m/s，N_top = mv²/R − mg = ${fmt(th.nTop)} N` : '最高点 v_top² < 0：到不了最高点',
      Number.isFinite(th.thetaD) ? `脱离角 θ_d = ${fmt((th.thetaD * 180) / Math.PI, 1)}°` : (rope ? '不脱离' : '杆模型不存在脱离'), `要恰好过最高点需 h_min = ${fmt(th.hMin)} m（当前 h=${h.value} m）`],
    pitfalls: ['混淆绳临界（v_top≥√(gR)）与杆临界（v_top≥0）', '忘记平抛高度 h 也贡献入轨速度（v₁ 不是 v₀）', '能量守恒漏掉 2R 的重力势能', '脱离点不在最高点：N=0 的位置在上半圆某处'],
    similar: ['过山车最高点', '水流星（桶绕竖直圆）', '绳系小球在竖直面内做圆周运动', '内轨/外轨过山车'],
    competition: ['变半径轨道：向心加速度随曲率变化', '非匀速圆周：切向加速度 a_t = g sinθ 的积分求时间', '微元法求圆周上的时间分布'],
  }
})
</script>

<template>
  <LabPanel title="小球平抛 + 竖直圆周（绳/内轨 vs 杆/外轨临界）" :graph="false"
    desc="小球从高 h 的平台以 v₀ 平抛，落点处切入半径 R 的竖直圆轨道。绳/内轨模型要求最高点 N≥0（v_top≥√(gR)），杆/外轨只要求 v_top≥0。观察能否过最高点、在哪里脱离；改 v₀、h、R 找临界。"
    formula="v₁=√(v₀²+2gh)　mg+N=mv²/R　v_top,min=√(gR)（绳） / 0（杆）　v₁,min=√(5gR) / 2√(gR)">
    <template #controls>
      <label>轨道模型 <select v-model="model" :disabled="running"><option value="rope">绳 / 内轨（N ≥ 0）</option><option value="rod">杆 / 外轨（v ≥ 0）</option></select></label>
      <label>平抛初速 v₀ = {{ v0.toFixed(1) }} m/s<input type="range" min="1" max="10" step="0.5" v-model.number="v0" :disabled="running"></label>
      <label>平台高度 h = {{ h.toFixed(1) }} m<input type="range" min="0.5" max="8" step="0.1" v-model.number="h" :disabled="running"></label>
      <label>轨道半径 R = {{ R.toFixed(2) }} m<input type="range" min="0.5" max="3" step="0.05" v-model.number="R" :disabled="running"></label>
      <div class="readout">v₁ = {{ fmt(theory.v1) }} m/s（需 ≥ {{ fmt(theory.need) }}）→ {{ theory.pass ? '✔ 能过最高点' : '✗ 过不了最高点' }}
{{ Number.isFinite(theory.vTop) ? `v_top = ${fmt(theory.vTop)} m/s，N_top = ${fmt(theory.nTop)} N` : '到不了最高点' }}
{{ Number.isFinite(theory.thetaD) ? `脱离角 θ_d = ${fmt(theory.thetaD * 180 / Math.PI, 1)}°` : '' }}
h_min = {{ fmt(theory.hMin) }} m</div>
      <div class="row">
        <button class="btn" @click="running ? (running = false) : start()">{{ running ? '⏸ 暂停' : '▶ 开始' }}</button>
        <button class="btn ghost" @click="reset">⟲ 重置</button>
      </div>
      <button class="btn alt" :disabled="phase === 'idle'" @click="emit('record', { ...readouts, theory, model, v0, h, R })">📏 记录当前数据</button>
      <div v-if="tl.events.length" class="readout" style="color:#b0b0cc"><div v-for="(e, i) in tl.events" :key="i">• {{ e.text }}</div></div>
      <SolutionExplainer :template="solution" title="平抛 + 竖直圆周" />
    </template>
    <canvas ref="canvasRef" class="scene"></canvas>
  </LabPanel>
</template>

<style scoped>
.scene { display: block; width: 100%; height: 100%; }
</style>
