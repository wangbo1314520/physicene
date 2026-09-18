import { reactive, ref } from 'vue'
import { http } from '../api/http'
import { getAuthToken } from '../api/auth'

export interface SubjectState {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  angle?: number
}

export interface PhysicsElementInput {
  id: string
  type: string
  position: { x: number; y: number }
  angle?: number
  scale?: { x: number; y: number }
  properties?: Record<string, any>
  romeParamsNote?: never
  params?: Record<string, number>
  initialState?: { velocity?: { x: number; y: number } }
  isFixed?: boolean
  isVisible?: boolean
  color?: string
}

export interface SimState {
  simId: string | null
  recordId: number | null
  status: 'idle' | 'connecting' | 'running' | 'paused' | 'ended'
  currentT: number
  subjects: SubjectState[]
  keyEvents: { t: number; label: string; eventType: string }[]
  vSeries: { t: number; vx: number; vy: number }[][] // 每个运动主体的速度分量序列（带符号）
  vIds: string[] // 运动主体 id（与 vSeries 下标对应，图例命名用）
  ekSeries: { t: number; v: number }[]
  pSeries: { t: number; v: number }[]
  endInfo: { reason: string; totalFrames: number; totalDuration: number } | null
  frameCount: number
}

/**
 * 仿真 WebSocket（第二周）：/ws/simulation/{simId}。
 * 处理 frame(30fps)/keyEvent/paused/resumed/ended/sync/kicked 消息与六类控制 action。
 */
export function useSimulationSocket() {
  const state = reactive<SimState>({
    simId: null,
    recordId: null,
    status: 'idle',
    currentT: 0,
    subjects: [],
    keyEvents: [],
    vSeries: [],
    vIds: [],
    ekSeries: [],
    pSeries: [],
    endInfo: null,
    frameCount: 0,
  })
  const error = ref('')
  let ws: WebSocket | null = null

  async function run(elements: PhysicsElementInput[], config: Record<string, unknown>,
                     sceneId?: string | null) {
    error.value = ''
    close()
    Object.assign(state, {
      status: 'connecting', currentT: 0, subjects: [], keyEvents: [],
      vSeries: [], vIds: [], ekSeries: [], pSeries: [], endInfo: null, frameCount: 0,
      recordId: null,
    })
    try {
      const body = sceneId ? { sceneId } : { elements, config }
      const resp = (await http.post('/simulations/run', body)) as {
        simId: string
        wsUrl: string
        recordId: number | null
      }
      state.simId = resp.simId
      state.recordId = resp.recordId
      const token = getAuthToken() ?? ''
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(
        `${proto}://${location.host}${resp.wsUrl}?token=${encodeURIComponent(token)}`)
      ws.onopen = () => (state.status = 'running')
      ws.onmessage = (ev) => handle(JSON.parse(ev.data as string))
      ws.onclose = () => {
        if (state.status !== 'ended') state.status = 'idle'
      }
      ws.onerror = () => (error.value = 'WebSocket 连接失败')
    } catch (e) {
      error.value = String(e)
      state.status = 'idle'
    }
  }

  function handle(msg: Record<string, any>) {
    switch (msg.type) {
      case 'frame': {
        state.currentT = msg.t
        state.frameCount++
        const snap = msg.snapshot as { elements: SubjectState[] }
        state.subjects = snap.elements
        if (state.vIds.length !== snap.elements.length
            || snap.elements.some((s, i) => s.id !== state.vIds[i])) {
          state.vIds = snap.elements.map((s) => s.id)
        }
        snap.elements.forEach((s, i) => {
          if (!state.vSeries[i]) state.vSeries[i] = []
          state.vSeries[i].push({ t: msg.t, vx: s.vx, vy: s.vy })
        })
        const row = msg.dataTableIncrement as
          | { t: number; fields: Record<string, number> }
          | undefined
        if (row) {
          state.ekSeries.push({ t: row.t, v: row.fields.Ek })
          state.pSeries.push({ t: row.t, v: row.fields.p })
        }
        break
      }
      case 'keyEvent':
        state.keyEvents.push({ t: msg.t, label: msg.label, eventType: msg.eventType })
        break
      case 'paused':
        state.status = 'paused'
        break
      case 'resumed':
        state.status = 'running'
        break
      case 'sync':
        if (msg.latestFrame?.snapshot?.elements) {
          state.subjects = msg.latestFrame.snapshot.elements
        }
        state.currentT = msg.currentT
        if (msg.status === 'running') state.status = msg.isPaused ? 'paused' : 'running'
        else state.status = 'ended'
        break
      case 'ended':
        state.status = 'ended'
        state.endInfo = {
          reason: msg.reason,
          totalFrames: msg.totalFrames,
          totalDuration: msg.totalDuration,
        }
        break
      case 'kicked':
        error.value = '同 simId 新连接接入，当前连接被踢下线'
        break
    }
  }

  /** 附加到已在运行/已结束的仿真（AI 助手 run_simulation 后前端直接接管观看） */
  function attach(simId: string, wsUrl: string, recordId: number | null = null) {
    error.value = ''
    close()
    Object.assign(state, {
      status: 'connecting', currentT: 0, subjects: [], keyEvents: [],
      vSeries: [], vIds: [], ekSeries: [], pSeries: [], endInfo: null, frameCount: 0,
      recordId,
    })
    state.simId = simId
    const token = getAuthToken() ?? ''
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}${wsUrl}?token=${encodeURIComponent(token)}`)
    ws.onopen = () => (state.status = 'running')
    ws.onmessage = (ev) => handle(JSON.parse(ev.data as string))
    ws.onclose = () => {
      if (state.status !== 'ended') state.status = 'idle'
    }
    ws.onerror = () => (error.value = 'WebSocket 连接失败')
  }

  function send(action: string, extra?: Record<string, unknown>) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, ...extra }))
    }
  }

  const pause = () => send('pause')
  const play = () => send('play')
  const step = () => send('step')
  const seek = (t: number) => send('seek', { t })
  const end = () => send('end')
  const sync = () => send('sync')

  function close() {
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
  }

  return { state, error, run, attach, pause, play, step, seek, end, sync, close }
}
