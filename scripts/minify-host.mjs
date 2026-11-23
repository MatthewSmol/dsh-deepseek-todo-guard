/**
 * Минификация Host-половины.
 *
 * tsc собирает dist/ с читаемыми именами и комментариями — это удобно для
 * отладки. Этот шаг прогоняет каждый .js из dist через terser: убирает
 * комментарии, схлопывает и сокращает имена. Исходники в src/ не трогаются.
 *
 * Лимиты: index.js — 60 КБ, watch/*.js — 20 КБ; превышение останавливает
 * сборку. Локали и тесты не минифицируются: их читают Plugin Manager и node --test.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { minify } from 'terser'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const LIMITS = { 'index.js': 60 * 1024, 'watch/watcher.js': 20 * 1024, 'watch/types.js': 20 * 1024 }

/** Перечислить .js для минификации: всё, кроме клиентского бандла, локалей и тестов. */
async function listJs(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'vite-client' || entry.name === 'test' || entry.name === 'client') continue
      out.push(...await listJs(full))
    } else if (entry.name.endsWith('.js') && full !== join(dist, 'client.js')) {
      out.push(full)
    }
  }
  return out
}

let totalBefore = 0
let totalAfter = 0
for (const file of await listJs(dist)) {
  const source = await readFile(file, 'utf8')
  const before = Buffer.byteLength(source)
  const result = await minify(source, {
    module: true,
    ecma: 2022,
    compress: { passes: 2, pure_getters: true, drop_debugger: true },
    mangle: true,
    format: { comments: false, ascii_only: false },
  })
  if (typeof result.code !== 'string') throw new Error(`terser не вернул код для ${file}`)
  await writeFile(file, `${result.code}\n`, 'utf8')
  const after = Buffer.byteLength(result.code) + 1
  totalBefore += before
  totalAfter += after
  const name = relative(dist, file)
  const limit = LIMITS[name]
  if (limit !== undefined && after > limit) {
    throw new Error(`${name}: ${after} Б больше лимита ${limit} Б`)
  }
  console.log(`[todo-watch:minify-host] ${name}: ${before} → ${after} Б (-${Math.round((1 - after / before) * 100)}%)`)
}
console.log(`[todo-watch:minify-host] всего: ${totalBefore} → ${totalAfter} Б`)
