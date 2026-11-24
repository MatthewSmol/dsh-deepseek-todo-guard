/**
 * Регрессия: реестр агентов DSH — `AgentRegistry` с `list()`, без итератора.
 * Раньше обход `Array.from(ctx.agents)` давал пустой список, и сторож молчал.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, listAgents } from '../index.js'

/** Агент с минимальным лицом и записывающим логом. */
function fakeAgent(seed: readonly any[], id = 'session-1') {
  const appended: { type: string; data: any }[] = []
  // Запись попадает и в лог: настоящая сессия так и делает, иначе второй тик
  // увидел бы прежнее состояние и записал список повторно.
  const events = [...seed]
  return {
    appended,
    agent: {
      id,
      status: 'running' as const,
      session: {
        id,
        header: {},
        requestHeader: () => ({ config: { provider: 'p', model: 'm' } }),
        snapshotEvents: () => events,
        append: (type: string, data: any) => {
          appended.push({ type, data })
          events.push({ type, seq: events.length + 1, time: Date.now(), data })
        },
      },
    },
  }
}

/** Прогнать один тик сторожа на подставном контексте. */
async function tick(ctx: any, config: any = {}): Promise<void> {
  const timers: Array<() => void> = []
  const realSetInterval = globalThis.setInterval
  globalThis.setInterval = ((fn: () => void) => { timers.push(fn); return 0 }) as any
  try {
    apply(ctx, { checkIntervalSeconds: 5, ...config })
    timers[0]?.()
    await new Promise(resolve => setTimeout(resolve, 20))
  } finally {
    globalThis.setInterval = realSetInterval
  }
}

/** Контекст плагина без модели: работает эвристика. */
function fakeContext(agents: any, extra: Record<string, unknown> = {}) {
  return {
    agents,
    logger: { warn() {}, error() {}, info() {} },
    on: () => () => {},
    effect: (create: () => () => void) => create(),
    get: (name: string) => (name === 'llm' ? undefined : (extra as any)[name]),
  }
}

const eventsWithTurn = [
  { type: 'turn/start', seq: 1, data: { turn: 1 } },
  { type: 'user/message', seq: 2, data: { content: [{ type: 'text', text: 'Почини тесты' }] } },
  { type: 'step/start', seq: 3, data: { turn: 1, step: 1 } },
]

test('listAgents: реестр с list() (как в DSH) отдаёт агентов', () => {
  assert.equal(listAgents({ list: () => [{ id: 'a' }, { id: 'b' }] }).length, 2)
})

test('listAgents: итерируемый реестр тоже поддерживается', () => {
  assert.equal(listAgents([{ id: 'a' }]).length, 1)
})

test('listAgents: пустой и негодный реестр — пустой список', () => {
  assert.deepEqual(listAgents(undefined), [])
  assert.deepEqual(listAgents({}), [])
})

test('тик создаёт список для сессии без todo', async () => {
  const { appended, agent } = fakeAgent(eventsWithTurn)
  await tick(fakeContext({ list: () => [agent] }))
  assert.equal(appended.length, 1)
  assert.equal(appended[0]?.type, 'todo/write')
  assert.equal(appended[0]?.data.todos.length, 1)
  assert.equal(appended[0]?.data.todos[0].status, 'in_progress')
})

test('итерируемый реестр тоже обслуживается', async () => {
  const { appended, agent } = fakeAgent(eventsWithTurn)
  await tick(fakeContext([agent]))
  assert.equal(appended.length, 1)
})

test('сессии субагентов пропускаются по умолчанию', async () => {
  const { appended, agent } = fakeAgent(eventsWithTurn, 'sub-1')
  ;(agent.session as any).header = { origin: 'subagent' }
  await tick(fakeContext({ list: () => [agent] }))
  assert.equal(appended.length, 0)
})

test('субагенты обслуживаются при includeSubagents', async () => {
  const { appended, agent } = fakeAgent(eventsWithTurn, 'sub-2')
  ;(agent.session as any).header = { origin: 'subagent' }
  await tick(fakeContext({ list: () => [agent] }), { includeSubagents: true })
  assert.equal(appended.length, 1)
})

test('повторный тик не дублирует запись', async () => {
  const { appended, agent } = fakeAgent(eventsWithTurn)
  const ctx = fakeContext({ list: () => [agent] })
  await tick(ctx)
  await tick(ctx)
  assert.equal(appended.length, 1)
})

test('агент уже писал список в этом ходе — тик молчит', async () => {
  const { appended, agent } = fakeAgent([
    ...eventsWithTurn,
    { type: 'todo/write', seq: 4, time: Date.now(), data: { todos: [{ content: 'делаю', status: 'in_progress' }] } },
  ])
  await tick(fakeContext({ list: () => [agent] }))
  assert.equal(appended.length, 0)
})

test('модель недоступна — список всё равно появляется', async () => {
  const { appended, agent } = fakeAgent(eventsWithTurn)
  await tick(fakeContext({ list: () => [agent] }, { llm: undefined }))
  assert.equal(appended.length, 1)
})
