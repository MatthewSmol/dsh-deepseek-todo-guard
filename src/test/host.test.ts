/**
 * Смоук-тест Host-половины: подмена сервисов DSH, проверка подсказки и записи
 * события `todo-watch/check`. Настоящего DSH здесь нет — только формы, на
 * которые опирается плагин.
 *
 * Пакеты @deepseek-ai/schemastery и @deepseek-ai/cordis в тесте подменяются
 * до загрузки собранного модуля (onResolve в module.registerHook).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

/** Форма собранной Host-половины, которую проверяет смоук-тест. */
interface HostModule {
  apply(ctx: unknown, config: Record<string, unknown>): void
}

/** Заглушка Schemastery: экспорт по умолчанию — фабрика схем (как на самом деле). */
const SCHEMA_STUB = `
const Schema = {
  any: () => ({}),
  number: () => ({ min() { return this }, max() { return this }, default() { return this } }),
  boolean: () => ({ default() { return this } }),
  object: (shape) => ({ shape }),
}
export default Schema
`

/** Подменить пакеты DSH до импорта собранного модуля. */
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/schemastery' || specifier === '@deepseek-ai/cordis') {
      return { url: `todo-watch-test:${specifier}`, shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith('todo-watch-test:')) {
      return { format: 'module', source: SCHEMA_STUB, shortCircuit: true }
    }
    return next(url, context)
  },
})

test('apply: подсказка stale уходит один раз и пишет события в лог', async () => {
  const handlers = new Map<string, (payload: any) => void>()
  const appended: Array<{ type: string; data: unknown }> = []
  const injected: unknown[] = []
  const timers: Array<() => void> = []
  const registrations: unknown[] = []
  const session = {
    id: 's1',
    snapshotEvents: () => [
      { type: 'turn/start', seq: 1, data: { turn: 1 } },
      {
        type: 'todo/write',
        seq: 2,
        time: Date.now() - 60 * 60_000,
        data: { todos: [{ content: 'проверить сборку', status: 'pending' }] },
      },
    ],
    append(type: string, data: unknown) { appended.push({ type, data }) },
  }
  const agent = {
    id: 's1',
    status: 'idle' as const,
    session,
    inbox: { nextTurn: [], nextStep: [] },
    inject(message: unknown) { injected.push(message) },
  }
  const ctx = {
    agents: [agent],
    sessionProjections: {
      register: (definition: unknown) => {
        registrations.push(definition)
        return Promise.resolve({ stateOf: () => null })
      },
    },
    logger: { warn() {}, error() {}, info() {} },
    on(name: string, listener: (payload: any) => void) { handlers.set(name, listener); return () => {} },
    effect(create: () => () => void) { create() },
  }
  const realSetInterval = globalThis.setInterval
  globalThis.setInterval = ((callback: () => void) => { timers.push(callback); return 0 }) as any
  try {
    const built = new URL('../../../dist/host/index.js', import.meta.url).href
    const source = (await import(built)) as HostModule
    source.apply(ctx, { checkIntervalSeconds: 5, staleAfterMinutes: 10 })
    assert.equal(registrations.length, 1)
    assert.equal((registrations[0] as any).key, 'todo-watch/last-check')
    // DSH проверяет сохранённое состояние вызовом .parse: схема обязана быть zod.
    assert.equal(typeof (registrations[0] as any).stateSchema?.parse, 'function')
    assert.equal(timers.length, 1)
    timers[0]()
    assert.equal(injected.length, 1)
    assert.match((injected[0] as any).content[0].text, /TODO/)
    const checks = appended.filter(entry => entry.type === 'todo-watch/check')
    assert.equal(checks.length, 1)
    assert.equal((checks[0].data as any).reason, 'stale')
    assert.equal((checks[0].data as any).sent, true)
    // Второй тик: причина та же, повторной подсказки нет, но проверка записывается.
    timers[0]()
    assert.equal(injected.length, 1)
    assert.equal(appended.filter(entry => entry.type === 'todo-watch/check').length, 2)
  } finally {
    globalThis.setInterval = realSetInterval
  }
})
