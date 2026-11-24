/**
 * Манифест и патч: плагин только Host-половина, одна строка, без подмены пресета.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const readJson = async (path: string): Promise<any> => JSON.parse(await readFile(path, 'utf8'))

test('package.json: host-only пакет с патчем', async () => {
  const pkg = await readJson(join(root, 'package.json'))
  assert.equal(pkg.name, '@local/dsh-todo-watch')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.exports['.'], './dist/index.js')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  // Клиентская половина: пункт сайдбара и панель журнала.
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.dsh.client.immediately, true)
  assert.deepEqual(pkg.dsh.client.inject, ['@deepseek-ai/dsh-client-locale'])
  assert.equal(pkg.exports['./client'], './dist/client.js')
  assert.deepEqual(Object.keys(pkg.dependencies), ['@deepseek-ai/schemastery'])
})

test('cordis.patch.yml: одна строка сторожа, без подмены пресета', async () => {
  const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: todo-watch/)
  assert.match(patch, /name: '@local\/dsh-todo-watch'/)
  assert.match(patch, /checkIntervalSeconds: 30/)
  assert.match(patch, /curator: llm/)
  // Пресет агента не переопределяем: чужая конфигурация ломала новые сессии.
  assert.doesNotMatch(patch, /preset-standard/)
  assert.doesNotMatch(patch, /dsh-tool-todo/)
  // Строка с подпутём в клиентскую таблицу не грузится.
  assert.doesNotMatch(patch, /@local\/dsh-todo-watch\//)
})

test('локали несут заголовок, описание и существующую страницу плагина', async () => {
  const detailByLocale: Record<string, string> = {
    ru: 'docs/DETAIL.ru.md',
    en: 'docs/DETAIL.md',
    zh: 'docs/DETAIL.md',
  }
  for (const locale of ['ru', 'en', 'zh']) {
    const dict = await readJson(join(root, 'locale', `${locale}.json`))
    assert.ok(dict.meta?.title, `${locale}: нет meta.title`)
    assert.ok(dict.meta?.description, `${locale}: нет meta.description`)
    assert.equal(dict.meta.detail, detailByLocale[locale], `${locale}: неверная страница плагина`)
    await stat(join(root, dict.meta.detail))
  }
})

test('локали: одинаковый набор ключей и непустые строки', async () => {
  const read = async (locale: string): Promise<any> => readJson(join(root, 'locale', `${locale}.json`))
  const [ru, en, zh] = await Promise.all([read('ru'), read('en'), read('zh')])
  assert.deepEqual(Object.keys(ru).sort(), Object.keys(en).sort())
  assert.deepEqual(Object.keys(ru).sort(), Object.keys(zh).sort())
  for (const [code, dict] of [['ru', ru], ['en', en], ['zh', zh]] as const) {
    assert.deepEqual(Object.keys(dict.meta).sort(), ['description', 'detail', 'title'], `${code}: поля meta`)
    for (const value of [dict.meta.title, dict.meta.description, dict.nav]) {
      assert.equal(typeof value, 'string')
      assert.ok(value.length > 0, `${code}: пустая строка`)
    }
  }
})

test('README на английском и русском, оба ссылаются друг на друга', async () => {
  const english = await readFile(join(root, 'README.md'), 'utf8')
  const russian = await readFile(join(root, 'README.ru.md'), 'utf8')
  assert.match(english, /^# TODO watcher/)
  assert.match(russian, /^# Сторож TODO/)
  assert.match(english, /README\.ru\.md/)
  assert.match(russian, /\(README\.md\)/)
  // Английский текст не должен содержать русских заголовков разделов.
  assert.doesNotMatch(english, /^## (Что делает|Установка|Настройка)/m)
})

test('иконка — валидный маленький SVG', async () => {
  const icon = await readFile(join(root, 'icon.svg'), 'utf8')
  assert.match(icon, /^<svg[\s>]/)
  assert.ok((await stat(join(root, 'icon.svg'))).size < 256 * 1024)
})

test('документ плагина существует и описывает новое поведение', async () => {
  const detail = await readFile(join(root, 'docs', 'DETAIL.md'), 'utf8')
  assert.ok(detail.length > 500)
  assert.match(detail, /todo\/write/)
})
