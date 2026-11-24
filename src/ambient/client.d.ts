/**
 * Объявления клиентской поверхности, которую видит плагин.
 *
 * Пакеты DSH резолвятся из установки, а не из node_modules плагина, поэтому в
 * проекте описано только используемое: слоты, локали и минимум React.
 */

declare module 'react' {
  /** Узел React (нам достаточно непрозрачного значения). */
  type ReactNode = unknown

  /** Разрешённая пара «значение и сеттер» из `useState`. */
  type StateHook<T> = [T, (next: T | ((previous: T) => T)) => void]

  /**
   * Создать элемент без JSX.
   * @param type - тег или компонент.
   * @param props - свойства.
   * @param children - дети.
   */
  export function createElement(type: any, props?: any, ...children: any[]): any

  /** Локальное состояние компонента. */
  export function useState<T>(initial: T | (() => T)): StateHook<T>

  /** Побочный эффект с очисткой. */
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void

  /** Кэшированное значение. */
  export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T
}

declare module '@deepseek-ai/cordis' {
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
  }

  /** Клиентский контекст плагина. */
  interface Context {
    /** Слоты интерфейса. */
    slots: {
      /**
       * Зарегистрировать компонент в слоте, когда слот появится.
       * @param name - имя слота.
       * @param create - создаёт регистрацию; результат — её очистка.
       */
      inject(name: string, create: () => () => void): () => void
      /**
       * Зарегистрировать компонент.
       * @param registration - имя слота, ключ и параметры.
       * @param component - компонент слота.
       * @returns функция снятия регистрации.
       */
      register(registration: SlotRegistration, component: (props: any) => any): () => void
    }
    /** Локали интерфейса. */
    locale: {
      /**
       * Зарегистрировать словарь.
       * @param namespace - имя пространства.
       * @param dictionaries - словари по языкам.
       */
      register(namespace: string, dictionaries: Record<string, Record<string, string>>): void
      /**
       * Привязать переводчик к пространству.
       * @param namespace - имя пространства.
       * @returns функция перевода.
       */
      bind(namespace: string): (key: string) => string
    }
    /**
     * Ресурс, живущий вместе с плагином.
     * @param create - создаёт ресурс и возвращает очистку.
     * @param label - метка для диагностики.
     */
    effect(create: () => () => void, label?: string): void
    /** Журнал клиента. */
    logger: {
      warn(message: string): void
      info(message: string): void
    }
  }
}
