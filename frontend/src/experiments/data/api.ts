/** 实验会话持久化（对接后端 5 个 API；自动保存防抖 + 乐观锁冲突处理） */
import { http } from '../../api/http'

export interface ExpSession {
  id: number
  experimentId: string
  status: 'draft' | 'submitted'
  stepState: Record<string, unknown> | null
  rawData: Record<string, unknown> | null
  processedData: Record<string, unknown> | null
  conclusion: string | null
  aiFeedback: string | null
  version: number
  updatedAt: string
  resumed?: boolean
  reportId?: number
}

export const expApi = {
  /** ① 开始/续做 */
  start(experimentId: string): Promise<ExpSession> {
    return http.post('/experiments/sessions', { experimentId }) as Promise<ExpSession>
  },
  /** ② 自动保存 */
  save(id: number, body: Record<string, unknown>): Promise<ExpSession> {
    return http.put(`/experiments/sessions/${id}`, body) as Promise<ExpSession>
  },
  /** ③ 提交（挂 Report） */
  submit(id: number, conclusion: string): Promise<ExpSession> {
    return http.post(`/experiments/sessions/${id}/submit`, { conclusion }) as Promise<ExpSession>
  },
  /** ④ 我的实验 */
  myList(params?: Record<string, unknown>): Promise<{
    total: number
    items: ExpSession[]
  }> {
    return http.get('/experiments/sessions', { params }) as Promise<any>
  },
  /** ⑤ 教师统计 */
  classStats(experimentId: string): Promise<Record<string, unknown>> {
    return http.get('/experiments/sessions/class', {
      params: { experimentId },
    }) as Promise<any>
  },
}

/** 自动保存管理器：2s 防抖；冲突回调（提示刷新） */
export class AutosaveManager {
  private timer = 0
  private pending: Record<string, unknown> = {}
  private saving = false

  constructor(
    private sessionId: number,
    private onConflict: (msg: string) => void,
    private onSaved?: (s: ExpSession) => void,
  ) {}

  patch(part: Record<string, unknown>) {
    Object.assign(this.pending, part)
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => void this.flush(), 2000)
  }

  async flush(): Promise<void> {
    if (this.saving || Object.keys(this.pending).length === 0) {
      return
    }
    const body = this.pending
    this.pending = {}
    this.saving = true
    try {
      const saved = await expApi.save(this.sessionId, body)
      this.onSaved?.(saved)
    } catch (e: any) {
      if (String(e).includes('已被') || String(e).includes('其他设备') || String(e).includes('已提交')) {
        this.onConflict(String(e))
      } else {
        // 网络错误：暂存待下次合并
        Object.assign(this.pending, body)
      }
    } finally {
      this.saving = false
    }
  }
}
