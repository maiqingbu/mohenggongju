/**
 * 网文潜力评估引擎测试
 */
import { describe, it, expect } from 'vitest'
import { assessPotential, type AssessmentInput } from '../composables/usePotentialAssessment'
import { defaultSettings, type WorkspaceSettingsData } from '../composables/useWorkspaceSettings'

function makeInput(overrides: Partial<{
  settings: Partial<WorkspaceSettingsData>
  settingCounts: Record<string, number>
  hasMainOutline: boolean
  hasVolumeOutlines: boolean
  hasChapterOutlines: boolean
  chapterCount: number
  chapterLengthVariance: number
  genrePlatformScores: Record<string, number>
  ipAdaptationPotential: string | undefined
}> = {}): AssessmentInput {
  const s = { ...defaultSettings(), ...overrides.settings }
  return {
    settings: s,
    settingCounts: overrides.settingCounts || {},
    hasMainOutline: overrides.hasMainOutline ?? false,
    hasVolumeOutlines: overrides.hasVolumeOutlines ?? false,
    hasChapterOutlines: overrides.hasChapterOutlines ?? false,
    chapterCount: overrides.chapterCount ?? 0,
    chapterLengthVariance: overrides.chapterLengthVariance ?? 0,
    genrePlatformScores: overrides.genrePlatformScores || {},
    ipAdaptationPotential: overrides.ipAdaptationPotential,
  }
}

describe('assessPotential', () => {
  it('should return grade E for completely empty project', () => {
    const r = assessPotential(makeInput())
    expect(r.totalScore).toBeLessThan(40)
    expect(r.grade).toBe('E')
    expect(r.dimensions).toHaveLength(6)
    expect(r.suggestions.length).toBeGreaterThan(0)
    expect(r.bestPlatforms.length).toBe(0)
  })

  it('should return grade C or higher for project with basic settings', () => {
    const r = assessPotential(makeInput({
      settings: {
        title: '测试作品',
        genre: '都市',
        subgenre: '都市异能',
        platformId: 'fanqie',
        targetWordCount: 1000000,
        intro: '一个精彩的都市异能故事，主角意外觉醒能力后展开的一系列冒险',
        tags: ['都市', '异能', '热血', '升级'],
        powerSystem: '天地玄黄四境，每境九重，突破需灵气淬体',
        cheatAbility: '获得时间回溯能力，每次死亡可以回到关键节点',
        worldSetting: '平行世界灵气复苏背景下的现代都市',
      },
      settingCounts: { character: 5, world_setting: 3, foreshadowing: 3, plot_arc: 2, item: 3 },
      hasMainOutline: true,
      hasVolumeOutlines: true,
      hasChapterOutlines: true,
      chapterCount: 8,
      chapterLengthVariance: 10,
      genrePlatformScores: { fanqie: 3, qidian: 2, qimao: 2 },
      ipAdaptationPotential: 'very_high',
    }))

    expect(r.totalScore).toBeGreaterThanOrEqual(60)
    expect(['S', 'A', 'B', 'C']).toContain(r.grade)
    expect(r.strengths.length).toBeGreaterThan(0)
    expect(r.bestPlatforms.length).toBeGreaterThan(0)
  })

  it('should return grade S or A for fully-developed project', () => {
    const r = assessPotential(makeInput({
      settings: {
        title: '万族之劫',
        genre: '都市',
        subgenre: '脑洞',
        platformId: 'fanqie',
        targetWordCount: 3000000,
        intro: '这是一个关于人族在万族夹缝中崛起的故事。主角苏宇意外获得文明志，从此改变了人族的命运。',
        styleDescription: '快节奏、高爽点、多反转，适合碎片化阅读',
        tags: ['脑洞', '系统', '热血', '升级', '穿越', '反派'],
        powerSystem: '文明志体系：收集文明碎片，开启诸天文明传承，融合万族血脉之力',
        cheatAbility: '文明志：可以召唤历史文明强者附体，每开启一个文明获得一种核心能力',
        worldSetting: '诸天万界中的人族疆域，万族林立，文明争锋',
      },
      settingCounts: { character: 12, world_setting: 8, foreshadowing: 6, plot_arc: 4, item: 5 },
      hasMainOutline: true,
      hasVolumeOutlines: true,
      hasChapterOutlines: true,
      chapterCount: 30,
      chapterLengthVariance: 5,
      genrePlatformScores: { fanqie: 3, qidian: 3, qimao: 2, faloo: 2, toutiao: 2 },
      ipAdaptationPotential: 'very_high',
    }))

    expect(r.totalScore).toBeGreaterThanOrEqual(80)
    expect(['S', 'A']).toContain(r.grade)
  })

  it('should give low platform fit when no platform selected', () => {
    const r = assessPotential(makeInput({
      settings: { genre: '玄幻', targetWordCount: 1000000 },
      settingCounts: { character: 3, world_setting: 2 },
      genrePlatformScores: { fanqie: 3, qidian: 2 },
    }))

    const platformDim = r.dimensions.find(d => d.key === 'platform_fit')
    expect(platformDim).toBeDefined()
    expect(platformDim!.score).toBeLessThan(50) // no platform selected
  })

  it('should give higher score when platform matches genre well', () => {
    const r = assessPotential(makeInput({
      settings: { genre: '都市', platformId: 'fanqie', targetWordCount: 2000000 },
      settingCounts: { character: 5, world_setting: 3 },
      genrePlatformScores: { fanqie: 3 },
      ipAdaptationPotential: 'very_high',
    }))

    const platformDim = r.dimensions.find(d => d.key === 'platform_fit')
    expect(platformDim).toBeDefined()
    expect(platformDim!.score).toBeGreaterThanOrEqual(60)
  })

  it('should return 6 dimensions each with required fields', () => {
    const r = assessPotential(makeInput({
      settings: { genre: '玄幻' },
      settingCounts: { character: 1 },
    }))

    for (const d of r.dimensions) {
      expect(d.key).toBeTruthy()
      expect(d.label).toBeTruthy()
      expect(d.weight).toBeGreaterThan(0)
      expect(d.weight).toBeLessThanOrEqual(1)
      expect(d.score).toBeGreaterThanOrEqual(0)
      expect(d.score).toBeLessThanOrEqual(100)
      expect(d.subScores.length).toBeGreaterThan(0)
      for (const s of d.subScores) {
        expect(s.label).toBeTruthy()
        expect(s.score).toBeGreaterThanOrEqual(0)
        expect(s.max).toBeGreaterThan(0)
      }
    }
  })

  it('should weight dimensions sum to 1', () => {
    const r = assessPotential(makeInput())
    const totalWeight = r.dimensions.reduce((sum, d) => sum + d.weight, 0)
    expect(totalWeight).toBeCloseTo(1, 2)
  })

  it('should detect strengths for high-scoring dimensions', () => {
    const r = assessPotential(makeInput({
      settings: {
        genre: '都市',
        platformId: 'fanqie',
        targetWordCount: 2000000,
        intro: '精彩的故事简介在这里',
        styleDescription: '独特的文风说明',
        tags: ['脑洞', '系统', '热血', '升级'],
        powerSystem: '完整的力量体系设定',
        cheatAbility: '独特的金手指设计',
        worldSetting: '宏大的世界观背景设定',
      },
      settingCounts: { character: 8, world_setting: 5, foreshadowing: 4, plot_arc: 3, item: 3 },
      hasMainOutline: true,
      hasVolumeOutlines: true,
      hasChapterOutlines: true,
      chapterCount: 15,
      chapterLengthVariance: 8,
      genrePlatformScores: { fanqie: 3, qidian: 2 },
      ipAdaptationPotential: 'very_high',
    }))

    expect(r.strengths.length).toBeGreaterThan(0)
    expect(r.weaknesses.length).toBeLessThanOrEqual(r.strengths.length + 2)
  })

  it('should generate platform recommendations sorted by score', () => {
    const r = assessPotential(makeInput({
      settings: { genre: '都市' },
      settingCounts: { character: 3 },
      genrePlatformScores: { fanqie: 3, qidian: 2, qimao: 2, jjwxc: 1 },
    }))

    expect(r.bestPlatforms.length).toBeGreaterThan(0)
    for (let i = 1; i < r.bestPlatforms.length; i++) {
      expect(r.bestPlatforms[i - 1].score).toBeGreaterThanOrEqual(r.bestPlatforms[i].score)
    }
  })

  it('should handle empty genrePlatformScores gracefully', () => {
    const r = assessPotential(makeInput({
      settings: {}, // no genre at all
    }))

    expect(r.bestPlatforms.length).toBe(0)
    expect(r.totalScore).toBeLessThan(50)
  })
})
