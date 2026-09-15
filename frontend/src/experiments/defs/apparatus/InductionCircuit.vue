<script setup lang="ts">
/**
 * 电磁感应三实验的接线与操作舞台（配合上方 3D 演示）
 *   condition：副线圈接电流计；原线圈回路（电池–开关–滑动变阻器–原线圈）。操作：磁铁插拔 / 开关通断 / 滑变滑动 → 电流计是否偏转
 *   emf      ：改变插拔速度与匝数 → 电流计最大偏转 → 感应电动势大小与 ΔΦ/Δt、N 的关系
 *   lenz     ：先明确“电流从 + 流入 → 指针右偏”，再 N/S 极插入/拔出四组 → 感应电流方向 → 归纳“阻碍”
 * 感应电动势：磁铁运动用高斯脉冲 ε = k·N·v·g(t)（插入为正、拔出为负、S 极反号）；原副线圈用互感 ε₂ = −M·ΔI₁/Δt。
 */
import { computed, ref } from 'vue'
import CircuitLab from './CircuitLab.vue'
import CircuitEditor from '../../circuit/editor/CircuitEditor.vue'
import { num, type CircuitTemplate, type Fault, type MeterReading, type ComponentKind, type Circuit, type ElementResult } from '../../circuit'

const props = defineProps<{ mode: 'condition' | 'emf' | 'lenz' }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

const CFG = {
  condition: {
    title: '探究感应电流产生的条件——自己接线并操作',
    palette: ['coil', 'galvanometer', 'inductor', 'battery', 'switch', 'rheostat'] as ComponentKind[],
    hint: '副线圈（感应线圈）两端接电流计；原线圈回路：电池 → 开关 → 滑动变阻器 A-C → 原线圈（用“电感器”代表）→ 电池。三组操作看电流计有无偏转',
    template: { name: '感应电流条件', roles: { L2: 'coil', G: 'galvanometer', L1: 'inductor', src: 'battery', S: 'switch', Rh: 'rheostat' },
      series: [['L2', 'G'], ['src', 'S', 'Rh', 'L1']] } as CircuitTemplate,
  },
  emf: {
    title: '探究影响感应电动势大小的因素——自己接线并操作',
    palette: ['coil', 'galvanometer'] as ComponentKind[],
    hint: '感应线圈两端接电流计。控制变量：只改插拔速度，或只改匝数（点线圈→参数面板 N），比较电流计最大偏转',
    template: { name: '感应电动势', roles: { L2: 'coil', G: 'galvanometer' }, series: [['L2', 'G']] } as CircuitTemplate,
  },
  lenz: {
    title: '探究楞次定律——自己接线并判断感应电流方向',
    palette: ['coil', 'galvanometer', 'battery'] as ComponentKind[],
    hint: '感应线圈两端接电流计（记住：电流从电流计 + 端流入 → 指针右偏）。N 极插入 / N 极拔出 / S 极插入 / S 极拔出各做一次，记录偏转方向',
    template: { name: '楞次定律', roles: { L2: 'coil', G: 'galvanometer' }, series: [['L2', 'G']] } as CircuitTemplate,
  },
}
const cfg = computed(() => CFG[props.mode])

const faults = ref<Fault[]>([])
function onSolved(p: { readings: MeterReading[]; faults: Fault[] }) { faults.value = p.faults }
const hasError = computed(() => faults.value.some((f) => f.severity === 'error' && f.code !== 'open' && f.code !== 'switch_open'))
const parts = computed(() => {
  const cs = ed.value?.circuit.components ?? []
  return { L2: cs.find((c) => c.kind === 'coil'), G: cs.find((c) => c.kind === 'galvanometer'), L1: cs.find((c) => c.kind === 'inductor'),
    S: cs.find((c) => c.kind === 'switch'), Rh: cs.find((c) => c.kind === 'rheostat') }
})
const wired = computed(() => !!parts.value.L2 && !!parts.value.G)

const pole = ref<'N' | 'S'>('N')
const speed = ref(1)   // 相对速度 0.3~3
interface Row { op: string; epsPeak: number; iPeak: number; dir: string }
const rows = ref<Row[]>([])
const K_EPS = 0.04      // 每 100 匝、单位速度的电动势峰值 (V)：接 3 mA 电流计（30 Ω）+ 线圈 2 Ω 时约 1.2 mA，在量程内

function runWith(control: (t: number, circuit: Circuit, prev: Record<string, ElementResult> | null) => void, tEnd: number, op: string) {
  const p = parts.value
  if (!wired.value || !ed.value) return
  const dt = 0.004
  const res = ed.value.runTransient({ dt, tEnd, control })
  ed.value.setProps(p.L2!.id, { emf: 0 })
  if (!res.ok) return
  const gI = res.elements[p.G!.id].i, eps = res.elements[p.L2!.id].v
  let kMax = 0
  for (let k = 1; k < gI.length; k++) if (Math.abs(gI[k]) > Math.abs(gI[kMax])) kMax = k
  const iPeak = gI[kMax] ?? 0
  const dir = Math.abs(iPeak) < 1e-7 ? '不偏转' : iPeak > 0 ? '右偏（电流从 + 流入）' : '左偏（电流从 − 流入）'
  const row: Row = { op, epsPeak: Math.max(...eps.map(Math.abs)), iPeak, dir }
  rows.value.unshift(row)
  ed.value.play(res, 1)
  emit('record', { mode: props.mode, ...row, N: num(p.L2!, 'N', 100), speed: speed.value, pole: pole.value })
}

/** 磁铁插入/拔出：高斯脉冲；插入 N 极为正，拔出反号，S 极反号 */
function magnet(insert: boolean) {
  const p = parts.value
  if (!p.L2) return
  const sign = (insert ? 1 : -1) * (pole.value === 'N' ? 1 : -1)
  const N = num(p.L2, 'N', 100), v = speed.value
  const sigma = 0.12 / v, t0 = 0.35
  const emf = (t: number) => sign * K_EPS * (N / 100) * v * Math.exp(-(((t - t0) / sigma) ** 2))
  runWith((t, c) => { const coil = c.components.find((x) => x.id === p.L2!.id); if (coil) coil.props.emf = emf(t) }, 1.0,
    `磁铁 ${pole.value} 极${insert ? '插入' : '拔出'}（速度 ×${v.toFixed(1)}）`)
}
/** 原线圈开关通断 / 滑变滑动：互感 ε₂ = −M·ΔI₁/Δt */
function primary(action: 'close' | 'open' | 'slide') {
  const p = parts.value
  if (!p.L1 || !p.L2 || !p.S) return
  const M = 0.012 * (num(p.L2, 'N', 100) / 100)   // 互感系数 (H)，按副线圈匝数缩放
  let iPrev: number | null = null
  const dt = 0.004
  if (action === 'close') ed.value?.setProps(p.S.id, { closed: true })
  if (action === 'open') ed.value?.setProps(p.S.id, { closed: false })
  const pos0 = p.Rh ? num(p.Rh, 'pos', 0.5) : 0.5
  runWith((t, c, prev) => {
    const i1 = prev?.[p.L1!.id]?.i ?? iPrev ?? 0
    const coil = c.components.find((x) => x.id === p.L2!.id)
    if (coil) coil.props.emf = iPrev === null ? 0 : -M * (i1 - iPrev) / dt
    iPrev = i1
    if (action === 'slide' && p.Rh) { const rh = c.components.find((x) => x.id === p.Rh!.id); if (rh) rh.props.pos = Math.min(1, Math.max(0.05, pos0 + 0.6 * Math.min(1, t / 0.5))) }
  }, 1.0, action === 'close' ? '原线圈开关闭合' : action === 'open' ? '原线圈开关断开' : '滑动变阻器快速滑动')
  if (action === 'slide' && p.Rh) ed.value?.setProps(p.Rh.id, { pos: pos0 })
}
</script>

<template>
  <CircuitLab :title="cfg.title" :graph="false"
    :desc="props.mode === 'condition' ? '上方 3D 演示看现象，这里自己接电路做操作：①条形磁铁插入/拔出副线圈；②原线圈通电后开关通断；③滑动变阻器快速滑动。电流计偏转 = 有感应电流，归纳“穿过闭合回路的磁通量变化”这一条件。'
      : props.mode === 'emf' ? '只改一个变量：先固定匝数改速度，再固定速度改匝数（线圈参数面板），比较电流计最大偏转（∝ 感应电动势）。'
      : '电流从电流计 + 端流入指针右偏。四组操作分别记录偏转方向，结合线圈绕向判断感应电流的磁场方向，归纳“阻碍磁通量变化”。'"
    :formula="props.mode === 'emf' ? 'ε = N·ΔΦ/Δt' : props.mode === 'lenz' ? '感应电流的磁场总是阻碍引起感应电流的磁通量的变化' : 'ΔΦ ≠ 0 ⇔ 有感应电流'">
    <template #editor>
      <CircuitEditor ref="ed" :palette="cfg.palette" :template="cfg.template" :hint="cfg.hint" :height="340" @solved="onSolved" />
    </template>
    <template #controls>
      <div class="readout">{{ wired ? `感应线圈 N = ${num(parts.L2!, 'N', 100)} 匝，电流计 ${parts.G!.props.rangeKey}` : '先把感应线圈接到电流计' }}
{{ hasError ? '⛔ 电路有故障，先排除' : '' }}</div>
      <label>磁铁极性
        <select v-model="pole"><option value="N">N 极朝下</option><option value="S">S 极朝下</option></select></label>
      <label v-if="props.mode !== 'lenz'">插拔速度 ×{{ speed.toFixed(1) }}<input type="range" min="0.3" max="3" step="0.1" v-model.number="speed"></label>
      <div class="row">
        <button class="btn" :disabled="!wired || hasError" @click="magnet(true)">⬇ 磁铁插入</button>
        <button class="btn" :disabled="!wired || hasError" @click="magnet(false)">⬆ 磁铁拔出</button>
      </div>
      <template v-if="props.mode === 'condition'">
        <div class="row">
          <button class="btn alt" :disabled="!parts.L1 || !parts.S || hasError" @click="primary('close')">原线圈：闭合开关</button>
          <button class="btn alt" :disabled="!parts.L1 || !parts.S || hasError" @click="primary('open')">断开开关</button>
        </div>
        <button class="btn alt" :disabled="!parts.L1 || !parts.S || !parts.Rh || hasError" @click="primary('slide')">原线圈：快速滑动变阻器</button>
      </template>
      <table v-if="rows.length" class="rows"><tr><th style="text-align:left">操作</th><th>ε 峰值/V</th><th>I_G 峰值</th><th style="text-align:left">电流计</th></tr>
        <tr v-for="(r, i) in rows.slice(0, 8)" :key="i"><td style="text-align:left">{{ r.op }}</td><td>{{ r.epsPeak.toFixed(3) }}</td>
          <td>{{ (Math.abs(r.iPeak) * 1e6).toFixed(0) }} μA</td><td style="text-align:left">{{ r.dir }}</td></tr></table>
    </template>
  </CircuitLab>
</template>
