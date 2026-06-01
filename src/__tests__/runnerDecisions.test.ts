/**
 * Runner 关键决策路径测试
 *
 * 覆盖之前未测试的核心路径：
 * - edit_approve：用户编辑后通过
 * - edit_redo：用户带反馈重做
 * - @ctx.* 变量解析
 * - injectedFeedback 注入到 prompt
 * - LLM 错误传播
 * - 并发 run() 保护
 * - abort() 方法
 */
import { describe, it, expect, vi } from 'vitest'
import { WorkflowRunner } from '../agents/runner'
import type { AgentSpec, WorkflowStep, Decision } from '../agents/types'

function fakeAgent(overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    id: 'test_agent', name: 'Test Agent', badge: '测试', desc: 'test',
    requiredContext: [], systemPrompt: 'test system prompt',
    parseOutput: (raw: string) => ({ content: raw }),
    writeBack: async () => {}, // 空操作，避免 runner 调用时崩溃
    ...overrides,
  }
}

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return { id: 'step_1', agentId: 'test_agent', approval: 'always', inputs: { content: 'hello' }, skippable: true, next: null, ...overrides }
}

// ⚠️ 关键：decide() 必须在 setTimeout 中调用，因为 Promise 门控在 step:awaiting 事件触发后才创建
function decideNextTick(runner: WorkflowRunner, decision: Decision) {
  setTimeout(() => runner.decide(decision), 0)
}

// ── edit_approve ──

describe('edit_approve 决策', () => {
  it('应替换历史记录和 ctx 中的 output', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())
    runner.setLlmCall(async () => 'LLM original output')

    const step = makeStep()
    const editedText = '用户手动编辑后的文本'

    runner.on('step:awaiting', () => {
      decideNextTick(runner, { type: 'edit_approve', editedContent: editedText })
    })

    await runner.run([step], 'approval')

    const history = (runner as any)._history as Array<{ stepId: string; output: string }>
    const entry = history.find(h => h.stepId === 'step_1')
    expect(entry?.output).toBe(editedText)
    expect((runner as any)._ctx['step:step_1']).toBe(editedText)
  })

  it('应触发 step:edited 事件', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())
    runner.setLlmCall(async () => 'output')

    let editedEvent: { stepId: string; diff: string } | null = null
    runner.on('step:edited', (stepId: string, diff: string) => {
      editedEvent = { stepId, diff }
    })
    runner.on('step:awaiting', () => {
      decideNextTick(runner, { type: 'edit_approve', editedContent: 'edited', diffSummary: '修改了开头' })
    })

    await runner.run([makeStep()], 'approval')

    expect(editedEvent).not.toBeNull()
    expect(editedEvent!.stepId).toBe('step_1')
    expect(editedEvent!.diff).toBe('修改了开头')
  })
})

// ── edit_redo ──

describe('edit_redo 决策', () => {
  it('应将 feedback 注入到下一次 LLM 调用的 prompt 中', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())

    const llmCalls: Array<{ system: string; user: string }> = []
    runner.setLlmCall(async (system: string, user: string) => {
      llmCalls.push({ system, user })
      return llmCalls.length === 1 ? 'first output' : 'second output'
    })

    let callCount = 0
    runner.on('step:awaiting', () => {
      callCount++
      if (callCount === 1) {
        decideNextTick(runner, { type: 'edit_redo', feedback: '请增加对话场景' })
      } else {
        decideNextTick(runner, { type: 'approve' })
      }
    })

    await runner.run([makeStep()], 'approval')

    expect(llmCalls).toHaveLength(2)
    expect(llmCalls[1].user).toContain('请增加对话场景')
    expect(llmCalls[1].user).toContain('用户修改反馈')
  })

  it('重做后第二次 LLM 调用包含 feedback，且 feedback 用后即删', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())

    const llmCalls: Array<{ user: string }> = []
    runner.setLlmCall(async (_s: string, user: string) => {
      llmCalls.push({ user })
      return 'output'
    })

    const step = makeStep()
    let callCount = 0
    runner.on('step:awaiting', () => {
      callCount++
      if (callCount === 1) {
        // 第一次阻塞：带反馈重做
        decideNextTick(runner, { type: 'edit_redo', feedback: '增加对话' })
      } else {
        // 第二次阻塞（重做后）：通过
        decideNextTick(runner, { type: 'approve' })
      }
    })

    await runner.run([step], 'approval')

    // 应有 2 次 LLM 调用：原始 + 重做
    expect(llmCalls).toHaveLength(2)
    // 第二次调用包含 feedback
    expect(llmCalls[1].user).toContain('增加对话')
    expect(llmCalls[1].user).toContain('用户修改反馈')
    // 验证 injectedFeedback 已清除
    expect((runner as any)._ctx.injectedFeedback).toBeUndefined()
  })
})

// ── @ctx.* 变量解析 ──

describe('@ctx.* 变量解析', () => {
  it('应将 @ctx.step:id 替换为之前步骤的输出', async () => {
    const runner = new WorkflowRunner()
    const agent1 = fakeAgent({ id: 'agent1' })
    const agent2 = fakeAgent({ id: 'agent2' })
    runner.registerAgent(agent1)
    runner.registerAgent(agent2)

    const capturedPrompts: string[] = []
    let stepCounter = 0
    runner.setLlmCall(async (_s: string, user: string) => {
      stepCounter++
      capturedPrompts.push(user)
      return 'step output ' + stepCounter
    })

    const step1 = makeStep({ id: 'load_context', agentId: 'agent1', approval: 'auto', inputs: {} })
    // 直接构造 step2，避免 makeStep 默认 inputs 覆盖问题
    const step2: WorkflowStep = {
      id: 'gen_body', agentId: 'agent2', approval: 'auto',
      inputs: { outline: '@ctx.step:load_context', extra: 'static value' },
      skippable: true, next: null,
    }

    const events: string[] = []
    runner.on('step:start', (s: WorkflowStep) => events.push('start:' + s.id))
    runner.on('step:done', (s: WorkflowStep) => events.push('done:' + s.id))
    runner.on('run:failed', (e: Error) => events.push('failed:' + e.message))
    runner.on('run:done', () => events.push('done'))

    await runner.run([step1, step2], 'auto')

    // 确认事件序列
    expect(events).toContain('start:load_context')
    expect(events).toContain('start:gen_body')

    // step2 的 prompt 应包含 step1 的输出
    expect(capturedPrompts).toHaveLength(2)
    expect(capturedPrompts[1]).toContain('step output 1') // step1 的输出
    expect(capturedPrompts[1]).toContain('static value')
  })
})

// ── LLM 错误传播 ──

describe('LLM 错误传播', () => {
  it('LLM 抛错时应触发 run:failed', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())
    runner.setLlmCall(async () => { throw new Error('API rate limit') })

    let failedError: Error | null = null
    runner.on('run:failed', (err: Error) => { failedError = err })

    await runner.run([makeStep({ approval: 'auto' })], 'auto')

    expect(failedError).not.toBeNull()
    expect(failedError!.message).toContain('API rate limit')
  })
})

// ── 并发保护 ──

describe('并发 run() 保护', () => {
  it('已在运行时调用 run() 应抛错', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())
    runner.setLlmCall(async () => new Promise(r => setTimeout(() => r('done'), 200)))

    const step = makeStep({ approval: 'auto' })
    const runPromise = runner.run([step], 'auto')
    await expect(runner.run([step], 'auto')).rejects.toThrow('already running')
    await runPromise
  })
})

// ── abort() 方法 ──

describe('abort() 方法', () => {
  it('在 awaiting 状态下调用 abort() 应终止工作流', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())
    runner.setLlmCall(async () => 'output')

    let aborted = false
    runner.on('step:awaiting', () => {
      // abort 会在内部 resolve Promise 为 { type: 'abort' }
      setTimeout(() => runner.abort(), 0)
    })
    runner.on('run:aborted', () => { aborted = true })

    await runner.run([makeStep()], 'approval')

    expect(aborted).toBe(true)
    expect(runner.status).toBe('aborted')
  })

  it('在 running 状态（无 pending）调用 abort() 应设置 flag', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())
    runner.setLlmCall(async () => 'output')

    const step1 = makeStep({ id: 's1', approval: 'auto' })
    const step2 = makeStep({ id: 's2', approval: 'auto' })
    let aborted = false

    runner.on('step:done', (step: WorkflowStep) => {
      if (step.id === 's1') runner.abort()
    })
    runner.on('run:aborted', () => { aborted = true })

    await runner.run([step1, step2], 'auto')
    expect(aborted).toBe(true)
  })
})

// ── step:chunk 流式事件 ──

describe('step:chunk 流式事件', () => {
  it('LLM onChunk 回调应触发 step:chunk 事件', async () => {
    const runner = new WorkflowRunner()
    runner.registerAgent(fakeAgent())
    runner.setLlmCall(async (_s: string, _u: string, onChunk?: (c: string) => void) => {
      onChunk?.('chunk1')
      onChunk?.('chunk2')
      return 'chunk1chunk2'
    })

    const chunks: string[] = []
    runner.on('step:chunk', (c: string) => chunks.push(c))
    await runner.run([makeStep({ approval: 'auto' })], 'auto')

    expect(chunks).toEqual(['chunk1', 'chunk2'])
  })
})

// ── writeBack 事件 ──

describe('writeBack 事件', () => {
  it('writeBack 完成后应触发 step:writeBack 事件', async () => {
    const runner = new WorkflowRunner()
    let writeBackCalled = false
    runner.registerAgent(fakeAgent({
      writeBack: async () => { writeBackCalled = true },
    }))
    runner.setLlmCall(async () => 'output')

    let writeBackEvent = false
    runner.on('step:writeBack', () => { writeBackEvent = true })
    await runner.run([makeStep({ approval: 'auto' })], 'auto')

    expect(writeBackCalled).toBe(true)
    expect(writeBackEvent).toBe(true)
  })
})
