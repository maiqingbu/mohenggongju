import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── 模拟 Tauri FS 插件 ──
const mockFiles: Record<string, string> = {}

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 18 },
  readTextFile: async (path: string) => {
    if (mockFiles[path] !== undefined) return mockFiles[path]
    return null
  },
  writeTextFile: async (path: string, content: string) => {
    mockFiles[path] = content
  },
  mkdir: async () => {},
  exists: async () => false,
}))

import { serialized, createWork, createChapter, fetchWorks, fetchChapters, reorderVolumes } from '../composables/useDatabase'

describe('A3: serialized write queue', () => {
  it('serialized runs one at a time and preserves order', async () => {
    const order: number[] = []

    const a = serialized(async () => {
      order.push(1)
      await new Promise(r => setTimeout(r, 20))
      order.push(2)
      return 1
    })
    const b = serialized(async () => {
      order.push(3)
      await new Promise(r => setTimeout(r, 5))
      order.push(4)
      return 2
    })
    const c = serialized(async () => {
      order.push(5)
      return 3
    })

    const results = await Promise.all([a, b, c])
    // 虽然 concurrent 调用，但 serialized 保证顺序为 1,2,3,4,5
    expect(order).toEqual([1, 2, 3, 4, 5])
    expect(results).toEqual([1, 2, 3])
  })
})

describe('A3: concurrent writes do not conflict', () => {
  beforeEach(() => {
    Object.keys(mockFiles).forEach(k => delete mockFiles[k])
  })

  it('10 concurrent createChapter calls all succeed with unique IDs', async () => {
    mockFiles['novel-studio/state.json'] = JSON.stringify({ nextWorkId: 1, nextVolumeId: 2, nextChapterId: 1 })
    mockFiles['novel-studio/works/index.json'] = JSON.stringify({ 1: { id: 1, title: 'test', created_at: '', updated_at: '' } })
    mockFiles['novel-studio/works/1/volumes.json'] = JSON.stringify({ 2: { id: 2, work_id: 1, title: 'vol1', sort_order: 0 } })

    const ids = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createChapter(2, `ch${i}`, '', 0))
    )

    // 所有 ID 唯一
    expect(new Set(ids).size).toBe(10)
    // 最终 chapters 应该有 10 条
    const chs = await fetchChapters(2)
    expect(chs).toHaveLength(10)
  })
})

describe('A4: reorderVolumes null safety', () => {
  beforeEach(() => {
    Object.keys(mockFiles).forEach(k => delete mockFiles[k])
  })

  it('reorderVolumes with deleted first ID returns void (no throw)', async () => {
    mockFiles['novel-studio/works/index.json'] = JSON.stringify({})

    // orderedIds[0] 对应的 volume 不存在 → 应该静默返回
    const result = await reorderVolumes([999, 998])
    expect(result).toBeUndefined()
  })

  it('reorderVolumes with empty array returns early', async () => {
    const result = await reorderVolumes([])
    expect(result).toBeUndefined()
  })
})
