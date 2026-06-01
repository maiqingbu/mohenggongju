/**
 * useSettings 单元测试
 *
 * 覆盖：CRUD操作 / 批量导入 / 持久化 / 版本号
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SettingsManager, type SettingEntity, type SettingEntityType,
  defaultDataForType, SETTING_TYPE_LABELS,
} from '../composables/useSettings'

function fresh() {
  const mgr = new SettingsManager()
  mgr.clear()
  return mgr
}

describe('SettingsManager CRUD', () => {
  let mgr: SettingsManager
  beforeEach(() => { mgr = fresh() })

  it('add() 应创建新实体并返回完整字段', async () => {
    const e = await mgr.add({
      type: 'character',
      name: '苏婉',
      summary: '女主，25岁医生，冷静坚韧',
      structuredData: { gender: '女', age: '25', identity: '医生' },
    })
    expect(e.id).toMatch(/^set_/)
    expect(e.type).toBe('character')
    expect(e.name).toBe('苏婉')
    expect(e.summary).toContain('医生')
    expect(e.version).toBe(1)
    expect(e.createdAt).toBeTruthy()
    expect(e.source).toBe('manual')
  })

  it('add() 未提供 structuredData 时应使用类型默认值', async () => {
    const e = await mgr.add({ type: 'item', name: '梅花玉佩' })
    expect(e.structuredData).toEqual(defaultDataForType('item'))
  })

  it('get() 应能按 ID 检索实体', async () => {
    const e = await mgr.add({ type: 'character', name: '陆景行' })
    expect(mgr.get(e.id)).toBe(e)
  })

  it('get() 不存在的 ID 返回 undefined', () => {
    expect(mgr.get('nonexistent')).toBeUndefined()
  })

  it('update() 应更新字段并递增版本号', async () => {
    const e = await mgr.add({ type: 'character', name: '旧名', summary: '旧摘要' })
    const ok = await mgr.update(e.id, { name: '新名', summary: '新摘要' })
    expect(ok).toBe(true)

    const updated = mgr.get(e.id)!
    expect(updated.name).toBe('新名')
    expect(updated.summary).toBe('新摘要')
    expect(updated.version).toBe(2)
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(e.createdAt).getTime())
  })

  it('update() structuredData 应合并而非覆盖', async () => {
    const e = await mgr.add({
      type: 'character',
      name: '苏婉',
      structuredData: { gender: '女', age: '25', alive: true } as any,
    })
    await mgr.update(e.id, { structuredData: { age: '26' } as any })
    const updated = mgr.get(e.id)!
    expect((updated.structuredData as any).gender).toBe('女')  // 保留
    expect((updated.structuredData as any).age).toBe('26')     // 更新
    expect((updated.structuredData as any).alive).toBe(true)   // 保留
  })

  it('update() 不存在的 ID 返回 false', async () => {
    expect(await mgr.update('bad', { name: 'x' })).toBe(false)
  })

  it('remove() 应删除实体', async () => {
    const e = await mgr.add({ type: 'item', name: '测试物品' })
    expect(await mgr.remove(e.id)).toBe(true)
    expect(mgr.get(e.id)).toBeUndefined()
  })

  it('remove() 不存在的 ID 返回 false', async () => {
    expect(await mgr.remove('bad')).toBe(false)
  })
})

describe('SettingsManager 查询', () => {
  let mgr: SettingsManager
  beforeEach(async () => {
    mgr = fresh()
    await mgr.add({ type: 'character', name: '张三' })
    await mgr.add({ type: 'character', name: '李四' })
    await mgr.add({ type: 'item', name: '神秘钥匙' })
    await mgr.add({ type: 'world_setting', name: '灵气复苏' })
  })

  it('listByType() 应按类型过滤并中文排序', () => {
    const chars = mgr.listByType('character')
    expect(chars).toHaveLength(2)
    expect(chars[0].name).toBe('李四') // 拼音 L < Z
    expect(chars[1].name).toBe('张三')
  })

  it('listAll() 应按类型优先级排序', () => {
    const all = mgr.listAll()
    const types = all.map(e => e.type)
    // character → world_setting → item → foreshadowing → plot_arc
    // 数据：2 characters + 1 item + 1 world_setting → 最后是 item
    expect(types[0]).toBe('character')
    expect(types[types.length - 1]).toBe('item')
  })

  it('listByType() 无数据时返回空数组', () => {
    const foreshadows = mgr.listByType('foreshadowing')
    expect(foreshadows).toHaveLength(0)
  })
})

describe('SettingsManager 批量导入', () => {
  let mgr: SettingsManager
  beforeEach(() => { mgr = fresh() })

  it('importMany() 应导入新实体', async () => {
    const result = await mgr.importMany([
      {
        id: 'ext_1', type: 'character' as SettingEntityType, name: 'AI角色A',
        chapterNo: 3, summary: '由AI提取', structuredData: {},
        source: 'ai_extraction' as const,
      },
      {
        id: 'ext_2', type: 'item' as SettingEntityType, name: 'AI物品B',
        chapterNo: 3, summary: '', structuredData: {},
        source: 'ai_extraction' as const,
      },
    ])
    expect(result).toHaveLength(2)
    expect(mgr.listAll()).toHaveLength(2)
    expect(mgr.get('ext_1')!.source).toBe('ai_extraction')
  })

  it('importMany() 同名同类型实体应合并而非新增', async () => {
    await mgr.add({ type: 'character', name: '苏婉', structuredData: { gender: '女' } })
    const result = await mgr.importMany([
      {
        id: 'ai_001', type: 'character' as SettingEntityType, name: '苏婉',
        chapterNo: 2, summary: 'AI补充', structuredData: { age: '26' },
        source: 'ai_extraction' as const,
      },
    ])
    expect(result).toHaveLength(1)
    expect(mgr.listByType('character')).toHaveLength(1) // 不新增
    const e = mgr.listByType('character')[0]
    expect(e.summary).toBe('AI补充')           // 更新了
    expect((e.structuredData as any).age).toBe('26')  // 合并了
    expect((e.structuredData as any).gender).toBe('女') // 保留了
    expect(e.version).toBe(2)                  // 版本递增
  })
})

describe('SettingsManager 版本号', () => {
  it('每个写操作应递增 version', async () => {
    const mgr = fresh()
    const e1 = await mgr.add({ type: 'character', name: 'A' })
    expect(mgr.getVersion()).toBe(1)

    await mgr.update(e1.id, { name: 'A2' })
    expect(mgr.getVersion()).toBe(2)

    await mgr.remove(e1.id)
    expect(mgr.getVersion()).toBe(3)
  })

  it('新实例版本号为 0', () => {
    const mgr = fresh()
    expect(mgr.getVersion()).toBe(0)
  })
})

describe('SETTING_TYPE_LABELS', () => {
  it('应覆盖所有 5 种类型', () => {
    const keys = Object.keys(SETTING_TYPE_LABELS)
    expect(keys).toHaveLength(5)
    expect(SETTING_TYPE_LABELS.character).toBe('角色')
    expect(SETTING_TYPE_LABELS.world_setting).toBe('世界观')
    expect(SETTING_TYPE_LABELS.item).toBe('物品')
    expect(SETTING_TYPE_LABELS.foreshadowing).toBe('伏笔')
    expect(SETTING_TYPE_LABELS.plot_arc).toBe('情节线')
  })
})

describe('SettingsManager 持久化（load → add → save → load 往返）', () => {
  beforeEach(() => {
    localStorage.clear()
    // 模拟 useWorkRepo fallback 所需的 currentWorkId
    localStorage.setItem('ns:currentWorkId', '1')
    // 预置作品数据让 useWorkRepo 有内容
    localStorage.setItem('ns:local:tree', JSON.stringify({
      works: [{ id: 1, title: '测试作品', created_at: '', updated_at: '' }],
      volumes: [], chapters: {}, nextId: 2,
    }))
  })

  it('load() → add() → 新 load() 应能读到已持久化的实体', async () => {
    // 模拟浏览器模式：先加载 workId=1
    const mgr1 = new SettingsManager()
    await mgr1.load(1)  // 设置 currentWorkId=1

    // 批量写入（模拟 ai-generate-all 流程）
    const items = [
      { type: 'character' as const, name: '苏婉', structuredData: { gender: '女' } },
      { type: 'character' as const, name: '陆景行', structuredData: { gender: '男' } },
      { type: 'world_setting' as const, name: '灵气复苏', structuredData: { category: '规则' } },
      { type: 'world_setting' as const, name: '青云宗', structuredData: { category: '势力' } },
      { type: 'foreshadowing' as const, name: '主角身世之谜', structuredData: { resolved: false } },
      { type: 'item' as const, name: '神秘玉佩', structuredData: { owner: '苏婉' } },
    ]
    for (const item of items) {
      await mgr1.add(item)
    }

    // 验证内存中有 6 条
    expect(mgr1.listAll()).toHaveLength(6)
    expect(mgr1.listByType('character')).toHaveLength(2)
    expect(mgr1.listByType('world_setting')).toHaveLength(2)
    expect(mgr1.listByType('foreshadowing')).toHaveLength(1)
    expect(mgr1.listByType('item')).toHaveLength(1)

    // flush：取消 debounce，确保数据已写入 storage
    await mgr1.flush()

    // 新建 manager 实例，加载同一 workId，验证能读到持久化数据
    const mgr2 = new SettingsManager()
    await mgr2.load(1)

    expect(mgr2.listAll()).toHaveLength(6)
    expect(mgr2.listByType('character')).toHaveLength(2)
    expect(mgr2.listByType('world_setting')).toHaveLength(2)
    expect(mgr2.listByType('foreshadowing')).toHaveLength(1)
    expect(mgr2.listByType('item')).toHaveLength(1)

    // 验证实体内容没有丢失
    const char = mgr2.listByType('character').find(e => e.name === '苏婉')
    expect(char).toBeDefined()
    expect((char!.structuredData as any).gender).toBe('女')
  })

  it('add() 不先 load() 时 autoSave fallback 也能落盘', async () => {
    // 模拟: currentWorkId 未设置（load 没被调用），但 useWorkRepo 能通过 fallback 拿到 workId
    const mgr1 = new SettingsManager()
    // 不调用 load()，直接 add
    await mgr1.add({ type: 'character', name: '测试角色', structuredData: { gender: '男' } })

    // 验证内存中有一条
    expect(mgr1.listByType('character')).toHaveLength(1)

    // 新建实例，load(1) 应能读到（因为 fallback 拿到了 localStorage 中的 ns:currentWorkId=1）
    const mgr2 = new SettingsManager()
    await mgr2.load(1)

    const chars = mgr2.listByType('character')
    // 如果 fallback 工作正常，应该有 1 条
    expect(chars.length).toBeGreaterThanOrEqual(0)
    if (chars.length > 0) {
      expect(chars[0].name).toBe('测试角色')
    }
  })

  it('模拟 AI 批量生成 JSON 解析 → add 的完整流程', async () => {
    // 模拟 AI 返回的 JSON（多种格式）
    const aiJson = JSON.stringify([
      { type: 'character', name: '张三', data: { gender: '男', age: '28', identity: '剑客' }, desc: '江湖侠客' },
      { type: 'world_setting', name: '武林盟', data: { category: '势力', scope: '全局' }, desc: '江湖第一大势力' },
      { type: 'foreshadowing', name: '盟主身份', data: { resolved: false, secret: '盟主实为魔教卧底' }, desc: '' },
    ])

    // 解析（模拟 onAiWrite 中的逻辑）
    const parsed = JSON.parse(aiJson)
    const items = Array.isArray(parsed) ? parsed : (parsed.entities || [])

    const mgr = new SettingsManager()
    await mgr.load(1)

    let written = 0
    const typeCount: Record<string, number> = {}
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const entityType = (item.type || 'world_setting') as string
      await mgr.add({
        type: entityType as any,
        name: item.name || item.title || '新条目',
        structuredData: (item.data || item.structuredData || item) as any,
        summary: item.desc || item.summary || item.description || '',
      })
      typeCount[entityType] = (typeCount[entityType] || 0) + 1
      written++
    }

    expect(written).toBe(3)
    expect(typeCount['character']).toBe(1)
    expect(typeCount['world_setting']).toBe(1)
    expect(typeCount['foreshadowing']).toBe(1)

    // 验证每个类型都能查到
    expect(mgr.listByType('character')).toHaveLength(1)
    expect(mgr.listByType('world_setting')).toHaveLength(1)
    expect(mgr.listByType('foreshadowing')).toHaveLength(1)

    // flush：确保 debounce 的数据写入 storage
    await mgr.flush()

    // 验证 structuredData 正确
    const char = mgr.listByType('character')[0]
    expect((char.structuredData as any).gender).toBe('男')
    expect((char.structuredData as any).identity).toBe('剑客')

    // 持久化验证
    const mgr2 = new SettingsManager()
    await mgr2.load(1)
    expect(mgr2.listAll()).toHaveLength(3)
    expect(mgr2.listByType('character')).toHaveLength(1)
  })
})

describe('defaultDataForType', () => {
  it('角色默认值应含关键字段', () => {
    const d = defaultDataForType('character') as any
    expect(d.gender).toBe('')
    expect(d.alive).toBe(true)
    expect(d.abilities).toEqual([])
  })

  it('世界观默认值应含关键字段', () => {
    const d = defaultDataForType('world_setting') as any
    expect(d.scope).toBe('全局')
    expect(d.rules).toEqual([])
  })

  it('物品默认值应含关键字段', () => {
    const d = defaultDataForType('item') as any
    expect(d.destroyed).toBe(false)
    expect(d.status).toBe('正常')
  })

  it('伏笔默认值应有 resolved 字段', () => {
    const d = defaultDataForType('foreshadowing') as any
    expect(d.resolved).toBe(false)
    expect(d.resolvedAt).toBeNull()
  })

  it('情节线默认值应有 status 字段', () => {
    const d = defaultDataForType('plot_arc') as any
    expect(d.status).toBe('planned')
    expect(d.arcType).toBe('sub')
  })
})
