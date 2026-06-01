/**
 * 短篇创作工作流 — 4 步完成
 *
 * 流程：short_story_gen → paragraph_fix → style_review → commit_write
 *
 * 关键特征：一次成型（非逐章）、平台风格强约束、产出即发布
 */
import type { WorkflowStep } from '../types'
import type { TagSet } from '../../composables/usePlatformTags'

export function buildShortStoryWorkflow(
  platformId: string,
  tagSet: TagSet,
  wordCount: number,
  extra?: string,
): WorkflowStep[] {
  const extraPrompt = extra ? `\n\n【额外要求】\n${extra}` : ''

  const steps: WorkflowStep[] = [
    {
      id: 'short_story_gen',
      agentId: 'short_story_gen',
      inputs: {
        action: 'generate',
        platformId,
        wordCount: String(wordCount),
        tagSetJson: JSON.stringify(tagSet),
        extra: extraPrompt,
      },
      approval: 'always',
      skippable: false,
      next: 'paragraph_fix',
    },
    {
      id: 'paragraph_fix',
      agentId: 'paragraph_fix',
      inputs: {
        contentKey: 'step:short_story_gen',
      },
      approval: 'auto',
      skippable: true,
      next: 'style_review',
    },
    {
      id: 'style_review',
      agentId: 'style_review',
      inputs: {
        content: '@ctx.step:paragraph_fix',
        chapterNo: '1',
      },
      approval: 'on_warning',
      skippable: true,
      next: 'commit_write',
    },
    {
      id: 'commit_write',
      agentId: 'commit_write',
      inputs: {
        action: 'commit',
      },
      approval: 'always',
      skippable: false,
      next: null,
    },
  ]

  return steps
}
