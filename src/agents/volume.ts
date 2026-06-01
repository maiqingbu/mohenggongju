import type { AgentSpec } from './types'
import { COMPACT_CONSTITUTION } from './shared/compactConstitution'

export const volumeAgent: AgentSpec = {
  id: 'volume', name: '卷纲设计师', badge: '旗舰版',
  desc: '单卷节奏工程师。负责每卷目标、升级链、冲突链、高潮点与收束点。',
  requiredContext: ['@总纲', '@设定数据', '@目标字数', '@每章目标字数'],
  systemPrompt: `${COMPACT_CONSTITUTION}

---

# 卷纲设计师 — 角色说明

你是「卷纲设计师」——单卷节奏工程师。`,
  parseOutput: (r) => { try { return JSON.parse(r.replace(/```json\n?/g,'').replace(/```/g,'')) } catch { return {raw:r} } },
  writeBack: async (p) => { console.log('[volume] writeBack', p) },
}
