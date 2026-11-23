/**
 * Чистая логика «Сторожа TODO»: никаких сервисов, таймеров и импортов DSH —
 * только функции над обычными значениями. Их проверяют тесты и использует
 * Host-плагин, поэтому поведение не зависит от рантайма.
 *
 * Зачем: список задач TODO живёт в логе сессии (`todo/write`), но агент может
 * забыть его обновить. Сторож раз в интервал проверяет список сессии и решает,
 * нужна ли подсказка. Само решение — `reminderFor`; текст подсказки — `renderText`.
 */

import type { ReminderReason, TodoItem, Translate } from './types.js'

/** Полностью развёрнутая конфигурация сторожа (все поля обязательны). */
export interface WatcherConfig {
  /** Интервал проверки в секундах. */
  readonly checkIntervalSeconds: number
  /** Через сколько минут без обновления список считается устаревшим (0 — не считать). */
  readonly staleAfterMinutes: number
  /** Подсказывать, когда все задачи выполнены, но в сессии осталось несделанное. */
  readonly remindAllCompleted: boolean
  /** Подсказывать, когда новый ход начался без записи списка. */
  readonly remindMissingList: boolean
  /** Подсказывать только пока агент простаивает (не спорить с работающим). */
  readonly remindOnlyWhenIdle: boolean
}

/** Пределы значений конфигурации: мягкая коррекция вместо падения. */
export const LIMITS = {
  checkIntervalSeconds: { min: 5, max: 600 },
  staleAfterMinutes: { min: 0, max: 600 },
} as const

/** Значения по умолчанию, если поле конфигурации не задано. */
export const DEFAULTS: WatcherConfig = {
  checkIntervalSeconds: 30,
  staleAfterMinutes: 10,
  remindAllCompleted: true,
  remindMissingList: true,
  remindOnlyWhenIdle: true,
}

/** Ограничить число целым в диапазоне. */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.min(max, Math.max(min, number))
}

/** Булево значение с запасным вариантом. */
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Развернуть конфигурацию патча в полную и привести значения к допустимым:
 * интервал 5–600 с, порог 0–600 мин (0 отключает проверку устаревания).
 * @param input - частичная конфигурация из cordis.patch.yml.
 * @returns полная конфигурация.
 */
export function resolveConfig(input: Partial<WatcherConfig> = {}): WatcherConfig {
  const { checkIntervalSeconds, staleAfterMinutes } = LIMITS
  return {
    checkIntervalSeconds: clampInt(
      input.checkIntervalSeconds,
      checkIntervalSeconds.min,
      checkIntervalSeconds.max,
      DEFAULTS.checkIntervalSeconds,
    ),
    staleAfterMinutes: clampInt(
      input.staleAfterMinutes,
      staleAfterMinutes.min,
      staleAfterMinutes.max,
      DEFAULTS.staleAfterMinutes,
    ),
    remindAllCompleted: bool(input.remindAllCompleted, DEFAULTS.remindAllCompleted),
    remindMissingList: bool(input.remindMissingList, DEFAULTS.remindMissingList),
    remindOnlyWhenIdle: bool(input.remindOnlyWhenIdle, DEFAULTS.remindOnlyWhenIdle),
  }
}

/** Снимок списка задач на конец последнего завершённого хода. */
export interface TodoSnapshot {
  /** Номер хода (`turn/start`), к которому относится снимок; 0 — ходов не было. */
  readonly turn: number
  /** Записанные задачи (копия, без ссылки на проекцию). */
  readonly todos: readonly TodoItem[]
  /** Время записи списка, мс эпохи. */
  readonly writtenAt: number
  /** Последовательность события `todo/write` в логе сессии. */
  readonly seq: number
}

/** Что сторож знает о сессии на момент тика. */
export interface SessionState {
  /** Текущий ход сессии. */
  readonly turn: number
  /** Снимок списка на конец предыдущего хода; null — списка не было. */
  readonly snapshot: TodoSnapshot | null
  /** Записи todo_write в текущем (незавершённом) ходе. */
  readonly writesThisTurn: number
  /** Агент сейчас простаивает. */
  readonly idle: boolean
  /** Сколько несобранных сообщений ждёт в inbox агента. */
  readonly pendingInput: number
  /** Момент, когда агент в последний раз стал простаивать (мс эпохи). */
  readonly idleSince: number
}

/** Решение сторожа на один тик. */
export interface WatchResult {
  /** Нужна ли подсказка, и почему. */
  readonly reminder: ReminderReason | null
  /** Прошло ли уже порог устаревания на этом тике (для таймлайна панели). */
  readonly overdue: boolean
}

/** Сколько активных (не всем completed) задач в списке. */
export function activeCount(todos: readonly TodoItem[]): number {
  let active = 0
  for (const todo of todos) if (todo.status !== 'completed') active += 1
  return active
}

/** Сколько задач выполнено. */
export function completedCount(todos: readonly TodoItem[]): number {
  let completed = 0
  for (const todo of todos) if (todo.status === 'completed') completed += 1
  return completed
}

/**
 * Прошло ли с записи списка не меньше порога устаревания.
 * @param snapshot - снимок списка или null.
 * @param now - текущее время, мс эпохи.
 * @param staleAfterMinutes - порог или 0, если проверка выключена.
 * @returns true, если снимок есть, порог больше нуля и возраст достиг порога.
 */
export function isOverdue(
  snapshot: TodoSnapshot | null,
  now: number,
  staleAfterMinutes: number,
): boolean {
  if (snapshot === null || staleAfterMinutes <= 0) return false
  return now - snapshot.writtenAt >= staleAfterMinutes * 60_000
}

/**
 * Решить, нужна ли подсказка агенту на этом тике.
 *
 * Порядок проверок — от самого конкретного случая к общему:
 * 1. свежий список с незавершёнными задачами — молчим;
 * 2. список не записан в текущем ходе, а новый ход уже идёт — «нет списка»;
 * 3. все задачи выполнены, но в сессии осталось несделанное — «всё выполнено»;
 * 4. список давно не обновлялся, пока агент простаивает — «устарел».
 *
 * При `remindOnlyWhenIdle` подсказки 2–4 не выдаются, пока агент работает.
 * @param state - состояние сессии.
 * @param now - текущее время, мс эпохи.
 * @param config - развёрнутая конфигурация.
 * @returns решение сторожа.
 */
export function reminderFor(state: SessionState, now: number, config: WatcherConfig): WatchResult {
  const overdue = isOverdue(state.snapshot, now, config.staleAfterMinutes)
  const blocked = config.remindOnlyWhenIdle && !state.idle
  const active = state.snapshot === null ? 0 : activeCount(state.snapshot.todos)

  // 1. Список свежий и в нём есть незавершённые задачи — агенту ничего не нужно.
  if (state.snapshot !== null && !overdue && active > 0) return { reminder: null, overdue }

  // 2. Новый ход идёт (или в inbox ждёт следующее сообщение), а список в нём
  //    ещё не записан: агент приступил к работе без плана.
  const freshTurn = state.turn > 0 && state.turn > (state.snapshot?.turn ?? 0)
  if (config.remindMissingList && !blocked && state.snapshot !== null && freshTurn && state.writesThisTurn === 0) {
    return { reminder: 'no-todo', overdue }
  }

  // 3. Весь список завершён, но в сессии осталось несобранное.
  if (
    config.remindAllCompleted && !blocked && state.snapshot !== null
    && active === 0 && state.pendingInput > 0
  ) {
    return { reminder: 'all-completed', overdue }
  }

  // 4. Список не обновлялся дольше порога, а агент простаивает.
  if (overdue && !blocked) return { reminder: 'stale', overdue }

  return { reminder: null, overdue }
}

/** Текст подсказки для модели по причине; ключи лежат в src/client/locale.ts. */
export function reasonKey(reason: ReminderReason): string {
  return `reminder.${reason}`
}

/**
 * Отрисовать текст подсказки агента.
 * @param reason - причина напоминания.
 * @param snapshot - снимок списка или null.
 * @param now - текущее время, мс эпохи.
 * @param config - развёрнутая конфигурация.
 * @param t - функция перевода.
 * @returns готовый текст для агента.
 */
export function renderText(
  reason: ReminderReason,
  snapshot: TodoSnapshot | null,
  now: number,
  config: WatcherConfig,
  t: Translate,
): string {
  const interval = config.checkIntervalSeconds
  switch (reason) {
    case 'no-todo':
      return t('reminder.no-todo', { interval })
    case 'all-completed':
      return t('reminder.all-completed', { interval })
    case 'stale': {
      const minutes = snapshot === null
        ? config.staleAfterMinutes
        : Math.max(0, Math.floor((now - snapshot.writtenAt) / 60_000))
      return t('reminder.stale', { minutes, interval })
    }
  }
}

/** Одна строка для таймлайна панели. */
export function describeReason(reason: ReminderReason, t: Translate): string {
  return t(reasonKey(reason))
}
