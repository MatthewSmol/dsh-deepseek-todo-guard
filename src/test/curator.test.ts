/**
 * Разбор ответа модели и нормализация списка: мусор не должен попадать в панель.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frameInput, normalizeTodos, parsePayload, systemPrompt } from '../watch/curator.js'

const options = { maxItems: 5, allowParallel: false }

test('parsePayload: чистый JSON', () => {
  assert.deepEqual(parsePayload('{"todos":[]}'), { todos: [] })
})

test('parsePayload: обёртка ```json и текст вокруг', () => {
  assert.deepEqual(parsePayload('вот план:\n```json\n{"todos":[{"content":"a","status":"pending"}]}\n```\nготово'), {
    todos: [{ content: 'a', status: 'pending' }],
  })
})

test('parsePayload: мусор без JSON', () => {
  assert.equal(parsePayload('не могу помочь'), null)
})

test('parsePayload: битый JSON', () => {
  assert.equal(parsePayload('{"todos":['), null)
})

test('normalizeTodos: обрезает длинный текст и отбрасывает пустые', () => {
  const long = 'x'.repeat(200)
  const items = normalizeTodos({
    todos: [
      { content: `  ${long}  `, status: 'pending' },
      { content: '   ', status: 'pending' },
      { content: 'ок', status: 'неверный' },
    ],
  }, options)
  assert.equal(items?.length, 1)
  assert.equal(items?.[0]?.content.length, 120)
  assert.ok(items?.[0]?.content.endsWith('…'))
})

test('normalizeTodos: убирает повторы', () => {
  const items = normalizeTodos({
    todos: [
      { content: 'a', status: 'pending' },
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'pending' },
    ],
  }, options)
  assert.deepEqual(items?.map(item => item.content), ['a', 'b'])
})

test('normalizeTodos: ограничивает число задач', () => {
  const todos = Array.from({ length: 20 }, (_, index) => ({ content: `задача ${index}`, status: 'pending' }))
  assert.equal(normalizeTodos({ todos }, options)?.length, 5)
})

test('normalizeTodos: один in_progress при запрещённом параллелизме', () => {
  const items = normalizeTodos({
    todos: [
      { content: 'a', status: 'in_progress' },
      { content: 'b', status: 'in_progress' },
      { content: 'c', status: 'in_progress' },
    ],
  }, options)
  assert.deepEqual(items?.map(item => item.status), ['in_progress', 'pending', 'pending'])
})

test('normalizeTodos: параллелизм разрешён — статусы сохраняются', () => {
  const items = normalizeTodos({
    todos: [{ content: 'a', status: 'in_progress' }, { content: 'b', status: 'in_progress' }],
  }, { maxItems: 5, allowParallel: true })
  assert.deepEqual(items?.map(item => item.status), ['in_progress', 'in_progress'])
})

test('normalizeTodos: пустой или чужой ответ — null', () => {
  assert.equal(normalizeTodos({ todos: [] }, options), null)
  assert.equal(normalizeTodos({ items: ['a'] }, options), null)
  assert.equal(normalizeTodos(null, options), null)
})

test('frameInput: только факты хода и компактный JSON', () => {
  const text = frameInput({
    turn: 3,
    todos: [{ content: 'a', status: 'pending' }],
    userTexts: ['сделай "кавычки" в тексте'],
    assistantTexts: ['ок'],
    toolNames: ['bash', 'grep'],
  }, true)
  const parsed = JSON.parse(text)
  assert.equal(parsed.turn, 3)
  assert.equal(parsed.turn_open, true)
  assert.deepEqual(parsed.tools, ['bash', 'grep'])
  assert.match(parsed.request, /кавычки/)
})

test('systemPrompt: запрещает Markdown и задаёт форму ответа', () => {
  const prompt = systemPrompt({ maxItems: 7, allowParallel: false })
  assert.match(prompt, /ТОЛЬКО JSON/)
  assert.match(prompt, /до 7/)
  assert.match(prompt, /не больше одной/)
})
