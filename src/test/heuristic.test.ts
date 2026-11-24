/**
 * Запасной путь без модели: список всё равно появляется и отражает прогресс.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heuristicTodos } from '../watch/heuristic.js'
import type { SessionView } from '../watch/types.js'

const options = { maxItems: 5, allowParallel: false }

/** Состояние сессии с разумными умолчаниями. */
function view(overrides: Partial<SessionView> = {}): SessionView {
  return {
    turn: 1,
    todos: null,
    wroteThisTurn: false,
    writtenAt: 0,
    turnOpen: true,
    stepStarted: true,
    userTexts: ['Сделай что-нибудь полезное'],
    assistantTexts: [],
    toolNames: [],
    ...overrides,
  }
}

test('пункты из нумерованного запроса', () => {
  const items = heuristicTodos(view({
    userTexts: ['План:\n1. прочитать код\n2. поправить баг\n3. прогнать тесты'],
  }), options)
  // Заголовок «План:» отбрасывается: остаются только пункты списка.
  assert.deepEqual(items.map(item => item.content), ['прочитать код', 'поправить баг', 'прогнать тесты'])
  assert.deepEqual(items.map(item => item.status), ['in_progress', 'pending', 'pending'])
})

test('короткий запрос — одна задача в работе', () => {
  const items = heuristicTodos(view(), options)
  assert.equal(items.length, 1)
  assert.equal(items[0]?.status, 'in_progress')
  assert.match(items[0]?.content ?? '', /Сделай/)
})

test('закрытый ход — всё выполнено', () => {
  const items = heuristicTodos(view({ turnOpen: false }), options)
  assert.deepEqual(items.map(item => item.status), ['completed'])
})

test('существующий список: сохраняет формулировки и двигает статусы', () => {
  const items = heuristicTodos(view({
    todos: [
      { content: 'первое', status: 'completed' },
      { content: 'второе', status: 'pending' },
      { content: 'третье', status: 'pending' },
    ],
    turnOpen: true,
  }), options)
  assert.deepEqual(items.map(item => item.content), ['первое', 'второе', 'третье'])
  assert.deepEqual(items.map(item => item.status), ['completed', 'in_progress', 'pending'])
})

test('существующий список при закрытом ходе становится выполненным', () => {
  const items = heuristicTodos(view({
    todos: [{ content: 'первое', status: 'in_progress' }],
    turnOpen: false,
  }), options)
  assert.deepEqual(items.map(item => item.status), ['completed'])
})

test('пустой запрос не оставляет список пустым', () => {
  const items = heuristicTodos(view({ userTexts: [] }), options)
  assert.equal(items.length, 1)
  assert.ok((items[0]?.content ?? '').length > 0)
})

test('длинные строки обрезаются, дубликаты отбрасываются', () => {
  const line = 'очень длинная задача '.repeat(20)
  const items = heuristicTodos(view({ userTexts: [`${line}\n${line}`] }), options)
  assert.ok((items[0]?.content.length ?? 0) <= 120)
  assert.equal(items.length, 1)
})
