import { describe, it, expect } from 'vitest'
import { createShortStoryGenAgent } from '../agents/steps/shortStoryGen'

describe('shortStoryGen step agent', () => {
  it('should have id short_story_gen', () => {
    const agent = createShortStoryGenAgent()
    expect(agent.id).toBe('short_story_gen')
  })

  it('should have non-empty systemPrompt with COMPACT_CONSTITUTION', () => {
    const agent = createShortStoryGenAgent()
    expect(agent.systemPrompt).toBeTruthy()
    expect(agent.systemPrompt.length).toBeGreaterThan(100)
    // Must include the writing iron rules
    expect(agent.systemPrompt).toContain('写作铁律')
  })

  it('should require @设定数据 as context', () => {
    const agent = createShortStoryGenAgent()
    expect(agent.requiredContext).toContain('@设定数据')
  })

  it('parseOutput should return trimmed content and warnings', () => {
    const agent = createShortStoryGenAgent()
    const result = agent.parseOutput('  这是一段测试正文\n\n第二段  ')
    expect(result.content).toBe('这是一段测试正文\n\n第二段')
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('parseOutput should handle empty input', () => {
    const agent = createShortStoryGenAgent()
    const result = agent.parseOutput('')
    expect(result.content).toBe('')
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('should not declare localExecute (must be LLM-driven)', () => {
    const agent = createShortStoryGenAgent()
    expect(agent.localExecute).toBeUndefined()
  })
})

import { buildShortStoryWorkflow } from '../agents/workflows/shortStory'

describe('buildShortStoryWorkflow', () => {
  it('should return exactly 4 steps', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {} as any, 5000)
    expect(steps).toHaveLength(4)
  })

  it('should have short_story_gen as first step', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {} as any, 5000)
    expect(steps[0].agentId).toBe('short_story_gen')
    expect(steps[0].approval).toBe('always')
  })

  it('should have paragraph_fix as second step with auto approval', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {} as any, 5000)
    expect(steps[1].agentId).toBe('paragraph_fix')
    expect(steps[1].approval).toBe('auto')
    expect(steps[1].skippable).toBe(true)
  })

  it('should have style_review as third step with on_warning approval', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {} as any, 5000)
    expect(steps[2].agentId).toBe('style_review')
    expect(steps[2].approval).toBe('on_warning')
    expect(steps[2].skippable).toBe(true)
  })

  it('should have commit_write as final step with always approval and not skippable', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {} as any, 5000)
    const last = steps[3]
    expect(last.agentId).toBe('commit_write')
    expect(last.approval).toBe('always')
    expect(last.skippable).toBe(false)
    expect(last.next).toBeNull()
  })

  it('should wire step next references correctly', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {} as any, 5000)
    expect(steps[0].next).toBe('paragraph_fix')
    expect(steps[1].next).toBe('style_review')
    expect(steps[2].next).toBe('commit_write')
    expect(steps[3].next).toBeNull()
  })

  it('should include platformId, wordCount in gen step inputs', () => {
    const steps = buildShortStoryWorkflow('fanqie', { genre: '玄幻' } as any, 3000)
    const genInputs = steps[0].inputs
    expect(genInputs.platformId).toBe('fanqie')
    expect(genInputs.wordCount).toBe('3000')
  })
})
