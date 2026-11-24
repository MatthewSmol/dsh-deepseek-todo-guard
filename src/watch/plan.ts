/**
 * Правила: что делать со списком задач на этом тике. Чистые функции — их
 * проверяют тесты, а Host-плагин только исполняет решение.
 */

import type { PlanDecision, SessionView } from './types.js'

/** Настройки, влияющие на решение (подмножество конфига плагина). */
export interface PlanOptions {
  /** Обновлять список идущего хода не реже, чем раз в столько секунд (0 — не обновлять). */
  readonly refreshSeconds: number
  /** Считать список устаревшим через столько минут, когда агент простаивает (0 — не считать). */
  readonly staleAfterMinutes: number
  /** Отмечать выполненное при завершении хода. */
  readonly promoteOnTurnEnd: boolean
}

/**
 * Решить судьбу списка.
 *
 * - в ходе ещё не было `todo/write`: список нужно создать или заменить
 *   (старый относится к прошлому ходу и к текущей работе не относится);
 * - ход закончился, а в списке остались незавершённые: отметить выполненное;
 * - список в ходе есть, но давно не обновлялся, пока агент работает: обновить;
 * - иначе не трогать.
 * @param view - состояние сессии из лога.
 * @param now - текущее время, мс эпохи.
 * @param options - настройки.
 * @returns действие и причина.
 */
export function planAction(view: SessionView, now: number, options: PlanOptions): PlanDecision {
  const items = view.todos ?? []
  const unfinished = items.some(item => item.status !== 'completed')

  if (!view.wroteThisTurn) {
    if (view.turn === 0) return { action: 'none', reason: 'ходов ещё не было' }
    return items.length === 0
      ? { action: 'create', reason: 'в этом ходе списка нет' }
      : { action: 'refresh', reason: 'список относится к прошлому ходу' }
  }

  if (!view.turnOpen && options.promoteOnTurnEnd && unfinished) {
    return { action: 'promote', reason: 'ход завершён, есть незавершённые' }
  }

  // Идущий ход: список должен следовать за работой, а не ждать десять минут.
  if (view.turnOpen && options.refreshSeconds > 0 && now - view.writtenAt >= options.refreshSeconds * 1000) {
    return { action: 'refresh', reason: 'список обновляется по ходу работы' }
  }

  // Простой: список мог остаться от прошлого хода и потерять актуальность.
  if (!view.turnOpen && options.staleAfterMinutes > 0
    && now - view.writtenAt >= options.staleAfterMinutes * 60_000) {
    return { action: 'refresh', reason: 'список давно не обновлялся' }
  }

  return { action: 'none', reason: 'список актуален' }
}

/**
 * Сравнить два списка по содержимому и статусам.
 * @param left - текущий список.
 * @param right - предлагаемый список.
 * @returns true, если списки совпадают и писать в лог не нужно.
 */
export function sameTodos(
  left: readonly { content: string; status: string }[] | null,
  right: readonly { content: string; status: string }[],
): boolean {
  if (left === null) return right.length === 0
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!
    const b = right[index]!
    if (a.content !== b.content || a.status !== b.status) return false
  }
  return true
}
