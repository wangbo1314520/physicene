<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { http } from './api/http'
import { useWebSocket } from './composables/useWebSocket'

// —— 三端链路状态（第一周验收页）——
const javaOk = ref<boolean | null>(null)
const javaTime = ref('')
const aiHealth = ref<{ status: string; components: Record<string, string> } | null>(null)
const aiError = ref('')

const ws = useWebSocket('/ws/ping')

onMounted(async () => {
  // ① Java 直连
  try {
    const ping = (await http.get('/ping')) as { pong: boolean; time: string }
    javaOk.value = ping.pong === true
    javaTime.value = ping.time
  } catch {
    javaOk.value = false
  }
  // ② Java → Python Feign 链路
  try {
    aiHealth.value = (await http.get('/ai/health')) as {
      status: string
      components: Record<string, string>
    }
  } catch (e) {
    aiError.value = String(e)
  }
})
</script>

<template>
  <main class="page">
    <h1>PhysiScene <span class="ver">v0.1.0-skeleton</span></h1>
    <p class="sub">AI Agent 智能物理实验平台 · 第一周三端链路验收页</p>

    <section class="cards">
      <div class="card" :class="javaOk === null ? '' : javaOk ? 'ok' : 'bad'">
        <h2>① Java 主后端</h2>
        <p class="big">{{ javaOk === null ? '⏳ 检测中…' : javaOk ? '✅ 已连接' : '❌ 未连接' }}</p>
        <p class="meta">GET /api/ping</p>
        <p class="meta" v-if="javaTime">{{ javaTime }}</p>
      </div>

      <div class="card" :class="aiHealth ? 'ok' : aiError ? 'bad' : ''">
        <h2>② AI 服务（经 Java Feign）</h2>
        <p class="big">{{ aiHealth ? '✅ 链路通' : aiError ? '❌ 不通' : '⏳ 检测中…' }}</p>
        <p class="meta">GET /api/ai/health → Python /health</p>
        <p v-if="aiHealth" class="chips">
          <span v-for="(state, name) in aiHealth.components" :key="name" class="chip">
            {{ name }}: {{ state }}
          </span>
        </p>
      </div>

      <div class="card" :class="ws.status.value === 'open' ? 'ok' : 'bad'">
        <h2>③ WebSocket 心跳</h2>
        <p class="big">
          {{ ws.status.value === 'open' ? '✅ ' + ws.pingCount.value + ' 次心跳' : '❌ ' + ws.status.value }}
        </p>
        <p class="meta">/ws/ping · 每秒 1 帧</p>
        <p class="meta" v-if="ws.lastEcho.value">回显: {{ ws.lastEcho.value }}</p>
      </div>
    </section>
  </main>
</template>

<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; margin: 0; }
body {
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  background: #1a1a2e; /* 答辩 PPT 同款深蓝底（SRS 4.6 深色科技风） */
  color: #e8e8f0;
  min-height: 100vh;
}
.page { max-width: 960px; margin: 0 auto; padding: 48px 24px; }
h1 { font-size: 28px; }
.ver { font-size: 13px; color: #4a90d9; vertical-align: middle; }
.sub { color: #8a8aa0; margin: 8px 0 32px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.card {
  background: #23233a; border: 1px solid #2f2f4a; border-radius: 12px;
  padding: 20px; transition: border-color 0.3s;
}
.card.ok { border-color: #3ecf8e; }
.card.bad { border-color: #e05555; }
.card h2 { font-size: 15px; color: #8a8aa0; font-weight: 600; margin-bottom: 12px; }
.big { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
.meta { font-size: 12px; color: #6c6c85; font-family: Consolas, monospace; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip {
  font-size: 11px; font-family: Consolas, monospace;
  background: #2f2f4a; border-radius: 4px; padding: 2px 8px; color: #b0b0cc;
}
</style>
