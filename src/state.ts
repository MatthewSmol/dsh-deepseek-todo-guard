/**
 * Состояние сторожа, общее на процесс.
 *
 * Cordis может перезагрузить строку плагина, не перезапуская сервер: новый
 * вызов `apply` в том же процессе получает новый контекст. Если журнал и токен
 * создавать внутри `apply`, получаются две независимые копии: одна пишет
 * подсказки, другая обслуживает маршрут панели и отдаёт пустой список.
 *
 * Поэтому журнал, токен страницы и отметка о регистрации маршрута живут в
 * модуле: все активации плагина в процессе делят одно состояние.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createJournal, parseJournal, serializeJournal, type Journal, type NudgeRecord } from './journal.js'

/** Общее состояние процесса. */
export interface RuntimeState {
  /** Журнал подсказок; один на процесс. */
  readonly journal: Journal
  /** Одноразовый токен страницы. */
  readonly pageToken: string
  /** Адрес файла журнала. */
  readonly journalPath: URL
  /** Зарегистрирован ли уже маршрут панели. */
  routeRegistered: boolean
  /** Подписи последних записей по сессиям: защита от дублей при двух таймерах. */
  readonly lastWritten: Map<string, string>
  /** Итог последней сверки записи с проекцией `todos` — попадает в маячок. */
  projection: 'ok' | 'missing' | 'pending'
}

/** Единственный экземпляр состояния. */
let state: RuntimeState | undefined

/** Прочитать журнал с диска, если он есть. */
function loadJournal(path: URL): NudgeRecord[] {
  try {
    return parseJournal(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

/**
 * Получить состояние процесса, создав его при первом обращении.
 * @returns общее состояние.
 */
export function runtimeState(): RuntimeState {
  if (state !== undefined) return state
  const journalPath = new URL('../.nudges.json', import.meta.url)
  const journal = createJournal({
    initial: loadJournal(journalPath),
    onChange: (entries) => {
      try {
        writeFileSync(journalPath, serializeJournal(entries), 'utf8')
      } catch { /* журнал не должен мешать подсказкам */ }
    },
  })
  state = {
    journal,
    pageToken: randomUUID(),
    journalPath,
    routeRegistered: false,
    lastWritten: new Map(),
    projection: 'pending',
  }
  return state
}

/** Сбросить состояние и файлы — только для тестов. */
export function resetRuntimeStateForTests(): void {
  state = undefined
  try {
    rmSync(new URL('../.nudges.json', import.meta.url), { force: true })
    rmSync(new URL('../.watch-alive.json', import.meta.url), { force: true })
  } catch { /* тестовое окружение может не иметь файлов */ }
}
