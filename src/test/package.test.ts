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
  // Клиентской половины нет: плашка задач — штатная панель DSH.
  assert.equal(pkg.dsh.client, undefined)
  assert.equal(pkg.exports['./client'], undefined)
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

test('локали несут заголовок, описание и страницу плагина', async () => {
  for (const locale of ['ru', 'en', 'zh']) {
    const dict = await readJson(join(root, 'locale', `${locale}.json`))
    assert.ok(dict.meta?.title, `${locale}: нет meta.title`)
    assert.ok(dict.meta?.description, `${locale}: нет meta.description`)
    assert.equal(dict.meta.detail, 'docs/DETAIL.md')
  }
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
