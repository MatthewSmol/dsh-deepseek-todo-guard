/**
 * Объявления внешних пакетов DSH для сборки.
 *
 * Пакеты резолвятся из установки DSH, а не из node_modules плагина, поэтому в
 * проекте описана только используемая поверхность. Файл — глобальный
 * (.d.ts без импортов и экспортов).
 */

declare module '@deepseek-ai/cordis' {
  /** Контекст плагина: подписки, эффекты, журнал и сервисы. */
  interface Context {
    /** Реестр живых агентов процесса. */
    agents: Iterable<unknown>
    /** Журнал плагина. */
    logger: {
      warn(message: string): void
      error(message: string): void
      info(message: string): void
    }
    /**
     * Подписка на событие DSH; обработчик получает аргументы события.
     * @param name - имя события.
     * @param listener - обработчик.
     * @returns функция снятия подписки.
     */
    on<T>(name: string, listener: (...payload: any[]) => void): () => void
    /**
     * Ресурс, живущий вместе с контекстом плагина.
     * @param create - создаёт ресурс и возвращает его очистку.
     * @param label - метка для диагностики.
     */
    effect(create: () => () => void, label?: string): void
    /** Сервис по имени (возвращает undefined, если его нет). */
    get(name: string): any
  }
}

declare module '@deepseek-ai/schemastery' {
  /** Поле схемы Schemastery в минимальном объёме. */
  interface Field<T> {
    min(value: number): Field<T>
    max(value: number): Field<T>
    default(value: T): Field<T>
  }

  /** Значение-фабрика схем: экспорт schemastery по умолчанию. */
  interface Schema {
    /** Поле в любом виде. */
    any(): Field<unknown>
    /** Числовое поле. */
    number(): Field<number>
    /** Булево поле. */
    boolean(): Field<boolean>
    /** Строковое поле. */
    string(): Field<string>
    /**
     * Объект из полей.
     * @param shape - описание полей.
     */
    object<T>(shape: Record<string, unknown>): (input?: unknown) => T
  }

  /** Экспорт по умолчанию. */
  const SchemaFactory: Schema
  export default SchemaFactory
}
