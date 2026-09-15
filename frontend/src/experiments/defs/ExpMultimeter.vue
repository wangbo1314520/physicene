<script setup lang="ts">
/**
 * 练习使用多用电表（必修三）
 * 表盘：上刻度为欧姆（非线性、右零左∞），下刻度为直流电压/电流线性 0~50 格；
 * 档位旋钮：Ω×10/×100/×1k、直流电压 2.5/10/50 V、直流电流 5/50/500 mA；
 * 操作：选待测对象 → 选档位 → （欧姆档先短接表笔调零）→ 红黑表笔接入 → 读表（格数×每格值×倍率）。
 * 含接反反偏、超量程打表、欧姆档中值电阻 15 与"指针在中央附近更准"提示。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

type Range = { key: string; kind: 'ohm' | 'V' | 'mA'; label: string; full: number; mult?: number }
const RANGES: Range[] = [
  { key: 'o10', kind: 'ohm', label: 'Ω ×10', full: 0, mult: 10 },
  { key: 'o100', kind: 'ohm', label: 'Ω ×100', full: 0, mult: 100 },
  { key: 'o1k', kind: 'ohm', label: 'Ω ×1k', full: 0, mult: 1000 },
  { key: 'v2.5', kind: 'V', label: 'DCV 2.5', full: 2.5 },
  { key: 'v10', kind: 'V', label: 'DCV 10', full: 10 },
  { key: 'v50', kind: 'V', label: 'DCV 50', full: 50 },
  { key: 'a5', kind: 'mA', label: 'DCmA 5', full: 5 },
  { key: 'a50', kind: 'mA', label: 'DCmA 50', full: 50 },
  { key: 'a500', kind: 'mA', label: 'DCmA 500', full: 500 },
]
type Target = { key: string; name: string; kind: 'ohm' | 'V' | 'mA'; value: number }
const TARGETS: Target[] = [
  { key: 'r1', name: '电阻 R₁（未知）', kind: 'ohm', value: 470 },
  { key: 'r2', name: '电阻 R₂（未知）', kind: 'ohm', value: 6800 },
  { key: 'cell', name: '干电池', kind: 'V', value: 1.48 },
  { key: 'psu', name: '学生电源', kind: 'V', value: 9.2 },
  { key: 'branch', name: '小灯泡支路电流', kind: 'mA', value: 28 },
]
const R_MID = 15 // 欧姆表中值电阻（格）

const rangeKey = ref('v10')
const targetKey = ref('cell')
const reversed = ref(false)
const zeroed = ref(false)
const probesConnected = ref(false)
const range = computed(() => RANGES.find((r) => r.key === rangeKey.value)!)
const target = computed(() => TARGETS.find((t) => t.key === targetKey.value)!)
const records = ref<{ target: string; range: string; reading: string }[]>([])

/** 指针偏转比例 0~1（负=反偏，>1=超量程） */
const deflection = computed(() => {
  if (!probesConnected.value) return 0
  const r = range.value, t = target.value
  if (r.kind === 'ohm') {
    if (t.kind !== 'ohm') return 1.3 // 欧姆档接电源 → 打满（危险操作）
    const scaled = t.value / (r.mult ?? 1)
    const frac = R_MID / (R_MID + scaled) // 短路(0Ω)=1，∞=0
    return zeroed.value ? frac : frac * 0.82 // 未调零：读数偏低
  }
  if (t.kind !== r.kind) return 0
  const frac = t.value / r.full
  return reversed.value ? -frac : frac
})
const overRange = computed(() => deflection.value > 1.02)
const reading = computed(() => {
  const d = deflection.value
  if (!probesConnected.value) return '—'
  if (d < -0.02) return '反偏：红黑表笔接反'
  if (overRange.value) return '超量程！立即换大档位'
  if (range.value.kind === 'ohm') {
    if (target.value.kind !== 'ohm') return '欧姆档不能测电源！'
    const divisions = d > 0.001 ? R_MID * (1 - d) / d : Infinity
    return `${divisions.toFixed(1)} 格 × ${range.value.mult} = ${(divisions * (range.value.mult ?? 1)).toFixed(0)} Ω${!zeroed.value ? '（未调零，偏低）' : ''}`
  }
  if (target.value.kind !== range.value.kind) return range.value.kind === 'V' ? '电压档测电阻无读数（需外接电源）' : '电流表不能直接接电源！'
  const divisions = d * 50
  return `${divisions.toFixed(1)} 格 × ${(range.value.full / 50).toPrecision(2)} = ${(d * range.value.full).toPrecision(3)} ${range.value.kind}`
})
const advice = computed(() => {
  const d = Math.abs(deflection.value)
  if (!probesConnected.value) return '接入表笔后读数'
  if (range.value.kind === 'ohm') {
    if (!zeroed.value) return '⚠ 换欧姆档后必须先短接表笔「欧姆调零」'
    return d > 0.3 && d < 0.7 ? '✓ 指针在中央附近，读数较准' : '指针偏离中央，宜换倍率使其居中'
  }
  return d >= 0.33 && d <= 1 ? '✓ 偏转超过 1/3 量程，读数可靠' : d < 0.33 && d > 0 ? '偏转过小，宜换小量程' : ''
})

let needle = 0
function onRangeChange() { zeroed.value = false }
function zeroAdjust() { if (range.value.kind === 'ohm') zeroed.value = true }
function record() {
  if (!probesConnected.value) return
  records.value.push({ target: target.value.name, range: range.value.label, reading: reading.value })
  emit('record', { rows: records.value })
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#1d1d33'; ctx.strokeStyle = '#3d3d5e'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(24, 16, w - 48, h - 32, 18); ctx.fill(); ctx.stroke()
  // 表盘（扇形）
  const px = w / 2, py = h * 0.52, R = Math.min(w * 0.42, h * 0.46)
  const a0 = Math.PI * 1.22, a1 = Math.PI * 1.78
  const ang = (f: number) => a0 + (a1 - a0) * f
  ctx.fillStyle = '#f2ead7'
  ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, R, a0 - 0.04, a1 + 0.04); ctx.closePath(); ctx.fill()
  // 欧姆刻度（外圈，右 0 左 ∞）
  ctx.strokeStyle = '#14142a'; ctx.lineWidth = 1
  for (const om of [0, 5, 10, 15, 20, 30, 50, 100, 200, 500]) {
    const a = ang(R_MID / (R_MID + om))
    ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * (R - 4), py + Math.sin(a) * (R - 4)); ctx.lineTo(px + Math.cos(a) * (R - 16), py + Math.sin(a) * (R - 16)); ctx.stroke()
    label(ctx, `${om}`, px + Math.cos(a) * (R - 26), py + Math.sin(a) * (R - 26), '#14142a', 9)
  }
  label(ctx, '∞', px + Math.cos(ang(0)) * (R - 26), py + Math.sin(ang(0)) * (R - 26), '#14142a', 10)
  label(ctx, 'Ω', px, py - R + 24, '#14142a', 11)
  // 线性刻度（内圈 0~50 格）
  for (let i = 0; i <= 50; i++) {
    const a = ang(i / 50)
    const len = i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 5
    ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * (R - 40), py + Math.sin(a) * (R - 40)); ctx.lineTo(px + Math.cos(a) * (R - 40 - len), py + Math.sin(a) * (R - 40 - len)); ctx.stroke()
    if (i % 10 === 0) label(ctx, `${i}`, px + Math.cos(a) * (R - 66), py + Math.sin(a) * (R - 66), '#14142a', 10)
  }
  label(ctx, 'DC V / mA（0~50 格）', px, py - R * 0.4, '#14142a', 10)
  // 指针
  const f = Math.max(-0.06, Math.min(1.06, needle))
  const na = ang(f)
  ctx.strokeStyle = overRange.value ? '#E05555' : '#c0392b'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * (R - 8), py + Math.sin(na) * (R - 8)); ctx.stroke()
  ctx.fillStyle = '#14142a'; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill()
  // 档位旋钮（下方）
  const kx = w * 0.5, ky = h * 0.83, kr = Math.min(40, h * 0.11)
  ctx.fillStyle = '#23233a'; ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  RANGES.forEach((r, i) => {
    const a = -Math.PI * 0.92 + (i / (RANGES.length - 1)) * Math.PI * 0.84
    label(ctx, r.label, kx + Math.cos(a) * (kr + 40), ky + Math.sin(a) * (kr + 40), r.key === rangeKey.value ? '#F5C542' : '#8a8aa0', 10)
    if (r.key === rangeKey.value) {
      ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + Math.cos(a) * (kr - 6), ky + Math.sin(a) * (kr - 6)); ctx.stroke()
    }
  })
  // 表笔插孔与连线
  ctx.fillStyle = '#E05555'; ctx.beginPath(); ctx.arc(w - 74, h - 44, 7, 0, Math.PI * 2); ctx.fill(); label(ctx, '+ 红', w - 74, h - 26, '#E05555', 10)
  ctx.fillStyle = '#2d2d4a'; ctx.strokeStyle = '#b0b0cc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w - 44, h - 44, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); label(ctx, '− 黑', w - 44, h - 26, '#b0b0cc', 10)
  if (probesConnected.value) {
    ctx.lineWidth = 2
    ctx.strokeStyle = reversed.value ? '#b0b0cc' : '#E05555'; ctx.beginPath(); ctx.moveTo(w - 74, h - 44); ctx.lineTo(w - 96, h - 96); ctx.stroke()
    ctx.strokeStyle = reversed.value ? '#E05555' : '#b0b0cc'; ctx.beginPath(); ctx.moveTo(w - 44, h - 44); ctx.lineTo(w - 24, h - 96); ctx.stroke()
    label(ctx, target.value.name, w - 60, h - 108, '#8a8aa0', 10)
  }
  label(ctx, reading.value, w / 2, 32, overRange.value || reading.value.includes('不能') || reading.value.includes('反偏') ? '#E05555' : '#7fe3b3', 12)
}

onMounted(() => {
  loop = makeLoop((dt) => { needle += (deflection.value - needle) * Math.min(1, dt * 6); draw() })
})
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel title="练习使用多用电表" :graph="false"
    desc="步骤：①机械调零 ②选待测对象 ③选合适档位（电阻用欧姆档且先短接表笔调零；测电压/电流红表笔接高电势端）④读数 = 格数 × 每格值（欧姆档再乘倍率）。"
    formula="欧姆档：R = 格数 × 倍率　直流档：读数 = 格数 × 量程/50">
    <template #controls>
      <label>待测对象
        <select v-model="targetKey" class="sel" @change="probesConnected = false">
          <option v-for="t in TARGETS" :key="t.key" :value="t.key">{{ t.name }}</option>
        </select>
      </label>
      <label>档位旋钮
        <select v-model="rangeKey" class="sel" @change="onRangeChange">
          <option v-for="r in RANGES" :key="r.key" :value="r.key">{{ r.label }}</option>
        </select>
      </label>
      <div class="row">
        <button class="btn ghost" :disabled="range.kind !== 'ohm'" @click="zeroAdjust">Ω 欧姆调零{{ zeroed ? ' ✓' : '' }}</button>
        <button class="btn ghost" @click="reversed = !reversed">{{ reversed ? '表笔已接反' : '表笔正接' }}</button>
      </div>
      <button class="btn" @click="probesConnected = !probesConnected">{{ probesConnected ? '断开表笔' : '🔌 接入表笔' }}</button>
      <div class="readout">{{ reading }}
{{ advice }}</div>
      <button class="btn alt" :disabled="!probesConnected" @click="record">📏 记录读数（{{ records.length }}）</button>
      <p class="hint">欧姆刻度右端为 0、左端为 ∞，中值电阻 15 格；指针在中央附近时误差最小——不合适就换倍率。测电压要并联、测电流要串联，且先估量程从大到小试。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>

<style scoped>
.sel { width: 100%; background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a; border-radius: 6px; padding: 6px; margin-top: 4px; }
</style>
