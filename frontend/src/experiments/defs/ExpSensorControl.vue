<script setup lang="ts">
/**
 * 利用传感器制作简单的自动控制装置（选必二 · 光控路灯）
 * 光敏电阻 R_G 随光照增强而减小；与定值电阻 R 分压，取 R 两端电压 U_R 送比较器/继电器：
 * 天黑（光弱）→ R_G 大 → U_R 低于阈值 → 继电器闭合 → 路灯亮；天亮反之。含回差避免频繁抖动。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { battery, fitCanvas, label, lamp, makeLoop, resistor, wire } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const E = 6, R = 10 // kΩ
const light = ref(0.8)      // 光照 0~1
const auto = ref(false)
let autoT = 0
const RG = computed(() => 100 / (1 + 40 * light.value))   // kΩ：暗 100k → 亮 ≈2.4k
const UR = computed(() => E * R / (R + RG.value))
const TH_ON = 2.2, TH_OFF = 2.8
const relayOn = ref(false)
const records = ref<{ light: number; RG: number }[]>([])

function record() {
  records.value.push({ light: +light.value.toFixed(2), RG: +RG.value.toFixed(2) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.light, y: r.RG })))
  emit('record', { rows: records.value, UR: +UR.value.toFixed(2), lampOn: relayOn.value })
}

function step(dt: number) {
  if (auto.value) { autoT += dt; light.value = +(0.5 + 0.5 * Math.cos(autoT * 0.5)).toFixed(3) }
  // 回差比较器
  if (!relayOn.value && UR.value < TH_ON) relayOn.value = true
  else if (relayOn.value && UR.value > TH_OFF) relayOn.value = false
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  // 天空（随光照）
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  const l = light.value
  sky.addColorStop(0, `rgb(${Math.round(20 + 90 * l)},${Math.round(26 + 130 * l)},${Math.round(60 + 170 * l)})`)
  sky.addColorStop(1, '#14142a')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h)
  // 太阳/月亮
  const sunY = h * 0.62 - l * h * 0.5
  ctx.fillStyle = l > 0.35 ? '#F5C542' : '#d9dce8'
  ctx.beginPath(); ctx.arc(w * 0.82, sunY, 18, 0, Math.PI * 2); ctx.fill()
  // 地面
  ctx.fillStyle = '#1d1d33'; ctx.fillRect(0, h * 0.72, w, h * 0.28)
  // 路灯杆 + 灯
  const px = w * 0.72
  ctx.fillStyle = '#8a8aa0'; ctx.fillRect(px - 4, h * 0.3, 8, h * 0.42)
  ctx.fillRect(px - 4, h * 0.3, 60, 6)
  const glowA = relayOn.value ? 0.85 : 0
  const g = ctx.createRadialGradient(px + 56, h * 0.33, 4, px + 56, h * 0.33, 90)
  g.addColorStop(0, `rgba(245,197,66,${glowA})`); g.addColorStop(1, 'rgba(245,197,66,0)')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px + 56, h * 0.33, 90, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = relayOn.value ? '#F5C542' : '#3d3d5e'; ctx.beginPath(); ctx.arc(px + 56, h * 0.33, 9, 0, Math.PI * 2); ctx.fill()
  label(ctx, relayOn.value ? '路灯：亮' : '路灯：灭', px + 56, h * 0.33 + 26, relayOn.value ? '#F5C542' : '#8a8aa0', 12)
  // 控制电路（左侧面板）
  const bx = 24, by = 24, bw = w * 0.5, bh = h * 0.62
  ctx.fillStyle = 'rgba(20,20,42,0.82)'; ctx.fillRect(bx, by, bw, bh)
  ctx.strokeStyle = '#2f2f4a'; ctx.strokeRect(bx, by, bw, bh)
  const left = bx + 40, right = bx + bw - 40, top = by + 34, bot = by + bh - 30, midY = (top + bot) / 2
  wire(ctx, left, top, right, top); wire(ctx, left, bot, right, bot)
  wire(ctx, left, top, left, midY - 26); wire(ctx, left, midY + 26, left, bot)
  battery(ctx, left, midY)
  label(ctx, `E=${E}V`, left, bot + 14, '#8a8aa0', 10)
  // 光敏电阻（上）与定值电阻（下）串联在右侧竖直支路
  wire(ctx, right, top, right, midY - 60)
  resistor(ctx, right, midY - 38, false, '')
  label(ctx, `R_G=${RG.value.toFixed(1)}kΩ`, right - 58, midY - 38, '#6cd9e8', 11)
  // 光照箭头射向 R_G
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = `rgba(245,197,66,${0.15 + 0.8 * l})`; ctx.lineWidth = 1.5
    const ax = right + 28 + k * 8, ay = midY - 70 + k * 6
    ctx.beginPath(); ctx.moveTo(ax + 16, ay - 16); ctx.lineTo(ax, ay); ctx.stroke()
  }
  wire(ctx, right, midY - 16, right, midY + 8)
  resistor(ctx, right, midY + 30, false, '')
  label(ctx, `R=${R}kΩ`, right - 46, midY + 30, '#b0b0cc', 11)
  wire(ctx, right, midY + 52, right, bot)
  // U_R 引出到比较器/继电器
  const cx = bx + bw * 0.5, cy = midY + 30
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(right - 9, cy); ctx.lineTo(cx + 24, cy); ctx.stroke()
  ctx.fillStyle = relayOn.value ? '#23402e' : '#23233a'; ctx.fillRect(cx - 24, cy - 16, 48, 32)
  ctx.strokeStyle = relayOn.value ? '#3ecf8e' : '#3d3d5e'; ctx.strokeRect(cx - 24, cy - 16, 48, 32)
  label(ctx, '继电器', cx, cy, relayOn.value ? '#7fe3b3' : '#8a8aa0', 10)
  label(ctx, `U_R=${UR.value.toFixed(2)}V`, cx, cy - 26, '#F5C542', 11)
  lamp(ctx, cx, cy + 46, relayOn.value ? 1 : 0)
  label(ctx, `U_R < ${TH_ON}V 亮 / > ${TH_OFF}V 灭`, cx, cy + 72, '#6c6c85', 10)
  label(ctx, `光照 ${(l * 100).toFixed(0)}%　R_G = ${RG.value.toFixed(1)} kΩ　U_R = E·R/(R+R_G) = ${UR.value.toFixed(2)} V`, w / 2, h - 12, '#7fe3b3', 12)
}

onMounted(() => { loop = makeLoop((dt) => { step(dt); draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="利用传感器制作简单的自动控制装置（光控路灯）"
    desc="光敏电阻的阻值随光照增强而减小。它与定值电阻分压，定值电阻两端电压 U_R 作为控制信号：天黑时 U_R 低于阈值，继电器接通路灯；天亮后自动熄灭。"
    formula="U_R = E·R/(R+R_G)　R_G ↓（光强↑）→ U_R ↑"
    :axes="{ x: '光照', y: 'R_G', xUnit: '', yUnit: 'kΩ' }">
    <template #controls>
      <label>光照强度 = {{ (light * 100).toFixed(0) }}%<input type="range" min="0" max="1" step="0.01" v-model.number="light" :disabled="auto"></label>
      <button class="btn" @click="auto = !auto">{{ auto ? '⏸ 停止昼夜循环' : '🌗 昼夜循环演示' }}</button>
      <div class="readout">R_G = {{ RG.toFixed(1) }} kΩ
U_R = {{ UR.toFixed(2) }} V
继电器：{{ relayOn ? '闭合 → 路灯亮' : '断开 → 路灯灭' }}</div>
      <button class="btn alt" @click="record">📏 记录 (光照, R_G)（{{ records.length }}）</button>
      <p class="hint">阈值设有回差（2.2 V 开 / 2.8 V 关），避免黄昏时灯忽亮忽灭。记录多组可得光敏电阻的 R-光照特性曲线。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
