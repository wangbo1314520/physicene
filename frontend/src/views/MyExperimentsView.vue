<script setup lang="ts">
/**
 * B6 学生端：我的实验列表 + 详情 + 版本历史 + 导出
 */
import { onMounted, ref } from 'vue'
import { http } from '../api/http'

interface Session {
  id: number
  experimentId: string
  status: 'draft' | 'submitted'
  conclusion: string | null
  stepState: Record<string, unknown> | null
  rawData: Record<string, unknown> | null
  processedData: Record<string, unknown> | null
  version: number
  updatedAt: string
  reportId?: number
}

const sessions = ref<Session[]>([])
const selected = ref<Session | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const data = await http.get('/experiments/sessions', {
      params: { page: 1, size: 50 },
    }) as any
    sessions.value = data.items ?? []
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  if (!sessions.value.length) return
  const head = 'id,experimentId,status,version,updatedAt,conclusion'
  const rows = sessions.value.map((s) =>
    `${s.id},${s.experimentId},${s.status},${s.version},${s.updatedAt},"${(s.conclusion ?? '').replace(/"/g, '""')}"`,
  )
  const blob = new Blob([head + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'my-experiments.csv'
  a.click()
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(sessions.value, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'my-experiments.json'
  a.click()
}

function stepProgress(s: Session): string {
  const completed = ((s.stepState as any)?.completed as string[]) ?? []
  return `${completed.length}/4`
}

onMounted(load)
</script>

<template>
  <main class="mine">
    <div class="head">
      <h1>我的实验</h1>
      <div class="ops">
        <button @click="exportCSV">📊 导出 CSV</button>
        <button @click="exportJSON">📋 导出 JSON</button>
      </div>
    </div>

    <p v-if="loading">加载中…</p>

    <section v-if="sessions.length" class="list">
      <div v-for="s in sessions" :key="s.id" class="card" @click="selected = s">
        <div class="row1">
          <span class="exp-id">{{ s.experimentId }}</span>
          <span :class="s.status">{{ s.status === 'submitted' ? '✅ 已提交' : '📝 进行中' }}</span>
        </div>
        <p class="concl">{{ (s.conclusion ?? '尚未填写结论').slice(0, 60) }}</p>
        <div class="row2">
          <span>步骤 {{ stepProgress(s) }}</span>
          <span>v{{ s.version }}</span>
          <span>{{ s.updatedAt.slice(0, 16) }}</span>
          <span v-if="s.reportId">报告 #{{ s.reportId }}</span>
        </div>
      </div>
    </section>
    <p v-else class="empty">还没有实验记录</p>

    <!-- 详情弹窗 -->
    <div v-if="selected" class="modal" @click.self="selected = null">
      <div class="modal-card">
        <h3>{{ selected.experimentId }}</h3>
        <div class="detail">
          <p><b>状态：</b>{{ selected.status }}</p>
          <p><b>版本：</b>v{{ selected.version }}</p>
          <p><b>结论：</b></p>
          <p class="full">{{ selected.conclusion ?? '（无）' }}</p>
          <p v-if="selected.stepState"><b>步骤：</b></p>
          <pre v-if="selected.stepState" class="json">{{ JSON.stringify(selected.stepState, null, 2).slice(0, 400) }}</pre>
          <p v-if="selected.rawData"><b>原始数据：</b></p>
          <pre v-if="selected.rawData" class="json">{{ JSON.stringify(selected.rawData, null, 2).slice(0, 400) }}</pre>
        </div>
        <button class="close" @click="selected = null">关闭</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.mine { max-width: 900px; margin: 0 auto; padding: 20px 24px; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
h1 { font-size: 20px; }
.ops { display: flex; gap: 8px; }
.ops button { background: #23402e; color: #7fe3b3; border: 1px solid #3ecf8e;
  border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
.list { display: flex; flex-direction: column; gap: 10px; }
.card { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px;
  padding: 14px 16px; cursor: pointer; transition: border-color 0.2s; }
.card:hover { border-color: #4a90d9; }
.row1 { display: flex; justify-content: space-between; margin-bottom: 6px; }
.exp-id { font: bold 14px Consolas; color: #4a90d9; }
.submitted { color: #3ecf8e; font-size: 12px; }
.draft { color: #F5C542; font-size: 12px; }
.concl { font-size: 13px; color: #8a8aa0; margin-bottom: 8px; }
.row2 { display: flex; gap: 16px; font: 11px Consolas; color: #565675; }
.empty { text-align: center; color: #565675; padding: 40px; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex;
  align-items: center; justify-content: center; z-index: 100; }
.modal-card { background: #1d1d33; border: 1px solid #3d3d5e; border-radius: 12px;
  padding: 24px; width: 560px; max-height: 80vh; overflow-y: auto; }
.modal-card h3 { font-size: 16px; color: #4a90d9; margin-bottom: 12px; }
.detail p { font-size: 13px; color: #8a8aa0; margin-bottom: 6px; }
.detail b { color: #e8e8f0; }
.full { background: #14142a; border-radius: 6px; padding: 10px;
  font-size: 13px; color: #b0b0cc; line-height: 1.6; }
.json { background: #14142a; border-radius: 6px; padding: 10px;
  font: 11px Consolas; color: #6c6c85; overflow-x: auto; white-space: pre-wrap; }
.close { width: 100%; margin-top: 12px; background: #23233a; color: #8a8aa0;
  border: 1px solid #2f2f4a; border-radius: 8px; padding: 10px; cursor: pointer; }
</style>
