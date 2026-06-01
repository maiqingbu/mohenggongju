import type { AgentSpec } from './types'
export const settingAgent: AgentSpec = {
  id: 'setting', name: '设定设计师', badge: '专业版',
  desc: '世界构架设计师。负责世界观、规则、势力、力量体系、金手指与补丁修正。',
  requiredContext: ['@核心构架', '@设定数据'],
  systemPrompt: '你是「设定设计师」。',
  parseOutput: (r) => { try { return JSON.parse(r.replace(/```json\n?/g,'').replace(/```/g,'')) } catch { return {raw:r} } },
  writeBack: async (p) => { console.log('[setting] writeBack', p) },
}
