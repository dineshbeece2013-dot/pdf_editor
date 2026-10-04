import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  server: {
    // In development the API runs separately (see server/). Proxying keeps the
    // browser on a single origin, so the session cookie is sent normally and
    // the server's Origin check matches APP_ORIGIN.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: false,
      },
    },
  },
})
