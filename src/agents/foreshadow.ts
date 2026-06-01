/**
 * 伏笔设计师 Agent — 使用 Hook Ledger 系统追踪全生命周期
 * 对标 InkOS hook-lifecycle + hook-health + hook-governance
 */
import type { AgentSpec } from './types'
import {
  filterActiveHooks,
  analyzeHookHealth,
  parseHookLedger,
  formatHookContext,
  getHookStats,
  type HookEntry,
  type HookLedger,
} from '../composables/useHookLedger'

export type { HookEntry, HookLedger, HookStatus, HookPayoffTiming, HookHealthIssue } from '../composables/useHookLedger'

export const foreshadowAgent: AgentSpec = {
  id: 'foreshadow',
  name: '伏笔设计师',
  badge: '旗舰版',
  desc: '悬念与回收设计官。负责埋线、秘密状态、回收计划、冲突钩子与健康审计。',
  requiredContext: ['@设定数据', '@总纲'],

  systemPrompt: `你是「伏笔设计师」。

## 职责
1. 从章纲备忘录解析伏笔账本（open/advance/resolve/defer）
2. 追踪每条伏笔生命周期（种下→推进→回收/延后）
3. 检测不健康的伏笔（陈腐/过期/阻塞）
4. 生成伏笔摘要注入 LLM prompt

## 输出格式
\`\`\`json
{
  "hookLedger": { "open": ["新伏笔名"], "advance": ["推进伏笔"], "resolve": ["回收伏笔"], "defer": ["延后伏笔"] },
  "healthIssues": [{ "hookId": "", "name": "", "severity": "warning", "category": "stale", "description": "", "suggestion": "" }],
  "stats": { "total": 0, "active": 0, "coreHooks": 0 },
  "summary": "一句话审计"
}
\`\`\``,

  parseOutput: (raw) => {
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '')
      return JSON.parse(cleaned)
    } catch {
      return { raw }
    }
  },

  async localExecute(inputs, ctx) {
    const hooks: HookEntry[] = (ctx as any)._hooks || []
    const currentChapter = Number(inputs.chapterNumber) || 1
    const healthIssues = analyzeHookHealth(hooks, currentChapter)
    const stats = getHookStats(hooks)

    // 根据当前伏笔状态构建分类账本，避免空账本覆盖已有数据
    const ledger: HookLedger = {
      open: hooks.filter(h => h.status === 'open').map(h => h.name),
      advance: hooks.filter(h => h.status === 'progressing').map(h => h.name),
      resolve: [],
      defer: hooks.filter(h => h.status === 'deferred').map(h => h.name),
    }

    return JSON.stringify({
      hookLedger: ledger,
      healthIssues,
      stats,
      summary: healthIssues.length > 0
        ? `${healthIssues.length} 条伏笔健康问题需关注`
        : '所有伏笔健康',
    })
  },

  writeBack: async (parsed, ctx) => {
    if (!ctx) return
    const ledger = parsed.hookLedger as HookLedger | undefined
    if (ledger) {
      (ctx as any)._hookLedger = ledger
    }
    const activeHooks = filterActiveHooks(((ctx as any)._hooks || []) as HookEntry[])
    if (activeHooks.length > 0) {
      (ctx as any)._hookContext = formatHookContext(activeHooks)
    }
  },
}
