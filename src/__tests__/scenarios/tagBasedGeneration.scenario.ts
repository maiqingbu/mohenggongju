/**
 * Feature: 基于平台标签的AI短篇故事生成
 *
 * 用户选择目标平台和题材标签 → 系统构建约束Prompt → AI生成符合平台调性的故事
 */

import { describe, it, expect } from 'vitest'
import { validateTagSet, buildGenerationPrompt, type TagSet } from '../../composables/usePlatformTags'

describe('Feature: 标签驱动的故事生成', () => {
  describe('Scenario: 用户为知乎盐选生成一篇追妻火葬场短篇', () => {
    // Given: 用户选择了知乎盐选平台、女频、现代言情、追妻火葬场
    const tags: TagSet = {
      platform: 'zhihu_salt',
      channel: 'female',
      genre: 'modern_romance',
      subgenre: ['chase_wife', 'dead_lit'],
      elements: ['重生', '豪门', '误会'],
      emotion: ['先虐后甜', '双向救赎'],
      pov: 'first_person',
      style: 'zhihu_style',
      length: 'short',
      cool_points: ['face_slap', 'strong_reversal'],
      taboo: ['politics', 'porn'],
    }

    it('Given 标签组合有效 → 验证通过', () => {
      const result = validateTagSet(tags)
      expect(result.valid).toBe(true)
    })

    it('When 构建生成 Prompt → 包含平台特定约束', () => {
      const prompt = buildGenerationPrompt(tags)
      expect(prompt).toContain('zhihu_salt')
      expect(prompt).toContain('zhihu_style')
      expect(prompt).toContain('first_person')
    })

    it('Then 生成 Prompt 包含所有用户选择的题材标签', () => {
      const prompt = buildGenerationPrompt(tags)
      expect(prompt).toContain('chase_wife')
      expect(prompt).toContain('dead_lit')
      expect(prompt).toContain('重生')
      expect(prompt).toContain('豪门')
      expect(prompt).toContain('先虐后甜')
    })
  })

  describe('Scenario: 用户为番茄小说生成一篇男频系统流爽文', () => {
    const tags: TagSet = {
      platform: 'fanqie',
      channel: 'male',
      genre: 'urban',
      subgenre: ['system', 'rich_god'],
      elements: ['系统', '神豪', '直播', '打脸'],
      emotion: ['燃', '爽'],
      pov: 'third_person_limited',
      style: 'fanqie_style',
      length: 'medium_short',
      cool_points: ['power_up', 'face_slap'],
      taboo: ['politics', 'violence'],
    }

    it('Given 番茄男频标签组合 → 验证通过', () => {
      expect(validateTagSet(tags).valid).toBe(true)
    })

    it('When 构建 Prompt → 包含番茄风格要求', () => {
      const prompt = buildGenerationPrompt(tags)
      expect(prompt).toContain('fanqie')
      expect(prompt).toContain('fanqie_style')
    })

    it('Then 情绪走向为燃→爽，符合下沉市场爽文调性', () => {
      const prompt = buildGenerationPrompt(tags)
      expect(prompt).toContain('【情绪走向】燃 → 爽')
    })
  })

  describe('Scenario: 用户尝试使用互斥标签组合', () => {
    it('Given 未选平台 → 验证失败并提示"平台必选"', () => {
      const tags: TagSet = {
        platform: '', channel: 'female', genre: 'modern_romance',
        subgenre: ['sweet_pet'], elements: [], emotion: ['甜'],
        pov: 'first_person', style: 'zhihu_style', length: 'short',
        cool_points: [], taboo: [],
      }
      const result = validateTagSet(tags)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('平台必选')
    })

    it('Given 未选任何情绪标签 → 验证失败', () => {
      const tags: TagSet = {
        platform: 'zhihu_salt', channel: 'female', genre: 'modern_romance',
        subgenre: ['sweet_pet'], elements: [], emotion: [],
        pov: 'first_person', style: 'zhihu_style', length: 'short',
        cool_points: [], taboo: [],
      }
      expect(validateTagSet(tags).valid).toBe(false)
    })

    it('Given 未选子标签 → 验证失败', () => {
      const tags: TagSet = {
        platform: 'zhihu_salt', channel: 'female', genre: 'modern_romance',
        subgenre: [], elements: [], emotion: ['甜'],
        pov: 'first_person', style: 'zhihu_style', length: 'short',
        cool_points: [], taboo: [],
      }
      expect(validateTagSet(tags).valid).toBe(false)
    })
  })
})
