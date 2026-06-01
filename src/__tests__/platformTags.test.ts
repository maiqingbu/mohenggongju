import { describe, it, expect } from 'vitest'
import { validateTagSet, buildGenerationPrompt, getDefaultTags, type TagSet } from '../composables/usePlatformTags'

const validTags: TagSet = {
  platform: 'zhihu_salt',
  channel: 'female',
  genre: 'modern_romance',
  subgenre: ['chase_wife', 'dead_lit'],
  elements: ['重生', '豪门'],
  emotion: ['先虐后甜', '双向救赎'],
  pov: 'first_person',
  style: 'zhihu_style',
  length: 'short',
  cool_points: ['face_slap', 'strong_reversal'],
  taboo: ['politics', 'porn'],
}

describe('validateTagSet', () => {
  it('完整标签应通过验证', () => {
    const result = validateTagSet(validTags)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('空平台应报错', () => {
    const result = validateTagSet({ ...validTags, platform: '' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('平台必选')
  })

  it('空题材应报错', () => {
    const result = validateTagSet({ ...validTags, genre: '' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('题材必选')
  })

  it('空子标签应报错', () => {
    const result = validateTagSet({ ...validTags, subgenre: [] })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('至少选一个子标签')
  })

  it('空情绪标签应报错', () => {
    const result = validateTagSet({ ...validTags, emotion: [] })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('至少选一个情绪标签')
  })

  it('多字段缺失应返回多个错误', () => {
    const result = validateTagSet({ ...validTags, platform: '', genre: '', pov: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })
})

describe('buildGenerationPrompt', () => {
  const tags: TagSet = {
    platform: 'fanqie',
    channel: 'male',
    genre: 'urban',
    subgenre: ['rebirth_revenge'],
    elements: ['重生', '系统', '神豪'],
    emotion: ['燃', '爽'],
    pov: 'third_person_limited',
    style: 'fanqie_style',
    length: 'medium_short',
    cool_points: ['power_up', 'face_slap'],
    taboo: ['politics', 'violence'],
  }

  it('应包含平台信息', () => {
    expect(buildGenerationPrompt(tags)).toContain('【平台】fanqie')
  })

  it('应包含题材和子标签', () => {
    const prompt = buildGenerationPrompt(tags)
    expect(prompt).toContain('【题材】urban')
    expect(prompt).toContain('rebirth_revenge')
  })

  it('应包含核心元素', () => {
    const prompt = buildGenerationPrompt(tags)
    expect(prompt).toContain('【核心元素】重生、系统、神豪')
  })

  it('所有必填字段都应出现在 prompt 中', () => {
    const prompt = buildGenerationPrompt(tags)
    for (const label of ['【平台】', '【频道】', '【题材】', '【子标签】', '【核心元素】', '【情绪走向】', '【人称】', '【风格】', '【字数】']) {
      expect(prompt).toContain(label)
    }
  })
})

describe('getDefaultTags', () => {
  it('知乎女频应默认 first_person', () => {
    const tags = getDefaultTags('zhihu_salt', 'female')
    expect(tags.pov).toBe('first_person')
    expect(tags.style).toBe('知乎体')
  })

  it('番茄男频应默认 third_person', () => {
    const tags = getDefaultTags('fanqie', 'male')
    expect(tags.pov).toBe('third_person_limited')
  })
})
