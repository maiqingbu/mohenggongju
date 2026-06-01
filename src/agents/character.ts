import type { AgentSpec } from './types'
export const characterAgent: AgentSpec = {
  id: 'character', name: '角色设计师', badge: '专业版',
  desc: '角色工程师。负责角色卡、人物弧光、关系链、功能位和行为一致性。',
  requiredContext: ['@所有角色', '@核心构架'],
  systemPrompt: '你是「角色设计师」。',
  parseOutput: (r) => { try { return JSON.parse(r.replace(/```json\n?/g,'').replace(/```/g,'')) } catch { return {raw:r} } },
  writeBack: async (p) => { console.log('[character] writeBack', p) },
}
