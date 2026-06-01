import { describe, it, expect, beforeAll } from 'vitest'
import { buildContinueChapterWorkflow, extractChapterContent, computeProgress } from '../agents/workflows/continueChapter'
import { WorkflowRunner } from '../agents/runner'
import type { AgentSpec } from '../agents/types'
import { createConsistencyCheckAgent } from '../agents/steps/consistencyCheck'
import { createCommitWriteAgent } from '../agents/steps/commitWrite'
import { createExtractSettingsAgent } from '../agents/steps/extractSettings'
import { createStyleReviewAgent } from '../agents/steps/styleReview'
import { createLengthCheckAgent } from '../agents/steps/lengthCheck'
import { createLengthNormalizerAgent } from '../agents/steps/lengthNormalizer'
import { createReviserAgent } from '../agents/steps/reviser'
import { createParagraphFixAgent } from '../agents/steps/paragraphFix'

// Mock localStorage for e2e tests where commitWrite tries to persist
beforeAll(() => {
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage
})

function fakeAgent(id: string, name: string, output: string): AgentSpec {
  return {
    id, name, badge: 'test', desc: 'test',
    systemPrompt: `You are ${name}`,
    requiredContext: [],
    parseOutput: (r) => {
      try { return JSON.parse(r.replace(/```json\n?/g, '').replace(/```/g, '')) }
      catch { return { raw: r } }
    },
    writeBack: async () => {},
  }
}

describe('buildContinueChapterWorkflow', () => {
  it('generates correct step count for 3 chapters', () => {
    const steps = buildContinueChapterWorkflow({ chapterCount: 3, startChapterNo: 4, wordsPerChapter: 2000 })
    // load_context + 3×(gen_body + length_check + length_normalizer + paragraph_fix + style_review + reviser) + consistency_check + extract_settings + foreshadow + commit_write = 6×3 + 5 = 23
    expect(steps).toHaveLength(23)
    expect(steps[0].id).toBe('load_context')
    expect(steps[0].approval).toBe('auto')

    // gen_body_1 → length_check_1
    expect(steps[1].id).toBe('gen_body_1')
    expect(steps[1].approval).toBe('always')
    expect(steps[1].next).toBe('length_check_1')
    expect(steps[1].inputs.targetWords).toBe('2000')

    // length_check_1 → length_normalizer_1
    expect(steps[2].id).toBe('length_check_1')
    expect(steps[2].approval).toBe('auto')
    expect(steps[2].skippable).toBe(true)
    expect(steps[2].next).toBe('length_normalizer_1')

    // length_normalizer_1 → paragraph_fix_1
    expect(steps[3].id).toBe('length_normalizer_1')
    expect(steps[3].agentId).toBe('length_normalizer')
    expect(steps[3].approval).toBe('always')
    expect(steps[3].skippable).toBe(true)
    expect(steps[3].next).toBe('paragraph_fix_1')

    // paragraph_fix_1 → style_review_1
    expect(steps[4].id).toBe('paragraph_fix_1')
    expect(steps[4].approval).toBe('auto')
    expect(steps[4].skippable).toBe(true)
    expect(steps[4].next).toBe('style_review_1')
    expect(steps[4].inputs.contentKey).toBe('step:length_normalizer_1')

    // style_review_1 → reviser_1
    expect(steps[5].id).toBe('style_review_1')
    expect(steps[5].approval).toBe('on_warning')
    expect(steps[5].next).toBe('reviser_1')

    // reviser_1 → gen_body_2
    expect(steps[6].id).toBe('reviser_1')
    expect(steps[6].agentId).toBe('reviser')
    expect(steps[6].next).toBe('gen_body_2')

    // G7: gen_body_N 的 plan 和 continueFrom 应引用显式步骤
    expect(steps[1].inputs.plan).toBe('@ctx.step:load_context')
    expect(steps[1].inputs.continueFrom).toBe('@ctx.step:load_context')
    // gen_body_2: plan 引用 load_context，continueFrom 引用前一章正文
    expect(steps[7].inputs.plan).toBe('@ctx.step:load_context')
    expect(steps[7].inputs.continueFrom).toBe('@ctx.step:gen_body_1')
    // gen_body_3: plan 引用 load_context，continueFrom 引用前一章正文
    expect(steps[13].inputs.plan).toBe('@ctx.step:load_context')
    expect(steps[13].inputs.continueFrom).toBe('@ctx.step:gen_body_2')

    // last reviser → consistency_check
    expect(steps[18].id).toBe('reviser_3')
    expect(steps[18].next).toBe('consistency_check')

    // G8: consistency_check 应通过 contentKey 显式引用最后一章的 gen_body 正文
    expect(steps[19].inputs.contentKey).toBe('step:gen_body_3')

    // consistency_check
    expect(steps[19].id).toBe('consistency_check')
    expect(steps[19].approval).toBe('on_warning')
    expect(steps[19].next).toBe('extract_settings')

    // extract_settings → foreshadow
    expect(steps[20].id).toBe('extract_settings')
    expect(steps[20].approval).toBe('on_warning')
    expect(steps[20].next).toBe('foreshadow')

    // foreshadow → commit_write
    expect(steps[21].id).toBe('foreshadow')
    expect(steps[21].agentId).toBe('foreshadow')
    expect(steps[21].approval).toBe('auto')
    expect(steps[21].skippable).toBe(true)
    expect(steps[21].next).toBe('commit_write')

    // commit_write terminal
    expect(steps[22].id).toBe('commit_write')
    expect(steps[22].approval).toBe('always')
    expect(steps[22].skippable).toBe(false)
  })

  it('all gen_body steps have approval=always', () => {
    const steps = buildContinueChapterWorkflow({ chapterCount: 2, startChapterNo: 1, wordsPerChapter: 2000 })
    const bodySteps = steps.filter(s => s.id.startsWith('gen_body_'))
    expect(bodySteps.every(s => s.approval === 'always')).toBe(true)
  })

  it('commit_write is not skippable', () => {
    const steps = buildContinueChapterWorkflow({ chapterCount: 1, startChapterNo: 1, wordsPerChapter: 2000 })
    const commit = steps.find(s => s.id === 'commit_write')
    expect(commit).toBeDefined()
    expect(commit!.skippable).toBe(false)
  })

  it('extract_settings is inserted between consistency_check and foreshadow', () => {
    const steps = buildContinueChapterWorkflow({ chapterCount: 1, startChapterNo: 1, wordsPerChapter: 2000 })
    const idx = steps.findIndex(s => s.id === 'extract_settings')
    expect(idx).toBeGreaterThan(0)
    expect(steps[idx - 1].id).toBe('consistency_check')
    expect(steps[idx].next).toBe('foreshadow')
  })
})

describe('continueChapter workflow e2e (auto mode)', () => {
  it('runs all steps and emits run:done in auto mode', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgents([
      fakeAgent('chapter', '章纲规划', '{"plan":"chapter plan"}'),
      fakeAgent('body', '正文生成', '{"content":"第一章正文"}'),
      fakeAgent('foreshadow', '伏笔分析', '{"hookLedger":{},"healthIssues":[],"stats":{},"summary":"无伏笔变更"}'),
      createLengthCheckAgent(),
      createLengthNormalizerAgent(),
      createParagraphFixAgent(),
      createStyleReviewAgent(),
      createReviserAgent(),
      createConsistencyCheckAgent(),
      createExtractSettingsAgent(),
      createCommitWriteAgent(),
    ])

    let callCount = 0
    runner.setLlmCall(async (_sp: string, _up: string) => {
      callCount++
      if (callCount === 1) return '{"plan":"chapter plan"}'
      if (callCount === 2) return '{"content":"第一章正文"}'
      // length_normalizer step
      if (callCount === 3) return '{"content":"第一章正文（已调整）"}'
      // style_review step
      if (callCount === 4) return '{"passed":true,"warnings":[],"summary":"文风审查通过"}'
      // reviser step
      return '{"content":"第一章正文（已修订）","patches":[],"fixedIssues":[]}'
    })

    let doneEmitted = false
    runner.on('run:done', () => { doneEmitted = true })

    const steps = buildContinueChapterWorkflow({ chapterCount: 1, startChapterNo: 1, wordsPerChapter: 2000 })
    await runner.run(steps, 'auto')

    expect(doneEmitted).toBe(true)
    expect(runner.status).toBe('done')
    // History: 11 steps (load_context + gen_body_1 + length_check_1 + length_normalizer_1 + paragraph_fix_1 + style_review_1 + reviser_1 + consistency_check + extract_settings + foreshadow + commit_write)
    const historyIds = runner.history.map(h => h.stepId)
    expect(historyIds).toContain('load_context')
    expect(historyIds).toContain('gen_body_1')
    expect(historyIds).toContain('length_check_1')
    expect(historyIds).toContain('length_normalizer_1')
    expect(historyIds).toContain('paragraph_fix_1')
    expect(historyIds).toContain('style_review_1')
    expect(historyIds).toContain('reviser_1')
    expect(historyIds).toContain('consistency_check')
    expect(historyIds).toContain('extract_settings')
    expect(historyIds).toContain('foreshadow')
    expect(historyIds).toContain('commit_write')
    expect(runner.history).toHaveLength(11)
  })
})

describe('continueChapter workflow e2e (approval mode)', () => {
  it('pauses on gen_body_1 and commit_write, resumes on approve', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgents([
      fakeAgent('chapter', '章纲规划', '{"plan":"chapter plan"}'),
      fakeAgent('body', '正文生成', '{"content":"第一章正文"}'),
      fakeAgent('foreshadow', '伏笔分析', '{"hookLedger":{},"healthIssues":[],"stats":{},"summary":"无伏笔变更"}'),
      createLengthCheckAgent(),
      createLengthNormalizerAgent(),
      createParagraphFixAgent(),
      createStyleReviewAgent(),
      createReviserAgent(),
      createConsistencyCheckAgent(),
      createExtractSettingsAgent(),
      createCommitWriteAgent(),
    ])

    let callCount = 0
    runner.setLlmCall(async (_sp: string, _up: string) => {
      callCount++
      if (callCount === 1) return '{"plan":"chapter plan"}'
      if (callCount === 2) return '{"content":"第一章正文"}'
      // length_normalizer
      if (callCount === 3) return '{"content":"第一章正文（已调整）"}'
      // style_review
      if (callCount === 4) return '{"passed":true,"warnings":[],"summary":"文风审查通过"}'
      // reviser
      return '{"content":"第一章正文（已修订）","patches":[],"fixedIssues":[]}'
    })

    // 自动 approve 所有等待步骤
    runner.on('step:awaiting', () => {
      setTimeout(() => runner.decide({ type: 'approve' }), 10)
    })

    let doneEmitted = false
    runner.on('run:done', () => { doneEmitted = true })

    const steps = buildContinueChapterWorkflow({ chapterCount: 1, startChapterNo: 1, wordsPerChapter: 2000 })
    await runner.run(steps, 'approval')

    expect(doneEmitted).toBe(true)
    expect(runner.status).toBe('done')
  })
})

describe('extractChapterContent', () => {
  it('returns plain text as-is', () => {
    expect(extractChapterContent('正文内容')).toBe('正文内容')
  })

  it('extracts content from JSON', () => {
    expect(extractChapterContent(JSON.stringify({ content: '提取的内容' }))).toBe('提取的内容')
  })
})

describe('computeProgress', () => {
  it('0% before start, 100% at end', () => {
    const steps = buildContinueChapterWorkflow({ chapterCount: 1, startChapterNo: 1, wordsPerChapter: 2000 })
    expect(computeProgress(steps, -1)).toBe(0)
    expect(computeProgress(steps, steps.length - 1)).toBe(100)
  })
})
