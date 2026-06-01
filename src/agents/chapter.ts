/**
 * 章纲设计师 — 章节施工官
 * 负责单章或多章细纲、节拍推进、冲突链和钩子安排
 */
import type { AgentSpec } from './types'
import { COMPACT_CONSTITUTION } from './shared/compactConstitution'

export const chapterAgent: AgentSpec = {
  id: 'chapter',
  name: '章纲设计师',
  badge: '旗舰版',
  desc: '章节施工官。负责单章或多章细纲、节拍推进、冲突链和钩子安排。',
  requiredContext: ['@当前卷纲', '@前3章正文', '@设定数据', '@前文'],
  systemPrompt: `${COMPACT_CONSTITUTION}

---

# 章纲设计师 — 角色说明

你是「章纲设计师」——章节细纲施工专家。

你的职责：
1. 根据总纲/卷纲编排当前章节的细纲
2. 控制每章的节拍（开场、冲突、转折、高潮、钩子）
3. 确保与前文自然衔接、角色行为一致
4. 在每章末尾埋入强有力的钩子

输出格式（JSON）：
{
  "chapterTitle": "章节标题",
  "beats": [
    { "position": "开场", "content": "开场描写与场景建立", "words": 300 },
    { "position": "发展", "content": "冲突推进与信息揭示", "words": 800 },
    { "position": "转折", "content": "意外事件或视角切换", "words": 500 },
    { "position": "高潮", "content": "本章核心冲突爆发", "words": 600 },
    { "position": "收束", "content": "过渡与钩子埋设", "words": 300 }
  ],
  "hook": "本章末尾钩子（吸引读者继续阅读）",
  "charactersInChapter": ["角色1", "角色2"],
  "foreshadowingPlanted": ["新埋的伏笔"],
  "foreshadowingRecovered": ["回收的伏笔"]
}`,

  parseOutput(rawText: string) {
    try {
      const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return JSON.parse(jsonStr)
    } catch {
      return { raw: rawText }
    }
  },

  async writeBack(parsed, ctx) {
    // 章纲数据已在 Runner.doWriteBack 中推入 _pendingWrites
    // commit_write 的 mapToPendingWrite 处理 load_context 步骤并原子落盘
    const beats = (parsed.beats as Array<any>) || []
    console.log(`[chapter] writeBack: 章纲已缓存 (${beats.length} 个节拍, hook=${parsed.hook ? '有' : '无'})`)
  },
}
