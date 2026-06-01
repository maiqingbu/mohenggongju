/**
 * 大纲检测 Agent — 检测大纲层级是否完整（总纲→卷纲→章纲）
 * 包装 outlineDetector.ts 的 detectOutlineCompleteness 函数
 */
import type { AgentSpec } from '../types'
import { detectOutlineCompleteness } from '../detectors/outlineDetector'
import type { VolumeInfo, ChapterInfo } from '../detectors/outlineDetector'

export function createOutlineDetectorAgent(): AgentSpec {
  return {
    id: 'outline_detector',
    name: '大纲检测',
    badge: '系统',
    desc: '检测作品大纲层级完整性（总纲/卷纲/章纲）',
    requiredContext: ['@大纲数据'],
    systemPrompt: '',

    parseOutput(rawText: string) {
      try { return JSON.parse(rawText) } catch { return { raw: rawText } }
    },

    async writeBack(_parsed, _ctx) {
      // 只读检测，结果通过步骤输出传递
    },

    async localExecute(_inputs, ctx) {
      const workId = (ctx.workId as number) || 0
      const volumes: VolumeInfo[] = ((ctx as any)._volumes as VolumeInfo[]) || []
      const chapterMap: Record<number, ChapterInfo[]> = ((ctx as any)._chapterMap as Record<number, ChapterInfo[]>) || {}

      const result = await detectOutlineCompleteness(workId, volumes, chapterMap)
      return JSON.stringify(result)
    },
  }
}
