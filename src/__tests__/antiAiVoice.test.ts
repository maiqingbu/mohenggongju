import { describe, it, expect } from 'vitest'
import { scanFatigueWords, scanSentencePatterns, generateAntiAiReport } from '../composables/useAntiAiVoice'
import type { AntiAiReport } from '../composables/useAntiAiVoice'

// ── scanFatigueWords ──

describe('scanFatigueWords', () => {
  it('空文本返回空数组', () => {
    expect(scanFatigueWords('')).toHaveLength(0)
  })

  it('无疲劳词文本返回空数组', () => {
    const clean = '他推开门走进院子。阳光照在石板上。远处传来马蹄声。'
    expect(scanFatigueWords(clean)).toHaveLength(0)
  })

  it('检测副词类疲劳词', () => {
    const text = '他仿佛看到什么东西。似乎有个人站在那边。好像是在等他。或许是个幻影。他不由得紧张起来。'
    const hits = scanFatigueWords(text)
    expect(hits.some(h => h.word === '仿佛')).toBe(true)
    expect(hits.some(h => h.word === '似乎')).toBe(true)
    expect(hits.some(h => h.word === '好像')).toBe(true)
    expect(hits.some(h => h.word === '不由得')).toBe(true)
  })

  it('检测心理动词疲劳词', () => {
    const text = '他感到一阵寒意。他觉得浑身发冷。他意识到自己在发抖。他心想这太可怕了。他寻思着要不要逃跑。'
    const hits = scanFatigueWords(text)
    expect(hits.some(h => h.word === '感到')).toBe(true)
    expect(hits.some(h => h.word === '觉得')).toBe(true)
    expect(hits.some(h => h.word === '意识到')).toBe(true)
    expect(hits.some(h => h.word === '心想')).toBe(true)
  })

  it('检测连接词疲劳词并标记超阈值', () => {
    const text = '然而敌人来了。不过他没有退缩。于是他拔出剑。然而攻击失败了。不过他又试了一次。于是他成功了。'
    const hits = scanFatigueWords(text)
    const hit = hits.find(h => h.word === '然而')
    expect(hit).toBeDefined()
    // "然而" 出现了 2 次，连接词 threshold 为 3
    expect(hit!.exceeded).toBe(false)
    expect(hit!.count).toBe(2)
  })

  it('多次出现应标记 exceeded', () => {
    const text = Array(10).fill('与此同时，敌人也在行动。').join('\n')
    const hits = scanFatigueWords(text)
    const hit = hits.find(h => h.word === '与此同时')
    expect(hit).toBeDefined()
    expect(hit!.exceeded).toBe(true)
    expect(hit!.count).toBe(10)
  })

  it('检测元叙事套话', () => {
    const text = '总的来说，这次战斗很精彩。欲知后事如何，且听下回分解。但见那人转身离去。'
    const hits = scanFatigueWords(text)
    expect(hits.some(h => h.word === '总的来说')).toBe(true)
    expect(hits.some(h => h.word === '欲知后事如何')).toBe(true)
    expect(hits.some(h => h.word === '但见')).toBe(true)
    // 元叙事 threshold 为 1
    const hit = hits.find(h => h.word === '总的来说')
    expect(hit!.exceeded).toBe(true)
  })

  it('检测身体反应模板', () => {
    const text = '他心中一紧。接着瞳孔一缩。然后倒吸一口凉气。最后浑身一震。'
    const hits = scanFatigueWords(text)
    expect(hits.some(h => h.word === '心中一紧')).toBe(true)
    expect(hits.some(h => h.word === '瞳孔一缩')).toBe(true)
    expect(hits.some(h => h.word === '倒吸一口凉气')).toBe(true)
    expect(hits.some(h => h.word === '浑身一震')).toBe(true)
  })

  it('英文翻译腔疲劳词检测', () => {
    const text = '事实上，这是不可否认的。显而易见，毫无疑问。值得注意的是，这很重要。'
    const hits = scanFatigueWords(text)
    expect(hits.some(h => h.word === '事实上')).toBe(true)
    expect(hits.some(h => h.word === '不可否认')).toBe(true)
    expect(hits.some(h => h.word === '显而易见')).toBe(true)
    expect(hits.some(h => h.word === '值得注意的是')).toBe(true)
  })
})

// ── scanSentencePatterns ──

describe('scanSentencePatterns', () => {
  it('无匹配返回空 violations', () => {
    const violations = scanSentencePatterns('正常的小说文本段落。有一些描述和对话。')
    // 所有 pattern count 应该为 0，exceeded 为 false
    for (const v of violations) {
      expect(v.exceeded).toBe(false)
    }
  })

  it('检测段末总结句式', () => {
    const text = '他们打了一场大战。总的来说，这场战斗改变了所有人的命运。'
    const violations = scanSentencePatterns(text)
    const v = violations.find(x => x.patternKey === 'summary_ending')
    expect(v).toBeDefined()
    expect(v!.count).toBeGreaterThanOrEqual(1)
    expect(v!.exceeded).toBe(true)
  })

  it('检测连续心理描写', () => {
    const text = '他想到了过去。他感到一阵悲伤。他觉得人生无常。他意识到一切都会过去。'
    const violations = scanSentencePatterns(text)
    const v = violations.find(x => x.patternKey === 'consecutive_psychology')
    expect(v).toBeDefined()
    expect(v!.exceeded).toBe(true)
  })

  it('检测重复对话结构', () => {
    const text = `张三说："你好。"\n李四说："你好。"\n王五说："你好。"\n赵六说："你好。"\n孙七说："你好。"`
    const violations = scanSentencePatterns(text)
    const v = violations.find(x => x.patternKey === 'repeated_dialogue_structure')
    expect(v).toBeDefined()
    expect(v!.exceeded).toBe(true)
  })

  it('检测段落碎片化', () => {
    const text = '一句话。\n\n又一句话。\n\n第三句话。\n\n第四句话。'
    const violations = scanSentencePatterns(text)
    const v = violations.find(x => x.patternKey === 'paragraph_fragmentation')
    expect(v).toBeDefined()
    // 3 段以上单句段落应被检测
    expect(v!.count).toBeGreaterThanOrEqual(1)
    expect(v!.exceeded).toBe(true)
  })

  it('检测的修饰冗余', () => {
    // 构建 120+ 字含大量"的"的文本，确保超过 100 字滑动窗口最低要求
    const text = ('红色的鲜艳的血红色的巨大的恐怖的可怕的不可思议的离奇的古怪的神秘的幽暗的深邃的悲凉的苍茫的').repeat(3)
    const violations = scanSentencePatterns(text)
    const v = violations.find(x => x.patternKey === 'redundant_modifiers')
    expect(v).toBeDefined()
    expect(v!.exceeded).toBe(true)
  })
})

// ── generateAntiAiReport ──

describe('generateAntiAiReport', () => {
  it('完全干净文本应通过所有检测', () => {
    const report = generateAntiAiReport('他走进房间，看到一个陌生人坐在角落。')
    expect(report.passed).toBe(true)
    expect(report.totalFatigueWordExceeded).toBe(0)
    expect(report.totalPatternExceeded).toBe(0)
    expect(report.suggestions.length).toBeGreaterThan(0)
    expect(report.suggestions[0]).toContain('未检测到')
  })

  it('包含大量疲劳词的文本应不通过', () => {
    const text = '他感到一阵仿佛似乎好像大概也许可能是错觉的印象。与此同时，在这个过程中，他通过不断地对敌人进行攻击。他心中一紧，瞳孔一缩，倒吸一口凉气。总的来说，这是一次可怕的遭遇。'
    const report = generateAntiAiReport(text)
    expect(report.passed).toBe(false)
    expect(report.fatigueWordHits.length).toBeGreaterThan(0)
    expect(report.totalFatigueWordExceeded).toBeGreaterThan(0)
  })

  it('包含元叙事的文本应不通过', () => {
    const text = '总的来说，这次冒险很精彩。欲知后事如何，且听下回分解。'
    const report = generateAntiAiReport(text)
    expect(report.passed).toBe(false)
  })

  it('报告应包含超阈值类别的改进建议', () => {
    const text = '他感到一阵恐惧。他觉得浑身发冷。他意识到自己在发抖。他心想这太可怕了。他感到无助。他觉得绝望。'
    const report = generateAntiAiReport(text)
    // 应该有心理动词相关的建议
    expect(report.suggestions.some(s => s.includes('心理'))).toBe(true)
  })

  it('report 数据结构完整性', () => {
    const report = generateAntiAiReport('测试文本')
    expect(report).toHaveProperty('fatigueWordHits')
    expect(report).toHaveProperty('patternViolations')
    expect(report).toHaveProperty('totalFatigueWordExceeded')
    expect(report).toHaveProperty('totalPatternExceeded')
    expect(report).toHaveProperty('passed')
    expect(report).toHaveProperty('suggestions')
    expect(Array.isArray(report.fatigueWordHits)).toBe(true)
    expect(Array.isArray(report.patternViolations)).toBe(true)
    expect(Array.isArray(report.suggestions)).toBe(true)
    expect(typeof report.passed).toBe('boolean')
  })
})
