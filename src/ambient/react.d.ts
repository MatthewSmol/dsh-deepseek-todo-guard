/**
 * Минимальные объявления React для сборки клиентской половины.
 *
 * @types/react в проект не тянем: клиенту нужны только `createElement` и две
 * хука. Модуль объявлен глобально, поэтому файл подходит и host-сборке (она его
 * не использует), и клиентской.
 */

declare module 'react' {
  /** Узел React (нам достаточно непрозрачного значения). */
  type ReactNode = unknown

  /**
   * Создать элемент без JSX.
   * @param type - тег или компонент.
   * @param props - свойства.
   * @param children - дети.
   */
  export function createElement(type: any, props?: any, ...children: any[]): any

  /** Локальное состояние компонента. */
  export function useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void]

  /** Побочный эффект с очисткой. */
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void

  /** Кэшированное значение. */
  export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T
}
