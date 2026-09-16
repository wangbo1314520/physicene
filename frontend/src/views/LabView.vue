<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import { createSimRenderer, type SimRenderer, type SimDimension } from '../sim/threeScene'
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
const selectedId = ref<string | null>(null)

function resetCamera() {
  renderer?.resetView()
}
const selected = computed(() => scene.elements.find((e) => e.id === selectedId.value) ?? null)
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
    } catch {
      toast.value = `场景 #${created.id} 已创建，请到「我的场景」打开`
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
  '3D': { label: '3D 空间', hint: '可旋转视角、空间场线带箭头：点电荷电场线、匀强电场/磁场中的带电粒子' },
}
const dim = ref<SimDimension>(
  (localStorage.getItem('ps_dim') as SimDimension) || (localStorage.getItem('ps_view') === 'iso' ? '2.5D' : '2D'))

// ===== 元件库：后端 dyn4j 支持的 7 种元件，按维度分档 =====
interface PaletteItem { type: string; label: string; icon: string; color: string; dims: SimDimension[]; desc: string }
const PALETTE: PaletteItem[] = [
  { type: 'cube', label: '方块', icon: '▣', color: '#4A90D9', dims: ['2D', '2.5D'], desc: '有质量的滑块/物块，可设摩擦、弹性、初速' },
  { type: 'sphere', label: '小球', icon: '●', color: '#F5C542', dims: ['2D', '2.5D', '3D'], desc: '质点模型；3D 中设电荷量即为带电粒子' },
  { type: 'slope', label: '斜面', icon: '◺', color: '#3ecf8e', dims: ['2D', '2.5D'], desc: '固定斜面（直角在左下，scale 定底与高）' },
  { type: 'wall', label: '墙壁/地面', icon: '▬', color: '#8a8aa0', dims: ['2D', '2.5D', '3D'], desc: '固定边界，可设摩擦' },
  { type: 'point_charge', label: '点电荷', icon: '⊕', color: '#E05555', dims: ['2D', '3D'], desc: '带电质点：受库仑力与电场力/洛伦兹力；固定后作为场源' },
  { type: 'e_field', label: '匀强电场', icon: '⇉', color: '#7fb3ff', dims: ['2D', '3D'], desc: '矩形区域匀强电场 (Ex, Ey)，3D 中画空间场线箭头' },
  { type: 'b_field', label: '匀强磁场', icon: '⊗', color: '#c78bff', dims: ['2D', '3D'], desc: '区域匀强磁场 B（垂直纸面 出/入），带电粒子做圆周运动' },
]
const palette = computed(() => PALETTE.filter((p) => p.dims.includes(dim.value)))
const dimHint = computed(() => DIM_INFO[dim.value].hint)

function setDim(d: SimDimension) {
  dim.value = d
  localStorage.setItem('ps_dim', d)
  renderer?.setDimension(d)
  const bad = scene.elements.filter((e) => !PALETTE.find((p) => p.type === e.type)?.dims.includes(d))
  if (bad.length) toast.value = `${DIM_INFO[d].label}模式不含 ${bad.length} 个已放置元件的类型（仍会显示，建议删除或切回原维度）`
}

let typeCounter: Record<string, number> = {}

// ===== 每维度的实验设计模板：一键载入，可再自由增删元件 =====
interface LabTemplate { name: string; desc: string; gravity?: number; elements: PhysicsElementInput[] }
function mk(type: string, id: string, x: number, y: number, patch: Partial<PhysicsElementInput> = {}): PhysicsElementInput {
  const base = defaultElement(type, x, y)
  return { ...base, ...patch, id, position: { x, y }, properties: { ...base.properties, ...(patch.properties ?? {}) },
    initialState: { velocity: { ...(base.initialState?.velocity ?? { x: 0, y: 0 }), ...(patch.initialState?.velocity ?? {}) } } }
}
const GROUND = () => mk('wall', 'ground', 0, -0.1, { scale: { x: 40, y: 0.2 } })
const TEMPLATES: Record<SimDimension, LabTemplate[]> = {
  '2D': [
    { name: '斜面上的滑块', desc: '改滑块摩擦系数 μ：μ 大于 tanθ≈0.58 不下滑；μ=0 匀加速',
      elements: [GROUND(), mk('slope', 'slope', -2, 0, { scale: { x: 2, y: 2.3 } }),
        mk('cube', 'block', -3.23, 1.28, { angle: -0.5236, properties: { mass: 1, friction: 0.2, restitution: 0 } })] },
    { name: '平抛运动', desc: '水平初速 6 m/s 从 10 m 高抛出；观察轨迹为抛物线，落地时间 √(2h/g)',
      elements: [GROUND(), mk('sphere', 'ball', -10, 10, { properties: { mass: 1, friction: 0, restitution: 0 }, initialState: { velocity: { x: 6, y: 0 } } })] },
    { name: '带电粒子在匀强电场中偏转', desc: '粒子水平入场，受竖直电场力做类平抛；改 E 或 v 看偏转量',
      gravity: 0,
      elements: [mk('e_field', 'ef', 0, 0, { scale: { x: 16, y: 8 }, properties: { eFieldX: 0, eFieldY: -2 } }),
        mk('point_charge', 'q', -10, 2, { properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 8, y: 0 } } })] },
    { name: '带电粒子在匀强磁场中回旋', desc: 'r = mv/(qB)：v=4、q=1、B=1、m=1 → 半径 4 m；改 B 看半径变化',
      gravity: 0,
      elements: [mk('b_field', 'bf', 0, 0, { scale: { x: 24, y: 24 }, properties: { bField: 1, bDirection: 'out' } }),
        mk('point_charge', 'q', -4, 0, { properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 0, y: 4 } } })] },
  ],
  '2.5D': [
    { name: '小车沿斜面下滑', desc: '等距视角看小车沿 30° 斜面加速下滑后在地面减速停下',
      elements: [GROUND(), mk('slope', 'slope', -2, 0, { scale: { x: 2, y: 2.3 } }),
        mk('cube', 'car', -3.23, 1.28, { angle: -0.5236, properties: { mass: 1, friction: 0.1, restitution: 0 } })] },
    { name: '两球对心碰撞', desc: 'm₁=1 以 3 m/s 撞静止的 m₂=2，弹性碰撞 e=1；看动量守恒曲线',
      elements: [GROUND(), mk('sphere', 'ball1', -4, 0.5, { properties: { mass: 1, friction: 0, restitution: 1 }, initialState: { velocity: { x: 3, y: 0 } } }),
        mk('sphere', 'ball2', 2, 0.5, { color: '#E05555', properties: { mass: 2, friction: 0, restitution: 1 } })] },
    { name: '自由落体与反弹', desc: '8 m 高静止释放，e=0.8 每次反弹高度按 e² 衰减',
      elements: [GROUND(), mk('sphere', 'ball', 0, 8, { properties: { mass: 1, friction: 0, restitution: 0.8 } })] },
  ],
  '3D': [
    { name: '正负点电荷的电场线', desc: '两个固定异号电荷（电偶极子），旋转视角看空间电场线从正到负',
      gravity: 0,
      elements: [mk('point_charge', 'qp', -3, 0, { isFixed: true, color: '#E05555', properties: { mass: 1, charge: 2 } }),
        mk('point_charge', 'qn', 3, 0, { isFixed: true, color: '#4A90D9', properties: { mass: 1, charge: -2 } })] },
    { name: '匀强电场中的加速与偏转', desc: '带电小球沿场方向加速；再给它横向初速看抛物线偏转',
      gravity: 0,
      elements: [mk('e_field', 'ef', 0, 0, { scale: { x: 16, y: 8 }, properties: { eFieldX: 1, eFieldY: 0 } }),
        mk('sphere', 'q', -7, 0, { properties: { mass: 1, charge: 1, friction: 0, restitution: 0 }, initialState: { velocity: { x: 0, y: 2 } } })] },
    { name: '匀强磁场中的圆周运动', desc: '洛伦兹力提供向心力：T = 2πm/(qB) 与速度无关',
      gravity: 0,
      elements: [mk('b_field', 'bf', 0, 0, { scale: { x: 24, y: 24 }, properties: { bField: 1, bDirection: 'out' } }),
        mk('point_charge', 'q', -4, 0, { properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 0, y: 4 } } })] },
    { name: '复合场：速度选择器', desc: 'E 与 B 正交，qE = qvB 时粒子直线通过（v = E/B = 4 m/s）；改 v 看偏转',
      gravity: 0,
      elements: [mk('e_field', 'ef', 0, 0, { scale: { x: 20, y: 8 }, properties: { eFieldX: 0, eFieldY: -4 } }),
        mk('b_field', 'bf', 0, 0, { scale: { x: 20, y: 8 }, properties: { bField: 1, bDirection: 'out' } }),
        mk('point_charge', 'q', -11, 0, { properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 4, y: 0 } } })] },
  ],
}
const templates = computed(() => TEMPLATES[dim.value])
function applyDimTemplate(t: LabTemplate) {
  if (busy.value) return
  scene.elements.splice(0, scene.elements.length, ...t.elements.map((e) => JSON.parse(JSON.stringify(e)) as PhysicsElementInput))
  scene.config.gravity.y = t.gravity ?? -9.8
  selectedId.value = null
  syncRenderer()
  renderer?.resetView()
  toast.value = `已载入「${t.name}」：${t.desc}`
}

function defaultElement(type: string, x: number, y: number): PhysicsElementInput {
  typeCounter[type] = (typeCounter[type] ?? 0) + 1
  const base = type === 'wall'
    ? { scale: { x: 20, y: 0.2 }, isFixed: true, color: '#8a8aa0' }
    : type === 'slope'
      ? { scale: { x: 2, y: 2.3 }, isFixed: true, color: '#3ecf8e' }
      : type === 'sphere'
        ? { scale: { x: 1, y: 1 }, isFixed: false, color: '#F5C542' }
        : type === 'point_charge'
          ? { scale: { x: 0.6, y: 0.6 }, isFixed: false, color: '#E05555' }
          : type === 'e_field'
            ? { scale: { x: 12, y: 6 }, isFixed: true, color: '#7fb3ff' }
            : type === 'b_field'
              ? { scale: { x: 12, y: 12 }, isFixed: true, color: '#c78bff' }
              : { scale: { x: 1, y: 1 }, isFixed: false, color: '#4A90D9' }
  const properties: Record<string, any> = type === 'e_field' ? { eFieldX: 1, eFieldY: 0 }
    : type === 'b_field' ? { bField: 1, bDirection: 'out' }
      : type === 'point_charge' ? { mass: 1, charge: 1, friction: 0, restitution: 0 }
        : { mass: 1, friction: 0.1, restitution: 0.5 }
  return {
    id: `${type}_${String(typeCounter[type]).padStart(3, '0')}`,
    type,
    position: { x: +x.toFixed(2), y: +y.toFixed(2) },
    angle: 0,
    scale: base.scale,
    properties,
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
  checkSnap(selectedId.value)
}

// ===== 贴紧提示：两实体元件相邻（空隙或轻微重叠 ≤ 0.6 m）时询问是否贴紧，防止“看着挨着、其实有缝” =====
interface SnapSuggestion { id: string; otherId: string; axis: 'x' | 'y'; delta: number; gap: number; label: string; otherLabel: string }
const snap = ref<SnapSuggestion | null>(null)
const SOLID = new Set(['cube', 'sphere', 'slope', 'wall', 'point_charge'])
function aabb(e: PhysicsElementInput) {
  const sx = e.scale?.x ?? 1, sy = e.scale?.y ?? 1
  if (e.type === 'slope') return { xmin: e.position.x - sx, xmax: e.position.x + sx, ymin: e.position.y, ymax: e.position.y + sy }
  return { xmin: e.position.x - sx / 2, xmax: e.position.x + sx / 2, ymin: e.position.y - sy / 2, ymax: e.position.y + sy / 2 }
}
function checkSnap(id: string | null) {
  snap.value = null
  if (!id) return
  const e = scene.elements.find((x) => x.id === id)
  if (!e || !SOLID.has(e.type)) return
  const A = aabb(e)
  let best: SnapSuggestion | null = null
  const consider = (otherId: string, axis: 'x' | 'y', gap: number, delta: number) => {
    if (Math.abs(gap) < 0.005 || Math.abs(gap) > 0.6) return
    if (!best || Math.abs(gap) < Math.abs(best.gap)) {
      const name = (t: string) => PALETTE.find((p) => p.type === t)?.label ?? t
      const other = scene.elements.find((x) => x.id === otherId)!
      best = { id, otherId, axis, gap, delta, label: name(e.type), otherLabel: name(other.type) }
    }
  }
  for (const o of scene.elements) {
    if (o.id === id || !SOLID.has(o.type)) continue
    const B = aabb(o)
    const overlapX = Math.min(A.xmax, B.xmax) - Math.max(A.xmin, B.xmin) > 0.05
    const overlapY = Math.min(A.ymax, B.ymax) - Math.max(A.ymin, B.ymin) > 0.05
    if (overlapX) {
      const gTop = A.ymin - B.ymax   // A 在 B 上方：>0 空隙，<0 重叠
      const gBot = B.ymin - A.ymax   // A 在 B 下方
      if (Math.abs(gTop) < Math.abs(gBot)) consider(o.id, 'y', gTop, -gTop); else consider(o.id, 'y', gBot, gBot)
    }
    if (overlapY) {
      const gRight = A.xmin - B.xmax // A 在 B 右侧
      const gLeft = B.xmin - A.xmax  // A 在 B 左侧
      if (Math.abs(gRight) < Math.abs(gLeft)) consider(o.id, 'x', gRight, -gRight); else consider(o.id, 'x', gLeft, gLeft)
    }
  }
  snap.value = best
}
function applySnap() {
  const s = snap.value
  if (!s) return
  const e = scene.elements.find((x) => x.id === s.id)
  if (e) {
    e.position = { ...e.position, [s.axis]: +(e.position[s.axis] + s.delta).toFixed(3) }
    renderer?.updateElement(e.id, { position: e.position })
    toast.value = `已把「${s.label}」贴紧「${s.otherLabel}」（消除 ${Math.abs(s.gap).toFixed(2)} m ${s.gap > 0 ? '空隙' : '重叠'}）`
  }
  snap.value = null
}

let dragging = false

function onPointerDown(ev: PointerEvent) {
  if (busy.value || ev.button !== 0) return  // 右/中键留给视角平移
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
  if (dragging && selectedId.value) checkSnap(selectedId.value)
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
  typeCounter = {}
  selectedId.value = null
  resetReplay()
  cancelOcrPreview()
  chart?.setOption({ series: [] }, { replaceMerge: ['series'] })
  syncRenderer()
  toast.value = '已新建空白画布，开始搭下一个实验吧（原场景在「我的场景」里）'
}

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
  if (import.meta.env.DEV) (window as unknown as { __lab?: unknown }).__lab = { scene, checkSnap, applySnap, snap, setDim, applyDimTemplate, templates: TEMPLATES }
  if (canvasRef.value) {
    renderer = createSimRenderer(canvasRef.value)
    renderer.setDimension(dim.value)
  }
  // 自由搭建（/sandbox）刚体沙盒交接：把沙盒元件换成 dyn4j 元件后直接进入本页
  const handoff = localStorage.getItem('ps_sandbox_handoff')
  if (handoff) {
    localStorage.removeItem('ps_sandbox_handoff')
    try {
      const j = JSON.parse(handoff) as { name: string; elements: { type: string; x: number; y: number; params: Record<string, number> }[] }
      const MAP: Record<string, string> = { particle: 'sphere', block: 'cube', slider: 'cube', cart: 'cube', incline: 'slope', ground: 'wall', wall: 'wall', particle_q: 'point_charge', b_region: 'b_field', deflect_field: 'e_field', accel_field: 'e_field', composite: 'b_field' }
      const els: PhysicsElementInput[] = []
      for (const e of j.elements) {
        const type = MAP[e.type]; if (!type) continue
        const d = defaultElement(type, (e.x - 300) / 40, type === 'wall' ? 0 : Math.max(0.6, (420 - e.y) / 40))
        d.properties = { ...d.properties, mass: e.params.m ?? e.params.M ?? d.properties?.mass, friction: e.params.mu ?? d.properties?.friction, ...(e.params.qm !== undefined ? { charge: e.params.qm } : {}), ...(e.params.B !== undefined ? { bField: e.params.B } : {}) }
        if (e.params.v0 !== undefined || e.params.v !== undefined) d.initialState = { velocity: { x: e.params.v0 ?? e.params.v ?? 0, y: 0 } }
        if (type === 'slope') { const L = e.params.L ?? 4, th = ((e.params.th ?? 30) * Math.PI) / 180; d.scale = { x: L * Math.cos(th), y: L * Math.sin(th) } }
        if (type === 'wall') { d.position = { x: 0, y: -0.1 }; d.scale = { x: 40, y: 0.2 } }
        els.push(d)
      }
      if (els.length && !els.some((x) => x.type === 'wall')) els.push(defaultElement('wall', 0, -0.1))
      if (els.length) { scene.name = j.name; scene.elements = els; toast.value = `已从自由搭建接入 ${els.length} 个元件，按 ▶ 运行`; nextTick(() => syncRenderer()) }
    } catch { /* 交接数据损坏则忽略 */ }
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
      <button :disabled="busy" @click="newCanvas" title="清空画布开始新实验（原场景仍在我的场景里）">🗑 新建画布</button>
      <button class="primary" :disabled="busy" @click="startRun">▶ 运行实验</button>
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
      <span class="status">{{ state.status === 'running' ? `运行中 t=${state.currentT.toFixed(2)}s` : state.status }}</span>
      <div class="dims" :title="dimHint">
        <button v-for="d in DIMS" :key="d" class="dim" :class="{ on: dim === d }" @click="setDim(d)">{{ DIM_INFO[d].label }}</button>
      </div>
      <button class="ghost" @click="resetCamera()" title="滚轮缩放 / 右键拖动平移 / 双击复位">⟲ 复位视角</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="toast" class="toast" @click="toast = ''">{{ toast }}</p>
    <div v-if="snap" class="snapbar">
      <span>📐 检测到「{{ snap.label }}」与「{{ snap.otherLabel }}」之间{{ snap.gap > 0 ? `有 ${snap.gap.toFixed(2)} m 空隙` : `重叠 ${(-snap.gap).toFixed(2)} m` }}——是否贴紧放置？</span>
      <button class="ok" @click="applySnap">贴紧</button>
      <button @click="snap = null">保持原位</button>
    </div>

    <section class="workspace">
      <aside class="left">
        <h3>元件库 <span class="dimtag">{{ DIM_INFO[dim].label }}</span></h3>
        <p class="dimhint">{{ dimHint }}</p>
        <div v-for="p in palette" :key="p.type" class="palette-item" draggable="true" :title="p.desc"
             @dragstart="onDragStart($event, p.type)">
          <span class="icon" :style="{ color: p.color }">{{ p.icon }}</span>{{ p.label }}
        </div>
        <p class="hint">拖到画布放置 · 点击选中 · Delete 删除</p>
        <h3>实验设计</h3>
        <button v-for="t in templates" :key="t.name" class="tpl" :disabled="busy" :title="t.desc" @click="applyDimTemplate(t)">📋 {{ t.name }}</button>
        <p class="hint">载入后可继续增删元件、改参数再运行</p>
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
          <template v-if="selected.type === 'e_field'">
            <div class="row">
              <label>Ex (N/C) <input type="number" step="0.5" v-model.number="selected.properties!.eFieldX" :disabled="busy"></label>
              <label>Ey (N/C) <input type="number" step="0.5" v-model.number="selected.properties!.eFieldY" :disabled="busy"></label>
            </div>
            <div class="row">
              <label>区域宽 (m) <input type="number" step="1" min="1" v-model.number="selected.scale!.x" :disabled="busy"></label>
              <label>区域高 (m) <input type="number" step="1" min="1" v-model.number="selected.scale!.y" :disabled="busy"></label>
            </div>
          </template>
          <template v-else-if="selected.type === 'b_field'">
            <div class="row">
              <label>B (T) <input type="number" step="0.1" min="0" v-model.number="selected.properties!.bField" :disabled="busy"></label>
              <label>方向 <select v-model="selected.properties!.bDirection" :disabled="busy"><option value="out">⊙ 垂直纸面向外</option><option value="in">⊗ 垂直纸面向里</option></select></label>
            </div>
            <div class="row">
              <label>区域宽 (m) <input type="number" step="1" min="1" v-model.number="selected.scale!.x" :disabled="busy"></label>
              <label>区域高 (m) <input type="number" step="1" min="1" v-model.number="selected.scale!.y" :disabled="busy"></label>
            </div>
          </template>
          <template v-else-if="!selected.isFixed">
            <div class="row">
              <label>质量 (kg) <input type="number" step="0.5" min="0.01" v-model.number="selected.properties!.mass" :disabled="busy"></label>
              <label>摩擦 μ <input type="number" step="0.05" min="0" max="1" v-model.number="selected.properties!.friction" :disabled="busy"></label>
            </div>
            <div class="row">
              <label>弹性 e <input type="number" step="0.1" min="0" max="1" v-model.number="selected.properties!.restitution" :disabled="busy"></label>
              <label>初速 vx <input type="number" step="1" v-model.number="selected.initialState!.velocity!.x" :disabled="busy"></label>
            </div>
            <div class="row">
              <label>初速 vy (m/s) <input type="number" step="1" v-model.number="selected.initialState!.velocity!.y" :disabled="busy"></label>
              <label v-if="selected.type === 'point_charge' || dim === '3D'">电荷量 q (C) <input type="number" step="0.5" v-model.number="selected.properties!.charge" :disabled="busy"></label>
            </div>
            <label v-if="selected.type === 'point_charge'" class="chk"><input type="checkbox" v-model="selected.isFixed" :disabled="busy"> 固定为场源（不运动）</label>
          </template>
          <template v-else>
            <p class="hint">固定元件（不参与运动统计）</p>
            <label v-if="selected.type === 'point_charge'">电荷量 q (C) <input type="number" step="0.5" v-model.number="selected.properties!.charge" :disabled="busy"></label>
            <label v-if="selected.type === 'point_charge'" class="chk"><input type="checkbox" v-model="selected.isFixed" :disabled="busy"> 固定为场源</label>
          </template>
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
