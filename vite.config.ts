import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'md-editor': ['md-editor-v3'],
          'naive-ui': ['naive-ui'],
          'vicons': ['@vicons/ionicons5'],
          'tiptap': ['@tiptap/starter-kit', '@tiptap/vue-3', '@tiptap/extension-character-count'],
          'sortable': ['sortablejs', 'vuedraggable'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.scenario.ts'],
    exclude: ['src/__tests__/e2e/**'],
  },
})
