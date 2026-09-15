<script setup lang="ts">
/**
 * B6 教师统计+批阅界面：班级统计、逐份批阅、数据看板
 */
import { computed, onMounted, ref } from 'vue'
import { http } from '../api/http'

const stats = ref<Record<string, unknown> | null>(null)
const sessions = ref<Record<string, unknown>[]>([])
const selected = ref<Record<string, unknown> | null>(null)
const score = ref('')
const comment = ref('')
const loading = ref(false)

const experimentId = ref('bx3-coulomb-repulsion')

async function loadStats() {
  loading.value = true
  try {
    stats.value = await http.get('/experiments/sessions/class', {
      params: { experimentId: experimentId.value },
    }) as any
    sessions.value = ((stats.value as any)?.recent ?? []) as Record<string, unknown>[]
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function openSession(s: Record<string, unknown>) {
  selected.value = s
  score.value = ''
  comment.value = ''
}

async function submitReview() {
  if (!selected.value) return
  try {
    // 批阅写入 Report content（通过更新 report）
    const reportId = (selected.value as any).reportId
    if (reportId) {
      await http.put(`/reports/${reportId}`, {
        content: JSON.stringify({
          ...((selected.value as any).processedData ?? {}),
          teacherScore: score.value,
          teacherComment: comment.value,
        }),
      })
    }
    selected.value = null
    await loadStats()
  } catch (e) {
    console.error(e)
  }
}

const submittedCount = computed(() => (stats.value as any)?.submittedCount ?? 0)
const draftCount = computed(() => (stats.value as any)?.draftCount ?? 0)

onMounted(loadStats)
</script>

<template>
  <main class="teacher">
    <h1>教师端 · 实验批阅</h1>

    <section class="controls">
      <select v-model="experimentId" @change="loadStats">
        <option value="bx3-coulomb-repulsion">库仑斥力</option>
        <option value="bx3-emf-internal">测电源</option>
        <option value="bx1-timer-practice">打点计时器</option>
        <option value="xb2-lorentz-demo">洛伦兹力 3D</option>
      </select>
      <button @click="loadStats" :disabled="loading">刷新</button>
    </section>

    <section class="stats-bar" v-if="stats">
      <div class="stat"><span class="num">{{ submittedCount }}</span><span class="lbl">已提交</span></div>
      <div class="stat"><span class="num">{{ draftCount }}</span><span class="lbl">进行中</span></div>
      <div class="stat"><span class="num">{{ sessions.length }}</span><span class="lbl">最近记录</span></div>
    </section>

    <section class="table" v-if="sessions.length">
      <table>
        <thead>
          <tr><th>#</th><th>学生</th><th>状态</th><th>结论摘要</th><th>时间</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="s in sessions" :key="(s as any).id">
            <td>{{ (s as any).id }}</td>
            <td>{{ (s as any).studentId }}</td>
            <td><span :class="(s as any).status">{{ (s as any).status }}</span></td>
            <td class="concl">{{ ((s as any).conclusion ?? '').slice(0, 30) }}…</td>
            <td>{{ ((s as any).updatedAt ?? '').slice(0, 16) }}</td>
            <td><button @click="openSession(s)">批阅</button></td>
          </tr>
        </tbody>
      </table>
    </section>
    <p v-else class="empty">暂无提交记录</p>

    <!-- 批阅弹窗 -->
    <div v-if="selected" class="modal" @click.self="selected = null">
      <div class="modal-card">
        <h3>批阅实验 #{{ (selected as any).id }}</h3>
        <div class="detail">
          <p><b>实验：</b>{{ (selected as any).experimentId }}</p>
          <p><b>状态：</b>{{ (selected as any).status }}</p>
          <p><b>结论：</b></p>
          <p class="concl-full">{{ (selected as any).conclusion ?? '（无）' }}</p>
          <p v-if="(selected as any).stepState"><b>步骤进度：</b>{{ ((selected as any).stepState as any)?.completed?.length ?? 0 }}/4</p>
          <p v-if="(selected as any).rawData"><b>原始数据：</b>{{ JSON.stringify((selected as any).rawData).slice(0, 120) }}…</p>
        </div>
        <label>评分（0-100）
          <input type="number" v-model="score" min="0" max="100" placeholder="85">
        </label>
        <label>评语
          <textarea v-model="comment" rows="3" placeholder="实验数据分析正确，结论表述清晰。"></textarea>
        </label>
        <div class="btns">
          <button class="cancel" @click="selected = null">取消</button>
          <button class="ok" @click="submitReview">提交批阅</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.teacher { max-width: 1100px; margin: 0 auto; padding: 20px 24px; }
h1 { font-size: 20px; margin-bottom: 14px; }
.controls { display: flex; gap: 10px; margin-bottom: 14px; }
.controls select { background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a;
  border-radius: 6px; padding: 8px 12px; font-size: 13px; }
.controls button { background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
.stats-bar { display: flex; gap: 14px; margin-bottom: 16px; }
.stat { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px;
  padding: 14px 24px; text-align: center; min-width: 100px; }
.stat .num { display: block; font: bold 28px Consolas; color: #4a90d9; }
.stat .lbl { font-size: 12px; color: #6c6c85; }
.table table { width: 100%; border-collapse: collapse; background: #1d1d33;
  border-radius: 10px; overflow: hidden; }
.th, td { padding: 10px 14px; font-size: 13px; color: #b0b0cc; border-bottom: 1px solid #2a2a45; text-align: left; }
th { color: #6c6c85; font-size: 12px; }
.concl { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.submitted { color: #3ecf8e; }
.draft { color: #F5C542; }
.empty { text-align: center; color: #565675; padding: 40px; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex;
  align-items: center; justify-content: center; z-index: 100; }
.modal-card { background: #1d1d33; border: 1px solid #3d3d5e; border-radius: 12px;
  padding: 24px; width: 520px; max-height: 80vh; overflow-y: auto; }
.modal-card h3 { font-size: 16px; color: #b0b0cc; margin-bottom: 14px; }
.detail p { font-size: 13px; color: #8a8aa0; margin-bottom: 8px; }
.detail b { color: #e8e8f0; }
.concl-full { background: #14142a; border-radius: 6px; padding: 10px;
  font-size: 13px; color: #b0b0cc; line-height: 1.6; }
label { display: block; font-size: 12px; color: #8a8aa0; margin: 12px 0 6px; }
input, textarea { width: 100%; background: #23233a; border: 1px solid #2f2f4a;
  border-radius: 6px; color: #e8e8f0; padding: 8px; font-size: 13px; box-sizing: border-box; }
.btns { display: flex; gap: 10px; margin-top: 16px; }
.btns button { flex: 1; border-radius: 8px; padding: 10px; font-size: 14px; cursor: pointer; border: none; }
.cancel { background: #23233a; color: #8a8aa0; }
.ok { background: #23402e; color: #7fe3b3; }
</style>
