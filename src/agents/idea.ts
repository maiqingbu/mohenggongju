import type { AgentSpec } from './types'
export const ideaAgent: AgentSpec = {
  id: 'idea', name: '脑洞大师', badge: '专业版',
  desc: '创意发动机。负责题材脑洞、反套路卖点、冲突钩子、开篇爆点与变体方向。',
  requiredContext: ['@基础信息', '@核心构架'],
  systemPrompt: '你是「脑洞大师」。',
  parseOutput: (r) => { try { return JSON.parse(r.replace(/```json\n?/g,'').replace(/```/g,'')) } catch { return {raw:r} } },
  writeBack: async (p) => { console.log('[idea] writeBack', p) },
}
