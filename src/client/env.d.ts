/**
 * Объявления для браузерной сборки: загрузчик модулей DSH, React, CSS-строки
 * и минимальное лицо Client-контекста, которое использует плагин.
 */

declare global {
  interface Window {
    /** Таблица модулей DSH: плагин отдаёт браузерную половину фабрикой. */
    __ModuleLoader__: {
      load(definition: { id: string; factory: (require: (id: string) => unknown) => unknown }): void
    }
  }
}

declare module 'react/jsx-runtime' {
  export const jsx: (type: unknown, props: unknown, key?: unknown) => unknown
  export const jsxs: (type: unknown, props: unknown, key?: unknown) => unknown
  export const Fragment: unique symbol
}

/** Обращение к сервисам Client-контекста DSH (типы в проекте не видны). */
export interface ClientContext {
  /** Общий клиентский контекст: сервисы и скопы. */
  readonly [key: string]: any
  /** Ресурс, живущий с плагином. */
  effect(create: () => () => void, label?: string): void
  /** Сервис слотов: подписка и регистрация. */
  slots: {
    inject(key: string, callback: () => () => void): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  /** Сервис локализации. */
  locale: {
    register(namespace: string, dicts: Record<string, Record<string, string>>): () => void
    bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
  }
}
