<script setup lang="ts">
/**
 * 观察电容器的充、放电现象（必修三）
 * 仪器：电源 E—开关—电阻 R—电容 C 串联回路，电压表并联在 C 两端；示波器记录 U_C(t)、I(t)
 * 物理：充电 dU/dt=(E−U)/RC，放电 dU/dt=−U/RC；τ=RC。真实时间序列（逐帧积分），非公式单点。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import LabPanel from './apparatus/LabPanel.vue'
import { battery, capacitor, currentDots, fitCanvas, label, makeLoop, meter, resistor, switchSym, wire } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let loop: { stop: () => void } | null = null

const E = 10
const Rk = ref(50)   // kΩ
const Cu = ref(50)   // μF
const tau = computed(() => Rk.value * 1e3 * Cu.value * 1e-6)
const mode = ref<'idle' | 'charge' | 'discharge'>('idle')
const U = ref(0)
const t = ref(0)
const series: { t: number; U: number; I: number }[] = []
const records = ref<{ t: number; U: number }[]>([])
let phase = 0

const I = computed(() => mode.value === 'charge' ? (E - U.value) / (Rk.value * 1e3)
  : mode.value === 'discharge' ? -U.value / (Rk.value * 1e3) : 0)

function start(m: 'charge' | 'discharge') {
  mode.value = m
  t.value = 0
  series.length = 0
}
function resetAll() {
  mode.value = 'idle'; U.value = 0; t.value = 0; series.length = 0
  records.value = []; lab.value?.loadPoints([]); chart?.setOption({ series: [{ data: [] }, { data: [] }] })
}
function sample() {
  if (mode.value === 'idle') return
  records.value.push({ t: +t.value.toFixed(2), U: +U.value.toFixed(3) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.t, y: r.U })))
  emit('record', { rows: records.value, R: Rk.value, C: Cu.value, tau: +tau.value.toFixed(3), mode: mode.value })
}

function step(dt: number) {
  if (mode.value === 'idle') return
  const steps = Math.max(1, Math.ceil(dt / 0.005))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    const dU = mode.value === 'charge' ? (E - U.value) / tau.value : -U.value / tau.value
    U.value += dU * h
    t.value += h
  }
  series.push({ t: t.value, U: U.value, I: I.value * 1e3 })
  if (series.length > 1200) series.shift()
  phase = (phase + dt * Math.min(1, Math.abs(I.value) * 1e4) * 0.4) % 1
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const L = 60, R = w - 70, T0 = 44, B0 = h - 34, midY = (T0 + B0) / 2
  // 回路
  wire(ctx, L, T0, R, T0); wire(ctx, L, B0, R, B0)
  wire(ctx, L, T0, L, midY - 26); wire(ctx, L, midY + 26, L, B0)
  wire(ctx, R, T0, R, midY - 18); wire(ctx, R, midY + 18, R, B0)
  battery(ctx, L, midY)
  label(ctx, `E = ${E} V`, L, B0 + 16)
  switchSym(ctx, L + 90, T0, mode.value !== 'idle')
  label(ctx, mode.value === 'charge' ? '充电位' : mode.value === 'discharge' ? '放电位' : '断开', L + 90, T0 - 18)
  resistor(ctx, (L + R) / 2 + 30, T0, true, `R=${Rk.value}kΩ`)
  capacitor(ctx, R, midY, false, `C=${Cu.value}μF`)
  // 电压表并联在 C 两端
  const vx = R - 60
  wire(ctx, R, midY - 40, vx + 17, midY - 40); wire(ctx, R, midY + 40, vx + 17, midY + 40)
  wire(ctx, vx + 17, midY - 40, vx + 17, midY - 27); wire(ctx, vx + 17, midY + 40, vx + 17, midY + 27)
  ctx.save(); ctx.translate(vx + 17, midY); ctx.rotate(Math.PI / 2); meter(ctx, 0, 0, 'V', U.value, E); ctx.restore()
  // 电流方向动画（充电顺时针，放电反向）
  if (mode.value !== 'idle' && Math.abs(I.value) > 1e-6) {
    const path: [number, number][] = mode.value === 'charge'
      ? [[L, midY - 26], [L, T0], [R, T0], [R, midY - 18]]
      : [[R, midY - 18], [R, T0], [L + 130, T0], [L + 130, T0 + 1]]
    currentDots(ctx, path, phase, 1, mode.value === 'charge' ? '#F5C542' : '#6cd9e8')
  }
  // 极板电荷指示
  const q = Math.min(1, U.value / E)
  ctx.fillStyle = '#E05555'
  for (let i = 0; i < Math.round(q * 6); i++) label(ctx, '+', R - 10, midY - 12 + i * 5, '#E05555', 9)
  ctx.fillStyle = '#4A90D9'
  for (let i = 0; i < Math.round(q * 6); i++) label(ctx, '−', R + 10, midY - 12 + i * 5, '#4A90D9', 9)
  label(ctx, `U_C = ${U.value.toFixed(2)} V　I = ${(I.value * 1e3).toFixed(3)} mA　t = ${t.value.toFixed(2)} s　τ = RC = ${tau.value.toFixed(2)} s`,
    w / 2, h - 12, '#7fe3b3', 12)
}

let frame = 0
onMounted(() => {
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      animation: false, grid: { left: 46, right: 46, top: 26, bottom: 26 },
      legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 2, data: ['U_C (V)', 'I (mA)'] },
      xAxis: { type: 'value', name: 't/s', nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
      yAxis: [
        { type: 'value', name: 'U (V)', min: 0, max: E, nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
        { type: 'value', name: 'I (mA)', nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { show: false } },
      ],
      series: [
        { name: 'U_C (V)', type: 'line', showSymbol: false, lineStyle: { color: '#F5C542', width: 2 }, data: [] },
        { name: 'I (mA)', type: 'line', showSymbol: false, yAxisIndex: 1, lineStyle: { color: '#6cd9e8', width: 1.5 }, data: [] },
      ],
    })
  }
  loop = makeLoop((dt) => {
    step(dt)
    draw()
    if (++frame % 4 === 0 && chart && mode.value !== 'idle') {
      chart.setOption({ series: [
        { data: series.map((s) => [+s.t.toFixed(3), +s.U.toFixed(4)]) },
        { data: series.map((s) => [+s.t.toFixed(3), +s.I.toFixed(4)]) },
      ] })
    }
  })
})
onUnmounted(() => { loop?.stop(); chart?.dispose() })
</script>

<template>
  <LabPanel ref="lab" title="观察电容器的充、放电现象"
    desc="RC 串联回路：开关拨到充电位，电容电压按指数逼近 E；拨到放电位则指数衰减。示波器实时记录 U_C(t) 与 I(t)。"
    formula="充电 U = E(1−e^{−t/RC})　放电 U = U₀e^{−t/RC}　τ = RC"
    :axes="{ x: 't', y: 'U', xUnit: 's', yUnit: 'V' }">
    <template #controls>
      <label>电阻 R = {{ Rk }} kΩ<input type="range" min="10" max="100" step="10" v-model.number="Rk"></label>
      <label>电容 C = {{ Cu }} μF<input type="range" min="20" max="100" step="10" v-model.number="Cu"></label>
      <div class="row">
        <button class="btn" @click="start('charge')">⚡ 充电</button>
        <button class="btn" @click="start('discharge')" :disabled="U < 0.05">🔋 放电</button>
      </div>
      <button class="btn ghost" @click="resetAll">⟲ 复位</button>
      <div class="readout">τ = RC = {{ tau.toFixed(2) }} s
U_C = {{ U.toFixed(2) }} V（{{ (U / E * 100).toFixed(0) }}% E）
t = {{ t.toFixed(2) }} s</div>
      <button class="btn alt" :disabled="mode === 'idle'" @click="sample">📏 采样记录 (t, U)（{{ records.length }}）</button>
      <p class="hint">t = τ 时 U ≈ 63% E；t = 5τ 时视为充满。改 R、C 可比较 τ 的变化。</p>
    </template>
    <div class="stage-col">
      <canvas ref="canvasRef" class="circuit"></canvas>
      <div ref="chartRef" class="scope"></div>
    </div>
  </LabPanel>
</template>

<style scoped>
.stage-col { display: flex; flex-direction: column; height: 100%; }
.circuit { height: 210px !important; flex: 0 0 210px; }
.scope { flex: 1; min-height: 200px; }
</style>
