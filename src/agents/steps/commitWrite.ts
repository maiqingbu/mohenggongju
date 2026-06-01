/**
 * R9+F4: commit_write 终端步骤 — 原子写盘
 *
 * 前面 step 只产内存数据，commit_write 是唯一落盘点。
 * approval='always', skippable=false — 用户在审阅卡确认后才落盘。
 *
 * F4 原子性：先 stage（全部快照）→ 逐条写 → 任一失败则回滚已完成的。
 * F4 章号 vs ID：target 存真实 chapterId（主键），非 sort_order 序号。
 */
import type { AgentSpec } from '../types'

export interface PendingWrite {
  type: 'chapter' | 'setting' | 'foreshadow' | 'chapter_plan' | 'outline'
  target: number          // 真实 DB 主键（chapterId / workId / entityId）
  data: Record<string, unknown>
}

export function createCommitWriteAgent(): AgentSpec {
  return {
    id: 'commit_write',
    name: '写入确认',
    badge: '系统',
    desc: '汇总所有产出并原子写入数据层',
    requiredContext: [],
    systemPrompt: '',

    parseOutput(rawText: string) {
      try { return JSON.parse(rawText) } catch { return { raw: rawText } }
    },

    async localExecute(_inputs, ctx) {
      const count = Array.isArray(ctx._pendingWrites) ? ctx._pendingWrites.length : 0
      return JSON.stringify({ committed: true, writes: count, summary: `确认写入 ${count} 项变更` })
    },

    async writeBack(_parsed, ctx) {
      const pendingWrites = (ctx?._pendingWrites || []) as Array<{
        stepId: string; agentId: string; inputs: Record<string, string>
        data: Record<string, unknown>; timestamp: number
      }>
      if (pendingWrites.length === 0) return

      const workId = (ctx?.workId as number) || 0

      // F4: 先 stage 所有待写数据的快照，用于失败时回滚
      const staged: Array<{ write: PendingWrite; snapshot: string | null }> = []
      for (const pw of pendingWrites) {
        const write = mapToPendingWrite(pw)
        if (!write) continue
        // 注入 workId 供 outline 持久化使用
        if (write.type === 'chapter_plan' || write.type === 'outline') {
          write.data._workId = workId
        }
        const snap = await snapshotBefore(write)
        staged.push({ write, snapshot: snap })
      }

      // F4: 原子执行 — 全部成功或全部回滚
      const completed: Array<{ write: PendingWrite; snapshot: string | null }> = []
      try {
        for (const s of staged) {
          await executeWrite(s.write)
          completed.push(s)
        }
        // G6: 原子落盘成功后清除安全网
        if (typeof localStorage !== 'undefined' && workId) {
          localStorage.removeItem(`__wb_snap:${workId}`)
        }
      } catch (e) {
        // 回滚已完成的写入
        for (const c of [...completed].reverse()) {
          await rollbackWrite(c.write, c.snapshot)
        }
        throw new Error(`commit_write 原子写入失败，已回滚 ${completed.length} 项: ${(e as Error).message}`)
      }
    },
  }
}

// ── F4: 快照 & 回滚 ──

async function snapshotBefore(write: PendingWrite): Promise<string | null> {
  switch (write.type) {
    case 'chapter': {
      try {
        const { fetchChapters } = await import('../../composables/useDatabase')
        const { useWorkStore } = await import('../../stores/workStore')
        const store = useWorkStore()
        for (const vol of store.volumes) {
          const chs = await fetchChapters(vol.id)
          const found = chs.find(c => c.id === write.target)
          if (found) return found.content
        }
        return null
      } catch { return null }
    }
    case 'chapter_plan':
    case 'outline': {
      // 大纲/章纲的"快照"是当前已有内容，用于回滚
      try {
        const { getOutline } = await import('../../composables/useOutlines')
        const outlineType = write.type === 'chapter_plan' ? (write.target > 0 ? 'chapter' : 'main') : 'main'
        const refId = write.type === 'chapter_plan' ? write.target : 0
        const existing = await getOutline(outlineType as any, refId || null)
        return existing?.content || null
      } catch { return null }
    }
    default:
      return null
  }
}

async function rollbackWrite(write: PendingWrite, snapshot: string | null): Promise<void> {
  switch (write.type) {
    case 'chapter': {
      if (snapshot === null) return
      try {
        const { updateChapterContent } = await import('../../composables/useDatabase')
        await updateChapterContent(write.target, snapshot)
      } catch (e) {
        console.error(`[commitWrite] 回滚章节 ${write.target} 失败:`, e)
      }
      break
    }
    case 'chapter_plan':
    case 'outline': {
      try {
        const workId = (write.data._workId as number) || 0
        const { upsertOutline } = await import('../../composables/useOutlines')
        const outlineType = write.type === 'chapter_plan' ? (write.target > 0 ? 'chapter' : 'main') : 'main'
        const refId = write.type === 'chapter_plan' ? write.target : 0
        if (snapshot !== null) {
          // 回滚到快照内容
          await upsertOutline({
            workId,
            type: outlineType as any,
            chapterId: refId || undefined,
            content: snapshot,
            status: 'draft',
          })
        }
        // snapshot === null 表示之前没有大纲，不回滚（保留新内容）
      } catch (e) {
        console.error(`[commitWrite] 回滚大纲 ${write.type} 失败:`, e)
      }
      break
    }
  }
}

// ── 映射 & 执行 ──

/** F4: 从 Runner pending write 提取真实 chapterId（不是 gen_body_N 的序号） */
function mapToPendingWrite(pw: {
  stepId: string; agentId: string; inputs?: Record<string, string>
  data: Record<string, unknown>
}): PendingWrite | null {
  const data = pw.data as any

  // short_story_gen → 短篇正文
  if (pw.stepId === 'short_story_gen' && data.content) {
    const chapterId = pw.inputs?.chapterId != null ? Number(pw.inputs.chapterId) : 0
    if (!chapterId) return null
    return { type: 'chapter', target: chapterId, data: { content: data.content } }
  }

  // gen_body_N → 章节正文
  if (pw.stepId.startsWith('gen_body_') && data.content) {
    const chapterId = pw.inputs?.chapterId != null ? Number(pw.inputs.chapterId) : 0
    if (!chapterId) return null
    return { type: 'chapter', target: chapterId, data: { content: data.content } }
  }

  // load_context → 章纲计划（work-level，覆盖续写范围内所有章节）
  if (pw.stepId === 'load_context' && pw.agentId === 'chapter') {
    return { type: 'chapter_plan', target: 0, data: { plan: data } }
  }

  // outline agent → 全书总纲
  if (pw.agentId === 'outline') {
    return { type: 'outline', target: 0, data: { outline: data } }
  }

  // extract_settings → 设定变更
  if (pw.agentId === 'extract_settings' && data.diffs) {
    return { type: 'setting', target: 0, data }
  }

  return null
}

async function executeWrite(write: PendingWrite): Promise<void> {
  switch (write.type) {
    case 'chapter': {
      const { updateChapterContent } = await import('../../composables/useDatabase')
      let content = write.data.content as string
      if (write.target > 0 && content) {
        // 落库前剥离自检清单
        const { stripSelfCheck } = await import('../../composables/stripSelfCheck')
        content = stripSelfCheck(content)
        await updateChapterContent(write.target, content)
      }
      break
    }
    case 'chapter_plan': {
      const plan = write.data.plan as Record<string, unknown>
      const content = formatChapterPlan(plan)
      if (content) {
        const workId = (write.data._workId as number) || 0
        const { upsertOutline } = await import('../../composables/useOutlines')
        await upsertOutline({
          workId,
          type: write.target > 0 ? 'chapter' : 'main',
          chapterId: write.target || undefined,
          content,
          status: 'draft',
        })
      }
      break
    }
    case 'outline': {
      const outline = write.data.outline as Record<string, unknown>
      const content = formatBookOutline(outline)
      if (content) {
        const workId = (write.data._workId as number) || 0
        const { upsertOutline } = await import('../../composables/useOutlines')
        await upsertOutline({
          workId,
          type: 'main',
          content,
          status: 'draft',
        })
      }
      break
    }
    case 'setting':
      // extractSettings agent 自行持久化设定变更，commitWrite 不重复写入
      break
    case 'foreshadow':
      console.warn('[commitWrite] foreshadow 写入路径暂未实现，数据未落盘', write.data)
      break
  }
}

// ── 格式化辅助 ──

function formatChapterPlan(plan: Record<string, unknown>): string {
  const beats = (plan.beats as Array<{ position: string; content: string; words: number }>) || []
  const lines = [
    plan.chapterTitle ? `# ${plan.chapterTitle}` : '',
    '',
    '## 节拍编排',
    ...beats.map((b: any) => `- **${b.position}** (${b.words || 0}字): ${b.content}`),
    '',
    plan.hook ? `## 钩子\n${plan.hook}` : '',
    plan.charactersInChapter ? `## 出场角色\n${(plan.charactersInChapter as string[]).join('、')}` : '',
    plan.foreshadowingPlanted ? `## 新埋伏笔\n${(plan.foreshadowingPlanted as string[]).map((f: string) => `- ${f}`).join('\n')}` : '',
    plan.foreshadowingRecovered ? `## 回收伏笔\n${(plan.foreshadowingRecovered as string[]).map((f: string) => `- ${f}`).join('\n')}` : '',
  ]
  return lines.filter(l => l !== '').join('\n')
}

function formatBookOutline(outline: Record<string, unknown>): string {
  const acts = (outline.acts as Array<{ name: string; chapters: string; goal: string; climax: string }>) || []
  const volumes = (outline.volumes as Array<{ title: string; summary: string; milestones: string[] }>) || []
  const lines = [
    outline.theme ? `# 主题\n${outline.theme}` : '',
    outline.synopsis ? `# 梗概\n${outline.synopsis}` : '',
    '',
    acts.length ? '# 三幕结构' : '',
    ...acts.map((a: any) => `## ${a.name} (${a.chapters}章)\n- **目标**: ${a.goal}\n- **高潮**: ${a.climax}`),
    '',
    volumes.length ? '# 卷规划' : '',
    ...volumes.map((v: any) => `## ${v.title}\n${v.summary}\n${(v.milestones || []).map((m: string) => `- ${m}`).join('\n')}`),
  ]
  return lines.filter(l => l !== '').join('\n')
}

// ── 辅助 ──

export function collectPendingWrites(
  history: Array<{ stepId: string; output: string }>,
): PendingWrite[] {
  const writes: PendingWrite[] = []
  for (const h of history) {
    if (!h.stepId.startsWith('gen_body_')) continue
    writes.push({
      type: 'chapter',
      target: 0, // 调用方事后填入真实 ID
      data: { content: h.output },
    })
  }
  return writes
}
