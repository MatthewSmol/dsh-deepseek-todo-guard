/**
 * Сторож TODO — Host-половина.
 *
 * Каждые 30 секунд (значение меняется в config) плагин проходит по живым
 * агентам и решает по чистым правилам, нужна ли подсказка обновить список
 * TODO. Если нужна — один раз за «поколение» списка агент получает сообщение
 * через `agent.inject` (не будит простаивающую сессию), а в лог сессии
 * пишется событие `todo-watch/check`.
 *
 * Панель в браузере читает штатную проекцию `todos` (её создаёт
 * @deepseek-ai/dsh-tool-todo) и поток проверок `todo-watch/last-check`,
 * который собирает эта половина без модификации лога.
 *
 * Источник истины — лог сессии: `todo/write` пишет полный список, `turn/start`
 * начинает новый ход. Сторож ничего не хранит на диске и не дублирует `todos`.
 */

import type { Context } from '@deepseek-ai/cordis'
// Schemastery — только для Config: DSH читает схемы строки патча по этому
// экспорту. Проекции сессий требуют zod (см. checkSchema ниже).
import Schema from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import {
  DEFAULTS,
  renderText,
  reminderFor,
  resolveConfig,
  type SessionState,
  type TodoSnapshot,
  type WatcherConfig,
} from '../watch/watcher.js'
import type { ReminderReason, TodoItem } from '../watch/types.js'
import { en } from '../client/locale.js'

/** Имя плагина и строка патча. */
export const name = 'todo-watch'

/** Обязательные сервисы: реестр проекций и реестр агентов. */
export const inject = ['sessionProjections', 'agents']

/** Конфигурация строки патча (все поля необязательные, есть умолчания). */
export interface Config {
  /** Интервал проверки в секундах (5–600). */
  checkIntervalSeconds?: number
  /** Порог устаревания списка в минутах (0 — выключено). */
  staleAfterMinutes?: number
  /** Подсказывать про весь выполненный список при оставшейся работе. */
  remindAllCompleted?: boolean
  /** Подсказывать, когда новый ход идёт без списка. */
  remindMissingList?: boolean
  /** Подсказывать только простаивающему агенту. */
  remindOnlyWhenIdle?: boolean
}

/** Схема конфигурации для редактора настроек DSH и проверки строки патча. */
export const Config = Schema.object<Config>({
  checkIntervalSeconds: Schema.number().min(5).max(600).default(DEFAULTS.checkIntervalSeconds),
  staleAfterMinutes: Schema.number().min(0).max(600).default(DEFAULTS.staleAfterMinutes),
  remindAllCompleted: Schema.boolean().default(DEFAULTS.remindAllCompleted),
  remindMissingList: Schema.boolean().default(DEFAULTS.remindMissingList),
  remindOnlyWhenIdle: Schema.boolean().default(DEFAULTS.remindOnlyWhenIdle),
})

/** Ключ собственной проекции с итогом проверок. */
export const CHECK_PROJECTION_KEY = 'todo-watch/last-check'

/** Итог одной проверки: он же запись проекции `todo-watch/last-check`. */
export interface CheckRecord {
  /** Время проверки, мс эпохи. */
  readonly at: number
  /** Номер хода сессии на момент проверки. */
  readonly turn: number
  /** Причина подсказки или null, если напоминать было не о чем. */
  readonly reason: ReminderReason | null
  /** Отправлена ли подсказка агенту. */
  readonly sent: boolean
  /** Активных (не completed) задач на момент проверки. */
  readonly active: number
  /** Выполненных задач. */
  readonly completed: number
  /** Напоминаний отправлено за жизнь сессии. */
  readonly sentTotal: number
}

/**
 * Схема записи проверки для sessionProjections — строго zod: DSH проверяет
 * сохранённое состояние и клиентское значение вызовом `.parse`. Schemastery
 * здесь не подходит, хотя Config — именно Schemastery.
 */
const checkSchema: ZodType<CheckRecord> = zod.object({
  at: zod.number(),
  turn: zod.number(),
  reason: zod.union([
    zod.literal('stale'), zod.literal('all-completed'), zod.literal('no-todo'), zod.null(),
  ]),
  sent: zod.boolean(),
  active: zod.number(),
  completed: zod.number(),
  sentTotal: zod.number(),
})

/** Минимальное лицо агента, которое нужно сторожу. */
interface AgentFace {
  readonly id: string
  readonly status: 'idle' | 'running'
  readonly session: any
  readonly inbox?: { readonly nextTurn: readonly unknown[]; readonly nextStep: readonly unknown[] }
  inject(message: unknown): void
}

/** Сведения, которые сторож помнит об агенте в памяти (не в логе). */
interface AgentBook {
  /** Номер текущего хода. */
  turn: number
  /** Снимок списка на конец последнего завершённого хода. */
  snapshot: TodoSnapshot | null
  /** Записи todo_write в текущем ходе. */
  writesThisTurn: number
  /** Защита от повтора: ключ «ход:причина», о которой уже подсказали. */
  lastRemindedKey: string
  /** Сколько напоминаний отправлено. */
  sentTotal: number
  /** Когда агент стал простаивать, мс эпохи. */
  idleSince: number
  /** Предыдущий статус: нужен, чтобы заметить переход в idle. */
  lastStatus: 'idle' | 'running'
  /** Предыдущий итог проверки: пока значения равны, проекция не публикуется. */
  lastCheck: CheckRecord
}

/** Перевод для текста подсказки: словарь сторожа, запасной вариант — `en`. */
const translate = (key: string, params?: Record<string, unknown>): string => {
  const template = en[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match)
}

/**
 * Собрать сообщение-подсказку для агента.
 * @param text - готовый текст.
 * @returns сообщение пользовательского ролла с источником 'todo-watch'.
 */
function notice(text: string): unknown {
  const summary = text.length > 120 ? `${text.slice(0, 119)}…` : text
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'todo-watch', form: 'notice', summary },
  }
}

/** Прочитать номер хода и снимок списка из лога сессии. */
function readLog(session: any): { turn: number; snapshot: TodoSnapshot | null; writes: number } {
  // snapshotEvents помечен устаревшим, но это единственный синхронный читатель лога в DSH 0.2.x.
  const events: any[] = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : []
  let snapshot: TodoSnapshot | null = null
  let turn = 0
  let writes = 0
  for (const event of events) {
    if (event.type === 'turn/start') {
      turn = event.data?.turn ?? turn
      snapshot = null
      writes = 0
    } else if (event.type === 'todo/write') {
      const todos = (event.data?.todos ?? []) as TodoItem[]
      snapshot = {
        turn,
        todos: todos.map(todo => ({ content: todo.content, status: todo.status })),
        writtenAt: typeof event.time === 'number' ? event.time : Date.now(),
        seq: event.seq,
      }
      writes += 1
    }
  }
  return { turn, snapshot, writes }
}

/**
 * Запустить сторожа: подписки на агентов, гостевая проекция и единый таймер.
 * @param ctx - контекст плагина.
 * @param config - конфигурация строки патча.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const settings: WatcherConfig = resolveConfig(config)
  const books = new Map<string, AgentBook>()
  const intervalMs = settings.checkIntervalSeconds * 1000

  /** Пустой итог проверки: им инициализируется проекция. */
  const emptyCheck = (): CheckRecord => ({
    at: 0, turn: 0, reason: null, sent: false, active: 0, completed: 0, sentTotal: 0,
  })

  /** Книга агента: создаётся при первом обращении или событии agent/created. */
  const bookFor = (agent: AgentFace): AgentBook => {
    let book = books.get(agent.id)
    if (book !== undefined) return book
    book = {
      turn: 0,
      snapshot: null,
      writesThisTurn: 0,
      lastRemindedKey: '',
      sentTotal: 0,
      idleSince: Date.now(),
      lastStatus: agent.status,
      lastCheck: emptyCheck(),
    }
    books.set(agent.id, book)
    return book
  }

  // Гостевая проекция: последний итог проверки для сессии. Панель читает её
  // ключом `todo-watch/last-check` с той же формой, что CheckRecord.
  void ctx.sessionProjections.register<string, CheckRecord>({
    key: CHECK_PROJECTION_KEY,
    stateSchema: checkSchema,
    init: emptyCheck,
    apply: (state, event) => {
      if (event.type === 'todo-watch/check') {
        const data = event.data as Partial<CheckRecord> | undefined
        if (data !== undefined) {
          return {
            at: data.at ?? 0,
            turn: data.turn ?? 0,
            reason: data.reason ?? null,
            sent: data.sent === true,
            active: data.active ?? 0,
            completed: data.completed ?? 0,
            sentTotal: data.sentTotal ?? 0,
          }
        }
      }
      return state
    },
    stateVersion: 1,
  }).catch((error: unknown) => {
    ctx.logger.warn(`todo-watch: проекция ${CHECK_PROJECTION_KEY} не зарегистрирована: ${String(error)}`)
  })

  /** Один тик: проверить всех живых агентов; ошибка одной сессии не мешает остальным. */
  const tick = (): void => {
    const now = Date.now()
    for (const agent of Array.from(ctx.agents as Iterable<AgentFace>)) {
      try {
        const book = bookFor(agent)
        if (agent.status === 'idle' && book.lastStatus !== 'idle') book.idleSince = now
        book.lastStatus = agent.status
        const log = readLog(agent.session)
        book.turn = log.turn
        book.snapshot = log.snapshot
        book.writesThisTurn = log.writes
        const state: SessionState = {
          turn: book.turn,
          snapshot: book.snapshot,
          writesThisTurn: book.writesThisTurn,
          idle: agent.status === 'idle',
          pendingInput: agent.inbox?.nextTurn.length ?? 0,
          idleSince: book.idleSince,
        }
        const result = reminderFor(state, now, settings)
        const todos = book.snapshot?.todos ?? []
        const active = todos.filter(todo => todo.status !== 'completed').length
        const completed = todos.length - active
        let sent = false
        const key = `${book.turn}:${result.reminder ?? ''}`
        if (result.reminder !== null && key !== book.lastRemindedKey) {
          try {
            agent.inject(notice(renderText(result.reminder, book.snapshot, now, settings, translate)))
            sent = true
            book.sentTotal += 1
            book.lastRemindedKey = key
          } catch (error) {
            ctx.logger.warn(`todo-watch: подсказка агенту ${agent.id} не отправлена: ${String(error)}`)
          }
        }
        const record: CheckRecord = {
          at: now, turn: book.turn, reason: result.reminder, sent, active, completed, sentTotal: book.sentTotal,
        }
        book.lastCheck = record
        agent.session.append('todo-watch/check', { ...record })
      } catch (error) {
        ctx.logger.warn(`todo-watch: проверка сессии не удалась: ${String(error)}`)
      }
    }
  }

  // Книги живут ровно столько же, сколько агенты.
  ctx.on<{ agent: AgentFace }>('agent/created', (payload) => { bookFor(payload.agent) })
  ctx.on<{ agent: AgentFace }>('agent/disposed', (payload) => { books.delete(payload.agent.id) })

  // Единый таймер на все агенты, а не таймер на сессию.
  ctx.effect(() => {
    const timer = setInterval(tick, intervalMs)
    // Не удерживаем процесс при завершении DSH.
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'todo-watch: единый таймер проверок')

  ctx.logger.info(`todo-watch: проверка раз в ${settings.checkIntervalSeconds} с, порог ${settings.staleAfterMinutes} мин`)
}
