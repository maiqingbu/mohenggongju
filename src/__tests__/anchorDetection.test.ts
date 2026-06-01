import { describe, it, expect } from 'vitest'
import {
  AnchorStore, extractAnchors, findRelevantAnchors,
  buildAnchorSummary, detectConflicts,
  type Anchor, type ChapterText,
} from '../composables/useAnchorDetection'

describe('AnchorStore 基础操作', () => {
  it('应能添加和查询锚点', () => {
    const store = new AnchorStore()
    store.add({
      id: 'a1', type: 'character', name: '苏婉',
      chapterNo: 1, summary: '28岁女性，全职太太，重生者',
      entities: ['苏婉', '陆景行'],
      structuredData: { alive: true, location: '上海', abilities: ['前世记忆'] },
    })
    const result = store.getByEntity('苏婉')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('苏婉')
  })

  it('应按类型筛选锚点', () => {
    const store = new AnchorStore()
    store.add({ id: 'a1', type: 'character', name: '苏婉', chapterNo: 1, summary: '女主', entities: ['苏婉'], structuredData: {} })
    store.add({ id: 'a2', type: 'item', name: '梅花玉佩', chapterNo: 2, summary: '祖传玉佩', entities: ['苏婉', '玉佩'], structuredData: {} })
    store.add({ id: 'a3', type: 'foreshadow', name: '钥匙之谜', chapterNo: 2, summary: '母亲临终前的钥匙', entities: ['钥匙'], structuredData: {} })

    expect(store.getByType('character')).toHaveLength(1)
    expect(store.getByType('item')).toHaveLength(1)
    expect(store.getByType('foreshadow')).toHaveLength(1)
  })

  it('应支持锚点版本更新', () => {
    const store = new AnchorStore()
    store.add({ id: 'a1', type: 'character', name: '苏婉', chapterNo: 1, summary: '28岁', entities: ['苏婉'], structuredData: { alive: true, location: '上海' } })
    store.update('a1', { chapterNo: 8, summary: '30岁，已离开上海', structuredData: { alive: true, location: '北京' } })

    const a = store.getById('a1')
    expect(a!.chapterNo).toBe(8)
    expect(a!.summary).toBe('30岁，已离开上海')
    expect(a!.structuredData.location).toBe('北京')
    expect(a!.version).toBe(2)
  })

  it('应返回所有锚点按章节排序', () => {
    const store = new AnchorStore()
    store.add({ id: 'a2', type: 'item', name: 'B', chapterNo: 3, summary: '', entities: [], structuredData: {} })
    store.add({ id: 'a1', type: 'character', name: 'A', chapterNo: 1, summary: '', entities: [], structuredData: {} })

    const all = store.getAll()
    expect(all[0].chapterNo).toBe(1)
    expect(all[1].chapterNo).toBe(3)
  })

  it('应统计已回收/未回收伏笔', () => {
    const store = new AnchorStore()
    store.add({ id: 'fs1', type: 'foreshadow', name: '钥匙之谜', chapterNo: 2, summary: '钥匙', entities: ['钥匙'],
      structuredData: { plantedChapter: 2, resolved: false, resolvedChapter: null } })
    store.add({ id: 'fs2', type: 'foreshadow', name: '身世之谜', chapterNo: 5, summary: '身世', entities: [],
      structuredData: { plantedChapter: 5, resolved: true, resolvedChapter: 12 } })

    const stats = store.getForeshadowStats()
    expect(stats.total).toBe(2)
    expect(stats.resolved).toBe(1)
    expect(stats.unresolved).toBe(1)
  })
})

describe('锚点提取 (extractAnchors)', () => {
  it('应从文本中提取角色名', () => {
    const text: ChapterText = {
      chapterNo: 3,
      content: '苏婉推开门，看到了陆景行和一个陌生女人站在一起。那女人转头冷冷地看了苏婉一眼。',
      existingEntities: ['苏婉'],
    }
    const anchors = extractAnchors(text)
    const names = anchors.map(a => a.name)
    expect(names).toContain('苏婉')
    expect(names).toContain('陆景行')
  })

  it('应在角色首次出现时标记 isNew: true', () => {
    const text: ChapterText = {
      chapterNo: 5,
      content: '林小雨从楼梯上走下来。',
      existingEntities: [],
    }
    const anchors = extractAnchors(text)
    const newChar = anchors.find(a => a.name === '林小雨')
    expect(newChar).toBeTruthy()
    expect(newChar!.isNew).toBe(true)
  })

  it('已存在角色应标记 isNew: false', () => {
    const text: ChapterText = {
      chapterNo: 5,
      content: '苏婉走进咖啡店。',
      existingEntities: ['苏婉'],
    }
    const anchors = extractAnchors(text)
    const char = anchors.find(a => a.name === '苏婉')
    expect(char).toBeTruthy()
    expect(char!.isNew).toBe(false)
  })

  it('空文本应返回空数组', () => {
    const anchors = extractAnchors({ chapterNo: 1, content: '', existingEntities: [] })
    expect(anchors).toHaveLength(0)
  })
})

describe('相关锚点检索 (findRelevantAnchors)', () => {
  it('应找到与新章节实体相关的锚点', () => {
    const store = new AnchorStore()
    store.add({ id: 'a1', type: 'character', name: '苏婉', chapterNo: 1, summary: '女主', entities: ['苏婉'], structuredData: {} })
    store.add({ id: 'a2', type: 'item', name: '玉佩', chapterNo: 2, summary: '传家宝', entities: ['苏婉', '玉佩'], structuredData: {} })
    store.add({ id: 'a3', type: 'character', name: '张三', chapterNo: 1, summary: '路人', entities: ['张三'], structuredData: {} })

    const relevant = findRelevantAnchors(store, ['苏婉', '陆景行', '玉佩'])
    expect(relevant).toHaveLength(2) // 苏婉 + 玉佩（张三不相关）
  })

  it('无匹配实体应返回空', () => {
    const store = new AnchorStore()
    store.add({ id: 'a1', type: 'character', name: '苏婉', chapterNo: 1, summary: '', entities: ['苏婉'], structuredData: {} })

    const relevant = findRelevantAnchors(store, ['完全无关的人'])
    expect(relevant).toHaveLength(0)
  })
})

describe('锚点摘要生成 (buildAnchorSummary)', () => {
  it('应生成可读摘要', () => {
    const anchors: Anchor[] = [
      { id: 'a1', type: 'character', name: '苏婉', chapterNo: 1, summary: '28岁女性，复仇者', entities: ['苏婉'], structuredData: { alive: true, location: '上海', abilities: [] }, version: 1 },
      { id: 'a2', type: 'item', name: '梅花玉佩', chapterNo: 2, summary: '祖传，可识别血脉', entities: ['苏婉', '玉佩'], structuredData: { owner: '苏婉', destroyed: false }, version: 1 },
    ]
    const summary = buildAnchorSummary(anchors)
    expect(summary).toContain('苏婉')
    expect(summary).toContain('28岁女性')
    expect(summary).toContain('梅花玉佩')
    expect(summary).toContain('祖传')
  })

  it('空锚点阵列应返回空字符串', () => {
    expect(buildAnchorSummary([])).toBe('')
  })
})

describe('冲突检测 (detectConflicts)', () => {
  it('新章节与锚点一致时应无冲突', () => {
    const anchor: Anchor = {
      id: 'a1', type: 'character', name: '苏婉', chapterNo: 1,
      summary: '28岁女性', entities: ['苏婉'],
      structuredData: { alive: true, location: '上海' }, version: 1,
    }
    const newMentions = [{ name: '苏婉', alive: true, location: '上海' }]
    const conflicts = detectConflicts([anchor], newMentions)
    expect(conflicts).toHaveLength(0)
  })

  it('发现矛盾时应返回冲突', () => {
    const anchor: Anchor = {
      id: 'a1', type: 'character', name: '苏婉', chapterNo: 1,
      summary: '28岁女性', entities: ['苏婉'],
      structuredData: { alive: true, location: '上海' }, version: 1,
    }
    const newMentions = [{ name: '苏婉', alive: false, location: '上海' }]
    const conflicts = detectConflicts([anchor], newMentions)
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts[0].type).toBe('alive_changed')
    expect(conflicts[0].level).toBe('ERROR')
  })

  it('新角色首次出现不应冲突', () => {
    const store: Anchor[] = []
    const newMentions = [{ name: '新角色', alive: true, location: '北京' }]
    expect(detectConflicts(store, newMentions)).toHaveLength(0)
  })

  it('物品被毁后再次出现应检测到', () => {
    const anchors: Anchor[] = [{
      id: 'a2', type: 'item', name: '玉佩', chapterNo: 2,
      summary: '已毁', entities: ['玉佩', '苏婉'],
      structuredData: { owner: '苏婉', destroyed: true }, version: 1,
    }]
    const mentions = [{ name: '玉佩', owner: '林某', destroyed: false }]
    const conflicts = detectConflicts(anchors, mentions)
    expect(conflicts.some(c => c.type === 'destroyed_item_reused')).toBe(true)
  })
})
