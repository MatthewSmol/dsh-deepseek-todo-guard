/**
 * Клиентская половина «Сторожа TODO»: пункт в левом сайдбаре и панель журнала.
 *
 * Панель показывает последние подсказки сторожа — кого и когда он подтолкнул
 * завести или обновить список задач. Данные отдаёт маршрут хоста
 * `/todo-watch/nudges`; адрес и одноразовый токен страница получает из глобала
 * `__TODO_WATCH__`, который хост подставляет в HTML.
 */

import { createElement, useEffect, useState } from 'react'

/** Параметры одной регистрации в слоте. */
interface SlotRegistration {
  /** Имя слота. */
  name: string
  /** Ключ или id ячейки. */
  id?: string
  /** Ключ для ключевого слота. */
  key?: string
  /** Порядок в списке. */
  order?: number
  /** Пространство локали для `t` в компоненте. */
  locale?: string
  /** Подпись пункта: thunk перечитывается при каждой отрисовке. */
  label?: () => string
}

/** Клиентский контекст плагина (своё описание: host-типы сюда не подмешиваются). */
interface ClientContext {
  /** Слоты интерфейса. */
  slots: {
    inject(name: string, create: () => () => void): () => void
    register(registration: SlotRegistration, component: (props: any) => any): () => void
  }
  /** Локали интерфейса. */
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): (key: string) => string
  }
  /** Ресурс, живущий вместе с плагином. */
  effect(create: () => () => void, label?: string): void
}

/** Имя пространства локали. */
const NS = 'todo-watch'

/** Идентификатор пункта сайдбара и ключ панели — один и тот же. */
const PANEL_ID = 'todo-watch-log'

/** Как часто панель перечитывает журнал, мс. */
const POLL_MS = 5000

/** Словари панели. */
const DICTIONARIES = {
  ru: {
    title: 'Сторож TODO',
    subtitle: 'последние подсказки',
    updated: 'обновлено',
    empty: 'Пока никого не подгонял',
    offline: 'Нет связи со сторожем',
    offlineHint: 'Обновите страницу после перезапуска dsh web',
    create: 'создал список',
    refresh: 'обновил',
    promote: 'закрыл ход',
    nudge: 'напомнил агенту',
    model: 'модель',
    heuristic: 'эвристика',
    none: '—',
    items: 'задач',
  },
  en: {
    title: 'TODO watcher',
    subtitle: 'latest nudges',
    updated: 'updated',
    empty: 'No nudges yet',
    offline: 'No connection to the watcher',
    offlineHint: 'Reload the page after restarting dsh web',
    create: 'created list',
    refresh: 'refreshed',
    promote: 'closed turn',
    nudge: 'nudged agent',
    model: 'model',
    heuristic: 'heuristic',
    none: '—',
    items: 'items',
  },
  zh: {
    title: 'TODO 守护',
    subtitle: '最近的提醒',
    updated: '更新于',
    empty: '还没有提醒过',
    offline: '无法连接到守护进程',
    offlineHint: '重启 dsh web 后请刷新页面',
    create: '创建清单',
    refresh: '更新清单',
    promote: '结束回合',
    nudge: '提醒了代理',
    model: '模型',
    heuristic: '启发式',
    none: '—',
    items: '项',
  },
} as const

/** Запись журнала, как её отдаёт хост. */
interface NudgeRecord {
  readonly at: number
  readonly sessionId: string
  readonly sessionTitle?: string
  readonly action: 'create' | 'refresh' | 'promote'
  readonly source: 'model' | 'heuristic' | 'none'
  readonly items: number
  readonly reason: string
}

/** Тело ответа маршрута журнала. */
interface NudgePayload {
  readonly version: 1
  readonly at: number
  readonly historySize: number
  readonly entries: NudgeRecord[]
}

/** Состояние панели. */
interface PanelState {
  /** Загрузка идёт впервые. */
  readonly loading: boolean
  /** Есть связь с хостом. */
  readonly online: boolean
  /** Последний успешный ответ. */
  readonly payload: NudgePayload | null
}

/** Адрес и токен, которые хост вписал в страницу. */
interface PageBinding {
  readonly endpoint: string
  readonly token: string
  readonly historySize?: number
}

/**
 * Прочитать привязку страницы.
 * @returns привязка или null, если хост её не вставил.
 */
function pageBinding(): PageBinding | null {
  const value = (globalThis as any).__TODO_WATCH__
  if (typeof value !== 'object' || value === null) return null
  const { endpoint, token } = value as Record<string, unknown>
  if (typeof endpoint !== 'string' || endpoint === '' || typeof token !== 'string' || token === '') return null
  return value as PageBinding
}

/** Время в формате ЧЧ:ММ:СС по локальным часам. */
function clockOf(at: number): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Сколько секунд прошло с момента ответа. */
function secondsAgo(at: number, now: number): number {
  return Math.max(0, Math.round((now - at) / 1000))
}

/** Подпись сессии: название, иначе короткий id. */
function sessionOf(record: NudgeRecord): string {
  const title = record.sessionTitle?.trim()
  return title !== undefined && title !== '' ? title : record.sessionId.slice(0, 8)
}

/** Стили панели: вставляются один раз при монтировании. */
const STYLE_ID = 'todo-watch-log-styles'

/** Текст стилей. */
const STYLES = `
.todo-watch-log { display: flex; flex-direction: column; gap: 12px; padding: 20px 24px; height: 100%; overflow: auto; }
.todo-watch-log__head { display: flex; flex-direction: column; gap: 4px; }
.todo-watch-log__title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-text-primary); }
.todo-watch-log__sub { font-size: 12px; color: var(--dsw-alias-text-tertiary); }
.todo-watch-log__list { display: flex; flex-direction: column; gap: 8px; }
.todo-watch-log__row { display: grid; grid-template-columns: 64px 1fr; gap: 4px 12px; padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-subtle); border-radius: 10px; background: var(--dsw-alias-bg-elevated); }
.todo-watch-log__time { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--dsw-alias-text-tertiary); }
.todo-watch-log__main { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; font-size: 13px; color: var(--dsw-alias-text-primary); }
.todo-watch-log__session { font-weight: 600; }
.todo-watch-log__tag { font-size: 11px; padding: 1px 6px; border-radius: 999px;
  background: var(--dsw-alias-bg-subtle); color: var(--dsw-alias-text-secondary); }
.todo-watch-log__reason { grid-column: 2; font-size: 12px; color: var(--dsw-alias-text-tertiary); }
.todo-watch-log__note { font-size: 13px; color: var(--dsw-alias-text-secondary); }
`

/**
 * Текст-подсказка панели, когда записей нет или нет связи.
 * @param state - загрузка, связь и число записей.
 * @param t - переводчик панели.
 * @returns текст или null, если показывать нечего.
 */
export function panelNote(
  state: { loading: boolean; online: boolean; items: number },
  t: (key: string) => string,
): string | null {
  if (state.loading) return '…'
  if (!state.online) return `${t('offline')}. ${t('offlineHint')}`
  return state.items === 0 ? t('empty') : null
}

/**
 * Панель журнала: опрашивает хост и рисует последние подсказки.
 * @param props - слот отдаёт `t` для локали панели.
 * @returns разметку панели.
 */
export function JournalPanel(props: { t?: (key: string) => string }): any {
  const t = (key: string): string => props.t?.(key) ?? key
  const [state, setState] = useState<PanelState>({ loading: true, online: false, payload: null })

  useEffect(() => {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLES
    if (document.getElementById(STYLE_ID) === null) document.head.appendChild(style)
    return () => { document.getElementById(STYLE_ID)?.remove() }
  }, [])

  useEffect(() => {
    let stopped = false
    const binding = pageBinding()
    const read = async (): Promise<void> => {
      if (binding === null) {
        if (!stopped) setState({ loading: false, online: false, payload: null })
        return
      }
      try {
        const response = await fetch(binding.endpoint, {
          headers: { 'x-todo-watch-token': binding.token },
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json() as NudgePayload
        if (!stopped) setState({ loading: false, online: true, payload })
      } catch {
        if (!stopped) setState(previous => ({ loading: false, online: false, payload: previous.payload }))
      }
    }
    void read()
    const timer = setInterval(() => { void read() }, POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [])

  const { loading, online, payload } = state
  const rows = payload?.entries ?? []

  return createElement('section', { className: 'todo-watch-log' },
    createElement('header', { className: 'todo-watch-log__head' },
      createElement('div', { className: 'todo-watch-log__title' }, t('title')),
      createElement('div', { className: 'todo-watch-log__sub' },
        payload === null
          ? t('subtitle')
          : `${t('subtitle')} · ${payload.entries.length}/${payload.historySize ?? rows.length} · ${t('updated')} ${secondsAgo(payload.at, Date.now())} с`),
    ),
    panelNote({ loading, online, items: rows.length }, t) !== null
      ? createElement('div', { className: 'todo-watch-log__note' },
        panelNote({ loading, online, items: rows.length }, t))
      : null,
    rows.length === 0
      ? null
      : createElement('div', { className: 'todo-watch-log__list' },
        ...rows.map(record => createElement('article', { key: `${record.sessionId}-${record.at}`, className: 'todo-watch-log__row' },
          createElement('span', { className: 'todo-watch-log__time' }, clockOf(record.at)),
          createElement('span', { className: 'todo-watch-log__main' },
            createElement('span', { className: 'todo-watch-log__session' }, sessionOf(record)),
            createElement('span', null, t(record.action)),
            createElement('span', { className: 'todo-watch-log__tag' }, t(record.source)),
            createElement('span', { className: 'todo-watch-log__tag' }, `${record.items} ${t('items')}`),
          ),
          createElement('span', { className: 'todo-watch-log__reason' }, record.reason),
        )),
      ),
  )
}

/**
 * Иконка пункта сайдбара: чеклист с часами.
 * @param props - владелец передаёт размер стороны.
 * @returns разметку иконки.
 */
export function JournalIcon(props: { size?: number; active?: boolean }): any {
  const size = typeof props.size === 'number' ? props.size : 18
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
  createElement('path', { d: 'M4 6.5 6 8.5 9 5' }),
  createElement('path', { d: 'M11 7h9' }),
  createElement('path', { d: 'M4 13.5 6 15.5 9 12' }),
  createElement('path', { d: 'M11 14h6' }),
  createElement('circle', { cx: 17, cy: 18, r: 3.2 }),
  createElement('path', { d: 'M17 16.4V18l1.2.8' }),
  )
}

/**
 * Зарегистрировать пункт в сайдбаре и панель журнала.
 * @param ctx - клиентский контекст плагина.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, DICTIONARIES as unknown as Record<string, Record<string, string>>), 'todo-watch: словари')
  // Переводы для подписи пункта: thunk читается при каждой отрисовке, поэтому
  // текст следует за активным языком без повторной регистрации.
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: PANEL_ID, locale: NS },
    JournalPanel,
  )), 'todo-watch: панель журнала')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 45,
    locale: NS,
    label: () => t('title'),
  }, JournalIcon)), 'todo-watch: пункт сайдбара')
}

/** Обязательные клиентские сервисы. */
export const inject = ['slots', 'locale']
