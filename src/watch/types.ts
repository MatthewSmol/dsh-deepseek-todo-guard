/**
 * Минимальная подпись подсказки в логе (совместима с boundContextSummary из
 * @deepseek-ai/dsh-llm: не длиннее 120 символов).
 */
export const CONTEXT_SUMMARY_MAX_CHARS = 120

/** Обрезать подсказку до предела подписи, сохранив читаемость. */
export function boundSummary(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= CONTEXT_SUMMARY_MAX_CHARS
    ? flat
    : `${flat.slice(0, CONTEXT_SUMMARY_MAX_CHARS - 1)}…`
}

/** Минимальная формула перевода интерфейса (совместима с ctx.locale.bind). */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** Состояние задачи в списке TODO (как в @deepseek-ai/dsh-tool-todo). */
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

/** Одна задача из проекции `todos`. */
export interface TodoItem {
  readonly content: string
  readonly status: TodoStatus
}

/** Почему сторож напомнил агенту обновить список. */
export type ReminderReason =
  /** Список устарел: давно не обновлялся, пока агент простаивает. */
  | 'stale'
  /** Все задачи выполнены, но в сессии осталось несделанное. */
  | 'all-completed'
  /** Новый ход начался без записи todo_write. */
  | 'no-todo'
