<script setup lang="ts">
/**
 * 导体电阻率的测量（伏安法外接，自由搭建）
 * 搭电路 → 改滑片记 (I,U) → R=U/I → 参数面板读“螺旋测微器”d 与刻度尺 L → ρ = πd²R/(4L)
 */
import { computed, ref } from 'vue'
import CircuitLab from './apparatus/CircuitLab.vue'
import CircuitEditor from '../circuit/editor/CircuitEditor.vue'
import { linearFit, num, wireSampleResistance, type CircuitTemplate, type Fault, type MeterReading } from '../circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof CircuitLab> | null>(null)
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

const TEMPLATE: CircuitTemplate = {
  name: '伏安法（电流表外接）测金属丝电阻',
  roles: { src: 'dc_source', S: 'switch', A: 'ammeter', Rh: 'rheostat', Rx: 'wire_sample', V: 'voltmeter' },
  series: [['src', 'S', 'A', 'Rh', 'Rx']],
  parallel: [['V', 'Rx']],
  requireClosed: true,
}
const readings = ref<MeterReading[]>([])
const faults = ref<Fault[]>([])
function onSolved(p: { readings: MeterReading[]; faults: Fault[] }) { readings.value = p.readings; faults.value = p.faults }
const A = computed(() => readings.value.find((m) => m.kind === 'ammeter'))
const V = computed(() => readings.value.find((m) => m.kind === 'voltmeter'))
const hasError = computed(() => faults.value.some((f) => f.severity === 'error'))
const canRecord = computed(() => !!A.value && !!V.value && !hasError.value && (A.value?.value ?? 0) > 1e-6)
const sample = computed(() => ed.value?.circuit.components.find((c) => c.kind === 'wire_sample') ?? null)

const rows = ref<{ I: number; U: number; R: number }[]>([])
function record() {
  if (!canRecord.value) return
  const I = A.value!.value, U = V.value!.value
  rows.value.push({ I: +I.toFixed(4), U: +U.toFixed(3), R: +(U / I).toFixed(3) })
  lab.value?.loadPoints(rows.value.map((r) => ({ x: r.I, y: r.U })))
  emit('record', { rows: rows.value, R: result.value?.R, rho: result.value?.rho, trueRho: sample.value ? num(sample.value, 'rho', 1.1e-6) : 1.1e-6 })
}
function clearRows() { rows.value = []; lab.value?.loadPoints([]) }
const result = computed(() => {
  const s = sample.value
  if (!s || rows.value.length < 2) return null
  const fit = linearFit(rows.value.map((r) => ({ x: r.I, y: r.U })))
  const R = fit.k                                       // U-I 斜率 = R
  const d = num(s, 'd', 0.5) * 1e-3, L = num(s, 'L', 0.5)
  const S = Math.PI * d * d / 4
  const rho = R * S / L
  return { R, rho, Rtrue: wireSampleResistance(s), rhoTrue: num(s, 'rho', 1.1e-6), err: Math.abs(rho / num(s, 'rho', 1.1e-6) - 1) * 100 }
})
</script>

<template>
  <CircuitLab ref="lab" title="导体电阻率的测量（伏安法外接，自由搭建电路）"
    desc="自己接电路：学生电源、开关、电流表、滑动变阻器（限流）、待测金属丝串成回路，电压表并联在金属丝两端（电流表外接法，适合小电阻）。改滑片记多组 (I, U)，斜率即 R；在金属丝参数面板读直径 d（螺旋测微器）与长度 L。"
    formula="R = U/I　S = πd²/4　ρ = R·S / L"
    :axes="{ x: 'I', y: 'U', xUnit: 'A', yUnit: 'V' }" series-color="#F5C542">
    <template #editor>
      <CircuitEditor ref="ed" :palette="['dc_source', 'switch', 'ammeter', 'voltmeter', 'rheostat', 'wire_sample']" :template="TEMPLATE"
        hint="外接法：电压表只并联在金属丝两端；电流表串在干路；滑动变阻器用 A、C 两端限流；金属丝电阻仅几欧，电流表选 0.6A、电压表选 3V" @solved="onSolved" />
    </template>
    <template #controls>
      <div class="readout">I = {{ A ? (A.value * 1000).toFixed(1) + ' mA' : '—' }}　U = {{ V ? V.value.toFixed(3) + ' V' : '—' }}
{{ sample ? `金属丝 L = ${num(sample, 'L', 0.5).toFixed(2)} m，d = ${num(sample, 'd', 0.5).toFixed(2)} mm` : '托盘中取出“待测金属丝”' }}
{{ hasError ? '⛔ 电路有故障' : (A && V ? '✔ 可以记录' : '') }}</div>
      <button class="btn" :disabled="!canRecord" @click="record">📏 记录一组 (I, U)（{{ rows.length }}）</button>
      <button class="btn ghost" :disabled="!rows.length" @click="clearRows">↺ 清除数据</button>
      <table v-if="rows.length" class="rows"><tr><th>#</th><th>I / A</th><th>U / V</th><th>R / Ω</th></tr>
        <tr v-for="(r, i) in rows" :key="i"><td>{{ i + 1 }}</td><td>{{ r.I.toFixed(4) }}</td><td>{{ r.U.toFixed(3) }}</td><td>{{ r.R.toFixed(3) }}</td></tr></table>
      <div v-if="result" class="readout">拟合 R = {{ result.R.toFixed(3) }} Ω（真值 {{ result.Rtrue.toFixed(3) }}）
ρ = {{ result.rho.toExponential(3) }} Ω·m（真值 {{ result.rhoTrue.toExponential(2) }}，误差 {{ result.err.toFixed(2) }}%）</div>
      <p class="hint">外接法电压表分流 → 测得 R 略偏小；金属丝电阻越小于电压表内阻，误差越小。d 要在不同位置测三次取平均（改参数面板 d 体会灵敏度：ρ ∝ d²）。</p>
    </template>
  </CircuitLab>
</template>
