/**
 * Регрессия: реестр агентов DSH — `AgentRegistry` с `list()`, без итератора.
 * Раньше обход `Array.from(ctx.agents)` давал пустой список, и сторож молчал.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, listAgents } from '../index.js'
import { resetRuntimeStateForTests } from '../state.js'

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
  // Состояние плагина общее на процесс: в тестах каждый сценарий начинает с чистого.
  resetRuntimeStateForTests()
  try {
    apply(ctx, { checkIntervalSeconds: 5, ...config })
    timers[0]?.()
    // Ждём завершения асинхронной проверки и записи маячка.
    await new Promise(resolve => setTimeout(resolve, 60))
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
    // webServer в тесте нет: маршрут журнала не регистрируется.
    inject: () => () => {},
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

test('повторная активация в том же процессе делит журнал и маршрут', async () => {
  resetRuntimeStateForTests()
  const { readFile } = await import('node:fs/promises')
  const { appendFile, rm } = await import('node:fs/promises')
  const journalPath = new URL('../../.nudges.json', import.meta.url)
  await rm(journalPath, { force: true })

  const routes: any[] = []
  const makeCtx = (agent: any) => {
    const timers: Array<() => void> = []
    const realSetInterval = globalThis.setInterval
    globalThis.setInterval = ((fn: () => void) => { timers.push(fn); return 0 }) as any
    const ctx = {
      agents: { list: () => [agent] },
      logger: { warn() {}, error() {}, info() {} },
      on: () => () => {},
      effect: (create: () => () => void) => create(),
      inject: (names: string[], cb: (c: any) => void): (() => void) => {
        if (names.includes('webServer')) {
          cb({
            webServer: { register: (route: any) => { routes.push(route); return () => {} } },
            on: () => () => {},
            effect: (create: () => () => void) => create(),
          })
          return () => {}
        }
        return () => {}
      },
      get: () => undefined,
    }
    apply(ctx, { checkIntervalSeconds: 5 })
    globalThis.setInterval = realSetInterval
    return timers
  }

  const first = fakeAgent(eventsWithTurn)
  const early = makeCtx(first.agent)[0]!
  await early()
  await new Promise(resolve => setTimeout(resolve, 20))

  // Вторая активация: свой таймер, но журнал и маршрут — те же.
  const second = fakeAgent(eventsWithTurn, 'session-2')
  makeCtx(second.agent)
  assert.equal(routes.length, 1, 'маршрут регистрируется один раз на процесс')

  const stored = JSON.parse(await readFile(journalPath, 'utf8'))
  assert.equal(stored.entries.length, 1)
  await appendFile(journalPath, '') // файл существует и доступен
  await rm(journalPath, { force: true })
})

test('журнал: тик создаёт запись с действием и источником', async () => {
  const { readFile } = await import('node:fs/promises')
  const { appended, agent } = fakeAgent(eventsWithTurn)
  await tick(fakeContext({ list: () => [agent] }))
  assert.equal(appended.length, 1)
  const journal = JSON.parse(await readFile(new URL('../../.nudges.json', import.meta.url), 'utf8'))
  assert.equal(journal.version, 1)
  const entry = journal.entries[0]
  assert.equal(entry.sessionId, 'session-1')
  assert.equal(entry.action, 'create')
  assert.equal(entry.source, 'heuristic')
  assert.equal(entry.items, 1)
  assert.equal(typeof entry.reason, 'string')
})

test('маячок сообщает итог сверки с проекцией todos', async () => {
  const { readFile } = await import('node:fs/promises')
  const { appended, agent } = fakeAgent(eventsWithTurn)
  // Подставная проекция отдаёт ровно то, что записали, — сверка должна пройти.
  let last: any = null
  const ctx: any = fakeContext({ list: () => [agent] })
  const originalAppend = agent.session.append
  ;(agent.session as any).append = (type: string, data: any) => { last = data.todos; originalAppend(type, data) }
  ctx.get = (name: string) => name === 'sessionProjections' ? { stateOf: () => last } : undefined
  await tick(ctx)
  assert.equal(appended.length, 1)
  const beacon = JSON.parse(await readFile(new URL('../../.watch-alive.json', import.meta.url), 'utf8'))
  assert.equal(beacon.projection, 'ok')
  assert.equal(beacon.nudges, 1)
  assert.equal(beacon.agents, 1)
})

test('модель недоступна — список всё равно появляется', async () => {
  const { appended, agent } = fakeAgent(eventsWithTurn)
  await tick(fakeContext({ list: () => [agent] }, { llm: undefined }))
  assert.equal(appended.length, 1)
})
