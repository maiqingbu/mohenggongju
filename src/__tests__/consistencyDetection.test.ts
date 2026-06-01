import { describe, it, expect } from 'vitest'
import {
  checkCharacterConsistency,
  checkTimelineOrder,
  checkItemConsistency,
  checkForeshadowing,
  runAllChecks,
  type CharacterBaseline,
  type ItemState,
  type ForeshadowEntry,
  type WorldState,
} from '../composables/useConsistencyDetection'

describe('角色一致性检测', () => {
  const baseline: CharacterBaseline = {
    name: '苏婉', gender: '女', age: 28, alive: true, location: '上海', identity: '全职太太', abilities: [],
  }

  it('完全一致应无问题', () => {
    expect(checkCharacterConsistency({ name: '苏婉', gender: '女', age: 28, alive: true }, baseline, 5)).toHaveLength(0)
  })

  it('名字变化应报 ERROR', () => {
    const issues = checkCharacterConsistency({ name: '苏妧', gender: '女', age: 28, alive: true }, baseline, 5)
    expect(issues.some(i => i.type === 'name_changed' && i.level === 'ERROR')).toBe(true)
  })

  it('性别变化应报 ERROR', () => {
    const issues = checkCharacterConsistency({ name: '苏婉', gender: '男', age: 28, alive: true }, baseline, 5)
    expect(issues.some(i => i.type === 'gender_changed' && i.level === 'ERROR')).toBe(true)
  })

  it('年龄倒退应报 ERROR', () => {
    const issues = checkCharacterConsistency({ name: '苏婉', gender: '女', age: 25, alive: true }, baseline, 5)
    expect(issues.some(i => i.type === 'age_decreased' && i.level === 'ERROR')).toBe(true)
  })

  it('已死角色复活应报 ERROR', () => {
    const dead = { ...baseline, alive: false }
    const issues = checkCharacterConsistency({ name: '苏婉', gender: '女', age: 28, alive: true }, dead, 5)
    expect(issues.some(i => i.type === 'dead_revived' && i.level === 'ERROR')).toBe(true)
  })

  it('年龄正常增长不应报错', () => {
    expect(checkCharacterConsistency({ name: '苏婉', gender: '女', age: 30, alive: true }, baseline, 5)).toHaveLength(0)
  })
})

describe('时间线检测', () => {
  it('正常递增应无问题', () => {
    const tl = [
      { chapter: 1, timestamp: 1700000000000, events: [] },
      { chapter: 2, timestamp: 1700086400000, events: [] },
    ]
    expect(checkTimelineOrder(tl)).toHaveLength(0)
  })

  it('时间倒退应报 WARNING', () => {
    const tl = [
      { chapter: 1, timestamp: 1700172800000, events: [] },
      { chapter: 2, timestamp: 1700000000000, events: [] },
    ]
    expect(checkTimelineOrder(tl).some(i => i.type === 'time_reversal')).toBe(true)
  })
})

describe('物品一致性检测', () => {
  it('正常使用应无问题', () => {
    const item: ItemState = { name: '玉佩', owner: '苏婉', destroyed: false, properties: [] }
    expect(checkItemConsistency({ itemName: '玉佩', usedBy: '苏婉' }, item, 5)).toHaveLength(0)
  })

  it('已销毁物品被使用应报 ERROR', () => {
    const item: ItemState = { name: '玉佩', owner: '苏婉', destroyed: true, properties: [] }
    expect(checkItemConsistency({ itemName: '玉佩', usedBy: '苏婉' }, item, 5)
      .some(i => i.type === 'destroyed_item_used' && i.level === 'ERROR')).toBe(true)
  })

  it('物品归属不符应报 WARNING', () => {
    const item: ItemState = { name: '玉佩', owner: '苏婉', destroyed: false, properties: [] }
    expect(checkItemConsistency({ itemName: '玉佩', usedBy: '林某' }, item, 5)
      .some(i => i.type === 'item_owner_mismatch' && i.level === 'WARNING')).toBe(true)
  })
})

describe('伏笔检测', () => {
  it('全部回收应无问题', () => {
    const fores: ForeshadowEntry[] = [
      { id: 'fs1', description: '钥匙之谜', plantedChapter: 2, resolvedChapter: 12, resolved: true },
    ]
    expect(checkForeshadowing(fores, 13, false)).toHaveLength(0)
  })

  it('过期待回收应报 WARNING', () => {
    const fores: ForeshadowEntry[] = [
      { id: 'fs1', description: '钥匙之谜', plantedChapter: 2, resolvedChapter: 12, resolved: false },
    ]
    expect(checkForeshadowing(fores, 13, false).some(i => i.type === 'unresolved_foreshadow')).toBe(true)
  })

  it('完结时未回收应报 ERROR', () => {
    const fores: ForeshadowEntry[] = [
      { id: 'fs1', description: '钥匙之谜', plantedChapter: 2, resolvedChapter: null, resolved: false },
    ]
    expect(checkForeshadowing(fores, 20, true).some(i => i.type === 'ending_with_unresolved' && i.level === 'ERROR')).toBe(true)
  })
})

describe('全量检测 runAllChecks', () => {
  it('应聚合所有类型的问题', () => {
    const world: WorldState = {
      characters: new Map([['苏婉', { name: '苏婉', gender: '女', age: 28, alive: true, location: '上海', identity: '全职太太', abilities: [] }]]),
      timeline: [],
      items: new Map([['玉佩', { name: '玉佩', owner: '苏婉', destroyed: true, properties: [] }]]),
      foreshadowing: [],
    }
    const event = {
      chapter: 5,
      characters: [{ name: '苏婉', gender: '男', age: 28, alive: true }],
      itemUses: [{ itemName: '玉佩', usedBy: '苏婉' }],
      isLastChapter: false,
    }
    expect(runAllChecks(world, event).length).toBeGreaterThanOrEqual(2)
  })
})
