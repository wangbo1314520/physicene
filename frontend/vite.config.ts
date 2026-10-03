import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 代理规则（SRS 部署约束：浏览器只连 Java 8080 一个业务通道）
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: '0.0.0.0',  // IPv4+IPv6 双栈——默认只绑 [::1] 致 127.0.0.1 连不上（ERR_INTERNET_DISCONNECTED 根因）
    // Windows 外置盘（E:）文件监听不可靠，曾致模块缓存不刷新（本周 4 次事故），轮询根治
    watch: { usePolling: true, interval: 400 },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
