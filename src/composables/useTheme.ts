import { ref, computed, watch } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalTheme } from 'naive-ui'

const isDark = ref(false)

// 初始化：从 localStorage 读取偏好
try {
  const saved = localStorage.getItem('ns:theme')
  if (saved === 'dark') isDark.value = true
} catch {}

// 持久化 + 同步 body class
watch(isDark, (v) => {
  document.body.classList.toggle('theme-dark', v)
  document.body.classList.toggle('theme-light', !v)
  try { localStorage.setItem('ns:theme', v ? 'dark' : 'light') } catch {}
}, { immediate: true })

export function useAppTheme() {
  function toggle() { isDark.value = !isDark.value }
  return { isDark, toggle }
}

/** 供 NConfigProvider 使用的响应式主题 */
export const naiveTheme = computed<GlobalTheme | null>(() => isDark.value ? darkTheme : null)
