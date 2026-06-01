import { describe, it, expect } from 'vitest'
import { runConsistencyCheck } from '../agents/steps/consistencyCheck'
import { extractAnchors, detectConflicts, AnchorStore, type AnchorType } from '../composables/useAnchorDetection'

describe('extractAnchors + detectConflicts (unit)', () => {
  it('should detect alive→dead conflict when accumulated anchor says alive but chapter implies dead', () => {
    const store = new AnchorStore()
    // 累积状态：角色存活
    store.add({
      type: 'character' as AnchorType,
      name: '张三',
      chapterNo: 1,
      summary: '张三首次出场',
      entities: ['张三'],
      structuredData: { alive: true, location: '京城' },
    })

    // 新章节声称：角色死亡
    const mentions = [
      { name: '张三', alive: false, location: '京城' },
    ]

    const conflicts = detectConflicts(store.getAll(), mentions)
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts.some(c => c.level === 'ERROR' && c.type === 'alive_changed')).toBe(true)
  })

  it('should detect location change as WARNING', () => {
    const store = new AnchorStore()
    store.add({
      type: 'character' as AnchorType,
      name: '李四',
      chapterNo: 1,
      summary: '李四首次出场',
      entities: ['李四'],
      structuredData: { alive: true, location: '京城' },
    })

    const mentions = [
      { name: '李四', alive: true, location: '江南' },
    ]

    const conflicts = detectConflicts(store.getAll(), mentions)
    expect(conflicts.some(c => c.level === 'WARNING' && c.type === 'location_changed')).toBe(true)
  })

  it('should detect destroyed item reused as ERROR', () => {
    const store = new AnchorStore()
    store.add({
      type: 'item' as AnchorType,
      name: '青锋剑',
      chapterNo: 1,
      summary: '青锋剑被毁',
      entities: ['青锋剑'],
      structuredData: { destroyed: true, owner: '张三' },
    })

    const mentions = [
      { name: '青锋剑', destroyed: false },
    ]

    const conflicts = detectConflicts(store.getAll(), mentions)
    expect(conflicts.some(c => c.level === 'ERROR' && c.type === 'destroyed_item_reused')).toBe(true)
  })

  it('should return empty when no contradictions', () => {
    const store = new AnchorStore()
    store.add({
      type: 'character' as AnchorType,
      name: '王五',
      chapterNo: 1,
      summary: '王五',
      entities: ['王五'],
      structuredData: { alive: true, location: '京城' },
    })

    const mentions = [
      { name: '王五', alive: true, location: '京城' },
    ]

    const conflicts = detectConflicts(store.getAll(), mentions)
    expect(conflicts).toHaveLength(0)
  })
})

describe('runConsistencyCheck with existing entities', () => {
  it('should detect dead character conflict', async () => {
    const issues = await runConsistencyCheck(
      '张三倒在了血泊中，再也没有起来。张三死了。',
      5,
      [
        { name: '张三', type: 'character' as AnchorType, structuredData: { alive: true, location: '京城' } },
      ],
    )
    const errors = issues.filter(i => i.level === 'ERROR')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.type === 'alive_changed')).toBe(true)
  })

  it('should return empty when chapter matches accumulated state', async () => {
    const issues = await runConsistencyCheck(
      '张三走在京城的街道上，阳光正好。',
      5,
      [
        { name: '张三', type: 'character' as AnchorType, structuredData: { alive: true, location: '京城' } },
      ],
    )
    expect(issues).toHaveLength(0)
  })

  it('should work without existing entities (no accumulated state)', async () => {
    const issues = await runConsistencyCheck('张三走在路上。', 1)
    // 无累积状态时不产生冲突（无法对比）
    expect(issues).toHaveLength(0)
  })
})
