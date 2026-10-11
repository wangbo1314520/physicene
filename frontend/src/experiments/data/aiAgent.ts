/**
 * 实验层 AI 通道：经 Java 代理 `/api/v1/agent/chat` 调 Python Agent（DeepSeek + 教材知识库 RAG）。
 * 服务不可用（8000 未启动 / 超时 / 业务错误）时返回 null，由调用方用内置模板回退——AI 侧栏永远可用。
 * 项目定位（2026-09-17 更正）：老师用它搭/找实验上课讲解，学生用它自学；不会的问题与解题思路由 AI 直接解答，不设“不给答案”的限制。
 */
import { http } from '../../api/http'
import { getUser } from '../../api/auth'

export interface AgentReply { reply: string; fallback: boolean; errorType: string | null }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export async function askAgent(message: string, opts: { sessionId?: string; history?: ChatTurn[]; timeoutMs?: number } = {}): Promise<AgentReply | null> {
  const user = getUser()
  try {
    const data = (await http.post('/v1/agent/chat', {
      userId: user?.id ?? 0,
      sessionId: opts.sessionId ?? '',
      message,
      history: (opts.history ?? []).slice(-8),
    }, { timeout: opts.timeoutMs ?? 40_000 })) as { reply?: string; fallback?: boolean; errorType?: string | null } | null
    if (!data?.reply) return null
    return { reply: tidyMath(data.reply), fallback: !!data.fallback, errorType: data.errorType ?? null }
  } catch (e) {
    // A2（2026-10-11）：网关显式拒绝（限流文案等）原样透传——不再吞成 null（静默）
    const msg = String((e as Error)?.message ?? e).replace('Error: ', '')
    if (msg && msg.length >= 8) return { reply: msg, fallback: true, errorType: 'GATEWAY' }
    return null
  }
}

/** LLM 常输出 LaTeX（\\( \\) \\[ \\] \\frac 等），侧栏是纯文本渲染：做一次轻量转写，保证可读 */
export function tidyMath(s: string): string {
  return s
    .replace(/\\\[|\\\]|\\\(|\\\)/g, '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(cdot|times)\s?/g, (m) => (m.startsWith('\\cdot') ? '·' : '×'))
    .replace(/\\(alpha|beta|gamma|theta|omega|lambda|mu|pi|Delta|phi|rho|sigma|tau|cos|sin|tan|ln|log)/g, (_m, g: string) => ({ alpha: 'α', beta: 'β', gamma: 'γ', theta: 'θ', omega: 'ω', lambda: 'λ', mu: 'μ', pi: 'π', Delta: 'Δ', phi: 'φ', rho: 'ρ', sigma: 'σ', tau: 'τ', cos: 'cos', sin: 'sin', tan: 'tan', ln: 'ln', log: 'log' } as Record<string, string>)[g] ?? g)
    .replace(/\\(text|mathrm|left|right|,|;)\b/g, '')
    .replace(/\^\{([^{}]+)\}/g, '^$1')
    .replace(/_\{([^{}]+)\}/g, '_$1')
    .replace(/\n{3,}/g, '\n\n')
}

/** 把实验上下文压成一段前缀，让 Agent 知道“在哪个实验、哪一步、已有什么数据”。含“请解释”保证走问答意图 */
export function withExperimentContext(opts: { experiment: string; step?: string | null; goal?: string | null; records?: Record<string, unknown> | null; ask: string }): string {
  const rec = opts.records && Object.keys(opts.records).length ? `已记录数据：${JSON.stringify(opts.records).slice(0, 600)}` : '尚未记录数据'
  return [
    `【物理实验讲解】实验：《${opts.experiment}》`,
    opts.step ? `当前步骤：${opts.step}${opts.goal ? `（目标：${opts.goal}）` : ''}` : '',
    rec,
    `请解释并回答：${opts.ask}`,
    '要求：面向高中生，公式用文字或简单符号写清楚。按问法分流：直接要答案→先给答案再给完整推理；求思路→分步引导（先方向后公式，不替学生算到底）；问"我算的对吗"→明确确认或指出错在哪；概念问题→简洁讲解。',
  ].filter(Boolean).join('\n')
}
