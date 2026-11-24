/**
 * Разбор ответа модели и нормализация списка задач.
 *
 * Модель отвечает строго JSON-объектом `{"todos":[...]}`; всё, что не проходит
 * проверку, отбрасывается — лучше оставить прежний список, чем записать мусор
 * в панель. Ошибки разбора не бросаются наружу: вызывающий получает null и
 * уходит в эвристику.
 */

import type { TodoItem, TodoStatus } from './types.js'

/** Пределы одной задачи. */
export const LIMITS = {
  /** Максимум задач в списке. */
  maxItems: 7,
  /** Максимум символов в тексте задачи. */
  maxContentChars: 120,
} as const

/** Привести статус к допустимому. */
function statusOf(value: unknown): TodoStatus | null {
  return value === 'pending' || value === 'in_progress' || value === 'completed' ? value : null
}

/** Снять обёртку ```json … ```, если модель её добавила. */
function stripFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  return (fenced?.[1] ?? text).trim()
}

/**
 * Вытащить первый JSON-объект из ответа модели.
 * @param text - сырой ответ.
 * @returns разобранный объект или null.
 */
export function parsePayload(text: string): unknown {
  const body = stripFence(text)
  try {
    return JSON.parse(body)
  } catch {
    // Модель могла добавить пояснение до или после JSON: берём первую пару скобок.
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(body.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

/**
 * Проверить и нормализовать список из ответа модели.
 *
 * Отбрасываются: пустые и слишком длинные строки (обрезаются до 120 символов),
 * недопустимые статусы, повторы. Порядок сохраняется, длина ограничена
 * `maxItems`. Если параллельная работа запрещена, в работе остаётся первая
 * задача, остальные переводятся в `pending`.
 * @param payload - разобранный JSON ответа.
 * @param options - пределы и политика статусов.
 * @returns готовый список или null, если пригодных задач нет.
 */
export function normalizeTodos(
  payload: unknown,
  options: { maxItems: number; allowParallel: boolean },
): TodoItem[] | null {
  const raw = Array.isArray((payload as any)?.todos) ? (payload as any).todos : null
  if (raw === null) return null
  const items: TodoItem[] = []
  const seen = new Set<string>()
  let active = 0
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const status = statusOf((entry as any).status)
    const content = typeof (entry as any).content === 'string' ? (entry as any).content.trim() : ''
    if (status === null || content === '') continue
    const text = content.length > LIMITS.maxContentChars
      ? `${content.slice(0, LIMITS.maxContentChars - 1)}…`
      : content
    if (seen.has(text)) continue
    seen.add(text)
    const effective = status === 'in_progress' && !options.allowParallel && active > 0 ? 'pending' : status
    if (effective === 'in_progress') active += 1
    items.push({ content: text, status: effective })
    if (items.length >= options.maxItems) break
  }
  return items.length === 0 ? null : items
}

/**
 * Строка запроса для модели: только факты хода, без всей истории.
 * @param view - состояние сессии.
 * @param turnOpen - идёт ли ход.
 * @returns JSON-строкой, чтобы кавычки в тексте не ломали разметку подсказки.
 */
export function frameInput(view: {
  turn: number
  todos: readonly TodoItem[] | null
  userTexts: readonly string[]
  assistantTexts: readonly string[]
  toolNames: readonly string[]
}, turnOpen: boolean): string {
  const payload = {
    turn: view.turn,
    turn_open: turnOpen,
    request: view.userTexts.join('\n').slice(0, 3000),
    assistant: view.assistantTexts.join('\n').slice(0, 1500),
    tools: view.toolNames.slice(-15),
    current_list: view.todos ?? [],
  }
  return JSON.stringify(payload)
}

/** Системная инструкция куратора списка. */
export function systemPrompt(options: { maxItems: number; allowParallel: boolean }): string {
  return [
    'Ты ведёшь список задач текущего раунда работы агента-программиста. Этот список виден человеку над полем ввода.',
    'Верни ТОЛЬКО JSON-объект вида {"todos":[{"content":"…","status":"pending|in_progress|completed"}]}, без пояснений и Markdown.',
    `Пунктов от 1 до ${options.maxItems}; content — короткая императивная строка (до 120 символов) на языке запроса человека.`,
    'Опирайся на запрос, уже сделанные вызовы инструментов и тексты ассистента: что уже сделано — completed, что делается сейчас — in_progress, что осталось — pending.',
    options.allowParallel
      ? 'В in_progress может быть несколько задач, если работа идёт параллельно.'
      : 'В in_progress не больше одной задачи.',
    'Если ход уже завершён (turn_open=false), все задачи должны быть completed.',
    'Не выдумывай задач, которых нет в работе, и не дублируй формулировки.',
  ].join('\n')
}
