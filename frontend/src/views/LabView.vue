<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import { createSimRenderer, type SimRenderer } from '../sim/threeScene'
import { http } from '../api/http'
import {
  useSimulationSocket, type PhysicsElementInput,
} from '../composables/useSimulationSocket'

const route = useRoute()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let renderer: SimRenderer | null = null
let chart: echarts.ECharts | null = null

const { state, error, run, attach, pause, play, step, end, close: closeSocket } = useSimulationSocket()

// ===== AI 助教对话框（第四周：用嘴做实验）=====
const chatLog = ref<HTMLElement | null>(null)
const chat = reactive({
  messages: [] as { role: string; content: string }[],
  input: '',
  busy: false,
  sessionId: 'sess-' + Date.now().toString(36),
})

async function sendChat() {
  const msg = chat.input.trim()
  if (!msg || chat.busy) return
  chat.messages.push({ role: 'user', content: msg })
  chat.input = ''
  chat.busy = true
  try {
    const resp = (await http.post('/v1/agent/chat', {
      sessionId: chat.sessionId,
      sceneId: scene.sceneId ? String(scene.sceneId) : null,
      message: msg,
      history: chat.messages.slice(-11, -1).map((m) => ({ role: m.role, content: m.content })),
    })) as {
      reply: string
      toolCalls?: { name: string; result: any }[]
    }
    const toolNames = (resp.toolCalls ?? []).map((t) => t.name)
    chat.messages.push({
      role: 'assistant',
      content: resp.reply + (toolNames.length ? `\n⚙ ${toolNames.join(', ')}` : ''),
    })

    // 工具产生的场景变化 → 刷新画布
    const sceneChanged = toolNames.some((n) =>
      ['add_element', 'remove_element', 'move_element', 'rotate_element',
        'modify_element_property', 'clear_scene'].includes(n))
    const runTc = (resp.toolCalls ?? []).find((t) => t.name === 'run_simulation')
    const runResult = runTc && typeof runTc.result === 'object' ? runTc.result : null
    if (runResult?.sceneId) {
      await loadScene(Number(runResult.sceneId))       // AI 建的新场景
    } else if (sceneChanged && scene.sceneId) {
      await loadScene(scene.sceneId)                    // 原场景被改 → 重载
    }
    // AI 启动的仿真 → 自动接管观看（连 WS + 曲线 + 结束后回放）
    if (runResult?.simId && runResult?.wsUrl) {
      resetReplay()
      chart?.setOption({ series: [] }, { replaceMerge: ['series'] })
      attach(String(runResult.simId), String(runResult.wsUrl), runResult.recordId ?? null)
      toast.value = 'AI 已启动实验，正在为你直播～'
    }
  } catch (e) {
    chat.messages.push({ role: 'assistant', content: '助手开小差了：' + String(e).replace('Error: ', '') })
  } finally {
    chat.busy = false
    await nextTick()
    chatLog.value?.scrollTo({ top: chatLog.value.scrollHeight })
  }
}

// ===== 场景状态 =====
const scene = reactive({
  sceneId: null as number | null,
  name: '',
  elements: [] as PhysicsElementInput[],
  config: {
    gravity: { x: 0, y: -9.8 },
    maxDuration: 10,
  } as Record<string, any>,
})
const selectedId = ref<string | null>(null)
const selected = computed(() => scene.elements.find((e) => e.id === selectedId.value) ?? null)
const busy = computed(() => ['running', 'paused', 'connecting'].includes(state.status))

// ===== 元件库（SRS F2.5 六元件，spring/track 第四周后补）=====
const palette = [
  { type: 'cube', label: '方块', icon: '▣', color: '#4A90D9' },
  { type: 'sphere', label: '小球', icon: '●', color: '#F5C542' },
  { type: 'slope', label: '斜面', icon: '◺', color: '#3ecf8e' },
  { type: 'wall', label: '墙壁/地面', icon: '▬', color: '#8a8aa0' },
]

let typeCounter: Record<string, number> = {}

function defaultElement(type: string, x: number, y: number): PhysicsElementInput {
  typeCounter[type] = (typeCounter[type] ?? 0) + 1
  const base = type === 'wall'
    ? { scale: { x: 20, y: 0.2 }, isFixed: true, color: '#8a8aa0' }
    : type === 'slope'
      ? { scale: { x: 2, y: 2.3 }, isFixed: true, color: '#3ecf8e' }
      : type === 'sphere'
        ? { scale: { x: 1, y: 1 }, isFixed: false, color: '#F5C542' }
        : { scale: { x: 1, y: 1 }, isFixed: false, color: '#4A90D9' }
  return {
    id: `${type}_${String(typeCounter[type]).padStart(3, '0')}`,
    type,
    position: { x: +x.toFixed(2), y: +y.toFixed(2) },
    angle: 0,
    scale: base.scale,
    properties: { mass: 1, friction: 0.1, restitution: 0.5 },
    initialState: { velocity: { x: 0, y: 0 } },
    isFixed: base.isFixed,
    color: base.color,
  }
}

// ===== 画布交互 =====
function onDragStart(ev: DragEvent, type: string) {
  ev.dataTransfer?.setData('application/x-element-type', type)
}

function onDrop(ev: DragEvent) {
  const type = ev.dataTransfer?.getData('application/x-element-type')
  if (!type || busy.value) return
  const world = renderer?.screenToWorld(ev.clientX, ev.clientY)
  if (!world) return
  scene.elements.push(defaultElement(type, world.x, world.y))
  syncRenderer()
  selectedId.value = scene.elements[scene.elements.length - 1].id
}

let dragging = false

function onPointerDown(ev: PointerEvent) {
  if (busy.value) return
  const hit = renderer?.pickElement(ev.clientX, ev.clientY) ?? null
  selectedId.value = hit
  renderer?.setSelected(hit)
  dragging = hit !== null
  if (dragging) (ev.target as HTMLElement).setPointerCapture(ev.pointerId)
}

function onPointerMove(ev: PointerEvent) {
  if (!dragging || !selectedId.value || busy.value) return
  const world = renderer?.screenToWorld(ev.clientX, ev.clientY)
  if (!world) return
  const el = scene.elements.find((e) => e.id === selectedId.value)
  if (el) {
    el.position = { x: +world.x.toFixed(2), y: +world.y.toFixed(2) }
    renderer?.updateElement(el.id, { position: el.position })
  }
}

function onPointerUp() {
  dragging = false
}

function removeSelected() {
  if (!selectedId.value || busy.value) return
  scene.elements = scene.elements.filter((e) => e.id !== selectedId.value)
  selectedId.value = null
  syncRenderer()
}

function selectElement(id: string) {
  selectedId.value = id
  renderer?.setSelected(id)
}

function syncRenderer() {
  renderer?.syncElements(JSON.parse(JSON.stringify(scene.elements)))
  renderer?.setSelected(selectedId.value)
}

watch(() => scene.elements, syncRenderer, { deep: true })

// ===== 保存 / 加载 =====
const toast = ref('')

async function saveScene() {
  try {
    const body = { elements: scene.elements, config: scene.config }
    if (scene.sceneId) {
      await http.put(`/scenarios/${scene.sceneId}`, body)
      toast.value = `场景已更新 #${scene.sceneId}`
    } else {
      const created = (await http.post('/scenarios', { ...body, source: 'manual' })) as { id: number }
      scene.sceneId = created.id
      toast.value = `场景已保存 #${created.id}`
    }
  } catch (e) {
    toast.value = '保存失败: ' + String(e).replace('Error: ', '')
  }
}

async function loadScene(id: number) {
  const detail = (await http.get(`/scenarios/${id}`)) as {
    id: number; type: string; elements: PhysicsElementInput[]; config: Record<string, any>
  }
  scene.sceneId = detail.id
  scene.name = `场景 #${detail.id}`
  scene.elements = detail.elements
  scene.config = detail.config
  typeCounter = {}
  for (const el of detail.elements) {
    const prefix = el.type
    typeCounter[prefix] = Math.max(typeCounter[prefix] ?? 0,
      parseInt(el.id.split('_')[1] ?? '0', 10) || 0)
  }
  selectedId.value = null
  syncRenderer()
}

async function loadTemplate(type: string) {
  const created = (await http.post(`/templates/${type}/load`)) as { id: number }
  await loadScene(created.id)
  toast.value = `模板已加载为场景 #${created.id}`
}

// ===== 运行 / 回放 =====
async function startRun() {
  if (scene.elements.length === 0) {
    toast.value = '先从左侧元件库拖入元件'
    return
  }
  if (!scene.sceneId) await saveScene()
  if (!scene.sceneId) return
  resetReplay()
  // 只清 series 保留坐标轴（chart.clear() 会连轴一起清掉，后续增量 setOption 报 xAxis not found）
  chart?.setOption({ series: [] }, { replaceMerge: ['series'] })
  await run(scene.elements, scene.config, String(scene.sceneId))
}

watch(() => state.subjects, (subjects) => {
  if (subjects.length) renderer?.updateStates(subjects)
}, { deep: true })

watch(() => state.frameCount, (n) => {
  if (!chart || n % 6 !== 0) return
  const series: echarts.SeriesOption[] = []
  state.vSeries.forEach((s, i) => {
    const id = state.vIds[i] ?? `主体${i + 1}`
    series.push({
      name: `${id}.vx`, type: 'line', showSymbol: false,
      data: s.map((p) => [p.t, +p.vx.toFixed(3)]),
    })
    series.push({
      name: `${id}.vy`, type: 'line', showSymbol: false,
      lineStyle: { type: 'dashed', opacity: 0.7 },
      data: s.map((p) => [p.t, +p.vy.toFixed(3)]),
    })
  })
  series.push({
    name: '总动能 Ek', type: 'line', showSymbol: false, yAxisIndex: 1,
    data: state.ekSeries.map((p) => [p.t, +p.v.toFixed(3)]),
  })
  series.push({
    name: '总动量模 p', type: 'line', showSymbol: false, yAxisIndex: 1,
    data: state.pSeries.map((p) => [p.t, +p.v.toFixed(3)]),
  })
  chart.setOption({ series }, { replaceMerge: ['series'] })
})

// —— REST 回放（ended 后）——
const replay = reactive({
  available: false,
  playing: false,
  t: 0,
  frames: [] as { t: number; snapshotType: string; snapshot: any }[],
  timer: 0,
})

async function loadReplay() {
  if (!state.recordId) return
  // 分页拉全帧（契约 frameLimit≤500/页；10s 仿真=600 帧会超一页）
  const first = (await http.get(`/records/${state.recordId}`, {
    params: { frameOffset: 0, frameLimit: 500, withIndex: true },
  })) as {
    totalFrames: number
    frames: { t: number; snapshotType: string; snapshot: any }[]
  }
  replay.frames = [...first.frames]
  let offset = first.frames.length
  while (offset < first.totalFrames && offset < 1800) {
    const page = (await http.get(`/records/${state.recordId}`, {
      params: { frameOffset: offset, frameLimit: 500 },
    })) as { frames: { t: number; snapshotType: string; snapshot: any }[] }
    if (!page.frames.length) break
    replay.frames.push(...page.frames)
    offset += page.frames.length
  }
  replay.available = true
  replay.t = 0
  applyReplayFrame(0)
}

function applyReplayFrame(index: number) {
  const frame = replay.frames[index]
  if (!frame) return
  replay.t = frame.t
  const subjects = frame.snapshotType === 'key'
    ? frame.snapshot.subjects
    : frame.snapshot.elements
  renderer?.updateStates(subjects)
  markChartTime(frame.t)
}

function onTimelineInput(ev: Event) {
  const index = Math.round(+(ev.target as HTMLInputElement).value)
  replay.playing = false
  window.clearInterval(replay.timer)
  applyReplayFrame(index)
}

function toggleReplay() {
  if (replay.playing) {
    window.clearInterval(replay.timer)
    replay.playing = false
    return
  }
  let index = Math.round(replay.t / (state.endInfo?.totalDuration || 1) * (replay.frames.length - 1))
  replay.playing = true
  replay.timer = window.setInterval(() => {
    index++
    if (index >= replay.frames.length) {
      window.clearInterval(replay.timer)
      replay.playing = false
      return
    }
    applyReplayFrame(index)
  }, 1000 / 30)
}

function resetReplay() {
  window.clearInterval(replay.timer)
  replay.available = false
  replay.playing = false
  replay.frames = []
  replay.t = 0
}

function markChartTime(t: number) {
  // 回放光标（markLine）；空图时跳过，echarts 对无数据的 markLine 会抛噪音错误
  try {
    const opt = chart?.getOption()
    if (opt && Array.isArray(opt.series) && opt.series.length > 0) {
      chart?.setOption({
        series: [{ id: 'cursor', type: 'line', data: [],
          markLine: { silent: true, symbol: 'none',
            lineStyle: { color: '#e8e8f0', type: 'solid', width: 1, opacity: 0.8 },
            data: [{ xAxis: +t.toFixed(3) }] } }],
      })
    }
  } catch {
    // 光标为增强显示，失败不影响回放
  }
}

watch(() => state.status, (status) => {
  if (status === 'ended' && state.recordId) {
    toast.value = `实验完成（${state.endInfo?.totalDuration.toFixed(1)}s），可拖动时间轴回放`
    loadReplay()
  }
})

onMounted(async () => {
  if (canvasRef.value) {
    renderer = createSimRenderer(canvasRef.value)
  }
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      darkMode: true, animation: false,
      grid: { left: 46, right: 52, top: 28, bottom: 26 },
      legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 0 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', name: 't/s', axisLabel: { color: '#8a8aa0' },
        splitLine: { lineStyle: { color: '#23233a' } } },
      yAxis: [
        { type: 'value', name: 'v (m/s)', axisLabel: { color: '#8a8aa0' },
          splitLine: { lineStyle: { color: '#23233a' } } },
        { type: 'value', name: 'Ek/p', axisLabel: { color: '#8a8aa0' }, splitLine: { show: false } },
      ],
      series: [],
    })
  }
  const qid = route.query.scene
  if (qid) await loadScene(Number(qid)).catch(() => undefined)
  window.addEventListener('keydown', onKey)
})

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    const tag = (ev.target as HTMLElement)?.tagName
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') removeSelected()
  }
}

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.clearInterval(replay.timer)
  closeSocket() // 离开页面断开仿真 WS，避免后台持续收帧
  renderer?.dispose()
  chart?.dispose()
})
</script>

<template>
  <main class="lab">
    <section class="topbar">
      <span class="title">{{ scene.name || '未命名场景' }}
        <code v-if="scene.sceneId">#{{ scene.sceneId }}</code></span>
      <select class="tmpl" @change="loadTemplate(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).selectedIndex = 0"
              :disabled="busy">
        <option value="">📚 加载模板…</option>
        <option value="template_collision">小车碰撞</option>
        <option value="template_projectile">斜抛运动</option>
      </select>
      <button :disabled="busy" @click="saveScene">💾 保存</button>
      <button class="primary" :disabled="busy" @click="startRun">▶ 运行实验</button>
      <button :disabled="state.status !== 'running'" @click="pause">⏸</button>
      <button :disabled="state.status !== 'paused'" @click="play">▶</button>
      <button :disabled="state.status !== 'paused'" @click="step">⏭</button>
      <button :disabled="state.status === 'ended' || state.status === 'idle'" @click="end">■</button>
      <span class="status">{{ state.status === 'running' ? `运行中 t=${state.currentT.toFixed(2)}s` : state.status }}</span>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="toast" class="toast" @click="toast = ''">{{ toast }}</p>

    <section class="workspace">
      <aside class="left">
        <h3>元件库</h3>
        <div v-for="p in palette" :key="p.type" class="palette-item" draggable="true"
             @dragstart="onDragStart($event, p.type)">
          <span class="icon" :style="{ color: p.color }">{{ p.icon }}</span>{{ p.label }}
        </div>
        <p class="hint">拖到画布放置 · 点击选中 · Delete 删除</p>
        <div class="chat">
          <h3>AI 助教</h3>
          <div class="chat-log" ref="chatLog">
            <div v-if="!chat.messages.length" class="chat-empty">
              试试对我说：<br>「做个小车碰撞实验」<br>「加一个方块」<br>「把质量改成 3」<br>「什么是动量守恒」
            </div>
            <div v-for="(m, i) in chat.messages" :key="i" :class="['msg', m.role]">{{ m.content }}</div>
          </div>
          <div class="chat-input">
            <input v-model="chat.input" :disabled="chat.busy"
                   placeholder="用嘴做实验…"
                   @keyup.enter="sendChat">
            <button @click="sendChat" :disabled="chat.busy">{{ chat.busy ? '…' : '发' }}</button>
          </div>
        </div>
      </aside>

      <section class="center">
        <div class="canvas-wrap">
          <canvas ref="canvasRef"
                  @drop.prevent="onDrop" @dragover.prevent
                  @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"></canvas>
          <div v-if="state.keyEvents.length" class="events">
            <div v-for="(ev, i) in state.keyEvents.slice(-3)" :key="i" class="event-tag">
              ⚡ {{ ev.label }} @ {{ ev.t.toFixed(2) }}s
            </div>
          </div>
        </div>
        <div v-if="replay.available" class="timeline">
          <button @click="toggleReplay">{{ replay.playing ? '⏸' : '▶' }} 回放</button>
          <input type="range" min="0" :max="replay.frames.length - 1" :value="Math.round(replay.t / (state.endInfo?.totalDuration || 1) * (replay.frames.length - 1))"
                 @input="onTimelineInput" step="1">
          <span>t = {{ replay.t.toFixed(2) }}s / {{ (state.endInfo?.totalDuration ?? 0).toFixed(2) }}s</span>
        </div>
        <div ref="chartRef" class="chart"></div>
      </section>

      <aside class="right">
        <h3>{{ selected ? `元件 ${selected.id}` : '参数面板' }}</h3>
        <template v-if="selected">
          <label>类型 <input :value="selected.type" disabled /></label>
          <div class="row">
            <label>x (m) <input type="number" step="0.5" v-model.number="selected.position.x" :disabled="busy"></label>
            <label>y (m) <input type="number" step="0.5" v-model.number="selected.position.y" :disabled="busy"></label>
          </div>
          <div class="row">
            <label>角度 (°) <input type="number" step="5" :value="Math.round((selected.angle ?? 0) * 180 / Math.PI)"
                         @input="selected.angle = +($event.target as HTMLInputElement).value * Math.PI / 180" :disabled="busy"></label>
            <label>颜色 <input type="color" v-model="selected.color" :disabled="busy"></label>
          </div>
          <template v-if="!selected.isFixed">
            <div class="row">
              <label>质量 (kg) <input type="number" step="0.5" min="0.01" v-model.number="selected.properties!.mass" :disabled="busy"></label>
              <label>摩擦 μ <input type="number" step="0.05" min="0" max="1" v-model.number="selected.properties!.friction" :disabled="busy"></label>
            </div>
            <div class="row">
              <label>弹性 e <input type="number" step="0.1" min="0" max="1" v-model.number="selected.properties!.restitution" :disabled="busy"></label>
              <label>初速 vx <input type="number" step="1" v-model.number="selected.initialState!.velocity!.x" :disabled="busy"></label>
            </div>
            <label>初速 vy (m/s) <input type="number" step="1" v-model.number="selected.initialState!.velocity!.y" :disabled="busy"></label>
          </template>
          <p v-else class="hint">固定元件（不参与运动统计）</p>
          <button class="danger" :disabled="busy" @click="removeSelected">删除元件</button>
        </template>
        <p v-else class="hint">点击画布中的元件编辑参数</p>

        <h3 style="margin-top: 14px">全局配置</h3>
        <div class="row">
          <label>重力 gy (m/s²) <input type="number" step="0.5" v-model.number="scene.config.gravity.y" :disabled="busy"></label>
          <label>时长上限 (s) <input type="number" step="1" min="1" max="30" v-model.number="scene.config.maxDuration" :disabled="busy"></label>
        </div>

        <h3 style="margin-top: 14px">场景元件 ({{ scene.elements.length }})</h3>
        <ul class="element-list">
          <li v-for="el in scene.elements" :key="el.id"
              :class="{ active: el.id === selectedId }" @click="selectElement(el.id)">
            {{ el.id }} <code>{{ el.type }}</code>
          </li>
        </ul>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.lab { height: calc(100vh - 55px); display: flex; flex-direction: column; padding: 10px 14px; gap: 8px; }
.topbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.topbar .title { font-size: 14px; color: #b0b0cc; margin-right: 8px; }
.topbar .title code { color: #4a90d9; }
.topbar select, .topbar button {
  background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a;
  border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.topbar .primary { background: #2b5c8f; border-color: #4a90d9; }
.topbar button:disabled { opacity: 0.4; cursor: not-allowed; }
.topbar .status { color: #8a8aa0; font-size: 12px; margin-left: auto; }
.error { color: #e05555; font-size: 12px; }
.toast { color: #3ecf8e; font-size: 12px; cursor: pointer; }
.workspace { flex: 1; display: grid; grid-template-columns: 190px 1fr 250px; gap: 10px; min-height: 0; }
.left, .right {
  background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px;
  padding: 12px; overflow-y: auto;
  display: flex; flex-direction: column;
}
h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 10px; }
.palette-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 6px;
  background: #23233a; border: 1px dashed #3d3d5e; border-radius: 8px;
  font-size: 13px; cursor: grab; user-select: none;
}
.palette-item:hover { border-color: #4a90d9; }
.palette-item .icon { font-size: 18px; }
.hint { color: #565675; font-size: 11px; margin: 8px 0; }
.chat {
  margin-top: 12px; flex: 1; display: flex; flex-direction: column; min-height: 180px;
  background: #191930; border: 1px solid #3d3d5e; border-radius: 8px; padding: 10px;
}
.chat-log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.chat-empty { color: #565675; font-size: 11px; line-height: 1.8; }
.msg { font-size: 12px; line-height: 1.5; padding: 6px 9px; border-radius: 8px;
  white-space: pre-wrap; word-break: break-word; }
.msg.user { background: #2b5c8f; color: #e8e8f0; align-self: flex-end; max-width: 92%; }
.msg.assistant { background: #23233a; color: #b0b0cc; align-self: flex-start; max-width: 96%; }
.chat-input { display: flex; gap: 6px; margin-top: 8px; }
.chat-input input {
  flex: 1; background: #23233a; border: 1px solid #2f2f4a; border-radius: 6px;
  color: #e8e8f0; padding: 7px 9px; font-size: 12px; min-width: 0;
}
.chat-input button { background: #2b5c8f; color: #fff; border: none; border-radius: 6px;
  padding: 0 12px; font-size: 12px; cursor: pointer; }
.chat-input button:disabled { opacity: 0.5; }
.center { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.canvas-wrap { position: relative; flex: 1; min-height: 200px; background: #14142a;
  border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.canvas-wrap canvas { width: 100%; height: 100%; display: block; touch-action: none; }
.events { position: absolute; top: 8px; left: 8px; display: flex; flex-direction: column; gap: 4px; }
.event-tag { background: rgba(62,207,142,.15); border: 1px solid #3ecf8e; color: #7fe3b3;
  font-size: 11px; border-radius: 4px; padding: 2px 8px; }
.timeline { display: flex; align-items: center; gap: 10px; background: #1d1d33;
  border: 1px solid #2f2f4a; border-radius: 8px; padding: 6px 12px; font-size: 12px; color: #8a8aa0; }
.timeline button { background: #2b5c8f; color: #fff; border: none; border-radius: 5px;
  padding: 4px 10px; cursor: pointer; }
.timeline input[type=range] { flex: 1; }
.chart { height: 200px; flex-shrink: 0; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; }
.right label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #8a8aa0; margin-bottom: 8px; }
.right input, .right select {
  background: #23233a; border: 1px solid #2f2f4a; border-radius: 4px; color: #e8e8f0;
  padding: 5px 7px; font-size: 12px; width: 100%;
}
.right input:disabled { opacity: 0.45; }
.right input[type=color] { padding: 1px; height: 30px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.danger { background: #5e2430; color: #e05555; border: 1px solid #8f3a4a; border-radius: 6px;
  padding: 7px; font-size: 12px; cursor: pointer; width: 100%; margin-top: 6px; }
.element-list { list-style: none; padding: 0; margin: 0; }
.element-list li {
  padding: 5px 8px; font-size: 12px; color: #8a8aa0; border-radius: 5px; cursor: pointer;
  display: flex; justify-content: space-between;
}
.element-list li:hover { background: #23233a; }
.element-list li.active { background: #2b5c8f44; color: #e8e8f0; }
.element-list code { font-size: 10px; color: #4a90d9; }
</style>
