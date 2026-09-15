<script setup lang="ts">
/**
 * 电池电动势和内阻的测量（伏安法，自由搭建）
 * 学生自己搭：电压表并联电池两端；开关、电流表、滑动变阻器（限流 A–C）串成回路 → 改滑片记 ≥6 组 (I,U) → 坐标纸拟合 → E=截距，r=−斜率
 */
import { computed, ref } from 'vue'
import CircuitLab from './apparatus/CircuitLab.vue'
import CircuitEditor from '../circuit/editor/CircuitEditor.vue'
import { linearFit, num, type CircuitTemplate, type Fault, type MeterReading } from '../circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof CircuitLab> | null>(null)
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

const TEMPLATE: CircuitTemplate = {
  name: '伏安法测电动势内阻',
  roles: { src: 'battery', A: 'ammeter', V: 'voltmeter', Rh: 'rheostat', S: 'switch' },
  series: [['src', 'S', 'A', 'Rh']],
  parallel: [['V', 'src']],
  requireClosed: true,
}
const readings = ref<MeterReading[]>([])
const faults = ref<Fault[]>([])
function onSolved(p: { readings: MeterReading[]; faults: Fault[] }) { readings.value = p.readings; faults.value = p.faults }
const A = computed(() => readings.value.find((m) => m.kind === 'ammeter'))
const V = computed(() => readings.value.find((m) => m.kind === 'voltmeter'))
const hasError = computed(() => faults.value.some((f) => f.severity === 'error'))
const canRecord = computed(() => !!A.value && !!V.value && !hasError.value && (A.value?.value ?? 0) > 1e-6)

const rows = ref<{ I: number; U: number }[]>([])
function record() {
  if (!canRecord.value) return
  rows.value.push({ I: +A.value!.value.toFixed(4), U: +V.value!.value.toFixed(3) })
  lab.value?.loadPoints(rows.value.map((r) => ({ x: r.I, y: r.U })))
  emit('record', { rows: rows.value, E: fit.value?.E, r: fit.value?.r, trueE: truth.value.E, trueR: truth.value.r })
}
function clearRows() { rows.value = []; lab.value?.loadPoints([]) }
const fit = computed(() => {
  if (rows.value.length < 2) return null
  const f = linearFit(rows.value.map((r) => ({ x: r.I, y: r.U })))
  return { E: f.b, r: -f.k, r2: f.r2 }
})
const truth = computed(() => {
  const b = ed.value?.circuit.components.find((c) => c.kind === 'battery')
  return { E: b ? num(b, 'emf', 1.5) : 1.5, r: b ? num(b, 'r', 1) : 1 }
})
</script>

<template>
  <CircuitLab ref="lab" title="电池电动势和内阻的测量（伏安法，自由搭建电路）"
    desc="从托盘取出干电池、电压表、电流表、滑动变阻器、开关，自己接成伏安法电路：电压表并联在电池两端，电流表与滑动变阻器（A、C 端限流）、开关串成回路。闭合开关后改变滑片位置，记录多组 (I, U)。"
    formula="U = E − I·r  →  U-I 图线：纵截距 = E，斜率 = −r"
    :axes="{ x: 'I', y: 'U', xUnit: 'A', yUnit: 'V' }" series-color="#3ecf8e">
    <template #editor>
      <CircuitEditor ref="ed" :palette="['battery', 'voltmeter', 'ammeter', 'rheostat', 'switch']" :template="TEMPLATE"
        hint="电压表并联电池两端（红+接正极）；电流表、滑动变阻器 A-C、开关与电池串成回路" @solved="onSolved" />
    </template>
    <template #controls>
      <div class="readout">电流表 I = {{ A ? (A.value * 1000).toFixed(1) + ' mA' : '—（未接入）' }}
电压表 U = {{ V ? V.value.toFixed(3) + ' V' : '—（未接入）' }}
{{ hasError ? '⛔ 电路有故障，先排除再记录' : (A && V ? '✔ 可以记录' : '') }}</div>
      <button class="btn" :disabled="!canRecord" @click="record">📏 记录一组 (I, U)（{{ rows.length }}）</button>
      <button class="btn ghost" :disabled="!rows.length" @click="clearRows">↺ 清除数据</button>
      <table v-if="rows.length" class="rows"><tr><th>#</th><th>I / A</th><th>U / V</th></tr>
        <tr v-for="(r, i) in rows" :key="i"><td>{{ i + 1 }}</td><td>{{ r.I.toFixed(4) }}</td><td>{{ r.U.toFixed(3) }}</td></tr></table>
      <div v-if="fit" class="readout">拟合：E = {{ fit.E.toFixed(3) }} V（真值 {{ truth.E.toFixed(2) }}）
r = {{ fit.r.toFixed(3) }} Ω（真值 {{ truth.r.toFixed(2) }}）　R² = {{ fit.r2.toFixed(4) }}</div>
      <p class="hint">系统误差：电压表分流使电流表读数偏小 → 测得 E、r 均略偏小（电压表内阻 3 kΩ）。滑片从大电阻端开始，防止电流表超量程。</p>
    </template>
  </CircuitLab>
</template>
