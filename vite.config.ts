import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'lucide-react',
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('error', (error, _request, response) => {
            console.error('Compile server proxy error:', error.message)
            if (response.headersSent) return
            response.writeHead(503, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({
              error: 'Compile server is unavailable at http://localhost:3001.',
              details: 'Start it in a second terminal with "npm run server", then retry.',
            }))
          })
        },
      },
    },
  },
})
