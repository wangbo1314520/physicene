<script setup lang="ts">
/**
 * B8 补做：10 个锁定实验的共享面板（第一阶段 4 + 第二阶段 6）
 * 用 B1 引擎（GraphPaper 坐标纸 + 图层）实现全部 10 个纯 2D 实验。
 */
import { computed, ref } from 'vue'
import GraphPaper from '../framework/GraphPaper.vue'

const props = defineProps<{ mode: string }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()

const gp = ref<InstanceType<typeof GraphPaper> | null>(null)
const records = ref<Record<string, number | string>[]>([])
const param1 = ref(1)
const param2 = ref(1)

// ── 配置：每个实验的参数/读数/公式 ──
const CFG: Record<string, {
  name: string; desc: string
  p1Label: string; p1Min: number; p1Max: number; p1Step: number
  p2Label?: string; p2Min?: number; p2Max?: number; p2Step?: number
  readLabel: string
  axes: { x: string; y: string; xUnit: string; yUnit: string }
  formula: string
}> = {
  'tape-velocity': {
    name: '测量纸带的平均速度和瞬时速度',
    desc: '从纸带计数点读位置 → 计算各段平均速度 → 中间时刻瞬时速度',
    p1Label: '计数点序号', p1Min: 0, p1Max: 10, p1Step: 1,
    readLabel: '位置 x (cm)', axes: { x: '计数点', y: 'x', xUnit: 'n', yUnit: 'cm' },
    formula: 'v̄ = Δx/Δt, v_n = (x_{n+1}-x_{n-1})/(2T)',
  },
  'capacitor-charge': {
    name: '观察电容器的充、放电现象',
    desc: 'RC 电路充电：V(t) = E(1-e^{-t/τ})，τ=RC',
    p1Label: '电阻 R (kΩ)', p1Min: 1, p1Max: 10, p1Step: 1,
    p2Label: '电容 C (μF)', p2Min: 10, p2Max: 100, p2Step: 10,
    readLabel: '电压 U (V)', axes: { x: 't', y: 'U', xUnit: 's', yUnit: 'V' },
    formula: 'U = E(1-e^{-t/RC})',
  },
  'resistivity': {
    name: '导体电阻率的测量',
    desc: '伏安法测 R → 结合 L/S 计算电阻率 ρ',
    p1Label: '长度 L (m)', p1Min: 0.5, p1Max: 2, p1Step: 0.1,
    readLabel: '电阻 R (Ω)', axes: { x: 'L', y: 'R', xUnit: 'm', yUnit: 'Ω' },
    formula: 'ρ = RS/L',
  },
  'refraction': {
    name: '测量玻璃的折射率',
    desc: '插针法测入射角/折射角 → n = sinθ₁/sinθ₂',
    p1Label: '入射角 θ₁ (°)', p1Min: 15, p1Max: 75, p1Step: 5,
    readLabel: '折射角 θ₂ (°)', axes: { x: 'sinθ₁', y: 'sinθ₂', xUnit: '', yUnit: '' },
    formula: 'n = sinθ₁/sinθ₂',
  },
  'static-friction': {
    name: '静摩擦力的大小随拉力的变化',
    desc: '逐渐增大拉力 → 静摩擦力同步增大 → 达到最大静摩擦后突降为滑动摩擦',
    p1Label: '拉力 F (N)', p1Min: 0.5, p1Max: 10, p1Step: 0.5,
    readLabel: '摩擦力 f (N)', axes: { x: 'F', y: 'f', xUnit: 'N', yUnit: 'N' },
    formula: 'f静 = F（未滑动），f_max = μs·N，f滑 = μk·N',
  },
  'coulomb-balance': {
    name: '库仑扭秤实验（定量探究）',
    desc: '改变电荷量/距离 → 记录库仑力 → 验证 F∝q₁q₂/r²',
    p1Label: '距离 r (cm)', p1Min: 5, p1Max: 30, p1Step: 1,
    readLabel: '库仑力 F (×10⁻⁶ N)', axes: { x: '1/r²', y: 'F', xUnit: '1/cm²', yUnit: 'μN' },
    formula: 'F = kq₁q₂/r²',
  },
  'wave-interference': {
    name: '观察波的干涉、衍射现象',
    desc: '双波源干涉：加强/减弱点交替分布；单缝衍射：中央亮纹最宽',
    p1Label: '波长 λ (cm)', p1Min: 1, p1Max: 5, p1Step: 0.5,
    p2Label: '缝间距 d (cm)', p2Min: 2, p2Max: 10, p2Step: 1,
    readLabel: '条纹间距 Δy (cm)', axes: { x: 'λ/d', y: 'Δy', xUnit: '', yUnit: 'cm' },
    formula: 'Δy = λL/d',
  },
  'light-phenomena': {
    name: '观察光的干涉、衍射、偏振现象',
    desc: '双缝干涉条纹间距与波长成正比；偏振片旋转90°透射光消失',
    p1Label: '波长 λ (nm)', p1Min: 400, p1Max: 700, p1Step: 50,
    readLabel: '条纹间距 Δy (mm)', axes: { x: 'λ', y: 'Δy', xUnit: 'nm', yUnit: 'mm' },
    formula: 'Δy = λL/d',
  },
  'self-induction': {
    name: '探究自感现象',
    desc: '通电时线圈阻碍电流增大 → 指针缓慢偏转；断电时自感电动势维持电流',
    p1Label: '线圈匝数 N', p1Min: 100, p1Max: 1000, p1Step: 100,
    readLabel: '电流延迟 τ (ms)', axes: { x: 'N', y: 'τ', xUnit: '匝', yUnit: 'ms' },
    formula: 'τ = L/R, L ∝ N²',
  },
  'lc-ac': {
    name: '探究电感器和电容器对交流电的影响',
    desc: '感抗 XL=2πfL 随频率增大；容抗 XC=1/(2πfC) 随频率减小',
    p1Label: '频率 f (Hz)', p1Min: 50, p1Max: 1000, p1Step: 50,
    readLabel: '阻抗 Z (Ω)', axes: { x: 'f', y: 'Z', xUnit: 'Hz', yUnit: 'Ω' },
    formula: 'XL=2πfL, XC=1/(2πfC)',
  },
}

const cfg = computed(() => CFG[props.mode] ?? CFG['static-friction'])

// ── 模拟读数（含噪声） ──
function read(): Record<string, number | string> {
  const noise = () => 1 + (Math.random() - 0.5) * 0.03
  const p1 = param1.value
  const p2 = param2.value
  switch (props.mode) {
    case 'tape-velocity': {
      const a = 2, v0 = 0.5
      const x = (v0 * p1 * 0.1 + 0.5 * a * (p1 * 0.1) ** 2) * 100
      return { n: p1, x: +(x * noise()).toFixed(2) }
    }
    case 'capacitor-charge': {
      const R = p1 * 1000, C = p2 * 1e-6, E = 10
      const t = R * C // 一个时间常数
      const U = E * (1 - Math.exp(-1)) // t=τ 时的电压
      return { R: p1, C: p2, t: +(t).toFixed(2), U: +(U * noise()).toFixed(3) }
    }
    case 'resistivity': {
      const rho = 1.7e-8, S = 1e-6
      const R = rho * p1 / S
      return { L: p1, R: +(R * noise()).toFixed(4) }
    }
    case 'refraction': {
      const n = 1.5
      const theta2 = Math.asin(Math.sin(p1 * Math.PI / 180) / n) * 180 / Math.PI
      return { theta1: p1, theta2: +(theta2 * noise()).toFixed(2) }
    }
    case 'static-friction': {
      const muS = 0.6, muK = 0.4, N = 10
      const fMax = muS * N
      const f = p1 <= fMax ? p1 : muK * N
      return { F: p1, f: +(f * noise()).toFixed(3) }
    }
    case 'coulomb-balance': {
      const k = 8.99e9, q1 = 1e-8, q2 = 1e-8
      const r = p1 / 100
      const F = k * q1 * q2 / (r * r) * 1e6 // μN
      return { r: p1, F: +(F * noise()).toFixed(3) }
    }
    case 'wave-interference': {
      const L = 100 // cm
      const dy = p1 * L / p2
      return { lambda: p1, d: p2, dy: +(dy * noise()).toFixed(2) }
    }
    case 'light-phenomena': {
      const d = 0.2, L = 1000 // mm
      const dy = (p1 * 1e-9 * L / (d * 1e-3)) * 1000 // mm
      return { lambda: p1, dy: +(dy * noise()).toFixed(3) }
    }
    case 'self-induction': {
      const R = 10
      const L = (p1 / 100) ** 2 * 0.1
      const tau = L / R * 1000 // ms
      return { N: p1, tau: +(tau * noise()).toFixed(2) }
    }
    case 'lc-ac': {
      const L = 0.1, C = 10e-6
      const f = p1
      const XL = 2 * Math.PI * f * L
      const XC = 1 / (2 * Math.PI * f * C)
      return { f: p1, XL: +XL.toFixed(2), XC: +XC.toFixed(2), Z: +(Math.abs(XL - XC) * noise()).toFixed(2) }
    }
    default:
      return {}
  }
}

const preview = computed(() => read())

function record() {
  const row = read()
  records.value.push(row)
  // 坐标纸联动
  if (gp.value) {
    const pts = records.value.map((r) => ({
      x: typeof r[cfg.value.axes.x] === 'number' ? r[cfg.value.axes.x] as number : records.value.indexOf(r),
      y: typeof r[cfg.value.axes.y] === 'number' ? r[cfg.value.axes.y] as number : 0,
    }))
    gp.value.loadPoints(pts)
  }
  emit('record', { rows: records.value, mode: props.mode })
}
</script>

<template>
  <div class="exp">
    <div class="panel">
      <h3>{{ cfg.name }}</h3>
      <p class="desc">{{ cfg.desc }}</p>
      <p class="formula">📐 {{ cfg.formula }}</p>
      <label v-if="cfg.p1Label">{{ cfg.p1Label }} = {{ param1 }}
        <input type="range" :min="cfg.p1Min" :max="cfg.p1Max" :step="cfg.p1Step" v-model.number="param1">
      </label>
      <label v-if="cfg.p2Label">{{ cfg.p2Label }} = {{ param2 }}
        <input type="range" :min="cfg.p2Min" :max="cfg.p2Max" :step="cfg.p2Step" v-model.number="param2">
      </label>
      <div class="readout">
        <span class="lbl">{{ cfg.readLabel }}</span>
        <span class="val">{{ JSON.stringify(preview).slice(1, -1) }}</span>
      </div>
      <button class="rec" @click="record">📏 记录读数（{{ records.length }} 组）</button>
    </div>
    <GraphPaper ref="gp" :series-name="cfg.name" series-color="#4A90D9"
      :initial-state="{ mode: 'auto', locked: false,
        axes: { xLabel: cfg.axes.x, yLabel: cfg.axes.y, xUnit: cfg.axes.xUnit, yUnit: cfg.axes.yUnit },
        series: [{ id: 's1', name: cfg.name, color: '#4A90D9', points: [] }],
        fits: [], showFitLine: true, showResiduals: false, showErrorBars: false, showFormula: true }" />
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 320px 1fr; gap: 10px; min-height: 440px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 8px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 8px; line-height: 1.6; }
.formula { font: 13px Consolas; color: #4a90d9; margin-bottom: 12px; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 10px; }
label input { width: 100%; }
.readout { background: #14142a; border-radius: 6px; padding: 10px; margin-bottom: 10px;
  display: flex; flex-wrap: wrap; gap: 8px; }
.readout .lbl { font-size: 11px; color: #6c6c85; width: 100%; }
.readout .val { font: 14px Consolas; color: #3ecf8e; }
.rec { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; }
</style>
