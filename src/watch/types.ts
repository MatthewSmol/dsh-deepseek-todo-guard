/**
 * Общие типы сторожа TODO.
 *
 * Плагин не рисует интерфейс: плашка задач над полем ввода — штатная панель
 * DSH, которая читает проекцию `todos`. Сторож лишь поддерживает эту проекцию
 * актуальной, дописывая в лог сессии события `todo/write` тем же форматом, что
 * и инструмент `todo_write` у агента.
 */

/** Статус задачи — ровно тот набор, что понимает панель. */
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

/** Одна задача списка (совпадает с `TodoItem` штатного инструмента). */
export interface TodoItem {
  readonly content: string
  readonly status: TodoStatus
}

/** Что нужно сделать со списком на этом тике. */
export type PlanAction = 'create' | 'refresh' | 'promote' | 'none'

/** Состояние сессии, восстановленное из её лога. */
export interface SessionView {
  /** Номер текущего хода (0 — ходов не было). */
  readonly turn: number
  /** Список, записанный последним `todo/write` (null — записей не было). */
  readonly todos: readonly TodoItem[] | null
  /** Был ли `todo/write` в текущем ходе. */
  readonly wroteThisTurn: boolean
  /** Время последнего `todo/write`, мс эпохи. */
  readonly writtenAt: number
  /** Идёт ли ход: после последнего `turn/start` не было `turn/end`. */
  readonly turnOpen: boolean
  /** Уже был `step/start` в текущем ходе (модель реально работает). */
  readonly stepStarted: boolean
  /** Тексты пользователя в текущем ходе. */
  readonly userTexts: readonly string[]
  /** Тексты ассистента в текущем ходе. */
  readonly assistantTexts: readonly string[]
  /** Имена вызванных инструментов в текущем ходе. */
  readonly toolNames: readonly string[]
  /** Последнее название сессии из `session/title`, если оно уже есть. */
  readonly title?: string
}

/** Решение на один тик. */
export interface PlanDecision {
  /** Что делать со списком. */
  readonly action: PlanAction
  /** Почему так решено — для логов и тестов. */
  readonly reason: string
}
