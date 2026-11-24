/**
 * Сторож TODO — Host-половина.
 *
 * Плашка задач над полем ввода — штатная панель DSH: она читает проекцию
 * `todos`, которую создаёт событие `todo/write`. Агент то забывает завести
 * список, то забывает обновить его. Сторож каждые 30 секунд проходит по живым
 * сессиям и сам дописывает `todo/write`:
 *
 * - списка в текущем ходе нет — создаёт его;
 * - список остался от прошлого хода — заменяет актуальным;
 * - ход закончился — отмечает задачи выполненными;
 * - список в ходе есть и свеж — не трогает.
 *
 * Формулировки даёт модель самой сессии (`ctx.llm` тем же маршрутом, что и
 * основной запрос) с лимитом частоты; если модель недоступна — работает
 * эвристика. Запись делается только при реальном изменении, чтобы не раздувать
 * лог.
 */

import { writeFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { frameInput, normalizeTodos, parsePayload, systemPrompt } from './watch/curator.js'
import { heuristicTodos } from './watch/heuristic.js'
import { planAction, sameTodos } from './watch/plan.js'
import type { NudgeRecord } from './journal.js'
import { runtimeState } from './state.js'
import { journalResponse, NUDGES_PATH, PAGE_GLOBAL } from './route.js'
import { readView } from './watch/read.js'
import type { SessionView, TodoItem } from './watch/types.js'

/** Имя плагина и строка патча. */
export const name = 'todo-watch'

/** Сервисы: реестр агентов; модель берётся мягко, чтобы работала эвристика. */
export const inject = ['agents']

/** Источник формулировок задач. */
export type CuratorMode = 'llm' | 'heuristic'

/** Конфигурация строки патча. */
export interface Config {
  /** Интервал проверки в секундах (5–600). */
  checkIntervalSeconds?: number
  /** Считать список устаревшим через столько минут (0 — не считать). */
  staleAfterMinutes?: number
  /** Источник формулировок: модель сессии или эвристика. */
  curator?: CuratorMode
  /** Явный провайдер модели (вместе с llmModel); по умолчанию — маршрут сессии. */
  llmProvider?: string
  /** Явная модель; по умолчанию — маршрут сессии. */
  llmModel?: string
  /** Не чаще одного вызова модели на сессию, секунды. */
  llmMinIntervalSeconds?: number
  /** Предел ожидания ответа модели, мс. */
  llmTimeoutMs?: number
  /** Лимит выходных токенов модели. */
  llmMaxOutputTokens?: number
  /** Сколько задач держать в списке (1–12). */
  maxItems?: number
  /** Разрешить несколько задач в работе одновременно. */
  allowParallelInProgress?: boolean
  /** Отмечать выполненное при завершении хода. */
  promoteCompletedOnTurnEnd?: boolean
  /** Обслуживать и сессии субагентов. */
  includeSubagents?: boolean
  /** Сколько последних подсказок показывать в панели (1–50). */
  historySize?: number
}

/** Схема конфигурации для строки патча. */
export const Config = Schema.object<Config>({
  checkIntervalSeconds: Schema.number().min(5).max(600).default(30),
  staleAfterMinutes: Schema.number().min(0).max(600).default(10),
  curator: Schema.string().default('llm'),
  llmProvider: Schema.string(),
  llmModel: Schema.string(),
  llmMinIntervalSeconds: Schema.number().min(10).max(3600).default(60),
  llmTimeoutMs: Schema.number().min(1000).max(120000).default(20000),
  llmMaxOutputTokens: Schema.number().min(64).max(2000).default(400),
  maxItems: Schema.number().min(1).max(12).default(7),
  allowParallelInProgress: Schema.boolean().default(true),
  promoteCompletedOnTurnEnd: Schema.boolean().default(true),
  includeSubagents: Schema.boolean().default(false),
  historySize: Schema.number().min(1).max(50).default(5),
})

/** Развёрнутые настройки с проверенными значениями. */
export interface Settings {
  readonly intervalMs: number
  readonly staleAfterMinutes: number
  readonly curator: CuratorMode
  readonly llmProvider?: string
  readonly llmModel?: string
  readonly llmMinIntervalMs: number
  readonly llmTimeoutMs: number
  readonly llmMaxOutputTokens: number
  readonly maxItems: number
  readonly allowParallel: boolean
  readonly promoteOnTurnEnd: boolean
  readonly includeSubagents: boolean
  readonly historySize: number
}

/** Целое в диапазоне. */
function int(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.min(max, Math.max(min, number))
}

/** Булево значение с умолчанием. */
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Развернуть конфигурацию строки в настройки.
 * @param config - конфигурация из патча.
 * @returns настройки с допустимыми значениями.
 */
export function resolveSettings(config: Config = {}): Settings {
  const provider = typeof config.llmProvider === 'string' && config.llmProvider !== '' ? config.llmProvider : undefined
  const model = typeof config.llmModel === 'string' && config.llmModel !== '' ? config.llmModel : undefined
  return {
    intervalMs: int(config.checkIntervalSeconds, 5, 600, 30) * 1000,
    staleAfterMinutes: int(config.staleAfterMinutes, 0, 600, 10),
    curator: config.curator === 'heuristic' ? 'heuristic' : 'llm',
    ...provider !== undefined && model !== undefined ? { llmProvider: provider, llmModel: model } : {},
    llmMinIntervalMs: int(config.llmMinIntervalSeconds, 10, 3600, 60) * 1000,
    llmTimeoutMs: int(config.llmTimeoutMs, 1000, 120_000, 20_000),
    llmMaxOutputTokens: int(config.llmMaxOutputTokens, 64, 2000, 400),
    maxItems: int(config.maxItems, 1, 12, 7),
    allowParallel: bool(config.allowParallelInProgress, true),
    promoteOnTurnEnd: bool(config.promoteCompletedOnTurnEnd, true),
    includeSubagents: bool(config.includeSubagents, false),
    historySize: int(config.historySize, 1, 50, 5),
  }
}

/**
 * Прочитать живых агентов из реестра.
 *
 * `ctx.agents` — это `AgentRegistry` из dsh-agent: у него есть `list()` и
 * `get(id)`, но нет `Symbol.iterator`, поэтому `Array.from(ctx.agents)` молча
 * даёт пустой массив. Итератор поддерживается как запасной вариант для других
 * сборок.
 * @param registry - сервис `agents`.
 * @returns живые агенты.
 */
export function listAgents(registry: unknown): any[] {
  const service = registry as any
  if (typeof service?.list === 'function') {
    const items = service.list()
    return Array.isArray(items) ? items : Array.from(items ?? [])
  }
  if (service != null && typeof service[Symbol.iterator] === 'function') {
    return Array.from(service as Iterable<any>)
  }
  return []
}

/** Живое лицо агента, которое нужно сторожу. */
interface AgentFace {
  readonly id: string
  readonly status: 'idle' | 'running'
  readonly session: any
}

/** Состояние сторожа по одной сессии (только в памяти). */
interface Track {
  /** Когда последний раз вызывали модель, мс эпохи. */
  lastLlmAt: number
  /** Идёт ли вызов модели сейчас. */
  busy: boolean
  /** Отмена вызова при выгрузке агента. */
  abort?: AbortController
}

/**
 * Запустить сторожа: единый таймер, реакция на конец хода, уборка при выгрузке.
 * @param ctx - контекст плагина.
 * @param config - конфигурация строки патча.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const settings = resolveSettings(config)
  const tracks = new Map<string, Track>()
  // Журнал, токен и отметки живут в модуле: повторная активация строки в том же
  // процессе не должна создавать вторую копию с пустым журналом.
  const shared = runtimeState()
  const journal = shared.journal
  const keyOf = (todos: readonly TodoItem[]): string => JSON.stringify(todos.map(item => [item.content, item.status]))

  /**
   * Маячок: короткая запись в файл рядом с пакетом. Нужен, чтобы отличать
   * «перезапуск не сделан, код старый» от «код новый, но сторож молчит».
   * @param note - что записать в последнюю строку.
   */
  const beacon = (note: string): void => {
    try {
      const state = {
        at: new Date().toISOString(),
        version: 2,
        note,
        intervalMs: settings.intervalMs,
        curator: settings.curator,
        agents: listAgents(ctx.agents).length,
        nudges: journal.size(),
      }
      writeFileSync(new URL('../.watch-alive.json', import.meta.url), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    } catch { /* маячок не должен мешать работе */ }
  }

  const trackOf = (id: string): Track => {
    let track = tracks.get(id)
    if (track === undefined) {
      track = { lastLlmAt: 0, busy: false }
      tracks.set(id, track)
    }
    return track
  }

  /**
   * Записать список, если он отличается от текущего, и отметить подсказку в журнале.
   * @param agent - агент сессии.
   * @param view - состояние сессии из лога.
   * @param todos - новый список.
   * @param action - что именно делает сторож.
   * @param source - кто дал формулировки.
   * @param reason - короткая причина для панели.
   */
  const writeTodos = (
    agent: AgentFace,
    view: SessionView,
    todos: readonly TodoItem[],
    action: NudgeRecord['action'],
    source: NudgeRecord['source'],
    reason: string,
  ): void => {
    if (todos.length === 0) return
    if (sameTodos(view.todos, todos)) return
    const signature = keyOf(todos)
    if (shared.lastWritten.get(agent.id) === signature) return
    agent.session.append('todo/write', {
      todos: todos.map(item => ({ content: item.content, status: item.status })),
    })
    journal.push({
      at: Date.now(),
      sessionId: agent.id,
      ...view.title === undefined ? {} : { sessionTitle: view.title },
      action,
      source,
      items: todos.length,
      reason,
    })
    shared.lastWritten.set(agent.id, signature)
    ctx.logger.info(`todo-watch: ${agent.id} — ${reason}, задач ${todos.length}`)
  }

  /**
   * Получить формулировки от модели сессии.
   * @param agent - агент.
   * @param view - состояние сессии.
   * @param signal - отмена по таймауту или выгрузке.
   * @returns список задач или null, если модель недоступна или ответила мусором.
   */
  const curateWithModel = async (
    agent: AgentFace,
    view: SessionView,
    signal: AbortSignal,
  ): Promise<TodoItem[] | null> => {
    const llm = (ctx as any).get?.('llm')
    if (llm === undefined || typeof llm.prepareCall !== 'function') return null
    const route = settings.llmProvider !== undefined && settings.llmModel !== undefined
      ? { provider: settings.llmProvider, model: settings.llmModel }
      : (() => {
        const header = typeof agent.session.requestHeader === 'function' ? agent.session.requestHeader() : undefined
        const config = header?.config
        return config === undefined
          ? null
          : { provider: String(config.provider), model: String(config.model) }
      })()
    if (route === null) return null

    const call = await llm.prepareCall({ ...route, maxTokens: settings.llmMaxOutputTokens }, signal)
    const options = {
      ...call.config,
      messages: [{ role: 'user', content: [{ type: 'text', text: frameInput(view, view.turnOpen) }] }],
      system: systemPrompt({ maxItems: settings.maxItems, allowParallel: settings.allowParallel }),
      signal,
      sessionId: agent.session.id,
    }
    let text = ''
    for await (const chunk of call.stream(options)) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      if (chunk?.type === 'finish') break
    }
    return normalizeTodos(parsePayload(text), {
      maxItems: settings.maxItems,
      allowParallel: settings.allowParallel,
    })
  }

  /** Обработать одну сессию. */
  const service = async (agent: AgentFace): Promise<void> => {
    const track = trackOf(agent.id)
    if (!settings.includeSubagents && agent.session?.header?.origin === 'subagent') return
    const view = readView(agent.session)
    if (view === null) return
    const decision = planAction(view, Date.now(), {
      staleAfterMinutes: settings.staleAfterMinutes,
      promoteOnTurnEnd: settings.promoteOnTurnEnd,
    })
    if (decision.action === 'none') return

    if (decision.action === 'promote') {
      writeTodos(agent, view, (view.todos ?? []).map(item => ({
        content: item.content,
        status: 'completed' as const,
      })), 'promote', 'none', decision.reason)
      return
    }

    const now = Date.now()
    const canUseModel = settings.curator === 'llm'
      && !track.busy
      && now - track.lastLlmAt >= settings.llmMinIntervalMs
    if (canUseModel) {
      track.busy = true
      track.lastLlmAt = now
      const controller = new AbortController()
      track.abort = controller
      const timer = setTimeout(() => controller.abort(), settings.llmTimeoutMs)
      timer.unref?.()
      try {
        const curated = await curateWithModel(agent, view, controller.signal)
        if (curated !== null) {
          writeTodos(agent, view, curated, decision.action, 'model', decision.reason)
          return
        }
      } catch (error) {
        ctx.logger.warn(`todo-watch: модель не дала список для ${agent.id}: ${String(error)}`)
      } finally {
        clearTimeout(timer)
        track.busy = false
        track.abort = undefined
        if (!tracks.has(agent.id)) return
      }
    }

    writeTodos(agent, view, heuristicTodos(view, {
      maxItems: settings.maxItems,
      allowParallel: settings.allowParallel,
    }), decision.action, 'heuristic', decision.reason)
  }

  /** Один проход по всем живым агентам. */
  const sweep = (): void => {
    const agents = listAgents(ctx.agents) as AgentFace[]
    for (const agent of agents) {
      void service(agent).catch((error: unknown) => {
        ctx.logger.warn(`todo-watch: проверка ${agent.id} не удалась: ${String(error)}`)
      })
    }
    beacon('тик')
  }

  // Единый таймер на процесс; не удерживает процесс при завершении DSH.
  ctx.effect(() => {
    const timer = setInterval(sweep, settings.intervalMs)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'todo-watch: таймер проверок')

  // Конец хода: сразу отметить выполненное, не дожидаясь тика.
  ctx.on<unknown>('session/event', (session: any, event: any) => {
    if (event?.type !== 'turn/end') return
    const agent = (listAgents(ctx.agents) as AgentFace[]).find(item => item.id === session?.id)
    if (agent === undefined) return
    try {
      const view = readView(agent.session)
      if (view === null || view.todos === null) return
      if (!view.todos.some(item => item.status !== 'completed')) return
      writeTodos(agent, view, view.todos.map(item => ({
        content: item.content,
        status: 'completed' as const,
      })), 'promote', 'none', 'ход завершён')
    } catch (error) {
      ctx.logger.warn(`todo-watch: не удалось закрыть список ${agent.id}: ${String(error)}`)
    }
  })

  // Выгруженный агент не должен оставить висящий вызов модели.
  ctx.on<{ agent: AgentFace }>('agent/disposed', (payload: any) => {
    const id = payload?.agent?.id
    if (typeof id !== 'string') return
    tracks.get(id)?.abort?.abort()
    tracks.delete(id)
  })

  // Маршрут журнала и глобал страницы; сервис webServer есть только в web-профиле.
  ctx.inject(['webServer'], (webCtx: Context) => {
    if (!shared.routeRegistered) {
      shared.routeRegistered = true
      webCtx.effect(() => (webCtx as any).webServer.register({
        kind: 'exact',
        path: NUDGES_PATH,
        resource: (request: Request) => Promise.resolve(
          journalResponse(request, journal, settings.historySize, shared.pageToken),
        ),
      }), 'todo-watch: маршрут журнала')
    }
    webCtx.on<unknown>('webserver/index-inject', (table: any[]) => {
      table.push({
        kind: 'global',
        name: PAGE_GLOBAL,
        value: { endpoint: NUDGES_PATH, token: shared.pageToken, historySize: settings.historySize },
      })
    })
  })

  beacon('старт')
  ctx.logger.info(
    `todo-watch: проверка раз в ${settings.intervalMs / 1000} с, куратор ${settings.curator}, до ${settings.maxItems} задач`,
  )
}
