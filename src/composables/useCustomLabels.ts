/**
 * 用户自定义标签管理
 *
 * 每个标签类别（题材/子标签/元素/爽点/禁忌/情绪）允许用户添加自定义项
 * 持久化到 localStorage，key: ns:custom_labels
 * 内部使用 ref 保持响应式，添加/删除后自动触发 UI 刷新
 */

import { ref } from 'vue'

export type LabelCategory = 'genre' | 'subgenre' | 'element' | 'cool_point' | 'taboo' | 'emotion'

export const CATEGORY_NAMES: Record<LabelCategory, string> = {
  genre: '主题材',
  subgenre: '子标签',
  element: '核心元素',
  cool_point: '爽点',
  taboo: '禁忌',
  emotion: '情绪走向',
}

export interface CustomLabel {
  id: string
  category: LabelCategory
  value: string
  label: string
  createdAt: string
}

const STORAGE_KEY = 'ns:custom_labels'

// 响应式缓存 — 全局单例，解决"添加后不渲染"的 bug
const _cache = ref<CustomLabel[]>(loadFromStorage())

function loadFromStorage(): CustomLabel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function syncToStorage(labels: CustomLabel[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(labels)) } catch {}
}

export function getCustomLabels(category: LabelCategory): CustomLabel[] {
  return _cache.value.filter(l => l.category === category)
}

export function getAllCustomLabels(): CustomLabel[] {
  return _cache.value
}

export function addCustomLabel(category: LabelCategory, value: string, label: string): CustomLabel {
  // 去重
  const existing = _cache.value.find(l => l.category === category && l.value === value)
  if (existing) return existing

  const item: CustomLabel = {
    id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category,
    value,
    label,
    createdAt: new Date().toISOString(),
  }
  // 直接替换整个数组以触发 ref 的响应式更新
  _cache.value = [..._cache.value, item]
  syncToStorage(_cache.value)
  return item
}

export function removeCustomLabel(id: string): boolean {
  const idx = _cache.value.findIndex(l => l.id === id)
  if (idx === -1) return false
  _cache.value = _cache.value.filter(l => l.id !== id)
  syncToStorage(_cache.value)
  return true
}

/** 用于外部强制刷新（调试用） */
export function reloadCustomLabels() {
  _cache.value = loadFromStorage()
}

/** 仅测试用：清空所有自定义标签 */
export function resetAllLabels() {
  _cache.value = []
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}
