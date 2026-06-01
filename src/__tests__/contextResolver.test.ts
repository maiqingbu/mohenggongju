import { describe, it, expect } from 'vitest'
import { resolveVariable, expandPrompt, UnknownVariable } from '../composables/useContextResolver'
import type { ResolverCtx } from '../composables/useContextResolver'

// ── Mock context helpers ──

function mockWorkStore(overrides: Record<string, any> = {}): any {
  return {
    currentWork: null,
    currentChapterId: null,
    works: [],
    volumes: [],
    chapterMap: {},
    totalWordCount: 0,
    ...overrides,
  }
}

function mockSettingsManager(chars: any[] = [], worlds: any[] = [], fores: any[] = [], items: any[] = []) {
  return {
    listByType(type: string) {
      if (type === 'character') return chars
      if (type === 'world_setting') return worlds
      if (type === 'foreshadowing') return fores
      if (type === 'item') return items
      return []
    },
  }
}

function mockWorkspaceSettings(overrides: Record<string, any> = {}) {
  return {
    genre: '',
    style: '',
    summary: '',
    perspective: '',
    tags: [],
    targetWordCount: 1000000,
    ...overrides,
  }
}

function ctx(overrides: Partial<{
  workStore: Record<string, any>
  chars: any[]
  worlds: any[]
  fores: any[]
  items: any[]
  wsSettings: Record<string, any>
  outlines: Map<string, string>
}> = {}): ResolverCtx {
  return {
    workStore: () => mockWorkStore(overrides.workStore),
    settingsManager: () => mockSettingsManager(overrides.chars, overrides.worlds, overrides.fores, overrides.items),
    workspaceSettings: () => mockWorkspaceSettings(overrides.wsSettings),
    outlines: overrides.outlines,
  }
}

// ── 基础信息 ──

describe('@基础信息', () => {
  it('expands with title, genre, style, summary', () => {
    const result = resolveVariable('@基础信息', ctx({
      workStore: { currentWork: { title: '测试书' } },
      wsSettings: { genre: '玄幻', style: '轻松', summary: '一个测试故事' },
    }))
    expect(result).toContain('测试书')
    expect(result).toContain('玄幻')
    expect(result).toContain('轻松')
    expect(result).toContain('一个测试故事')
  })

  it('shows fallback when empty', () => {
    const result = resolveVariable('@基础信息', ctx({ wsSettings: { targetWordCount: 0 } }))
    expect(result).toContain('基础信息未填写')
  })
})

describe('@书名', () => {
  it('returns book title', () => {
    const result = resolveVariable('@书名', ctx({ workStore: { currentWork: { title: '剑来' } } }))
    expect(result).toBe('剑来')
  })

  it('returns fallback for no work', () => {
    expect(resolveVariable('@书名', ctx())).toBe('(未命名作品)')
  })
})

describe('@类型', () => {
  it('returns genre from workspace', () => {
    expect(resolveVariable('@类型', ctx({ wsSettings: { genre: '都市' } }))).toBe('都市')
  })
})

describe('@目标字数', () => {
  it('returns word count', () => {
    expect(resolveVariable('@目标字数', ctx({ wsSettings: { targetWordCount: 500000 } }))).toBe('500000')
  })
})

// ── 核心构架 ──

describe('@主角', () => {
  it('returns formatted protagonist via structuredData.category', () => {
    const result = resolveVariable('@主角', ctx({
      chars: [{
        name: '叶凡',
        nickname: '小凡',
        structuredData: { category: '主角', characterTags: ['主角'], nickname: '小凡' },
        raw_text: '普通少年踏上修行路',
        state: { status: '练气期' },
      }],
    }))
    expect(result).toContain('叶凡')
    expect(result).toContain('小凡')
    expect(result).toContain('主角')
    expect(result).toContain('练气期')
  })

  it('returns protagonist via structuredData.characterTags', () => {
    const result = resolveVariable('@主角', ctx({
      chars: [{
        name: '陈平安',
        structuredData: { characterTags: ['主角'], nickname: '' },
      }],
    }))
    expect(result).toContain('陈平安')
  })

  it('returns fallback when no protagonist (Bug 12: neither isProtagonist nor top-level tags exist)', () => {
    // 模拟真实数据结构：SettingEntity 无 isProtagonist/tags 顶层字段，
    // structuredData 中 category 不是 '主角' 且 characterTags 不含 '主角'
    const result = resolveVariable('@主角', ctx({
      chars: [
        { name: '路人甲', structuredData: { category: '配角', characterTags: [] } },
        { name: '路人乙', structuredData: { category: '反派', characterTags: ['反派'] } },
      ],
    }))
    expect(result).toBe('(未设置主角)')
  })

  it('returns fallback when no characters at all', () => {
    expect(resolveVariable('@主角', ctx())).toBe('(未设置主角)')
  })
})

describe('@金手指', () => {
  it('finds cheat item via structuredData.properties', () => {
    const result = resolveVariable('@金手指', ctx({
      items: [{
        name: '神秘系统',
        summary: '一个能兑换万物的系统',
        structuredData: { properties: ['金手指', '系统'], function: '兑换万物' },
      }],
    }))
    expect(result).toContain('神秘系统')
    expect(result).not.toBe('(无)')
  })

  it('finds cheat item via name containing 金手指', () => {
    const result = resolveVariable('@金手指', ctx({
      items: [{
        name: '金手指系统',
        summary: '穿越自带金手指',
        structuredData: { properties: ['辅助'] },
      }],
    }))
    expect(result).toContain('金手指系统')
    expect(result).not.toBe('(无)')
  })

  it('returns fallback when no cheat item (Bug 11: tags field does not exist on ItemData)', () => {
    // 模拟真实 ItemData 结构：有 properties 但没有 tags 字段
    const result = resolveVariable('@金手指', ctx({
      items: [
        { name: '青锋剑', structuredData: { properties: ['武器', '法宝'], function: '削铁如泥' } },
        { name: '储物戒', structuredData: { properties: ['储物'], function: '存放物品' } },
      ],
    }))
    expect(result).toBe('(无)')
  })

  it('returns fallback when no items at all', () => {
    expect(resolveVariable('@金手指', ctx())).toBe('(无)')
  })
})

describe('@世界观', () => {
  it('returns world settings list', () => {
    const result = resolveVariable('@世界观', ctx({
      worlds: [{ name: '修炼体系', raw_text: '炼气→筑基→金丹' }],
    }))
    expect(result).toContain('修炼体系')
    expect(result).toContain('炼气→筑基→金丹')
  })
})

// ── 设定数据 ──

describe('@设定数据', () => {
  it('returns full settings dump', () => {
    const result = resolveVariable('@设定数据', ctx({
      chars: [{ name: '叶凡', tags: ['主角'], raw_text: '少年' }],
      worlds: [{ name: '修真界', raw_text: '三界六道' }],
      fores: [{ name: '大伏笔', status: '已埋', raw_text: '远古隐秘' }],
    }))
    expect(result).toContain('角色')
    expect(result).toContain('叶凡')
    expect(result).toContain('世界观条目')
    expect(result).toContain('修真界')
    expect(result).toContain('伏笔')
    expect(result).toContain('大伏笔')
  })
})

describe('@所有角色', () => {
  it('returns character name list', () => {
    const result = resolveVariable('@所有角色', ctx({
      chars: [{ name: '张三' }, { name: '李四' }],
    }))
    expect(result).toContain('张三')
    expect(result).toContain('李四')
  })
})

// ── 进度辅助 ──

describe('@目前章数', () => {
  it('counts all chapters', () => {
    const result = resolveVariable('@目前章数', ctx({
      workStore: { chapterMap: { 1: [{}, {}], 2: [{}] } },
    }))
    expect(result).toBe('3')
  })

  it('returns 0 when no store', () => {
    expect(resolveVariable('@目前章数', ctx())).toBe('0')
  })
})

describe('@当前卷数', () => {
  it('counts volumes', () => {
    const result = resolveVariable('@当前卷数', ctx({
      workStore: { volumes: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    }))
    expect(result).toBe('3')
  })
})

// ── Phase 2 新增变量 ──

describe('@前文章纲', () => {
  it('returns previous chapter outline', () => {
    const outlines = new Map<string, string>([
      ['chapter_1', '第一章章纲：主角出场'],
      ['chapter_2', '第二章章纲：首次冲突'],
      ['chapter_3', '第三章章纲：拜师学艺'],
    ])
    const result = resolveVariable('@前文章纲', ctx({
      workStore: { currentChapterId: 2 },
      outlines,
    }))
    expect(result).toContain('第一章章纲')
  })

  it('returns fallback when no previous chapter', () => {
    const outlines = new Map<string, string>([
      ['chapter_1', '第一章章纲'],
    ])
    const result = resolveVariable('@前文章纲', ctx({
      workStore: { currentChapterId: 1 },
      outlines,
    }))
    expect(result).toContain('第一个有章纲的章节')
  })

  it('returns fallback when no current chapter', () => {
    expect(resolveVariable('@前文章纲', ctx())).toContain('缺少当前章节信息')
  })
})

describe('@角色状态快照', () => {
  it('returns formatted character state for all characters', () => {
    const result = resolveVariable('@角色状态快照', ctx({
      chars: [
        { name: '叶凡', nickname: '小凡', tags: ['主角'], state: { status: '练气期', location: '青云山', mood: '坚定', goal: '突破筑基' }, raw_text: '少年修士' },
        { name: '苏檀儿', tags: ['女主'], state: { status: '筑基期', location: '药园', mood: '忧虑' }, raw_text: '药王谷传人' },
      ],
    }))
    expect(result).toContain('叶凡')
    expect(result).toContain('小凡')
    expect(result).toContain('练气期')
    expect(result).toContain('青云山')
    expect(result).toContain('坚定')
    expect(result).toContain('突破筑基')
    expect(result).toContain('苏檀儿')
    expect(result).toContain('忧虑')
  })

  it('returns fallback when no characters', () => {
    const result = resolveVariable('@角色状态快照', ctx({ chars: [] }))
    expect(result).toContain('尚无角色数据')
  })
})

describe('@伏笔状态', () => {
  it('returns foreshadowing summary with status', () => {
    const result = resolveVariable('@伏笔状态', ctx({
      fores: [
        { name: '神秘戒指', structuredData: { resolved: false }, summary: '叶凡捡到的戒指蕴含远古力量' },
        { name: '灭门真凶', structuredData: { resolved: true }, summary: '揭示真凶是大师兄' },
        { name: '苏檀儿身世', structuredData: { resolved: false }, summary: '苏檀儿实为仙界遗孤' },
      ],
    }))
    expect(result).toContain('共 3 条伏笔')
    expect(result).toContain('已回收 1 条')
    expect(result).toContain('待推进 2 条')
    expect(result).toContain('神秘戒指')
    expect(result).toContain('灭门真凶')
    expect(result).toContain('苏檀儿身世')
  })

  it('returns fallback when no foreshadowings', () => {
    const result = resolveVariable('@伏笔状态', ctx({ fores: [] }))
    expect(result).toContain('暂无伏笔')
  })
})

// ── 未知变量 ──

describe('UnknownVariable', () => {
  it('throws for unregistered key', () => {
    expect(() => resolveVariable('@不存在的变量', ctx())).toThrow(UnknownVariable)
  })
})

// ── expandPrompt ──

describe('expandPrompt', () => {
  it('replaces known variables in template', () => {
    const result = expandPrompt('请基于 @书名 和 @类型 续写', ctx({
      workStore: { currentWork: { title: '剑来' } },
      wsSettings: { genre: '仙侠' },
    }))
    expect(result).toContain('剑来')
    expect(result).toContain('仙侠')
  })

  it('marks unknown variables with warning', () => {
    const result = expandPrompt('请用 @未知变量 测试', ctx())
    expect(result).toContain('未知变量: 未知变量')
    expect(result).toContain('⚠️ 以下变量未识别')
  })

  it('resolves @前N章正文(N=3) with parameter', () => {
    const result = resolveVariable('@前N章正文(N=3)', ctx({
      workStore: {
        chapterMap: {
          1: [
            { title: '第1章', content: '第一章内容', sort_order: 0 },
            { title: '第2章', content: '第二章内容', sort_order: 1 },
            { title: '第3章', content: '第三章内容', sort_order: 2 },
            { title: '第4章', content: '第四章内容', sort_order: 3 },
          ],
        },
      },
    }))
    // 按 sort_order 降序（最近的在前）— 第4章(sort=3) → 第3章(sort=2) → 第2章(sort=1)
    expect(result).toContain('第2章')
    expect(result).toContain('第3章')
    expect(result).toContain('第4章')
    expect(result).not.toContain('第1章') // N=3, 取 sort_order 最大的 3 章
  })
})
