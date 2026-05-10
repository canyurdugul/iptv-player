import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Only polyfill what matroska-subtitles actually needs
      include: ['buffer', 'events', 'stream', 'util', 'zlib'],
      globals: { Buffer: true },
    }),
  ],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    include: ['shaka-player'],
  },
})
