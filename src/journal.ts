/**
 * Журнал подсказок сторожа.
 *
 * Панель в сайдбаре показывает последние подсказки: кого и когда сторож
 * подтолкнул завести или обновить список задач. Источник данных — этот журнал:
 * кольцевой буфер в памяти плюс маленький файл рядом с пакетом, чтобы история
 * переживала перезапуск DSH.
 */

/** Действие, которым сторож вмешался. */
export type NudgeAction = 'create' | 'refresh' | 'promote' | 'nudge'

/** Откуда взялись формулировки задач. */
export type NudgeSource = 'model' | 'heuristic' | 'none'

/** Одна запись журнала. */
export interface NudgeRecord {
  /** Время подсказки, мс эпохи. */
  readonly at: number
  /** Полный идентификатор сессии. */
  readonly sessionId: string
  /** Название сессии из её лога, если оно уже есть. */
  readonly sessionTitle?: string
  /** Что именно сделал сторож. */
  readonly action: NudgeAction
  /** Кто дал формулировки. */
  readonly source: NudgeSource
  /** Сколько задач попало в список. */
  readonly items: number
  /** Причина из правил — короткая строка для панели. */
  readonly reason: string
}

/** Содержимое файла журнала. */
interface JournalFile {
  /** Версия формата: чужие и старые файлы игнорируются. */
  version: 1
  /** Записи, новые первыми. */
  entries: NudgeRecord[]
}

/** Сколько записей хранить в файле и в памяти. */
export const MAX_ENTRIES = 50

/** Проверить, что значение похоже на запись журнала. */
function isRecord(value: unknown): value is NudgeRecord {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return typeof item.at === 'number' && Number.isFinite(item.at)
    && typeof item.sessionId === 'string' && item.sessionId !== ''
    && (item.action === 'create' || item.action === 'refresh' || item.action === 'promote' || item.action === 'nudge')
    && (item.source === 'model' || item.source === 'heuristic' || item.source === 'none')
    && typeof item.items === 'number'
    && typeof item.reason === 'string'
    && (item.sessionTitle === undefined || typeof item.sessionTitle === 'string')
}

/**
 * Разобрать файл журнала.
 *
 * Битый JSON, чужая версия и отдельные негодные записи отбрасываются: журнал —
 * вспомогательные данные, он не должен мешать запуску плагина.
 * @param text - содержимое файла.
 * @returns записи, новые первыми.
 */
export function parseJournal(text: string): NudgeRecord[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  if (typeof data !== 'object' || data === null) return []
  const file = data as Partial<JournalFile>
  if (file.version !== 1 || !Array.isArray(file.entries)) return []
  return file.entries.filter(isRecord).slice(0, MAX_ENTRIES)
}

/**
 * Сериализовать журнал для файла.
 * @param entries - записи.
 * @returns JSON-текст с завершающим переводом строки.
 */
export function serializeJournal(entries: readonly NudgeRecord[]): string {
  const file: JournalFile = { version: 1, entries: entries.slice(0, MAX_ENTRIES) as NudgeRecord[] }
  return `${JSON.stringify(file, null, 2)}\n`
}

/** Хранилище записей. */
export interface Journal {
  /** Добавить запись, отбросив самую старую при переполнении. */
  push(record: NudgeRecord): void
  /** Последние записи, новые первыми. */
  list(limit: number): NudgeRecord[]
  /** Сколько записей всего. */
  size(): number
}

/**
 * Создать журнал.
 * @param options - пределы и обратные вызовы хранения.
 * @returns журнал.
 */
export function createJournal(options: {
  /** Сколько записей хранить (не больше `MAX_ENTRIES`). */
  capacity?: number
  /** Начальные записи (обычно из файла). */
  initial?: readonly NudgeRecord[]
  /** Вызывается после каждого изменения — для записи файла. */
  onChange?: (entries: readonly NudgeRecord[]) => void
} = {}): Journal {
  const capacity = Math.min(MAX_ENTRIES, Math.max(1, options.capacity ?? MAX_ENTRIES))
  const entries: NudgeRecord[] = (options.initial ?? []).filter(isRecord).slice(0, capacity)
  const notify = (): void => {
    try {
      options.onChange?.(entries)
    } catch {
      // Ошибка файла не должна ломать подсказку.
    }
  }
  return {
    push(record) {
      entries.unshift(record)
      if (entries.length > capacity) entries.length = capacity
      notify()
    },
    list(limit) {
      const count = Math.max(0, Math.min(entries.length, Math.trunc(limit)))
      return entries.slice(0, count)
    },
    size() {
      return entries.length
    },
  }
}

/**
 * Короткая подпись сессии для панели: название, иначе первые 8 символов id.
 * @param record - запись журнала.
 * @returns подпись.
 */
export function sessionLabel(record: NudgeRecord): string {
  const title = record.sessionTitle?.trim()
  if (title !== undefined && title !== '') return title
  return record.sessionId.slice(0, 8)
}
