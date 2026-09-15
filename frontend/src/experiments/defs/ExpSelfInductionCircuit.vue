<script setup lang="ts">
/**
 * 探究自感现象（自由搭建通电 / 断电自感电路）
 * 两条并联支路：L + 灯 A，滑动变阻器 + 灯 B；开关闭合 → A 比 B 后亮；断开 → 两灯经 L 回路闪亮后熄灭
 */
import { computed, ref } from 'vue'
import CircuitLab from './apparatus/CircuitLab.vue'
import CircuitEditor from '../circuit/editor/CircuitEditor.vue'
import TransientScope from './apparatus/TransientScope.vue'
import { num, type CircuitTemplate, type Fault, type MeterReading, type EngineState, type TransientResult } from '../circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

const TEMPLATE: CircuitTemplate = {
  name: '通电自感双灯电路',
  roles: { src: 'dc_source', S: 'switch', L: 'inductor', A: 'lamp', Rh: 'rheostat', B: 'lamp' },
  series: [['L', 'A'], ['Rh', 'B']],
  requireClosed: true,
}
const faults = ref<Fault[]>([])
function onSolved(p: { readings: MeterReading[]; faults: Fault[] }) { faults.value = p.faults }
// 闭合开关之前“开关断开”是正常状态，不算故障
const hasError = computed(() => faults.value.some((f) => f.severity === 'error' && f.code !== 'switch_open' && f.code !== 'open'))
const parts = computed(() => {
  const cs = ed.value?.circuit.components ?? []
  const lamps = cs.filter((c) => c.kind === 'lamp')
  return { S: cs.find((c) => c.kind === 'switch'), L: cs.find((c) => c.kind === 'inductor'), A: lamps[0], B: lamps[1], src: cs.find((c) => c.kind === 'dc_source') }
})
const ready = computed(() => !!parts.value.S && !!parts.value.L && !!parts.value.A && !!parts.value.src)

const t = ref<number[]>([]); const iA = ref<number[]>([]); const iB = ref<number[]>([])
let state: EngineState | undefined
let tOffset = 0
const tauMeas = ref<number | null>(null)
const tauTheory = computed(() => {
  const p = parts.value
  if (!p.L || !p.A) return 0
  const R = num(p.A, 'ratedU', 2.5) / num(p.A, 'ratedI', 0.3) + num(p.L, 'rw', 5)
  return num(p.L, 'L', 1) / R
})
function run(close: boolean) {
  const p = parts.value
  if (!ready.value || !ed.value) return
  ed.value.setProps(p.S!.id, { closed: close })
  const T = Math.min(6, Math.max(0.6, 6 * tauTheory.value))
  const dt = T / 800
  const res: TransientResult = ed.value.runTransient({ dt, tEnd: T, state })
  if (!res.ok) return
  state = res.state
  if (close) { t.value = []; iA.value = []; iB.value = []; tOffset = 0 }
  const a = res.elements[p.A!.id].i, b = p.B ? res.elements[p.B.id].i : new Array(res.t.length).fill(0)
  for (let k = 0; k < res.t.length; k++) { t.value.push(res.t[k] + tOffset); iA.value.push(a[k]); iB.value.push(b[k]) }
  tOffset += T
  if (close) {
    const iInf = a.at(-1) ?? 0
    const k = a.findIndex((v) => Math.abs(v) >= 0.632 * Math.abs(iInf))
    tauMeas.value = k > 0 ? res.t[k] : null
  }
  ed.value.play(res, Math.max(0.3, T / 5))
  emit('record', { action: close ? 'close' : 'open', tauTheory: tauTheory.value, tauMeasured: tauMeas.value, iA_end: a.at(-1), iB_end: b.at(-1) })
}
const series = computed(() => [
  { name: '灯 A（串电感）电流', color: '#F5C542', values: iA.value, unit: 'A' },
  { name: '灯 B（串变阻器）电流', color: '#E05555', values: iB.value, unit: 'A' },
])
</script>

<template>
  <CircuitLab title="探究自感现象（自由搭建通电 / 断电自感电路）" :graph="false"
    desc="自己接：电源与开关 S 供电；两条并联支路——电感器 L 串小灯 A，滑动变阻器串小灯 B（调滑片使两灯稳态一样亮）。闭合 S：B 立刻亮，A 因自感电动势阻碍电流增大而逐渐变亮；断开 S：L 中电流经 A、B 回路继续流动，两灯闪亮一下再熄灭。"
    formula="ε_L = −L·Δi/Δt　通电支路 i = I∞(1−e^(−t/τ))，τ = L/R">
    <template #editor>
      <CircuitEditor ref="ed" :palette="['dc_source', 'switch', 'inductor', 'lamp', 'rheostat']" :template="TEMPLATE"
        hint="电源 + → S → 分两路：L→灯A、滑变(A-C)→灯B，两路汇合回电源 −。先在托盘点两次“小灯泡”放两只灯" @solved="onSolved" />
    </template>
    <template #controls>
      <div class="readout">{{ ready ? `理论 τ = L/(R_A + r_L) = ${tauTheory.toFixed(3)} s` : '需要：电源、开关、电感、两只灯泡、滑动变阻器' }}
{{ tauMeas !== null ? `实测 τ（A 灯电流到 63.2%）= ${tauMeas.toFixed(3)} s` : '' }}
{{ hasError ? '⛔ 电路有故障，先排除' : '' }}</div>
      <button class="btn" :disabled="!ready || hasError" @click="run(true)">▶ 闭合开关（通电自感）</button>
      <button class="btn alt" :disabled="!t.length" @click="run(false)">▶ 断开开关（断电自感）</button>
      <p class="hint">回放时看两灯亮度：通电时 A 慢于 B；断电瞬间 A、B 一起闪亮（电流方向经 L 维持）。把 L 调大，τ 变长，现象更明显。</p>
    </template>
    <template #graph>
      <TransientScope :t="t" :series="series" title="示波器：i_A(t)、i_B(t)" :height="300" />
    </template>
  </CircuitLab>
</template>
