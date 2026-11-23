/**
 * Подпись события `todo/write` штатного инструмента TODO.
 *
 * DSH принимает запись события только если его тип объявлен в дополняемом
 * словаре `SessionEventMap`. Объявление `todo/write` живёт в модуле, который
 * плагин загружает при старте. Реальный тип объявляет @deepseek-ai/dsh-tool-todo,
 * а это дополнение лишь повторяет его форму для текущего процесса.
 *
 * Модуль держит значение-сигнатуру: TypeScript выбрасывает объявления из
 * модуля без значений, а DSH читает `Symbol.for(key)` как «тип объявлен».
 */

/** Сигнатура события, которым инструмент записывает список задач. */
export const TODO_WRITE_SIGNATURE = Symbol.for('todo/write')

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    /** Полный снимок списка задач; последняя запись заменяет предыдущую. */
    'todo/write': { readonly todos: ReadonlyArray<{ readonly content: string; readonly status: string }> }
  }
}
