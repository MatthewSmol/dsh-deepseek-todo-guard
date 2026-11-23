/**
 * Точка входа Host-половины пакета «Сторож TODO».
 *
 * Экспорт по умолчанию — плагин `todo-write`: штатный инструмент `todo_write`
 * из @deepseek-ai/dsh-tool-todo с тем же поведением и описанием для модели.
 * Модуль также загружает объявления событий лога (`todo/write` и
 * `todo-watch/check`): DSH принимает запись события только если его тип
 * объявлен в загруженном модуле.
 *
 * Параметр `checkIntervalSeconds` ничего не меняет для инструмента: он нужен
 * только чтобы в строке патча было видно, с каким интервалом работает сторож.
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import type { TodoItem } from './watch/types.js'
// Импорты без использования — боковые эффекты: объявления событий лога
// должны попасть в загруженный модуль.
import './signature/todo-write/index.js'
import './signature/todo-watch-check/index.js'

/** Имя плагина: строка `todo-write` заменяет штатный инструмент. */
export const name = 'todo-write'

/** Обязательные сервисы: реестр инструментов и проекции сессий. */
export const inject = ['tools', 'sessionProjections']

/** Конфигурация строки: параллельные задачи плюс поле-якорь для обновления. */
export interface Config {
  /** Можно ли держать несколько задач в статусе in_progress одновременно. */
  allowParallelInProgress: boolean
  /** Интервал сторожа, с — для наглядности строки; на инструмент не влияет. */
  checkIntervalSeconds?: number
}

/** Схема конфигурации строки патча — Schemastery (её DSH читает у экспорта). */
export const Config = Schema.object<Config>({
  allowParallelInProgress: Schema.boolean().required(),
  checkIntervalSeconds: Schema.number().min(5).max(600).default(30),
})

/** Три допустимых статуса задачи. */
const STATUSES = ['pending', 'in_progress', 'completed'] as const

/**
 * Схема проекции `todos` для sessionProjections — строго zod: DSH проверяет
 * сохранённое состояние и клиентское значение вызовом `.parse`. Schemastery
 * здесь не подходит, хотя Config — именно Schemastery.
 */
const todosProjectionSchema: ZodType<TodoItem[] | null> = zod.union([
  zod.array(zod.object({
    content: zod.string(),
    status: zod.union([zod.literal('pending'), zod.literal('in_progress'), zod.literal('completed')]),
  })),
  zod.null(),
])

/** Описание инструмента для модели, слово в слово как у штатного todo_write. */
function describe(allowParallel: boolean): string {
  return 'Record and update a task list to plan multi-step work and show progress; skip it for trivial '
    + 'single-step tasks. Add one todo per concrete step before you start. '
    + (allowParallel
      ? 'While work remains, keep the todos being worked on `in_progress`, several only when work runs in parallel. '
      : 'While work remains, keep exactly one todo `in_progress`. ')
    + 'Mark each todo `completed` as soon as it is done.'
}

/**
 * Проверить и канонизировать список: непустые уникальные описания и не больше
 * одного `in_progress`, если параллельная работа запрещена.
 * @param raw - список от модели.
 * @param allowParallel - разрешена ли параллельная работа.
 * @returns канонический список задач.
 */
function toTodoList(raw: Array<{ content: string; status: string }>, allowParallel: boolean): TodoItem[] {
  const todos: TodoItem[] = []
  const seen = new Set<string>()
  let active = 0
  for (const item of raw) {
    const content = item.content.trim()
    if (content.length === 0) throw new Error('invalid todo: `content` must be a non-empty string')
    if (seen.has(content)) throw new Error(`invalid todos: duplicate content ${JSON.stringify(content)}`)
    seen.add(content)
    if (item.status === 'in_progress') active++
    todos.push({ content, status: item.status as TodoItem['status'] })
  }
  if (!allowParallel && active > 1) {
    throw new Error(`invalid todos: at most one task may be in_progress (got ${active})`)
  }
  return todos
}

/**
 * Зарегистрировать инструмент `todo_write` и проекцию `todos`.
 * @param ctx - контекст плагина.
 * @param config - конфигурация строки патча.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const allowParallel = config.allowParallelInProgress
  await ctx.sessionProjections.register<string, TodoItem[] | null>({
    key: 'todos',
    stateSchema: todosProjectionSchema,
    init: () => null,
    apply: (state, event) => {
      if (event.type === 'todo/write') return (event.data as { todos: TodoItem[] }).todos
      if (event.type === 'turn/start') return null
      return state
    },
    wire: { viewSchema: todosProjectionSchema, view: (state: TodoItem[] | null) => state, summary: false },
    stateVersion: 2,
  })
  ctx.tools.register(defineTool({
    name: 'todo_write',
    description: describe(allowParallel),
    parameters: {
      todos: {
        type: 'array',
        required: true,
        description: 'The COMPLETE task list, replacing any previous list.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            content: { type: 'string', required: true, description: 'What the task is — a short imperative line.' },
            status: {
              type: 'string',
              required: true,
              enum: [...STATUSES],
              description: 'pending (not started) | in_progress (now) | completed (done).',
            },
          },
        },
      },
    },
    output: {
      // Корень схемы результата не может нести `required`: авторы схемы
      // задают обязательность полей внутри `properties`, компилятор DSH сам
      // собирает `required` на уровне объекта (как у штатного tool-todo).
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          todos: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string', required: true },
                status: { type: 'string', required: true, enum: [...STATUSES] },
              },
            },
          },
          counts: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              pending: { type: 'integer', required: true },
              inProgress: { type: 'integer', required: true },
              completed: { type: 'integer', required: true },
            },
          },
        },
      },
      render: (_args: unknown, value: { counts: { pending: number; inProgress: number; completed: number } }) => [{
        type: 'text',
        text: `Updated todo list: ${value.counts.pending} pending, ${value.counts.inProgress} in progress, ${value.counts.completed} completed.`,
      }],
    },
    execute(args: { todos: Array<{ content: string; status: string }> }, exec: { agent?: { session: { append(type: string, data: unknown): unknown } } }) {
      const todos = toTodoList(args.todos, allowParallel)
      if (!exec.agent) {
        // Список принадлежит сессии агента; без неё писать некуда — отвергаем.
        throw new Error('todo_write requires an owning agent session')
      }
      exec.agent.session.append('todo/write', { todos })
      const count = (status: TodoItem['status']): number => todos.filter(todo => todo.status === status).length
      return Promise.resolve({
        todos: todos.map(todo => ({ content: todo.content, status: todo.status })),
        counts: {
          pending: count('pending'),
          inProgress: count('in_progress'),
          completed: count('completed'),
        },
      })
    },
    presentCall: (args: { todos: unknown[] }) => ({ card: 'generic', title: 'Update todo list', kind: 'other', rawInput: args.todos }),
  }))
}

/** Плагин по умолчанию — `todo-write`; сторож живёт отдельной строкой. */
export default { inject, apply }
