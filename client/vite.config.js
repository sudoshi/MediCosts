import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Load PORT from project root .env so proxy matches server
const envPath = path.resolve(process.cwd(), '../.env')
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8')
  const portMatch = env.match(/^PORT=(\d+)/m)
  if (portMatch) process.env.PORT = portMatch[1]
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['prop-types'],
  },
  server: {
    port: 5180,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 3090}`,
        changeOrigin: true,
      },
    },
  },
})
