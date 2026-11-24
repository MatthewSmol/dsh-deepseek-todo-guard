/**
 * Напоминания агенту: текст, интервал и отсутствие ложных срабатываний.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nudgeMessage, nudgeText, shouldNudge } from '../nudge.js'
import type { TodoItem } from '../watch/types.js'

const todos: TodoItem[] = [
  { content: 'прочитать код', status: 'completed' },
  { content: 'поправить баг', status: 'in_progress' },
  { content: 'прогнать тесты', status: 'pending' },
]

test('текст напоминания: список, счётчики и просьба вести его самому', () => {
  const text = nudgeText(todos, 'список обновляется по ходу работы')
  assert.match(text, /TODO watch/)
  assert.match(text, /Reason: список обновляется по ходу работы/)
  assert.match(text, /1 done, 1 in progress, 1 pending/)
  assert.match(text, /\[x\] прочитать код/)
  assert.match(text, /\[~\] поправить баг/)
  assert.match(text, /\[ \] прогнать тесты/)
  assert.match(text, /call todo_write with the COMPLETE list/)
})

test('текст напоминания: пустой список и обрезка длинного', () => {
  assert.match(nudgeText([], undefined), /\(empty\)/)
  const long = Array.from({ length: 20 }, (_, index) => ({ content: 'длинная задача '.repeat(10) + index, status: 'pending' as const }))
  const text = nudgeText(long)
  assert.ok(text.length < 900)
  assert.ok(text.includes('…'))
})

test('сообщение для inject: id, роль, текстовый блок и источник', () => {
  const message = nudgeMessage(todos, 'причина')
  assert.equal(message.role, 'user')
  assert.equal(typeof message.id, 'string')
  assert.deepEqual((message.source as any), { kind: 'todo-watch' })
  const content = message.content as Array<{ type: string; text: string }>
  assert.equal(content[0]?.type, 'text')
  assert.match(content[0]?.text ?? '', /TODO watch/)
})

test('shouldNudge: интервал, выключенность и закрытый ход', () => {
  const base = { enabled: true, turnOpen: true, lastNudgedAt: 0, now: 1_000_000, minIntervalMs: 180_000 }
  assert.equal(shouldNudge(base), true)
  assert.equal(shouldNudge({ ...base, lastNudgedAt: base.now - 60_000 }), false)
  assert.equal(shouldNudge({ ...base, lastNudgedAt: base.now - 200_000 }), true)
  assert.equal(shouldNudge({ ...base, enabled: false }), false)
  assert.equal(shouldNudge({ ...base, turnOpen: false }), false)
})
