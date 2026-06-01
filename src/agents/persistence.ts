/**
 * R3: 任务持久化 — 审阅状态扩展
 *
 * 当前实现：localStorage（TS 端）
 * TODO: Tauri 环境下使用 SQLite（src-tauri/migrations/）
 *
 * 表结构：
 *   workflow_runs (id, status, mode, workflowName, totalSteps, currentStep,
 *                  awaitingStep, awaitingOutput, awaitingSince, created_at, updated_at)
 *   workflow_decisions (run_id, step_id, attempt, decision, user_feedback,
 *                        edited_content, diff_summary, decided_at)
 */

export interface WorkflowRunRecord {
  id: string
  status: 'idle' | 'running' | 'awaiting_approval' | 'aborted' | 'done'
  mode: 'auto' | 'approval'
  workflowName: string
  totalSteps: number
  currentStep: number
  awaitingStep?: string
  awaitingOutput?: string
  awaitingSince?: number
  /** R11: Runner 完整快照 JSON，用于跨重启恢复 */
  runnerSnapshot?: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowDecisionRecord {
  runId: string
  stepId: string
  attempt: number
  decision: string
  userFeedback?: string
  editedContent?: string
  diffSummary?: string
  decidedAt: number
}

const LS_RUNS = 'ns:workflow_runs'
const LS_DECISIONS = 'ns:workflow_decisions'

function load<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback } catch { return fallback }
}
function save(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch (e) { console.warn('[persistence] save failed:', e) }
}

// ── Run CRUD ──

export function createRun(run: WorkflowRunRecord): void {
  const runs = load<WorkflowRunRecord[]>(LS_RUNS, [])
  runs.push(run)
  save(LS_RUNS, runs)
}

export function updateRun(id: string, patch: Partial<WorkflowRunRecord>): void {
  const runs = load<WorkflowRunRecord[]>(LS_RUNS, [])
  const idx = runs.findIndex(r => r.id === id)
  if (idx >= 0) {
    runs[idx] = { ...runs[idx], ...patch, updatedAt: new Date().toISOString() }
    save(LS_RUNS, runs)
  }
}

export function getRun(id: string): WorkflowRunRecord | null {
  return load<WorkflowRunRecord[]>(LS_RUNS, []).find(r => r.id === id) || null
}

const MAX_AWAITING_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

/** 查找所有待审任务（超过 7 天自动归档为 abandoned） */
export function findAwaitingRuns(): WorkflowRunRecord[] {
  const runs = load<WorkflowRunRecord[]>(LS_RUNS, [])
  const now = Date.now()
  const active: WorkflowRunRecord[] = []
  for (const r of runs) {
    if (r.status !== 'awaiting_approval') continue
    if (r.awaitingSince && now - r.awaitingSince > MAX_AWAITING_AGE_MS) {
      // G9: 超期自动归档
      updateRun(r.id, { status: 'aborted' })
      continue
    }
    active.push(r)
  }
  return active
}

/** 手动丢弃待审任务 */
export function abandonRun(id: string) {
  updateRun(id, { status: 'aborted' })
}

export function listRuns(): WorkflowRunRecord[] {
  return load<WorkflowRunRecord[]>(LS_RUNS, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ── Decision CRUD ──

export function recordDecision(d: WorkflowDecisionRecord): void {
  const decisions = load<WorkflowDecisionRecord[]>(LS_DECISIONS, [])
  decisions.push(d)
  save(LS_DECISIONS, decisions)
}

export function getDecisions(runId: string): WorkflowDecisionRecord[] {
  return load<WorkflowDecisionRecord[]>(LS_DECISIONS, [])
    .filter(d => d.runId === runId)
    .sort((a, b) => a.decidedAt - b.decidedAt)
}

export function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 启动时恢复未完成任务（按 id 去重） */
export function recoverIncompleteRuns(): WorkflowRunRecord[] {
  const seen = new Set<string>()
  const result: WorkflowRunRecord[] = []
  for (const r of [...findAwaitingRuns(), ...load<WorkflowRunRecord[]>(LS_RUNS, []).filter(r => r.status === 'running')]) {
    if (!seen.has(r.id)) { seen.add(r.id); result.push(r) }
  }
  return result
}
