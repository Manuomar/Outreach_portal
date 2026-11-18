import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: /api → XAMPP Apache (http://localhost/pitch-portal/public)
// Prod: built into /outreach_portal/frontend/ subfolder on vdsai.com
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Production base path — where the frontend is served from on the web server
  // Must match the actual subfolder path on the server
  const base = mode === 'production'
    ? '/outreach_portal/frontend/'
    : '/'

  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost/pitch-portal/public',
          changeOrigin: true,
        },
      },
    },
    build: {
      // Warn threshold for chunk size (in KB). 900 is reasonable for this app.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Split vendor libraries into a separate chunk
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  }
})
