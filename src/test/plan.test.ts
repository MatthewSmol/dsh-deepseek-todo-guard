/**
 * Правила плана: когда создавать, обновлять, закрывать или не трогать список.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planAction, sameTodos } from '../watch/plan.js'
import type { SessionView } from '../watch/types.js'

const NOW = 1_800_000_000_000
const options = { refreshSeconds: 60, staleAfterMinutes: 10, promoteOnTurnEnd: true }

/** Состояние сессии с разумными умолчаниями. */
function view(overrides: Partial<SessionView> = {}): SessionView {
  return {
    turn: 1,
    todos: null,
    wroteThisTurn: false,
    writtenAt: NOW,
    turnOpen: true,
    stepStarted: true,
    userTexts: ['сделай задачу'],
    assistantTexts: [],
    toolNames: [],
    ...overrides,
  }
}

test('нет ходов — ничего не делаем', () => {
  assert.equal(planAction(view({ turn: 0, turnOpen: false }), NOW, options).action, 'none')
})

test('в ходе нет списка — создаём', () => {
  const decision = planAction(view({ todos: null }), NOW, options)
  assert.equal(decision.action, 'create')
})

test('список остался от прошлого хода — заменяем', () => {
  const decision = planAction(view({
    todos: [{ content: 'старое', status: 'completed' }],
    wroteThisTurn: false,
    turn: 2,
  }), NOW, options)
  assert.equal(decision.action, 'refresh')
})

test('агент уже писал список в этом ходе — не трогаем', () => {
  const decision = planAction(view({
    todos: [{ content: 'делаю', status: 'in_progress' }],
    wroteThisTurn: true,
  }), NOW, options)
  assert.equal(decision.action, 'none')
})

test('ход завершён, есть незавершённые — закрываем', () => {
  const decision = planAction(view({
    todos: [{ content: 'делаю', status: 'in_progress' }, { content: 'потом', status: 'pending' }],
    wroteThisTurn: true,
    turnOpen: false,
  }), NOW, options)
  assert.equal(decision.action, 'promote')
})

test('ход завершён, всё выполнено — не трогаем', () => {
  const decision = planAction(view({
    todos: [{ content: 'готово', status: 'completed' }],
    wroteThisTurn: true,
    turnOpen: false,
  }), NOW, options)
  assert.equal(decision.action, 'none')
})

test('закрытие на конце хода можно выключить', () => {
  const decision = planAction(view({
    todos: [{ content: 'делаю', status: 'in_progress' }],
    wroteThisTurn: true,
    turnOpen: false,
  }), NOW, { ...options, promoteOnTurnEnd: false })
  assert.equal(decision.action, 'none')
})

test('идущий ход обновляет список раз в refreshSeconds', () => {
  const fresh = planAction(view({
    todos: [{ content: 'делаю', status: 'in_progress' }],
    wroteThisTurn: true,
    writtenAt: NOW - 30_000,
  }), NOW, options)
  assert.equal(fresh.action, 'none')

  const due = planAction(view({
    todos: [{ content: 'делаю', status: 'in_progress' }],
    wroteThisTurn: true,
    writtenAt: NOW - 61_000,
  }), NOW, options)
  assert.equal(due.action, 'refresh')
  assert.match(due.reason, /по ходу работы/)
})

test('refreshSeconds: 0 отключает обновление идущего хода', () => {
  const decision = planAction(view({
    todos: [{ content: 'делаю', status: 'in_progress' }],
    wroteThisTurn: true,
    writtenAt: NOW - 10 * 60_000,
  }), NOW, { ...options, refreshSeconds: 0 })
  assert.equal(decision.action, 'none')
})

test('простой: список обновляется по staleAfterMinutes', () => {
  const decision = planAction(view({
    todos: [{ content: 'делаю', status: 'in_progress' }],
    wroteThisTurn: true,
    turnOpen: false,
    writtenAt: NOW - 11 * 60_000,
  }), NOW, { ...options, promoteOnTurnEnd: false })
  assert.equal(decision.action, 'refresh')
  assert.match(decision.reason, /давно не обновлялся/)
})

test('простой: порог 0 выключает проверку устаревания', () => {
  const decision = planAction(view({
    todos: [{ content: 'делаю', status: 'in_progress' }],
    wroteThisTurn: true,
    turnOpen: false,
    writtenAt: NOW - 10 * 60 * 60_000,
  }), NOW, { ...options, staleAfterMinutes: 0, promoteOnTurnEnd: false })
  assert.equal(decision.action, 'none')
})

test('sameTodos сравнивает содержимое и статусы', () => {
  const a = [{ content: 'a', status: 'pending' }, { content: 'b', status: 'completed' }]
  assert.equal(sameTodos(a, [...a]), true)
  assert.equal(sameTodos(a, [{ content: 'a', status: 'completed' }, { content: 'b', status: 'completed' }]), false)
  assert.equal(sameTodos(a, [{ content: 'a', status: 'pending' }]), false)
  assert.equal(sameTodos(null, []), true)
  assert.equal(sameTodos(null, a), false)
})
