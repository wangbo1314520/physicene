import { http } from './http'

const TOKEN_KEY = 'ps_token'
const USER_KEY = 'ps_user'

export interface CurrentUser {
  id: number
  username: string
  role: string
  name: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/** 实际请求用 token：正式登录优先；演示页的 demo token 只存内存（不写 localStorage，
 *  路由守卫不认它——不登录进不了实验台/我的场景） */
let demoToken: string | null = null

export function getAuthToken(): string | null {
  return getToken() ?? demoToken
}

/** 演示页（/sim）免登录：确保 demo 账号可用并返回其 token（仅内存） */
export async function ensureDemoLogin(): Promise<string | null> {
  if (getAuthToken()) return getAuthToken()
  try {
    const data = (await http.post('/auth/login', {
      username: 'demo', password: 'demo1234',
    })) as { token: string }
    demoToken = data.token
    return demoToken
  } catch {
    try {
      await http.post('/auth/register', {
        username: 'demo', password: 'demo1234', role: 'student', name: '演示账号',
      })
      const data = (await http.post('/auth/login', {
        username: 'demo', password: 'demo1234',
      })) as { token: string }
      demoToken = data.token
      return demoToken
    } catch {
      return null // 后端不可用时演示页仅展示预设
    }
  }
}

export function getUser(): CurrentUser | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? (JSON.parse(raw) as CurrentUser) : null
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export async function login(username: string, password: string) {
  const data = (await http.post('/auth/login', { username, password })) as {
    token: string
    expiresIn: number
    user: CurrentUser
  }
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  return data.user
}

export async function register(username: string, password: string, role: string, name: string) {
  return (await http.post('/auth/register', { username, password, role, name })) as { id: number }
}
