/**
 * Чтение лога сессии: что уже записано и как идёт текущий ход.
 *
 * Один проход по событиям, без подписок и без записи. `snapshotEvents()`
 * помечен в DSH устаревшим, но это единственный синхронный читатель лога в
 * версии 0.2.2; ошибка чтения не должна ломать тик — вызывающий ловит её сам.
 */

import type { TodoItem, TodoStatus, SessionView } from './types.js'

/** Минимальное лицо события лога, которое нужно сторожу. */
interface LogEvent {
  readonly type: string
  readonly seq?: number
  readonly time?: number
  readonly data?: any
}

/** Достать текстовые блоки сообщения. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { type: 'text'; text: string } =>
      typeof block === 'object' && block !== null && (block as any).type === 'text'
      && typeof (block as any).text === 'string')
    .map(block => block.text)
    .join('\n')
    .trim()
}

/** Привести одну задачу к безопасному виду; null — запись негодная. */
function todoOf(raw: any): TodoItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const content = typeof raw.content === 'string' ? raw.content.trim() : ''
  if (content === '') return null
  const status = raw.status as TodoStatus
  if (status !== 'pending' && status !== 'in_progress' && status !== 'completed') return null
  return { content, status }
}

/**
 * Собрать состояние сессии из её лога.
 * @param events - события сессии в порядке записи.
 * @returns состояние на конец лога.
 */
export function readSession(events: readonly LogEvent[]): SessionView {
  let turn = 0
  let todos: TodoItem[] | null = null
  let wroteThisTurn = false
  let writtenAt = 0
  let turnOpen = false
  let stepStarted = false
  let userTexts: string[] = []
  let assistantTexts: string[] = []
  let toolNames: string[] = []

  for (const event of events) {
    switch (event.type) {
      case 'turn/start': {
        turn = typeof event.data?.turn === 'number' ? event.data.turn : turn
        turnOpen = true
        wroteThisTurn = false
        stepStarted = false
        userTexts = []
        assistantTexts = []
        toolNames = []
        break
      }
      case 'turn/end': {
        turnOpen = false
        break
      }
      case 'step/start': {
        stepStarted = true
        break
      }
      case 'todo/write': {
        const raw = Array.isArray(event.data?.todos) ? event.data.todos : []
        const items = raw.map(todoOf).filter((item: TodoItem | null): item is TodoItem => item !== null)
        todos = items
        wroteThisTurn = true
        writtenAt = typeof event.time === 'number' ? event.time : Date.now()
        break
      }
      case 'user/message': {
        const text = textOf(event.data?.content)
        if (text !== '') userTexts.push(text)
        break
      }
      case 'assistant/message': {
        const text = textOf(event.data?.content)
        if (text !== '') assistantTexts.push(text)
        break
      }
      case 'tool/call': {
        const name = event.data?.name
        if (typeof name === 'string') toolNames.push(name)
        break
      }
      default:
        break
    }
  }

  return {
    turn,
    todos,
    wroteThisTurn,
    writtenAt,
    turnOpen,
    stepStarted,
    userTexts: userTexts.slice(-3),
    assistantTexts: assistantTexts.slice(-3),
    toolNames: toolNames.slice(-20),
  }
}

/**
 * Прочитать лог сессии, если он доступен.
 * @param session - сессия агента.
 * @returns состояние или null, если лог прочитать нельзя.
 */
export function readView(session: any): SessionView | null {
  if (typeof session?.snapshotEvents !== 'function') return null
  const events: LogEvent[] = session.snapshotEvents()
  return readSession(events)
}
