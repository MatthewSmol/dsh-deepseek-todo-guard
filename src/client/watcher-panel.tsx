/**
 * Панель «Сторож TODO» в главном окне DSH.
 *
 * Показывает список задач текущей сессии (проекция `todos`), итог последней
 * проверки (своя проекция `todo-watch/last-check`) и параметры сторожа.
 * Стили приходят строкой из сборки Vite и инжектируются один раз.
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { TodoItem } from '../watch/types.js'
import { relativeTime, type LastCheck, type PanelConfig, type SlotProps, type Todos } from './panel-types.js'

/** Свойства панели. */
export interface WatcherPanelProps extends SlotProps {
  /** Строка CSS из сборки Vite. */
  readonly css: string
  /** Эффективная конфигурация сторожа. */
  readonly config: PanelConfig
}

const EMPTY_TODOS: Todos = []
const EMPTY_CHECK: LastCheck | null = null

/** Показ относительного времени без своего таймера: обновляется при новых данных. */
function stamp(at: number, t: SlotProps['t']): string {
  return relativeTime(at, Date.now(), t)
}

/** Класс строки задачи по статусу. */
function statusClass(status: TodoItem['status']): string {
  return `todo-watch-item todo-watch-item--${status.replace('_', '-')}`
}

/** Значок статуса: кружок, полукруг или галочка. */
function StatusIcon({ status }: { status: TodoItem['status'] }): JSX.Element {
  if (status === 'completed') {
    return (
      <svg className="todo-watch-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'in_progress') {
    return (
      <svg className="todo-watch-icon todo-watch-icon--active" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 2.8a5.2 5.2 0 0 1 0 10.4z" fill="currentColor" opacity="0.55" />
      </svg>
    )
  }
  return (
    <svg className="todo-watch-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2.4" />
    </svg>
  )
}

/** Панель сторожа. */
export function WatcherPanel({ t, sessionId, useProjection, css, config }: WatcherPanelProps): JSX.Element {
  // Стили — на время жизни компонента: при размонтировании снимаются.
  useEffect(() => {
    const element = document.createElement('style')
    element.setAttribute('data-todo-watch', '')
    element.textContent = css
    document.head.appendChild(element)
    return () => { element.remove() }
  }, [css])

  const hasSession = sessionId !== undefined && useProjection !== undefined
  const todos: Todos = hasSession ? useProjection('todos') ?? EMPTY_TODOS : EMPTY_TODOS
  const lastCheck: LastCheck | null = hasSession ? useProjection('todo-watch/last-check') ?? EMPTY_CHECK : EMPTY_CHECK

  const active = todos.filter(todo => todo.status !== 'completed').length
  const done = todos.length - active
  const percent = todos.length === 0 ? 0 : Math.round((done / todos.length) * 100)
  const staleLabel = config.staleAfterMinutes > 0
    ? t('staleAfter', { minutes: config.staleAfterMinutes })
    : t('staleOff')

  return (
    <div className="todo-watch-root">
      <header className="todo-watch-header">
        <div className="todo-watch-heading">
          <h1 className="todo-watch-title">{t('title')}</h1>
          <p className="todo-watch-subtitle">{t('subtitle')}</p>
        </div>
        <div className="todo-watch-meta">
          <span className="todo-watch-chip">{t('interval', { seconds: config.checkIntervalSeconds })}</span>
          <span className="todo-watch-chip">{staleLabel}</span>
          <span className="todo-watch-dot" aria-hidden="true" />
          <span className="todo-watch-live">{t('status.live')}</span>
        </div>
      </header>

      <section className="todo-watch-card">
        <div className="todo-watch-card-head">
          <h2 className="todo-watch-card-title">{t('todos.title')}</h2>
          {todos.length > 0 && (
            <span className="todo-watch-counter">{t('todos.progress', { done, total: todos.length })}</span>
          )}
        </div>
        <div className="todo-watch-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span className="todo-watch-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        {todos.length === 0
          ? <p className="todo-watch-empty">{hasSession ? t('todos.empty') : t('todos.noSession')}</p>
          : (
            <ul className="todo-watch-list">
              {todos.map(todo => (
                <li key={todo.content} className={statusClass(todo.status)}>
                  <StatusIcon status={todo.status} />
                  <span className="todo-watch-item-text">{todo.content}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="todo-watch-card">
        <div className="todo-watch-card-head">
          <h2 className="todo-watch-card-title">{t('checks.title')}</h2>
        </div>
        {lastCheck === null
          ? <p className="todo-watch-empty">{t('checks.never')}</p>
          : (
            <dl className="todo-watch-dl">
              <dt>{t('checks.at')}</dt>
              <dd>{stamp(lastCheck.at, t)}</dd>
              <dt>{t('checks.reason')}</dt>
              <dd>{lastCheck.reason === null ? t('checks.none') : t(`reason.${lastCheck.reason}`)}</dd>
              <dt>{t('checks.sent')}</dt>
              <dd>{lastCheck.sentTotal}</dd>
            </dl>
          )}
      </section>
    </div>
  )
}
