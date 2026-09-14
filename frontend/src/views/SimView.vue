<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { createSimRenderer, type SimRenderer } from '../sim/threeScene'
import { ensureDemoLogin } from '../api/auth'
import {
  useSimulationSocket,
  type PhysicsElementInput,
} from '../composables/useSimulationSocket'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let renderer: SimRenderer | null = null
let chart: echarts.ECharts | null = null

const { state, error, run, pause, play, step, end } = useSimulationSocket()

// 预置实验场景（斜面：方块贴斜面顶端静止下滑，倾角 30°）
const presets = reactive<Record<string, { name: string; elements: PhysicsElementInput[]; config: Record<string, any> }>>({
  collision: {
    name: '两车弹性碰撞（e=1 速度交换）',
    elements: [
      { id: 'car1', type: 'cube', position: { x: -3, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 1.0 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 3, y: 0.5 }, color: '#E05555',
        properties: { mass: 1, friction: 0, restitution: 1.0 },
        initialState: { velocity: { x: -5, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 3.0 },
  },
  inelastic: {
    name: '两车非弹性碰撞（e=0.3 动能有损）',
    elements: [
      { id: 'car1', type: 'cube', position: { x: -3, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 0.3 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 3, y: 0.5 }, color: '#E05555',
        properties: { mass: 2, friction: 0, restitution: 0.3 },
        initialState: { velocity: { x: -2, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 3.0 },
  },
  freefall: {
    name: '自由落体（1s 下落 ≈4.9m）',
    elements: [
      { id: 'ball', type: 'sphere', position: { x: 0, y: 10 }, color: '#F5C542',
        properties: { mass: 1, friction: 0, restitution: 0.2 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 3.0 },
  },
  slope_real: {
    name: '斜面滑块 · 现实（滑离底部有磕碰）',
    elements: [
      // 斜面：scale(2, 2.3) → 底 4 × 高 2.3，tan θ = 2.3/4 ≈ 30°，直角在左下
      { id: 'slope1', type: 'slope', position: { x: -2, y: 0 }, scale: { x: 2, y: 2.3 },
        color: '#3ecf8e' },
      // 方块：贴斜面顶端静止；有效弹性 = max(块 0.2, 地面 0.3)，滑落后磕碰弹跳
      { id: 'block', type: 'cube', position: { x: -3.23, y: 1.28 }, angle: -0.5236,
        color: '#4A90D9',
        properties: { mass: 1, friction: 0.1, restitution: 0.2 },
        initialState: { velocity: { x: 0, y: 0 } } },
      // 地面故意低于斜面底边 5cm：滑离瞬间产生落差磕碰
      { id: 'ground', type: 'wall', position: { x: 2, y: -1.3 }, scale: { x: 24, y: 0.2 },
        color: '#8a8aa0', properties: { friction: 0.1, restitution: 0.3 } },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4.0 },
  },
  slope_ideal: {
    name: '斜面滑块 · 理想（球模型，平滑过渡无弹跳）',
    elements: [
      { id: 'slope1', type: 'slope', position: { x: -2, y: 0 }, scale: { x: 2, y: 2.3 },
        color: '#3ecf8e' },
      // 球形单点接触 + 双侧 e=0（dyn4j 弹性取 max，必须球和地面同时为零）
      { id: 'ball', type: 'sphere', position: { x: -3.23, y: 1.28 },
        color: '#F5C542',
        properties: { mass: 1, friction: 0.1, restitution: 0 },
        initialState: { velocity: { x: 0, y: 0 } } },
      // 地面顶面与斜面底边严格齐平（y=-1.15）：无落差 + e=0，vy 全程无正向跳变
      { id: 'ground', type: 'wall', position: { x: 2, y: -1.25 }, scale: { x: 24, y: 0.2 },
        color: '#8a8aa0', properties: { friction: 0.1, restitution: 0 } },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4.0 },
  },
  projectile_h: {
    name: '平抛运动（水平初速 + 重力）',
    elements: [
      { id: 'ball', type: 'sphere', position: { x: -10, y: 10 }, color: '#F5C542',
        properties: { mass: 0.5, friction: 0, restitution: 0.3 },
        initialState: { velocity: { x: 6, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4 },
  },
  projectile_45: {
    name: '斜抛运动 45°（v0=20，射程 40m）',
    elements: [
      { id: 'ball', type: 'cube', position: { x: -15, y: 0.5 }, color: '#F5C542',
        properties: { mass: 0.5, friction: 0, restitution: 0.2 },
        initialState: { velocity: { x: 14.14, y: 14.14 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 60, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 5 },
  },
  recoil: {
    name: '反冲运动（静止分离，动量守恒 p=0）',
    elements: [
      { id: 'car1', type: 'cube', position: { x: -0.6, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 0.5 },
        initialState: { velocity: { x: -4, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 0.6, y: 0.5 }, color: '#E05555',
        properties: { mass: 2, friction: 0, restitution: 0.5 },
        initialState: { velocity: { x: 2, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 5 },
  },
  friction_decel: {
    name: '摩擦减速（μ=0.3 滑块减速到停止）',
    elements: [
      { id: 'cube_a', type: 'cube', position: { x: -8, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0.3, restitution: 0 },
        initialState: { velocity: { x: 8, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0', properties: { friction: 0.3, restitution: 0 } },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 5 },
  },
  e_deflect: {
    name: '电场偏转（示波器模型，电荷抛物线）',
    elements: [
      { id: 'pc', type: 'point_charge', position: { x: -10, y: 0 }, color: '#F5C542',
        properties: { mass: 1, charge: 1 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'ef', type: 'e_field', position: { x: 1, y: 0 }, scale: { x: 22, y: 10 },
        properties: { eFieldX: 0, eFieldY: -2 } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 5 },
  },
  b_circle: {
    name: '磁场圆周运动（洛伦兹力，r=mv/qB）',
    elements: [
      { id: 'pc', type: 'point_charge', position: { x: -5, y: 0 }, color: '#F5C542',
        properties: { mass: 1, charge: 1 },
        initialState: { velocity: { x: 0, y: 4 } } },
      { id: 'bf', type: 'b_field', position: { x: 0, y: 0 }, scale: { x: 30, y: 30 },
        properties: { bField: 1, bDirection: 'out' } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 8 },
  },
})
const selected = ref<keyof typeof presets>('collision')
const viewMode = ref<'front' | 'iso'>((localStorage.getItem('ps_view') as 'front' | 'iso') || 'front')
const viewLabel = computed(() => (viewMode.value === 'front' ? '正视' : '立体'))
function toggleView() {
  viewMode.value = viewMode.value === 'front' ? 'iso' : 'front'
  localStorage.setItem('ps_view', viewMode.value)
  renderer?.setViewMode(viewMode.value)
}
const showParams = ref(true)

// 规范化：所有可动元件补齐 properties/initialState（预设数据缺字段时参数面板不崩）
for (const preset of Object.values(presets)) {
  for (const el of preset.elements) {
    if (el.type !== 'wall' && el.type !== 'slope') {
      if (!el.properties) el.properties = { mass: 1, friction: 0, restitution: 0.5 }
      if (!el.initialState) el.initialState = { velocity: { x: 0, y: 0 } }
      if (!el.initialState.velocity) el.initialState.velocity = { x: 0, y: 0 }
    }
  }
}

// 质量显示单位（每个元件独立）：UI 显示 g 时，提交后端前换算回 kg
const massUnit = reactive<Record<string, 'kg' | 'g'>>({})

function toggleMassUnit(el: PhysicsElementInput) {
  const cur = massUnit[el.id] ?? 'kg'
  const next = cur === 'kg' ? 'g' : 'kg'
  const m = el.properties?.mass ?? 1
  el.properties!.mass = next === 'g' ? m * 1000 : m / 1000
  massUnit[el.id] = next
}

const LINE_COLORS = ['#4A90D9', '#E05555', '#F5C542', '#3ecf8e', '#b06ce6', '#6cd9e8']

function statusText() {
  switch (state.status) {
    case 'running': return `▶ 运行中 t=${state.currentT.toFixed(2)}s`
    case 'paused': return `⏸ 已暂停 t=${state.currentT.toFixed(2)}s`
    case 'ended': return `■ 已结束 (${state.endInfo?.reason ?? ''} ${state.endInfo?.totalDuration.toFixed(2) ?? 0}s)`
    case 'connecting': return '… 连接中'
    default: return '待运行'
  }
}

const busy = computed(() => state.status === 'running' || state.status === 'paused' || state.status === 'connecting')

function startRun() {
  const preset = presets[selected.value]
  // 深拷贝当前参数快照，避免运行中面板编辑影响已提交场景；质量按显示单位换算回 kg
  const elements: PhysicsElementInput[] = JSON.parse(JSON.stringify(preset.elements))
  for (const el of elements) {
    if ((massUnit[el.id] ?? 'kg') === 'g' && el.properties) {
      el.properties.mass = el.properties.mass / 1000
    }
  }
  const config = JSON.parse(JSON.stringify(preset.config))
  renderer?.syncElements(elements)
  run(elements, config)
}

watch(selected, () => {
  renderer?.syncElements(presets[selected.value].elements)
})

watch(
  () => state.subjects,
  (subjects) => renderer?.updateStates(subjects),
  { deep: true },
)

// v-t 图增量刷新（每 6 帧一次）：带符号速度分量 + Ek/p 双轴
// replaceMerge 清掉上一场残留 series（切实验后旧曲线不再滞留）
watch(
  () => state.frameCount,
  (n) => {
    if (!chart || n % 6 !== 0) return
    const series: echarts.SeriesOption[] = []
    state.vSeries.forEach((s, i) => {
      const color = LINE_COLORS[i % LINE_COLORS.length]
      const id = state.vIds[i] ?? `主体${i + 1}`
      series.push({
        name: `${id}.vx`, type: 'line', showSymbol: false,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        data: s.map((p) => [p.t, +p.vx.toFixed(3)]),
      })
      series.push({
        name: `${id}.vy`, type: 'line', showSymbol: false,
        lineStyle: { color, width: 1.5, type: 'dashed', opacity: 0.7 },
        itemStyle: { color },
        data: s.map((p) => [p.t, +p.vy.toFixed(3)]),
      })
    })
    series.push({
      name: '总动能 Ek', type: 'line', showSymbol: false, yAxisIndex: 1,
      lineStyle: { color: '#F5C542', width: 1.5 },
      itemStyle: { color: '#F5C542' },
      data: state.ekSeries.map((p) => [p.t, +p.v.toFixed(3)]),
    })
    series.push({
      name: '总动量模 p', type: 'line', showSymbol: false, yAxisIndex: 1,
      lineStyle: { color: '#6cd9e8', width: 1.5 },
      itemStyle: { color: '#6cd9e8' },
      data: state.pSeries.map((p) => [p.t, +p.v.toFixed(3)]),
    })
    chart.setOption({ series }, { replaceMerge: ['series'] })
  },
)

onMounted(async () => {
  // 演示页免登录：demo token 只存内存，不触发路由守卫放行（实验台仍需正式登录）
  await ensureDemoLogin()
  if (canvasRef.value) {
    renderer = createSimRenderer(canvasRef.value)
    renderer.setViewMode(viewMode.value)
    renderer.syncElements(presets[selected.value].elements)
  }
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      darkMode: true,
      animation: false,
      grid: { left: 50, right: 55, top: 30, bottom: 28 },
      legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 2 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', name: 't/s', nameTextStyle: { color: '#6c6c85' },
        axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
      yAxis: [
        { type: 'value', name: 'v (m/s)', nameTextStyle: { color: '#6c6c85' },
          axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
        { type: 'value', name: 'Ek(J) / p(kg·m/s)', nameTextStyle: { color: '#6c6c85' },
          axisLabel: { color: '#8a8aa0' }, splitLine: { show: false } },
      ],
      series: [],
    })
  }
})

onUnmounted(() => {
  renderer?.dispose()
  chart?.dispose()
})
</script>

<template>
  <main class="sim-page">
    <section class="toolbar">
      <select v-model="selected" :disabled="state.status === 'running' || state.status === 'paused'">
        <option v-for="(p, k) in presets" :key="k" :value="k">{{ p.name }}</option>
      </select>
      <button class="primary" :disabled="state.status === 'running' || state.status === 'connecting'"
              @click="startRun">▶ 运行</button>
      <button :disabled="state.status !== 'running'" @click="pause">⏸ 暂停</button>
      <button :disabled="state.status !== 'paused'" @click="play">▶ 继续</button>
      <button :disabled="state.status !== 'paused'" @click="step">⏭ 单步</button>
      <button :disabled="state.status === 'ended' || state.status === 'idle'" @click="end">■ 停止</button>
      <span class="status">{{ statusText() }}</span>
      <button class="ghost" @click="toggleView" title="正视=课本插图视角；立体=等距 2.5D">📐 {{ viewLabel }}</button>
      <button class="ghost" @click="showParams = !showParams">
        {{ showParams ? '收起参数' : '展开参数' }}
      </button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="showParams" class="params">
      <div class="param-group" v-for="el in presets[selected].elements" :key="el.id">
        <h3>{{ el.id }} <code>{{ el.type }}</code></h3>
        <div class="fields">
          <template v-if="el.type === 'e_field'">
            <label>场强 Ex (N/C)
              <input type="number" step="0.5" v-model.number="el.properties!.eFieldX" :disabled="busy">
            </label>
            <label>场强 Ey (N/C)
              <input type="number" step="0.5" v-model.number="el.properties!.eFieldY" :disabled="busy">
            </label>
          </template>
          <template v-else-if="el.type === 'b_field'">
            <label>磁感应强度 B (T)
              <input type="number" step="0.1" min="0" v-model.number="el.properties!.bField" :disabled="busy">
            </label>
            <label>磁场方向
              <select v-model="el.properties!.bDirection" :disabled="busy">
                <option value="out">⊙ 垂直纸面向外</option>
                <option value="in">⊗ 垂直纸面向内</option>
              </select>
            </label>
          </template>
          <template v-else-if="el.type === 'point_charge'">
            <label>质量 m (kg)
              <input type="number" step="0.5" min="0.1" v-model.number="el.properties!.mass" :disabled="busy">
            </label>
            <label>电荷量 q (C)
              <input type="number" step="0.5" v-model.number="el.properties!.charge" :disabled="busy">
            </label>
            <label>初速 vx (m/s)
              <input type="number" step="1" v-model.number="el.initialState!.velocity!.x" :disabled="busy">
            </label>
            <label>初速 vy (m/s)
              <input type="number" step="1" v-model.number="el.initialState!.velocity!.y" :disabled="busy">
            </label>
          </template>
          <template v-else-if="el.type !== 'wall' && el.type !== 'slope'">
            <label>质量 m
              <span class="unit-row">
                <input type="number" step="0.5" min="0.0001" v-model.number="el.properties!.mass" :disabled="busy">
                <button class="unit" @click="toggleMassUnit(el)" :disabled="busy"
                        :title="(massUnit[el.id] ?? 'kg') === 'kg' ? '切换为克' : '切换为千克'">
                  {{ massUnit[el.id] ?? 'kg' }}
                </button>
              </span>
            </label>
            <label>摩擦系数 μ<span class="unit-hint">0~1 无量纲</span>
              <input type="number" step="0.05" min="0" max="1" v-model.number="el.properties!.friction" :disabled="busy">
            </label>
            <label>弹性 e<span class="unit-hint">0~1 无量纲</span>
              <input type="number" step="0.1" min="0" max="1" v-model.number="el.properties!.restitution" :disabled="busy">
            </label>
            <label>初速 vx (m/s)
              <input type="number" step="1" v-model.number="el.initialState!.velocity!.x" :disabled="busy">
            </label>
            <label>初速 vy (m/s)
              <input type="number" step="1" v-model.number="el.initialState!.velocity!.y" :disabled="busy">
            </label>
          </template>
          <span v-else class="hint">固定元件（{{ el.type === 'slope' ? '斜面默认固定' : '地面' }}）</span>
        </div>
      </div>
      <div class="param-group">
        <h3>全局配置</h3>
        <div class="fields">
          <label>重力 gy (m/s²)<span class="unit-hint">0 = 无重力</span>
            <input type="number" step="0.5" v-model.number="presets[selected].config.gravity.y" :disabled="busy">
          </label>
          <label>时长上限 (s)
            <input type="number" step="1" min="1" max="30" v-model.number="presets[selected].config.maxDuration" :disabled="busy">
          </label>
        </div>
      </div>
    </section>

    <section class="content">
      <div class="canvas-wrap">
        <canvas ref="canvasRef"></canvas>
        <div v-if="state.keyEvents.length" class="events">
          <div v-for="(ev, i) in state.keyEvents" :key="i" class="event-tag">
            ⚡ {{ ev.label }} @ {{ ev.t.toFixed(2) }}s
          </div>
        </div>
      </div>
      <div class="chart-wrap">
        <div ref="chartRef" class="chart"></div>
        <div class="meta">
          <div>接收帧数: {{ state.frameCount }}</div>
          <div>关键事件: {{ state.keyEvents.length }}</div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sim-page { max-width: 1280px; margin: 0 auto; padding: 16px 24px; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.toolbar select, .toolbar button {
  background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a;
  border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer;
}
.toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
.toolbar .primary { background: #2b5c8f; border-color: #4a90d9; }
.toolbar .ghost { background: transparent; color: #8a8aa0; }
.status { color: #8a8aa0; font-size: 13px; margin-left: 8px; }
.error { color: #e05555; font-size: 13px; }
.params {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 10px; margin-bottom: 10px;
}
.param-group {
  background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px;
  padding: 10px 14px 12px;
}
.param-group h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 8px; font-weight: 600; }
.param-group h3 code { color: #4a90d9; font-size: 11px; background: #23233a; padding: 1px 6px; border-radius: 4px; }
.param-group .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px 10px; }
.param-group label {
  display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #8a8aa0;
}
.param-group input {
  width: 100%; background: #23233a; border: 1px solid #2f2f4a; border-radius: 4px;
  color: #e8e8f0; padding: 4px 6px; font-size: 12px;
}
.param-group input:disabled { opacity: 0.45; }
.param-group .unit-row { display: flex; gap: 4px; align-items: stretch; }
.param-group .unit-row input { width: 100%; min-width: 0; flex: 1; }
.param-group button.unit {
  flex-shrink: 0; width: 38px; background: #2f2f4a; color: #8a8aa0;
  border: 1px solid #3d3d5e; border-radius: 4px; font-size: 11px; cursor: pointer;
}
.param-group .unit-hint { font-size: 10px; color: #565675; }
.param-group .hint { font-size: 11px; color: #6c6c85; }
.content { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; }
.canvas-wrap { position: relative; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.canvas-wrap canvas { display: block; width: 100%; height: 520px; }
.events { position: absolute; top: 10px; left: 10px; display: flex; flex-direction: column; gap: 6px; }
.event-tag {
  background: rgba(62, 207, 142, 0.15); border: 1px solid #3ecf8e; color: #7fe3b3;
  font-size: 11px; border-radius: 4px; padding: 2px 8px;
}
.chart-wrap { display: flex; flex-direction: column; gap: 8px; }
.chart { height: 460px; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; }
.meta { display: flex; gap: 18px; color: #6c6c85; font-size: 12px; }
@media (max-width: 960px) { .content { grid-template-columns: 1fr; } }
</style>
