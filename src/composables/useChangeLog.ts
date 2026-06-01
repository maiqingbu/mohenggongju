/**
 * 字段追踪 / 变更日志
 *
 * 记录每个字段的每次修改，支持按实体、字段、章节查询。
 * 三层追踪：Entity → Field → Version History
 */

export type EntityType = 'character' | 'item' | 'relationship' | 'foreshadowing' | 'world_setting'
export type Operation = 'create' | 'update' | 'delete'

export interface ChangeRecord {
  id: string
  timestamp: string
  entityType: EntityType
  entityId: string
  entityName: string
  fieldPath: string
  operation: Operation
  oldValue: unknown
  newValue: unknown
  chapter: number
  trigger: 'manual' | 'chapter_generation' | 'ai_extraction' | 'review'
}

export type ChangeEntry = Omit<ChangeRecord, 'id' | 'timestamp'>

export class ChangeLog {
  private records: ChangeRecord[] = []
  private idCounter = 0

  log(entry: ChangeEntry): ChangeRecord {
    const record: ChangeRecord = {
      ...entry,
      id: `chg_${++this.idCounter}`,
      timestamp: new Date().toISOString(),
    }
    this.records.push(record)
    return record
  }

  getHistory(entityType?: EntityType, entityId?: string): ChangeRecord[] {
    let filtered = this.records
    if (entityType) filtered = filtered.filter(r => r.entityType === entityType)
    if (entityId) filtered = filtered.filter(r => r.entityId === entityId)
    return filtered
  }

  getFieldHistory(entityId: string, fieldPath: string): ChangeRecord[] {
    return this.records.filter(r => r.entityId === entityId && r.fieldPath === fieldPath)
  }

  getLatestValue(entityId: string, fieldPath: string): unknown {
    const history = this.getFieldHistory(entityId, fieldPath)
    if (history.length === 0) return undefined
    return history[history.length - 1].newValue
  }

  getChapterChanges(chapter: number): ChangeRecord[] {
    return this.records.filter(r => r.chapter === chapter)
  }

  getAll(): ChangeRecord[] {
    return [...this.records]
  }

  clear() {
    this.records = []
    this.idCounter = 0
  }
}
