<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { login, register } from '../api/auth'

const router = useRouter()
const route = useRoute()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const name = ref('')
const role = ref('student')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'login') {
      await login(username.value, password.value)
    } else {
      await register(username.value, password.value, role.value, name.value || username.value)
      await login(username.value, password.value)
    }
    // 整页跳转（vue-router 5 在此场景 push 未同步地址栏，整页导航最稳）
    location.href = (route.query.redirect as string) || '/lab'
  } catch (e) {
    error.value = String(e).replace('Error: ', '')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <div class="card">
      <h1>PhysiScene</h1>
      <p class="sub">AI Agent 智能物理实验平台</p>

      <div class="tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>

      <form @submit.prevent="submit">
        <label>用户名
          <input v-model="username" required placeholder="4-50 位字母/数字/下划线" autocomplete="username" />
        </label>
        <label>密码
          <input v-model="password" type="password" required placeholder="8-32 位，含字母和数字"
                 autocomplete="current-password" />
        </label>
        <template v-if="mode === 'register'">
          <label>昵称 <input v-model="name" placeholder="选填" /></label>
          <label>角色
            <select v-model="role">
              <option value="student">学生</option>
              <option value="teacher">教师</option>
            </select>
          </label>
        </template>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy">{{ busy ? '提交中…' : mode === 'login' ? '登 录' : '注册并登录' }}</button>
      </form>
      <p class="hint">教师角色可配置教学策略（第四周开放）；admin 由数据库初始化</p>
    </div>
  </main>
</template>

<style scoped>
.login-page { min-height: calc(100vh - 55px); display: flex; align-items: center; justify-content: center; }
.card {
  width: 360px; background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 14px;
  padding: 32px 34px;
}
h1 { font-size: 24px; color: #4a90d9; }
.sub { color: #8a8aa0; font-size: 13px; margin: 6px 0 20px; }
.tabs { display: flex; gap: 8px; margin-bottom: 18px; }
.tabs button {
  flex: 1; padding: 8px; background: #23233a; color: #8a8aa0; border: 1px solid #2f2f4a;
  border-radius: 8px; cursor: pointer; font-size: 14px;
}
.tabs button.active { color: #e8e8f0; border-color: #4a90d9; background: #2b5c8f33; }
form { display: flex; flex-direction: column; gap: 12px; }
label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: #8a8aa0; }
input, select {
  background: #23233a; border: 1px solid #2f2f4a; border-radius: 6px; color: #e8e8f0;
  padding: 9px 10px; font-size: 14px;
}
button.primary {
  margin-top: 6px; padding: 10px; background: #2b5c8f; border: 1px solid #4a90d9;
  color: #fff; border-radius: 8px; font-size: 15px; cursor: pointer;
}
button.primary:disabled { opacity: 0.5; }
.error { color: #e05555; font-size: 12px; }
.hint { margin-top: 14px; color: #565675; font-size: 11px; }
</style>
