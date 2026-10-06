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
  /** 固定（Java Lombok `boolean isFixed` → Jackson 属性名 "fixed"；发 isFixed 会被静默忽略） */
  fixed?: boolean
  /** 可见性（同上规则：Java isVisible → "visible"） */
  visible?: boolean
  color?: string
  /** 统一搭建台关节（阶段一契约）：rope/rod/spring 连体 A / pulley 施力端 */
  connectTo?: string
  /** 关节连体 B / pulley 负载端 */
  connectTo2?: string
  /** 连体 A 上的局部锚点（米） */
  anchorA?: { x: number; y: number }
  /** 连体 B 上的局部锚点（米） */
  anchorB?: { x: number; y: number }
}

export interface SimState {
  simId: string | null
  recordId: number | null
  status: 'idle' | 'connecting' | 'running' | 'paused' | 'ended'
  currentT: number
  subjects: SubjectState[]
  keyEvents: { t: number; label: string; eventType: string; payload?: Record<string, number | string> }[]
  vSeries: { t: number; vx: number; vy: number; y: number; x?: number }[][] // 每个运动主体的速度分量序列（带符号）；x/y=按帧极值用（卡68 正修：subjects 只留最新帧，WS 重放突发期的顶点帧轮询不可见——max-y/max-x 断言读流真值）
  vIds: string[] // 运动主体 id（与 vSeries 下标对应，图例命名用）
  ekSeries: { t: number; v: number }[]
  pSeries: { t: number; v: number }[]
  /** 检测器/耦合读数（P2.1）：id → [t, value]，帧帧覆盖（末值即最新） */
  probes: Record<string, number[]>
  endInfo: { reason: string; totalFrames: number; totalDuration: number } | null
  frameCount: number
}

/**
 * 仿真 WebSocket（第二周）：/ws/simulation/{simId}。
 * 处理 frame(30fps)/keyEvent/paused/resumed/ended/sync/kicked 消息与六类控制 action。
 * 方案 B Step 2（2026-10-04）：state 提升为模块级单例——Tab 1（实验运行）与
 * Tab 2（自由搭建 RunBridge）共享同一份运行状态，Tab 2 运行后切 Tab 1 即可看曲线/回放。
 */
// ── 模块级共享状态（所有 useSimulationSocket() 调用方看到同一份）──
const sharedState = reactive<SimState>({
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
  probes: {},
  endInfo: null,
  frameCount: 0,
})
const sharedError = ref('')
let sharedWs: WebSocket | null = null
let lastAttach: { simId: string; wsUrl: string; recordId: number | null } | null = null

export function useSimulationSocket() {
  const state = sharedState
  const error = sharedError
  // 直接操作 sharedWs（修复关闭顺序：局部变量在 close 后脱同步）

  async function run(elements: PhysicsElementInput[], config: Record<string, unknown>,
                     sceneId?: string | null) {
    error.value = ''
    close()
    Object.assign(state, {
      status: 'connecting', currentT: 0, subjects: [], keyEvents: [],
      vSeries: [], vIds: [], ekSeries: [], pSeries: [], probes: {}, endInfo: null, frameCount: 0,
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
      lastAttach = { simId: resp.simId, wsUrl: resp.wsUrl, recordId: resp.recordId }
      const token = getAuthToken() ?? ''
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      sharedWs = new WebSocket(
        `${proto}://${location.host}${resp.wsUrl}?token=${encodeURIComponent(token)}`)
      sharedWs.onopen = () => (state.status = 'running')
      sharedWs.onmessage = (ev) => handle(JSON.parse(ev.data as string))
      sharedWs.onclose = () => {
        if (state.status !== 'ended') state.status = 'idle'
      }
      sharedWs.onerror = () => (error.value = 'WebSocket 连接失败')
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
          state.vSeries[i].push({ t: msg.t, vx: s.vx, vy: s.vy, y: s.y, x: s.x })
        })
        const row = msg.dataTableIncrement as
          | { t: number; fields: Record<string, number> }
          | undefined
        if (row) {
          state.ekSeries.push({ t: row.t, v: row.fields.Ek })
          state.pSeries.push({ t: row.t, v: row.fields.p })
        }
        // P2.1：耦合/检测器读数通道（服务器仅在有读数时下发；末值覆盖=最新）
        if (msg.probes) state.probes = msg.probes
        break
      }
      case 'keyEvent': {
        // 服务器订阅重播与 live 推送可能重复同一事件（WS 建立窗口竞态的根治配套）。
        // 去重键 = t+type+label+payload 序列化（四元组）：三元组对「对称双断」会误杀——
        // 两绳同帧断（t 同）type 同、张力数值若恰好相同则 label 也同，唯一可区分字段是 payload.ropeId。
        const key4 = (k: { t: number; eventType: string; label: string; payload?: Record<string, number | string> }) =>
          `${k.t}|${k.eventType}|${k.label}|${JSON.stringify(k.payload ?? {})}`
        const incoming = { t: msg.t, label: msg.label, eventType: msg.eventType, payload: msg.payload ?? undefined }
        if (!state.keyEvents.some((k) => key4(k) === key4(incoming))) {
          state.keyEvents.push(incoming)
        }
        break
      }
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
    lastAttach = { simId, wsUrl, recordId }   // 追问4：复位后服务端停止状态的 E2E 验证经 reattach 复查
    Object.assign(state, {
      status: 'connecting', currentT: 0, subjects: [], keyEvents: [],
      vSeries: [], vIds: [], ekSeries: [], pSeries: [], probes: {}, endInfo: null, frameCount: 0,
      recordId,
    })
    state.simId = simId
    const token = getAuthToken() ?? ''
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    sharedWs = new WebSocket(`${proto}://${location.host}${wsUrl}?token=${encodeURIComponent(token)}`)
    sharedWs.onopen = () => (state.status = 'running')
    sharedWs.onmessage = (ev) => handle(JSON.parse(ev.data as string))
    sharedWs.onclose = () => {
      if (state.status !== 'ended') state.status = 'idle'
    }
    sharedWs.onerror = () => (error.value = 'WebSocket 连接失败')
  }

  function send(action: string, extra?: Record<string, unknown>) {
    if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
      sharedWs.send(JSON.stringify({ action, ...extra }))
    }
  }

  const pause = () => send('pause')
  const play = () => send('play')
  const step = () => send('step')
  const seek = (t: number) => send('seek', { t })
  const end = () => send('end')
  const sync = () => send('sync')

  function close() {
    if (sharedWs) {
      sharedWs.onclose = null
      sharedWs.close()
      sharedWs = null
    }
  }

  /** 批 3·6.5 复位（追问4 强化：权宜→设计）：运行/暂停中先发 end 让服务端实例立即停——
   *  防"复位→孤儿实例跑到 maxDuration"堆积（100 学生×反复位≈每人至多 1 个孤儿，虽无泄漏
   *  但白耗求解线程）。收到 ended 或 800ms 超时（end 帧未及处理即断开）后清态。 */
  async function reset() {
    if (sharedWs && sharedWs.readyState === WebSocket.OPEN
        && (state.status === 'running' || state.status === 'paused')) {
      await new Promise<void>((done) => {
        const ws = sharedWs!
        const timer = setTimeout(done, 800)
        const prev = ws.onmessage
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data as string)
            if (msg.type === 'ended') { clearTimeout(timer); done(); return }
          } catch { /* 非 JSON 帧照旧转发 */ }
          prev?.call(ws, ev)
        }
        end()
      })
    }
    close()
    Object.assign(state, {
      status: 'idle', simId: '', currentT: 0, subjects: [], keyEvents: [],
      vSeries: [], vIds: [], ekSeries: [], pSeries: [], probes: {}, endInfo: null, frameCount: 0,
      recordId: null,
    })
    error.value = ''
  }

  /** 重连最近一次 run/attach 的仿真（追问4：E2E 复查复位后服务端实例已 ended） */
  function reattach(): boolean {
    if (!lastAttach) return false
    attach(lastAttach.simId, lastAttach.wsUrl, lastAttach.recordId)
    return true
  }

  return { state, error, run, attach, reattach, pause, play, step, seek, end, sync, close, reset }
}
