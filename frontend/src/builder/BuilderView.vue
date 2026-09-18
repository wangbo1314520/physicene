<script setup lang="ts">
/**
 * 统一几何搭建台（阶段三④ 布局壳，方案 §4.1）：
 * 顶栏 | 元件面板 · three.js 画布（锚点吸附） · 属性面板 | 运行条 | 数据面板 + AI 助手
 * 运行桥（阶段三⑤ RunBridge）与分析卡（⑥ EngineAnalyzer）本版为占位。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { CATALOG, DOMAINS, byType, defaultsOf, type Dim, type Domain, type GeoElement } from './catalog'
import { findSnap, applySnap } from './model/snap'
import BuilderCanvas from './render/BuilderCanvas.vue'
import DataPanel from './components/DataPanel.vue'
import BuilderAi from './components/BuilderAi.vue'
import type { RunRecord } from '../sandbox/SandboxData.vue'

const sceneName = ref('未命名场景')
const domain = ref<Domain>('mech')
const search = ref('')
const elements = reactive<GeoElement[]>([])
const selectedId = ref<string | null>(null)
const linkMode = ref(false)
const linkKind = ref<'rope' | 'rod' | 'spring' | 'wire' | 'pulley-rope'>('rope')
const linkFrom = ref<{ id: string; anchorId: string } | null>(null)
const records = ref<RunRecord[]>([])
const toast = ref('')
let seq = 1

const undo: string[] = []
const redo: string[] = []
function snapshot() { undo.push(JSON.stringify(elements)); if (undo.length > 60) undo.shift(); redo.length = 0 }
function restore(json: string) {
  const arr = JSON.parse(json) as GeoElement[]
  elements.splice(0, elements.length, ...arr)
  selectedId.value = null
  linkFrom.value = null
}
function doUndo() { const s = undo.pop(); if (s === undefined) return; redo.push(JSON.stringify(elements)); restore(s) }
function doRedo() { const s = redo.pop(); if (s === undefined) return; undo.push(JSON.stringify(elements)); restore(s) }
function say(t: string) { toast.value = t; window.setTimeout(() => { if (toast.value === t) toast.value = '' }, 2200) }

const palette = computed(() => CATALOG.filter((e) => e.domain === domain.value && (!search.value || e.label.includes(search.value) || e.desc.includes(search.value) || e.tags.some((t) => t.includes(search.value)))))
const selected = computed(() => elements.find((e) => e.id === selectedId.value) ?? null)
const selectedSpec = computed(() => (selected.value ? byType.get(selected.value.type) : undefined))
const dim = computed<Dim>(() => {
  if (!elements.length) return '2.5D'
  const ds = elements.map((e) => byType.get(e.type)?.dims ?? [])
  if (ds.some((d) => d.length === 1 && d[0] === '3D') || ds.every((d) => d.includes('3D')) && !ds.every((d) => d.includes('2.5D'))) return '3D'
  if (ds.some((d) => d.includes('2D') && !d.includes('2.5D')) && !ds.some((d) => d.includes('2.5D') && !d.includes('2D'))) return '2D'
  return '2.5D'
})
/** 分析卡占位：⑥ EngineAnalyzer 接入前给域/角色清单 */
const engineHint = computed(() => {
  if (!elements.length) return '画布为空——从左侧拖入元件'
  const doms = [...new Set(elements.map((e) => byType.get(e.type)?.domain).filter(Boolean))] as Domain[]
  const roles = [...new Set(elements.map((e) => e.role))]
  const links = elements.reduce((n, e) => n + e.links.length, 0)
  return `${DOMAINS.filter((d) => doms.includes(d.key)).map((d) => d.label).join(' + ') || '未知域'} · 角色 ${roles.join('/')} · 连线 ${links} 条`
})

function addElement(type: string, x?: number, y?: number): GeoElement {
  const spec = byType.get(type)
  if (!spec) throw new Error(`unknown element ${type}`)
  snapshot()
  const e: GeoElement = {
    id: `${type}-${seq++}`, type,
    position: { x: +(x ?? -6 + (elements.length % 5) * 2.5).toFixed(2), y: +(y ?? 2 - Math.floor(elements.length / 5) * 2.5).toFixed(2) },
    angle: 0,
    params: { ...defaultsOf(spec) },
    isFixed: spec.role === 'constraint' || spec.role === 'field',
    role: spec.role,
    links: [],
  }
  elements.push(e)
  selectedId.value = e.id
  return e
}
function removeSelected() {
  if (!selected.value) return
  snapshot()
  const id = selected.value.id
  elements.splice(elements.findIndex((e) => e.id === id), 1)
  for (const e of elements) e.links = e.links.filter((l) => l.toId !== id)
  selectedId.value = null
  linkFrom.value = linkFrom.value?.id === id ? null : linkFrom.value
}
function duplicateSelected() {
  if (!selected.value) return
  const c = addElement(selected.value.type, selected.value.position.x + 1, selected.value.position.y - 0.5)
  c.params = { ...selected.value.params }
  c.angle = selected.value.angle
}
function clearAll() { if (!elements.length) return; snapshot(); elements.splice(0); selectedId.value = null; linkFrom.value = null; records.value = [] }

// ── 画布事件 ──
const canvasRef = ref<InstanceType<typeof BuilderCanvas> | null>(null)
function onDragging(id: string, x: number, y: number) {
  const e = elements.find((el) => el.id === id)
  if (e) { e.position.x = +x.toFixed(3); e.position.y = +y.toFixed(3) }
}
function onDrop() {
  // 松手提交吸附（§4.2：一次只做一处；吸附后可继续拖走）
  const id = selectedId.value
  const e = id ? elements.find((el) => el.id === id) : null
  if (!e) return
  const snap = findSnap(e, elements)
  if (snap) {
    snapshot()
    applySnap(e, snap)
    e.position.x = +e.position.x.toFixed(3)
    e.position.y = +e.position.y.toFixed(3)
    say(`已吸附：${byType.get(e.type)?.label}·${snap.anchorA} ↔ ${byType.get(elements.find((x) => x.id === snap.targetId)?.type ?? '')?.label}·${snap.anchorB}`)
  }
}
function onAnchorPick(p: { id: string; anchorId: string }) {
  if (!linkFrom.value) { linkFrom.value = p; say(`已选锚点 ${snapLabel(p)}，再点另一元件的锚点完成${linkKindLabel.value}连线`); return }
  if (linkFrom.value.id === p.id && linkFrom.value.anchorId === p.anchorId) { linkFrom.value = null; return }
  if (linkFrom.value.id === p.id) { say('两个锚点需在不同元件上'); return }
  snapshot()
  const a = elements.find((e) => e.id === linkFrom.value!.id)!
  a.links.push({ toId: p.id, kind: linkKind.value, anchorA: linkFrom.value.anchorId, anchorB: p.anchorId })
  say(`已连${linkKindLabel.value}：${snapLabel(linkFrom.value)} ↔ ${snapLabel(p)}`)
  linkFrom.value = null
}
const linkKindLabel = computed(() => ({ rope: '绳', rod: '杆', spring: '弹簧', wire: '导线', 'pulley-rope': '跨轮绳' })[linkKind.value])
const snapLabel = (p: { id: string; anchorId: string }) => `${byType.get(elements.find((e) => e.id === p.id)?.type ?? '')?.label ?? p.id}·${p.anchorId}`
function removeLink(ownerId: string, idx: number) {
  snapshot()
  const e = elements.find((x) => x.id === ownerId)
  if (e) e.links.splice(idx, 1)
}

// ── 保存 / 导入导出 ──
interface Saved { id: string; name: string; at: string; elements: GeoElement[] }
const saved = ref<Saved[]>(JSON.parse(localStorage.getItem('ps_builder_scenes') ?? '[]'))
function persist() { localStorage.setItem('ps_builder_scenes', JSON.stringify(saved.value)) }
function saveScene() {
  if (!elements.length) return say('画布为空')
  const s: Saved = { id: String(Date.now()), name: sceneName.value || '未命名场景', at: new Date().toLocaleString(), elements: JSON.parse(JSON.stringify(elements)) }
  saved.value.unshift(s)
  if (saved.value.length > 30) saved.value.pop()
  persist()
  say('已保存到本机')
}
function loadScene(s: Saved) { snapshot(); sceneName.value = s.name; restore(JSON.stringify(s.elements)); seq = elements.length + 1; say(`已载入「${s.name}」`) }
function deleteScene(s: Saved) { saved.value = saved.value.filter((x) => x.id !== s.id); persist() }
function exportJson() {
  const blob = new Blob([JSON.stringify({ name: sceneName.value, dim: dim.value, elements, records: records.value }, null, 2)], { type: 'application/json' })
  dl(URL.createObjectURL(blob), `${sceneName.value}.json`)
}
function importJson(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (!f) return
  void f.text().then((txt) => {
    try {
      const j = JSON.parse(txt)
      snapshot()
      sceneName.value = j.name ?? sceneName.value
      restore(JSON.stringify(j.elements ?? []))
      seq = elements.length + 1
      say('已导入')
    } catch { say('JSON 无法解析') }
  })
}
function dl(url: string, name: string) { const a = document.createElement('a'); a.href = url; a.download = name; a.click() }

function onDragStart(ev: DragEvent, type: string) { ev.dataTransfer?.setData('application/x-builder-type', type) }

onMounted(() => {
  // DEV 钩子：E2E 用脚本化搭建（阶段三⑩ builder-check.py 使用）
  ;(window as unknown as { __builder: unknown }).__builder = {
    add: (type: string, params?: Record<string, number>, x?: number, y?: number) => {
      const e = addElement(type, x, y)
      if (params) Object.assign(e.params, params)
      return e.id
    },
    move: (id: string, x: number, y: number) => onDragging(id, x, y),
    select: (id: string | null) => { selectedId.value = id },
    link: (a: string, anchorA: string, b: string, anchorB: string, kind?: string) => {
      const ea = elements.find((e) => e.id === a)
      if (ea) ea.links.push({ toId: b, kind: (kind ?? 'rope') as typeof linkKind.value, anchorA, anchorB })
    },
    unlinkAll: (id: string) => { const e = elements.find((x) => x.id === id); if (e) e.links.splice(0) },
    snapOf: (id: string) => canvasRef.value?.snapOf(id) ?? null,
    clear: clearAll,
    elements: () => JSON.parse(JSON.stringify(elements)),
    count: () => elements.length,
    setName: (n: string) => { sceneName.value = n },
    toast: () => toast.value,
  }
})
watch(() => JSON.stringify(elements.map((e) => [e.type, e.params, e.links])), () => { /* 结构变化由各 watch 消费；保留触发器 */ })
</script>

<template>
  <main class="builder">
    <header class="top">
      <input v-model="sceneName" class="name" title="场景名">
      <span class="badge" :class="dim === '3D' ? 'b3' : dim === '2.5D' ? 'b25' : 'b2'">{{ dim }}</span>
      <span class="sub">统一搭建台 · 元件拖入画布、锚点自动吸附、连线成题、一键运行（方案 v1.0）</span>
      <span class="spacer"></span>
      <button class="ghost" @click="saveScene">💾 保存</button>
      <button class="ghost" @click="exportJson">⇩ JSON</button>
      <label class="ghost file">⇧ 导入<input type="file" accept="application/json" @change="importJson"></label>
      <span v-if="toast" class="toast">{{ toast }}</span>
    </header>

    <section class="work">
      <aside class="palette">
        <div class="tabs"><button v-for="d in DOMAINS" :key="d.key" :class="{ active: domain === d.key }" @click="domain = d.key">{{ d.icon }} {{ d.label }}</button></div>
        <input v-model="search" class="search" placeholder="搜索元件…">
        <div class="items">
          <div v-for="e in palette" :key="e.type" class="item" draggable="true" :title="`${e.desc}（${e.role}）`" @dragstart="onDragStart($event, e.type)" @click="addElement(e.type)">
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
          <select v-if="linkMode" v-model="linkKind" class="linkkind" title="连线类型">
            <option value="rope">轻绳</option><option value="rod">轻杆</option><option value="spring">弹簧</option><option value="wire">导线</option><option value="pulley-rope">跨轮绳</option>
          </select>
          <button @click="clearAll">✕ 清空</button>
          <span class="spacer"></span>
          <button class="primary" disabled title="阶段三⑤ RunBridge 接入后启用">▶ 运行（即将接入）</button>
        </div>
        <div class="canvas-holder">
          <BuilderCanvas ref="canvasRef" :elements="elements" :selected-id="selectedId" :link-mode="linkMode" :link-from="linkFrom"
            @select="selectedId = $event" @dragging="onDragging" @drop="onDrop" @anchor-pick="onAnchorPick" @add-at="(t, x, y) => addElement(t, x, y)" />
          <p v-if="!elements.length" class="empty">从左侧拖入元件（米制世界坐标，滚轮缩放）。例：斜面 + 物块 → 传送带 + 物块 → 竖直圆轨道 + 小球</p>
        </div>
      </section>

      <aside class="props">
        <div class="box">
          <h4>属性 <small v-if="selectedSpec">· {{ selectedSpec.label }}</small></h4>
          <template v-if="selected && selectedSpec">
            <p class="desc">{{ selectedSpec.desc }}</p>
            <p class="desc">位置 ({{ selected.position.x.toFixed(2) }}, {{ selected.position.y.toFixed(2) }}) m · 角度 {{ +(selected.angle * 180 / Math.PI).toFixed(1) }}°</p>
            <label>角度 θ = {{ +(selected.angle * 180 / Math.PI).toFixed(0) }}°<input type="range" min="-180" max="180" step="5" :value="selected.angle * 180 / Math.PI" @input="selected.angle = +($event.target as HTMLInputElement).value * Math.PI / 180"></label>
            <template v-for="p in selectedSpec.params" :key="p.key">
              <label v-if="p.options">{{ p.label }}<select v-model.number="selected.params[p.key]"><option v-for="o in p.options" :key="o.value" :value="o.value">{{ o.label }}</option></select></label>
              <label v-else>{{ p.label }} = {{ selected.params[p.key] }}{{ p.unit ? ' ' + p.unit : '' }}<input type="range" :min="p.min" :max="p.max" :step="p.step" v-model.number="selected.params[p.key]"></label>
            </template>
            <label class="chk"><input type="checkbox" :checked="selected.isFixed" @change="selected.isFixed = ($event.target as HTMLInputElement).checked"> 固定（不随运动）</label>
            <p v-if="!selectedSpec.params.length" class="desc">该元件无可调参数（显示/记录类）</p>
          </template>
          <p v-else class="desc">点选画布上的元件以调参数；拖动时靠近锚点会自动吸附（松手提交）</p>
        </div>
        <div class="box rec">
          <h4>场景分析 <small>· ⑥ EngineAnalyzer 接入前为域清单</small></h4>
          <p class="title">{{ engineHint }}</p>
          <p class="conf">元件 {{ elements.length }} 个 · 维度 {{ dim }}</p>
        </div>
        <div v-if="selected && selected.links.length" class="box">
          <h4>连线 · {{ byType.get(selected.type)?.label }}</h4>
          <div v-for="(l, i) in selected.links" :key="i" class="lrow">
            <span>{{ ({ rope: '绳', rod: '杆', spring: '弹簧', wire: '导线', 'pulley-rope': '跨轮绳' })[l.kind] }} {{ l.anchorA }} ↔ {{ byType.get(elements.find((e) => e.id === l.toId)?.type ?? '')?.label }}·{{ l.anchorB }}</span>
            <button @click="removeLink(selected.id, i)">×</button>
          </div>
        </div>
      </aside>
    </section>

    <section class="bottom">
      <DataPanel :records="records" @clear="records = []" />
      <BuilderAi :elements="elements" :records="records" :scene-name="sceneName" :engines-title="elements.length ? `统一搭建·${engineHint.split(' · ')[0]}` : undefined" />
    </section>
  </main>
</template>

<style scoped>
.builder { padding: 10px 16px 40px; max-width: 1600px; margin: 0 auto; }
.top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.name { background: #1d1d33; border: 1px solid #2f2f4a; color: #e8e8f0; border-radius: 6px; padding: 5px 8px; font-size: 14px; width: 180px; }
.badge { padding: 1px 8px; border-radius: 4px; font-size: 11px; } .b2 { background: #1d3a2b; color: #3ecf8e; } .b25 { background: #1d2b3a; color: #4a90d9; } .b3 { background: #33183a; color: #b06ce6; }
.sub { color: #6c6c85; font-size: 12px; } .spacer { flex: 1; }
.ghost { background: #23233a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
.file input { display: none; } .toast { color: #3ecf8e; font-size: 12px; }
.work { display: grid; grid-template-columns: 220px 1fr 300px; gap: 10px; align-items: start; }
.palette { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 8px; max-height: 640px; overflow-y: auto; }
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
.tools .primary:disabled { opacity: 0.5; }
.linkkind { background: #23233a; color: #F5C542; border: 1px solid #F5C54266; border-radius: 6px; padding: 4px 6px; font-size: 12px; }
.canvas-holder { position: relative; height: 580px; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; background: #14142a; }
.empty { position: absolute; left: 20px; right: 20px; top: 45%; text-align: center; color: #565675; font-size: 12px; line-height: 1.8; pointer-events: none; }
.props { display: flex; flex-direction: column; gap: 8px; }
.box { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 10px; }
.box h4 { font-size: 13px; color: #b0b0cc; margin-bottom: 6px; } .box h4 small { color: #565675; font-weight: normal; }
.desc { color: #6c6c85; font-size: 11px; line-height: 1.5; margin-bottom: 6px; }
.box label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 6px; } .box label input, .box label select { width: 100%; } .box label select { background: #14142a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 4px; }
.chk { display: flex; align-items: center; gap: 6px; } .chk input { width: auto !important; }
.rec .title { color: #e8e8f0; font-size: 13px; font-weight: 600; }
.conf { color: #8a8aa0; font-size: 11px; line-height: 1.5; margin-top: 4px; }
.lrow { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #b0b0cc; padding: 3px 0; border-bottom: 1px solid #23233a; }
.lrow button { background: none; border: none; color: #E05555; cursor: pointer; }
.bottom { display: grid; grid-template-columns: 1fr 380px; gap: 10px; margin-top: 10px; align-items: start; }
@media (max-width: 1100px) { .work { grid-template-columns: 1fr; } .bottom { grid-template-columns: 1fr; } }
</style>
