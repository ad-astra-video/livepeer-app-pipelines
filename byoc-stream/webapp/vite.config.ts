import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';
// https://vitejs.dev/config/
export default defineConfig({
  server: {
      https: {
          key: fs.readFileSync('./selfsigned.key'),
          cert: fs.readFileSync('./selfsigned.crt')
      },
      port: 3001,
      host: '0.0.0.0'
  },
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
})
