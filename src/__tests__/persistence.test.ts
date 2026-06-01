/**
 * 持久化层测试 — WorkflowRun CRUD + Decision 记录 + 7天自动归档
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createRun, updateRun, getRun, listRuns, abandonRun,
  findAwaitingRuns, recoverIncompleteRuns,
  recordDecision, getDecisions, generateRunId,
  type WorkflowRunRecord, type WorkflowDecisionRecord,
} from '../agents/persistence'

function makeRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: generateRunId(),
    status: 'running',
    mode: 'approval',
    workflowName: '续写3章',
    totalSteps: 19,
    currentStep: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Run CRUD', () => {
  beforeEach(() => { localStorage.clear() })

  it('createRun 应写入 localStorage', () => {
    const run = makeRun()
    createRun(run)
    expect(getRun(run.id)).toEqual(expect.objectContaining({ id: run.id, status: 'running' }))
  })

  it('updateRun 应更新指定字段', () => {
    const run = makeRun({ updatedAt: '2026-01-01T00:00:00Z' })
    createRun(run)
    updateRun(run.id, { status: 'awaiting_approval', awaitingStep: 'gen_body_1' })
    const updated = getRun(run.id)!
    expect(updated.status).toBe('awaiting_approval')
    expect(updated.awaitingStep).toBe('gen_body_1')
    expect(updated.updatedAt).not.toBe('2026-01-01T00:00:00Z')
  })

  it('updateRun 不存在的 ID 应静默跳过', () => {
    expect(() => updateRun('nonexistent', { status: 'done' })).not.toThrow()
  })

  it('getRun 不存在的 ID 应返回 null', () => {
    expect(getRun('nonexistent')).toBeNull()
  })

  it('listRuns 应按 createdAt 降序排列', () => {
    const run1 = makeRun({ createdAt: '2026-01-01T00:00:00Z' })
    const run2 = makeRun({ createdAt: '2026-06-01T00:00:00Z' })
    createRun(run1)
    createRun(run2)
    const list = listRuns()
    expect(list[0].id).toBe(run2.id)
    expect(list[1].id).toBe(run1.id)
  })

  it('abandonRun 应将状态改为 aborted', () => {
    const run = makeRun({ status: 'awaiting_approval' })
    createRun(run)
    abandonRun(run.id)
    expect(getRun(run.id)!.status).toBe('aborted')
  })
})

describe('findAwaitingRuns', () => {
  beforeEach(() => { localStorage.clear() })

  it('应只返回 awaiting_approval 状态的 run', () => {
    createRun(makeRun({ status: 'running' }))
    createRun(makeRun({ status: 'awaiting_approval', awaitingStep: 'gen_body_1' }))
    createRun(makeRun({ status: 'done' }))
    const awaiting = findAwaitingRuns()
    expect(awaiting).toHaveLength(1)
    expect(awaiting[0].status).toBe('awaiting_approval')
  })

  it('超过 7 天的 awaiting run 应自动归档为 aborted', () => {
    const oldRun = makeRun({
      status: 'awaiting_approval',
      awaitingSince: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 天前
    })
    createRun(oldRun)
    const awaiting = findAwaitingRuns()
    expect(awaiting).toHaveLength(0)
    expect(getRun(oldRun.id)!.status).toBe('aborted')
  })

  it('未超期的 awaiting run 应正常返回', () => {
    const recentRun = makeRun({
      status: 'awaiting_approval',
      awaitingSince: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1 天前
    })
    createRun(recentRun)
    const awaiting = findAwaitingRuns()
    expect(awaiting).toHaveLength(1)
  })
})

describe('recoverIncompleteRuns', () => {
  beforeEach(() => { localStorage.clear() })

  it('应返回 awaiting 和 running 状态的 run', () => {
    createRun(makeRun({ status: 'awaiting_approval', awaitingStep: 'gen_body_1' }))
    createRun(makeRun({ status: 'running' }))
    createRun(makeRun({ status: 'done' }))
    createRun(makeRun({ status: 'aborted' }))

    const recoverable = recoverIncompleteRuns()
    expect(recoverable).toHaveLength(2)
    expect(recoverable.every(r => r.status === 'awaiting_approval' || r.status === 'running')).toBe(true)
  })

  it('应按 id 去重', () => {
    const run = makeRun({ status: 'running' })
    // 同一个 run 被写入两次（不应发生，但测试健壮性）
    createRun(run)
    createRun(run)
    const recoverable = recoverIncompleteRuns()
    expect(recoverable.filter(r => r.id === run.id)).toHaveLength(1)
  })
})

describe('Decision 记录', () => {
  beforeEach(() => { localStorage.clear() })

  it('recordDecision + getDecisions 应按 decidedAt 排序', () => {
    const d1: WorkflowDecisionRecord = {
      runId: 'run_1', stepId: 'gen_body_1', attempt: 1,
      decision: 'approve', decidedAt: 1000,
    }
    const d2: WorkflowDecisionRecord = {
      runId: 'run_1', stepId: 'gen_body_2', attempt: 1,
      decision: 'redo', userFeedback: '太短了', decidedAt: 2000,
    }
    const d3: WorkflowDecisionRecord = {
      runId: 'run_2', stepId: 'gen_body_1', attempt: 1,
      decision: 'approve', decidedAt: 1500,
    }
    recordDecision(d1)
    recordDecision(d2)
    recordDecision(d3)

    const run1Decisions = getDecisions('run_1')
    expect(run1Decisions).toHaveLength(2)
    expect(run1Decisions[0].decidedAt).toBe(1000)
    expect(run1Decisions[1].decidedAt).toBe(2000)
    expect(run1Decisions[1].userFeedback).toBe('太短了')

    expect(getDecisions('run_2')).toHaveLength(1)
    expect(getDecisions('nonexistent')).toHaveLength(0)
  })

  it('generateRunId 应生成唯一 ID', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRunId()))
    expect(ids.size).toBe(100)
    expect([...ids][0]).toMatch(/^run_/)
  })
})

describe('多 run 并存', () => {
  beforeEach(() => { localStorage.clear() })

  it('多个 run 并存时 CRUD 互不干扰', () => {
    const run1 = makeRun({ status: 'running', workflowName: '续写3章' })
    const run2 = makeRun({ status: 'awaiting_approval', workflowName: '短篇生成' })
    createRun(run1)
    createRun(run2)

    updateRun(run1.id, { status: 'done' })
    expect(getRun(run1.id)!.status).toBe('done')
    expect(getRun(run2.id)!.status).toBe('awaiting_approval') // 不受影响

    abandonRun(run2.id)
    expect(getRun(run2.id)!.status).toBe('aborted')
    expect(getRun(run1.id)!.status).toBe('done') // 不受影响
  })
})
