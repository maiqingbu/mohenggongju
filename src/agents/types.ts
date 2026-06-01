/**
 * Agent 类型定义 — 审阅模式扩展
 */

// ── Agent Spec ──

export interface AgentSpec {
  id: string
  name: string
  badge: string
  desc: string
  systemPrompt: string
  requiredContext: string[]
  parseOutput: (rawText: string) => Record<string, unknown>
  /** 写回数据层。ctx 为 Runner 上下文（含 _pendingWrites） */
  writeBack: (parsed: Record<string, unknown>, ctx?: Record<string, unknown>) => Promise<void>
  /** 本地执行（不调 LLM）。如果定义了此函数，Runner 优先走此路径 */
  localExecute?: (inputs: Record<string, string>, ctx: Record<string, unknown>) => Promise<string>
}

// ── Workflow Step ──

/** 审批级别：auto=不阻塞 / on_warning=有警告才阻塞 / on_error=有ERROR才阻塞 / always=必阻塞 */
export type ApprovalLevel = 'auto' | 'on_warning' | 'on_error' | 'always'

export interface WorkflowStep {
  id: string
  agentId: string
  inputs: Record<string, string>
  approval: ApprovalLevel
  /** 是否允许跳过此步骤（commit_write 等不应跳过） */
  skippable: boolean
  /** 下一步 id（null = 工作流结束） */
  next: string | null
  /** 条件路由：根据步骤输出决定下一步 id。返回 null 表示走默认 next */
  condition?: (output: string) => string | null
  /** 是否可重试（默认 true）。LLM 调用失败时自动重试 */
  retryable?: boolean
  /** 最大重试次数（默认 3） */
  maxRetries?: number
}

// ── Runner 状态 ──

export type WorkflowStatus = 'idle' | 'running' | 'awaiting_approval' | 'aborted' | 'done'

// ── 用户决策 ──

export type DecisionType = 'approve' | 'edit_approve' | 'redo' | 'edit_redo' | 'skip' | 'abort'

export interface Decision {
  type: DecisionType
  /** 编辑后通过时修改过的文本 */
  editedContent?: string
  /** 改后重做时的追加提示 */
  feedback?: string
  /** 编辑 diff 摘要（字数变化） */
  diffSummary?: string
}

// ── 审阅卡数据 ──

export interface ConsistencyIssue {
  level: 'WARNING' | 'ERROR'
  type: string
  message: string
  chapter: number
}

export interface ApprovalCardData {
  stepId: string
  agentId: string
  agentName: string
  output: Record<string, unknown>
  /** 重做历史（从旧到新，最后一次是当前） */
  attempts: Array<{ output: string; timestamp: number }>
  /** 一致性警告 */
  warnings?: ConsistencyIssue[]
  /** 可用动作 */
  options: DecisionType[]
  /** 卡状态 */
  status: 'pending' | 'streaming' | 'decided' | 'superseded'
  /** 用户最终决策 */
  decision?: Decision
  /** 重做次数 */
  attemptCount: number
  /** 最大重做次数 */
  maxAttempts: number
  /** 审批卡片标题（用于生命周期工作流） */
  title?: string
  /** 审批卡片描述（用于生命周期工作流） */
  description?: string
  /** 动作类型（用于生命周期工作流） */
  action?: string
  /** 目标卷号（用于卷纲生成） */
  targetVolume?: number
  /** 目标章号（用于章纲生成） */
  targetChapter?: number
  /** 缺失项列表（用于检测类步骤） */
  missingItems?: MissingItem[]
}

// ── 缺失项 ──

export interface MissingItem {
  type: 'setting' | 'info' | 'outline'
  field: string
  label: string
  /** 是否可由 AI 自动生成 */
  autoGeneratable?: boolean
}

// ── Chat 消息扩展 ──

export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'approval'

export interface ChatMessage {
  role: ChatMessageRole
  content: string
  /** system 消息的级别 */
  level?: 'info' | 'warn' | 'error'
  /** approval 卡数据 */
  approvalCard?: ApprovalCardData
  /** 思考链（Claude/DeepSeek-R1 等模型的推理过程） */
  reasoning?: string
}

// ── Runner 事件 ──

export interface RunnerEvents {
  'step:start': (step: WorkflowStep) => void
  'step:chunk': (text: string) => void
  'step:done': (step: WorkflowStep, output: string) => void
  'step:awaiting': (card: ApprovalCardData) => void
  'step:decided': (stepId: string, decision: Decision) => void
  'step:skipped': (stepId: string) => void
  'step:retried': (stepId: string, attempt: number) => void
  'step:edited': (stepId: string, diffSummary: string) => void
  'step:writeBack': (stepId: string, data: Record<string, unknown>) => void
  'run:done': () => void
  'run:aborted': () => void
  'run:failed': (err: Error) => void
}
