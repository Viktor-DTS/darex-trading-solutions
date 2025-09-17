import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Оптимізація для продакшену
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Видаляємо console.log в продакшені
        drop_debugger: true,
      },
    },
    // Розбиваємо код на чанки
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor чанки
          vendor: ['react', 'react-dom'],
          // UI чанки
          ui: ['react-i18next', 'i18next'],
          // API чанки
          api: ['axios'],
          // Excel чанки
          excel: ['exceljs', 'xlsx', 'xlsx-js-style'],
        },
      },
    },
    // Оптимізація розміру
    chunkSizeWarningLimit: 1000,
  },
  // Оптимізація dev сервера
  server: {
    hmr: {
      overlay: false, // Вимікаємо overlay для кращої продуктивності
    },
  },
  // Оптимізація CSS
  css: {
    devSourcemap: false,
  },
  // Оптимізація esbuild
  esbuild: {
    drop: ['console', 'debugger'], // Видаляємо console.log в продакшені
  },
})
