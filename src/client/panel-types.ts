import type { TodoItem } from '../watch/types.js'

/**
 * Свойства стандартного набора слота (компонент получает их от рендерера DSH).
 * Описаны ровно те поля, которые читает панель.
 */
export interface SlotProps {
  /** Функция перевода активного языка. */
  readonly t: (key: string, params?: Record<string, unknown>) => string
  /** Идентификатор текущей сессии (нет, если сессия не выбрана). */
  readonly sessionId?: string
  /** Чтение проекции сессии по ключу. */
  readonly useProjection?: <K extends string>(
    key: K,
    selector?: (value: any) => unknown,
    eq?: (a: unknown, b: unknown) => boolean,
  ) => any
  /** Чтение состояния списка сессий. */
  readonly useSessions?: (selector: (state: any) => unknown, eq?: (a: unknown, b: unknown) => boolean) => any
}

/** Запись проекции `todo-watch/last-check` (форма совпадает с CheckRecord хоста). */
export interface LastCheck {
  readonly at: number
  readonly reason: string | null
  readonly sent: boolean
  readonly active: number
  readonly completed: number
  readonly sentTotal: number
}

/** Эффективная конфигурация сторожа (здесь — только то, что показывает панель). */
export interface PanelConfig {
  readonly checkIntervalSeconds: number
  readonly staleAfterMinutes: number
}

/** Список задач одной сессии. */
export type Todos = readonly TodoItem[]

/** Время вида «3 мин назад». */
export function relativeTime(at: number, now: number, t: SlotProps['t']): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 5) return t('justNow')
  if (seconds < 90) return t('secondsAgo', { seconds })
  return t('minuteAgo', { minutes: Math.round(seconds / 60) })
}
