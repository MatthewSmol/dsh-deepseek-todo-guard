/**
 * Клиентский бандл: контракт загрузчика DSH и регистрации в слотах.
 *
 * Бандл грузится в песочницу с подставными `__ModuleLoader__`, `require('react')`
 * и минимальным DOM: так проверяется и контракт, и то, что панель реально
 * строится из ответа маршрута.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const bundlePath = join(root, 'dist', 'client.js')

/** Подставной React: каждый элемент — простой объект для чтения дерева. */
function fakeReact(): any {
  return {
    createElement(type: any, props: any, ...children: any[]): any {
      return { type, props: props ?? {}, children: children.flat() }
    },
    useState(initial: any): any {
      const value = typeof initial === 'function' ? initial() : initial
      return [value, () => {}]
    },
    useEffect(): void { /* эффекты в этом тесте не выполняются */ },
    useMemo(factory: () => any): any { return factory() },
  }
}

/** Один прогон бандла в песочнице. */
async function load(): Promise<any> {
  const code = await readFile(bundlePath, 'utf8')
  const registrations: any[] = []
  const injected: string[] = []
  const dictionaries: any[] = []
  let factory: ((require: (id: string) => any) => any) | undefined
  let registeredId: string | undefined

  const sandbox: any = {
    window: {},
    globalThis: {},
    document: {
      getElementById: () => null,
      head: { appendChild: () => {} },
      createElement: () => ({ id: '', textContent: '' }),
    },
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ version: 1, at: 1, historySize: 5, entries: [] }) }),
    console,
  }
  sandbox.globalThis = sandbox
  sandbox.__ModuleLoader__ = {
    load(entry: any) {
      registeredId = entry.id
      factory = entry.factory
    },
  }
  sandbox.window.__ModuleLoader__ = sandbox.__ModuleLoader__

  const context = vm.createContext(sandbox)
  vm.runInContext(code, context, { filename: 'client.js' })
  assert.ok(factory, 'бандл должен зарегистрировать фабрику')
  assert.equal(registeredId, '@local/dsh-todo-watch')

  const exports = factory!((id: string) => {
    assert.equal(id, 'react', 'клиент требует только react')
    return fakeReact()
  })

  const ctx = {
    effect: (create: () => () => void) => create(),
    locale: {
      register: (namespace: string, dicts: any) => { dictionaries.push({ namespace, dicts }); return () => {} },
      bind: (namespace: string) => (key: string) => `${namespace}:${key}`,
    },
    slots: {
      inject(name: string, create: () => () => void) { injected.push(name); create(); return () => {} },
      register: (registration: any, component: any) => { registrations.push({ registration, component }); return () => {} },
    },
  }
  exports.apply(ctx)
  return { exports, registrations, injected, dictionaries }
}

test('бандл: контракт загрузчика и имя пакета', async () => {
  const code = await readFile(bundlePath, 'utf8')
  assert.match(code, /__ModuleLoader__\.load/)
  assert.match(code, /@local\/dsh-todo-watch/)
  assert.ok(code.trimEnd().endsWith('});'))
})

test('бандл: регистрирует панель и пункт сайдбара, без лишнего', async () => {
  const { registrations, injected } = await load()
  const names = registrations.map((item: any) => item.registration.name).sort()
  assert.deepEqual(names, ['main', 'sidebar.panellist'])

  const panel = registrations.find((item: any) => item.registration.name === 'main')
  assert.equal(panel?.registration.key, 'todo-watch-log')
  assert.equal(panel?.registration.locale, 'todo-watch')

  const icon = registrations.find((item: any) => item.registration.name === 'sidebar.panellist')
  assert.equal(icon?.registration.id, 'todo-watch-log')
  assert.equal(icon?.registration.order, 45)
  assert.equal(typeof icon?.registration.label, 'function')
  assert.equal(icon?.registration.label(), 'todo-watch:title')

  assert.deepEqual(injected.sort(), ['main', 'sidebar.panellist'])
})

test('бандл: словари ru/en/zh с заголовком', async () => {
  const { dictionaries } = await load()
  const entry = dictionaries.find((item: any) => item.namespace === 'todo-watch')
  assert.ok(entry)
  assert.deepEqual(Object.keys(entry.dicts).sort(), ['en', 'ru', 'zh'])
  // Набор ключей одинаков во всех языках: недоперевод виден сразу.
  const keysOf = (language: string): string[] => Object.keys(entry.dicts[language]).sort()
  assert.deepEqual(keysOf('ru'), keysOf('en'))
  assert.deepEqual(keysOf('ru'), keysOf('zh'))
  for (const language of ['ru', 'en', 'zh']) {
    for (const [key, value] of Object.entries(entry.dicts[language])) {
      assert.equal(typeof value, 'string', `${language}.${key}: не строка`)
      assert.ok((value as string).length > 0, `${language}.${key}: пустая строка`)
    }
  }
  // Русский и английский интерфейс действительно переведены, а не скопированы.
  assert.equal(entry.dicts.ru.title, 'Сторож TODO')
  assert.equal(entry.dicts.en.title, 'TODO watcher')
})

test('бандл: панель без привязки страницы сообщает «нет связи»', async () => {
  const { exports } = await load()
  const t = (key: string) => key
  assert.equal(exports.panelNote({ loading: true, online: false, items: 0 }, t), '…')
  assert.equal(exports.panelNote({ loading: false, online: false, items: 0 }, t), 'offline. offlineHint')
  assert.equal(exports.panelNote({ loading: false, online: true, items: 0 }, t), 'empty')
  assert.equal(exports.panelNote({ loading: false, online: true, items: 2 }, t), null)
})

test('бандл: панель рисует заголовок и подзаголовок', async () => {
  const { exports } = await load()
  const tree = exports.JournalPanel({ t: (key: string) => key })
  const text = flatten(tree).join(' ')
  assert.match(text, /title/)
  assert.match(text, /subtitle/)
})

test('бандл: иконка сайдбара — svg нужного размера', async () => {
  const { exports } = await load()
  const icon = exports.JournalIcon({ size: 20, active: false })
  assert.equal(icon.type, 'svg')
  assert.equal(icon.props.width, 20)
  assert.equal(icon.props.height, 20)
})

/** Собрать текст из дерева подставного React. */
function flatten(node: any): string[] {
  if (node === null || node === undefined || node === false) return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(item => flatten(item))
  return flatten(node.children)
}
