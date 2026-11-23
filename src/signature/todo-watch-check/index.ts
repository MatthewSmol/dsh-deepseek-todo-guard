/**
 * Подпись события `todo-watch/check`: итог очередной проверки списка TODO.
 *
 * Сторож дописывает это событие после каждого тика, а панель показывает по
 * нему журнал проверок. Как и остальные события лога, тип объявлен в
 * дополняемом словаре `SessionEventMap` загруженного модуля.
 *
 * Модуль держит значение-сигнатуру: TypeScript выбрасывает объявления из
 * модуля без значений, а DSH читает `Symbol.for(key)` как «тип объявлен».
 */

/** Сигнатура события, которым сторож отмечает каждую проверку. */
export const TODO_WATCH_CHECK_SIGNATURE = Symbol.for('todo-watch/check')

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    /** Итог проверки списка TODO: время, ход, причина подсказки и отправлена ли она. */
    'todo-watch/check': {
      /** Время проверки, мс эпохи. */
      readonly at: number
      /** Номер текущего хода сессии. */
      readonly turn: number
      /** Причина подсказки или null, если напоминать было не о чем. */
      readonly reason: 'stale' | 'all-completed' | 'no-todo' | null
      /** Отправлена ли подсказка агенту. */
      readonly sent: boolean
      /** Активных задач на момент проверки. */
      readonly active: number
      /** Выполненных задач. */
      readonly completed: number
      /** Напоминаний отправлено за жизнь сессии. */
      readonly sentTotal: number
    }
  }
}
