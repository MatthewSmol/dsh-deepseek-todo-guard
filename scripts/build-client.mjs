/**
 * Сборка клиентской половины без бандлера.
 *
 * tsc компилирует `src/client` в CommonJS, после чего скрипт оборачивает код в
 * контракт загрузчика DSH:
 *
 *   window.__ModuleLoader__.load({ id, factory(require) { … return module.exports } })
 *
 * Внутри фабрики работает `require('react')` — React отдаёт таблица модулей
 * страницы. Затем terser минифицирует результат и проверяет контракт.
 */
import { readFile, rm, writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { minify } from 'terser'

const root = new URL('..', import.meta.url).pathname
const built = join(root, '.client-build')
const source = join(built, 'index.js')
const outDir = join(root, 'dist')
const outFile = join(outDir, 'client.js')

const PACKAGE_ID = '@local/dsh-todo-watch'
const MAX_BYTES = 250 * 1024

/** Обернуть CommonJS-код в регистрацию фабрики загрузчика. */
function wrap(body) {
  return [
    `/* «Сторож TODO» — панель журнала подсказок. Сгенерировано ${new Date().toISOString()} */`,
    `window.__ModuleLoader__.load({id:${JSON.stringify(PACKAGE_ID)},factory:require=>{`,
    'var module={exports:{}};var exports=module.exports;',
    body,
    'return module.exports}});',
    '',
  ].join('\n')
}

const raw = await readFile(source, 'utf8')
const wrapped = wrap(raw)
const minified = await minify(wrapped, {
  ecma: 2022,
  compress: { passes: 2, toplevel: false },
  mangle: true,
  format: { comments: false },
})
const code = minified.code ?? ''

if (!code.includes('__ModuleLoader__.load')) throw new Error('клиент: нет регистрации загрузчика')
if (!code.includes(PACKAGE_ID)) throw new Error('клиент: нет имени пакета')
for (const name of ['sidebar.panellist', 'todo-watch-log', 'main']) {
  if (!code.includes(name) && !code.includes(name.replaceAll("'", '"'))) {
    throw new Error(`клиент: нет регистрации ${name}`)
  }
}
if (/\}\)\(__\w+\)/.test(code)) throw new Error('клиент: IIFE вызывается с внешней переменной')
if (!code.trimEnd().endsWith('});')) throw new Error('клиент: неожиданный конец бандла')

await mkdir(outDir, { recursive: true })
await writeFile(outFile, code, 'utf8')
await rm(built, { recursive: true, force: true })

const bytes = (await stat(outFile)).size
const gzip = gzipSync(code).length
const brotli = brotliCompressSync(code).length
console.log(`[todo-watch:build-client] dist/client.js ${bytes} Б (gzip ${gzip} Б, brotli ${brotli} Б)`)
if (bytes > MAX_BYTES) throw new Error(`клиент: ${bytes} Б больше лимита ${MAX_BYTES} Б`)
