/**
 * 续写前置检测 Agent — 检测下一章创作条件是否满足
 * 包装 outlineDetector.ts 的 detectChapterPreflight 函数
 */
import type { AgentSpec } from '../types'
import { detectChapterPreflight } from '../detectors/outlineDetector'
import type { VolumeInfo, ChapterInfo } from '../detectors/outlineDetector'

export function createPreflightCheckAgent(): AgentSpec {
  return {
    id: 'preflight_check',
    name: '续写前置检测',
    badge: '系统',
    desc: '检测续写下一章的前置条件（卷纲/章纲是否就绪）',
    requiredContext: ['@卷列表', '@章节映射'],
    systemPrompt: '',

    parseOutput(rawText: string) {
      try { return JSON.parse(rawText) } catch { return { raw: rawText } }
    },

    async writeBack(_parsed, _ctx) {
      // 只读检测，结果通过步骤输出传递
    },

    async localExecute(inputs, ctx) {
      const chapterNo = parseInt(String(inputs.chapterNo || '1'))
      const workId = parseInt(String(inputs.workId || ctx.workId || '0'))
      const volumes: VolumeInfo[] = (ctx._volumes as VolumeInfo[]) || []
      const chapterMap: Record<number, ChapterInfo[]> = (ctx._chapterMap as Record<number, ChapterInfo[]>) || {}

      const result = await detectChapterPreflight(chapterNo, workId, volumes, chapterMap)
      return JSON.stringify({
        ready: result.ready,
        missing: result.missing,
        volumeIndex: result.volumeIndex,
        detail: result,
      })
    },
  }
}
