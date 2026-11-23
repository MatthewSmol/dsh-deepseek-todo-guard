/**
 * Проверка браузерного бандла «Сторожа TODO».
 *
 * Бандл — классический IIFE, который сам вызывает
 * `window.__ModuleLoader__.load`. Здесь он загружается так же, как в DSH:
 * фабрика получает `require`, React подменяется заглушкой. Тест ловит три
 * ошибки, которые уже случались: вызов IIFE с неопределённой переменной,
 * отсутствие регистраций слотов и падение панели при отрисовке.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Заглушка React: элементы — обычные объекты, хуки не выполняются. */
const REACT_STUB = {
  createElement: (type: unknown, props: unknown, ...kids: unknown[]) => ({ type, props, kids }),
  useEffect: () => {},
  useState: (value: unknown) => [value, () => {}],
  Fragment: Symbol('fragment'),
}

/** Контекст-заглушка клиента: собирает регистрации слотов и словари. */
function fakeClient() {
  const slots = new Map<string, (props: any) => any>()
  const dictionaries: string[][] = []
  const ctx = {
    locale: {
      register: (_ns: string, dicts: Record<string, unknown>) => {
        dictionaries.push(Object.keys(dicts))
        return () => {}
      },
      bind: (ns: string) => (key: string, params?: Record<string, unknown>) =>
        (params ? `${ns}:${key}:${JSON.stringify(params)}` : `${ns}:${key}`),
    },
    effect: (create: () => () => void) => create(),
    slots: {
      inject: (_name: string, callback: () => () => void) => callback(),
      register: (options: any, component: (props: any) => any) => {
        slots.set(`${options.name}:${options.key ?? options.id ?? ''}`, component)
        return () => {}
      },
    },
  }
  return { ctx, slots, dictionaries }
}

test('клиентский бандл загружается и регистрирует панель и пункт сайдбара', async () => {
  const code = await readFile(join(root, 'dist', 'client.js'), 'utf8')
  let factory: ((require: (id: string) => unknown) => any) | undefined
  const sandbox: Record<string, any> = {
    console,
    window: { __ModuleLoader__: { load: (definition: any) => { factory = definition.factory } } },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  // Если IIFE вызывается с неопределённой внешней переменной, здесь будет
  // ReferenceError — это и есть регрессия «пустой сайдбар».
  new vm.Script(code, { filename: 'client.js' }).runInContext(sandbox)
  assert.ok(factory !== undefined, 'загрузчик модулей не получил фабрику')

  const plugin = factory!((id: string) => {
    assert.equal(id, 'react', `неожиданный импорт: ${id}`)
    return REACT_STUB
  })
  // Массивы приходят из песочницы vm: сравниваю сериализацией, а не по прототипу.
  assert.equal(JSON.stringify(plugin.inject), '["slots","locale"]')

  const { ctx, slots, dictionaries } = fakeClient()
  plugin.apply(ctx)
  assert.equal(JSON.stringify(dictionaries), '[["ru","en","zh"]]')
  assert.ok(slots.has('main:todo-watch'), 'панель не зарегистрирована')
  assert.ok(slots.has('sidebar.panellist:todo-watch'), 'пункт сайдбара не зарегистрирован')
})

test('панель и иконка отрисовываются на данных сессии', async () => {
  const code = await readFile(join(root, 'dist', 'client.js'), 'utf8')
  let factory: ((require: (id: string) => unknown) => any) | undefined
  const sandbox: Record<string, any> = {
    console,
    window: { __ModuleLoader__: { load: (definition: any) => { factory = definition.factory } } },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  new vm.Script(code, { filename: 'client.js' }).runInContext(sandbox)
  const { ctx, slots } = fakeClient()
  factory!((id: string) => REACT_STUB).apply(ctx)

  const panel = slots.get('main:todo-watch')!({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    sessionId: 's1',
    useProjection: (key: string) => (key === 'todos'
      ? [{ content: 'проверить сборку', status: 'in_progress' }, { content: 'закоммитить', status: 'completed' }]
      : null),
  })
  // Панель — компонент-обёртка, которая подставляет CSS и словарь; корневой
  // узел получается вторым шагом.
  assert.equal(typeof panel.type, 'function')
  const tree = panel.type(panel.props)
  assert.equal(tree.type, 'div')
  // Дети автоматического JSX-рантайма лежат в props.children.
  const children: Array<{ type?: unknown }> = Array.isArray(tree.props.children)
    ? tree.props.children
    : [tree.props.children]
  assert.ok(children.length >= 3, `панель без разделов: ${children.length}`)
  const titles = JSON.stringify(children.map(child => child?.type))
  assert.match(titles, /header/)

  const icon = slots.get('sidebar.panellist:todo-watch')!({ size: 16, active: true })
  assert.equal(icon.type, 'svg')
  assert.equal(icon.props.width, 16)
})
