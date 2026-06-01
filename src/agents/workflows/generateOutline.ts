/**
 * 大纲生成工作流 — 单步审批
 *
 * 总纲 / 卷纲 / 章纲 各自独立触发，LLM 生成 → 审批 → writeBack 落盘
 */
import type { WorkflowStep } from '../types'

export interface OutlineGenConfig {
  type: 'main' | 'volume' | 'chapter'
  label: string           // 用于消息展示
  agentId: string         // 'outline' | 'chapter'
  prompt: string          // 额外的提示词补充
}

export function buildOutlineWorkflow(config: OutlineGenConfig): WorkflowStep[] {
  return [
    {
      id: `gen_${config.type}`,
      agentId: config.agentId,
      inputs: {
        action: 'generate',
        type: config.type,
        prompt: config.prompt,
      },
      approval: 'always',
      skippable: false,
      next: 'commit_outline',
    },
    {
      id: 'commit_outline',
      agentId: 'commit_write',
      inputs: { action: 'commit' },
      approval: 'always',
      skippable: false,
      next: null,
    },
  ]
}
