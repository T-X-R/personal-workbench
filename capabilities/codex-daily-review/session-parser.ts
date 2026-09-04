import type { CapabilityLanguage, CodexSessionTextFile } from '../../packages/capability-contract/src'

const MAX_STORED_EXCERPT = 2_000

export type DailyTurn = {
  requestedAt: string
  request: string
  outcome: string | null
}

export type DailySession = {
  id: string
  cwd: string
  startedAt: string
  archived: boolean
  turns: DailyTurn[]
}

export type DailySessionReviewSource = {
  sessions: DailySession[]
  scannedFileCount: number
}

type JsonObject = Record<string, unknown>

export function parseDailySessions(files: CodexSessionTextFile[]): DailySessionReviewSource {
  const sessions = files
    .map(parseSession)
    .filter((session): session is DailySession => session !== null)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))

  return { sessions, scannedFileCount: files.length }
}

export function buildSummaryPrompt(date: string, sessions: DailySession[], language: CapabilityLanguage): string {
  const turnCount = sessions.reduce((total, session) => total + session.turns.length, 0)
  const perTurnBudget = Math.min(1_200, Math.max(48, Math.floor(18_000 / Math.max(turnCount, 1))))
  const evidence = sessions.map((session, sessionIndex) => {
    const workspace = compactText(shortWorkspace(session.cwd), 100)
    const turns = session.turns.map((turn, turnIndex) => {
      const requestBudget = Math.floor(perTurnBudget * 0.55)
      const outcomeBudget = perTurnBudget - requestBudget
      const request = compactText(turn.request, requestBudget)
      const outcome = turn.outcome ? compactText(turn.outcome, outcomeBudget) : language === 'zh' ? '尚无完成结果' : 'No completed result yet'
      return `T${turnIndex + 1} Q: ${request}\nT${turnIndex + 1} A: ${outcome}`
    }).join('\n')
    return `S${sessionIndex + 1} [${workspace}]${session.archived ? ' [archived]' : ''}\n${turns}`
  }).join('\n\n')

  if (language === 'en') {
    return `You are producing a factual daily task review from local Codex session evidence.
Date: ${date}
Sessions: ${sessions.length}; turns: ${turnCount}

Write a concise review with these sections:
1. Completed today
2. In progress / follow-up
3. Key outputs and decisions
4. Risks or blockers

Merge duplicate work across sessions. Treat requests as intent and assistant outcomes as evidence, not guaranteed truth. Do not invent status, people, dates, or deliverables. Omit empty sections. Use clear Markdown bullets.

Evidence:
${evidence}`
  }

  return `你正在根据本地 Codex session 证据生成一份事实准确的每日任务总结。
日期：${date}
会话数：${sessions.length}；轮次：${turnCount}

请简洁输出以下部分：
1. 今日已完成
2. 进行中 / 待跟进
3. 关键产出与决策
4. 风险或阻塞

合并跨会话的重复事项。用户请求代表意图，Codex 的完成答复只能作为执行证据，不能视为绝对事实。不要虚构状态、人员、日期或交付物；没有内容的部分直接省略。使用清晰的 Markdown 列表。

证据：
${evidence}`
}

function parseSession(file: CodexSessionTextFile): DailySession | null {
  let id = file.name.replace(/\.jsonl$/, '')
  let cwd = ''
  let startedAt = ''
  let isSubagent = false
  let pendingRequest: { requestedAt: string; text: string } | null = null
  const turns: DailyTurn[] = []

  forEachLine(file.content, (line) => {
    let event: JsonObject
    try {
      const parsed: unknown = JSON.parse(line)
      if (!isObject(parsed)) return true
      event = parsed
    } catch {
      return true
    }

    const payload = isObject(event.payload) ? event.payload : null
    if (event.type === 'session_meta' && payload) {
      const source = payload.source
      if (isObject(source) && 'subagent' in source) {
        isSubagent = true
        return false
      }
      id = stringValue(payload.id) ?? id
      cwd = stringValue(payload.cwd) ?? ''
      startedAt = stringValue(event.timestamp) ?? stringValue(payload.timestamp) ?? ''
      return true
    }

    if (event.type === 'response_item' && payload?.type === 'message' && payload.role === 'user') {
      const request = extractUserRequest(payload)
      if (!request) return true
      if (pendingRequest) {
        pendingRequest.text += `\n${request}`
      } else {
        pendingRequest = {
          requestedAt: stringValue(event.timestamp) ?? startedAt,
          text: request,
        }
      }
      return true
    }

    if (event.type === 'event_msg' && payload?.type === 'task_complete' && pendingRequest) {
      turns.push({
        requestedAt: pendingRequest.requestedAt,
        request: compactText(pendingRequest.text, MAX_STORED_EXCERPT),
        outcome: compactOptional(stringValue(payload.last_agent_message)),
      })
      pendingRequest = null
    }
    return true
  })

  if (isSubagent) return null
  if (pendingRequest) {
    turns.push({
      requestedAt: pendingRequest.requestedAt,
      request: compactText(pendingRequest.text, MAX_STORED_EXCERPT),
      outcome: null,
    })
  }
  if (turns.length === 0) return null

  return { id, cwd, startedAt, archived: file.archived, turns }
}

function extractUserRequest(payload: JsonObject): string | null {
  if (!Array.isArray(payload.content)) return null
  const text = payload.content
    .filter(isObject)
    .filter((part) => part.type === 'input_text')
    .map((part) => stringValue(part.text))
    .filter((part): part is string => Boolean(part) && !isInjectedContext(part))
    .join('\n')
    .replace(/<image\b[^>]*>[\s\S]*?<\/image>/gi, '[图片附件]')
    .trim()
  return text || null
}

function isInjectedContext(text: string): boolean {
  const value = text.trimStart()
  return value.startsWith('# AGENTS.md instructions') || value.startsWith('<environment_context>')
}

function compactOptional(value: string | null): string | null {
  const text = value?.trim()
  return text ? compactText(text, MAX_STORED_EXCERPT) : null
}

function compactText(value: string, maxLength: number): string {
  const text = value.trim()
  if (text.length <= maxLength) return text
  if (maxLength < 32) return `${text.slice(0, Math.max(1, maxLength - 1))}…`
  const marker = ' … '
  const available = maxLength - marker.length
  const headLength = Math.ceil(available * 0.67)
  return `${text.slice(0, headLength)}${marker}${text.slice(-(available - headLength))}`
}

function shortWorkspace(cwd: string): string {
  if (!cwd) return 'unknown workspace'
  const parts = cwd.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || cwd
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function forEachLine(content: string, visit: (line: string) => boolean): void {
  let start = 0
  while (start < content.length) {
    const end = content.indexOf('\n', start)
    const line = content.slice(start, end === -1 ? content.length : end).trim()
    if (line && !visit(line)) return
    if (end === -1) return
    start = end + 1
  }
}
