/**
 * Браузерная сборка «Сторожа TODO».
 *
 * DSH загружает dist/client.js как классический IIFE, который сам вызывает
 * window.__ModuleLoader__.load. React берётся из таблицы модулей загрузчика
 * через require('react'), поэтому в бандл он не попадает: импорты `react` и
 * `react/jsx-runtime` подменяются локальным мостом (src/client/react-bridge.ts),
 * а ссылка на React передаётся в мост из фабрики модуля. CSS подключается
 * через `?inline` и уезжает строкой внутрь бандла.
 */
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const bridge = resolve(process.cwd(), 'src/client/react-bridge.ts')

export default defineConfig({
  resolve: {
    alias: [
      // Второй React сломал бы хуки страницы: все три входа ведут к мосту.
      { find: /^react$/, replacement: bridge },
      { find: /^react\/jsx-runtime$/, replacement: bridge },
      { find: /^react\/jsx-dev-runtime$/, replacement: bridge },
    ],
  },
  build: {
    lib: {
      entry: resolve(process.cwd(), 'src/client/client.tsx'),
      formats: ['iife'],
      name: 'TodoWatchClient',
      fileName: () => 'client.raw.js',
    },
    outDir: 'dist/vite-client',
    emptyOutDir: true,
    target: 'es2022',
    // Минификация обязательна: esbuild сжимает и JS, и встроенный CSS.
    minify: 'esbuild',
    cssCodeSplit: false,
    cssMinify: true,
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 2048,
  },
  esbuild: {
    legalComments: 'none',
    drop: ['debugger'],
    // Автоматический JSX-рантайм: esbuild сам тянет `react/jsx-runtime`, а он
    // приведён к мосту выше. Классический трансформ (по умолчанию) ждал бы
    // глобальную переменную `React`, которой в бандле нет.
    jsx: 'automatic',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  optimizeDeps: { noDiscovery: true },
  logLevel: 'warn',
})
