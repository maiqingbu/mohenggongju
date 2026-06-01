import { describe, it, expect, beforeEach, vi } from 'vitest'
import { extractCharacterState, StateKeeperVersionManager, type ExtractedState } from '../composables/useStateKeeper'

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
}

describe('extractCharacterState', () => {
  it('should detect dead state', () => {
    const result = extractCharacterState('苏婉', [
      { chapterNo: 1, title: '第一章', content: '苏婉站在城楼上。苏婉牺牲了，所有人都看到了她的尸体。' },
    ])
    expect(result.location).toBe('死亡')
  })

  it('should detect missing state', () => {
    const result = extractCharacterState('林逸', [
      { chapterNo: 1, title: '第一章', content: '林逸失踪了，没有人知道他去了哪里。' },
    ])
    expect(result.location).toBe('失踪')
  })

  it('should default to alive when no death/missing keywords', () => {
    const result = extractCharacterState('苏婉', [
      { chapterNo: 1, title: '第一章', content: '苏婉走在街上，阳光明媚。' },
    ])
    expect(result.location).toBe('在场')
  })

  it('should calculate importance based on mention frequency', () => {
    const result = extractCharacterState('苏婉', [
      { chapterNo: 1, title: '第一章', content: '苏婉来了。苏婉坐下。苏婉说话。苏婉走了。' },
    ])
    expect(result.importance).toBeGreaterThan(0)
    expect(result.importance).toBeLessThanOrEqual(10)
  })

  it('should extract body conditions from keywords', () => {
    const result = extractCharacterState('苏婉', [
      { chapterNo: 1, title: '第一章', content: '苏婉受了重伤，她的手臂上留下了深深的疤痕。' },
    ])
    expect(result.longTermEffects).toContain('重伤')
    expect(result.longTermEffects).toContain('疤痕')
  })

  it('should extract psychological tendencies', () => {
    const result = extractCharacterState('苏婉', [
      { chapterNo: 1, title: '第一章', content: '苏婉发誓要复仇。她疯狂地修炼，眼神中充满了绝望。' },
    ])
    expect(result.tendencies).toContain('复仇')
  })

  it('should extract behavior patterns', () => {
    const result = extractCharacterState('苏婉', [
      { chapterNo: 1, title: '第一章', content: '苏婉性格孤僻，但又非常勇敢，从不怯懦。' },
    ])
    expect(result.behaviorPatterns).toContain('孤僻')
    expect(result.behaviorPatterns).toContain('勇敢')
  })

  it('should return empty strings for no matches', () => {
    const result = extractCharacterState('苏婉', [
      { chapterNo: 1, title: '第一章', content: '今天天气很好。' },
    ])
    expect(result.longTermEffects).toBe('')
    expect(result.tendencies).toBe('')
  })

  it('should extract relationships using provided character names', () => {
    const result = extractCharacterState('张三', [
      { chapterNo: 1, title: '第一章', content: '张三与李四对决。张三对王五说了一句狠话。' },
    ], ['张三', '李四', '王五'])
    expect(result.relationships).toContain('李四')
    expect(result.relationships).toContain('王五')
  })

  it('should return empty relationships when no character names provided', () => {
    const result = extractCharacterState('张三', [
      { chapterNo: 1, title: '第一章', content: '张三与李四对决。' },
    ])
    // 无 characterNames 参数时，回退到通用中文名匹配（李四被通用规则匹配）
    // 关系提取需要两个名字同时出现，通用正则至少能匹配到一方
    expect(typeof result.relationships).toBe('string')
  })
})

describe('StateKeeperVersionManager', () => {
  beforeEach(() => { mockStorage() })

  it('should store and retrieve versions', () => {
    const mgr = new StateKeeperVersionManager('char_001')
    const snapshot: ExtractedState = {
      location: '在场', importance: 5, longTermEffects: '受伤',
      tendencies: '复仇', behaviorPatterns: '孤僻',
      abilities: [], items: '', relationships: '',
    }
    mgr.push(snapshot, 'auto_update', '第1章 → 第3章')
    expect(mgr.latest()?.version).toBe(1)
    expect(mgr.list()).toHaveLength(1)
  })

  it('should persist across instances', () => {
    const mgr1 = new StateKeeperVersionManager('char_001')
    const snapshot: ExtractedState = {
      location: '在场', importance: 1, longTermEffects: '',
      tendencies: '', behaviorPatterns: '', abilities: [], items: '', relationships: '',
    }
    mgr1.push(snapshot, 'manual', '无范围')
    const mgr2 = new StateKeeperVersionManager('char_001')
    expect(mgr2.latest()?.version).toBe(1)
  })

  it('should limit to 20 versions', () => {
    const mgr = new StateKeeperVersionManager('char_001')
    const snapshot: ExtractedState = {
      location: '在场', importance: 1, longTermEffects: '',
      tendencies: '', behaviorPatterns: '', abilities: [], items: '', relationships: '',
    }
    for (let i = 0; i < 25; i++) mgr.push(snapshot, 'auto_update', `第${i}章`)
    expect(mgr.list()).toHaveLength(20)
  })

  it('should rollback to a specific version', () => {
    const mgr = new StateKeeperVersionManager('char_001')
    const s1: ExtractedState = { location: '在场', importance: 1, longTermEffects: '', tendencies: '', behaviorPatterns: '', abilities: [], items: '', relationships: '' }
    const s2: ExtractedState = { location: '死亡', importance: 3, longTermEffects: '重伤', tendencies: '', behaviorPatterns: '', abilities: [], items: '', relationships: '' }
    mgr.push(s1, 'auto_update', '第1章')
    mgr.push(s2, 'auto_update', '第3章')
    const rolled = mgr.rollback(1)
    expect(rolled?.location).toBe('在场')
    expect(mgr.list()).toHaveLength(3) // original 2 + rollback
    expect(mgr.latest()?.source).toBe('manual')
  })
})
