<script setup lang="ts">
/**
 * 观察静电现象（必修三）
 * 器材：橡胶棒 + 毛皮（摩擦起电，棒带负电）/ 玻璃棒 + 丝绸（带正电）、验电器、碎纸屑。
 * 交互：点「摩擦起电」→ 拖动棒靠近验电器金属球（感应：金箔张开）→ 接触（导电：金箔保持张开）
 *      → 换带异种电的棒接触可中和；「接地」放电。碎纸屑被带电棒吸引。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const rodKind = ref<'rubber' | 'glass'>('rubber')
const qRod = ref(0)           // 棒电荷（−1 橡胶 / +1 玻璃）
const qE = ref(0)             // 验电器电荷
const rodX = ref(0.22)        // 棒位置（0~1 归一化，靠右接近验电器）
const rubbing = ref(0)        // 摩擦动画进度
const paperBits = ref(Array.from({ length: 7 }, (_, i) => ({ x0: 0.12 + i * 0.03, lift: 0 })))
let dragging = false

const BALL_X = 0.8, TOUCH_X = 0.72
const dist = computed(() => Math.max(0.02, BALL_X - rodX.value - 0.08))
const touching = computed(() => rodX.value >= TOUCH_X)
/** 金箔张角：验电器自身电荷 + 棒靠近时的感应 */
const leafAngle = computed(() => {
  const own = 55 * Math.tanh(Math.abs(qE.value) * 1.2)
  const induced = touching.value ? 0 : 40 * Math.abs(qRod.value) / (1 + (dist.value * 8) ** 2)
  return Math.min(70, own + induced)
})

function rub() {
  rubbing.value = 0.001
  emit('record', { action: 'rub', rod: rodKind.value })
}
function switchRod() {
  rodKind.value = rodKind.value === 'rubber' ? 'glass' : 'rubber'
  qRod.value = 0; rodX.value = 0.22
}
/** 接地：棒靠近（未接触）时接地 → 与棒同号的电荷经接地线流走，移开棒后验电器留下异号电（接地法感应起电）；否则完全放电 */
function ground() {
  if (Math.abs(qRod.value) > 0.1 && dist.value < 0.2 && !touching.value) {
    qE.value = +(-qRod.value * 0.5).toFixed(2)
    emit('record', { action: 'induction_ground', qE: qE.value })
  } else { qE.value = 0; emit('record', { action: 'ground' }) }
}
/** 感应起电机：给棒一次性充上更多电荷（比摩擦强） */
function machine() {
  qRod.value = rodKind.value === 'rubber' ? -1.6 : 1.6
  emit('record', { action: 'machine', rod: rodKind.value })
}

function step(dt: number) {
  if (rubbing.value > 0) {
    rubbing.value += dt * 1.6
    if (rubbing.value >= 1) { rubbing.value = 0; qRod.value = rodKind.value === 'rubber' ? -1 : 1 }
  }
  // 接触导电：棒的电荷部分转移到验电器（同种叠加/异种中和）
  if (touching.value && qRod.value !== 0) {
    const transfer = qRod.value * 0.6
    qE.value = +(qE.value + transfer).toFixed(2)
    qRod.value = +(qRod.value - transfer).toFixed(2)
    if (Math.abs(qRod.value) < 0.05) qRod.value = 0
    emit('record', { action: 'contact', qE: qE.value })
  }
  // 碎纸屑：带电棒经过上方时被吸起
  for (const b of paperBits.value) {
    const near = Math.abs(rodX.value - b.x0) < 0.06 && Math.abs(qRod.value) > 0.1
    b.lift += ((near ? 1 : 0) - b.lift) * Math.min(1, dt * 6)
  }
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const tableY = h * 0.78
  ctx.fillStyle = '#23233a'; ctx.fillRect(0, tableY, w, 8)
  // 碎纸屑
  for (const b of paperBits.value) {
    const x = b.x0 * w, y = tableY - 4 - b.lift * 26
    ctx.fillStyle = '#f2ead7'
    ctx.save(); ctx.translate(x, y); ctx.rotate(b.lift * 0.8); ctx.fillRect(-5, -3, 10, 6); ctx.restore()
  }
  // 验电器：玻璃罩 + 金属球 + 杆 + 两片金箔
  const ex = BALL_X * w, ballY = h * 0.3
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(ex - 46, ballY + 40, 92, tableY - ballY - 40, 8); ctx.stroke()
  ctx.fillStyle = qE.value !== 0 ? (qE.value < 0 ? '#4A90D9' : '#E05555') : '#b0b0cc'
  ctx.beginPath(); ctx.arc(ex, ballY, 14, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#b0b0cc'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(ex, ballY + 14); ctx.lineTo(ex, ballY + 110); ctx.stroke()
  const a = leafAngle.value * Math.PI / 180
  ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(ex, ballY + 110); ctx.lineTo(ex - Math.sin(a) * 60, ballY + 110 + Math.cos(a) * 60); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(ex, ballY + 110); ctx.lineTo(ex + Math.sin(a) * 60, ballY + 110 + Math.cos(a) * 60); ctx.stroke()
  label(ctx, '验电器', ex, tableY + 22, '#8a8aa0', 12)
  if (qE.value !== 0) {
    const sign = qE.value < 0 ? '−' : '+'
    for (let i = 0; i < Math.min(6, Math.round(Math.abs(qE.value) * 5)); i++) label(ctx, sign, ex - 24 + i * 10, ballY - 22, qE.value < 0 ? '#6cd9e8' : '#E05555', 12)
  }
  // 棒 + 摩擦物
  const rx = rodX.value * w, ry = h * 0.32
  ctx.fillStyle = rodKind.value === 'rubber' ? '#2d2d4a' : 'rgba(108,217,232,0.6)'
  ctx.fillRect(rx - 70, ry - 7, 140, 14)
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1; ctx.strokeRect(rx - 70, ry - 7, 140, 14)
  if (qRod.value !== 0) {
    const sign = qRod.value < 0 ? '−' : '+'
    for (let i = 0; i < 6; i++) label(ctx, sign, rx - 55 + i * 22, ry - 16, qRod.value < 0 ? '#6cd9e8' : '#E05555', 12)
  }
  label(ctx, `${rodKind.value === 'rubber' ? '橡胶棒' : '玻璃棒'}（拖动我）`, rx, ry + 24, '#8a8aa0', 11)
  if (rubbing.value > 0) {
    const fx = rx - 60 + rubbing.value * 120
    ctx.fillStyle = rodKind.value === 'rubber' ? '#b07b4a' : '#d9a1f0'
    ctx.fillRect(fx - 22, ry - 22, 44, 14)
    label(ctx, rodKind.value === 'rubber' ? '毛皮' : '丝绸', fx, ry - 32, '#b0b0cc', 11)
  }
  // 说明
  const msg = qRod.value === 0 && qE.value === 0 ? '先「摩擦起电」，再拖棒靠近验电器'
    : touching.value ? '接触：电荷转移到验电器（导电起电）'
    : Math.abs(qRod.value) > 0.1 && dist.value < 0.2 ? '靠近未接触：感应起电，金箔张开；移开即闭合'
    : qE.value !== 0 ? `验电器带${qE.value < 0 ? '负' : '正'}电，金箔张角 ${leafAngle.value.toFixed(0)}°` : '棒已带电，靠近碎纸屑试试吸引'
  label(ctx, msg, w / 2, 18, '#7fe3b3', 12)
}

function onDown(e: PointerEvent) { dragging = true; onMove(e) }
function onMove(e: PointerEvent) {
  if (!dragging) return
  const c = canvasRef.value
  if (!c) return
  const x = (e.clientX - c.getBoundingClientRect().left) / c.clientWidth
  rodX.value = Math.max(0.12, Math.min(TOUCH_X + 0.01, x))
}
function onUp() { dragging = false }

onMounted(() => { loop = makeLoop((dt) => { step(dt); draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel title="观察静电现象" :graph="false"
    desc="摩擦起电：毛皮摩擦橡胶棒，棒带负电（丝绸摩擦玻璃棒带正电）。带电棒能吸引碎纸屑；靠近验电器使金箔张开（感应），接触后金箔保持张开（电荷转移）；用异种电荷可中和。"
    formula="同种电荷相斥，异种电荷相吸　电荷守恒：转移而非创生">
    <template #controls>
      <button class="btn" @click="rub" :disabled="rubbing > 0">🧶 摩擦起电（{{ rodKind === 'rubber' ? '毛皮→橡胶棒' : '丝绸→玻璃棒' }}）</button>
      <div class="row">
        <button class="btn ghost" @click="switchRod">换{{ rodKind === 'rubber' ? '玻璃棒(+)' : '橡胶棒(−)' }}</button>
        <button class="btn ghost" @click="machine">⚡ 起电机充电</button>
        <button class="btn ghost" @click="ground">⏚ 接地</button>
      </div>
      <div class="readout">棒电荷 q棒 = {{ qRod.toFixed(2) }}
验电器电荷 q = {{ qE.toFixed(2) }}
金箔张角 = {{ leafAngle.toFixed(0) }}°</div>
      <p class="hint">三种起电：①摩擦起电；②接触起电——带电棒碰金属球；③感应起电（接地法）——棒靠近不碰 → 点「接地」→ 移开棒，验电器留下与棒异号的电。换另一种棒接触可中和；起电机充电比摩擦强。</p>
    </template>
    <canvas ref="canvasRef" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp"></canvas>
  </LabPanel>
</template>
