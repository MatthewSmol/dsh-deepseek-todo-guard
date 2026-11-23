/**
 * Дописывает расширение .js к относительным импортам в собранном dist/: Node
 * требует его в ESM, а tsc сохраняет путь как в исходнике.
 *
 * Правило: путь, начинающийся с «./» или «../» и не оканчивающийся на
 * расширение, получает `.js`. Идемпотентно — повторный запуск ничего не меняет.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
/** Импорт из строки, динамический import() и ре-экспорт e из модуля. */
const SPEC = /(\bfrom\s+|\bimport\s*\(\s*|\bexport\s*\*\s*from\s*)(['"])(\.\.?\/[^'"]+)\2/g

/** Все .js под dist, кроме клиентского бандла. */
async function listJs(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'vite-client') continue
      out.push(...await listJs(full))
    } else if (entry.name.endsWith('.js') && full !== join(dist, 'client.js')) {
      out.push(full)
    }
  }
  return out
}

let changed = 0
for (const file of await listJs(dist)) {
  const source = await readFile(file, 'utf8')
  const next = source.replace(SPEC, (match, head, quote, spec) => {
    if (extname(spec) !== '') return match
    changed += 1
    return `${head}${quote}${spec}.js${quote}`
  })
  if (next !== source) await writeFile(file, next, 'utf8')
}
console.log(`[todo-watch:fix-imports] поправлено импортов: ${changed}`)
