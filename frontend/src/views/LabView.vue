<script setup lang="ts">
import FreeBuildTab from '../builder/FreeBuildTab.vue'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import { createSimRenderer, type SimRenderer, type SimDimension } from '../sim/threeScene'
import { http } from '../api/http'
import {
  useSimulationSocket, type PhysicsElementInput,
} from '../composables/useSimulationSocket'
import { toPhysicsElements } from '../builder/run/RunBridge'
import type { GeoElement } from '../builder/catalog'

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
      recordId: state.recordId,
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

function resetCamera() {
  renderer?.resetView()
}
const busy = computed(() => ['running', 'paused', 'connecting'].includes(state.status))

// ===== OCR 拍照识题（第五周：半自动建场景）=====
const fileInput = ref<HTMLInputElement | null>(null)
const ocr = reactive({
  previewing: false,
  previewToken: '',
  elements: [] as PhysicsElementInput[],
  confidence: 0,
  rawText: '',
})

function pickImage() {
  if (busy.value) return
  fileInput.value?.click()
}

async function onImageChosen(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  toast.value = '正在识别题目…（OCR + 解析约需 10-15 秒）'
  try {
    const form = new FormData()
    form.append('file', file)
    const resp = (await http.post('/ocr/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    })) as {
      degraded?: boolean
      fallbackHint?: string
      simType?: string
      recommendedElements?: PhysicsElementInput[]
      confidence?: number
      previewToken?: string
      rawText?: string
    }
    if (resp.degraded) {
      toast.value = `识别未成功：${resp.fallbackHint ?? '建议手动搭建'}`
      return
    }
    ocr.previewing = true
    ocr.previewToken = resp.previewToken ?? ''
    ocr.elements = resp.recommendedElements ?? []
    ocr.confidence = resp.confidence ?? 0
    ocr.rawText = resp.rawText ?? ''
    // 半透明预览：推荐元件以幽灵形态叠加显示
    const all = [...scene.elements, ...ocr.elements]
    renderer?.syncElements(JSON.parse(JSON.stringify(all)))
    renderer?.setGhost(ocr.elements.map((e) => e.id))
    toast.value = `AI 推荐场景已预览（置信度 ${(ocr.confidence * 100).toFixed(0)}%）——确认搭建或取消`
  } catch (e) {
    toast.value = '识题失败：' + String(e).replace('Error: ', '')
  }
}

async function confirmOcrPreview() {
  if (!ocr.previewToken) return
  try {
    const created = (await http.post('/scenarios/from-preview', {
      previewToken: ocr.previewToken,
    })) as { id: number }
    ocr.previewing = false
    ocr.previewToken = ''
    ocr.elements = []
    renderer?.setGhost([])
    // 先告知成功（数据库已落库），再刷新画布；画布刷新失败给出打开入口
    toast.value = `拍照建场景完成 #${created.id}，正在载入…`
    try {
      await loadScene(created.id)
      toast.value = `拍照建场景完成 #${created.id}，可直接运行实验`
    } catch (e) {
      toast.value = `场景 #${created.id} 已创建，但载入失败（${String(e).replace('Error: ', '')}）——请到「我的场景」打开`
    }
  } catch (e) {
    toast.value = '确认失败：' + String(e).replace('Error: ', '')
  }
}

function cancelOcrPreview() {
  ocr.previewing = false
  ocr.previewToken = ''
  ocr.elements = []
  renderer?.setGhost([])
  syncRenderer()
}
// ===== 维度：2D 平面正交 / 2.5D 等距立体 / 3D 可旋转空间场线（与实验库“唯一维度口径”一致）=====
const DIMS: SimDimension[] = ['2D', '2.5D', '3D']
const DIM_INFO: Record<SimDimension, { label: string; hint: string }> = {
  '2D': { label: '2D 平面', hint: '正交平面图（课本插图视角）：平面力学 + 平面电磁，磁场用 ⊗/⊙ 表示垂直纸面' },
  '2.5D': { label: '2.5D 立体', hint: '等距立体观感，物理仍在竖直平面内：力学实验（斜面、碰撞、抛体）' },
  '3D': { label: '3D 空间', hint: '可旋转视角、空间场线带箭头：点电荷电场线、匀强电场/磁场中的带电粒子——物理计算仍在 x-y 平面（3D 仅观看方式）' },
}
const dim = ref<SimDimension>(
  (localStorage.getItem('ps_dim') as SimDimension) || (localStorage.getItem('ps_view') === 'iso' ? '2.5D' : '2D'))

/** F1.1：顶栏页签（实验台 | 自由搭建）—— v-if 隔离两套面板/时间轴互不共存 */
const activeTab = ref<"lab" | "free">("free")  // 默认搭建：学生一进来就能搭（resize 已修——切到结果 Tab 时渲染器 resize）

// 方案 B（2026-10-04）：搭建功能移至自由搭建 Tab（BuilderView）——PALETTE 已废弃
const dimHint = computed(() => DIM_INFO[dim.value].hint)

function setDim(d: SimDimension) {
  dim.value = d
  localStorage.setItem('ps_dim', d)
  renderer?.setDimension(d)
  // 搭建已移至 Tab 2，此处不再检查元件维度兼容性
}

// 方案 B：TEMPLATES 已废弃（搭建在 Tab 2，62 卡模板在 BuilderView registry）

// ===== 画布交互 =====

// ===== 贴紧提示：两实体元件相邻（空隙或轻微重叠 ≤ 0.6 m）时询问是否贴紧，防止“看着挨着、其实有缝” =====
interface SnapSuggestion { id: string; otherId: string; axis: 'x' | 'y'; delta: number; gap: number; label: string; otherLabel: string }
const snap = ref<SnapSuggestion | null>(null)
const SOLID = new Set(['cube', 'sphere', 'slope', 'wall', 'point_charge'])
function aabb(e: PhysicsElementInput) {
  const sx = e.scale?.x ?? 1, sy = e.scale?.y ?? 1
  if (e.type === 'slope') return { xmin: e.position.x - sx, xmax: e.position.x + sx, ymin: e.position.y, ymax: e.position.y + sy }
  return { xmin: e.position.x - sx / 2, xmax: e.position.x + sx / 2, ymin: e.position.y - sy / 2, ymax: e.position.y + sy / 2 }
}









function syncRenderer() {
  renderer?.syncElements(JSON.parse(JSON.stringify(scene.elements)))
  renderer?.setSelected(null)
}

// ── Step 2 补丁（2026-10-04）：Tab 2 场景 → Tab 1 画布 ──
// BuilderView persistWorkspace() 在切 Tab 时把 elements 存 ps_builder_workspace。
// Tab 1 激活时读取 → toPhysicsElements 转换 → threeScene syncElements 渲染。
// 运行时帧位姿由 sharedState.subjects 驱动（updateStates 在 threeScene 渲染循环内）。
function syncFromBuilderTab() {
  try {
    const raw = localStorage.getItem('ps_builder_workspace')
    if (!raw) return
    const j = JSON.parse(raw) as { elements: GeoElement[] }
    if (!j.elements?.length) return
    const pkg = toPhysicsElements(j.elements)
    scene.elements = pkg.list
    syncRenderer()
    // 运行中/结束后：把 WS 帧位姿应用到画布（threeScene updateStates）
    if (state.subjects.length > 0) {
      renderer?.updateStates(state.subjects)
    }
  } catch { /* 损坏数据静默丢弃 */ }
}

watch(() => scene.elements, syncRenderer, { deep: true })

// 追问 4 修复：Tab 2 新运行（simId 变化）→ 重置 Tab 1 旧回放数据
// 防止回放时间轴显示旧帧但 ECharts 显示新曲线的不一致
watch(() => state.simId, () => {
  replay.available = false
  replay.frames = []
  replay.t = 0
  if (replay.timer) window.clearInterval(replay.timer)
})

// ===== 保存 / 加载 =====
const toast = ref('')
let toastTimer = 0
// toast 自动消失（4s），任何赋值都触发
watch(toast, (v) => {
  window.clearTimeout(toastTimer)
  if (v) toastTimer = window.setTimeout(() => (toast.value = ''), 4000)
})

/** 一键新建：清空画布开始下一个实验（已保存的场景不受影响） */
function newCanvas() {
  if (busy.value) return
  scene.sceneId = null
  scene.name = ''
  scene.elements = []
  scene.config = { gravity: { x: 0, y: -9.8 }, maxDuration: 10 }
  resetReplay()
  cancelOcrPreview()
  chart?.setOption({ series: [] }, { replaceMerge: ['series'] })
  syncRenderer()
  toast.value = '已新建空白画布，开始搭下一个实验吧（原场景在「我的场景」里）'
}

async function saveScene(silent = false) {
  try {
    const body = { elements: scene.elements, config: scene.config }
    if (scene.sceneId) {
      await http.put(`/scenarios/${scene.sceneId}`, body)
      if (!silent) toast.value = `场景已更新 #${scene.sceneId}`
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
  // typeCounter 已废弃（搭建在 Tab 2）
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
  // 手测 Bug2（2026-10-02）：run(sceneId) 让后端回放库中场景——曾有 id 就跳过保存导致
  // 本地拖动/改参不生效（物理永远是第一次保存的）。改为运行前必存（PUT 更新），
  // toast 只在用户手动保存时弹（saveScene 加静默参）
  await saveScene(true)
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
  // 手测 Bug1（2026-10-02）：导航「搭建台」=/lab?tab=free 直开自由搭建——/exp 重定向在已处 /lab 时无路由变化
  if (route.query.tab === 'free' || route.query.tab === 'build') activeTab.value = 'free'  // build=alias
  if (route.query.tab === 'lab') activeTab.value = 'lab'
  watch(() => route.query.tab, (t) => { if (t === 'free') activeTab.value = 'free'; if (t === 'lab') activeTab.value = 'lab' })
  // 自查 1.3+1.6（中）：切 Tab 回实验台后 echarts resize + renderer 状态恢复
  watch(activeTab, (t) => {
    if (t === 'lab') {
      nextTick(() => {
        syncFromBuilderTab()  // Step 2 补丁：从 Tab 2 同步场景 + 帧位姿到画布
        chart?.resize()
        renderer?.resize()    // 追问 2 正修：v-show 隐藏时构造渲染器 0x0 → 切回时 resize
        renderer?.resetView()
        renderer?.setDimension(dim.value)  // 1.6：维度可能与自由搭建期间不一致
        renderer?.setGhost([])             // 1.6：OCR 预览幽灵元素可能残留
        syncRenderer()                     // 元素位置可能被修改
      })
    }
  })
  if (import.meta.env.DEV) (window as unknown as { __lab?: unknown }).__lab = { scene, setDim, syncRenderer }
  if (canvasRef.value) {
    renderer = createSimRenderer(canvasRef.value)
    renderer.setDimension(dim.value)
  }
  // 自由搭建（/sandbox）刚体沙盒交接：把沙盒元件换成 dyn4j 元件后直接进入本页
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
  // 方案 B：搭建已移 Tab 2，Delete 键不再在此处理
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
    <!-- 方案 B 后 Tab 语义：运行（查看/分析）| 搭建（BuilderView） -->
    <nav class="tabbar">
      <button class="tab" :class="{ on: activeTab === 'lab' }" @click="activeTab = 'lab'">📊 结果</button>
      <button class="tab" :class="{ on: activeTab === 'free' }" @click="activeTab = 'free'">🧱 搭建</button>
    </nav>
    <template v-if="activeTab === 'free'">
      <FreeBuildTab />
    </template>
    <section v-if="activeTab === 'lab'" class="topbar">
      <span class="title">{{ scene.name || '未命名场景' }}
        <code v-if="scene.sceneId">#{{ scene.sceneId }}</code></span>
      <select class="tmpl" @change="loadTemplate(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).selectedIndex = 0"
              :disabled="busy">
        <option value="">📚 加载模板…</option>
        <option value="template_collision">小车碰撞</option>
        <option value="template_projectile">斜抛运动</option>
      </select>
      <button :disabled="busy" @click="saveScene()">💾 保存</button>
      <button v-if="state.status === 'idle'" class="primary goto-build" @click="activeTab = 'free'">🧱 去搭建 →</button>
      <!-- 方案 B Step 2：运行入口在 Tab 2（自由搭建）；此处显示共享运行状态 -->
      <button :disabled="busy" @click="pickImage">📷 拍照识题</button>
      <input ref="fileInput" type="file" accept="image/jpeg,image/png" style="display:none" @change="onImageChosen">
      <template v-if="ocr.previewing">
        <button class="ok" @click="confirmOcrPreview">✓ 确认搭建</button>
        <button @click="cancelOcrPreview">✗ 取消</button>
      </template>
      <button :disabled="state.status !== 'running'" @click="pause">⏸</button>
      <button :disabled="state.status !== 'paused'" @click="play">▶</button>
      <button :disabled="state.status !== 'paused'" @click="step">⏭</button>
      <button :disabled="state.status === 'ended' || state.status === 'idle'" @click="end">■</button>
      <span class="status" :class="{ ok: state.status === 'ended' }">{{ state.status === 'running' ? `▶ 运行中 t=${state.currentT.toFixed(2)}s` : state.status === 'ended' ? `⏹ 已结束 t=${state.currentT.toFixed(2)}s（${state.keyEvents.length} 事件）` : state.status }}</span>
      <div class="dims" :title="dimHint">
        <button v-for="d in DIMS" :key="d" class="dim" :class="{ on: dim === d }" @click="setDim(d)">{{ DIM_INFO[d].label }}</button>
      </div>
      <button class="ghost" @click="resetCamera()" title="滚轮缩放 / 右键拖动平移 / 双击复位">⟲ 复位视角</button>
    </section>

    <p v-if="activeTab === 'lab' && error" class="error">{{ error }}</p>
    <p v-if="activeTab === 'lab' && toast" class="toast" @click="toast = ''">{{ toast }}</p>
    
    <section v-show="activeTab === 'lab'" class="workspace">  <!-- Bug6 方案 D：v-if→v-show（canvas 常驻）-->
      <aside class="left" v-if="activeTab === 'lab'">
        <h3>元件库 <span class="dimtag">{{ DIM_INFO[dim].label }}</span></h3>
        <p class="dimhint">{{ dimHint }}</p>
        <!-- 方案 B：元件库已移至自由搭建 Tab -->
                  <p class="hint">拖到画布放置 · 点击选中 · Delete 删除</p>
        <!-- 方案 B：实验设计模板已移至自由搭建 Tab -->
        <div class="chat">
          <h3>AI 助教</h3>
          <div class="chat-log" ref="chatLog">
            <div v-if="!chat.messages.length" class="chat-empty">
              试试对我说：<br>「做个小车碰撞实验」<br>「加一个方块」<br>「把质量改成 3」<br>「什么是动量守恒」
            </div>
            <div v-for="(m, i) in chat.messages" :key="i" :class="['msg', m.role]">{{ m.content }}</div>
            <button v-if="state.status === 'ended' && state.recordId && !chat.busy"
                    class="analyze-btn" @click="chat.input = '帮我分析一下刚才的实验'; sendChat()">
              📊 分析这次实验
            </button>
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
                  
                  ></canvas>
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

      <aside class="right"><h3>实验运行</h3><p class="hint">搭建请切到「🧱 搭建」Tab，运行后此处显示曲线与回放</p></aside>
    </section>
  </main>
</template>

<style scoped>
.lab { height: calc(100vh - 55px); display: flex; flex-direction: column; padding: 10px 14px; gap: 8px; }
.tabbar { display: flex; gap: 6px; }
.tabbar .tab { padding: 4px 14px; border: 1px solid #3a3a5e; background: #1d1d33; color: #b0b0cc; border-radius: 8px 8px 0 0; cursor: pointer; }
.tabbar .tab.on { background: #253a52; color: #7fc3ff; border-bottom-color: transparent; font-weight: 600; }
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
.dims { display: inline-flex; border: 1px solid #2f2f4a; border-radius: 8px; overflow: hidden; margin-left: 6px; }
.dims .dim { background: #14142a; color: #8a8aa0; border: none; border-right: 1px solid #2f2f4a; padding: 6px 10px; cursor: pointer; font-size: 12px; }
.dims .dim:last-child { border-right: none; }
.dims .dim.on { background: #F5C542; color: #1a1a2e; font-weight: 600; }
.dimtag { font-size: 11px; color: #F5C542; font-weight: normal; margin-left: 6px; }
.dimhint { font-size: 11px; color: #6c6c85; line-height: 1.5; margin: -4px 0 8px; }
.tpl { display: block; width: 100%; text-align: left; background: #14142a; border: 1px solid #2f2f4a; color: #b0b0cc; border-radius: 8px; padding: 7px 10px; margin-bottom: 6px; cursor: pointer; font-size: 12px; }
.tpl:hover:not(:disabled) { border-color: #3ecf8e; color: #7fe3b3; }
.tpl:disabled { opacity: 0.45; cursor: not-allowed; }
.chk { display: flex !important; align-items: center; gap: 6px; }
.snapbar { display: flex; align-items: center; gap: 10px; margin: 6px 0; padding: 8px 12px; background: #2a2618; border: 1px solid #5a4d2f; border-radius: 8px; color: #f5d78a; font-size: 12px; }
.snapbar button { padding: 4px 12px; border-radius: 6px; border: 1px solid #5a4d2f; background: #14142a; color: #b0b0cc; cursor: pointer; }
.snapbar button.ok { background: #F5C542; color: #1a1a2e; border-color: #F5C542; font-weight: 600; }
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
.analyze-btn {
  align-self: center; background: #23402e; color: #7fe3b3; border: 1px solid #3ecf8e;
  border-radius: 14px; padding: 5px 14px; font-size: 12px; cursor: pointer;
}
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
