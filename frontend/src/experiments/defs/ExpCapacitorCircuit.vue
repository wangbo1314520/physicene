<script setup lang="ts">
/**
 * 观察电容器的充、放电现象（自由搭建 RC 电路）
 * 搭：电源 → 单刀双掷 K（1 充电 / 2 放电）→ 电阻 → 电容，电流计串联、电压表并联电容
 * 点“充电/放电”做暂态求解并在画布回放（电流计指针摆动、电流点衰减），示波器显示 u_C(t)、i(t)，测 τ 对比 RC
 */
import { computed, ref } from 'vue'
import CircuitLab from './apparatus/CircuitLab.vue'
import CircuitEditor from '../circuit/editor/CircuitEditor.vue'
import TransientScope from './apparatus/TransientScope.vue'
import { num, meterSpec, type CircuitTemplate, type Fault, type MeterReading, type EngineState, type TransientResult } from '../circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

const TEMPLATE: CircuitTemplate = {
  name: 'RC 充放电',
  roles: { src: 'dc_source', K: 'spdt_switch', R: 'resistor', C: 'capacitor', G: 'galvanometer', V: 'voltmeter' },
  parallel: [['V', 'C']],
}
const faults = ref<Fault[]>([])
function onSolved(p: { readings: MeterReading[]; faults: Fault[] }) { faults.value = p.faults }
// 拨开关之前“开关断开/无回路”是正常状态，不算故障
const hasError = computed(() => faults.value.some((f) => f.severity === 'error' && f.code !== 'switch_open' && f.code !== 'open'))

const parts = computed(() => {
  const cs = ed.value?.circuit.components ?? []
  return { K: cs.find((c) => c.kind === 'spdt_switch'), R: cs.find((c) => c.kind === 'resistor'), C: cs.find((c) => c.kind === 'capacitor'),
    G: cs.find((c) => c.kind === 'galvanometer'), V: cs.find((c) => c.kind === 'voltmeter'), src: cs.find((c) => c.kind === 'dc_source') }
})
const tau = computed(() => (parts.value.R && parts.value.C ? num(parts.value.R, 'R', 1000) * num(parts.value.C, 'C', 1e-3) : 0))
/** 电压表并联在电容上会分流：等效 τ' = C·(R ∥ R_V) */
const tauEff = computed(() => {
  const p = parts.value
  if (!p.R || !p.C) return 0
  const R = num(p.R, 'R', 1000), RV = p.V ? meterSpec(p.V).r : Infinity
  return num(p.C, 'C', 1e-3) * (Number.isFinite(RV) ? (R * RV) / (R + RV) : R)
})
const ready = computed(() => !!parts.value.K && !!parts.value.R && !!parts.value.C && !!parts.value.src)

const t = ref<number[]>([]); const uC = ref<number[]>([]); const iG = ref<number[]>([])
let state: EngineState | undefined
let tOffset = 0
const phase = ref<'idle' | 'charged' | 'discharged'>('idle')
const measured = ref<{ tauC?: number; tauD?: number }>({})

function run(pos: 1 | 2) {
  const p = parts.value
  if (!ready.value || !ed.value) return
  ed.value.setProps(p.K!.id, { pos })
  const T = Math.min(20, Math.max(0.5, 5 * tau.value))
  const dt = T / 800
  const res: TransientResult = ed.value.runTransient({ dt, tEnd: T, state })
  if (!res.ok) return
  state = res.state
  const cV = res.elements[p.C!.id].v, gI = p.G ? res.elements[p.G.id].i : res.elements[p.R!.id].i
  if (pos === 1) { t.value = []; uC.value = []; iG.value = []; tOffset = 0 }
  for (let k = 0; k < res.t.length; k++) { t.value.push(res.t[k] + tOffset); uC.value.push(cV[k]); iG.value.push(gI[k]) }
  tOffset += T
  // τ：充电到终值的 63.2% / 放电到初值的 36.8%（终值受电压表分流影响，故不用 E）
  const uEnd = cV.at(-1) ?? 0, u0 = cV[0] ?? 0
  const target = pos === 1 ? u0 + 0.632 * (uEnd - u0) : 0.368 * u0
  const k = cV.findIndex((v) => (pos === 1 ? v >= target : v <= target))
  if (k > 0) measured.value = { ...measured.value, [pos === 1 ? 'tauC' : 'tauD']: res.t[k] }
  phase.value = pos === 1 ? 'charged' : 'discharged'
  ed.value.play(res, Math.max(0.5, T / 6))   // 6 秒内看完整过程
  emit('record', { action: pos === 1 ? 'charge' : 'discharge', tau: tau.value, measured: measured.value, uC_end: cV.at(-1), i_peak: Math.max(...gI.map(Math.abs)) })
}
const series = computed(() => [
  { name: '电容电压 u_C', color: '#4A90D9', values: uC.value, unit: 'V' },
  { name: '回路电流 i', color: '#F5C542', values: iG.value, unit: 'A' },
])
</script>

<template>
  <CircuitLab title="观察电容器的充、放电现象（自由搭建 RC 电路）" :graph="false"
    desc="自己接：学生电源 → 单刀双掷开关 K（触点 1 接电源正极，触点 2 接电源负极，公共端接电阻）→ 电阻 R → 电容器 C（注意电解电容极性）；电流计串在回路里，电压表并联在电容两端。K 拨 1 充电、拨 2 放电，观察电流计指针先大后小、放电时反向。"
    formula="充电 u_C = E(1−e^(−t/τ))，放电 u_C = E·e^(−t/τ)，τ = RC；i 充放电方向相反">
    <template #editor>
      <CircuitEditor ref="ed" :palette="['dc_source', 'spdt_switch', 'resistor', 'capacitor', 'galvanometer', 'voltmeter']" :template="TEMPLATE"
        hint="K 公共端接 R，触点 1 接电源 +，触点 2 接电源 −；R–C–电流计串联回到电源 −；电压表并联 C。电流计 3mA 挡时 R 取 ≥2 kΩ" @solved="onSolved" />
    </template>
    <template #controls>
      <div class="readout">{{ ready ? `τ = RC = ${tau.toFixed(3)} s` : '需要：电源、单刀双掷开关、电阻、电容' }}
{{ ready && parts.V ? `接电压表后 τ' = C·(R∥R_V) = ${tauEff.toFixed(3)} s（电压表分流）` : '' }}
{{ measured.tauC !== undefined ? `充电实测 τ(63.2%) = ${measured.tauC.toFixed(3)} s` : '' }}
{{ measured.tauD !== undefined ? `放电实测 τ(36.8%) = ${measured.tauD.toFixed(3)} s` : '' }}
{{ hasError ? '⛔ 电路有故障，先排除' : '' }}</div>
      <button class="btn" :disabled="!ready || hasError" @click="run(1)">▶ K 拨 1：充电</button>
      <button class="btn alt" :disabled="phase !== 'charged'" @click="run(2)">▶ K 拨 2：放电</button>
      <p class="hint">回放时观察：充电电流由大到小、电容电压升到 E；放电电流反向、电压降到 0。改 R 或 C 再做一次，τ 随 RC 成正比。</p>
    </template>
    <template #graph>
      <TransientScope :t="t" :series="series" title="示波器：u_C(t) 与 i(t)" :height="300" />
    </template>
  </CircuitLab>
</template>
