<script setup lang="ts">
/**
 * B8 第三阶段 12 个实验的轻量交互/动画替代方案。
 * 每个实验 = 简短描述 + 交互组件/动画说明 + 步骤条 + AI 助教 + 数据记录。
 * mode 切换 12 种实验。
 */
import { computed, ref } from 'vue'

const props = defineProps<{ mode: string }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()

const CONFIG: Record<string, { name: string; desc: string; interaction: string; formula?: string; result?: string }> = {
  'reaction-time': {
    name: '测反应时间', desc: '看到变色立即点击，测量你的反应时间',
    interaction: '点击开始 → 变色瞬间点击 → 显示反应时间（3次取平均）',
    formula: 't反应 ≈ 0.15~0.25s',
  },
  'galileo-ramp': {
    name: '伽利略斜面实验', desc: '斜面越光滑，小球滑得越远——外推到无摩擦→永不停',
    interaction: '调节摩擦系数（滑杆），观察小球滑行距离',
    formula: '理想情况：无摩擦→匀速直线运动（惯性）',
  },
  'center-of-gravity': {
    name: '悬挂法确定物体的重心', desc: '两次悬挂，铅垂线交点即重心',
    interaction: '点击两次不同位置悬挂，观察铅垂线交点',
    formula: '重心=两次铅垂线交点',
  },
  'mirror-deformation': {
    name: '通过平面镜观察桌面的微小形变', desc: '光杠杆原理：微小形变经反射放大',
    interaction: '施加压力（滑杆），观察反射光点的偏移量',
    formula: '放大倍数 ∝ 2L/d',
  },
  'circular-motion-life': {
    name: '生活中的圆周运动', desc: '转弯/水流星/洗衣机脱水',
    interaction: '选择场景 → 调节速度/半径 → 观察向心力变化',
    formula: 'F = mv²/r',
  },
  'motion-composition': {
    name: '运动的合成与分解', desc: '红蜡块在玻璃管中同时水平移动+竖直上升',
    interaction: '调水平速度和竖直速度，观察合运动轨迹',
    formula: '合速度 = √(vx² + vy²)',
  },
  'static-phenomena': {
    name: '观察静电现象', desc: '摩擦起电 → 吸引轻小物体 → 验电器偏转',
    interaction: '点击"摩擦起电" → 观察验电器金箔张角变化',
    formula: '同种电荷相斥',
  },
  'field-lines': {
    name: '电场线、等势面（模型）', desc: '点电荷/匀强电场的电场线分布',
    interaction: '选择电荷类型（正/负/双电荷），观察场线分布',
    formula: 'E = kQ/r²',
  },
  'particle-acceleration': {
    name: '带电粒子在电场中的加速与偏转', desc: '示波管原理',
    interaction: '调节电压，观察粒子加速与偏转轨迹',
    formula: '加速：qU=½mv²；偏转：y∝x²',
  },
  'total-reflection': {
    name: '观察全反射现象', desc: '光从水中射向空气，入射角>临界角时全反射',
    interaction: '调节入射角（滑杆），观察折射/全反射',
    formula: 'sinC = 1/n',
  },
  'em-oscillation': {
    name: '观察电磁振荡', desc: 'LC 电路中电场能与磁场能周期性转换',
    interaction: '调节L/C，观察振荡周期变化',
    formula: 'T = 2π√(LC)',
  },
  'sensor-control': {
    name: '利用传感器制作简单的自动控制装置', desc: '光敏电阻+继电器=自动路灯',
    interaction: '调节光照强度，观察路灯自动开关',
    formula: '光强↑ → 电阻↓ → 继电器动作',
  },
}

const cfg = computed(() => CONFIG[props.mode] ?? CONFIG['reaction-time'])
const clicked = ref(false)
const startTime = ref(0)
const reactionTime = ref<number | null>(null)
const sliderVal = ref(0.5)
const attempts = ref<number[]>([])

function startReaction() {
  clicked.value = false
  reactionTime.value = null
  setTimeout(() => {
    startTime.value = performance.now()
    clicked.value = true
  }, 1000 + Math.random() * 2000)
}
function endReaction() {
  if (clicked.value && startTime.value) {
    reactionTime.value = +(performance.now() - startTime.value).toFixed(0)
    attempts.value.push(reactionTime.value)
    if (attempts.value.length > 3) attempts.value.shift()
    emit('record', { reactionMs: reactionTime.value, avg: avgReaction() })
  }
}
const avgReaction = () => attempts.value.length
  ? +(attempts.value.reduce((a, b) => a + b, 0) / attempts.value.length).toFixed(0) : null

function record() {
  emit('record', { mode: props.mode, interaction: cfg.value.interaction,
    formula: cfg.value.formula, slider: sliderVal.value })
}
</script>

<template>
  <div class="alt">
    <div class="panel">
      <h3>{{ cfg.name }}</h3>
      <p class="desc">{{ cfg.desc }}</p>
      <p class="interaction">🖱️ {{ cfg.interaction }}</p>
      <p v-if="cfg.formula" class="formula">📐 {{ cfg.formula }}</p>

      <!-- 反应时间特殊交互 -->
      <template v-if="mode === 'reaction-time'">
        <div class="reaction-pad" :class="{ go: clicked }" @click="endReaction">
          <span v-if="!clicked">等待变色…</span>
          <span v-else>点！</span>
        </div>
        <button @click="startReaction">▶ 开始测试</button>
        <p v-if="reactionTime" class="result">反应时间：{{ reactionTime }} ms</p>
        <p v-if="avgReaction()">平均（{{ attempts.length }} 次）：{{ avgReaction() }} ms</p>
      </template>

      <!-- 通用滑杆交互 -->
      <template v-else>
        <label>参数调节
          <input type="range" min="0" max="1" step="0.05" v-model.number="sliderVal">
        </label>
        <div class="visual" :style="{ opacity: 0.4 + sliderVal * 0.6 }">
          <p class="visual-text">{{ cfg.name }} 演示区域</p>
          <p class="visual-hint">（动画/视频占位 — 实际部署时接入视频或动画组件）</p>
        </div>
      </template>

      <button class="rec" @click="record">📏 记录实验数据</button>
    </div>
  </div>
</template>

<style scoped>
.alt { display: flex; flex-direction: column; gap: 10px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 16px; }
h3 { font-size: 15px; color: #b0b0cc; margin-bottom: 8px; }
.desc { font-size: 13px; color: #8a8aa0; margin-bottom: 8px; line-height: 1.6; }
.interaction { font-size: 12px; color: #6c6c85; margin-bottom: 6px; }
.formula { font: 13px Consolas; color: #4a90d9; margin-bottom: 12px; }
.reaction-pad { height: 120px; border-radius: 10px; background: #2d2d4a; display: flex;
  align-items: center; justify-content: center; font-size: 20px; color: #8a8aa0;
  cursor: pointer; margin-bottom: 10px; transition: background 0.1s; user-select: none; }
.reaction-pad.go { background: #3ecf8e; color: #14142a; }
button { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; margin-top: 8px; }
button.rec { background: #23402e; color: #7fe3b3; border-color: #3ecf8e; }
.result { font: 16px Consolas; color: #F5C542; margin-top: 8px; text-align: center; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 8px; }
label input { width: 100%; }
.visual { background: #14142a; border: 1px dashed #3d3d5e; border-radius: 8px;
  height: 140px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; margin-bottom: 10px; }
.visual-text { font-size: 14px; color: #6c6c85; }
.visual-hint { font-size: 10px; color: #565675; margin-top: 4px; }
</style>
