import axios from 'axios'

/**
 * 统一 HTTP 客户端：经 Vite 代理 /api → Java 8080。
 * 响应拦截器解包 {code, message, data}，业务层直接拿 data。
 */
export const http = axios.create({ baseURL: '/api', timeout: 10_000 })

http.interceptors.response.use(
  (resp) => {
    const body = resp.data
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || `业务错误 code=${body.code}`))
    }
    return body?.data ?? body
  },
  (err) => Promise.reject(err),
)
