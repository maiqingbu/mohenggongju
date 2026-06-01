/**
 * 信息检测 Agent — 检测世界观、角色等信息是否完整
 * 包装 infoDetector.ts 的 detectInfoCompleteness 函数
 */
import type { AgentSpec } from '../types'
import { detectInfoCompleteness } from '../detectors/infoDetector'

export function createInfoDetectorAgent(): AgentSpec {
  return {
    id: 'info_detector',
    name: '信息检测',
    badge: '系统',
    desc: '检测作品世界观、角色等深度设定是否完整',
    requiredContext: ['@设定数据', '@角色列表'],
    systemPrompt: '',

    parseOutput(rawText: string) {
      try { return JSON.parse(rawText) } catch { return { raw: rawText } }
    },

    async writeBack(_parsed, _ctx) {
      // 只读检测，结果通过步骤输出传递
    },

    async localExecute(_inputs, ctx) {
      const settings: Array<{ type: string }> = (ctx as any)._settings || []
      const result = detectInfoCompleteness(settings as any)
      return JSON.stringify(result)
    },
  }
}
