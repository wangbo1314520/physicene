<script setup lang="ts">
/**
 * 高考力学综合·场景 1：平板小车 + 滑块（板块模型）——纯 2.5D
 * 三种起始方式：①滑块以 v₀ 冲上静止木板 ②子弹/小球撞入静止在板上的滑块（完全非弹性）③木板获得初速、滑块静止
 * 多过程：相对滑动（摩擦力等大反向，动量守恒）→ 共速一起匀速 / 滑块从板端脱离做平抛落地
 * 临界：共速 v_c=(mv₀+MV₀)/(m+M)，t_c=|v₀−V₀|/[μg(1+m/M)]，相对位移 Δs=M(v₀−V₀)²/[2μg(m+M)]，热量 Q=μmgΔs，板长临界 L_min
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from '../apparatus/LabPanel.vue'
import TransientScope from '../apparatus/TransientScope.vue'
import { fitCanvas, makeLoop, label } from '../apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── 参数 ──
const mode = ref<'slide' | 'bullet' | 'board'>('slide')
const m = ref(1), M = ref(3), mu = ref(0.2), L = ref(4), s0 = ref(0.3)
const v0 = ref(4)          // 滑块初速（slide）/ 子弹速度（bullet）/ 木板初速（board）
const mb = ref(0.2)        // 子弹质量
const G = 9.8

// ── 状态 ──
type Phase = 'idle' | 'slide' | 'together' | 'fly' | 'landed'
const phase = ref<Phase>('idle')
const t = ref(0)
let xM = 0, V = 0, s = 0, v = 0, y = 0, vy = 0, xBlock = 0       // s：滑块相对板左端的位置；脱离后用世界坐标 xBlock,y
let mEff = 1
const dsRel = ref(0), Q = ref(0)
const seg = ref<{ name: string; t0: number; t1: number; color: string }[]>([])
const tArr = ref<number[]>([]), vBlock = ref<number[]>([]), vBoard = ref<number[]>([])
const running = ref(false)
let loop: { stop: () => void } | null = null
const events = ref<string[]>([])

/** 初始条件（按模式） */
function init() {
  t.value = 0; dsRel.value = 0; Q.value = 0; y = 0; vy = 0
  tArr.value = []; vBlock.value = []; vBoard.value = []; events.value = []
  xM = 0; s = s0.value; mEff = m.value
  if (mode.value === 'slide') { v = v0.value; V = 0 }
  else if (mode.value === 'bullet') { mEff = m.value + mb.value; v = (mb.value * v0.value) / mEff; V = 0
    events.value.push(`子弹 ${mb.value} kg 以 ${v0.value} m/s 嵌入滑块：共速 v = m_b v_b/(m_b+m) = ${v.toFixed(3)} m/s（动量守恒，动能损失 ${(0.5 * mb.value * v0.value ** 2 - 0.5 * mEff * v * v).toFixed(2)} J）`) }
  else { v = 0; V = v0.value }
  phase.value = 'slide'
  seg.value = [{ name: '相对滑动（摩擦力做功）', t0: 0, t1: 0, color: '#F5C542' }]
}

/** 理论临界（相对滑动阶段，地面光滑） */
const theory = computed(() => {
  const me = mode.value === 'bullet' ? m.value + mb.value : m.value
  const vb = mode.value === 'slide' ? v0.value : mode.value === 'bullet' ? (mb.value * v0.value) / me : 0
  const VB = mode.value === 'board' ? v0.value : 0
  const vc = (me * vb + M.value * VB) / (me + M.value)
  const rel = vb - VB
  const aRel = mu.value * G * (1 + me / M.value)
  const tc = Math.abs(rel) / aRel
  const ds = (rel * rel) / (2 * aRel)               // 滑块相对板的位移大小
  const q = mu.value * me * G * ds
  const need = rel >= 0 ? s0.value + ds : ds - s0.value  // 向前滑：需要 L ≥ s0+Δs；向后滑：需要 s0 ≥ Δs
  return { vc, tc, ds, q, falls: rel >= 0 ? s0.value + ds > L.value : ds > s0.value, Lmin: rel >= 0 ? s0.value + ds : NaN, dir: rel >= 0 ? '前' : '后', need }
})

function step(dt: number) {
  const h = 1 / 600
  let acc = dt
  while (acc > 0 && phase.value !== 'idle' && phase.value !== 'landed') {
    const d = Math.min(h, acc); acc -= d
    t.value += d
    if (phase.value === 'slide') {
      const rel = v - V
      const dir = Math.sign(rel)
      const f = mu.value * mEff * G
      const aBlock = -dir * f / mEff, aBoard = dir * f / M.value
      const relNext = (v + aBlock * d) - (V + aBoard * d)
      if (Math.sign(relNext) !== dir || Math.abs(relNext) < 1e-6) {
        // 达到共速：精确落到共速点
        const vc = (mEff * v + M.value * V) / (mEff + M.value)
        const dtc = Math.abs(rel) / (f / mEff + f / M.value)
        s += rel * dtc / 2; dsRel.value += Math.abs(rel) * dtc / 2; Q.value += f * Math.abs(rel) * dtc / 2
        xM += V * dtc + 0.5 * aBoard * dtc * dtc
        v = vc; V = vc
        phase.value = 'together'
        seg.value[seg.value.length - 1].t1 = t.value
        seg.value.push({ name: '共速后一起匀速', t0: t.value, t1: t.value, color: '#3ecf8e' })
        events.value.push(`t = ${t.value.toFixed(3)} s 共速 v_c = ${vc.toFixed(3)} m/s；相对位移 Δs = ${dsRel.value.toFixed(3)} m；摩擦生热 Q = ${Q.value.toFixed(3)} J`)
        emit('record', { event: 'common', t: t.value, vc, ds: dsRel.value, Q: Q.value, theory: theory.value })
        continue
      }
      s += (v - V) * d + 0.5 * (aBlock - aBoard) * d * d
      dsRel.value += Math.abs(rel) * d
      Q.value += f * Math.abs(rel) * d
      xM += V * d + 0.5 * aBoard * d * d
      v += aBlock * d; V += aBoard * d
      if (s > L.value || s < 0) {
        phase.value = 'fly'; xBlock = xM + s; y = 0.5
        seg.value[seg.value.length - 1].t1 = t.value
        seg.value.push({ name: '滑块脱离板端做平抛', t0: t.value, t1: t.value, color: '#E05555' })
        events.value.push(`t = ${t.value.toFixed(3)} s 滑块从板${s > L.value ? '右' : '左'}端脱离（板长不足：需 L ≥ ${theory.value.need.toFixed(2)} m）`)
        emit('record', { event: 'falloff', t: t.value, ds: dsRel.value, Q: Q.value, theory: theory.value })
      }
    } else if (phase.value === 'together') {
      xM += V * d; s += 0
    } else if (phase.value === 'fly') {
      xM += V * d
      xBlock += v * d; vy -= G * d; y += vy * d
      if (y <= 0) { y = 0; phase.value = 'landed'; seg.value[seg.value.length - 1].t1 = t.value; events.value.push(`t = ${t.value.toFixed(3)} s 滑块落地`) }
    }
    if (seg.value.length) seg.value[seg.value.length - 1].t1 = t.value
    if (tArr.value.length === 0 || t.value - tArr.value[tArr.value.length - 1] >= 0.02) {
      tArr.value.push(+t.value.toFixed(3)); vBlock.value.push(v); vBoard.value.push(V)
    }
    if (phase.value === 'together' && t.value - seg.value[seg.value.length - 1].t0 > 1.5) { running.value = false; break }
  }
}

function start() { if (phase.value === 'idle' || phase.value === 'landed') init(); running.value = true }
function pause() { running.value = false }
function reset() { running.value = false; phase.value = 'idle'; init(); phase.value = 'idle'; draw() }
function recordNow() {
  emit('record', { mode: mode.value, m: m.value, M: M.value, mu: mu.value, L: L.value, s0: s0.value, v0: v0.value, t: t.value, v, V, dsRel: dsRel.value, Q: Q.value, theory: theory.value })
}

// ── 绘制（2.5D：侧视 + 顶面透视条） ──
function draw() {
  const cv = canvasRef.value; if (!cv) return
  const { ctx, w, h } = fitCanvas(cv)
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#14142a'; ctx.fillRect(0, 0, w, h)
  const PX = Math.min(70, (w - 80) / (L.value + 6))
  const groundY = h * 0.68
  const camX = xM + L.value / 2                      // 镜头跟随板中心
  const X = (wx: number) => w / 2 + (wx - camX) * PX
  // 地面
  ctx.fillStyle = '#23233a'; ctx.fillRect(0, groundY, w, 6)
  for (let i = -20; i < 20; i++) { const gx = X(Math.floor(camX) + i); ctx.fillStyle = '#2f2f4a'; ctx.fillRect(gx, groundY + 8, 1, 6) }
  label(ctx, `地面（光滑）　x/m：${Math.floor(camX - 3)} … ${Math.floor(camX + 3)}`, w / 2, groundY + 24, '#565675', 11)
  // 木板（带轮）
  const bh = 0.25 * PX, dep = 14
  const bx = X(xM), bw = L.value * PX
  ctx.fillStyle = '#5c4a2a'; ctx.fillRect(bx, groundY - bh - 10, bw, bh)
  ctx.fillStyle = '#7a6238'; ctx.beginPath(); ctx.moveTo(bx, groundY - bh - 10); ctx.lineTo(bx + dep, groundY - bh - 10 - dep * 0.6); ctx.lineTo(bx + bw + dep, groundY - bh - 10 - dep * 0.6); ctx.lineTo(bx + bw, groundY - bh - 10); ctx.fill()
  for (const wx of [0.4, L.value - 0.4]) { ctx.fillStyle = '#8a8aa0'; ctx.beginPath(); ctx.arc(X(xM + wx), groundY - 5, 5, 0, Math.PI * 2); ctx.fill() }
  label(ctx, `木板 M=${M.value} kg  L=${L.value} m`, bx + bw / 2, groundY - bh - 10 - dep * 0.6 - 8, '#b0b0cc', 11)
  // 划痕（相对位移）
  if (dsRel.value > 0) { ctx.fillStyle = 'rgba(224,85,85,0.8)'; const a = X(xM + Math.min(s0.value, s)), b = X(xM + Math.max(s0.value, Math.min(L.value, s))); ctx.fillRect(a, groundY - bh - 12, Math.max(2, b - a), 3) }
  // 滑块
  const size = 0.5 * PX
  const blockX = phase.value === 'fly' || phase.value === 'landed' ? X(xBlock) : X(xM + s)
  const blockY = groundY - bh - 10 - size - y * PX
  ctx.fillStyle = '#4A90D9'; ctx.fillRect(blockX - size / 2, blockY, size, size)
  ctx.fillStyle = '#6ea8ea'; ctx.beginPath(); ctx.moveTo(blockX - size / 2, blockY); ctx.lineTo(blockX - size / 2 + dep, blockY - dep * 0.6); ctx.lineTo(blockX + size / 2 + dep, blockY - dep * 0.6); ctx.lineTo(blockX + size / 2, blockY); ctx.fill()
  label(ctx, `m=${mEff.toFixed(2)} kg`, blockX, blockY - dep * 0.6 - 10, '#9cc5ff', 11)
  // 速度箭头
  const arrow = (x0: number, y0: number, vel: number, color: string, txt: string) => {
    if (Math.abs(vel) < 0.01) return
    const len = Math.max(12, Math.min(90, Math.abs(vel) * 18)) * Math.sign(vel)
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + len, y0); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x0 + len, y0); ctx.lineTo(x0 + len - 7 * Math.sign(vel), y0 - 4); ctx.lineTo(x0 + len - 7 * Math.sign(vel), y0 + 4); ctx.fill()
    label(ctx, txt, x0 + len / 2, y0 - 10, color, 11)
  }
  arrow(blockX, blockY + size / 2 - 14, v, '#F5C542', `v=${v.toFixed(2)}`)
  arrow(bx + bw / 2, groundY - bh / 2 - 10 + 16, V, '#3ecf8e', `V=${V.toFixed(2)}`)
  // 摩擦力箭头（相对滑动时）
  if (phase.value === 'slide') {
    const dir = Math.sign(v - V)
    arrow(blockX, blockY + size + 8, -dir * 2, '#E05555', 'f')
    arrow(blockX, groundY - bh - 10 + 4, dir * 2, '#E05555', "f'")
  }
  // 时间轴
  const tlY = h - 30, tlX0 = 60, tlW = w - 120
  const tEnd = Math.max(1, t.value)
  ctx.fillStyle = '#23233a'; ctx.fillRect(tlX0, tlY, tlW, 10)
  for (const sg of seg.value) { ctx.fillStyle = sg.color; ctx.fillRect(tlX0 + (sg.t0 / tEnd) * tlW, tlY, Math.max(2, ((sg.t1 - sg.t0) / tEnd) * tlW), 10) }
  label(ctx, `多过程时间轴  t = ${t.value.toFixed(2)} s  ${seg.value.map((g) => g.name).join(' → ')}`, w / 2, tlY - 10, '#8a8aa0', 11)
  // 能量条
  const E0 = 0.5 * (mode.value === 'bullet' ? mb.value * v0.value ** 2 : mode.value === 'slide' ? m.value * v0.value ** 2 : M.value * v0.value ** 2) || 1
  const Ek1 = 0.5 * mEff * v * v, Ek2 = 0.5 * M.value * V * V
  const bars = [['滑块动能', Ek1, '#F5C542'], ['木板动能', Ek2, '#3ecf8e'], ['摩擦生热 Q', Q.value, '#E05555']] as const
  bars.forEach(([name, val, color], i) => {
    const bxx = 16, byy = 16 + i * 18
    ctx.fillStyle = '#23233a'; ctx.fillRect(bxx + 80, byy, 120, 10)
    ctx.fillStyle = color; ctx.fillRect(bxx + 80, byy, Math.min(120, (val / E0) * 120), 10)
    ctx.fillStyle = '#8a8aa0'; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`${name} ${val.toFixed(2)} J`, bxx, byy + 5)
  })
  ctx.fillText(`总动量 p = ${(mEff * v + M.value * V).toFixed(3)} kg·m/s（地面光滑 → 守恒）`, 16, 16 + 3 * 18 + 5)
}

onMounted(() => { init(); phase.value = 'idle'; loop = makeLoop((dt) => { if (running.value) step(dt); draw() }) })
onUnmounted(() => loop?.stop())
const series = computed(() => [
  { name: '滑块 v', color: '#F5C542', values: vBlock.value, unit: 'm/s' },
  { name: '木板 V', color: '#3ecf8e', values: vBoard.value, unit: 'm/s' },
])
</script>

<template>
  <LabPanel title="板块模型：平板小车 + 滑块（碰撞 · 相对滑动 · 共速）" :graph="false"
    desc="高考力学综合经典模型。滑块与木板间有摩擦、地面光滑：滑块冲上木板（或子弹撞入滑块、木板获得初速）后两者相对滑动，摩擦力等大反向使系统动量守恒；直到共速一起匀速，或滑块滑出板端做平抛。观察多过程时间轴、能量转化与临界板长。"
    formula="共速 v_c=(mv₀+MV₀)/(m+M)　t_c=|v₀−V₀|/[μg(1+m/M)]　Δs=M(v₀−V₀)²/[2μg(m+M)]　Q=μmgΔs">
    <template #controls>
      <label>起始方式
        <select v-model="mode" :disabled="running"><option value="slide">滑块以 v₀ 冲上静止木板</option><option value="bullet">子弹撞入板上静止滑块</option><option value="board">木板获得初速 V₀</option></select></label>
      <label>滑块 m = {{ m.toFixed(1) }} kg<input type="range" min="0.5" max="5" step="0.5" v-model.number="m" :disabled="running"></label>
      <label>木板 M = {{ M.toFixed(1) }} kg<input type="range" min="1" max="10" step="0.5" v-model.number="M" :disabled="running"></label>
      <label>动摩擦因数 μ = {{ mu.toFixed(2) }}<input type="range" min="0.05" max="0.6" step="0.01" v-model.number="mu" :disabled="running"></label>
      <label>{{ mode === 'slide' ? '滑块初速 v₀' : mode === 'bullet' ? '子弹速度 v_b' : '木板初速 V₀' }} = {{ v0.toFixed(1) }} m/s<input type="range" min="1" max="12" step="0.5" v-model.number="v0" :disabled="running"></label>
      <label v-if="mode === 'bullet'">子弹质量 m_b = {{ mb.toFixed(2) }} kg<input type="range" min="0.05" max="1" step="0.05" v-model.number="mb" :disabled="running"></label>
      <label>板长 L = {{ L.toFixed(1) }} m<input type="range" min="1" max="8" step="0.5" v-model.number="L" :disabled="running"></label>
      <label>滑块初始位置 s₀ = {{ s0.toFixed(1) }} m（距板左端）<input type="range" min="0" max="7" step="0.1" v-model.number="s0" :disabled="running"></label>
      <div class="readout">理论：v_c = {{ theory.vc.toFixed(3) }} m/s　t_c = {{ theory.tc.toFixed(3) }} s
Δs = {{ theory.ds.toFixed(3) }} m（相对板向{{ theory.dir }}）　Q = {{ theory.q.toFixed(3) }} J
{{ theory.falls ? `⚠ 板长不足：需要 ${theory.need.toFixed(2)} m，滑块会滑出` : `✔ 板长足够，共速前不脱离` }}</div>
      <div class="row">
        <button class="btn" @click="running ? pause() : start()">{{ running ? '⏸ 暂停' : '▶ 开始' }}</button>
        <button class="btn ghost" @click="reset">⟲ 重置</button>
      </div>
      <button class="btn alt" :disabled="phase === 'idle'" @click="recordNow">📏 记录当前数据</button>
      <div v-if="events.length" class="readout" style="color:#b0b0cc"><div v-for="(e, i) in events" :key="i">• {{ e }}</div></div>
      <p class="hint">改 μ、M/m 或 v₀ 再做：共速时间、相对位移怎样变？把 L 调小于临界值观察滑块滑出。</p>
    </template>
    <div class="stack">
      <canvas ref="canvasRef" class="scene"></canvas>
      <TransientScope :t="tArr" :series="series" title="v–t 图：滑块与木板速度（共享标尺）" :height="150" shared />
    </div>
  </LabPanel>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; height: 100%; }
.scene { display: block; width: 100%; flex: 1; min-height: 280px; }
</style>
