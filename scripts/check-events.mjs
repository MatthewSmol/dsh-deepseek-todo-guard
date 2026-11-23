/**
 * Проверка объявлений событий лога.
 *
 * DSH принимает запись события только если тип объявлен в дополняемом словаре
 * `SessionEventMap`, а объявления в собранном коде остаются как значения
 * `Symbol.for('<тип>')` (их ставит плагин `declare`). Плагин дописывает
 * `todo-watch/check` и повторяет `todo/write`, поэтому обе сигнатуры обязаны
 * остаться в собранном модуле и его относительных импортах.
 */
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Собрать исходник модуля и все его относительные импорты вглубь. */
async function collect(file, seen = new Map()) {
  if (seen.has(file)) return seen
  const code = await readFile(file, 'utf8')
  seen.set(file, code)
  for (const match of code.matchAll(/(?:from|import)\s*(["'])(\.\/[^"']+)\1/g)) {
    await collect(join(dirname(file), match[2]), seen)
  }
  return seen
}

const files = await collect(join(root, 'dist', 'index.js'))
const code = [...files.values()].join('\n')
const declared = (type) => code.includes(`Symbol.for("${type}")`) || code.includes(`Symbol.for('${type}')`)

let ok = true
for (const type of ['todo/write', 'todo-watch/check']) {
  if (!declared(type)) {
    console.error(`[todo-watch:check-events] нет сигнатуры Symbol.for('${type}') в собранном коде`)
    ok = false
  }
}
if (!ok) process.exit(1)
console.log(`[todo-watch:check-events] сигнатуры объявлены, модулей проверено: ${files.size}`)
