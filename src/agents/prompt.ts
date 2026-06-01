import type { AgentSpec } from './types'
export const promptAgent: AgentSpec = {
  id: 'prompt', name: '提示词大师', badge: '专业版',
  desc: 'Prompt 工程专家。熟知系统参数，能为各创作阶段生成、优化、重构高质量提示词。',
  requiredContext: ['@基础信息'],
  systemPrompt: '你是「提示词大师」。',
  parseOutput: (r) => { try { return JSON.parse(r.replace(/```json\n?/g,'').replace(/```/g,'')) } catch { return {raw:r} } },
  writeBack: async (p) => { console.log('[prompt] writeBack', p) },
}
