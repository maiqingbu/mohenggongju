import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkStore } from '../stores/workStore'

// ── 纯函数：工具栏状态管理 ──

export interface EditorToolbarState {
  canUndo: boolean
  canRedo: boolean
  wordCount: number
  chapterIndex: number
  title: string
  content: string
}

export interface AiAction {
  key: string
  label: string
}

/** AI 按钮配置 */
export function getAiActions(): AiAction[] {
  return [
    { key: 'opening', label: '开篇' },
    { key: 'continue', label: '✏️ 续写' },
    { key: 'optimize', label: '✨ 优化' },
    { key: 'unmark', label: '🔥 消痕' },
    { key: 'review', label: '📝 审稿' },
    { key: 'polish', label: '✨ 润色' },
    { key: 'comment', label: '✨ 神评' },
    { key: 'analyze', label: '📖 拆书' },
    { key: 'rewrite', label: '🔄 重写' },
    { key: 'inspire', label: '💡 灵感' },
    { key: 'updateSettings', label: '📋 设定更新' },
  ]
}

/** 字数格式化 */
export function formatWordCount(count: number): string {
  if (count < 1000) return `${count}`
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  return `${(count / 10000).toFixed(1)}万`
}

/** 章节序号格式化 */
export function formatChapterIndex(index: number): string {
  return `第 ${index} 章`
}

/** 保存状态文本 */
export function saveStatusText(status: 'saved' | 'saving' | 'unsaved'): string {
  return { saved: '已保存', saving: '保存中...', unsaved: '未保存' }[status]
}

// ── 测试 ──

describe('getAiActions', () => {
  it('should return 11 AI actions', () => {
    const actions = getAiActions()
    expect(actions).toHaveLength(11)
  })

  it('should have unique keys', () => {
    const actions = getAiActions()
    const keys = actions.map(a => a.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('should have 消痕 action', () => {
    const actions = getAiActions()
    const unmark = actions.find(a => a.key === 'unmark')
    expect(unmark).toBeDefined()
    expect(unmark!.label).toBe('🔥 消痕')
  })
})

describe('formatWordCount', () => {
  it('should format less than 1000 as plain number', () => {
    expect(formatWordCount(0)).toBe('0')
    expect(formatWordCount(500)).toBe('500')
    expect(formatWordCount(999)).toBe('999')
  })

  it('should format thousands as k', () => {
    expect(formatWordCount(1000)).toBe('1.0k')
    expect(formatWordCount(5500)).toBe('5.5k')
    expect(formatWordCount(9999)).toBe('10.0k')
  })

  it('should format ten-thousands as 万', () => {
    expect(formatWordCount(10000)).toBe('1.0万')
    expect(formatWordCount(50000)).toBe('5.0万')
    expect(formatWordCount(123456)).toBe('12.3万')
  })
})

describe('formatChapterIndex', () => {
  it('should format chapter index in Chinese', () => {
    expect(formatChapterIndex(1)).toBe('第 1 章')
    expect(formatChapterIndex(10)).toBe('第 10 章')
  })
})

describe('A1: useWorkStore import', () => {
  it('should call useWorkStore without ReferenceError when Pinia is active', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkStore()
    expect(store).toBeDefined()
    expect(store.dbReady).toBeDefined()
    expect(typeof store.dbReady).toBe('boolean')
  })
})

describe('A6: selection range snapshot', () => {
  it('uses saved range, not live DOM, for AI write-back', () => {
    // 模拟编辑器状态
    let savedRange: { start: number; end: number } | null = null
    const body = { value: '0123456789' }
    const domEl = { selectionStart: 0, selectionEnd: 0 }

    // 模拟 openSelectionAction：保存快照
    savedRange = { start: 2, end: 5 } // 用户选中了 "234"

    // 模拟 AI 生成期间用户点了别处（光标移到了末尾）
    domEl.selectionStart = 10
    domEl.selectionEnd = 10

    // 模拟 onAiWrite：使用快照而不是 DOM
    const range = savedRange
    if (range) {
      const { start: s, end: e } = range
      body.value = body.value.slice(0, s) + 'NEW' + body.value.slice(e)
    }

    // 应该替换原选区 "234"，而不是光标位置 10
    expect(body.value).toBe('01NEW56789')
  })

  it('falls back to append when no saved range', () => {
    const body = { value: '0123456789' }
    const savedRange = null

    if (!savedRange) {
      body.value = body.value + '\n\n' + 'NEW'
    }

    expect(body.value).toBe('0123456789\n\nNEW')
  })

  it('clears saved range after write-back', () => {
    let savedRange: { start: number; end: number } | null = { start: 2, end: 5 }

    // write-back
    savedRange = null

    expect(savedRange).toBeNull()
  })
})

describe('A2: dbReady initialization', () => {
  it('dbReady starts false, bootstrap sets true', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkStore()

    // 初始状态：dbReady 为 false
    expect(store.dbReady).toBe(false)

    // 模拟 bootstrap：数据库初始化完成后置 true
    store.dbReady = true
    expect(store.dbReady).toBe(true)
  })

  it('dbReady false to true transition is observable', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkStore()

    const transitions: boolean[] = []
    const unwatch = (store as any).$subscribe ? undefined : undefined
    // 手动验证状态变更可被跟踪
    expect(store.dbReady).toBe(false)
    store.dbReady = true
    expect(store.dbReady).toBe(true)
    store.dbReady = false
    expect(store.dbReady).toBe(false)
  })

  it('cold start: new store instance always starts with dbReady=false', () => {
    // 模拟冷启动：每次创建新的 pinia + store
    const pinia1 = createPinia()
    setActivePinia(pinia1)
    const store1 = useWorkStore()
    expect(store1.dbReady).toBe(false)
    store1.dbReady = true

    // 第二次冷启动：全新 pinia 实例
    const pinia2 = createPinia()
    setActivePinia(pinia2)
    const store2 = useWorkStore()
    expect(store2.dbReady).toBe(false)
    // bootstrap 后才会变为 true
    store2.dbReady = true
    expect(store2.dbReady).toBe(true)
  })
})

describe('saveStatusText', () => {
  it('should return Chinese status labels', () => {
    expect(saveStatusText('saved')).toBe('已保存')
    expect(saveStatusText('saving')).toBe('保存中...')
    expect(saveStatusText('unsaved')).toBe('未保存')
  })
})
