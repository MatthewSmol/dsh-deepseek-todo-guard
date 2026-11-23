/**
 * Финальная упаковка браузерного бандла.
 *
 * Vite уже отдал минифицированный IIFE с встроенным через `?inline` CSS.
 * Скрипт проверяет контракт модуля DSH, пишет dist/client.js и печатает
 * размеры до/после минификации. Сборка падает при нарушении контракта или
 * при превышении лимита — молча отдавать «тяжёлый» бандл нельзя.
 */
import { readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawPath = join(root, 'dist/vite-client/client.raw.js')
const outPath = join(root, 'dist/client.js')
const metaPath = join(root, 'dist/client.meta.json')
/** Предел размера бандла: панель и иконка должны быть маленькими. */
const MAX_BYTES = 250 * 1024
/** Корневой класс: он доказывает, что CSS попал в бандл. */
const CSS_MARKER = 'todo-watch-root'

/** Остановить сборку с понятным сообщением. */
function fail(message) {
  console.error(`[todo-watch:build-client] ${message}`)
  process.exit(1)
}

const raw = await readFile(rawPath, 'utf8').catch(() => fail(`нет файла ${rawPath}; сначала запустите vite build`))

if (/^\s*(?:import|export)\s/m.test(raw)) fail('в собранном клиенте остался синтаксис модулей')
if (!raw.startsWith('(function(') && !raw.startsWith('(function()')) fail('вывод vite — не IIFE')
if (!raw.includes('__ModuleLoader__')) fail('в бандле потерян вызов загрузчика модулей DSH')
// React обязан идти из загрузчика DSH, а не из бандла: ровно одна фабрика.
const reactCalls = raw.match(/__todoWatchReact/g)?.length ?? 0
if (reactCalls !== 1) fail(`ожидалась ровно одна ссылка на require('react'), найдено ${reactCalls}`)
if (/import\s*\{[^}]*createElement[^}]*\}\s*from\s*["']react/.test(raw)) fail('React попал в бандл')
if (!raw.includes(CSS_MARKER)) fail('CSS не встроен в бандл')
if (raw.includes('process.env')) fail('в браузерный бандл утёк process.env')
if (raw.includes('sourceMappingURL')) fail('в бандле осталась ссылка на source map')

const banner = '/* «Сторож TODO» для DSH: клиентский бандл. Собран scripts/build-client.mjs — не редактируйте. */\n'
const body = `${banner}${raw}\n`
const bytes = Buffer.byteLength(body)
if (bytes > MAX_BYTES) fail(`бандл ${bytes} байт больше лимита ${MAX_BYTES}`)

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, body, 'utf8')
await rm(join(root, 'dist/vite-client'), { recursive: true, force: true })

const hash = createHash('sha256').update(body).digest('hex').slice(0, 16)
const minBody = body
const gz = gzipSync(minBody, { level: 9 }).length
const br = brotliCompressSync(minBody, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
const meta = { bytes, gzipBytes: gz, brotliBytes: br, hash, builtAt: new Date().toISOString() }
await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')

const srcBytes = (await stat(join(root, 'src/client'))).size
console.log(`[todo-watch:build-client] dist/client.js ${bytes} Б (gzip ${gz} Б, brotli ${br} Б, sha256 ${hash})`)
console.log(`[todo-watch:build-client] исходники клиента: ${srcBytes} Б, сжатие обязательно: minify esbuild`)
