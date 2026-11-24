/**
 * Запасной путь без модели: список из самого запроса и прогресса работы.
 *
 * Нужен, когда модель недоступна, отвечает мусором или не настроена. Задача —
 * чтобы плашка задач над полем ввода всё равно была заполнена и отражала ход
 * работы, пусть и простыми формулировками.
 */

import { LIMITS } from './curator.js'
import type { TodoItem, SessionView } from './types.js'

/** Отбросить служебные префиксы и лишние пробелы. */
function clean(line: string): string {
  return line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Обрезать длинную строку до предела панели. */
function clip(text: string): string {
  return text.length > LIMITS.maxContentChars
    ? `${text.slice(0, LIMITS.maxContentChars - 1)}…`
    : text
}

/** Похоже ли на пункт списка: маркер или нумерация. */
function isListItem(line: string): boolean {
  return /^\s*(?:[-*•]|\d+[.)])\s+/u.test(line)
}

/** Разбить запрос на содержательные строки. */
function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/u).map(clean).filter(line => line.length > 3)
  const bullets = lines.filter((line, index) => isListItem(text.split(/\r?\n/u)[index] ?? ''))
  return bullets.length > 1 ? bullets : lines
}

/**
 * Собрать список задач без модели.
 *
 * Если список уже есть — сохраняем формулировки и правим статусы: при закрытом
 * ходе всё становится выполненным, иначе первая незавершённая задача считается
 * текущей. Если списка нет — берём пункты из запроса, а когда их нет, одну
 * строку из начала запроса.
 * @param view - состояние сессии.
 * @param options - пределы и политика статусов.
 * @returns список задач.
 */
export function heuristicTodos(
  view: SessionView,
  options: { maxItems: number; allowParallel: boolean },
): TodoItem[] {
  const previous = view.todos ?? []
  if (previous.length > 0) {
    if (!view.turnOpen) return previous.map(item => ({ content: item.content, status: 'completed' }))
    let active = false
    return previous.map(item => {
      if (item.status === 'completed') return { content: item.content, status: 'completed' }
      if (!active) {
        active = true
        return { content: item.content, status: 'in_progress' }
      }
      return { content: item.content, status: 'pending' }
    })
  }

  const request = view.userTexts.join('\n').trim()
  const candidates = linesOf(request).slice(0, options.maxItems)
  const texts = candidates.length > 0 ? candidates : [request]
  const items: TodoItem[] = []
  for (const raw of texts) {
    const content = clip(raw)
    if (content === '') continue
    if (items.some(item => item.content === content)) continue
    const status = view.turnOpen
      ? (items.length === 0 ? 'in_progress' : 'pending')
      : 'completed'
    items.push({ content, status })
    if (items.length >= options.maxItems) break
  }
  if (items.length === 0) {
    return [{ content: 'Продолжить работу по запросу', status: view.turnOpen ? 'in_progress' : 'completed' }]
  }
  if (!options.allowParallel) {
    let seenActive = false
    for (let index = 0; index < items.length; index += 1) {
      if (items[index]!.status !== 'in_progress') continue
      if (seenActive) items[index] = { content: items[index]!.content, status: 'pending' }
      seenActive = true
    }
  }
  return items
}
