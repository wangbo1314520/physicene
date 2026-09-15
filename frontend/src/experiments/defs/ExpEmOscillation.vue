<script setup lang="ts">
/**
 * 观察电磁振荡（选必二）
 * LC 回路：电容器先充电，接通后电荷 q 与电流 i 周期性变化，电场能与磁场能相互转化。
 * q'' = −q/(LC)，T = 2π√(LC)。画布：电容极板电荷、线圈磁场线随 i 变化；示波器 q(t)/i(t)；能量条实时交换。
 * 物理周期为毫秒级，动画按 1:1000 慢放。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import LabPanel from './apparatus/LabPanel.vue'
import { capacitor, currentDots, fitCanvas, inductor, label, makeLoop, switchSym, wire } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let loop: { stop: () => void } | null = null

const Lmh = ref(100)   // mH
const Cuf = ref(50)    // μF
const Q0 = 1e-3        // 初始电荷 C
const L = computed(() => Lmh.value * 1e-3)
const C = computed(() => Cuf.value * 1e-6)
const T = computed(() => 2 * Math.PI * Math.sqrt(L.value * C.value)) // s
const playing = ref(false)
const q = ref(Q0), i = ref(0)
let tPhys = 0
const SLOW = 400 // 慢放倍数（T≈14ms → 约 5.6s 一个周期）
const series: { t: number; q: number; i: number }[] = []
const records = ref<{ sqrtLC: number; T: number }[]>([])
let phase = 0

const eE = computed(() => (q.value ** 2) / (2 * C.value))
const eB = computed(() => 0.5 * L.value * i.value ** 2)
const eTot = computed(() => Q0 ** 2 / (2 * C.value))

function reset() { q.value = Q0; i.value = 0; tPhys = 0; series.length = 0; playing.value = false }
function record() {
  records.value.push({ sqrtLC: +Math.sqrt(L.value * C.value).toExponential(3), T: +(T.value * 1e3).toFixed(3) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: +(r.sqrtLC * 1e3).toFixed(4), y: r.T })))
  emit('record', { rows: records.value, L_mH: Lmh.value, C_uF: Cuf.value, T_ms: +(T.value * 1e3).toFixed(3) })
}

function step(dt: number) {
  if (!playing.value) return
  const dtp = dt / SLOW
  const steps = 20
  const h = dtp / steps
  for (let k = 0; k < steps; k++) {
    // 半隐式辛积分：i = dq/dt，di/dt = −q/(LC)
    i.value += (-q.value / (L.value * C.value)) * h
    q.value += i.value * h
    tPhys += h
  }
  series.push({ t: tPhys * 1e3, q: q.value, i: i.value })
  if (series.length > 900) series.shift()
  phase = (phase + dt * Math.abs(i.value) * 3) % 1
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const left = 60, right = w * 0.55, top = 30, bot = h - 30, midY = (top + bot) / 2
  wire(ctx, left, top, right, top); wire(ctx, left, bot, right, bot)
  wire(ctx, left, top, left, midY - 18); wire(ctx, left, midY + 18, left, bot)
  wire(ctx, right, top, right, midY - 38); wire(ctx, right, midY + 38, right, bot)
  capacitor(ctx, left, midY, false, `C=${Cuf.value}μF`)
  inductor(ctx, right, midY, false, `L=${Lmh.value}mH`)
  switchSym(ctx, (left + right) / 2, top, playing.value)
  // 极板电荷
  const qn = Math.round(Math.abs(q.value) / Q0 * 6)
  for (let k = 0; k < qn; k++) {
    label(ctx, q.value > 0 ? '+' : '−', left - 14, midY - 14 + k * 5, q.value > 0 ? '#E05555' : '#4A90D9', 9)
    label(ctx, q.value > 0 ? '−' : '+', left + 14, midY - 14 + k * 5, q.value > 0 ? '#4A90D9' : '#E05555', 9)
  }
  // 线圈磁场线（数量 ∝ |i|）
  const bn = Math.round(Math.abs(i.value) / (Q0 / Math.sqrt(L.value * C.value)) * 4)
  ctx.strokeStyle = 'rgba(176,108,230,0.7)'; ctx.lineWidth = 1.2
  for (let k = 0; k < bn; k++) {
    const rr = 26 + k * 9
    ctx.beginPath(); ctx.ellipse(right, midY, rr * 0.5, rr, 0, 0, Math.PI * 2); ctx.stroke()
  }
  // 电流点
  if (playing.value && Math.abs(i.value) > 1e-4) {
    const path: [number, number][] = i.value > 0
      ? [[left, midY - 18], [left, top], [right, top], [right, midY - 38]]
      : [[right, midY - 38], [right, top], [left, top], [left, midY - 18]]
    currentDots(ctx, path, phase, 1, '#F5C542')
  }
  // 能量条
  const bx = w * 0.7, bw = 40, bh = h - 90
  const fE = eE.value / eTot.value, fB = eB.value / eTot.value
  ctx.fillStyle = '#23233a'; ctx.fillRect(bx, 40, bw, bh); ctx.fillRect(bx + 70, 40, bw, bh)
  ctx.fillStyle = '#E05555'; ctx.fillRect(bx, 40 + bh * (1 - fE), bw, bh * fE)
  ctx.fillStyle = '#b06ce6'; ctx.fillRect(bx + 70, 40 + bh * (1 - fB), bw, bh * fB)
  label(ctx, '电场能', bx + bw / 2, 30, '#E05555', 11); label(ctx, '磁场能', bx + 70 + bw / 2, 30, '#b06ce6', 11)
  label(ctx, `${(fE * 100).toFixed(0)}%`, bx + bw / 2, h - 36, '#E05555', 11); label(ctx, `${(fB * 100).toFixed(0)}%`, bx + 70 + bw / 2, h - 36, '#b06ce6', 11)
  label(ctx, `q = ${(q.value * 1e3).toFixed(2)} mC　i = ${(i.value).toFixed(3)} A　t = ${(tPhys * 1e3).toFixed(1)} ms　T = 2π√(LC) = ${(T.value * 1e3).toFixed(2)} ms（慢放 ×${SLOW}）`,
    w / 2, h - 12, '#7fe3b3', 11)
}

let frame = 0
onMounted(() => {
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      animation: false, grid: { left: 46, right: 46, top: 26, bottom: 26 },
      legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 2, data: ['q (mC)', 'i (A)'] },
      xAxis: { type: 'value', name: 't/ms', nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
      yAxis: [
        { type: 'value', name: 'q (mC)', nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
        { type: 'value', name: 'i (A)', nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { show: false } },
      ],
      series: [
        { name: 'q (mC)', type: 'line', showSymbol: false, lineStyle: { color: '#E05555', width: 2 }, data: [] },
        { name: 'i (A)', type: 'line', showSymbol: false, yAxisIndex: 1, lineStyle: { color: '#b06ce6', width: 1.5 }, data: [] },
      ],
    })
  }
  loop = makeLoop((dt) => {
    step(dt); draw()
    if (++frame % 4 === 0 && chart && playing.value) {
      chart.setOption({ series: [
        { data: series.map((s) => [+s.t.toFixed(3), +(s.q * 1e3).toFixed(4)]) },
        { data: series.map((s) => [+s.t.toFixed(3), +s.i.toFixed(4)]) },
      ] })
    }
  })
})
onUnmounted(() => { loop?.stop(); chart?.dispose() })
</script>

<template>
  <LabPanel ref="lab" title="观察电磁振荡（LC 回路）"
    desc="电容器放电，电流经线圈建立磁场；电容放完时电流最大、磁场能最大；线圈自感又使电流继续、给电容反向充电……电场能与磁场能周期性互相转化，形成电磁振荡。"
    formula="T = 2π√(LC)　f = 1/(2π√(LC))　E电 = q²/2C　E磁 = ½Li²"
    :axes="{ x: '√(LC)', y: 'T', xUnit: 'ms', yUnit: 'ms' }">
    <template #controls>
      <label>电感 L = {{ Lmh }} mH<input type="range" min="20" max="400" step="20" v-model.number="Lmh" @change="reset"></label>
      <label>电容 C = {{ Cuf }} μF<input type="range" min="10" max="200" step="10" v-model.number="Cuf" @change="reset"></label>
      <div class="row">
        <button class="btn" @click="playing = !playing">{{ playing ? '⏸ 暂停' : '▶ 接通（开始振荡）' }}</button>
        <button class="btn ghost" @click="reset">⟲ 复位</button>
      </div>
      <div class="readout">T = 2π√(LC) = {{ (T * 1e3).toFixed(2) }} ms
电场能 {{ (eE / eTot * 100).toFixed(0) }}%　磁场能 {{ (eB / eTot * 100).toFixed(0) }}%</div>
      <button class="btn alt" @click="record">📏 记录 (√LC, T)（{{ records.length }}）</button>
      <p class="hint">改 L 或 C 后复位再看：T-√(LC) 为过原点直线，斜率 2π。q 与 i 相位差 90°：q 最大时 i=0。</p>
    </template>
    <div class="stage-col">
      <canvas ref="canvasRef" class="circuit"></canvas>
      <div ref="chartRef" class="scope"></div>
    </div>
  </LabPanel>
</template>

<style scoped>
.stage-col { display: flex; flex-direction: column; height: 100%; }
.circuit { height: 220px !important; flex: 0 0 220px; }
.scope { flex: 1; min-height: 160px; }
</style>
