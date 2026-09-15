<script setup lang="ts">
/**
 * B2 约束实验族的仪器动画舞台：按 mode 绘制并驱动真实装置
 *   spring 弹簧振子 / pendulum 单摆（随秒表摆动）/ conical 圆锥摆（透视）/ newtonTube 牛顿管落体
 *   gas 注射器等温压缩 + 压强表 / workV 橡皮筋弹射小车 / actionR 双车弹簧弹开
 * 全部解析驱动，params 变化即时生效；trigger 递增 = 重新开始一次动画。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { fitCanvas, label, makeLoop } from './circuit'

const props = defineProps<{
  mode: 'spring' | 'pendulum' | 'conical' | 'newtonTube' | 'gas' | 'workV' | 'actionR'
  params: Record<string, number>
  running?: boolean
  trigger?: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null
let t = 0
const g = 9.8
watch(() => props.trigger, () => (t = 0))

function spring(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const m = props.params.m ?? 0.1, k = props.params.k ?? 20, A = props.params.A ?? 0.05
  const omega = Math.sqrt(k / m)
  const x = A * Math.cos(omega * t)
  const S = 900, cx = w * 0.45, ceilY = 30, eqY = h * 0.55
  ctx.fillStyle = '#3d3d5e'; ctx.fillRect(cx - 80, ceilY - 10, 160, 10)
  const massY = eqY + x * S
  // 弹簧锯齿
  ctx.strokeStyle = '#b0b0cc'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx, ceilY)
  const coils = 14, len = massY - 22 - ceilY
  for (let i = 1; i <= coils; i++) ctx.lineTo(cx + (i % 2 ? 14 : -14), ceilY + (len * i) / coils)
  ctx.lineTo(cx, massY - 22); ctx.stroke()
  ctx.fillStyle = '#4A90D9'; ctx.fillRect(cx - 24, massY - 22, 48, 44)
  label(ctx, `${(m * 1000).toFixed(0)} g`, cx, massY, '#fff', 12)
  // 平衡位置与刻度尺
  ctx.strokeStyle = '#565675'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx - 90, eqY); ctx.lineTo(cx + 120, eqY); ctx.stroke(); ctx.setLineDash([])
  label(ctx, '平衡位置', cx + 150, eqY, '#8a8aa0', 11)
  ctx.fillStyle = '#d9a05a'; ctx.fillRect(cx + 70, eqY - 0.12 * S, 16, 0.24 * S)
  ctx.strokeStyle = '#14142a'
  for (let cm = -12; cm <= 12; cm++) {
    const y = eqY + (cm / 100) * S
    ctx.beginPath(); ctx.moveTo(cx + 70, y); ctx.lineTo(cx + 70 + (cm % 5 === 0 ? 10 : 5), y); ctx.stroke()
  }
  label(ctx, `x = ${(x * 100).toFixed(1)} cm　T = 2π√(m/k) = ${(2 * Math.PI / omega).toFixed(3)} s`, w / 2, h - 12, '#7fe3b3', 12)
}

function pendulum(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const L = props.params.L ?? 1, th0 = (props.params.theta0 ?? 10) * Math.PI / 180
  const omega = Math.sqrt(g / L)
  const th = props.running ? th0 * Math.cos(omega * t) : th0
  const S = Math.min((h - 90) / 2.1, 130)
  const px = w / 2, py = 28
  ctx.fillStyle = '#3d3d5e'; ctx.fillRect(px - 60, py - 10, 120, 10)
  ctx.strokeStyle = '#565675'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + L * S + 30); ctx.stroke(); ctx.setLineDash([])
  const bx = px + Math.sin(th) * L * S, by = py + Math.cos(th) * L * S
  ctx.strokeStyle = '#b0b0cc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke()
  ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.arc(bx, by, 12, 0, Math.PI * 2); ctx.fill()
  // 角度弧
  ctx.strokeStyle = '#E05555'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(px, py, 50, Math.PI / 2, Math.PI / 2 - th, th > 0); ctx.stroke()
  label(ctx, `θ = ${(th * 180 / Math.PI).toFixed(1)}°`, px + 66, py + 46, '#E05555', 11)
  label(ctx, `L = ${L.toFixed(2)} m　T = 2π√(L/g) = ${(2 * Math.PI / omega).toFixed(3)} s　${props.running ? '计时中：数全振动次数' : '按「启动计时」开始摆动'}`, w / 2, h - 12, '#7fe3b3', 12)
}

function conical(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const L = props.params.L ?? 0.5, th = (props.params.theta ?? 30) * Math.PI / 180
  const r = L * Math.sin(th), hh = L * Math.cos(th)
  const omega = Math.sqrt(g / hh)
  const phi = omega * t
  const S = Math.min((h - 90) / 1.6, 200)
  const px = w / 2, py = 30
  ctx.fillStyle = '#3d3d5e'; ctx.fillRect(px - 60, py - 10, 120, 10)
  // 轨迹椭圆（透视）
  const cy = py + hh * S
  ctx.strokeStyle = '#565675'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1
  ctx.beginPath(); ctx.ellipse(px, cy, r * S, r * S * 0.35, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, cy); ctx.stroke(); ctx.setLineDash([])
  const bx = px + Math.cos(phi) * r * S, by = cy + Math.sin(phi) * r * S * 0.35
  ctx.strokeStyle = '#b0b0cc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke()
  ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill()
  // 向心力箭头（指向圆心投影）
  ctx.strokeStyle = '#3ecf8e'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + (px - bx) * 0.45, by + (cy - by) * 0.45); ctx.stroke()
  label(ctx, `θ = ${(th * 180 / Math.PI).toFixed(0)}°`, px + 40, py + 40, '#E05555', 11)
  label(ctx, `r = L·sinθ = ${r.toFixed(3)} m　ω = √(g/Lcosθ) = ${omega.toFixed(2)} rad/s　F向 = mg·tanθ = mω²r`, w / 2, h - 12, '#7fe3b3', 12)
}

function newtonTube(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const air = props.params.airFrac ?? 1
  const H = 1.0, S = (h - 80) / H
  const top = 30
  // 硬币自由落体；羽毛受 −k·v 阻力（k ∝ 气压）
  const yCoin = Math.min(H, 0.5 * g * t * t)
  const k = air * 9
  const yFeather = k < 1e-6 ? yCoin : Math.min(H, (g / k) * t - (g / (k * k)) * (1 - Math.exp(-k * t)))
  const tubeX = w / 2
  ctx.fillStyle = 'rgba(108,217,232,0.08)'; ctx.strokeStyle = '#6cd9e8'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(tubeX - 50, top - 10, 100, H * S + 30, 14); ctx.fill(); ctx.stroke()
  label(ctx, air === 0 ? '真空' : `气压 ${air.toFixed(1)} atm`, tubeX, top + 4, '#6cd9e8', 11)
  ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.ellipse(tubeX - 20, top + 20 + yCoin * S, 10, 4, 0, 0, Math.PI * 2); ctx.fill()
  label(ctx, '硬币', tubeX - 20, top + 20 + yCoin * S - 12, '#F5C542', 10)
  ctx.strokeStyle = '#d9dce8'; ctx.lineWidth = 2
  const fy = top + 20 + yFeather * S
  ctx.beginPath(); ctx.moveTo(tubeX + 14, fy - 12); ctx.lineTo(tubeX + 26, fy + 8); ctx.stroke()
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(tubeX + 14 + i * 3, fy - 12 + i * 5); ctx.lineTo(tubeX + 6 + i * 3, fy - 8 + i * 5); ctx.stroke() }
  label(ctx, '羽毛', tubeX + 28, fy - 16, '#d9dce8', 10)
  ctx.strokeStyle = '#3d3d5e'; ctx.beginPath(); ctx.moveTo(tubeX - 46, top + 20 + H * S); ctx.lineTo(tubeX + 46, top + 20 + H * S); ctx.stroke()
  const tCoin = Math.sqrt(2 * H / g)
  label(ctx, `t = ${t.toFixed(2)} s　硬币落地 ${tCoin.toFixed(2)} s　${air === 0 ? '羽毛同时落地（无空气阻力）' : '羽毛更慢（空气阻力）'}`, w / 2, h - 12, '#7fe3b3', 12)
}

function gas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // 6 秒一周期：60 mL → 20 mL → 60 mL 缓慢压缩/释放
  const phase = (t % 6) / 6
  const V = 40 + 20 * Math.cos(phase * Math.PI * 2) // mL
  const p = 101.3 * 60 / V // kPa
  const bx = 50, by = h * 0.5, bw = w * 0.55, bh = 60
  ctx.fillStyle = 'rgba(108,217,232,0.10)'; ctx.strokeStyle = '#6cd9e8'; ctx.lineWidth = 1.5
  ctx.fillRect(bx, by - bh / 2, bw, bh); ctx.strokeRect(bx, by - bh / 2, bw, bh)
  const pistonX = bx + (V / 60) * bw
  ctx.fillStyle = '#b0b0cc'; ctx.fillRect(pistonX - 6, by - bh / 2 + 2, 12, bh - 4)
  ctx.fillRect(pistonX, by - 5, w * 0.3, 10)
  ctx.fillStyle = 'rgba(62,207,142,0.18)'; ctx.fillRect(bx + 2, by - bh / 2 + 2, pistonX - bx - 8, bh - 4)
  ctx.strokeStyle = '#8a8aa0'
  for (let mL = 0; mL <= 60; mL += 10) { const x = bx + (mL / 60) * bw; ctx.beginPath(); ctx.moveTo(x, by + bh / 2); ctx.lineTo(x, by + bh / 2 + 8); ctx.stroke(); label(ctx, `${mL}`, x, by + bh / 2 + 18, '#8a8aa0', 9) }
  label(ctx, 'mL', bx + bw + 16, by + bh / 2 + 18, '#8a8aa0', 9)
  // 压强表
  const gx = bx + 60, gy = by - bh / 2 - 60
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 2; ctx.fillStyle = '#14142a'
  ctx.beginPath(); ctx.arc(gx, gy, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  const frac = Math.min(1, (p - 80) / 240)
  const ang = Math.PI * 0.75 + frac * Math.PI * 1.5
  ctx.strokeStyle = '#E05555'; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ang) * 28, gy + Math.sin(ang) * 28); ctx.stroke()
  label(ctx, `${p.toFixed(0)} kPa`, gx, gy + 48, '#E05555', 11)
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy + 34); ctx.lineTo(gx, by - bh / 2); ctx.stroke()
  label(ctx, `V = ${V.toFixed(1)} mL　p = ${p.toFixed(1)} kPa　pV = ${(p * V / 1000).toFixed(2)} J（恒定 → 等温）`, w / 2, h - 12, '#7fe3b3', 12)
}

function workV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // 每 1.6s 一次弹射：橡皮筋条数 n=1..6 循环，v ∝ √n
  const trial = Math.floor(t / 1.6) % 6 + 1
  const tt = (t % 1.6)
  const v = Math.sqrt(trial) * 0.9
  const trackY = h * 0.62
  ctx.fillStyle = '#23233a'; ctx.fillRect(20, trackY, w - 40, 10)
  // 木板轻微倾斜（平衡摩擦）示意文字
  label(ctx, '木板已垫高平衡摩擦 → 小车弹出后匀速', w / 2, trackY + 30, '#6c6c85', 11)
  // 橡皮筋钉子 + 小车
  const startX = 60
  const launch = Math.min(1, tt / 0.25)
  const carX = startX + (tt < 0.25 ? launch * 40 : 40 + v * (tt - 0.25) * 120)
  ctx.fillStyle = '#4A90D9'; ctx.fillRect(carX, trackY - 26, 46, 26)
  ctx.fillStyle = '#8a8aa0'; ctx.beginPath(); ctx.arc(carX + 10, trackY, 5, 0, Math.PI * 2); ctx.arc(carX + 36, trackY, 5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2
  for (let i = 0; i < trial; i++) {
    const stretch = tt < 0.25 ? (1 - launch) * 40 : 0
    ctx.beginPath(); ctx.moveTo(30, trackY - 30 + i * 4); ctx.lineTo(startX + 40 - stretch, trackY - 14 + i * 2); ctx.stroke()
  }
  label(ctx, `${trial} 条橡皮筋`, 40, trackY - 48, '#E05555', 12)
  // 纸带/速度读数
  if (tt > 0.3) { ctx.strokeStyle = '#3ecf8e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(carX + 46, trackY - 13); ctx.lineTo(carX + 46 + v * 40, trackY - 13); ctx.stroke() }
  label(ctx, `W = ${trial}·W₀　v = ${v.toFixed(2)} m/s　v² = ${(v * v).toFixed(2)} → v² ∝ W`, w / 2, h - 12, '#7fe3b3', 12)
}

function actionR(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const m1 = props.params.m1 ?? 1, m2 = props.params.m2 ?? 2, J = props.params.J ?? 6
  const tt = t % 3.6
  const REL = 0.8, TAU = 0.35                      // 释放时刻、弹簧作用时长（恒力近似）
  const v1 = -J / m1, v2 = J / m2                  // 末速度（冲量定理）
  const F = J / TAU                                // 作用阶段等大反向的力
  const cx = w / 2, trackY = h * 0.6, PX = 30
  ctx.fillStyle = '#23233a'; ctx.fillRect(20, trackY, w - 40, 10)
  const t1 = Math.max(0, tt - REL)
  const phase = Math.min(1, t1 / TAU)              // 0..1 弹簧作用进度
  // 位移：作用阶段匀加速 s=v·t'²/(2τ)，之后匀速
  const disp = (v: number) => (t1 <= TAU ? (v * t1 * t1) / (2 * TAU) : (v * TAU) / 2 + v * (t1 - TAU)) * PX
  const dx1 = disp(v1), dx2 = disp(v2)
  const w1 = 30 + m1 * 10, w2 = 30 + m2 * 10
  const x1 = cx - 22 - w1 + dx1, x2 = cx + 22 + dx2
  // 弹簧：作用结束前始终连着两车，随两车分开逐渐伸展变直
  if (phase < 1) {
    const gap = x2 - (x1 + w1)
    const amp = 8 * (1 - phase * 0.7)
    ctx.strokeStyle = phase > 0 ? '#ffb347' : '#F5C542'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x1 + w1, trackY - 14)
    for (let i = 1; i <= 8; i++) ctx.lineTo(x1 + w1 + (gap * i) / 8, trackY - 14 + (i % 2 ? -amp : amp))
    ctx.lineTo(x2, trackY - 14); ctx.stroke()
    if (phase === 0) { // 锁定夹
      ctx.fillStyle = '#8a8aa0'; ctx.fillRect(cx - 3, trackY - 40, 6, 26)
      label(ctx, '压缩弹簧 · 夹子锁定', cx, trackY - 50, '#8a8aa0', 11)
    }
  }
  ctx.fillStyle = '#4A90D9'; ctx.fillRect(x1, trackY - 30, w1, 30); label(ctx, `m₁=${m1}kg`, x1 + w1 / 2, trackY - 15, '#fff', 11)
  ctx.fillStyle = '#E05555'; ctx.fillRect(x2, trackY - 30, w2, 30); label(ctx, `m₂=${m2}kg`, x2 + w2 / 2, trackY - 15, '#fff', 11)
  // 作用阶段：等长反向的力箭头——牛顿第三定律的直观呈现
  if (phase > 0 && phase < 1) {
    const L = 52
    arrow(ctx, x1 + w1 / 2, trackY - 15, x1 + w1 / 2 - L, trackY - 15, '#ffb347')
    arrow(ctx, x2 + w2 / 2, trackY - 15, x2 + w2 / 2 + L, trackY - 15, '#ffb347')
    label(ctx, `F₁ = ${F.toFixed(1)} N`, x1 + w1 / 2 - L - 6, trackY - 44, '#ffb347', 11)
    label(ctx, `F₂ = ${F.toFixed(1)} N`, x2 + w2 / 2 + L + 6, trackY - 44, '#ffb347', 11)
    label(ctx, `释放！F₁ = −F₂，同时作用 ${TAU} s`, cx, trackY - 66, '#ffb347', 12)
  }
  // 分离后：速度矢量（与质量成反比）
  if (phase >= 1) {
    arrow(ctx, x1, trackY - 40, x1 + v1 * 10, trackY - 40, '#3ecf8e')
    arrow(ctx, x2 + w2, trackY - 40, x2 + w2 + v2 * 10, trackY - 40, '#3ecf8e')
    label(ctx, `v₁ = ${v1.toFixed(2)} m/s`, x1 - 10, trackY - 54, '#3ecf8e', 11)
    label(ctx, `v₂ = ${v2.toFixed(2)} m/s`, x2 + w2 + 10, trackY - 54, '#3ecf8e', 11)
  }
  label(ctx, `F₁ = −F₂ 且作用时间相同 → 冲量等大反向 → m₁v₁ + m₂v₂ = ${(m1 * v1 + m2 * v2).toFixed(2)}`, w / 2, h - 12, '#7fe3b3', 12)
}

/** 带箭头的线段 */
function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - 8 * Math.cos(ang - 0.4), y1 - 8 * Math.sin(ang - 0.4))
  ctx.lineTo(x1 - 8 * Math.cos(ang + 0.4), y1 - 8 * Math.sin(ang + 0.4))
  ctx.closePath(); ctx.fill()
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  switch (props.mode) {
    case 'spring': spring(ctx, w, h); break
    case 'pendulum': pendulum(ctx, w, h); break
    case 'conical': conical(ctx, w, h); break
    case 'newtonTube': newtonTube(ctx, w, h); break
    case 'gas': gas(ctx, w, h); break
    case 'workV': workV(ctx, w, h); break
    case 'actionR': actionR(ctx, w, h); break
  }
}

onMounted(() => {
  loop = makeLoop((dt) => {
    // 单摆只在计时进行时推进；其余模式持续动画
    if (props.mode !== 'pendulum' || props.running) t += dt
    draw()
  })
})
onUnmounted(() => loop?.stop())
</script>

<template>
  <div class="stage"><canvas ref="canvasRef"></canvas></div>
</template>

<style scoped>
.stage { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; height: 360px; }
.stage canvas { display: block; width: 100%; height: 100%; }
</style>
