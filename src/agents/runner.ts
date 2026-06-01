/**
 * R1+R2: Workflow Runner — Promise-based 审阅门控
 *
 * 两种模式是同一份代码，靠 mode 字段控制阻塞策略：
 *   auto     — 所有 step 不阻塞
 *   approval — 阻塞所有 approval !== 'auto' 的 step
 */
import type {
  AgentSpec, WorkflowStep, WorkflowStatus,
  Decision, ApprovalLevel, ApprovalCardData,
  ConsistencyIssue, RunnerEvents, DecisionType,
} from './types'
import { resolveVariable, UnknownVariable, expandPrompt } from '../composables/useContextResolver'
import type { ResolverCtx } from '../composables/useContextResolver'

/** 判断错误是否可重试（网络超时、LLM 服务端错误等） */
function isRetryableError(e: Error): boolean {
  const msg = e.message.toLowerCase()
  return msg.includes('timeout') || msg.includes('500') || msg.includes('502') ||
    msg.includes('503') || msg.includes('529') || msg.includes('rate limit') ||
    msg.includes('network') || msg.includes('econnreset')
}

/** 指数退避等待 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type WorkMode = 'auto' | 'approval'

class EventBus {
  private handlers = new Map<string, Array<(...args: any[]) => void>>()
  on(event: string, fn: (...args: any[]) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, [])
    this.handlers.get(event)!.push(fn)
  }
  emit(event: string, ...args: any[]) {
    this.handlers.get(event)?.forEach(fn => fn(...args))
  }
  offAll() { this.handlers.clear() }
}

/** 判断当前 mode × approval level 是否应阻塞 */
export function shouldBlock(mode: WorkMode, level: ApprovalLevel, hasWarnings: boolean, hasErrors: boolean): boolean {
  if (mode === 'auto') return false
  // approval 模式
  if (level === 'auto') return false
  if (level === 'always') return true
  if (level === 'on_warning') return hasWarnings || hasErrors
  if (level === 'on_error') return hasErrors
  return false
}

export class WorkflowRunner {
  private agents = new Map<string, AgentSpec>()
  private bus = new EventBus()
  private _status: WorkflowStatus = 'idle'
  private _currentStepIdx = -1
  private _ctx: Record<string, unknown> = {}
  private _history: Array<{ stepId: string; output: string; timestamp?: number }> = []
  private _abortFlag = false
  private _steps: WorkflowStep[] = []
  private _attemptCounts = new Map<string, number>()
  private _maxAttempts = 5

  // Promise-based 审阅门控
  private _pendingResolve: ((decision: Decision) => void) | null = null
  private _activeRequestId = ''

  get status() { return this._status }
  get currentStepIndex() { return this._currentStepIdx }
  get ctx() {
    const c = { ...this._ctx }
    if (Array.isArray(c._pendingWrites)) c._pendingWrites = [...c._pendingWrites]
    return c
  }
  get history() { return [...this._history] }

  registerAgent(agent: AgentSpec) { this.agents.set(agent.id, agent) }
  registerAgents(agents: AgentSpec[]) { agents.forEach(a => this.registerAgent(a)) }
  setContext(ctx: Record<string, unknown>) { Object.assign(this._ctx, ctx) }

  on<K extends keyof RunnerEvents>(event: K, fn: RunnerEvents[K]) {
    this.bus.on(event, fn as any)
  }

  // ── LLM 调用注入 ──

  private _llmCall: ((systemPrompt: string, userPrompt: string, onChunk?: (text: string) => void) => Promise<string>) | null = null
  setLlmCall(fn: (systemPrompt: string, userPrompt: string, onChunk?: (text: string) => void) => Promise<string>) { this._llmCall = fn }

  // ── 上下文解析器注入 ──

  private _resolverCtx: ResolverCtx | null = null
  setResolverCtx(ctx: ResolverCtx) { this._resolverCtx = ctx }

  // ── 运行（步骤图路由）──

  async run(steps: WorkflowStep[], mode: WorkMode = 'auto'): Promise<void> {
    if (this._status === 'running') {
      throw new Error('Runner is already running')
    }
    this._steps = steps
    this._status = 'running'
    this._abortFlag = false
    this._attemptCounts.clear()

    // 构建步骤 Map，支持 id 索引
    const stepMap = new Map<string, WorkflowStep>()
    for (const step of steps) {
      stepMap.set(step.id, step)
    }

    let currentStepId = steps[0]?.id
    if (!currentStepId) {
      this._status = 'done'
      this.bus.emit('run:done')
      return
    }

    while (currentStepId) {
      const step = stepMap.get(currentStepId)
      if (!step) {
        this.bus.emit('run:failed', new Error(`步骤 ${currentStepId} 不存在`))
        return
      }

      this._currentStepIdx = steps.indexOf(step)

      if (this._abortFlag) {
        this._status = 'aborted'
        this.bus.emit('run:aborted')
        return
      }

      const agent = this.agents.get(step.agentId)
      if (!agent) {
        this.bus.emit('run:failed', new Error(`未知 Agent: ${step.agentId}`))
        return
      }

      this.bus.emit('step:start', step)

      try {
        // 带重试的步骤执行
        const output = await this.executeStepWithRetry(agent, step)

        this._history.push({ stepId: step.id, output, timestamp: Date.now() })
        this._ctx[`step:${step.id}`] = output
        this._ctx.lastOutput = output

        this.bus.emit('step:done', step, output)

        // 检查是否应阻塞
        const parsed = agent.parseOutput(output)
        const warnings = (parsed.warnings || []) as ConsistencyIssue[]
        const errors = warnings.filter(w => w.level === 'ERROR')

        if (shouldBlock(mode, step.approval, warnings.length > 0, errors.length > 0)) {
          const card = this.buildApprovalCard(step, agent, parsed, warnings, step.id)
          this._status = 'awaiting_approval'
          this.bus.emit('step:awaiting', card)

          this.saveAwaitingState(step.id, output)

          // Promise 门控：等待用户决策
          const decision = await new Promise<Decision>(resolve => {
            this._pendingResolve = resolve
          })

          this.bus.emit('step:decided', step.id, decision)

          const result = await this.handleDecisionLoop(decision, step, agent, mode)
          if (result === 'abort') {
            this._status = 'aborted'
            this.bus.emit('run:aborted')
            return
          }
          if (result === 'skip') {
            this.bus.emit('step:skipped', step.id)
            // 条件路由或默认 next
            currentStepId = this.resolveNext(step, output)
            continue
          }
          // approve: 继续
          await this.doWriteBack(agent, parsed, step)
        } else {
          // 非阻塞步骤：step:done 后立即 writeBack
          await this.doWriteBack(agent, parsed, step)
        }

        // 条件路由或默认 next
        currentStepId = this.resolveNext(step, output)

      } catch (e: any) {
        this.bus.emit('run:failed', e)
        return
      }
    }

    this._status = 'done'
    this.bus.emit('run:done')
  }

  /** 条件路由：优先使用 step.condition，否则走 step.next */
  private resolveNext(step: WorkflowStep, output: string): string | null {
    if (step.condition) {
      const nextId = step.condition(output)
      if (nextId) return nextId
    }
    return step.next
  }

  /** 带重试的步骤执行 */
  private async executeStepWithRetry(agent: AgentSpec, step: WorkflowStep): Promise<string> {
    const maxRetries = step.retryable === false ? 1 : (step.maxRetries || 3)

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.executeStep(agent, step)
      } catch (e: any) {
        if (isRetryableError(e) && attempt < maxRetries - 1) {
          const delay = 1000 * Math.pow(2, attempt) // 指数退避：1s, 2s, 4s
          console.warn(`[runner] 步骤 ${step.id} 第 ${attempt + 1} 次失败，${delay}ms 后重试: ${e.message}`)
          this.bus.emit('step:retried', step.id, attempt + 1)
          await sleep(delay)
          continue
        }
        throw e
      }
    }
    throw new Error(`步骤 ${step.id} 执行失败，已重试 ${maxRetries} 次`)
  }

  /** 统一的 redo 决策循环处理（合并 run() 和 resumeFromRestore() 的 redo 逻辑） */
  private async handleDecisionLoop(
    initialDecision: Decision,
    step: WorkflowStep,
    agent: AgentSpec,
    mode: WorkMode,
  ): Promise<'approve' | 'skip' | 'abort'> {
    let decision = initialDecision

    while (true) {
      const result = this.applyDecision(decision, step, this._currentStepIdx)

      if (result === 'abort') return 'abort'
      if (result === 'skip') return 'skip'
      if (result === 'approve') return 'approve'

      // redo: 重新执行步骤
      this.bus.emit('step:start', step)
      try {
        const reOutput = await this.executeStepWithRetry(agent, step)
        this._history.push({ stepId: step.id, output: reOutput, timestamp: Date.now() })
        this._ctx[`step:${step.id}`] = reOutput
        this._ctx.lastOutput = reOutput
        this.bus.emit('step:done', step, reOutput)

        const reParsed = agent.parseOutput(reOutput)
        const reWarnings = (reParsed.warnings || []) as ConsistencyIssue[]
        const card = this.buildApprovalCard(step, agent, reParsed, reWarnings, step.id)
        this._status = 'awaiting_approval'
        this.bus.emit('step:awaiting', card)
        this.saveAwaitingState(step.id, reOutput)

        decision = await new Promise<Decision>(resolve => { this._pendingResolve = resolve })
        this.bus.emit('step:decided', step.id, decision)
        // 继续循环，处理新的决策
      } catch (e: any) {
        this._status = 'aborted'
        this.bus.emit('run:failed', e)
        return 'abort'
      }
    }
  }

  // ── 用户决策入口 ──

  decide(decision: Decision): void {
    if (this._status !== 'awaiting_approval') {
      throw new Error('当前不在审阅状态，无法决策')
    }
    if (!this._pendingResolve) {
      throw new Error('该 step 已决策（幂等保护）')
    }
    const resolve = this._pendingResolve
    this._pendingResolve = null // 幂等：第二次调用会抛错
    resolve(decision)
  }

  abort() {
    this._abortFlag = true
    delete this._ctx.injectedFeedback
    if (this._pendingResolve) {
      this._pendingResolve({ type: 'abort' })
      this._pendingResolve = null
      // 不在此处 emit 'run:aborted'，由决策处理器统一发出（避免重复触发）
    } else {
      // 无待审决策时直接标记终止
      this._status = 'aborted'
      this.bus.emit('run:aborted')
    }
  }

  /** 覆盖最大重做次数 */
  setMaxAttempts(n: number) { this._maxAttempts = n }

  // ── 内部 ──

  private async executeStep(agent: AgentSpec, step: WorkflowStep): Promise<string> {
    // 本地执行路径：agent 声明了 localExecute，不调 LLM
    if (agent.localExecute) {
      return agent.localExecute(step.inputs, { ...this._ctx })
    }

    if (!this._llmCall) throw new Error('LLM 调用函数未注入')

    // 构建 system prompt（含上下文变量解析）
    let systemPrompt = agent.systemPrompt
    if (this._resolverCtx && agent.requiredContext?.length) {
      const resolvedParts: string[] = []
      for (const varKey of agent.requiredContext) {
        try {
          const resolved = resolveVariable(varKey, this._resolverCtx)
          if (resolved && !resolved.startsWith('(') && !resolved.startsWith('[')) {
            resolvedParts.push(`## ${varKey}\n${resolved}`)
          }
        } catch (e) {
          if (!(e instanceof UnknownVariable)) throw e
          // 未注册的变量静默跳过
        }
      }
      if (resolvedParts.length > 0) {
        systemPrompt += '\n\n## 上下文参考数据\n以下是从作品中自动提取的参考信息：\n\n' + resolvedParts.join('\n\n')
      }
      // 内联替换 prompt 中的 @变量 占位符（如 @目标字数 → 1000000）
      try {
        systemPrompt = expandPrompt(systemPrompt, this._resolverCtx)
      } catch { /* expandPrompt 对未知变量已做容错，此处兜底 */ }
    }

    const parts: string[] = []
    for (const [key, ref] of Object.entries(step.inputs)) {
      if (ref.startsWith('@ctx.')) {
        const resolved = this._ctx[ref.slice(5)]
        if (resolved === undefined || resolved === null) {
          console.warn(`[runner] 步骤 ${step.id} 输入 "${key}" 引用未解析: ${ref}，已跳过`)
          continue
        }
        parts.push(`${key}: ${JSON.stringify(resolved)}`)
      } else {
        parts.push(`${key}: ${ref}`)
      }
    }
    let userPrompt = parts.join('\n') || '请开始创作。'

    // 检查是否有 edit_redo 注入的反馈，追加到 prompt 末尾
    if (this._ctx.injectedFeedback) {
      userPrompt += `\n\n【用户修改反馈】\n${this._ctx.injectedFeedback}`
      delete this._ctx.injectedFeedback
    }

    return this._llmCall(systemPrompt, userPrompt, (chunk: string) => {
      this.bus.emit('step:chunk', chunk)
    })
  }

  private buildApprovalCard(
    step: WorkflowStep, agent: AgentSpec,
    parsed: Record<string, unknown>,
    warnings: ConsistencyIssue[],
    requestId: string,
  ): ApprovalCardData {
    const attempt = this._attemptCounts.get(step.id) || 1
    const options: DecisionType[] = ['approve', 'edit_approve', 'redo', 'edit_redo']
    if (step.skippable !== false) options.push('skip')
    options.push('abort')

    return {
      stepId: step.id,
      agentId: agent.id,
      agentName: agent.name,
      output: parsed,
      attempts: this._history
        .filter(h => h.stepId === step.id)
        .map(h => ({ output: h.output, timestamp: h.timestamp || Date.now() })),
      warnings: warnings.length > 0 ? warnings : undefined,
      options,
      status: 'pending',
      attemptCount: attempt,
      maxAttempts: this._maxAttempts,
    }
  }

  private applyDecision(decision: Decision, step: WorkflowStep, idx: number): 'approve' | 'redo' | 'skip' | 'abort' {
    switch (decision.type) {
      case 'approve':
        return 'approve'

      case 'edit_approve': {
        const editedContent = decision.editedContent || ''
        const prev = [...this._history].reverse().find(h => h.stepId === step.id)
        if (prev) {
          prev.output = editedContent
          this._ctx[`step:${step.id}`] = editedContent
        }
        const diffSummary = decision.diffSummary || `用户编辑了 ${editedContent.length} 字`
        this.bus.emit('step:edited', step.id, diffSummary)
        return 'approve'
      }

      case 'redo': {
        const attempt = (this._attemptCounts.get(step.id) || 0) + 1
        if (attempt > this._maxAttempts) {
          this.bus.emit('run:failed', new Error(`步骤 ${step.id} 重做次数已达上限 (${this._maxAttempts})`))
          return 'abort'
        }
        this._attemptCounts.set(step.id, attempt)
        this.bus.emit('step:retried', step.id, attempt)
        return 'redo'
      }

      case 'edit_redo': {
        // 追加反馈到上下文
        if (decision.feedback) {
          this._ctx.injectedFeedback = decision.feedback
        }
        return this.applyDecision({ ...decision, type: 'redo' } as Decision, step, idx)
      }

      case 'skip': {
        if (step.skippable === false) {
          this.bus.emit('run:failed', new Error(`步骤 ${step.id} 不允许跳过`))
          return 'abort'
        }
        return 'skip'
      }

      case 'abort':
        return 'abort'

      default:
        return 'approve'
    }
  }

  // ── F2: writeBack 策略 ──
  // 中间 step 的 agent.writeBack 默认空操作（只产内存数据）
  // commit_write step 的 writeBack 是唯一落盘点，在 approve 决策后调用

  private async doWriteBack(agent: AgentSpec, parsed: Record<string, unknown>, step: WorkflowStep) {
    this._ctx._pendingWrites = (this._ctx._pendingWrites || []) as any[]
    ;(this._ctx._pendingWrites as any[]).push({
      stepId: step.id, agentId: agent.id,
      inputs: { ...step.inputs },
      data: parsed, timestamp: Date.now(),
    })
    try {
      await agent.writeBack(parsed, { ...this._ctx })
      this.bus.emit('step:writeBack', step.id, parsed)
    } catch (e: any) {
      this.bus.emit('run:failed', new Error(`writeBack 失败 (${step.id}): ${e.message}`))
      throw e  // G2: 重新抛出，让外层 run() 的 try/catch 接住停止循环
    }
  }

  // ── R3: 持久化钩子（外部注入）──

  private _saveAwaitingState: ((stepId: string, output: string) => void) | null = null

  setSaveAwaitingHook(fn: (stepId: string, output: string) => void) {
    this._saveAwaitingState = fn
  }

  private saveAwaitingState(stepId: string, output: string) {
    if (this._saveAwaitingState) {
      this._saveAwaitingState(stepId, output)
    }
  }

  // ── R11: 序列化 & 恢复 ──

  serialize(): RunnerSnapshot {
    return {
      status: this._status,
      currentStepIdx: this._currentStepIdx,
      ctx: JSON.parse(JSON.stringify(this._ctx)),
      history: [...this._history],
      steps: this._steps.map(s => ({ ...s })),
      attemptCounts: Object.fromEntries(this._attemptCounts),
      maxAttempts: this._maxAttempts,
      agentIds: Array.from(this.agents.keys()),
    }
  }

  restore(snapshot: RunnerSnapshot): void {
    this._status = snapshot.status
    this._currentStepIdx = snapshot.currentStepIdx
    this._ctx = snapshot.ctx
    this._history = snapshot.history
    this._steps = snapshot.steps
    this._attemptCounts = new Map(Object.entries(snapshot.attemptCounts))
    this._maxAttempts = snapshot.maxAttempts
    this._abortFlag = false
    this._pendingResolve = null
    // R13 fix: restore 需要重建 agents Map（serialize 只保存了 agentIds）
    // 调用方在 restore() 后需要重新 registerAgents()
  }

  /** 恢复后继续运行：从 _currentStepIdx 处重入审批门控 */
  async resumeFromRestore(mode: WorkMode = 'approval'): Promise<void> {
    if (this._status !== 'awaiting_approval') {
      throw new Error('R11: 只有 awaiting_approval 状态可从快照恢复')
    }
    const step = this._steps[this._currentStepIdx]
    if (!step) {
      this._status = 'done'
      this.bus.emit('run:done')
      return
    }

    const agent = this.agents.get(step.agentId)
    if (!agent) {
      this._status = 'aborted'
      this.bus.emit('run:failed', new Error(`未知 Agent: ${step.agentId}`))
      return
    }

    // Re-emit 审阅卡
    const lastEntry = this._history.length > 0 ? this._history[this._history.length - 1] : undefined
    let lastOutput = lastEntry?.output || ''
    let parsed = agent.parseOutput(lastOutput)
    const warnings = (parsed.warnings || []) as any[]
    const errors = warnings.filter((w: any) => w.level === 'ERROR')
    const card = this.buildApprovalCard(step, agent, parsed, warnings, step.id)

    this._status = 'awaiting_approval'
    this.bus.emit('step:awaiting', card)

    // Promise 门控
    const decision = await new Promise<Decision>(resolve => { this._pendingResolve = resolve })
    this.bus.emit('step:decided', step.id, decision)

    const result = this.applyDecision(decision, step, this._currentStepIdx)
    if (result === 'abort') { this._status = 'aborted'; this.bus.emit('run:aborted'); return }
    if (result === 'skip') {
      this.bus.emit('step:skipped', step.id)
      // G7: skip 后继续执行剩余步骤（与 run() 循环中 continue 行为一致）
      const remainingAfterSkip = this._steps.slice(this._currentStepIdx + 1)
      if (remainingAfterSkip.length === 0) {
        this._status = 'done'
        this.bus.emit('run:done')
        return
      }
      await this.run(remainingAfterSkip, mode)
      return
    }
    if (result === 'redo') {
      // G10: while 循环处理连续 redo（代替之前只处理一次再 redo 就 return 的 bug）
      let keepRedoing = true
      while (keepRedoing) {
        this.bus.emit('step:start', step)
        try {
          const reOutput = await this.executeStep(agent, step)
          this._history.push({ stepId: step.id, output: reOutput, timestamp: Date.now() })
          this._ctx[`step:${step.id}`] = reOutput
          this._ctx.lastOutput = reOutput
          this.bus.emit('step:done', step, reOutput)

          const reParsed = agent.parseOutput(reOutput)
          const reWarnings = (reParsed.warnings || []) as ConsistencyIssue[]
          const reErrors = reWarnings.filter(w => w.level === 'ERROR')
          const card = this.buildApprovalCard(step, agent, reParsed, reWarnings, step.id)
          this._status = 'awaiting_approval'
          this.bus.emit('step:awaiting', card)
          this.saveAwaitingState(step.id, reOutput)

          const decisionN = await new Promise<Decision>(resolve => { this._pendingResolve = resolve })
          this.bus.emit('step:decided', step.id, decisionN)
          const resultN = this.applyDecision(decisionN, step, this._currentStepIdx)
          if (resultN === 'abort') { this._status = 'aborted'; this.bus.emit('run:aborted'); return }
          if (resultN === 'skip') { this.bus.emit('step:skipped', step.id); keepRedoing = false; break }
          if (resultN === 'redo') { continue } // G10: 循环回去再执行
          // approve / edit_approve: 使用重新执行的结果
          keepRedoing = false
          parsed = reParsed
          lastOutput = reOutput
        } catch (e: any) {
          this._status = 'aborted'
          this.bus.emit('run:failed', e)
          return
        }
      }
    }

    await this.doWriteBack(agent, parsed, step)

    // 继续跑剩余步骤
    const remaining = this._steps.slice(this._currentStepIdx + 1)
    if (remaining.length === 0) {
      this._status = 'done'
      this.bus.emit('run:done')
      return
    }
    await this.run(remaining, mode)
  }
}

// ── R11: 快照类型 ──

export interface RunnerSnapshot {
  status: WorkflowStatus
  currentStepIdx: number
  ctx: Record<string, unknown>
  history: Array<{ stepId: string; output: string }>
  steps: WorkflowStep[]
  attemptCounts: Record<string, number>
  maxAttempts: number
  agentIds: string[]
}
