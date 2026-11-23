/**
 * Браузерная половина «Сторожа TODO».
 *
 * Регистрирует пункт «Сторож TODO» в левом сайдбаре вместе с главной панелью.
 * Иконка рисуется через createElement: React приходит только через
 * require('react') из таблицы модулей загрузчика. CSS уже встроен в бандл
 * строкой, словари отдаются сервису локализации.
 */

import { createElement } from 'react'
import css from './styles.css?inline'
import { WatcherPanel } from './watcher-panel.js'
import { en, ru, zh } from './locale.js'

const NS = 'todo-watch'
const PANEL_ID = 'todo-watch'

/** Эффективная конфигурация по умолчанию: её показывает панель в отсутствие настройки. */
const DEFAULT_PANEL_CONFIG = { checkIntervalSeconds: 30, staleAfterMinutes: 10 }

/** Иконка пункта сайдбара: чеклист с кружком часов. */
function Icon({ size = 16, active = false }: { size?: number; active?: boolean }): unknown {
  const color = active ? 'var(--dsw-alias-brand-primary)' : 'currentColor'
  return createElement(
    'svg',
    { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block', color } },
    createElement('path', {
      d: 'M4 6h8M4 12h6M4 18h7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
    }),
    createElement('path', {
      d: 'M17.5 8.5a5 5 0 1 1-3.2 8.9', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
    }),
    createElement('path', {
      d: 'M17.5 10.5V14l2.2 1.4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
    }),
  )
}

/** Панель с подставленными CSS и словарём. */
function makePanel(t: (key: string, params?: Record<string, unknown>) => string): (props: any) => unknown {
  return (props: any) => createElement(WatcherPanel, { ...props, t, css, config: DEFAULT_PANEL_CONFIG })
}

/**
 * Подключить плагин к клиенту DSH.
 * @param ctx - клиентский контекст плагина.
 */
function apply(ctx: any): void {
  // Регистрация идёт шагами с метками: если браузерная половина падает,
  // в консоли DSH видно, на каком шаге, а не просто «модуль не загрузился».
  try {
    console.log('[todo-watch] словари')
    ctx.effect(() => ctx.locale.register(NS, { ru, en, zh }), 'todo-watch: словари')
  } catch (error) {
    console.error('[todo-watch] словари не зарегистрированы', error)
  }
  const t = ctx.locale.bind(NS) as (key: string, params?: Record<string, unknown>) => string
  const Panel = makePanel(t)
  console.log('[todo-watch] регистрирую панель и пункт сайдбара')

  // Панель в главном окне: тот же ключ, что у пункта сайдбара.
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, Panel))

  // Пункт в левом сайдбаре: порядок 45 — после штатных панелей.
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 45, locale: NS, label: () => t('nav') },
      Icon,
    ))
}

window.__ModuleLoader__.load({
  id: '@local/dsh-todo-watch',
  factory() {
    return { inject: ['slots', 'locale'], apply }
  },
})
