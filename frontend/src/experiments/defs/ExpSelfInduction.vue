<script setup lang="ts">
/**
 * 探究自感现象（选必二）
 * 仪器：电源—开关—两并联支路（A：灯+电阻；B：灯+电感线圈）。
 * 通电：A 灯立即亮，B 灯因自感电动势阻碍电流增大而缓慢变亮 I=(E/R)(1−e^{−t/τ})，τ=L/R；
 * 断电：A 灯本应立即熄灭，但 B 线圈的自感电动势维持电流经 A 灯回流，A 灯闪亮一下再熄灭。
 * 示波器记录 I_A(t)、I_B(t)；记录 (N, τ) 验证 L ∝ N²。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import LabPanel from './apparatus/LabPanel.vue'
import { battery, currentDots, fitCanvas, inductor, label, lamp, makeLoop, resistor, switchSym, wire } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let loop: { stop: () => void } | null = null

const E = 6, R = 2
const N = ref(400)
const L = computed(() => 0.6 * (N.value / 200) ** 2) // H
const tau = computed(() => L.value / R)
const closed = ref(false)
const IA = ref(0), IB = ref(0)
const t = ref(0)
const series: { t: number; a: number; b: number }[] = []
const records = ref<{ N: number; tau: number }[]>([])
let tClose = 0
let tauMeasured: number | null = null
let phaseA = 0, phaseB = 0

function toggle() {
  closed.value = !closed.value
  if (closed.value) { tClose = t.value; tauMeasured = null }
}
function resetAll() {
  closed.value = false; IA.value = 0; IB.value = 0; t.value = 0; series.length = 0
  tauMeasured = null
  chart?.setOption({ series: [{ data: [] }, { data: [] }] })
}
function record() {
  if (tauMeasured == null) return
  records.value.push({ N: N.value, tau: +tauMeasured.toFixed(3) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.N, y: r.tau })))
  emit('record', { rows: records.value, L: +L.value.toFixed(3), R, tauTheory: +tau.value.toFixed(3) })
}

function step(dt: number) {
  const steps = Math.max(1, Math.ceil(dt / 0.004))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    if (closed.value) {
      IA.value = E / R
      // L dI/dt = E − IR
      IB.value += ((E - IB.value * R) / L.value) * h
    } else {
      // 断电：B 的电流经 A 灯回流，回路总电阻 2R，按 τ'=L/2R 衰减；A 灯电流 = −IB
      IB.value += ((-IB.value * 2 * R) / L.value) * h
      IA.value = -IB.value
      if (Math.abs(IB.value) < 1e-3) { IB.value = 0; IA.value = 0 }
    }
    t.value += h
  }
  if (closed.value && tauMeasured == null && IB.value >= 0.632 * (E / R)) tauMeasured = t.value - tClose
  series.push({ t: t.value, a: IA.value, b: IB.value })
  if (series.length > 1500) series.shift()
  phaseA = (phaseA + dt * Math.min(1.2, Math.abs(IA.value) / 2)) % 1
  phaseB = (phaseB + dt * Math.min(1.2, Math.abs(IB.value) / 2)) % 1
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const left = 50, right = w - 40, top = 36, bot = h - 30
  const xA = left + (right - left) * 0.45, xB = left + (right - left) * 0.78
  const midY = (top + bot) / 2
  // 干路
  wire(ctx, left, top, right, top); wire(ctx, left, bot, right, bot)
  wire(ctx, left, top, left, midY - 26); wire(ctx, left, midY + 26, left, bot)
  battery(ctx, left, midY)
  switchSym(ctx, left + 70, top, closed.value)
  label(ctx, closed.value ? 'S 闭合' : 'S 断开', left + 70, top - 16)
  // 支路 A：灯 + 电阻（竖直）
  wire(ctx, xA, top, xA, midY - 62); lamp(ctx, xA, midY - 38, Math.min(1, (IA.value / (E / R)) ** 2))
  wire(ctx, xA, midY - 14, xA, midY + 4); resistor(ctx, xA, midY + 26, false, `R`)
  wire(ctx, xA, midY + 48, xA, bot)
  label(ctx, 'A 灯', xA + 28, midY - 38, '#b0b0cc', 11)
  // 支路 B：灯 + 电感（竖直）
  wire(ctx, xB, top, xB, midY - 62); lamp(ctx, xB, midY - 38, Math.min(1, (IB.value / (E / R)) ** 2))
  wire(ctx, xB, midY - 14, xB, midY - 4); inductor(ctx, xB, midY + 28, false, `L=${L.value.toFixed(1)}H`)
  wire(ctx, xB, midY + 66, xB, bot)
  label(ctx, 'B 灯', xB + 28, midY - 38, '#b0b0cc', 11)
  // 电流动画
  if (Math.abs(IA.value) > 0.02) {
    const pathA: [number, number][] = closed.value
      ? [[left, midY - 26], [left, top], [xA, top], [xA, bot], [left, bot], [left, midY + 26]]
      : [[xB, bot], [xA, bot], [xA, top], [xB, top]]
    currentDots(ctx, pathA, phaseA, 1, closed.value ? '#F5C542' : '#E05555')
  }
  if (Math.abs(IB.value) > 0.02 && closed.value) {
    currentDots(ctx, [[xA, top], [xB, top], [xB, bot], [xA, bot]], phaseB, 1, '#6cd9e8')
  }
  label(ctx, `I_A = ${IA.value.toFixed(2)} A　I_B = ${IB.value.toFixed(2)} A　τ = L/R = ${tau.value.toFixed(2)} s`
    + (tauMeasured != null ? `　实测 τ ≈ ${tauMeasured.toFixed(2)} s` : ''), w / 2, h - 10, '#7fe3b3', 12)
}

let frame = 0
onMounted(() => {
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      animation: false, grid: { left: 44, right: 20, top: 26, bottom: 26 },
      legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 2, data: ['I_A（灯+电阻）', 'I_B（灯+电感）'] },
      xAxis: { type: 'value', name: 't/s', nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
      yAxis: { type: 'value', name: 'I (A)', nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
      series: [
        { name: 'I_A（灯+电阻）', type: 'line', showSymbol: false, lineStyle: { color: '#F5C542', width: 2 }, data: [] },
        { name: 'I_B（灯+电感）', type: 'line', showSymbol: false, lineStyle: { color: '#6cd9e8', width: 2 }, data: [] },
      ],
    })
  }
  loop = makeLoop((dt) => {
    step(dt)
    draw()
    if (++frame % 4 === 0 && chart) {
      chart.setOption({ series: [
        { data: series.map((s) => [+s.t.toFixed(3), +s.a.toFixed(4)]) },
        { data: series.map((s) => [+s.t.toFixed(3), +s.b.toFixed(4)]) },
      ] })
    }
  })
})
onUnmounted(() => { loop?.stop(); chart?.dispose() })
</script>

<template>
  <LabPanel ref="lab" title="探究自感现象"
    desc="A 灯（电阻）与 B 灯（电感线圈）并联。闭合开关：A 灯立即亮、B 灯缓慢变亮（自感阻碍电流增大）；断开开关：B 线圈的自感电动势让电流经 A 灯回流，A 灯闪亮一下再熄灭。"
    formula="ε自 = −L·dI/dt　通电 I = (E/R)(1−e^{−t/τ})　τ = L/R　L ∝ N²"
    :axes="{ x: 'N', y: 'τ', xUnit: '匝', yUnit: 's' }">
    <template #controls>
      <label>线圈匝数 N = {{ N }}（L = {{ L.toFixed(2) }} H）<input type="range" min="200" max="800" step="100" v-model.number="N"></label>
      <button class="btn" @click="toggle">{{ closed ? '⏻ 断开开关' : '⏻ 闭合开关' }}</button>
      <button class="btn ghost" @click="resetAll">⟲ 复位</button>
      <div class="readout">τ = L/R = {{ tau.toFixed(2) }} s（理论）
I_A = {{ IA.toFixed(2) }} A　I_B = {{ IB.toFixed(2) }} A</div>
      <button class="btn alt" :disabled="tauMeasured == null" @click="record">📏 记录 (N, 实测τ)（{{ records.length }}）</button>
      <p class="hint">闭合后等 B 灯电流升到 63% 即可记录实测 τ；改匝数重做，τ-N 图为抛物线（L ∝ N²）。</p>
    </template>
    <div class="stage-col">
      <canvas ref="canvasRef" class="circuit"></canvas>
      <div ref="chartRef" class="scope"></div>
    </div>
  </LabPanel>
</template>

<style scoped>
.stage-col { display: flex; flex-direction: column; height: 100%; }
.circuit { height: 230px !important; flex: 0 0 230px; }
.scope { flex: 1; min-height: 180px; }
</style>
