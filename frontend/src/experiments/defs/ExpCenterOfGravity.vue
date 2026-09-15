<script setup lang="ts">
/**
 * 悬挂法确定物体的重心（必修一 · 做一做）
 * 不规则薄板：点击板边任一点悬挂 → 板摆动至静止、铅垂线过悬点；换点再悬一次；
 * 两条铅垂线（记录在板上）的交点即重心 G。最后"指尖验证"：顶在 G 处能平衡。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

// 板的顶点（板坐标，cm；y 向上）
const PLATE: [number, number][] = [[-9, -6], [7, -8], [10, 2], [4, 9], [-6, 7], [-11, 1]]
/** 多边形质心（鞋带公式） */
const centroid = (() => {
  let A = 0, cx = 0, cy = 0
  for (let i = 0; i < PLATE.length; i++) {
    const [x0, y0] = PLATE[i], [x1, y1] = PLATE[(i + 1) % PLATE.length]
    const cr = x0 * y1 - x1 * y0
    A += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr
  }
  A /= 2
  return { x: cx / (6 * A), y: cy / (6 * A) }
})()

const hangs = ref<{ x: number; y: number }[]>([])   // 悬挂点（板坐标）
const angle = ref(0)         // 板当前转角
let angVel = 0
const phase = ref<'hang' | 'verify'>('hang')
const fingerAt = ref<'G' | 'off'>('G')
const tilt = ref(0)

/** 目标转角：使质心正好位于悬点正下方 */
const targetAngle = computed(() => {
  const h = hangs.value[hangs.value.length - 1]
  if (!h) return 0
  const dx = centroid.x - h.x, dy = centroid.y - h.y
  // 悬点→质心方向应指向 −y（下）；当前方向角 atan2(dy,dx)，需旋转到 −π/2
  return -Math.PI / 2 - Math.atan2(dy, dx)
})

function rot(p: { x: number; y: number }, a: number) {
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }
}

function onClick(e: MouseEvent) {
  const c = canvasRef.value
  if (!c || phase.value !== 'hang' || hangs.value.length >= 2) return
  const rect = c.getBoundingClientRect()
  const { w, h } = { w: c.clientWidth, h: c.clientHeight }
  const scale = Math.min(w, h) / 32
  const cx = w / 2, cy = h * 0.42
  // 屏幕 → 板坐标（先去掉当前转角）
  const wx = (e.clientX - rect.left - cx) / scale, wy = -(e.clientY - rect.top - cy) / scale
  const p = rot({ x: wx, y: wy }, -angle.value)
  // 吸附到最近的边上点
  let best = { x: p.x, y: p.y }, bestD = Infinity
  for (let i = 0; i < PLATE.length; i++) {
    const [x0, y0] = PLATE[i], [x1, y1] = PLATE[(i + 1) % PLATE.length]
    const vx = x1 - x0, vy = y1 - y0
    const t = Math.max(0, Math.min(1, ((p.x - x0) * vx + (p.y - y0) * vy) / (vx * vx + vy * vy)))
    const qx = x0 + t * vx, qy = y0 + t * vy
    const d = Math.hypot(p.x - qx, p.y - qy)
    if (d < bestD) { bestD = d; best = { x: qx, y: qy } }
  }
  if (bestD > 3) return
  hangs.value.push(best)
  angVel = 0
  emit('record', { hangs: hangs.value, centroid })
}
function reset() { hangs.value = []; angle.value = 0; angVel = 0; phase.value = 'hang'; tilt.value = 0 }
function verify(where: 'G' | 'off') { phase.value = 'verify'; fingerAt.value = where; tilt.value = 0 }

function step(dt: number) {
  if (phase.value === 'hang' && hangs.value.length) {
    // 阻尼摆动到目标角
    let diff = targetAngle.value - angle.value
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    angVel += diff * 18 * dt - angVel * 3.2 * dt
    angle.value += angVel * dt
  }
  if (phase.value === 'verify') {
    tilt.value = fingerAt.value === 'G' ? 0 : Math.min(1.2, tilt.value + dt * 1.3)
  }
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const scale = Math.min(w, h) / 32
  const cx = w / 2, cy = h * 0.42
  const S = (p: { x: number; y: number }) => ({ x: cx + p.x * scale, y: cy - p.y * scale })
  const a = phase.value === 'verify' ? (fingerAt.value === 'G' ? 0 : tilt.value) : angle.value
  const hang = hangs.value[hangs.value.length - 1]
  // 悬挂时以悬点为枢轴：平移使悬点在 (cx, cy-6cm)
  let offset = { x: 0, y: 0 }
  if (phase.value === 'hang' && hang) {
    const hr = rot(hang, a)
    offset = { x: -hr.x, y: 6 - hr.y }
  }
  if (phase.value === 'verify') offset = { x: -centroid.x, y: -centroid.y }
  const T = (p: [number, number] | { x: number; y: number }) => {
    const pt = Array.isArray(p) ? { x: p[0], y: p[1] } : p
    const r = rot(pt, a)
    return S({ x: r.x + offset.x, y: r.y + offset.y })
  }
  // 板
  ctx.fillStyle = 'rgba(217,160,90,0.35)'; ctx.strokeStyle = '#d9a05a'; ctx.lineWidth = 2
  ctx.beginPath(); PLATE.forEach((p, i) => { const q = T(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y) }); ctx.closePath(); ctx.fill(); ctx.stroke()
  // 已记录的铅垂线（板坐标：过悬点与质心的直线，画在板上）
  hangs.value.forEach((hp, i) => {
    const dir = { x: centroid.x - hp.x, y: centroid.y - hp.y }
    const len = Math.hypot(dir.x, dir.y) || 1
    const u = { x: dir.x / len, y: dir.y / len }
    const p1 = T({ x: hp.x - u.x * 2, y: hp.y - u.y * 2 })
    const p2 = T({ x: hp.x + u.x * 22, y: hp.y + u.y * 22 })
    ctx.strokeStyle = i === 0 ? '#E05555' : '#4A90D9'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.setLineDash([])
    const hq = T(hp)
    ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.arc(hq.x, hq.y, 4, 0, Math.PI * 2); ctx.fill()
    label(ctx, `悬点 ${i + 1}`, hq.x + 26, hq.y, '#F5C542', 11)
  })
  // 当前悬挂：支架 + 铅垂线（真竖直）
  if (phase.value === 'hang' && hang) {
    const hq = T(hang)
    ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(hq.x, 8); ctx.lineTo(hq.x, hq.y); ctx.stroke()
    ctx.strokeStyle = '#3ecf8e'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(hq.x, hq.y); ctx.lineTo(hq.x, h - 30); ctx.stroke()
    ctx.fillStyle = '#3ecf8e'; ctx.beginPath(); ctx.arc(hq.x, h - 30, 6, 0, Math.PI * 2); ctx.fill()
    label(ctx, '铅垂线', hq.x + 30, h - 30, '#3ecf8e', 11)
  }
  // 交点 = 重心
  if (hangs.value.length >= 2 || phase.value === 'verify') {
    const gq = T(centroid)
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(gq.x, gq.y, 7, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(gq.x - 10, gq.y); ctx.lineTo(gq.x + 10, gq.y); ctx.moveTo(gq.x, gq.y - 10); ctx.lineTo(gq.x, gq.y + 10); ctx.stroke()
    label(ctx, 'G（重心）', gq.x + 44, gq.y - 12, '#F5C542', 12)
  }
  // 验证：指尖
  if (phase.value === 'verify') {
    const fp = fingerAt.value === 'G' ? T(centroid) : T({ x: centroid.x + 5, y: centroid.y - 2 })
    ctx.fillStyle = '#b0b0cc'
    ctx.beginPath(); ctx.moveTo(fp.x - 7, fp.y + 8); ctx.lineTo(fp.x + 7, fp.y + 8); ctx.lineTo(fp.x, fp.y); ctx.closePath(); ctx.fill()
    ctx.fillRect(fp.x - 6, fp.y + 8, 12, 40)
    label(ctx, fingerAt.value === 'G' ? '✓ 顶在重心处：平衡' : '✗ 偏离重心：倾倒', w / 2, h - 16, fingerAt.value === 'G' ? '#7fe3b3' : '#E05555', 13)
  } else {
    label(ctx, hangs.value.length === 0 ? '点击板边任意一点悬挂' : hangs.value.length === 1 ? '等板静止，再点击另一处悬挂'
      : '两条铅垂线的交点即重心 G → 可做指尖验证', w / 2, h - 16, '#8a8aa0', 12)
  }
}

onMounted(() => { loop = makeLoop((dt) => { step(dt); draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel title="悬挂法确定物体的重心" :graph="false"
    desc="薄板悬挂静止时，重心一定在悬点正下方的铅垂线上。换一点再挂一次，两条铅垂线的交点就是重心。"
    formula="悬挂静止 → 重力与拉力共线 → G 在铅垂线上">
    <template #controls>
      <div class="readout">已悬挂 {{ hangs.length }} / 2 次{{ hangs.length >= 2 ? `\n交点 G = (${centroid.x.toFixed(1)}, ${centroid.y.toFixed(1)}) cm` : '' }}</div>
      <div class="row">
        <button class="btn alt" :disabled="hangs.length < 2" @click="verify('G')">指尖顶 G 验证</button>
        <button class="btn ghost" :disabled="hangs.length < 2" @click="verify('off')">顶偏一点</button>
      </div>
      <button class="btn ghost" @click="reset">⟲ 重来</button>
      <p class="hint">点击板边缘选择悬挂点；板会摆动几下后静止。第二次悬挂请选离第一点较远的位置，交点更准。</p>
    </template>
    <canvas ref="canvasRef" @click="onClick"></canvas>
  </LabPanel>
</template>
