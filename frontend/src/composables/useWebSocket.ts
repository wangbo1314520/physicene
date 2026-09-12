import { onUnmounted, ref } from 'vue'

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

/**
 * WebSocket 连接 composable（第一周心跳探针版）。
 * 第二周 /ws/simulation/{simId} 会扩展帧消息解析与断线重连（指数退避 1s/2s/4s×3）。
 */
export function useWebSocket(path: string) {
  const status = ref<WsStatus>('connecting')
  const lastPingAt = ref<number | null>(null)
  const pingCount = ref(0)
  const lastEcho = ref<string | null>(null)

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}${path}`)

  ws.onopen = () => {
    status.value = 'open'
    ws.send('hello-from-frontend')
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string)
      if (msg.type === 'ping') {
        pingCount.value++
        lastPingAt.value = msg.t
      } else if (msg.type === 'echo') {
        lastEcho.value = msg.received
      }
    } catch {
      // 非 JSON 消息忽略（骨架期只有 ping/echo）
    }
  }
  ws.onclose = () => (status.value = 'closed')
  ws.onerror = () => (status.value = 'error')

  function close() {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  onUnmounted(close)
  return { status, lastPingAt, pingCount, lastEcho, close }
}
