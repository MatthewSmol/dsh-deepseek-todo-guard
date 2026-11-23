/**
 * Проверка схем проекций: DSH вызывает `.parse` у `stateSchema` и
 * `wire.viewSchema`, поэтому обе обязаны быть zod-схемами. Регрессия: однажды
 * здесь оказалась Schemastery, и загрузка истории падала с
 * «def.wire.viewSchema.parse is not a function».
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/schemastery' || specifier === '@deepseek-ai/dsh-tools') {
      return { url: `todo-watch-test:${specifier}`, shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith('todo-watch-test:')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: url.endsWith('dsh-tools')
          ? 'export const defineTool = (d) => d\n'
          : `
const Factory = {
  any: () => ({}),
  number: () => ({ min() { return this }, max() { return this }, default() { return this } }),
  boolean: () => ({ default() { return this }, required() { return this } }),
  object: (shape) => ({ shape }),
}
export default Factory
`,
      }
    }
    return next(url, context)
  },
})

/** Контекст-заглушка: собирает определения инструментов и проекций. */
function fakeContext(): { ctx: any, tools: any[], projections: any[] } {
  const tools: any[] = []
  const projections: any[] = []
  const ctx = {
    tools: { register: (definition: any) => { tools.push(definition); return () => {} } },
    sessionProjections: {
      register: (definition: any) => { projections.push(definition); return Promise.resolve({ stateOf: () => null }) },
    },
    logger: { warn() {}, error() {}, info() {} },
    on: () => () => {},
    effect: (create: () => () => void) => { create() },
    agents: [],
  }
  return { ctx, tools, projections }
}

test('todo-write: проекция todos объявлена zod-схемой', async () => {
  const { ctx, tools, projections } = fakeContext()
  const built = new URL('../../../dist/index.js', import.meta.url).href
  const source = await import(built) as { apply(ctx: unknown, config: unknown): Promise<void> }
  await source.apply(ctx, { allowParallelInProgress: true })
  assert.equal(projections.length, 1)
  const definition = projections[0]
  assert.equal(definition.key, 'todos')
  assert.equal(typeof definition.stateSchema?.parse, 'function', 'stateSchema должен быть zod')
  assert.equal(typeof definition.wire?.viewSchema?.parse, 'function', 'viewSchema должен быть zod')
  // Схема принимает ровно тот вид, что пишет инструмент, и null до записи.
  assert.deepEqual(definition.wire.viewSchema.parse(null), null)
  assert.deepEqual(
    definition.wire.viewSchema.parse([{ content: 'a', status: 'pending' }]),
    [{ content: 'a', status: 'pending' }],
  )
  assert.throws(() => definition.wire.viewSchema.parse([{ content: 'a', status: 'wrong' }]))
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'todo_write')
})
