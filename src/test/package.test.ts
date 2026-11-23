/**
 * Тест манифеста и метаданных пакета: строка патча, экспорты, локали и иконка.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// dist.test/src/test → корень пакета.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const readJson = async (path: string): Promise<any> => JSON.parse(await readFile(path, 'utf8'))

test('package.json: имя, точка входа и клиентская половина', async () => {
  const pkg = await readJson(join(root, 'package.json'))
  assert.equal(pkg.name, '@local/dsh-todo-watch')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.exports['.'], './dist/index.js')
  assert.equal(pkg.exports['./client'], './dist/client.js')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.files.includes('dist/client.js'))
  assert.ok(pkg.files.includes('icon.svg'))
})

test('cordis.patch.yml: полный пресет standard и строка сторожа', async () => {
  const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  // Сторож и его конфигурация.
  assert.match(patch, /id: todo-watch/)
  // Имя строки обязано быть именем пакета: сканер клиентских модулей берёт
  // только строки-пакеты, иначе клиентская половина не попадает в страницу.
  assert.match(patch, /name: '@local\/dsh-todo-watch'\n\s+config:/)
  assert.doesNotMatch(patch, /@local\/dsh-todo-watch\/host/)
  assert.match(patch, /mode: watcher/)
  assert.match(patch, /mode: tool/)
  assert.match(patch, /checkIntervalSeconds: 30/)
  // Пресет переиздан целиком: обязательные части штатного пресета на месте,
  // иначе новая сессия не создаётся (agent-preset/invalid).
  assert.match(patch, /id: preset-standard/)
  assert.match(patch, /PlanModeConfig|section: \|/)
  assert.match(patch, /provider: spawn/)
  // Инструмент TODO заменён на нашу копию с объявлением события проверки.
  assert.match(patch, /name: '@local\/dsh-todo-watch'/)
  assert.doesNotMatch(patch, /name: '@deepseek-ai\/dsh-tool-todo'/)
})

test('локали несут заголовок, описание и страницу плагина', async () => {
  for (const locale of ['ru', 'en', 'zh']) {
    const dict = await readJson(join(root, 'locale', `${locale}.json`))
    assert.ok(dict.meta?.title, `${locale}: нет meta.title`)
    assert.ok(dict.meta?.description, `${locale}: нет meta.description`)
    assert.equal(dict.meta.detail, 'docs/DETAIL.md')
    assert.ok(dict.nav, `${locale}: нет nav`)
  }
})

test('иконка — валидный маленький SVG', async () => {
  const icon = await readFile(join(root, 'icon.svg'), 'utf8')
  assert.match(icon, /^<svg[\s>]/)
  assert.ok((await stat(join(root, 'icon.svg'))).size < 256 * 1024)
})

test('документ плагина существует', async () => {
  const detail = await readFile(join(root, 'docs', 'DETAIL.md'), 'utf8')
  assert.ok(detail.length > 500)
})
