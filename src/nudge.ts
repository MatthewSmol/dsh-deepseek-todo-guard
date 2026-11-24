/**
 * Напоминание агенту: сам текст и решение, пора ли его отправлять.
 *
 * Сторож не только правит плашку за агентом, но и напоминает ему про список:
 * `agent.inject` кладёт сообщение в inbox как контекст следующего шага, не будя
 * драйвер. Так модель узнаёт, что список ведёт кто-то ещё и его надо
 * поддерживать самому.
 */

import type { TodoItem } from './watch/types.js'

/** Сколько символов списка показывать в напоминании. */
const MAX_LIST_CHARS = 400

/** Максимум задач в напоминании. */
const MAX_ITEMS = 7

/** Подпись статуса для текста напоминания. */
function mark(status: TodoItem['status']): string {
  return status === 'completed' ? '[x]' : status === 'in_progress' ? '[~]' : '[ ]'
}

/**
 * Текст напоминания агенту.
 * @param todos - текущий список задач.
 * @param extra - что ещё сказать (причина подсказки).
 * @returns текст сообщения.
 */
export function nudgeText(todos: readonly TodoItem[], extra?: string): string {
  const lines = todos.slice(0, MAX_ITEMS).map((item, index) => `${index + 1}. ${mark(item.status)} ${item.content}`)
  const folded = lines.join('\n')
  const list = folded.length > MAX_LIST_CHARS ? `${folded.slice(0, MAX_LIST_CHARS - 1)}…` : folded
  const counts = {
    pending: todos.filter(item => item.status === 'pending').length,
    active: todos.filter(item => item.status === 'in_progress').length,
    done: todos.filter(item => item.status === 'completed').length,
  }
  return [
    'TODO watch: your task list is maintained outside your own todo_write calls.',
    extra === undefined ? '' : `Reason: ${extra}.`,
    `Current list (${counts.done} done, ${counts.active} in progress, ${counts.pending} pending):`,
    list === '' ? '(empty)' : list,
    'Keep it current yourself: call todo_write with the COMPLETE list when the plan changes, '
    + 'mark the task you are working on in_progress, and mark finished tasks completed.',
  ].filter(line => line !== '').join('\n')
}

/**
 * Пора ли напоминать агенту.
 * @param options - настройки и отметки времени.
 * @returns true, если напоминание нужно.
 */
export function shouldNudge(options: {
  /** Включены ли напоминания. */
  readonly enabled: boolean
  /** Идёт ли ход: простаивающему агенту контекст не нужен. */
  readonly turnOpen: boolean
  /** Когда напоминали в прошлый раз, мс эпохи (0 — не напоминали). */
  readonly lastNudgedAt: number
  /** Текущее время, мс эпохи. */
  readonly now: number
  /** Минимальный интервал между напоминаниями, мс. */
  readonly minIntervalMs: number
}): boolean {
  if (!options.enabled) return false
  if (!options.turnOpen) return false
  return options.now - options.lastNudgedAt >= options.minIntervalMs
}

/**
 * Собрать сообщение для `agent.inject`.
 * @param todos - список задач.
 * @param extra - причина подсказки.
 * @returns объект сообщения без внешних зависимостей.
 */
export function nudgeMessage(todos: readonly TodoItem[], extra?: string): Record<string, unknown> {
  return {
    // Формат совпадает с createUserMessage: id, роль, блоки текста и источник.
    id: globalThis.crypto?.randomUUID?.() ?? `todo-watch-${Date.now()}`,
    role: 'user',
    content: [{ type: 'text', text: nudgeText(todos, extra) }],
    source: { kind: 'todo-watch' },
  }
}
