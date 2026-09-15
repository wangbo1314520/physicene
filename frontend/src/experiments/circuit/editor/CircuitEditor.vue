<script setup lang="ts">
/**
 * 自由电路搭建编辑器（CircuitEngine 的交互层）
 * 托盘放置 → 拖动 → 引脚连线 → 参数/量程/挡位 → 实时求解 → 电表读数/灯亮/电流点 → 故障高亮 → 判分定位
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Circuit, CircuitComponent, ComponentKind, DCSolution, Fault, MeterReading, PinRef, Wire } from '../types'
import { DEFS, createComponent, pinCount, AMMETER_RANGES, VOLTMETER_RANGES, GALVANOMETER_RANGES, MULTIMETER_RANGES, num } from '../components'
import { solveDC, simulateTransient, type TransientResult, type TransientOptions } from '../solver/mna'
import { solveAC, type ACSolution } from '../solver/ac'
import { detectFaults, meterReadings } from '../faults'
import { gradeCircuit, type CircuitTemplate, type GradeResult } from '../grading'
import { drawSymbol, pinWorld, halfSize, PIN_R, displayResistance } from './symbols'
import { fitCanvas, makeLoop, currentDots } from '../../defs/apparatus/circuit'

const props = withDefaults(defineProps<{
  palette: ComponentKind[]
  template?: CircuitTemplate
  initial?: Circuit
  solveMode?: 'dc' | 'ac'
  acFreq?: number
  hint?: string
  height?: number
}>(), { solveMode: 'dc', acFreq: 50, height: 420 })

const emit = defineEmits<{
  (e: 'solved', payload: { sol: DCSolution | null; ac: ACSolution | null; readings: MeterReading[]; faults: Fault[] }): void
  (e: 'graded', result: GradeResult): void
  (e: 'change', circuit: Circuit): void
}>()

// ── 状态 ──
const circuit = reactive<Circuit>({
  components: (props.initial?.components ?? []).map((c) => ({ ...c, props: { ...c.props } })),
  wires: (props.initial?.wires ?? []).map((w) => ({ ...w })),
})
const canvasRef = ref<HTMLCanvasElement | null>(null)
const selId = ref<string | null>(null)          // 选中元件
const selWire = ref<string | null>(null)        // 选中导线
const placing = ref<ComponentKind | null>(null)
const wiringFrom = ref<PinRef | null>(null)
const hoverPin = ref<PinRef | null>(null)
const mouse = ref<[number, number]>([0, 0])
const drag = ref<{ id: string; dx: number; dy: number; moved: boolean } | null>(null)
const solution = ref<DCSolution | null>(null)
const acSolution = ref<ACSolution | null>(null)
const readings = ref<MeterReading[]>([])
const faults = ref<Fault[]>([])
const grade = ref<GradeResult | null>(null)
const highlight = ref<Set<string>>(new Set())
const playback = ref<{ res: TransientResult; start: number; speed: number } | null>(null)
const GRID = 10
let wireSeq = 0, compSeq = 0

const selComp = computed(() => circuit.components.find((c) => c.id === selId.value) ?? null)
const errorFaults = computed(() => faults.value.filter((f) => f.severity === 'error'))
const rangeTable = computed(() => {
  const c = selComp.value
  if (!c) return null
  if (c.kind === 'ammeter') return AMMETER_RANGES
  if (c.kind === 'voltmeter') return VOLTMETER_RANGES
  if (c.kind === 'galvanometer') return GALVANOMETER_RANGES
  if (c.kind === 'multimeter') return MULTIMETER_RANGES[(c.props.mode as 'dcv' | 'dca' | 'ohm') ?? 'dcv']
  return null
})

// ── 求解（拓扑/参数变化时；位置变化不触发） ──
const signature = computed(() =>
  circuit.components.map((c) => `${c.id}:${c.kind}:${JSON.stringify(c.props)}`).join('|') + '#' +
  circuit.wires.map((w) => `${w.a.comp}.${w.a.pin}-${w.b.comp}.${w.b.pin}${w.loose ? '~' : ''}`).join('|') + '#' + props.acFreq + props.solveMode)
watch(signature, () => solve(), { immediate: true })

function solve() {
  grade.value = null
  if (props.solveMode === 'ac') {
    acSolution.value = solveAC(circuit, props.acFreq)
    // 直流解仍用于故障检测（开关/悬空/电表接法）
    solution.value = solveDC(circuit)
  } else {
    acSolution.value = null
    solution.value = solveDC(circuit)
  }
  readings.value = solution.value.ok ? meterReadings(circuit, solution.value) : []
  faults.value = detectFaults(circuit, solution.value)
  emit('solved', { sol: solution.value, ac: acSolution.value, readings: readings.value, faults: faults.value })
  emit('change', circuit)
}

// ── 编辑操作 ──
function addComponent(kind: ComponentKind, x?: number, y?: number, extra: Record<string, number | boolean | string> = {}, id?: string): string {
  const n = circuit.components.length
  const c = createComponent(kind, x ?? 90 + (n % 6) * 100, y ?? 70 + Math.floor(n / 6) * 110, id ?? `${kind}_${++compSeq}`, extra)
  circuit.components.push(c)
  selId.value = c.id; selWire.value = null
  return c.id
}
function removeComponent(id: string) {
  circuit.wires = circuit.wires.filter((w) => w.a.comp !== id && w.b.comp !== id)
  const i = circuit.components.findIndex((c) => c.id === id)
  if (i >= 0) circuit.components.splice(i, 1)
  if (selId.value === id) selId.value = null
}
function removeWire(id: string) {
  circuit.wires = circuit.wires.filter((w) => w.id !== id)
  if (selWire.value === id) selWire.value = null
}
function connect(a: PinRef | string, b: PinRef | string): string | null {
  const pa = typeof a === 'string' ? parsePin(a) : a, pb = typeof b === 'string' ? parsePin(b) : b
  if (pa.comp === pb.comp && pa.pin === pb.pin) return null
  if (!circuit.components.some((c) => c.id === pa.comp) || !circuit.components.some((c) => c.id === pb.comp)) return null
  const w: Wire = { id: `w${++wireSeq}`, a: pa, b: pb }
  circuit.wires.push(w)
  return w.id
}
function parsePin(s: string): PinRef { const i = s.lastIndexOf(':'); return { comp: s.slice(0, i), pin: Number(s.slice(i + 1)) } }
function setProps(id: string, patch: Record<string, number | boolean | string>) {
  const c = circuit.components.find((x) => x.id === id)
  if (c) Object.assign(c.props, patch)
}
function clearAll() { circuit.components.splice(0); circuit.wires = []; selId.value = null; selWire.value = null; grade.value = null; highlight.value = new Set() }
function rotateSel() { const c = selComp.value; if (c) c.rot = ((c.rot + 90) % 360) as 0 | 90 | 180 | 270 }
function deleteSel() { if (selWire.value) removeWire(selWire.value); else if (selId.value) removeComponent(selId.value) }
function toggleSwitch(c: CircuitComponent) {
  if (c.kind === 'switch') c.props.closed = !(c.props.closed === true)
  else if (c.kind === 'spdt_switch') c.props.pos = (num(c, 'pos', 0) + 1) % 3
}
function setMultimeterMode(c: CircuitComponent, mode: string) {
  c.props.mode = mode
  c.props.rangeKey = Object.keys(MULTIMETER_RANGES[mode as 'dcv' | 'dca' | 'ohm'])[0]
}
function doGrade(): GradeResult | null {
  if (!props.template) return null
  const iOv = acSolution.value?.ok
    ? Object.fromEntries(Object.entries(acSolution.value.elements).map(([id, e]) => [id, e.iRms]))
    : undefined
  grade.value = gradeCircuit(circuit, props.template, solution.value ?? undefined, iOv)
  highlight.value = new Set(grade.value.issues.flatMap((i) => i.compIds))
  emit('graded', grade.value)
  return grade.value
}
function focusIssue(ids: string[]) { highlight.value = new Set(ids) }
function runTransient(opt: TransientOptions): TransientResult { return simulateTransient(circuit, opt) }
function play(res: TransientResult, speed = 1) { playback.value = { res, start: performance.now(), speed } }
function stopPlayback() { playback.value = null }

// ── 几何 ──
function wirePath(w: Wire): [number, number][] {
  const ca = circuit.components.find((c) => c.id === w.a.comp), cb = circuit.components.find((c) => c.id === w.b.comp)
  if (!ca || !cb) return []
  const A = pinWorld(ca, w.a.pin), B = pinWorld(cb, w.b.pin)
  if (Math.abs(A[0] - B[0]) < 1 || Math.abs(A[1] - B[1]) < 1) return [A, B]
  return [A, [B[0], A[1]], B]
}
function pinAt(x: number, y: number): PinRef | null {
  for (const c of circuit.components) for (let p = 0; p < pinCount(c.kind); p++) {
    const [px, py] = pinWorld(c, p)
    if (Math.hypot(px - x, py - y) <= PIN_R + 5) return { comp: c.id, pin: p }
  }
  return null
}
function compAt(x: number, y: number): CircuitComponent | null {
  for (let i = circuit.components.length - 1; i >= 0; i--) {
    const c = circuit.components[i]; const [hw, hh] = halfSize(c)
    if (Math.abs(x - c.x) <= hw && Math.abs(y - c.y) <= hh) return c
  }
  return null
}
function wireAt(x: number, y: number): Wire | null {
  for (const w of circuit.wires) {
    const p = wirePath(w)
    for (let i = 0; i + 1 < p.length; i++) if (distToSeg(x, y, p[i], p[i + 1]) < 5) return w
  }
  return null
}
function distToSeg(x: number, y: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy
  const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))
}
const snap = (v: number) => Math.round(v / GRID) * GRID

// ── 鼠标 ──
function local(e: MouseEvent): [number, number] {
  const r = canvasRef.value!.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}
function onDown(e: MouseEvent) {
  const [x, y] = local(e)
  if (e.button === 2) { // 右键：删元件/导线
    const c = compAt(x, y); if (c) { removeComponent(c.id); return }
    const w = wireAt(x, y); if (w) { removeWire(w.id); return }
    return
  }
  if (placing.value) { addComponent(placing.value, snap(x), snap(y)); placing.value = null; return }
  const pin = pinAt(x, y)
  if (pin) {
    if (wiringFrom.value) { connect(wiringFrom.value, pin); wiringFrom.value = null }
    else wiringFrom.value = pin
    return
  }
  if (wiringFrom.value) { wiringFrom.value = null; return }
  const c = compAt(x, y)
  if (c) { selId.value = c.id; selWire.value = null; drag.value = { id: c.id, dx: x - c.x, dy: y - c.y, moved: false }; return }
  const w = wireAt(x, y)
  if (w) { selWire.value = w.id; selId.value = null; return }
  selId.value = null; selWire.value = null
}
function onMove(e: MouseEvent) {
  const [x, y] = local(e); mouse.value = [x, y]
  hoverPin.value = pinAt(x, y)
  if (drag.value) {
    const c = circuit.components.find((k) => k.id === drag.value!.id)
    if (c) { c.x = snap(x - drag.value.dx); c.y = snap(y - drag.value.dy); drag.value.moved = true }
  }
}
function onUp() {
  if (drag.value && !drag.value.moved) { // 原地点击：开关切换
    const c = circuit.components.find((k) => k.id === drag.value!.id)
    if (c && (c.kind === 'switch' || c.kind === 'spdt_switch')) toggleSwitch(c)
  }
  drag.value = null
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); e.preventDefault() }
  if (e.key === 'Escape') { wiringFrom.value = null; placing.value = null }
  if (e.key === 'r' && selComp.value) rotateSel()
}

// ── 绘制 ──
let loop: { stop: () => void } | null = null
function displayElements(): DCSolution['elements'] {
  const pb = playback.value
  if (!pb) {
    if (acSolution.value?.ok) { // 交流：按有效值显示（灯亮、电表读数、电流点）
      const out: DCSolution['elements'] = {}
      for (const [id, e] of Object.entries(acSolution.value.elements)) out[id] = { v: e.vRms, i: e.iRms, p: e.vRms * e.iRms * Math.cos(e.phase) }
      return out
    }
    return solution.value?.elements ?? {}
  }
  const dt = pb.res.t[1] - pb.res.t[0] || 1e-3
  const elapsed = ((performance.now() - pb.start) / 1000) * pb.speed
  const idx = Math.min(pb.res.t.length - 1, Math.floor(elapsed / dt))
  const out: DCSolution['elements'] = {}
  for (const [id, s] of Object.entries(pb.res.elements)) {
    const v = s.v[idx] ?? 0, i = s.i[idx] ?? 0
    out[id] = { v, i, p: v * i }
  }
  return out
}
function draw(t: number) {
  const cv = canvasRef.value
  if (!cv) return
  const { ctx, w, h } = fitCanvas(cv)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#14142a'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#20203a'
  for (let x = GRID; x < w; x += GRID * 2) for (let y = GRID; y < h; y += GRID * 2) ctx.fillRect(x - 0.5, y - 0.5, 1, 1)

  const els = displayElements()
  const pseudo: DCSolution = { ok: true, nodeCount: 0, nodeOf: () => -1, nodeV: [], elements: els, sources: {} }
  const rd = playback.value || acSolution.value?.ok ? meterReadings(circuit, pseudo) : readings.value
  const rdMap = new Map(rd.map((m) => [m.compId, m]))
  const faultIds = new Set(errorFaults.value.flatMap((f) => f.compIds))
  const faultWires = new Set(faults.value.flatMap((f) => f.wireIds ?? []))
  const pulse = 0.5 + 0.5 * Math.sin(t * 5)

  // 导线
  for (const wr of circuit.wires) {
    const p = wirePath(wr); if (p.length < 2) continue
    const sel = wr.id === selWire.value
    ctx.strokeStyle = sel ? '#F5C542' : wr.loose || faultWires.has(wr.id) ? '#E05555' : '#8a8aa0'
    ctx.lineWidth = sel ? 3 : 2; ctx.setLineDash(wr.loose ? [6, 5] : [])
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.stroke()
    ctx.setLineDash([])
    // 电流点：i_w(P→Q) = (−into_P + into_Q)/2
    const ia = intoPin(els, wr.a), ib = intoPin(els, wr.b)
    const iw = (-ia + ib) / 2
    if (Math.abs(iw) > 1e-6) {
      const speed = Math.min(2, 0.25 + Math.log10(1 + Math.abs(iw) * 1000) * 0.5)
      currentDots(ctx, iw > 0 ? p : [...p].reverse(), t * 0.5, speed, '#F5C542')
    }
  }
  // 连线预览
  if (wiringFrom.value) {
    const c = circuit.components.find((k) => k.id === wiringFrom.value!.comp)
    if (c) {
      const A = pinWorld(c, wiringFrom.value.pin)
      ctx.strokeStyle = '#F5C542'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(mouse.value[0], A[1]); ctx.lineTo(mouse.value[0], mouse.value[1]); ctx.stroke(); ctx.setLineDash([])
    }
  }
  // 元件
  for (const c of circuit.components) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate((c.rot * Math.PI) / 180)
    const bad = faultIds.has(c.id) || highlight.value.has(c.id)
    if (bad) { ctx.shadowColor = `rgba(224,85,85,${0.5 + 0.5 * pulse})`; ctx.shadowBlur = 14 }
    if (c.id === selId.value) { ctx.strokeStyle = 'rgba(245,197,66,0.35)'; ctx.lineWidth = 1; const [hw, hh] = [32, c.kind === 'rheostat' ? 26 : 20]; ctx.strokeRect(-hw, -hh, hw * 2, hh * 2) }
    drawSymbol(ctx, c, { result: els[c.id], reading: rdMap.get(c.id), selected: c.id === selId.value, faulted: bad })
    ctx.shadowBlur = 0
    ctx.restore()
    // 引脚
    for (let p = 0; p < pinCount(c.kind); p++) {
      const [px, py] = pinWorld(c, p)
      const hot = (hoverPin.value?.comp === c.id && hoverPin.value.pin === p) || (wiringFrom.value?.comp === c.id && wiringFrom.value.pin === p)
      const connected = circuit.wires.some((wr) => (wr.a.comp === c.id && wr.a.pin === p) || (wr.b.comp === c.id && wr.b.pin === p))
      ctx.fillStyle = hot ? '#F5C542' : connected ? '#3ecf8e' : '#5c5c7a'
      ctx.beginPath(); ctx.arc(px, py, hot ? PIN_R + 2 : PIN_R, 0, Math.PI * 2); ctx.fill()
      if (!connected && !hot) { ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1; ctx.stroke() }
    }
  }
  // 放置幽灵
  if (placing.value) {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.translate(snap(mouse.value[0]), snap(mouse.value[1]))
    drawSymbol(ctx, createComponent(placing.value, 0, 0, 'ghost'), {})
    ctx.restore()
  }
  // 回放进度
  if (playback.value) {
    const pb = playback.value
    const total = pb.res.t.at(-1) ?? 1
    const elapsed = Math.min(total, ((performance.now() - pb.start) / 1000) * pb.speed)
    ctx.fillStyle = '#2f2f4a'; ctx.fillRect(12, h - 14, w - 24, 4)
    ctx.fillStyle = '#3ecf8e'; ctx.fillRect(12, h - 14, (w - 24) * (elapsed / total), 4)
    ctx.fillStyle = '#7fe3b3'; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`t = ${elapsed.toFixed(2)} s`, 12, h - 22)
    if (elapsed >= total) playback.value = null
  }
}
/** 从外部流入某引脚的电流（pin0 = +i，pin1 = −i；三端/继电器触点等无法归属的引脚记 0） */
function intoPin(els: DCSolution['elements'], ref: PinRef): number {
  const r = els[ref.comp]; if (!r) return 0
  if (ref.pin >= 2) { const c = circuit.components.find((k) => k.id === ref.comp); return c?.kind === 'rheostat' ? -r.i : 0 }
  return ref.pin === 0 ? r.i : -r.i
}

onMounted(() => {
  loop = makeLoop((_, t) => draw(t))
  if (import.meta.env.DEV) (window as unknown as { __circuitEditor?: unknown }).__circuitEditor = api
})
onUnmounted(() => { loop?.stop(); if (import.meta.env.DEV) delete (window as unknown as { __circuitEditor?: unknown }).__circuitEditor })

const api = {
  circuit, addComponent, removeComponent, connect, removeWire, setProps, clearAll, solve, doGrade, runTransient, play, stopPlayback,
  readings: () => readings.value, faults: () => faults.value, solution: () => solution.value, acSolution: () => acSolution.value,
  toggleSwitch: (id: string) => { const c = circuit.components.find((k) => k.id === id); if (c) toggleSwitch(c) },
}
defineExpose(api)
</script>

<template>
  <div class="ce" :style="{ '--h': height + 'px' }">
    <aside class="tray">
      <h4>元件托盘</h4>
      <div class="pal">
        <button v-for="k in palette" :key="k" class="pbtn" :class="{ on: placing === k }" :title="`点击后在画布点一下放置；双击直接放入`"
                @click="placing = placing === k ? null : k" @dblclick.prevent="placing = null; addComponent(k)">{{ DEFS[k].label }}</button>
      </div>
      <p v-if="hint" class="hint">📐 {{ hint }}</p>
      <p class="hint">🖱 点引脚→再点另一引脚连线 · 拖动移动 · 点开关切换 · 右键删除 · Del 删除 · R 旋转</p>

      <template v-if="selComp">
        <h4>参数：{{ DEFS[selComp.kind].label }} <span class="id">{{ selComp.id }}</span></h4>
        <div class="params">
          <label v-if="selComp.kind === 'battery' || selComp.kind === 'dc_source'">电动势 {{ Number(selComp.props.emf).toFixed(1) }} V
            <input type="range" min="0.5" max="12" step="0.5" v-model.number="selComp.props.emf"></label>
          <label v-if="selComp.kind === 'battery'">内阻 {{ Number(selComp.props.r).toFixed(1) }} Ω
            <input type="range" min="0" max="5" step="0.1" v-model.number="selComp.props.r"></label>
          <template v-if="selComp.kind === 'ac_source'">
            <label>有效值 {{ Number(selComp.props.vrms).toFixed(1) }} V<input type="range" min="0.5" max="12" step="0.5" v-model.number="selComp.props.vrms"></label>
            <label>频率 {{ Number(selComp.props.freq).toFixed(0) }} Hz<input type="range" min="5" max="2000" step="5" v-model.number="selComp.props.freq"></label>
          </template>
          <label v-if="selComp.kind === 'resistor'">阻值 {{ Number(selComp.props.R) }} Ω
            <input type="range" min="1" max="2000" step="1" v-model.number="selComp.props.R"></label>
          <template v-if="selComp.kind === 'rheostat'">
            <label>最大阻值 {{ Number(selComp.props.Rmax) }} Ω<input type="range" min="5" max="200" step="5" v-model.number="selComp.props.Rmax"></label>
            <label>滑片位置 {{ (Number(selComp.props.pos) * 100).toFixed(0) }}%（A→C 段）<input type="range" min="0" max="1" step="0.01" v-model.number="selComp.props.pos"></label>
          </template>
          <label v-if="selComp.kind === 'switch'" class="chk"><input type="checkbox" v-model="selComp.props.closed"> 闭合</label>
          <label v-if="selComp.kind === 'spdt_switch'">位置
            <select v-model.number="selComp.props.pos"><option :value="0">断开</option><option :value="1">接 1</option><option :value="2">接 2</option></select></label>
          <label v-if="rangeTable && selComp.kind !== 'multimeter'">量程
            <select v-model="selComp.props.rangeKey"><option v-for="(_, k) in rangeTable" :key="k" :value="k">{{ k }}</option></select></label>
          <template v-if="selComp.kind === 'multimeter'">
            <label>挡位
              <select :value="selComp.props.mode" @change="setMultimeterMode(selComp!, ($event.target as HTMLSelectElement).value)">
                <option value="dcv">直流电压</option><option value="dca">直流电流</option><option value="ohm">欧姆</option></select></label>
            <label>量程 / 倍率<select v-model="selComp.props.rangeKey"><option v-for="(_, k) in rangeTable" :key="k" :value="k">{{ k }}</option></select></label>
          </template>
          <label v-if="selComp.kind === 'capacitor'">电容
            <select v-model.number="selComp.props.C"><option :value="100e-6">100 μF</option><option :value="470e-6">470 μF</option><option :value="1000e-6">1000 μF</option><option :value="4700e-6">4700 μF</option></select></label>
          <label v-if="selComp.kind === 'inductor'">自感 {{ Number(selComp.props.L).toFixed(2) }} H
            <input type="range" min="0.05" max="10" step="0.05" v-model.number="selComp.props.L"></label>
          <label v-if="selComp.kind === 'photoresistor'">光照 {{ (Number(selComp.props.light) * 100).toFixed(0) }}%
            <input type="range" min="0" max="1" step="0.01" v-model.number="selComp.props.light"></label>
          <template v-if="selComp.kind === 'wire_sample'">
            <label>长度 L = {{ Number(selComp.props.L).toFixed(2) }} m<input type="range" min="0.2" max="1" step="0.01" v-model.number="selComp.props.L"></label>
            <label>直径 d = {{ Number(selComp.props.d).toFixed(2) }} mm（螺旋测微器）<input type="range" min="0.2" max="1" step="0.01" v-model.number="selComp.props.d"></label>
          </template>
          <label v-if="selComp.kind === 'relay'">吸合电压 {{ Number(selComp.props.vOn).toFixed(1) }} V（线圈 {{ selComp.props.rCoil }} Ω）
            <input type="range" min="1" max="6" step="0.5" v-model.number="selComp.props.vOn"></label>
          <label v-if="selComp.kind === 'coil'">匝数 N = {{ selComp.props.N }}（感应电动势由磁通变化产生，见实验操作）
            <input type="range" min="50" max="500" step="50" v-model.number="selComp.props.N"></label>
          <p v-if="displayResistance(selComp)" class="ro">{{ displayResistance(selComp) }}</p>
          <div class="row"><button class="mini" @click="rotateSel">⟳ 旋转</button><button class="mini danger" @click="deleteSel">🗑 删除</button></div>
        </div>
      </template>

      <div class="row top">
        <button class="mini" @click="clearAll">🧹 清空</button>
        <button v-if="template" class="mini primary" @click="doGrade">✅ 提交判分</button>
      </div>

      <div v-if="grade" class="grade" :class="{ pass: grade.passed }">
        <b>{{ grade.passed ? '✅ 电路正确' : '❌ 未通过' }}</b> {{ grade.score }} / {{ grade.max }}
        <ul><li v-for="(i, k) in grade.issues" :key="k" @click="focusIssue(i.compIds)">{{ i.message }}</li></ul>
      </div>
      <div v-if="faults.length" class="faults">
        <div v-for="(f, k) in faults" :key="k" class="f" :class="f.severity" @click="focusIssue(f.compIds)">{{ f.severity === 'error' ? '⛔' : '⚠️' }} {{ f.message }}</div>
      </div>
      <div v-else-if="circuit.components.length" class="ok">✔ 未检测到接线故障</div>
    </aside>
    <div class="board" tabindex="0" @keydown="onKey" @contextmenu.prevent>
      <canvas ref="canvasRef" @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp"></canvas>
    </div>
  </div>
</template>

<style scoped>
.ce { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 10px; min-height: var(--h); }
.tray { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 12px; font-size: 12px; color: #8a8aa0; overflow-y: auto; max-height: calc(var(--h) + 60px); }
.tray h4 { font-size: 13px; color: #b0b0cc; margin: 4px 0 8px; }
.tray h4 .id { font-weight: normal; color: #5c5c7a; font-size: 11px; }
.pal { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.pbtn { background: #14142a; border: 1px solid #2f2f4a; color: #b0b0cc; border-radius: 6px; padding: 5px 8px; cursor: pointer; font-size: 12px; }
.pbtn:hover { border-color: #F5C542; }
.pbtn.on { background: #F5C542; color: #1a1a2e; border-color: #F5C542; }
.hint { font-size: 11px; color: #6c6c85; line-height: 1.5; margin: 6px 0; }
.params label { display: block; margin-bottom: 8px; font-size: 12px; color: #8a8aa0; }
.params label input[type=range], .params select { width: 100%; margin-top: 2px; }
.params label.chk { display: flex; align-items: center; gap: 6px; }
.params .ro { color: #7fe3b3; font-family: Consolas, monospace; font-size: 12px; margin: 4px 0; }
.row { display: flex; gap: 6px; margin-top: 6px; }
.row.top { margin-top: 10px; }
.mini { flex: 1; background: #14142a; border: 1px solid #2f2f4a; color: #b0b0cc; border-radius: 6px; padding: 6px; cursor: pointer; font-size: 12px; }
.mini.primary { background: #3ecf8e; color: #1a1a2e; border-color: #3ecf8e; font-weight: 600; }
.mini.danger { color: #E05555; }
.grade { margin-top: 10px; padding: 8px; border-radius: 8px; background: #2a1d1d; border: 1px solid #5a2f2f; color: #f0b0b0; }
.grade.pass { background: #1d2a22; border-color: #2f5a3f; color: #7fe3b3; }
.grade ul { margin: 6px 0 0 14px; padding: 0; }
.grade li { cursor: pointer; margin-bottom: 3px; }
.faults { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.faults .f { padding: 5px 7px; border-radius: 6px; font-size: 11px; cursor: pointer; line-height: 1.4; }
.faults .f.error { background: #2a1d1d; color: #f0b0b0; border: 1px solid #5a2f2f; }
.faults .f.warning { background: #2a2618; color: #f5d78a; border: 1px solid #5a4d2f; }
.ok { margin-top: 10px; color: #3ecf8e; font-size: 12px; }
.board { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; min-height: var(--h); outline: none; }
.board:focus { border-color: #3d3d5c; }
.board canvas { display: block; width: 100%; height: var(--h); cursor: crosshair; }
</style>
