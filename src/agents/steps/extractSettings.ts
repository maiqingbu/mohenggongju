/**
 * R8: 设定数据提取 step — 从正文中抽取角色状态变更
 *
 * approval='always' — 设定一旦写入会污染后续章节，必须人审
 * 审阅卡展示 old→new diff，用户逐字段取舍
 */
import type { AgentSpec, ConsistencyIssue } from '../types'

export interface SettingsDiff {
  entityId: string
  entityName: string
  entityType: 'character' | 'world_setting' | 'item'
  fields: SettingsFieldDiff[]
}

export interface SettingsFieldDiff {
  field: string
  label: string
  oldValue: string
  newValue: string
  selected: boolean  // 用户可勾选/取消
  changed: boolean   // 是否有实际变化
}

export function createExtractSettingsAgent(): AgentSpec {
  return {
    id: 'extract_settings',
    name: '设定数据更新',
    badge: '系统',
    desc: '从正文中提取角色/设定状态变更，生成 diff 供审阅',
    requiredContext: ['@设定数据', '@本章正文'],
    systemPrompt: `你是「设定提取员」——从小说正文中识别角色和世界设定的状态变更。

你会收到：
1. 当前作品的设定数据（角色信息、世界设定、物品等）
2. 本章正文

请在正文中找出明确发生变化的角色状态，输出 JSON。

## 提取规则
- 只提取正文中**明确描写**了变化的状态
- 没有变化或不确定的 → 不报告
- entityId 从设定数据中匹配（找不到则用角色名作为 ID）
- 状态字段变化：位置/伤势/能力/物品持有/人际关系等

## 输出格式
严格输出纯 JSON（不要 markdown 代码块）：
{
  "diffs": [
    {
      "entityId": "角色ID或角色名",
      "entityName": "角色名",
      "entityType": "character",
      "fields": [
        {
          "field": "location",
          "label": "状态",
          "oldValue": "旧值（从设定数据中获取，如无则填'未知'）",
          "newValue": "正文中的新值",
          "selected": true,
          "changed": true
        }
      ]
    }
  ]
}

如果正文中没有明确的状态变化，返回 { "diffs": [] }。`,

    parseOutput(rawText: string) {
      try {
        return JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```/g, ''))
      } catch {
        return { diffs: [], raw: rawText }
      }
    },

    async writeBack(parsed, ctx) {
      const diffs = (parsed.diffs || []) as SettingsDiff[]
      const { SettingsManager } = await import('../../composables/useSettings')
      const mgr = new SettingsManager()
      const rawWid = ctx?.workId
      // 防御：workId 可能来自 ref 包装（如 Pinia store）或直接是 number
      let workId: number
      if (typeof rawWid === 'number') {
        workId = rawWid
      } else if (rawWid && typeof rawWid === 'object' && 'value' in rawWid && typeof rawWid.value === 'number') {
        workId = rawWid.value as number
      } else {
        console.error('[extractSettings] 无法解析 workId，ctx.workId=', rawWid, '，跳过写入')
        return
      }

      // 必须先加载已有数据，否则 listByType 返回空，无法找到实体
      await mgr.load(workId)

      // F4: 保存快照，用于失败时回滚
      const snapshots = new Map<string, {
        entity: { structuredData: Record<string, unknown>; name: string; type: string }
        isNew: boolean
      }>()

      const createdEntityIds: string[] = []

      try {
        for (const diff of diffs) {
          let entity = mgr.listByType(diff.entityType as any).find((e: any) => e.id === diff.entityId)
          const isNew = !entity

          if (!entity) {
            // 实体不存在则新建（AI 可能提取到尚未录入的角色/设定）
            entity = await mgr.add({
              type: diff.entityType as any,
              name: diff.entityName,
              source: 'ai_extraction',
            })
            // 更新 diff.entityId 以便后续 update 能找到
            diff.entityId = entity.id
            createdEntityIds.push(entity.id)
          }

          // 保存快照（新实体保存空快照，已有实体保存完整快照）
          snapshots.set(diff.entityId, {
            entity: {
              structuredData: isNew ? {} : { ...entity.structuredData },
              name: entity.name,
              type: entity.type,
            },
            isNew,
          })

          const existing = (entity.structuredData || {}) as Record<string, unknown>
          const patch: Record<string, unknown> = {}
          for (const f of diff.fields) {
            if (f.selected && f.changed) {
              patch[f.field] = f.newValue
            }
          }

          if (Object.keys(patch).length > 0) {
            await mgr.update(diff.entityId, { structuredData: { ...existing, ...patch } })
          }
        }

        // G4: 真写盘 — 调 mgr.save 落 localStorage
        await mgr.save(workId)
      } catch (e) {
        console.error('[extractSettings] 更新失败，开始回滚...', e)

        // F4: 回滚 — 恢复快照
        for (const [entityId, snapshot] of snapshots) {
          if (snapshot.isNew) {
            // 新创建的实体，删除
            await mgr.remove(entityId)
          } else {
            // 已有实体，恢复原始数据
            await mgr.update(entityId, {
              structuredData: snapshot.entity.structuredData,
            })
          }
        }

        // 回滚后保存
        await mgr.save(workId)
        throw e
      }
    },
  }
}

/** 从章节内容提取设定变更 */
export async function extractSettingsDiff(
  chapterContents: { chapterNo: number; title: string; content: string }[],
  characterNames: string[],
  existingCharacters?: { id: string; name: string; nickname?: string; structuredData?: Record<string, unknown> }[],
): Promise<SettingsDiff[]> {
  const { extractCharacterState } = await import('../../composables/useStateKeeper')
  const characters = existingCharacters || []

  const diffs: SettingsDiff[] = []

  for (const charName of characterNames) {
    const entity = characters.find((c: any) => c.name === charName || c.nickname === charName)
    const extracted = extractCharacterState(charName, chapterContents, characterNames)

    const sd = (entity?.structuredData || {}) as Record<string, unknown>
    const fields: SettingsFieldDiff[] = [
      {
        field: 'location', label: '状态',
        oldValue: String(sd.location || sd.status || '在场'),
        newValue: extracted.location,
        selected: true, changed: String(sd.location || sd.status || '在场') !== extracted.location,
      },
      {
        field: 'importance', label: '重要度',
        oldValue: String(sd.importance || ''),
        newValue: extracted.importance !== null ? String(extracted.importance) : '',
        selected: true, changed: String(sd.importance || '') !== String(extracted.importance || ''),
      },
      {
        field: 'longTermEffects', label: '身体状态',
        oldValue: String(sd.longTermEffects || sd.physical_status || ''),
        newValue: extracted.longTermEffects,
        selected: true, changed: String(sd.longTermEffects || sd.physical_status || '') !== extracted.longTermEffects,
      },
      {
        field: 'tendencies', label: '心理结构',
        oldValue: String(sd.tendencies || sd.psychological_state || ''),
        newValue: extracted.tendencies,
        selected: true, changed: String(sd.tendencies || sd.psychological_state || '') !== extracted.tendencies,
      },
      {
        field: 'behaviorPatterns', label: '性格/行为',
        oldValue: String(sd.behaviorPatterns || sd.characterization || ''),
        newValue: extracted.behaviorPatterns,
        selected: true, changed: String(sd.behaviorPatterns || sd.characterization || '') !== extracted.behaviorPatterns,
      },
      {
        field: 'abilities', label: '技能/能力',
        oldValue: Array.isArray(sd.abilities) ? (sd.abilities as string[]).join(', ') : String(sd.abilities || sd.skills || ''),
        newValue: extracted.abilities.join(', '),
        selected: true, changed: (Array.isArray(sd.abilities) ? (sd.abilities as string[]).join(', ') : String(sd.abilities || '')) !== extracted.abilities.join(', '),
      },
      {
        field: 'items', label: '关键物品',
        oldValue: Array.isArray(sd.items) ? (sd.items as string[]).join(', ') : String(sd.items || ''),
        newValue: extracted.items,
        selected: true, changed: (Array.isArray(sd.items) ? (sd.items as string[]).join(', ') : String(sd.items || '')) !== extracted.items,
      },
      {
        field: 'relationships', label: '人际关系',
        oldValue: String(sd.relationships || ''),
        newValue: extracted.relationships,
        selected: true, changed: String(sd.relationships || '') !== extracted.relationships,
      },
    ]

    const changedFields = fields.filter(f => f.changed)
    if (changedFields.length > 0) {
      diffs.push({
        entityId: entity?.id || charName,
        entityName: charName,
        entityType: 'character',
        fields,
      })
    }
  }

  return diffs
}
