<script setup lang="ts">
/**
 * Step2·2.2：回放时间轴面板——从 LabView 提取为共享组件。
 * REST 帧拉取 + 播放/暂停 + scrub。
 */
import { onUnmounted, reactive, ref, watch } from 'vue'
import { useSimulationSocket } from '../../composables/useSimulationSocket'
import { http } from '../../api/http'

const { state } = useSimulationSocket()
const toast = ref('')

const replay = reactive({
  available: false,
  playing: false,
  t: 0,
  frames: [] as { t: number; snapshotType: string; snapshot: any }[],
  timer: 0,
})

async function loadReplay() {
  if (!state.recordId) { toast.value = '尚无回放记录（先运行）'; return }
  try {
    const first = (await http.get(`/records/${state.recordId}`, { params: { page: 0, size: 500 } })) as any
    let frames = [...(first.frames ?? [])]
    const totalPages = Math.ceil((first.total ?? frames.length) / 500)
    for (let p = 1; p < totalPages; p++) {
      const nxt = (await http.get(`/records/${state.recordId}`, { params: { page: p, size: 500 } })) as any
      frames = frames.concat(nxt.frames ?? [])
    }
    if (frames.length) {
      replay.frames = frames
      replay.available = true
      toast.value = `已加载 ${frames.length} 帧`
    }
  } catch { toast.value = '回放加载失败' }
}

function toggleReplay() {
  replay.playing = !replay.playing
  if (replay.playing) {
    replay.timer = window.setInterval(() => {
      const cur = replay.frames.findIndex((f) => f.t >= replay.t)
      const nxt = replay.frames[cur + 1]
      if (!nxt) { toggleReplay(); return }
      replay.t = nxt.t
      applyFrame(nxt)
    }, 1000 / 30)
  } else {
    window.clearInterval(replay.timer)
  }
}

function applyFrame(frame: { snapshot: any }) {
  const snap = frame.snapshot
  if (snap?.elements) state.subjects = snap.elements
}

function onScrub(ev: Event) {
  replay.t = +(ev.target as HTMLInputElement).value
  const frame = replay.frames.find((f) => f.t >= replay.t)
  if (frame) applyFrame(frame)
}

watch(() => state.simId, () => { replay.available = false; replay.frames = []; replay.t = 0 })
onUnmounted(() => window.clearInterval(replay.timer))
</script>

<template>
  <div class="replay-panel">
    <h4>🎬 回放时间轴</h4>
    <div v-if="replay.available" class="controls">
      <button @click="toggleReplay">{{ replay.playing ? '⏸ 暂停' : '▶ 播放' }}</button>
      <span class="time">t={{ replay.t.toFixed(2) }}s / {{ (replay.frames.at(-1)?.t ?? 0).toFixed(2) }}s</span>
      <input type="range" :min="0" :max="replay.frames.at(-1)?.t ?? 1" :step="0.01"
             :value="replay.t" @input="onScrub" class="scrub">
    </div>
    <p v-else class="hint">运行结束后点击加载回放</p>
    <button @click="loadReplay" :disabled="!state.recordId">⇩ 加载回放帧</button>
    <p v-if="toast" class="toast">{{ toast }}</p>
  </div>
</template>

<style scoped>
.replay-panel { flex: 1; min-width: 300px; padding: 8px; }
.replay-panel h4 { font-size: 13px; color: #b0b0cc; margin-bottom: 8px; }
.controls { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.controls button { background: #2b5c8f; color: #fff; border: none; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.controls .time { color: #3ecf8e; font-size: 12px; white-space: nowrap; }
.scrub { flex: 1; }
.hint { color: #565675; font-size: 12px; }
.replay-panel > button { background: #23233a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 5px 12px; cursor: pointer; margin-top: 6px; }
.toast { color: #3ecf8e; font-size: 11px; margin-top: 4px; }
</style>
