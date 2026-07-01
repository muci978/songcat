import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron 在 devDependencies，externalizeDepsPlugin 只处理 dependencies，
// 故显式把 electron 列为 external，避免它被内联进 main/preload bundle
// （否则生产环境 main 会执行 electron npm 包的 getElectronPath 而崩溃）。
const EXTERNAL = ['electron']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main')
      }
    },
    build: {
      rollupOptions: {
        external: EXTERNAL,
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@preload': resolve(__dirname, 'src/preload')
      }
    },
    build: {
      rollupOptions: {
        external: EXTERNAL,
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
})
