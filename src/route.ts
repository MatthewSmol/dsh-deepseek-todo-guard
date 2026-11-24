/**
 * HTTP-эндпоинт журнала для панели в сайдбаре.
 *
 * Панель — обычная страница в браузере, поэтому данные отдаёт маршрут на том же
 * loopback-сервере. Авторизации шлюза у такого маршрута нет, поэтому доступ
 * закрыт одноразовым токеном, который хост подставляет в HTML страницы через
 * `webserver/index-inject` (глобал `__TODO_WATCH__`). Токен меняется на каждом
 * старте процесса: старая вкладка получит 403 и покажет «нет связи».
 */

import type { Journal, NudgeRecord } from './journal.js'

/** Путь маршрута журнала. */
export const NUDGES_PATH = '/todo-watch/nudges'

/** Имя глобала, который страница читает перед запросом. */
export const PAGE_GLOBAL = '__TODO_WATCH__'

/** Имя заголовка с токеном. */
export const TOKEN_HEADER = 'x-todo-watch-token'

/** Тело ответа журнала. */
export interface NudgePayload {
  /** Версия формата ответа. */
  readonly version: 1
  /** Время ответа, мс эпохи — панель показывает «обновлено …». */
  readonly at: number
  /** Сколько записей запрошено к показу. */
  readonly historySize: number
  /** Записи, новые первыми. */
  readonly entries: NudgeRecord[]
}

/**
 * Собрать тело ответа из журнала.
 * @param journal - журнал подсказок.
 * @param historySize - сколько записей показывать.
 * @param now - текущее время, мс эпохи.
 * @returns тело ответа.
 */
export function nudgePayload(journal: Journal, historySize: number, now: number = Date.now()): NudgePayload {
  return { version: 1, at: now, historySize, entries: journal.list(historySize) }
}

/**
 * Ответ на запрос журнала.
 *
 * Разрешены только GET и HEAD; токен сравнивается целиком; содержимое не
 * кэшируется, чтобы панель всегда видела свежие подсказки.
 * @param request - входящий запрос Fetch.
 * @param journal - журнал подсказок.
 * @param historySize - сколько записей показывать.
 * @param token - ожидаемый токен страницы.
 * @returns ответ с JSON либо отказ.
 */
export function journalResponse(
  request: Request,
  journal: Journal,
  historySize: number,
  token: string,
): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' })
  }
  const provided = request.headers.get(TOKEN_HEADER)
  if (provided === null || provided !== token) {
    return json({ error: 'forbidden' }, 403)
  }
  const payload = nudgePayload(journal, historySize)
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: headers() })
  return json(payload, 200)
}

/** Заголовки ответа журнала: без кэша и с явным типом. */
function headers(extra: Record<string, string> = {}): Headers {
  return new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra })
}

/**
 * JSON-ответ с общими заголовками.
 * @param body - тело.
 * @param status - код ответа.
 * @param extra - дополнительные заголовки.
 * @returns ответ.
 */
function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(`${JSON.stringify(body)}\n`, { status, headers: headers(extra) })
}
