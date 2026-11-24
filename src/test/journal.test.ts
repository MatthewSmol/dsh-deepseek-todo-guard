/**
 * Журнал подсказок: кольцевой буфер, файл, подписи сессий.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createJournal, MAX_ENTRIES, parseJournal, serializeJournal, sessionLabel, type NudgeRecord } from '../journal.js'

/** Запись с разумными умолчаниями. */
function record(overrides: Partial<NudgeRecord> = {}): NudgeRecord {
  return {
    at: 1_800_000_000_000,
    sessionId: 'session-abc',
    action: 'create',
    source: 'model',
    items: 3,
    reason: 'в этом ходе списка нет',
    ...overrides,
  }
}

test('новые записи идут первыми', () => {
  const journal = createJournal()
  journal.push(record({ at: 1 }))
  journal.push(record({ at: 2 }))
  assert.deepEqual(journal.list(5).map(item => item.at), [2, 1])
})

test('list отдаёт не больше запрошенного', () => {
  const journal = createJournal()
  for (let index = 0; index < 5; index += 1) journal.push(record({ at: index }))
  assert.equal(journal.list(2).length, 2)
  assert.equal(journal.list(0).length, 0)
})

test('переполнение отбрасывает самые старые', () => {
  const journal = createJournal({ capacity: 3 })
  for (let index = 0; index < 10; index += 1) journal.push(record({ at: index }))
  assert.equal(journal.size(), 3)
  assert.deepEqual(journal.list(3).map(item => item.at), [9, 8, 7])
})

test('ёмкость ограничена MAX_ENTRIES', () => {
  const journal = createJournal({ capacity: 10_000 })
  for (let index = 0; index < MAX_ENTRIES + 5; index += 1) journal.push(record({ at: index }))
  assert.equal(journal.size(), MAX_ENTRIES)
})

test('изменение отдаётся наружу для записи файла', () => {
  const seen: number[] = []
  const journal = createJournal({ onChange: entries => seen.push(entries.length) })
  journal.push(record())
  journal.push(record())
  assert.deepEqual(seen, [1, 2])
})

test('ошибка сохраняющего обработчика не ломает журнал', () => {
  const journal = createJournal({ onChange: () => { throw new Error('диск') } })
  journal.push(record())
  assert.equal(journal.size(), 1)
})

test('файл: сериализация и разбор', () => {
  const entries = [record({ at: 2, sessionTitle: 'Сторож TODO' }), record({ at: 1 })]
  const parsed = parseJournal(serializeJournal(entries))
  assert.deepEqual(parsed, entries)
})

test('файл: битый JSON, чужая версия и мусорные записи', () => {
  assert.deepEqual(parseJournal('не json'), [])
  assert.deepEqual(parseJournal('{"version":2,"entries":[]}'), [])
  assert.deepEqual(parseJournal('{"version":1,"entries":[{"at":"x"}]}'), [])
  assert.deepEqual(parseJournal('{"version":1,"entries":[]}'), [])
})

test('файл: начальные записи подхватываются и обрезаются', () => {
  const initial = Array.from({ length: MAX_ENTRIES + 3 }, (_, index) => record({ at: index }))
  const journal = createJournal({ initial })
  assert.equal(journal.size(), MAX_ENTRIES)
})

test('подпись сессии: название, иначе короткий id', () => {
  assert.equal(sessionLabel(record({ sessionTitle: 'Починка тестов' })), 'Починка тестов')
  assert.equal(sessionLabel(record({ sessionTitle: '   ' })), 'session-')
  assert.equal(sessionLabel(record({ sessionId: 'abcdef123456' })), 'abcdef12')
})
