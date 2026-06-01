/**
 * 短篇创作工作流组合函数
 *
 * 封装 WorkflowRunner 创建、Agent 注册、Work/Volume/Chapter 创建、
 * 以及工作流执行全流程。
 */
import { WorkflowRunner } from '../agents/runner'
import { createShortStoryGenAgent } from '../agents/steps/shortStoryGen'
import { createParagraphFixAgent } from '../agents/steps/paragraphFix'
import { createStyleReviewAgent } from '../agents/steps/styleReview'
import { createCommitWriteAgent } from '../agents/steps/commitWrite'
import { buildShortStoryWorkflow } from '../agents/workflows/shortStory'
import { WorkspaceSettings } from './useWorkspaceSettings'
import type { TagSet } from './usePlatformTags'
import type { Decision, ApprovalCardData } from '../agents/types'

export interface ShortStoryCallbacks {
  onStepStart?: (stepId: string) => void
  onChunk?: (text: string) => void
  onStepDone?: (stepId: string, output: string) => void
  onApprovalNeeded?: (card: ApprovalCardData) => void
  onDone?: () => void
  onError?: (err: Error) => void
}

export interface ShortStoryResult {
  runner: WorkflowRunner
  workId: number
  chapterId: number
  waitForDecision: (decision: Decision) => void
  abort: () => void
}

export function createShortStoryRunner(): WorkflowRunner {
  const runner = new WorkflowRunner()
  runner.registerAgents([
    createShortStoryGenAgent(),
    createParagraphFixAgent(),
    createStyleReviewAgent(),
    createCommitWriteAgent(),
  ])
  return runner
}

export async function prepareShortStoryWork(
  title: string,
  platformId: string,
  tagSet: TagSet,
): Promise<{ workId: number; volumeId: number; chapterId: number }> {
  const { useWorkRepo } = await import('./useWorkRepo')
  const repo = useWorkRepo()

  const work = await repo.addWork(title)
  if (!work) throw new Error('创建作品失败')
  const workId = typeof work === 'number' ? work : (work as any).id
  repo.currentWorkId.value = workId

  const volumeId = await repo.addVolume(workId, '默认卷')
  if (!volumeId) throw new Error('创建卷失败')

  const chapterId = await repo.addChapter(volumeId, '短篇正文')
  if (!chapterId) throw new Error('创建章节失败')

  const ws = new WorkspaceSettings(workId)
  ws.update({
    platformId,
    genre: tagSet.genre || ws.data.genre,
    tags: [
      ...(ws.data.tags || []),
      ...(tagSet.subgenre || []),
      ...(tagSet.elements || []),
    ],
  })

  return { workId, volumeId, chapterId }
}

export async function launchShortStoryWorkflow(
  runner: WorkflowRunner,
  platformId: string,
  tagSet: TagSet,
  wordCount: number,
  workId: number,
  chapterId: number,
  extra: string | undefined,
  callbacks: ShortStoryCallbacks,
): Promise<ShortStoryResult> {
  // 注意：runner 为一次性使用设计，每次调用 launchShortStoryWorkflow 前都应通过
  // createShortStoryRunner() 创建新实例，避免事件监听器累积
  if (callbacks.onStepStart) runner.on('step:start', (step) => callbacks.onStepStart!(step.id))
  if (callbacks.onChunk) runner.on('step:chunk', (text) => callbacks.onChunk!(text))
  if (callbacks.onStepDone) runner.on('step:done', (_step, output) => callbacks.onStepDone!(_step.id, output))
  if (callbacks.onApprovalNeeded) runner.on('step:awaiting', (card) => callbacks.onApprovalNeeded!(card))
  if (callbacks.onDone) runner.on('run:done', () => callbacks.onDone!())
  if (callbacks.onError) runner.on('run:failed', (err) => callbacks.onError!(err))

  const steps = buildShortStoryWorkflow(platformId, tagSet, wordCount, extra)
  // 将 chapterId 注入 short_story_gen 步骤的 inputs（供 commit_write 的 mapToPendingWrite 使用）
  const genStep = steps.find(s => s.agentId === 'short_story_gen')
  if (genStep) genStep.inputs.chapterId = String(chapterId)
  runner.setContext({ workId, chapterId, _pendingWrites: [] })

  const runPromise = runner.run(steps, 'approval')

  const result: ShortStoryResult = {
    runner, workId, chapterId,
    waitForDecision: (decision: Decision) => {
      try { runner.decide(decision) } catch (e: any) { callbacks.onError?.(e) }
    },
    abort: () => { runner.abort() },
  }

  runPromise.catch((e) => { console.error('[shortStory] workflow failed:', e) })
  return result
}
