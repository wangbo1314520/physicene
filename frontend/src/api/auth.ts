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
