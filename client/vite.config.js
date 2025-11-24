import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    devSourcemap: false,
  },
  build: {
    sourcemap: false,
  },
  server: {
    hmr: {
      overlay: false
    },
    
    // --- ADD THESE LINES ---
    host: true, // Make server accessible externally
    allowedHosts: [
      '.ngrok-free.dev' // Allows any ngrok free URL
    ]
    // -----------------------
  }
})