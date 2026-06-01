/**
 * 自定义标签持久化
 *
 * 每个分类独立存储到 localStorage，支持增删查。
 * 自定义标签在弹窗中与预设标签一起渲染，支持即时删除。
 * 使用模块级单例缓存，避免多实例竞争覆盖（对标 useCustomLabels）。
 */
import { ref, watch, type Ref } from 'vue'

const LS_PREFIX = 'ns:customTags:'

function load(category: string): string[] {
  try {
    const raw = localStorage.getItem(LS_PREFIX + category)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(category: string, items: string[]) {
  try {
    localStorage.setItem(LS_PREFIX + category, JSON.stringify(items))
  } catch { /* quota exceeded, ignore */ }
}

// 模块级单例缓存：category → ref<string[]>
const _cache = new Map<string, Ref<string[]>>()

/** 自定义标签的响应式容器 */
export function useCustomTags(category: string) {
  const cached = _cache.get(category)
  if (cached) {
    return {
      items: cached,
      add(tag: string) {
        const t = tag.trim()
        if (!t) return
        if (cached.value.includes(t)) return
        cached.value.push(t)
      },
      remove(tag: string) {
        cached.value = cached.value.filter(t => t !== tag)
      },
    }
  }

  const items = ref<string[]>(load(category))
  _cache.set(category, items)

  watch(items, (val) => save(category, val), { deep: true })

  function add(tag: string) {
    const t = tag.trim()
    if (!t) return
    if (items.value.includes(t)) return
    items.value.push(t)
  }

  function remove(tag: string) {
    items.value = items.value.filter(t => t !== tag)
  }

  return { items, add, remove }
}
