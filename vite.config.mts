/**
 * Браузерная сборка «Сторожа TODO».
 *
 * DSH загружает dist/client.js как классический IIFE, который сам вызывает
 * window.__ModuleLoader__.load. React берётся из таблицы модулей загрузчика
 * через require('react'), поэтому в бандл он не попадает: react (и
 * react/jsx-runtime) объявлены внешними, а Vite подставляет для них фабрику
 * `require` из рантайма модуля. CSS подключается через `?inline` и уезжает
 * строкой внутрь бандла — отдельного файла стилей нет.
 */
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
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
    rollupOptions: {
      // Второй React сломал бы хуки страницы: берём React из загрузчика DSH.
      external: [/^react(\/.*)?$/],
      output: {
        // Оба имени указывают на фабрику require из области модуля: после
        // минификации бандла это вызов require('react') из загрузчика DSH.
        globals: (id: string) => (id === 'react' ? '__todoWatchReact' : '__todoWatchJsx'),
      },
    },
  },
  esbuild: {
    legalComments: 'none',
    drop: ['debugger'],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  optimizeDeps: { noDiscovery: true },
  logLevel: 'warn',
})
