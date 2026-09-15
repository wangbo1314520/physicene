<script setup lang="ts">
/**
 * 胡克定律 / 光电效应 仪器舞台
 *   hooke：铁架台 + 弹簧 + 叠加砝码盘 + 刻度尺与指针，伸长量随砝码变化（弹簧伸长动画）
 *   photo：光电管（阴极 K / 阳极 A）+ 单色光束（按频率着色）+ 电子发射动画 + 反向电压与微安表
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { fitCanvas, label, makeLoop } from './circuit'

const props = defineProps<{
  mode: 'hooke' | 'photo'
  /** hooke：砝码质量 g；photo：频率 ×10¹⁴ Hz */
  value: number
  /** hooke：伸长量 m；photo：遏止电压 V */
  reading: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null
let t = 0
let shown = 0 // 平滑显示的伸长量 / 电压

function wl2rgb(nu14: number): string {
  const nm = 3e8 / (nu14 * 1e14) * 1e9
  let r = 0, g = 0, b = 0
  if (nm < 380) { r = 0.6; g = 0.2; b = 1 }
  else if (nm < 440) { r = -(nm - 440) / 60; b = 1 }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1 }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20 }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1 }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65 }
  else r = 1
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
}

function drawHooke(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const x = shown // m
  const S = 900
  const cx = w * 0.42, topY = 40, L0 = 0.06 * S
  // 铁架台
  ctx.fillStyle = '#3d3d5e'; ctx.fillRect(cx - 120, topY - 12, 160, 10); ctx.fillRect(cx - 120, topY - 12, 10, h - topY - 20); ctx.fillRect(cx - 140, h - 30, 220, 10)
  // 弹簧
  const endY = topY + L0 + x * S
  ctx.strokeStyle = '#b0b0cc'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx, topY)
  const coils = 16
  for (let i = 1; i <= coils; i++) ctx.lineTo(cx + (i % 2 ? 13 : -13), topY + ((endY - topY - 16) * i) / coils)
  ctx.lineTo(cx, endY); ctx.stroke()
  // 指针 + 砝码盘 + 砝码
  ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, endY); ctx.lineTo(cx + 60, endY); ctx.stroke()
  ctx.fillStyle = '#8a8aa0'; ctx.fillRect(cx - 26, endY + 4, 52, 4)
  const n = Math.round(props.value / 50)
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? '#d9a05a' : '#c08c4c'
    ctx.fillRect(cx - 18, endY + 8 + i * 12, 36, 11)
  }
  label(ctx, `${props.value} g`, cx, endY + 8 + n * 12 + 14, '#F5C542', 12)
  // 刻度尺（cm），零点对齐无负载指针位置
  const rx = cx + 62, r0 = topY + L0
  ctx.fillStyle = '#f2ead7'; ctx.fillRect(rx, r0 - 10, 24, 0.16 * S + 20)
  ctx.strokeStyle = '#14142a'; ctx.lineWidth = 1
  for (let mm = 0; mm <= 160; mm += 2) {
    const y = r0 + (mm / 1000) * S
    const len = mm % 10 === 0 ? 12 : mm % 5 === 0 ? 8 : 4
    ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + len, y); ctx.stroke()
    if (mm % 20 === 0) label(ctx, `${mm / 10}`, rx + 30, y, '#8a8aa0', 9)
  }
  label(ctx, 'cm', rx + 30, r0 - 20, '#8a8aa0', 9)
  label(ctx, `F = mg = ${(props.value / 1000 * 9.8).toFixed(2)} N　x = ${(x * 100).toFixed(2)} cm　（k = F/x ≈ ${x > 1e-4 ? (props.value / 1000 * 9.8 / x).toFixed(1) : '—'} N/m）`, w / 2, h - 12, '#7fe3b3', 12)
}

function drawPhoto(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const nu = props.value
  const Uc = props.reading
  const color = wl2rgb(nu)
  const cx = w * 0.55, cy = h * 0.42, R = Math.min(w, h) * 0.26
  // 光电管
  ctx.fillStyle = 'rgba(108,217,232,0.08)'; ctx.strokeStyle = '#6cd9e8'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // 阴极 K（左侧弧形金属）与阳极 A（右侧小圆）
  ctx.strokeStyle = '#b0b0cc'; ctx.lineWidth = 6
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke()
  label(ctx, 'K', cx - R * 0.72 - 16, cy, '#b0b0cc', 13)
  ctx.fillStyle = '#d9a05a'; ctx.beginPath(); ctx.arc(cx + R * 0.55, cy, 7, 0, Math.PI * 2); ctx.fill()
  label(ctx, 'A', cx + R * 0.55 + 16, cy, '#d9a05a', 13)
  // 光束
  ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.globalAlpha = 0.75
  ctx.beginPath(); ctx.moveTo(20, cy - 30); ctx.lineTo(cx - R * 0.72 + 6, cy - 6); ctx.stroke()
  ctx.globalAlpha = 1
  label(ctx, `ν = ${nu.toFixed(1)}×10¹⁴ Hz（λ ≈ ${(3e8 / (nu * 1e14) * 1e9).toFixed(0)} nm）`, 120, cy - 52, color, 12)
  // 光电子：从 K 飞向 A，反向电压使其减速；U=Uc 时恰好到不了 A（先快后慢，停在 A 前）
  const emit = Uc > 0
  if (emit) {
    ctx.fillStyle = '#F5C542'
    const xK = cx - R * 0.66, xA = cx + R * 0.55
    for (let k = 0; k < 8; k++) {
      const p = ((t * 0.6 + k / 8) % 1)
      const s = 0.92 * (1 - (1 - p) ** 2)
      const sx = xK + (xA - xK) * s
      const sy = cy + Math.sin(k * 1.3) * R * 0.35 * (1 - s)
      if (p < 0.97) { ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill() }
    }
  }
  // 电路：K—A 之间接反向电压（滑动变阻器）与微安表
  const by = cy + R + 40
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - R * 0.72, cy + 10); ctx.lineTo(cx - R * 0.72, by); ctx.lineTo(cx + R * 0.55, by); ctx.lineTo(cx + R * 0.55, cy + 10); ctx.stroke()
  // 电压表读数框（遏止电压）
  ctx.fillStyle = '#14142a'; ctx.fillRect(cx - 70, by - 16, 140, 32); ctx.strokeStyle = '#3d3d5e'; ctx.strokeRect(cx - 70, by - 16, 140, 32)
  label(ctx, `反向电压 U = ${shown.toFixed(3)} V`, cx, by, '#F5C542', 12)
  // 微安表（Uc 时读零）
  const mx = cx + R + 60, my = cy
  ctx.fillStyle = '#14142a'; ctx.strokeStyle = '#8a8aa0'; ctx.beginPath(); ctx.arc(mx, my, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  const frac = Math.max(0, 1 - Math.min(1, shown / Math.max(Uc, 1e-6)))
  const ang = -Math.PI * 0.75 + frac * Math.PI * 0.5
  ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(ang) * 22, my + Math.sin(ang) * 22); ctx.stroke()
  label(ctx, 'μA', mx, my + 38, '#8a8aa0', 10)
  label(ctx, Uc > 0.005 ? `增大反向电压直至电流恰为零 → 遏止电压 Uc = ${Uc.toFixed(3)} V　eUc = hν − W₀` : '频率低于截止频率，无光电子逸出（Uc = 0）',
    w / 2, h - 12, Uc > 0.005 ? '#7fe3b3' : '#E05555', 12)
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  props.mode === 'hooke' ? drawHooke(ctx, w, h) : drawPhoto(ctx, w, h)
}

onMounted(() => {
  loop = makeLoop((dt) => {
    t += dt
    shown += (props.reading - shown) * Math.min(1, dt * 5)
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
