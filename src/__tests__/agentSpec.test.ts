import { describe, it, expect, vi } from 'vitest'
import { outlineAgent } from '../agents/outline'
import { chapterAgent } from '../agents/chapter'
import { bodyAgent } from '../agents/body'

describe('outlineAgent', () => {
  it('parses JSON output correctly', () => {
    const json = JSON.stringify({
      theme: '废柴逆袭',
      synopsis: '少年从零开始，踏遍万界，终成至尊。',
      acts: [{ name: '第一幕', chapters: '1-30', goal: '建立世界观', climax: '转折点' }],
      volumes: [{ title: '卷1', summary: '初始卷', milestones: ['拜师', '突破'] }],
    })
    const input = '```json\n' + json + '\n```'
    const result = outlineAgent.parseOutput(input) as any
    expect(result.theme).toBe('废柴逆袭')
    expect(result.acts[0].name).toBe('第一幕')
  })

  it('falls back to raw on invalid JSON', () => {
    const result = outlineAgent.parseOutput('invalid input')
    expect(result.raw).toBe('invalid input')
  })

  it('has requiredContext array', () => {
    expect(outlineAgent.requiredContext.length).toBeGreaterThan(0)
    expect(outlineAgent.requiredContext).toContain('@基础信息')
  })
})

describe('chapterAgent', () => {
  it('parses beats and hook', () => {
    const json = JSON.stringify({
      chapterTitle: '第一章 觉醒',
      beats: [
        { position: '开场', content: '主角醒来', words: 300 },
        { position: '高潮', content: '能力觉醒', words: 600 },
      ],
      hook: '神秘人悄然现身',
      charactersInChapter: ['主角', '导师'],
      foreshadowingPlanted: ['神秘人身世'],
      foreshadowingRecovered: [],
    })
    const result = chapterAgent.parseOutput('```json\n' + json + '\n```')
    expect(result.chapterTitle).toBe('第一章 觉醒')
    expect(result.beats).toHaveLength(2)
    expect(result.hook).toBe('神秘人悄然现身')
  })
})

describe('bodyAgent', () => {
  it('returns plain text content', () => {
    const result = bodyAgent.parseOutput('  主角推开门，走进房间。\n\n屋内昏暗，只有一盏油灯。  ')
    expect(result.content).toBe('主角推开门，走进房间。\n\n屋内昏暗，只有一盏油灯。')
  })

  it('writeBack logs length', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await bodyAgent.writeBack({ content: 'a'.repeat(500) })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('agent IDs match AgentPanel allAgents', () => {
  const agents = [outlineAgent, chapterAgent, bodyAgent]

  it('each agent has unique id', () => {
    const ids = agents.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each agent has non-empty systemPrompt', () => {
    for (const a of agents) {
      expect(a.systemPrompt.length).toBeGreaterThan(10)
    }
  })

  it('each agent has parseOutput and writeBack functions', () => {
    for (const a of agents) {
      expect(typeof a.parseOutput).toBe('function')
      expect(typeof a.writeBack).toBe('function')
    }
  })
})
