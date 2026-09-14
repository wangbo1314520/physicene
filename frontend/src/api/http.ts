import axios from 'axios'

/**
 * 统一 HTTP 客户端：经 Vite 代理 /api → Java 8080。
 * 自动附带 JWT；响应拦截器解包 {code, message, data}；
 * 1002 鉴权失败自动跳登录页（SRS §6.4 前端处理约定）。
 */
export const http = axios.create({ baseURL: '/api', timeout: 15_000 })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('ps_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

const isAuthApi = (url?: string) => !!url && url.includes('/auth/')

http.interceptors.response.use(
  (resp) => {
    const body = resp.data
    if (body && typeof body.code === 'number' && body.code !== 0) {
      if (body.code === 1002 && !isAuthApi(resp.config?.url)) {
        localStorage.removeItem('ps_token')
        localStorage.removeItem('ps_user')
        if (location.pathname !== '/login') location.href = '/login'
      }
      return Promise.reject(new Error(body.message || `业务错误 code=${body.code}`))
    }
    return body?.data ?? body
  },
  (err) => {
    const body = err.response?.data
    if (body?.code === 1002 && !isAuthApi(err.config?.url)) {
      localStorage.removeItem('ps_token')
      localStorage.removeItem('ps_user')
      if (location.pathname !== '/login') location.href = '/login'
    }
    return Promise.reject(new Error(body?.message || err.message || '网络错误'))
  },
)
