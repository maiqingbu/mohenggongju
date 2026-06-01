/**
 * 设定检测 Agent — 检测作品基础设定是否完整
 * 包装 settingDetector.ts 的 detectSettingCompleteness 函数
 */
import type { AgentSpec } from '../types'
import { detectSettingCompleteness } from '../detectors/settingDetector'

export function createSettingDetectorAgent(): AgentSpec {
  return {
    id: 'setting_detector',
    name: '设定检测',
    badge: '系统',
    desc: '检测作品基础设定（书名/类型/简介/卖点）是否完整',
    requiredContext: ['@作品信息'],
    systemPrompt: '',

    parseOutput(rawText: string) {
      try { return JSON.parse(rawText) } catch { return { raw: rawText } }
    },

    async writeBack(_parsed, _ctx) {
      // 只读检测，结果通过步骤输出传递
    },

    async localExecute(_inputs, ctx) {
      const work = (ctx as any)._work || {}
      const result = detectSettingCompleteness(work)
      return JSON.stringify(result)
    },
  }
}
