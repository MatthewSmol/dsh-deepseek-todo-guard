/**
 * Маршрут журнала: токен страницы, коды ответов, отсутствие кэша.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createJournal, type NudgeRecord } from '../journal.js'
import { journalResponse, NUDGES_PATH, nudgePayload, PAGE_GLOBAL, TOKEN_HEADER } from '../route.js'

const TOKEN = 'token-1'

/** Журнал с одной записью. */
function journalWithEntry(): ReturnType<typeof createJournal> {
  const journal = createJournal()
  const record: NudgeRecord = {
    at: 1_800_000_000_000,
    sessionId: 'session-1',
    action: 'create',
    source: 'model',
    items: 2,
    reason: 'в этом ходе списка нет',
  }
  journal.push(record)
  return journal
}

/** Запрос к маршруту. */
function request(method = 'GET', token?: string): Request {
  const headers = new Headers()
  if (token !== undefined) headers.set(TOKEN_HEADER, token)
  return new Request(`http://127.0.0.1${NUDGES_PATH}`, { method, headers })
}

test('GET с верным токеном отдаёт журнал', async () => {
  const response = journalResponse(request('GET', TOKEN), journalWithEntry(), 5, TOKEN)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json() as any
  assert.equal(payload.version, 1)
  assert.equal(payload.historySize, 5)
  assert.equal(payload.entries.length, 1)
  assert.equal(payload.entries[0].sessionId, 'session-1')
})

test('без токена и с чужим токеном — 403', async () => {
  assert.equal(journalResponse(request('GET'), journalWithEntry(), 5, TOKEN).status, 403)
  assert.equal(journalResponse(request('GET', 'wrong-token'), journalWithEntry(), 5, TOKEN).status, 403)
  const payload = await journalResponse(request('GET'), journalWithEntry(), 5, TOKEN).json() as any
  assert.equal(payload.error, 'forbidden')
})

test('POST — 405 с Allow', () => {
  const response = journalResponse(request('POST', TOKEN), journalWithEntry(), 5, TOKEN)
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'GET, HEAD')
})

test('HEAD отдаёт заголовки без тела', async () => {
  const response = journalResponse(request('HEAD', TOKEN), journalWithEntry(), 5, TOKEN)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '')
})

test('payload отдаёт не больше historySize, новые первыми', () => {
  const journal = createJournal()
  for (let index = 0; index < 7; index += 1) {
    journal.push({
      at: index, sessionId: `s${index}`, action: 'refresh', source: 'heuristic', items: 1, reason: 'r',
    })
  }
  const payload = nudgePayload(journal, 5, 42)
  assert.equal(payload.at, 42)
  assert.deepEqual(payload.entries.map(item => item.at), [6, 5, 4, 3, 2])
})

test('имена маршрута и глобала стабильны', () => {
  assert.equal(NUDGES_PATH, '/todo-watch/nudges')
  assert.equal(PAGE_GLOBAL, '__TODO_WATCH__')
})
