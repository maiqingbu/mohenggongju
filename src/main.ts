import { createApp, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { NMessageProvider, NConfigProvider, NDialogProvider } from 'naive-ui'
import { naiveTheme } from './composables/useTheme'
import App from './App.vue'

async function bootstrap() {
  const pinia = createPinia()
  setActivePinia(pinia) // 在 app.mount 前激活，允许 useStore() 提前调用

  // 加载平台题材匹配矩阵（非阻塞）
  import('./data/平台题材匹配矩阵.csv?raw').then(m => {
    import('./composables/usePlatformData').then(({ initPlatformData }) => {
      initPlatformData(m.default)
    })
  }).catch(() => {})

  const { isTauri } = await import('./composables/useLocalWorkTree')
  const tauri = isTauri()

  if (tauri) {
    try {
      const { initDatabase } = await import('./composables/useDatabase')
      await initDatabase()
      const { useWorkStore } = await import('./stores/workStore')
      useWorkStore().dbReady = true
      // 预载 keychain 中的 API Key 到内存缓存
      const { useModelStore } = await import('./stores/modelStore')
      const store = useModelStore()
      await store.preloadKeys(store.builtInProviders.map(p => p.id))
    } catch (err) {
      console.error('[bootstrap] Tauri DB init failed:', err)
      // 安全回退：即使 DB 失败也让应用正常挂载
      const { useWorkStore } = await import('./stores/workStore')
      useWorkStore().dbReady = true
    }
  } else {
    const { useWorkStore } = await import('./stores/workStore')
    useWorkStore().dbReady = true
  }

  const app = createApp({
    setup() {
      return () => h(NConfigProvider, { theme: naiveTheme.value }, {
        default: () => h(NMessageProvider, null, {
          default: () => h(NDialogProvider, null, {
            default: () => h(App)
          })
        })
      })
    }
  })
  app.use(pinia)
  app.mount('#app')
}

bootstrap()
