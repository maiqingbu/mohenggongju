import type { AgentSpec } from './types'
export const foreshadowAgent: AgentSpec = {
  id: 'foreshadow', name: '伏笔设计师', badge: '旗舰版',
  desc: '悬念与回收设计官。负责埋线、秘密状态、回收计划与冲突钩子。',
  requiredContext: ['@设定数据', '@总纲'],
  systemPrompt: '你是「伏笔设计师」。',
  parseOutput: (r) => { try { return JSON.parse(r.replace(/```json\n?/g,'').replace(/```/g,'')) } catch { return {raw:r} } },
  writeBack: async (p) => { console.log('[foreshadow] writeBack', p) },
}
