import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000, // KB — збільшено, щоб не показувати попередження для великих чанків (Leaflet, tesseract.js, xlsx, exceljs)
  },
});
