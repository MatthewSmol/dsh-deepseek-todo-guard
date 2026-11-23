/**
 * Тесты чистых правил «Сторожа TODO»: без DSH и без таймеров.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULTS,
  activeCount,
  completedCount,
  isOverdue,
  reminderFor,
  renderText,
  resolveConfig,
  type SessionState,
  type TodoSnapshot,
  type WatcherConfig,
} from '../watch/watcher.js'
import type { TodoItem, Translate } from '../watch/types.js'
import { boundSummary } from '../watch/types.js'

const NOW = 1_800_000_000_000
const config: WatcherConfig = resolveConfig(DEFAULTS)

/** Простой перевод для проверки текстов: берёт словарь или ключ. */
const t: Translate = (key, params) => {
  const template = {
    'reminder.stale': 'stale {minutes} {interval}',
    'reminder.all-completed': 'all {interval}',
    'reminder.no-todo': 'none {interval}',
  }[key] ?? key
  return template.replace(/\{(\w+)\}/g, (match, name) => String(params?.[name] ?? match))
}

/** Снимок списка, записанный `minutesAgo` минут назад. */
function snap(minutesAgo: number, todos: TodoItem[], turn = 1): TodoSnapshot {
  return { turn, todos, writtenAt: NOW - minutesAgo * 60_000, seq: 10 }
}

/** Состояние сессии по умолчанию: свежий список, idle. */
function state(overrides: Partial<SessionState> = {}): SessionState {
  return {
    turn: 1,
    snapshot: snap(1, [{ content: 'a', status: 'in_progress' }]),
    writesThisTurn: 1,
    idle: true,
    pendingInput: 0,
    idleSince: NOW,
    ...overrides,
  }
}

test('resolveConfig подставляет умолчания', () => {
  const resolved = resolveConfig({})
  assert.deepEqual(resolved, DEFAULTS)
  assert.equal(resolved.checkIntervalSeconds, 30)
  assert.equal(resolved.staleAfterMinutes, 10)
})

test('resolveConfig ограничивает интервал и порог', () => {
  assert.equal(resolveConfig({ checkIntervalSeconds: 1 }).checkIntervalSeconds, 5)
  assert.equal(resolveConfig({ checkIntervalSeconds: 90_000 }).checkIntervalSeconds, 600)
  assert.equal(resolveConfig({ staleAfterMinutes: -3 }).staleAfterMinutes, 0)
  assert.equal(resolveConfig({ staleAfterMinutes: 9_999 }).staleAfterMinutes, 600)
  assert.equal(resolveConfig({ checkIntervalSeconds: 12.7 }).checkIntervalSeconds, 12)
})

test('resolveConfig не падает на мусоре', () => {
  const resolved = resolveConfig({ checkIntervalSeconds: 'nope' as unknown as number })
  assert.equal(resolved.checkIntervalSeconds, 30)
})

test('isOverdue: порог 0 выключает проверку устаревания', () => {
  assert.equal(isOverdue(null, NOW, 10), false)
  assert.equal(isOverdue(snap(11, []), NOW, 10), true)
  assert.equal(isOverdue(snap(11, []), NOW, 0), false)
  assert.equal(isOverdue(snap(9, []), NOW, 10), false)
})

test('свежий список с незавершённой задачей — молчание', () => {
  assert.deepEqual(reminderFor(state(), NOW, config), { reminder: null, overdue: false })
})

test('устаревший список у простаивающего агента — stale', () => {
  const result = reminderFor(state({ snapshot: snap(42, [{ content: 'a', status: 'pending' }]) }), NOW, config)
  assert.deepEqual(result, { reminder: 'stale', overdue: true })
})

test('устаревший список у работающего агента — молчание при remindOnlyWhenIdle', () => {
  const s = state({ idle: false, snapshot: snap(42, [{ content: 'a', status: 'pending' }]) })
  assert.equal(reminderFor(s, NOW, config).reminder, null)
  const loud = resolveConfig({ ...DEFAULTS, remindOnlyWhenIdle: false })
  assert.equal(reminderFor(s, NOW, loud).reminder, 'stale')
})

test('новый ход без записи списка — no-todo', () => {
  const s = state({ turn: 3, snapshot: snap(2, [{ content: 'a', status: 'completed' }], 2), writesThisTurn: 0 })
  assert.equal(reminderFor(s, NOW, config).reminder, 'no-todo')
})

test('нет списка вовсе — молчание', () => {
  assert.equal(reminderFor(state({ snapshot: null }), NOW, config).reminder, null)
})

test('весь список выполнен и ждёт работа — all-completed', () => {
  const s = state({ snapshot: snap(1, [{ content: 'a', status: 'completed' }]), pendingInput: 2 })
  assert.equal(reminderFor(s, NOW, config).reminder, 'all-completed')
})

test('весь список выполнен без ожидающей работы — молчание', () => {
  const s = state({ snapshot: snap(1, [{ content: 'a', status: 'completed' }]) })
  assert.equal(reminderFor(s, NOW, config).reminder, null)
})

test('выключенные флаги отключают соответствующие причины', () => {
  const quiet = resolveConfig({ ...DEFAULTS, remindAllCompleted: false, remindMissingList: false })
  assert.equal(reminderFor(state({ turn: 5, snapshot: snap(2, [], 4), writesThisTurn: 0 }), NOW, quiet).reminder, null)
  const allDone = state({ snapshot: snap(1, [{ content: 'a', status: 'completed' }]), pendingInput: 1 })
  assert.equal(reminderFor(allDone, NOW, quiet).reminder, null)
})

test('счётчики задач считают незавершённые', () => {
  const todos: TodoItem[] = [
    { content: 'a', status: 'pending' },
    { content: 'b', status: 'in_progress' },
    { content: 'c', status: 'completed' },
  ]
  assert.equal(activeCount(todos), 2)
  assert.equal(completedCount(todos), 1)
})

test('renderText подставляет минуты и интервал', () => {
  const stale = renderText('stale', snap(42, []), NOW, config, t)
  assert.equal(stale, 'stale 42 30')
  assert.equal(renderText('no-todo', null, NOW, config, t), 'none 30')
  assert.equal(renderText('stale', null, NOW, config, t), 'stale 10 30')
})

test('boundSummary обрезает длинную подсказку до 120 символов', () => {
  const long = 'слово '.repeat(60)
  const short = boundSummary(long)
  assert.equal(short.length, 120)
  assert.ok(short.endsWith('…'))
  assert.equal(boundSummary('ровно короткий текст'), 'ровно короткий текст')
})
