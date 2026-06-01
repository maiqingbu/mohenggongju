import { describe, it, expect } from 'vitest'
import { ChangeLog } from '../composables/useChangeLog'

describe('ChangeLog 基础操作', () => {
  it('应记录单次变更', () => {
    const log = new ChangeLog()
    log.log({ entityType: 'character', entityId: 'ch_001', entityName: '苏婉', fieldPath: 'age', operation: 'update', oldValue: 28, newValue: 30, chapter: 5, trigger: 'manual' })
    const all = log.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].entityName).toBe('苏婉')
    expect(all[0].fieldPath).toBe('age')
  })

  it('应正确记录新旧值和触发章节', () => {
    const log = new ChangeLog()
    log.log({ entityType: 'character', entityId: 'ch_001', entityName: '苏婉', fieldPath: 'identity', operation: 'update', oldValue: '全职太太', newValue: '豪门千金', chapter: 8, trigger: 'chapter_generation' })
    const r = log.getAll()[0]
    expect(r.oldValue).toBe('全职太太')
    expect(r.newValue).toBe('豪门千金')
    expect(r.chapter).toBe(8)
  })
})

describe('ChangeLog 查询', () => {
  const log = new ChangeLog()
  log.log({ entityType: 'character', entityId: 'ch_001', entityName: '苏婉', fieldPath: 'age', operation: 'update', oldValue: 28, newValue: 30, chapter: 5, trigger: 'manual' })
  log.log({ entityType: 'character', entityId: 'ch_001', entityName: '苏婉', fieldPath: 'location', operation: 'update', oldValue: '上海', newValue: '北京', chapter: 12, trigger: 'chapter_generation' })
  log.log({ entityType: 'item', entityId: 'it_001', entityName: '梅花玉佩', fieldPath: 'owner', operation: 'update', oldValue: '苏婉', newValue: '林某', chapter: 7, trigger: 'chapter_generation' })
  log.log({ entityType: 'foreshadowing', entityId: 'fs_001', entityName: '钥匙之谜', fieldPath: 'resolved', operation: 'update', oldValue: false, newValue: true, chapter: 12, trigger: 'manual' })

  it('getHistory 可按类型筛选', () => {
    expect(log.getHistory('character')).toHaveLength(2)
  })

  it('getHistory 可按 ID 筛选', () => {
    expect(log.getHistory(undefined, 'ch_001')).toHaveLength(2)
  })

  it('getFieldHistory 可查询字段变更历史', () => {
    const h = log.getFieldHistory('ch_001', 'age')
    expect(h).toHaveLength(1)
    expect(h[0].oldValue).toBe(28)
    expect(h[0].newValue).toBe(30)
  })

  it('getLatestValue 应返回最新值', () => {
    expect(log.getLatestValue('ch_001', 'location')).toBe('北京')
  })

  it('不存在的字段应返回 undefined', () => {
    expect(log.getLatestValue('ch_001', 'nonexistent')).toBeUndefined()
  })

  it('getChapterChanges 可按章节筛选', () => {
    expect(log.getChapterChanges(12)).toHaveLength(2)
    expect(log.getChapterChanges(99)).toHaveLength(0)
  })
})

describe('ChangeLog 关系演变', () => {
  it('应能追踪三段式关系演变', () => {
    const log = new ChangeLog()
    log.log({ entityType: 'relationship', entityId: 'rel_01', entityName: '苏婉-林某', fieldPath: 'type', operation: 'create', oldValue: null, newValue: '前夫', chapter: 1, trigger: 'manual' })
    log.log({ entityType: 'relationship', entityId: 'rel_01', entityName: '苏婉-林某', fieldPath: 'type', operation: 'update', oldValue: '前夫', newValue: '死敌', chapter: 5, trigger: 'chapter_generation' })
    log.log({ entityType: 'relationship', entityId: 'rel_01', entityName: '苏婉-林某', fieldPath: 'type', operation: 'update', oldValue: '死敌', newValue: '爱人', chapter: 18, trigger: 'chapter_generation' })

    expect(log.getFieldHistory('rel_01', 'type').map(h => h.newValue)).toEqual(['前夫', '死敌', '爱人'])
  })
})

describe('ChangeLog 触发来源', () => {
  it('应区分 manual / ai_extraction 来源', () => {
    const log = new ChangeLog()
    log.log({ entityType: 'character', entityId: 'ch_001', entityName: '苏婉', fieldPath: 'age', operation: 'update', oldValue: 28, newValue: 29, chapter: 3, trigger: 'manual' })
    log.log({ entityType: 'character', entityId: 'ch_001', entityName: '苏婉', fieldPath: 'abilities', operation: 'update', oldValue: '[]', newValue: '["前世记忆"]', chapter: 3, trigger: 'ai_extraction' })

    expect(log.getAll().filter(r => r.trigger === 'manual')).toHaveLength(1)
    expect(log.getAll().filter(r => r.trigger === 'ai_extraction')).toHaveLength(1)
  })
})
