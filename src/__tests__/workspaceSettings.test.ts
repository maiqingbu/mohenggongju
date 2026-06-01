import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorkspaceSettings, defaultSettings, type WorkspaceSettingsData } from '../composables/useWorkspaceSettings'

// Node 环境没有 localStorage，模拟它
function mockStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => { store.set(k, v) }),
    removeItem: vi.fn((k: string) => { store.delete(k) }),
    clear: vi.fn(() => { store.clear() }),
    get length() { return store.size },
    key: vi.fn((i: number) => [...store.keys()][i] ?? null),
  })
  return store
}

describe('WorkspaceSettings', () => {
  beforeEach(() => {
    mockStorage()
  })

  it('should load default settings for a new work', () => {
    const ws = new WorkspaceSettings(1)
    expect(ws.data.title).toBe('')
    expect(ws.data.pov).toBe('第三人称')
    expect(ws.data.tags).toEqual([])
    expect(ws.data.targetWordCount).toBe(0)
  })

  it('should persist and reload settings', () => {
    const ws = new WorkspaceSettings(1)
    ws.update({ title: '测试作品', pov: '第一人称', targetWordCount: 100000 })
    ws.save()

    const ws2 = new WorkspaceSettings(1)
    expect(ws2.data.title).toBe('测试作品')
    expect(ws2.data.pov).toBe('第一人称')
    expect(ws2.data.targetWordCount).toBe(100000)
  })

  it('should isolate settings by workId', () => {
    const ws1 = new WorkspaceSettings(1)
    ws1.update({ title: '作品A' })
    ws1.save()

    const ws2 = new WorkspaceSettings(2)
    ws2.update({ title: '作品B' })
    ws2.save()

    expect(new WorkspaceSettings(1).data.title).toBe('作品A')
    expect(new WorkspaceSettings(2).data.title).toBe('作品B')
  })

  it('should update partial fields without clearing others', () => {
    const ws = new WorkspaceSettings(1)
    ws.update({ title: '作品A', pov: '第一人称', genre: '玄幻' })
    ws.update({ targetWordCount: 50000 })
    expect(ws.data.title).toBe('作品A')
    expect(ws.data.pov).toBe('第一人称')
    expect(ws.data.genre).toBe('玄幻')
    expect(ws.data.targetWordCount).toBe(50000)
  })

  it('activeTags should include tags, genre, and subgenre', () => {
    const ws = new WorkspaceSettings(1)
    ws.update({ tags: ['重生', '系统'], genre: '玄幻', subgenre: '修真' })
    const tags = ws.activeTags()
    expect(tags).toContain('重生')
    expect(tags).toContain('系统')
    expect(tags).toContain('玄幻')
    expect(tags).toContain('修真')
    expect(tags.length).toBe(4)
  })

  it('activeTags should deduplicate overlapping values', () => {
    const ws = new WorkspaceSettings(1)
    ws.update({ tags: ['玄幻'], genre: '玄幻' })
    expect(ws.activeTags()).toEqual(['玄幻'])
  })

  it('should return default for invalid localStorage data', () => {
    localStorage.setItem('ns:ws:99', 'not-json')
    const ws = new WorkspaceSettings(99)
    expect(ws.data.title).toBe('')
    expect(ws.data.pov).toBe('第三人称')
  })

  it('should merge partial stored data with defaults', () => {
    localStorage.setItem('ns:ws:1', JSON.stringify({ title: '部分数据' }))
    const ws = new WorkspaceSettings(1)
    expect(ws.data.title).toBe('部分数据')
    expect(ws.data.pov).toBe('第三人称') // default merged in
  })
})
