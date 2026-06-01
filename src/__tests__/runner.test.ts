import { describe, it, expect, vi } from 'vitest'
import { WorkflowRunner, shouldBlock } from '../agents/runner'
import type { AgentSpec, WorkflowStep, ApprovalCardData } from '../agents/types'

function fakeAgent(id: string, name: string, output: string, warnings?: any[]): AgentSpec {
  return {
    id, name, badge: 'test', desc: 'test',
    systemPrompt: `You are ${name}`,
    requiredContext: [],
    parseOutput: (r) => {
      try { return JSON.parse(r.replace(/```json\n?/g, '').replace(/```/g, '')) }
      catch { return { raw: r, warnings } }
    },
    writeBack: async () => {},
  }
}

function makeSteps(approval: 'auto' | 'always' = 'auto'): WorkflowStep[] {
  return [
    { id: 's1', agentId: 'a1', inputs: {}, approval, skippable: true, next: null },
  ]
}

describe('R1: shouldBlock mode × level', () => {
  it('auto mode never blocks', () => {
    expect(shouldBlock('auto', 'always', false, false)).toBe(false)
    expect(shouldBlock('auto', 'auto', false, false)).toBe(false)
    expect(shouldBlock('auto', 'on_error', false, true)).toBe(false)
  })

  it('approval mode blocks non-auto', () => {
    expect(shouldBlock('approval', 'auto', false, false)).toBe(false)
    expect(shouldBlock('approval', 'always', false, false)).toBe(true)
  })

  it('on_warning blocks on warnings or errors', () => {
    expect(shouldBlock('approval', 'on_warning', false, false)).toBe(false)
    expect(shouldBlock('approval', 'on_warning', true, false)).toBe(true)
    expect(shouldBlock('approval', 'on_warning', false, true)).toBe(true)
  })

  it('on_error blocks only on errors', () => {
    expect(shouldBlock('approval', 'on_error', false, false)).toBe(false)
    expect(shouldBlock('approval', 'on_error', true, false)).toBe(false)
    expect(shouldBlock('approval', 'on_error', false, true)).toBe(true)
  })
})

describe('R1: awaiting_approval + decide', () => {
  it('enters awaiting for always step in approval mode', async () => {
    const runner = new WorkflowRunner()
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => '{"result":"ok"}')

    let card: ApprovalCardData | null = null
    runner.on('step:awaiting', (c) => { card = c })

    const p = runner.run(makeSteps('always'), 'approval')
    // 不 await — run 会停在 Promise gate
    await new Promise(r => setTimeout(r, 30))

    expect(runner.status).toBe('awaiting_approval')
    expect(card).not.toBeNull()
    expect(card!.agentName).toBe('A1')
    expect(card!.options).toContain('approve')
    expect(card!.options).toContain('redo')
    expect(card!.options).toContain('abort')
  })

  it('decide(approve) resumes to next step', async () => {
    const runner = new WorkflowRunner()
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => '{"result":"ok"}')

    let decided = false
    runner.on('step:decided', () => { decided = true })

    const steps: WorkflowStep[] = [
      { id: 's1', agentId: 'a1', inputs: {}, approval: 'always', skippable: true, next: 's2' },
      { id: 's2', agentId: 'a1', inputs: {}, approval: 'auto', skippable: true, next: null },
    ]

    const p = runner.run(steps, 'approval')
    await new Promise(r => setTimeout(r, 30))

    expect(runner.status).toBe('awaiting_approval')
    runner.decide({ type: 'approve' })

    await p
    expect(runner.status).toBe('done')
    expect(decided).toBe(true)
    expect(runner.history).toHaveLength(2)
  })

  it('decide(redo) re-runs the same step', async () => {
    const runner = new WorkflowRunner()
    let callCount = 0
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => { callCount++; return '{"result":"ok"}' })

    const steps: WorkflowStep[] = [
      { id: 's1', agentId: 'a1', inputs: {}, approval: 'always', skippable: true, next: null },
    ]

    const p = runner.run(steps, 'approval')
    await new Promise(r => setTimeout(r, 30))
    expect(callCount).toBe(1)

    runner.decide({ type: 'redo' })
    await new Promise(r => setTimeout(r, 30))
    expect(callCount).toBe(2)

    runner.decide({ type: 'approve' })
    await p
    expect(runner.status).toBe('done')
  })

  it('decide(abort) stops workflow', async () => {
    const runner = new WorkflowRunner()
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => '{"result":"ok"}')

    let aborted = false
    runner.on('run:aborted', () => { aborted = true })

    const p = runner.run(makeSteps('always'), 'approval')
    await new Promise(r => setTimeout(r, 30))
    runner.decide({ type: 'abort' })

    await p
    expect(runner.status).toBe('aborted')
    expect(aborted).toBe(true)
  })

  it('decide throws outside awaiting state', () => {
    const runner = new WorkflowRunner()
    expect(() => runner.decide({ type: 'approve' })).toThrow('不在审阅状态')
  })

  it('decide is idempotent — second call throws', async () => {
    const runner = new WorkflowRunner()
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => '{"result":"ok"}')

    const p = runner.run(makeSteps('always'), 'approval')
    await new Promise(r => setTimeout(r, 30))
    runner.decide({ type: 'approve' })
    expect(() => runner.decide({ type: 'approve' })).toThrow('幂等保护')

    await p
  })
})

describe('R2: skip on non-skippable step', () => {
  it('throws for skip on skippable=false', async () => {
    const runner = new WorkflowRunner()
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => '{"result":"ok"}')

    const steps: WorkflowStep[] = [
      { id: 's1', agentId: 'a1', inputs: {}, approval: 'always', skippable: false, next: null },
    ]

    let failed = false
    runner.on('run:failed', () => { failed = true })

    const p = runner.run(steps, 'approval')
    await new Promise(r => setTimeout(r, 30))
    runner.decide({ type: 'skip' })

    await p
    expect(failed).toBe(true)
  })
})

describe('R2: redo limit', () => {
  it('blocks after max attempts', async () => {
    const runner = new WorkflowRunner()
    runner.setMaxAttempts(3)
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => '{"result":"ok"}')

    const steps: WorkflowStep[] = [
      { id: 's1', agentId: 'a1', inputs: {}, approval: 'always', skippable: true, next: 's2' },
      { id: 's2', agentId: 'a1', inputs: {}, approval: 'auto', skippable: true, next: null },
    ]

    let failed = false
    runner.on('run:failed', () => { failed = true })

    const p = runner.run(steps, 'approval')
    // redo 3 次（已到上限）
    await new Promise(r => setTimeout(r, 20))
    runner.decide({ type: 'redo' })
    await new Promise(r => setTimeout(r, 20))
    runner.decide({ type: 'redo' })
    await new Promise(r => setTimeout(r, 20))
    runner.decide({ type: 'redo' })
    await new Promise(r => setTimeout(r, 20))
    // 第 4 次 redo 应触发上限
    runner.decide({ type: 'redo' })

    await p
    expect(failed).toBe(true)
  })
})

describe('R11: resumeFromRestore — skip continues to remaining steps', () => {
  it('should execute remaining steps after skipping current step', async () => {
    // 创建 runner 并运行到第1步审阅态
    const runner = new WorkflowRunner()
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => '{"result":"ok"}')

    const steps: WorkflowStep[] = [
      { id: 's1', agentId: 'a1', inputs: {}, approval: 'always', skippable: true, next: 's2' },
      { id: 's2', agentId: 'a1', inputs: {}, approval: 'auto', skippable: true, next: null },
    ]

    const p = runner.run(steps, 'approval')
    await new Promise(r => setTimeout(r, 30))
    expect(runner.status).toBe('awaiting_approval')
    expect(runner.currentStepIndex).toBe(0)

    // 序列化 & 恢复到新 runner（模拟页面刷新后恢复）
    const snap = runner.serialize()
    const runner2 = new WorkflowRunner()
    runner2.registerAgent(agent)
    runner2.setLlmCall(async () => '{"result":"ok"}')
    runner2.restore(snap)

    // 恢复并 skip s1
    let done = false
    runner2.on('run:done', () => { done = true })

    const p2 = runner2.resumeFromRestore('approval')
    await new Promise(r => setTimeout(r, 30))
    expect(runner2.status).toBe('awaiting_approval')

    runner2.decide({ type: 'skip' })
    await p2

    // Bug 修复后：skip 后应继续执行剩余步骤 s2
    expect(runner2.status).toBe('done')
    expect(done).toBe(true)
    expect(runner2.history.length).toBeGreaterThanOrEqual(1)
  })
})

describe('R11: resumeFromRestore — preserve _pendingWrites', () => {
  it('should not clear pending writes from before the resume point when continuing to remaining steps', async () => {
    // 3 步工作流：s1(非阻塞) → s2(阻塞) → s3(非阻塞)
    // 停在 s2，恢复并 approve，s3 执行后 s1 的 pendingWrites 不应丢失
    const runner = new WorkflowRunner()
    const agent: AgentSpec = {
      ...fakeAgent('a1', 'A1', '{"result":"ok"}'),
      writeBack: async (_parsed, _ctx) => {
        // 空操作，让 runner.doWriteBack 的内置 push 成为唯一写入源
      },
    }
    runner.registerAgent(agent)
    runner.setLlmCall(async () => '{"result":"ok"}')

    const steps: WorkflowStep[] = [
      { id: 's1', agentId: 'a1', inputs: {}, approval: 'auto', skippable: true, next: 's2' },
      { id: 's2', agentId: 'a1', inputs: {}, approval: 'always', skippable: true, next: 's3' },
      { id: 's3', agentId: 'a1', inputs: {}, approval: 'auto', skippable: true, next: null },
    ]

    const p = runner.run(steps, 'approval')
    await new Promise(r => setTimeout(r, 30))

    // s1 非阻塞，应已完成并推送 pendingWrite (stepId='s1')
    const pwBefore = (runner.ctx as any)._pendingWrites as any[] | undefined
    expect(pwBefore?.length).toBeGreaterThanOrEqual(1)
    expect(pwBefore!.some((w: any) => w.stepId === 's1')).toBe(true)
    expect(runner.status).toBe('awaiting_approval')
    expect(runner.currentStepIndex).toBe(1) // 停在 s2

    // 序列化 & 恢复
    const snap = runner.serialize()
    const runner2 = new WorkflowRunner()
    runner2.registerAgent(agent)
    runner2.setLlmCall(async () => '{"result":"ok"}')
    runner2.restore(snap)

    // 恢复后 _pendingWrites 应保留 s1
    const pwAfterRestore = (runner2.ctx as any)._pendingWrites as any[]
    expect(pwAfterRestore.some((w: any) => w.stepId === 's1')).toBe(true)

    // approve s2 → 应执行 s3（剩余步骤），且 s1 的写入不丢失
    const p2 = runner2.resumeFromRestore('approval')
    await new Promise(r => setTimeout(r, 30))
    runner2.decide({ type: 'approve' })
    await p2

    expect(runner2.status).toBe('done')

    // Bug 修复后：s1 的写入记录应保留（不被 run(remaining) 中 _pendingWrites=[] 清空）
    const pwAfter = (runner2.ctx as any)._pendingWrites as any[]
    expect(pwAfter.some((w: any) => w.stepId === 's1')).toBe(true)
  })
})

describe('Bug 10: resumeFromRestore — redo on second decision', () => {
  it('should loop back and re-prompt instead of silently returning', async () => {
    const runner = new WorkflowRunner()
    let callCount = 0
    const agent = fakeAgent('a1', 'A1', '{"result":"ok"}')
    runner.registerAgent(agent)
    runner.setLlmCall(async () => { callCount++; return '{"result":"ok"}' })

    const steps: WorkflowStep[] = [
      { id: 's1', agentId: 'a1', inputs: {}, approval: 'always', skippable: true, next: 's2' },
      { id: 's2', agentId: 'a1', inputs: {}, approval: 'auto', skippable: true, next: null },
    ]

    // 先跑到 s1 审阅态
    const p = runner.run(steps, 'approval')
    await new Promise(r => setTimeout(r, 30))
    expect(runner.status).toBe('awaiting_approval')
    expect(callCount).toBe(1)

    // 序列化 & 恢复到新 runner
    const snap = runner.serialize()
    const runner2 = new WorkflowRunner()
    runner2.registerAgent(agent)
    runner2.setLlmCall(async () => { callCount++; return '{"result":"ok"}' })
    runner2.restore(snap)

    let done = false
    runner2.on('run:done', () => { done = true })

    // 恢复 → redo（第一次）
    const p2 = runner2.resumeFromRestore('approval')
    await new Promise(r => setTimeout(r, 30))
    expect(runner2.status).toBe('awaiting_approval')
    runner2.decide({ type: 'redo' })

    // 等待 redo 完成并再次阻塞
    await new Promise(r => setTimeout(r, 50))
    expect(callCount).toBe(2)
    expect(runner2.status).toBe('awaiting_approval')

    // 第二次决策也选 redo — Bug 修复后应循环回来再提示，而非静默 return
    runner2.decide({ type: 'redo' })
    await new Promise(r => setTimeout(r, 50))
    expect(callCount).toBe(3)
    expect(runner2.status).toBe('awaiting_approval') // 仍在等待，而非 stuck

    // 最终 approve
    runner2.decide({ type: 'approve' })
    await p2
    expect(runner2.status).toBe('done')
    expect(done).toBe(true)
    // 应包含 s1 和 s2 的 history
    expect(runner2.history.length).toBeGreaterThanOrEqual(2)
  })
})
