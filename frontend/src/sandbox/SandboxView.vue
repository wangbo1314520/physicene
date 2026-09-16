<script setup lang="ts">
/**
 * B13 自由搭建实验（沙盒）：元件面板 → 拖拽画布 → 场景识别 → 内嵌对应求解器运行 → 数据面板 + AI 助手。
 * 布局按方案书 §4.1：顶栏 | 元件面板 · 画布 · 属性面板 | 运行区 | 数据面板 | AI 助手
 */
import { computed, onMounted, reactive, ref, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { CATALOG, DOMAINS, byType, defaultsOf, type Dim, type Domain } from './catalog'
import { recognize, type Placed, type Recognition } from './recognizer'
import MechScene from '../experiments/defs/gaokao/MechScene.vue'
import EMScene from '../experiments/defs/gaokao/EMScene.vue'
import CircuitEditor from '../experiments/circuit/editor/CircuitEditor.vue'
import SandboxData, { type RunRecord } from './SandboxData.vue'
import SandboxAi from './SandboxAi.vue'

const router = useRouter()
const sceneName = ref('未命名场景')
const domain = ref<Domain>('mech')
const search = ref('')
const elements = reactive<Placed[]>([])
const selectedId = ref<string | null>(null)
const linkMode = ref(false)
const linkFrom = ref<string | null>(null)
const undo: string[] = []
const redo: string[] = []
const toast = ref('')
const running = ref(false)
const runKey = ref(0)
const records = ref<RunRecord[]>([])
const canvasEl = ref<HTMLDivElement | null>(null)
let seq = 1

const palette = computed(() => CATALOG.filter((e) => e.domain === domain.value && (!search.value || e.label.includes(search.value) || e.desc.includes(search.value))))
const selected = computed(() => elements.find((e) => e.id === selectedId.value) ?? null)
const selectedSpec = computed(() => (selected.value ? byType.get(selected.value.type) : undefined))
const dim = computed<Dim>(() => {
  const ds = elements.map((e) => byType.get(e.type)?.dims ?? [])
  if (ds.some((d) => d.length === 1 && d[0] === '3D') || ds.every((d) => d.includes('3D')) && ds.length && !ds.every((d) => d.includes('2.5D'))) return '3D'
  if (ds.some((d) => d.includes('2.5D') && !d.includes('2D'))) return '2.5D'
  return '2D'
})
const rec = computed<Recognition>(() => recognize(elements))
const runnerDef = computed(() => {
  const t = rec.value.target
  if (!t || (t.kind !== 'mech' && t.kind !== 'em')) return null
  const d = t.def
  return { ...d, id: `sandbox-${d.id}`, params: d.params.map((p) => (p.key in rec.value.params ? { ...p, default: rec.value.params[p.key] } : p)) }
})
const links = computed(() => { const out: [Placed, Placed][] = []; for (const e of elements) for (const to of e.links) { const o = elements.find((x) => x.id === to); if (o && e.id < o.id) out.push([e, o]) } return out })

function snapshot() { undo.push(JSON.stringify(elements)); if (undo.length > 60) undo.shift(); redo.length = 0 }
function restore(json: string) { const arr = JSON.parse(json) as Placed[]; elements.splice(0, elements.length, ...arr); selectedId.value = null }
function doUndo() { const s = undo.pop(); if (s === undefined) return; redo.push(JSON.stringify(elements)); restore(s) }
function doRedo() { const s = redo.pop(); if (s === undefined) return; undo.push(JSON.stringify(elements)); restore(s) }
function say(t: string) { toast.value = t; window.setTimeout(() => { if (toast.value === t) toast.value = '' }, 2200) }

function addElement(type: string, x?: number, y?: number, params?: Record<string, number>): Placed {
  const spec = byType.get(type); if (!spec) throw new Error(`unknown element ${type}`)
  snapshot()
  const n = elements.filter((e) => e.type === type).length
  const p: Placed = { id: `${type}-${seq++}`, type, x: x ?? 80 + (elements.length % 6) * 120, y: y ?? 70 + Math.floor(elements.length / 6) * 110 + n * 8, params: { ...defaultsOf(spec), ...(params ?? {}) }, links: [] }
  elements.push(p); selectedId.value = p.id; running.value = false
  return p
}
function removeSelected() { if (!selected.value) return; snapshot(); const id = selected.value.id; elements.splice(elements.findIndex((e) => e.id === id), 1); for (const e of elements) e.links = e.links.filter((l) => l !== id); selectedId.value = null; running.value = false }
function duplicateSelected() { if (!selected.value) return; addElement(selected.value.type, selected.value.x + 40, selected.value.y + 30, { ...selected.value.params }) }
function clearAll() { if (!elements.length) return; snapshot(); elements.splice(0); selectedId.value = null; running.value = false; records.value = [] }

/* 拖拽：面板 → 画布；画布内移动 */
function onDragStart(ev: DragEvent, type: string) { ev.dataTransfer?.setData('application/x-sandbox-type', type) }
function onDrop(ev: DragEvent) {
  const type = ev.dataTransfer?.getData('application/x-sandbox-type'); if (!type || !canvasEl.value) return
  const r = canvasEl.value.getBoundingClientRect(); addElement(type, ev.clientX - r.left - 40, ev.clientY - r.top - 24)
}
let drag: { id: string; dx: number; dy: number } | null = null
function onCardDown(ev: PointerEvent, e: Placed) {
  if (linkMode.value) {
    if (!linkFrom.value) { linkFrom.value = e.id; say(`已选「${byType.get(e.type)?.label}」，再点另一个元件完成连线`) }
    else if (linkFrom.value !== e.id) { snapshot(); const a = elements.find((x) => x.id === linkFrom.value)!; if (!a.links.includes(e.id)) { a.links.push(e.id); e.links.push(a.id) } linkFrom.value = null; say('已连线') }
    return
  }
  selectedId.value = e.id
  const r = canvasEl.value!.getBoundingClientRect(); drag = { id: e.id, dx: ev.clientX - r.left - e.x, dy: ev.clientY - r.top - e.y }
  ;(ev.target as HTMLElement).setPointerCapture(ev.pointerId)
}
function onCardMove(ev: PointerEvent) { if (!drag || !canvasEl.value) return; const e = elements.find((x) => x.id === drag!.id); if (!e) return; const r = canvasEl.value.getBoundingClientRect(); e.x = Math.max(0, Math.min(r.width - 90, ev.clientX - r.left - drag.dx)); e.y = Math.max(0, Math.min(r.height - 60, ev.clientY - r.top - drag.dy)) }
function onCardUp() { drag = null }
function unlink(a: Placed, b: Placed) { snapshot(); a.links = a.links.filter((l) => l !== b.id); b.links = b.links.filter((l) => l !== a.id) }

/* 运行 */
function run() {
  const t = rec.value.target
  if (!t) { say('先搭出一个可识别的组合（看右侧提示）'); return }
  if (t.kind === 'dyn4j') { localStorage.setItem('ps_sandbox_handoff', JSON.stringify({ name: sceneName.value, elements: JSON.parse(JSON.stringify(elements)) })); void router.push('/lab'); return }
  if (t.kind === 'link') { void router.push(t.to); return }
  running.value = true; runKey.value++
}
function onRecord(d: unknown) {
  const r = (d ?? {}) as Record<string, unknown>
  records.value.push({ at: new Date().toLocaleTimeString(), family: rec.value.title, t: typeof r.t === 'number' ? r.t : typeof r.finishedAt === 'number' ? (r.finishedAt as number) : null, params: (r.params as Record<string, number>) ?? rec.value.params, readout: String(r.readout ?? ''), events: Array.isArray(r.events) ? (r.events as string[]) : [] })
}
watch(() => JSON.stringify(elements.map((e) => [e.type, e.params, e.links])), () => { running.value = false })

/* 保存 / 导入导出 */
interface Saved { id: string; name: string; at: string; elements: Placed[] }
const saved = ref<Saved[]>(JSON.parse(localStorage.getItem('ps_sandbox_scenes') ?? '[]'))
function persist() { localStorage.setItem('ps_sandbox_scenes', JSON.stringify(saved.value)) }
function saveScene() { if (!elements.length) return say('画布为空'); const s: Saved = { id: String(Date.now()), name: sceneName.value || '未命名场景', at: new Date().toLocaleString(), elements: JSON.parse(JSON.stringify(elements)) }; saved.value.unshift(s); if (saved.value.length > 30) saved.value.pop(); persist(); say('已保存到本机') }
function loadScene(s: Saved) { snapshot(); sceneName.value = s.name; restore(JSON.stringify(s.elements)); seq = elements.length + 1; say(`已载入「${s.name}」`) }
function deleteScene(s: Saved) { saved.value = saved.value.filter((x) => x.id !== s.id); persist() }
function exportJson() { const blob = new Blob([JSON.stringify({ name: sceneName.value, dim: dim.value, recognition: rec.value.title, elements, records: records.value }, null, 2)], { type: 'application/json' }); dl(URL.createObjectURL(blob), `${sceneName.value}.json`) }
function importJson(ev: Event) { const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return; f.text().then((txt) => { try { const j = JSON.parse(txt); snapshot(); sceneName.value = j.name ?? sceneName.value; restore(JSON.stringify(j.elements ?? [])); seq = elements.length + 1; say('已导入') } catch { say('JSON 无法解析') } }) }
function exportPng() { const cv = document.querySelector<HTMLCanvasElement>('.runner canvas'); if (!cv) return say('先运行一次再截图'); try { const url = cv.toDataURL('image/png'); if (url.length < 3000) return say('3D 画面请用系统截图'); dl(url, `${sceneName.value}.png`) } catch { say('无法导出该画面') } }
function dl(url: string, name: string) { const a = document.createElement('a'); a.href = url; a.download = name; a.click() }

onMounted(() => {
  // DEV 钩子：E2E 用脚本化搭建
  ;(window as unknown as { __sandbox: unknown }).__sandbox = {
    add: (type: string, params?: Record<string, number>, x?: number, y?: number) => addElement(type, x, y, params).id,
    link: (a: string, b: string) => { const A = elements.find((e) => e.id === a), B = elements.find((e) => e.id === b); if (A && B) { A.links.push(b); B.links.push(a) } },
    clear: clearAll, run, recognize: () => JSON.parse(JSON.stringify({ family: rec.value.family, title: rec.value.title, params: rec.value.params, kind: rec.value.target?.kind ?? null, notes: rec.value.notes })),
    records: () => JSON.parse(JSON.stringify(records.value)), elements: () => JSON.parse(JSON.stringify(elements)), setName: (n: string) => { sceneName.value = n },
  }
})
const componentTarget = computed(() => (rec.value.target?.kind === 'component' ? (rec.value.target as { component: Component }).component : null))
</script>

<template>
  <main class="sandbox">
    <header class="top">
      <input v-model="sceneName" class="name" title="场景名">
      <span class="badge" :class="dim === '3D' ? 'b3' : dim === '2.5D' ? 'b25' : 'b2'">纯{{ dim }}</span>
      <span class="sub">自由搭建实验 · 元件自由选、自由连、自由设参、自由运行，AI 在旁识别与讲解</span>
      <span class="spacer"></span>
      <button class="ghost" @click="saveScene">💾 保存</button>
      <button class="ghost" @click="exportJson">⇩ JSON</button>
      <label class="ghost file">⇧ 导入<input type="file" accept="application/json" @change="importJson"></label>
      <button class="ghost" @click="exportPng">🖼 PNG</button>
      <span v-if="toast" class="toast">{{ toast }}</span>
    </header>

    <section class="work">
      <aside class="palette">
        <div class="tabs"><button v-for="d in DOMAINS" :key="d.key" :class="{ active: domain === d.key }" @click="domain = d.key">{{ d.icon }} {{ d.label }}</button></div>
        <input v-model="search" class="search" placeholder="搜索元件…">
        <div class="items">
          <div v-for="e in palette" :key="e.type" class="item" draggable="true" :title="e.desc" @dragstart="onDragStart($event, e.type)" @click="addElement(e.type)">
            <span class="ic" :style="{ color: e.color }">{{ e.icon }}</span><span class="lb">{{ e.label }}</span><span class="dm">{{ e.dims.join('/') }}</span>
          </div>
        </div>
        <div v-if="saved.length" class="saved"><h4>本机场景</h4><div v-for="s in saved" :key="s.id" class="srow"><a @click="loadScene(s)">{{ s.name }}</a><small>{{ s.at }}</small><button @click="deleteScene(s)">×</button></div></div>
      </aside>

      <section class="canvas-wrap">
        <div class="tools">
          <button :disabled="!selected" @click="removeSelected">🗑 删除</button>
          <button :disabled="!selected" @click="duplicateSelected">⧉ 复制</button>
          <button :disabled="!undo.length" @click="doUndo">↶ 撤销</button>
          <button :disabled="!redo.length" @click="doRedo">↷ 重做</button>
          <button :class="{ active: linkMode }" @click="linkMode = !linkMode; linkFrom = null">🔗 连线{{ linkMode ? '中…' : '' }}</button>
          <button @click="clearAll">✕ 清空</button>
          <span class="spacer"></span>
          <button class="primary" :disabled="!rec.target" @click="run">▶ 识别并运行</button>
        </div>
        <div ref="canvasEl" class="canvas" :class="'dim-' + dim.replace('.', '_')" @dragover.prevent @drop="onDrop" @pointermove="onCardMove" @pointerup="onCardUp" @pointerdown.self="selectedId = null">
          <svg class="wires"><line v-for="([a, b], i) in links" :key="i" :x1="a.x + 45" :y1="a.y + 30" :x2="b.x + 45" :y2="b.y + 30" @click.stop="unlink(a, b)" /></svg>
          <div v-for="e in elements" :key="e.id" class="card" :class="{ sel: e.id === selectedId, from: e.id === linkFrom }" :style="{ left: e.x + 'px', top: e.y + 'px', borderColor: byType.get(e.type)?.color }" @pointerdown.stop="onCardDown($event, e)">
            <span class="ic" :style="{ color: byType.get(e.type)?.color }">{{ byType.get(e.type)?.icon }}</span>
            <span class="lb">{{ byType.get(e.type)?.label }}</span>
            <span class="pv">{{ Object.entries(e.params).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(' ') }}</span>
          </div>
          <p v-if="!elements.length" class="empty">从左侧拖入元件（或点击添加）开始搭建。例：斜面 + 弹簧 + 物块；导轨 + 导体棒 + 磁场区域；电池 + 电阻 + 电流表 + 电压表；玻璃管 + 液柱 + 温度源</p>
        </div>
      </section>

      <aside class="props">
        <div class="box">
          <h4>属性 <small v-if="selectedSpec">· {{ selectedSpec.label }}</small></h4>
          <template v-if="selected && selectedSpec">
            <p class="desc">{{ selectedSpec.desc }}</p>
            <template v-for="p in selectedSpec.params" :key="p.key">
              <label v-if="p.options">{{ p.label }}<select v-model.number="selected.params[p.key]"><option v-for="o in p.options" :key="o.value" :value="o.value">{{ o.label }}</option></select></label>
              <label v-else>{{ p.label }} = {{ selected.params[p.key] }}{{ p.unit ? ' ' + p.unit : '' }}<input type="range" :min="p.min" :max="p.max" :step="p.step" v-model.number="selected.params[p.key]"></label>
            </template>
            <p v-if="!selectedSpec.params.length" class="desc">该元件无可调参数（显示/记录类）</p>
          </template>
          <p v-else class="desc">点选画布上的元件以调参数</p>
        </div>
        <div class="box rec" :class="{ ok: rec.target && rec.family !== 'dyn4j' && rec.family !== 'none' }">
          <h4>场景识别</h4>
          <p class="title">{{ rec.title }}</p>
          <p class="conf" v-if="elements.length">置信度 {{ (rec.confidence * 100).toFixed(0) }}%　求解器：{{ rec.target?.kind === 'mech' ? 'MechScene 2D/2.5D' : rec.target?.kind === 'em' ? 'EMScene 3D' : rec.target?.kind === 'component' ? '独立场景组件' : rec.target?.kind === 'circuit' ? '电路引擎（自由连线）' : rec.target?.kind === 'dyn4j' ? '刚体沙盒 dyn4j' : rec.target?.kind === 'link' ? '教材实验' : '—' }}</p>
          <p v-for="(n, i) in rec.notes" :key="i" class="note">· {{ n }}</p>
          <p v-if="Object.keys(rec.params).length" class="note">映射参数：{{ Object.entries(rec.params).map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(3) : v}`).join('，') }}</p>
        </div>
      </aside>
    </section>

    <section v-if="running" class="runner">
      <MechScene v-if="rec.target?.kind === 'mech' && runnerDef" :key="runKey" :def="runnerDef as any" @record="onRecord" />
      <EMScene v-else-if="rec.target?.kind === 'em' && runnerDef" :key="runKey" :def="runnerDef as any" @record="onRecord" />
      <component v-else-if="componentTarget" :is="componentTarget" :key="runKey" @record="onRecord" />
      <CircuitEditor v-else-if="rec.target?.kind === 'circuit'" :key="runKey" :palette="(rec.target as any).palette" :height="440" hint="从元件栏拖入元件、拖端子连线，合上开关读表；错接会被故障检测提示" />
    </section>

    <section class="bottom">
      <SandboxData :records="records" @clear="records = []" />
      <SandboxAi :recognition="rec" :elements="elements" :records="records" :scene-name="sceneName" />
    </section>
  </main>
</template>

<style scoped>
.sandbox { padding: 10px 16px 40px; max-width: 1600px; margin: 0 auto; }
.top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.name { background: #1d1d33; border: 1px solid #2f2f4a; color: #e8e8f0; border-radius: 6px; padding: 5px 8px; font-size: 14px; width: 180px; }
.badge { padding: 1px 8px; border-radius: 4px; font-size: 11px; } .b2 { background: #1d3a2b; color: #3ecf8e; } .b25 { background: #1d2b3a; color: #4a90d9; } .b3 { background: #33183a; color: #b06ce6; }
.sub { color: #6c6c85; font-size: 12px; } .spacer { flex: 1; }
.ghost { background: #23233a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
.file input { display: none; } .toast { color: #3ecf8e; font-size: 12px; }
.work { display: grid; grid-template-columns: 220px 1fr 300px; gap: 10px; align-items: start; }
.palette { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 8px; max-height: 620px; overflow-y: auto; }
.tabs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 6px; }
.tabs button { background: #23233a; color: #8a8aa0; border: 1px solid #2f2f4a; border-radius: 6px; padding: 4px 0; font-size: 11px; cursor: pointer; }
.tabs button.active { color: #e8e8f0; border-color: #4a90d9; background: #2b5c8f44; }
.search { width: 100%; background: #14142a; border: 1px solid #2f2f4a; color: #e8e8f0; border-radius: 6px; padding: 5px 8px; font-size: 12px; margin-bottom: 6px; }
.items { display: flex; flex-direction: column; gap: 4px; }
.item { display: flex; align-items: center; gap: 6px; background: #23233a; border: 1px solid #2f2f4a; border-radius: 6px; padding: 5px 7px; cursor: grab; font-size: 12px; }
.item:hover { border-color: #4a90d9; } .item .ic { width: 18px; text-align: center; } .item .lb { flex: 1; color: #e8e8f0; } .item .dm { color: #565675; font-size: 10px; }
.saved h4 { font-size: 12px; color: #8a8aa0; margin: 10px 0 4px; } .srow { display: flex; gap: 6px; align-items: center; font-size: 11px; } .srow a { color: #4a90d9; cursor: pointer; flex: 1; } .srow small { color: #565675; } .srow button { background: none; border: none; color: #E05555; cursor: pointer; }
.canvas-wrap { display: flex; flex-direction: column; gap: 6px; }
.tools { display: flex; gap: 6px; align-items: center; }
.tools button { background: #23233a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
.tools button:disabled { opacity: 0.4; cursor: not-allowed; } .tools button.active { border-color: #F5C542; color: #F5C542; }
.tools .primary { background: #2b5c8f; color: #fff; border-color: #4a90d9; padding: 6px 16px; font-size: 13px; }
.canvas { position: relative; height: 560px; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; background-color: #14142a; background-image: linear-gradient(#1d1d33 1px, transparent 1px), linear-gradient(90deg, #1d1d33 1px, transparent 1px); background-size: 24px 24px; }
.canvas.\32 D { background-image: linear-gradient(#1d3a2b66 1px, transparent 1px), linear-gradient(90deg, #1d3a2b66 1px, transparent 1px); }
.canvas.\33 D { background-image: linear-gradient(#33183a88 1px, transparent 1px), linear-gradient(90deg, #33183a88 1px, transparent 1px); background-size: 32px 32px; }
.wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; } .wires line { stroke: #d9a05a; stroke-width: 2; pointer-events: stroke; cursor: pointer; }
.card { position: absolute; width: 90px; background: #1d1d33; border: 2px solid #2f2f4a; border-radius: 8px; padding: 6px; cursor: grab; user-select: none; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.card.sel { box-shadow: 0 0 0 2px #4a90d9; } .card.from { box-shadow: 0 0 0 2px #F5C542; }
.card .ic { font-size: 18px; } .card .lb { font-size: 11px; color: #e8e8f0; } .card .pv { font-size: 9px; color: #565675; white-space: nowrap; overflow: hidden; max-width: 84px; }
.empty { position: absolute; left: 20px; right: 20px; top: 45%; text-align: center; color: #565675; font-size: 12px; line-height: 1.8; }
.props { display: flex; flex-direction: column; gap: 8px; }
.box { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 10px; }
.box h4 { font-size: 13px; color: #b0b0cc; margin-bottom: 6px; } .box h4 small { color: #565675; font-weight: normal; }
.desc { color: #6c6c85; font-size: 11px; line-height: 1.5; margin-bottom: 6px; }
.box label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 6px; } .box label input, .box label select { width: 100%; } .box label select { background: #14142a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 4px; }
.rec .title { color: #e8e8f0; font-size: 13px; font-weight: 600; } .rec.ok { border-color: #3ecf8e; } .rec.ok .title { color: #3ecf8e; }
.conf, .note { color: #8a8aa0; font-size: 11px; line-height: 1.5; margin-top: 4px; }
.runner { margin-top: 10px; border: 1px solid #3d3d5e; border-radius: 10px; padding: 8px; background: #191930; }
.bottom { display: grid; grid-template-columns: 1fr 380px; gap: 10px; margin-top: 10px; align-items: start; }
@media (max-width: 1100px) { .work { grid-template-columns: 1fr; } .bottom { grid-template-columns: 1fr; } }
</style>
