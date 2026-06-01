import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotesManager } from '../composables/useNotes'

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

describe('NotesManager', () => {
  beforeEach(() => { mockStorage() })

  it('should create a note', () => {
    const mgr = new NotesManager()
    const note = mgr.create('测试笔记', '')
    expect(note.title).toBe('测试笔记')
    expect(note.content).toBe('')
    expect(note.folder).toBe('')
    expect(note.id).toMatch(/^note_/)
  })

  it('should list notes filtered by folder', () => {
    const mgr = new NotesManager()
    mgr.create('笔记A', '小说')
    mgr.create('笔记B', '小说')
    mgr.create('笔记C', '设定')
    expect(mgr.list('小说')).toHaveLength(2)
    expect(mgr.list('设定')).toHaveLength(1)
    expect(mgr.list('')).toHaveLength(3) // 空字符串 = 全部笔记
    expect(mgr.list()).toHaveLength(3)   // 无参数 = 全部笔记
  })

  it('should return unique folder names', () => {
    const mgr = new NotesManager()
    mgr.create('笔记A', '小说')
    mgr.create('笔记B', '设定')
    mgr.create('笔记C', '小说')
    expect(mgr.folders()).toEqual(['小说', '设定'])
  })

  it('should update a note', () => {
    const mgr = new NotesManager()
    const note = mgr.create('原标题', '')
    mgr.update(note.id, { title: '新标题', content: '正文内容' })
    const updated = mgr.get(note.id)
    expect(updated!.title).toBe('新标题')
    expect(updated!.content).toBe('正文内容')
  })

  it('should remove a note', () => {
    const mgr = new NotesManager()
    const note = mgr.create('待删除', '')
    expect(mgr.list()).toHaveLength(1)
    mgr.remove(note.id)
    expect(mgr.list()).toHaveLength(0)
  })

  it('should persist across instances', () => {
    const mgr1 = new NotesManager()
    mgr1.create('持久化笔记', '测试')
    const mgr2 = new NotesManager()
    expect(mgr2.list('测试')).toHaveLength(1)
    expect(mgr2.list('测试')[0].title).toBe('持久化笔记')
  })

  it('should return undefined for non-existent note', () => {
    const mgr = new NotesManager()
    expect(mgr.get('note_999')).toBeUndefined()
  })

  it('should return false for update/remove on non-existent note', () => {
    const mgr = new NotesManager()
    expect(mgr.update('note_999', { title: 'x' })).toBe(false)
    expect(mgr.remove('note_999')).toBe(false)
  })
})
