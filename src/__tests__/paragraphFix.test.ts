/**
 * paragraphFix agent 测试 — 段落分析 + 规则合并
 */
import { describe, it, expect } from 'vitest'
import { analyzeParagraphs, mergeParagraphs, createParagraphFixAgent } from '../agents/steps/paragraphFix'

describe('analyzeParagraphs', () => {
  it('returns zeros for empty text', () => {
    const a = analyzeParagraphs('')
    expect(a.totalParagraphs).toBe(0)
    expect(a.needsFix).toBe(false)
  })

  it('counts single-sentence paragraphs', () => {
    const text = [
      '他站了起来。走向门口。外面下着雨。',  // multi-sentence
      '他看了看窗外。',                          // single sentence
      '雨停了。天晴了。云散了。',                // multi-sentence
    ].join('\n\n')
    const a = analyzeParagraphs(text)
    expect(a.totalParagraphs).toBe(3)
    expect(a.nonDialogueSingleSentence).toBe(1)
  })

  it('detects needsFix when ratio > 25%', () => {
    // 2 single + 2 multi → 50% single → needsFix
    const text = [
      '他站起来了。',
      '他看了看窗外。',
      '他走到门口。外面下雨了。天很暗。',
      '他又坐下了。想了想。决定不走。',
    ].join('\n\n')
    const a = analyzeParagraphs(text)
    expect(a.needsFix).toBe(true)
  })

  it('excludes dialogue from nonDialogueSingleSentence', () => {
    const text = [
      '"走吧。"他说。',
      '他看了看窗外。',
      '"等一下。"',
      '雨停了。天晴了。',
    ].join('\n\n')
    const a = analyzeParagraphs(text)
    // 1 narrative single ("他看了看窗外。"), 1 narrative multi ("雨停了。天晴了。"), 2 dialogue (excluded)
    expect(a.nonDialogueSingleSentence).toBe(1)
    expect(a.totalParagraphs).toBe(4)
  })

  it('excludes system messages', () => {
    const text = [
      '叮——检测到宿主。正在绑定系统。绑定完成。',
      '签到成功。获得奖励。',
      '他愣了一下。然后点了签到按钮。',
    ].join('\n\n')
    const a = analyzeParagraphs(text)
    // Last one is multi-sentence narrative → 0 single non-dialogue
    expect(a.nonDialogueSingleSentence).toBe(0)
  })
})

describe('mergeParagraphs', () => {
  it('merges consecutive single-sentence narrative paragraphs', () => {
    const text = [
      '他站了起来。',
      '走向门口。',
      '外面下着雨。',
    ].join('\n\n')

    const { result, fixed } = mergeParagraphs(text)
    expect(fixed).toBe(2) // merged 3 into 1 → saved 2 paragraph breaks
    // All 3 single-sentence should become 1 paragraph
    const paras = result.split('\n\n').filter(p => p.trim())
    expect(paras.length).toBe(1)
  })

  it('does NOT merge dialogue paragraphs together', () => {
    const text = [
      '"你是谁？"他问。',
      '"我叫秦月。"她说。',
    ].join('\n\n')

    const { result, fixed } = mergeParagraphs(text)
    expect(fixed).toBe(0)
    const paras = result.split('\n\n').filter(p => p.trim())
    expect(paras.length).toBe(2)
  })

  it('does NOT merge system messages with narrative', () => {
    const text = [
      '叮——系统绑定完成。',
      '他愣了一下。',
    ].join('\n\n')

    const { result, fixed } = mergeParagraphs(text)
    expect(fixed).toBe(0)
    const paras = result.split('\n\n').filter(p => p.trim())
    expect(paras.length).toBe(2)
  })

  it('preserves multi-sentence paragraphs as-is', () => {
    const text = [
      '他站了起来。走向门口。打开门。外面下着雨。',
      '他看了看窗外。天空灰蒙蒙的。',
    ].join('\n\n')

    const { result, fixed } = mergeParagraphs(text)
    expect(fixed).toBe(0)
    const paras = result.split('\n\n').filter(p => p.trim())
    expect(paras.length).toBe(2)
  })

  it('mixed content: merges narrative singles, keeps dialogue separate', () => {
    const text = [
      '他站了起来。',                    // single narrative
      '看了看窗外。',                     // single narrative
      '"你在看什么？"一个声音问。',      // dialogue
      '他转过头。',                       // single narrative
      '"没什么。"他说。',                // dialogue
      '窗外的雨还在下。风很大。树叶在摇。', // multi narrative
    ].join('\n\n')

    const { result, fixed } = mergeParagraphs(text)
    // "他站了起来。" + "看了看窗外。" → merged (1 fix)
    // "他转过头。" is single but not merged because it's between dialogues
    const paras = result.split('\n\n').filter(p => p.trim())
    expect(paras.length).toBe(5) // merged(2→1) + dialogue + single + dialogue + multi
    expect(fixed).toBe(1)
  })
})

describe('createParagraphFixAgent', () => {
  const agent = createParagraphFixAgent()

  it('has correct metadata', () => {
    expect(agent.id).toBe('paragraph_fix')
    expect(agent.name).toBe('段落修复')
    expect(agent.badge).toBe('系统')
  })

  it('has empty systemPrompt (local execution)', () => {
    expect(agent.systemPrompt).toBe('')
  })

  it('localExecute merges paragraphs from ctx', async () => {
    const ctx = {
      'step:gen_body_1': '他站了起来。\n\n看了看窗外。\n\n"走吧。"他说。\n\n他走出去。关上门。外面很冷。',
    }
    const inputs = { contentKey: 'step:gen_body_1' }

    const result = await agent.localExecute!(inputs, ctx)
    // Should merge "他站了起来。" + "看了看窗外。" (2 into 1)
    expect(result).toContain('他站了起来。')
    expect(result).toContain('看了看窗外。')
    // Dialogue should stay separate
    expect(result).toContain('"走吧。"他说。')
  })

  it('localExecute handles empty content', async () => {
    const ctx = { 'step:gen_body_1': '' }
    const inputs = { contentKey: 'step:gen_body_1' }
    const result = await agent.localExecute!(inputs, ctx)
    expect(result).toBe('')
  })

  it('localExecute finds content by pattern when contentKey is empty', async () => {
    const ctx = {
      'step:length_normalizer_1': '他看了看。\n\n又看了看。\n\n然后走了。',
    }
    const inputs: Record<string, string> = {}

    const result = await agent.localExecute!(inputs, ctx)
    // Should merge the 3 single-sentence paragraphs
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('parseOutput extracts content from JSON wrapper', () => {
    const parsed = agent.parseOutput('{"_analysis":true,"content":"合并后的正文"}')
    expect(parsed.content).toBe('合并后的正文')
  })

  it('parseOutput returns raw text when not JSON', () => {
    const parsed = agent.parseOutput('纯文本正文内容')
    expect(parsed.content).toBe('纯文本正文内容')
  })
})
