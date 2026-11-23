/**
 * Объявления внешних пакетов DSH для сборки.
 *
 * Пакеты резолвятся из установки DSH, а не из node_modules плагина, поэтому
 * в проекте описана только используемая поверхность. Файл — глобальный
 * (.d.ts без импортов и экспортов), иначе дополнения модулей не сработают.
 */

declare module '@deepseek-ai/cordis' {
  /** Реестр проекций сессий, который предоставляет DSH. */
  interface SessionProjectionRegistry {
    /**
     * Зарегистрировать гостевую единицу проекции на фибер текущего контекста.
     * @param definition - ключ, схема, чистые функции и версия состояния.
     */
    register<K extends string, S>(definition: ProjectionDefinition<K, S>): Promise<ProjectionHandle<S>>
  }

  /** Определение проекции в объёме, который использует плагин. */
  interface ProjectionDefinition<K extends string, S> {
    /** Ключ проекции. */
    key: K
    /** Проверка сохранённого состояния перед продолжением свёртки. */
    stateSchema: unknown
    /** Начальное состояние. */
    init(): S
    /**
     * Чистая свёртка одного события лога.
     * @param state - состояние до события.
     * @param event - событие лога сессии.
     */
    apply(state: NoInfer<S>, event: ProjectionEvent): NoInfer<S>
    /** Клиентский вид значения: схема и функция показа. */
    wire?: { viewSchema: unknown; view(state: NoInfer<S>): unknown; summary?: boolean }
    /** Версия состояния для кэша. */
    stateVersion: number
  }

  /** Ручка проекции после регистрации. */
  interface ProjectionHandle<S> {
    /**
     * Текущее состояние для сессии.
     * @param session - сессия.
     */
    stateOf(session: { readonly id: string }): S
  }

  /** Событие лога сессии в объёме, нужном свёртке. */
  interface ProjectionEvent {
    readonly type: string
    readonly seq: number
    readonly time?: number
    readonly data?: unknown
  }

  /** Реестр инструментов агента. */
  interface ToolsService {
    /**
     * Зарегистрировать инструмент.
     * @param definition - имя, описание, параметры, схема результата и execute.
     */
    register(definition: unknown): () => void
  }

  /** Контекст плагина: подписки, эффекты и сервисы, которые берёт плагин. */
  interface Context {
    /** Реестр инструментов. */
    tools: ToolsService
    /** Host-сервис проекций сессий. */
    sessionProjections: SessionProjectionRegistry
    /** Реестр живых агентов процесса. */
    agents: Iterable<unknown>
    /** Журнал плагина. */
    logger: {
      warn(message: string): void
      error(message: string): void
      info(message: string): void
    }
    /**
     * Подписка на событие DSH.
     * @param name - имя события (например, 'agent/created').
     * @param listener - обработчик.
     * @returns функция снятия подписки.
     */
    on<T>(name: string, listener: (payload: T) => void): () => void
    /**
     * Ресурс, живущий вместе с контекстом плагина.
     * @param create - создаёт ресурс и возвращает его очистку.
     * @param label - метка для диагностики.
     */
    effect(create: () => () => void, label?: string): void
  }
}

declare module '@deepseek-ai/schemastery' {
  /** Поле схемы Schemastery в минимальном объёме. */
  interface Field<T> {
    min(value: number): Field<T>
    max(value: number): Field<T>
    default(value: T): Field<T>
    /** Обязательное поле без умолчания (как в штатном tool-todo). */
    required(): Field<T>
  }

  /** Значение-фабрика схем: экспорт schemastery по умолчанию. */
  interface Schema {
    /** Поле в любом виде (например, для проверки сохранённого состояния). */
    any(): Field<unknown>
    /** Числовое поле. */
    number(): Field<number>
    /** Булево поле. */
    boolean(): Field<boolean>
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

declare module '@deepseek-ai/dsh-tools' {
  /** Определение инструмента в открытой форме (типы проверяет сам DSH). */
  interface ToolDefinition {
    readonly [key: string]: any
  }

  /**
   * Обернуть определение инструмента.
   * @param definition - имя, описание, параметры, схема результата и execute.
   * @returns то же определение.
   */
  export function defineTool<T extends ToolDefinition>(definition: T): T
}

declare module '@deepseek-ai/dsh-session' {
  /** Словарь событий лога сессии, дополняемый объявлениями модулей. */
  interface SessionEventMap {}
}

declare module '@deepseek-ai/dsh-session' {
  /** Минимальное лицо сессии, которое нужно инструменту todo_write. */
  interface Session {
    readonly id: string
    /**
     * Дописать событие в лог.
     * @param type - тип события (должен быть объявлен в словаре).
     * @param data - данные события.
     */
    append(type: string, data: unknown): unknown
  }
}
