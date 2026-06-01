/**
 * Feature: 内容一致性检测
 *
 * 用户在写作过程中，系统自动检测角色/时间/物品的矛盾，并通过错误等级管理。
 */

import { describe, it, expect } from 'vitest'
import {
  runAllChecks, checkCharacterConsistency, checkForeshadowing,
  type WorldState, type CharacterBaseline,
} from '../../composables/useConsistencyDetection'
import { ChangeLog } from '../../composables/useChangeLog'

describe('Feature: 内容一致性自动检测', () => {
  describe('Scenario: 用户在续写中不小心改变了主角性别', () => {
    it('Given 数据库中苏婉的基线性别为"女"', () => {
      const baseline: CharacterBaseline = {
        name: '苏婉', gender: '女', age: 28, alive: true, location: '上海', identity: '全职太太', abilities: [],
      }
      // When 新章节中性别被误写为"男"
      const issues = checkCharacterConsistency(
        { name: '苏婉', gender: '男', age: 28, alive: true },
        baseline, 12,
      )
      // Then 系统报 ERROR 级别错误
      expect(issues).toHaveLength(1)
      expect(issues[0].level).toBe('ERROR')
      expect(issues[0].type).toBe('gender_changed')
    })
  })

  describe('Scenario: 用户在完结时发现有未回收的伏笔', () => {
    it('Given 第2章埋下一个伏笔"钥匙之谜"且未设定期望回收章', () => {
      const foreshadows = [
        { id: 'fs1', description: '钥匙之谜', plantedChapter: 2, resolvedChapter: null, resolved: false },
      ]
      // When 用户在第20章标记完结
      const issues = checkForeshadowing(foreshadows, 20, true)
      // Then 系统报 ERROR — 完结时仍有未回收伏笔
      expect(issues.some(i => i.level === 'ERROR' && i.type === 'ending_with_unresolved')).toBe(true)
    })
  })

  describe('Scenario: 用户销毁了的法宝在后文中又出现', () => {
    it('Given 梅花玉佩在第7章已被摧毁', () => {
      const world: WorldState = {
        characters: new Map(),
        timeline: [],
        items: new Map([['玉佩', { name: '梅花玉佩', owner: '苏婉', destroyed: true, properties: [] }]]),
        foreshadowing: [],
      }
      // When 第15章中苏婉又使用了梅花玉佩
      const issues = runAllChecks(world, {
        chapter: 15,
        characters: [],
        itemUses: [{ itemName: '玉佩', usedBy: '苏婉' }],
        isLastChapter: false,
      })
      // Then 系统报 ERROR — 已销毁物品被使用
      expect(issues.some(i => i.type === 'destroyed_item_used' && i.level === 'ERROR')).toBe(true)
    })
  })

  describe('Scenario: 用户追踪角色数据的每次变更', () => {
    it('Given 新建 ChangeLog', () => {
      const log = new ChangeLog()
      // When 苏婉的年龄在第5章从28变为30（人工修改）
      log.log({ entityType: 'character', entityId: 'ch_001', entityName: '苏婉', fieldPath: 'age', operation: 'update', oldValue: 28, newValue: 30, chapter: 5, trigger: 'manual' })
      // When AI提取到苏婉的能力在第5章新增"前世记忆"
      log.log({ entityType: 'character', entityId: 'ch_001', entityName: '苏婉', fieldPath: 'abilities', operation: 'update', oldValue: '[]', newValue: '["前世记忆"]', chapter: 5, trigger: 'ai_extraction' })
      // Then 苏婉在第5章共有2条变更记录
      expect(log.getChapterChanges(5)).toHaveLength(2)
      // Then 查询苏婉年龄的最新值为30
      expect(log.getLatestValue('ch_001', 'age')).toBe(30)
      // Then AI提取的变更可被单独筛选
      expect(log.getAll().filter(r => r.trigger === 'ai_extraction')).toHaveLength(1)
    })
  })
})
