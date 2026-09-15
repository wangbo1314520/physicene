<script setup lang="ts">
/**
 * 探究电感器和电容器对交流电的影响（自由搭建，交流相量求解）
 * 信号发生器 → 小灯泡 → 串电感 或 串电容；调频率看灯亮度、记 (f, I) 作图；对照 X_L=2πfL、X_C=1/(2πfC)；直流下电容不通
 */
import { computed, ref } from 'vue'
import CircuitLab from './apparatus/CircuitLab.vue'
import CircuitEditor from '../circuit/editor/CircuitEditor.vue'
import { num, reactanceC, reactanceL, type CircuitTemplate, type Fault, type MeterReading, type ACSolution } from '../circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof CircuitLab> | null>(null)
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

const TEMPLATE: CircuitTemplate = {
  name: '灯泡串电感/电容接交流',
  roles: { src: 'ac_source', La: 'lamp', X: ['inductor', 'capacitor'], S: 'switch' },
  series: [['src', 'La', 'X', 'S']],
  requireClosed: true,
}
const freq = ref(50)
const faults = ref<Fault[]>([])
const ac = ref<ACSolution | null>(null)
function onSolved(p: { ac: ACSolution | null; readings: MeterReading[]; faults: Fault[] }) { ac.value = p.ac; faults.value = p.faults }
const parts = computed(() => {
  const cs = ed.value?.circuit.components ?? []
  return { La: cs.find((c) => c.kind === 'lamp'), L: cs.find((c) => c.kind === 'inductor'), C: cs.find((c) => c.kind === 'capacitor'), src: cs.find((c) => c.kind === 'ac_source') }
})
const lampI = computed(() => (parts.value.La && ac.value?.ok ? ac.value.elements[parts.value.La.id]?.iRms ?? 0 : 0))
const hasError = computed(() => faults.value.some((f) => f.severity === 'error' && f.code !== 'open'))
const canRecord = computed(() => !!parts.value.La && lampI.value > 1e-6 && !hasError.value)
const which = computed(() => (parts.value.L ? 'L' : parts.value.C ? 'C' : null))
const reactance = computed(() => {
  if (which.value === 'L' && parts.value.L) return reactanceL(num(parts.value.L, 'L', 1), freq.value)
  if (which.value === 'C' && parts.value.C) return reactanceC(num(parts.value.C, 'C', 1e-3), freq.value)
  return null
})

const rows = ref<{ f: number; I: number; X: number | null }[]>([])
function record() {
  if (!canRecord.value) return
  rows.value.push({ f: freq.value, I: +lampI.value.toFixed(5), X: reactance.value })
  rows.value.sort((a, b) => a.f - b.f)
  lab.value?.loadPoints(rows.value.map((r) => ({ x: r.f, y: +(r.I * 1000).toFixed(2) })))
  emit('record', { rows: rows.value, element: which.value })
}
function clearRows() { rows.value = []; lab.value?.loadPoints([]) }
// 频率对数滑杆 5 Hz ~ 2 kHz
const logF = computed({ get: () => Math.log10(freq.value), set: (v: number) => { freq.value = Math.round(Math.pow(10, v)) } })
</script>

<template>
  <CircuitLab ref="lab" title="探究电感器和电容器对交流电的影响（自由搭建）"
    desc="自己接：信号发生器（交流源）、小灯泡、开关，再串入电感器或电容器。调频率，看灯泡亮度和电流怎么变：串电感时频率越高越暗（感抗增大），串电容时频率越高越亮（容抗减小）。把电感换成电容再做一遍，记 (f, I) 作图。"
    formula="X_L = 2πfL　X_C = 1/(2πfC)　I = U/√(R² + X²)"
    :axes="{ x: 'f', y: 'I', xUnit: 'Hz', yUnit: 'mA' }" series-color="#E05555">
    <template #editor>
      <CircuitEditor ref="ed" :palette="['ac_source', 'lamp', 'inductor', 'capacitor', 'switch']" :template="TEMPLATE" solve-mode="ac" :ac-freq="freq"
        hint="交流源 → 开关 → 灯泡 → 电感（或电容）→ 回到交流源，串成一个回路；电容选 100~470 μF、电感 0.05~0.5 H 现象明显" @solved="onSolved" />
    </template>
    <template #controls>
      <label>频率 f = {{ freq }} Hz<input type="range" min="0.7" max="3.3" step="0.01" v-model.number="logF"></label>
      <div class="readout">灯泡电流 I = {{ (lampI * 1000).toFixed(2) }} mA
{{ which === 'L' ? `感抗 X_L = ${reactance!.toFixed(1)} Ω（随 f 增大）` : which === 'C' ? `容抗 X_C = ${reactance!.toFixed(1)} Ω（随 f 减小）` : '串入电感器或电容器' }}
{{ hasError ? '⛔ 电路有故障' : (canRecord ? '✔ 可以记录' : '') }}</div>
      <button class="btn" :disabled="!canRecord" @click="record">📏 记录 (f, I)（{{ rows.length }}）</button>
      <button class="btn ghost" :disabled="!rows.length" @click="clearRows">↺ 清除数据</button>
      <table v-if="rows.length" class="rows"><tr><th>f / Hz</th><th>I / mA</th><th>X / Ω</th></tr>
        <tr v-for="(r, i) in rows" :key="i"><td>{{ r.f }}</td><td>{{ (r.I * 1000).toFixed(2) }}</td><td>{{ r.X?.toFixed(1) ?? '—' }}</td></tr></table>
      <p class="hint">结论：电感“通直流、阻交流，通低频、阻高频”；电容“通交流、隔直流，通高频、阻低频”。</p>
    </template>
  </CircuitLab>
</template>
