import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('qrcode.react')) {
            return 'vendor-qr'
          }
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts'
          }
          if (id.includes('framer-motion') || id.includes('motion-')) {
            return 'vendor-motion'
          }
          if (
            id.includes('/react/') ||
            id.includes('\\react\\') ||
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler')
          ) {
            return 'vendor-react'
          }
          return undefined
        },
      },
    },
  },
}))
