/**
 * R7: 一致性检测 step — 包装 useAnchorDetection.detectConflicts
 *
 * 从 gen_body 产出中提取实体锚点，检测矛盾冲突
 * approval: 'on_error' — 仅 ERROR 级阻塞，WARNING 在审阅卡展示
 */
import type { AgentSpec, ConsistencyIssue } from '../types'

export function createConsistencyCheckAgent(): AgentSpec {
  return {
    id: 'consistency_check',
    name: '一致性检测',
    badge: '系统',
    desc: '检测正文中的角色/设定矛盾冲突',
    requiredContext: ['@设定数据'],
    systemPrompt: '',

    parseOutput(rawText: string) {
      try { return JSON.parse(rawText) } catch { return { raw: rawText } }
    },

    async writeBack(_parsed, _ctx) {
      // 只读检测，不写入
    },

    // 本地执行：不调 LLM，直接跑 detectConflicts
    // G8: 优先使用 inputs.contentKey 显式引用 gen_body 正文，回退到 ctx.lastOutput
    // G8: 加载已有角色/设定数据作为累积锚点状态
    async localExecute(inputs, ctx) {
      const contentKey = String(inputs.contentKey || '')
      const content = (contentKey ? String(ctx[contentKey] || '') : '') || (ctx.lastOutput as string) || ''
      const chapterNo = parseInt(String(inputs.chapterNo || '1'))
      const workId = (ctx?.workId as number) || 1

      // G8: 从 SettingsManager 加载已有角色/物品作为累积状态
      let accumulatedEntities: { name: string; type: import('../../composables/useAnchorDetection').AnchorType; structuredData: Record<string, unknown> }[] = []
      try {
        const { SettingsManager } = await import('../../composables/useSettings')
        const mgr = new SettingsManager()
        await mgr.load(workId)
        const characters = mgr.listByType('character')
        const items = mgr.listByType('item')
        accumulatedEntities = [
          ...characters.map(c => ({
            name: c.name,
            type: 'character' as const,
            structuredData: { alive: c.structuredData.alive, location: c.structuredData.location },
          })),
          ...items.map(i => ({
            name: i.name,
            type: 'item' as const,
            structuredData: { destroyed: i.structuredData.destroyed, owner: i.structuredData.owner },
          })),
        ]
      } catch (e) {
        console.warn('[consistencyCheck] 加载设定数据失败，跳过累积状态对比:', e)
      }

      const issues = await runConsistencyCheck(content, chapterNo, accumulatedEntities)

      if (issues.length === 0) {
        return JSON.stringify({ passed: true, warnings: [], summary: '一致性检测通过' })
      }

      const errors = issues.filter(i => i.level === 'ERROR')
      const warnings = issues.filter(i => i.level === 'WARNING')
      return JSON.stringify({
        passed: errors.length === 0,
        warnings: issues,
        summary: errors.length > 0
          ? `检测到 ${errors.length} 个错误、${warnings.length} 个警告`
          : `检测到 ${warnings.length} 个警告（无错误）`,
      })
    },
  }
}

/** 对正文内容运行一致性检测
 *  G8: 接受 accumulatedEntities 作为累积锚点状态，与当前章节的声明做差异对比
 */
export async function runConsistencyCheck(
  content: string,
  chapterNo: number,
  accumulatedEntities?: { name: string; type: import('../../composables/useAnchorDetection').AnchorType; structuredData: Record<string, unknown> }[],
): Promise<ConsistencyIssue[]> {
  try {
    const { extractAnchors, detectConflicts, AnchorStore, extractEntityMentions } = await import(
      '../../composables/useAnchorDetection'
    )
    const anchorStore = new AnchorStore()

    // G8: 将累积实体状态载入 AnchorStore 作为"已知真相"
    if (accumulatedEntities && accumulatedEntities.length > 0) {
      for (const ent of accumulatedEntities) {
        anchorStore.add({
          type: ent.type,
          name: ent.name,
          chapterNo: 1, // 累积数据的原始章节不重要
          summary: '',
          entities: [ent.name],
          structuredData: ent.structuredData,
        })
      }
    }

    // G8: 同时从当前章节正文提取锚点（用于发现新实体）
    const allEntityNames = (accumulatedEntities || []).map(e => e.name)
    const chapterText = { chapterNo, content, existingEntities: allEntityNames }
    const chapterAnchors = extractAnchors(chapterText)
    chapterAnchors.forEach(a => anchorStore.add(a))

    // G8: 从当前章节正文中提取已知实体的状态声明
    const mentionCandidates = (accumulatedEntities || []).map(e => ({ name: e.name, type: e.type }))
    // 加上本章新发现的实体
    for (const a of chapterAnchors) {
      if (!mentionCandidates.some(m => m.name === a.name)) {
        mentionCandidates.push({ name: a.name, type: a.type })
      }
    }
    const mentions = extractEntityMentions(content, mentionCandidates)

    const conflicts = detectConflicts(anchorStore.getAll(), mentions)
    return conflicts.map(c => ({
      level: c.level === 'ERROR' ? 'ERROR' : 'WARNING',
      type: c.type,
      message: c.message,
      chapter: chapterNo,
    }))
  } catch (e: any) {
    console.error('[consistencyCheck] 一致性检测异常:', e)
    return [{
      level: 'ERROR' as any,
      type: 'system',
      message: `一致性检测执行失败: ${e?.message || '未知错误'}`,
      chapter: chapterNo,
    }]
  }
}
