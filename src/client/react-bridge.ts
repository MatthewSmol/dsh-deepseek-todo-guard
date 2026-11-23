/**
 * Мост к React из таблицы модулей DSH.
 *
 * Браузерная половина получает React только из загрузчика модулей:
 * `window.__ModuleLoader__.load({ factory(require) })` отдаёт `require`, и
 * `require('react')` возвращает тот же React, что у страницы. Второй React в
 * бандле сломал бы хуки, поэтому вместо импорта пакета Vite подменяет `react`,
 * `react/jsx-runtime` и `react/jsx-dev-runtime` этим файлом, а сама ссылка на
 * React кладётся в `globalThis.__todoWatchReact` в момент загрузки фабрики.
 *
 * Типы берутся из @types/react как обычно: подмена действует только в сборке.
 */

/** React страницы; бросает, если мост ещё не установлен. */
function runtime(): any {
  const React = (globalThis as any).__todoWatchReact
  if (React === undefined) {
    throw new Error('todo-watch: React не получен из загрузчика модулей DSH')
  }
  return React
}

/**
 * Обёртка над React.createElement.
 * @param args - те же аргументы, что у React.createElement.
 * @returns созданный элемент.
 */
export function createElement(...args: unknown[]): unknown {
  return runtime().createElement(...args)
}

/**
 * Обёртка над React.useEffect.
 * @param args - те же аргументы, что у React.useEffect.
 * @returns результат вызова.
 */
export function useEffect(...args: unknown[]): unknown {
  return runtime().useEffect(...args)
}

/**
 * Фабрика элемента автоматического JSX-рантайма (jsx).
 * @param type - тип элемента.
 * @param props - свойства.
 * @param key - необязательный ключ.
 * @returns созданный элемент.
 */
export function jsx(type: unknown, props: unknown, key?: unknown): unknown {
  return runtime().createElement(type, key === undefined ? props : { ...(props as object), key })
}

/** Фабрика нескольких детей автоматического JSX-рантайма. */
export const jsxs = jsx

/** Фабрика для dev-режима: в собранном бандле совпадает с jsx. */
export const jsxDEV = jsx

/** Фрагмент: фрагменты в панели не используются, значение — заглушка. */
export const Fragment: unique symbol = Symbol.for('todo-watch.fragment')

/** Экспорт по умолчанию: `import React from 'react'` в коде плагина. */
const bridge = { createElement, useEffect, Fragment }
export default bridge
