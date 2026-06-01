/**
 * 自定义标签持久化
 *
 * 每个分类独立存储到 localStorage，支持增删查。
 * 自定义标签在弹窗中与预设标签一起渲染，支持即时删除。
 */
import { ref, watch } from 'vue'

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

/** 自定义标签的响应式容器 */
export function useCustomTags(category: string) {
  const items = ref<string[]>(load(category))

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
