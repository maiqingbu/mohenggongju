/**
 * Feature: 信息设定管理
 *
 * 用户管理作品的设定数据（角色/世界观/物品/伏笔/情节线）
 * 支持手动添加和 AI 提取审核两种入库方式
 */
import { describe, it, expect } from 'vitest'
import {
  SettingsManager,
  type SettingEntityType,
  defaultDataForType,
} from '../../composables/useSettings'

describe('Feature: 信息设定管理', () => {
  describe('Scenario: 用户手动添加一个新角色', () => {
    // Given: 一个空白的信息设定管理器
    const mgr = new SettingsManager()

    it('Given 设定管理器为空 → 角色列表长度为 0', () => {
      expect(mgr.listByType('character')).toHaveLength(0)
    })

    it('When 添加角色"苏婉"并填入结构化数据 → 实体创建成功', async () => {
      const e = await mgr.add({
        type: 'character',
        name: '苏婉',
        chapterNo: 1,
        summary: '25岁外科医生，表面冷漠内心柔软',
        structuredData: {
          gender: '女',
          age: '25',
          identity: '外科医生',
          personality: '冷静坚韧、外冷内热',
          alive: true,
          location: '南城',
        },
      })
      expect(e.id).toBeTruthy()
      expect(e.name).toBe('苏婉')
      expect(e.source).toBe('manual')
    })

    it('Then 角色列表应包含 1 条记录，且结构化数据完整', () => {
      const chars = mgr.listByType('character')
      expect(chars).toHaveLength(1)
      const c = chars[0]
      expect((c.structuredData as any).gender).toBe('女')
      expect((c.structuredData as any).identity).toBe('外科医生')
      expect(mgr.getVersion()).toBe(1)
    })
  })

  describe('Scenario: 用户编辑现有角色并查看变更历史', () => {
    const mgr = new SettingsManager()

    it('Given 已有一个角色"陆景行"', async () => {
      await mgr.add({
        type: 'character',
        name: '陆景行',
        chapterNo: 1,
        structuredData: { gender: '男', identity: 'CEO', alive: true },
      })
      expect(mgr.listByType('character')).toHaveLength(1)
    })

    it('When 修改角色的身份和位置 → 版本号递增', async () => {
      const e = mgr.listByType('character')[0]
      const ok = await mgr.update(e.id, {
        name: '陆景行',
        structuredData: { identity: '前CEO，现创业者', location: '北京' } as any,
      })
      expect(ok).toBe(true)

      const updated = mgr.get(e.id)!
      expect(updated.version).toBe(2)
      expect((updated.structuredData as any).identity).toBe('前CEO，现创业者')
      expect((updated.structuredData as any).location).toBe('北京')
    })

    it('Then 角色原有字段不应丢失，版本号反映修改次数', () => {
      const c = mgr.listByType('character')[0]
      expect((c.structuredData as any).gender).toBe('男')    // 保留
      expect((c.structuredData as any).alive).toBe(true)      // 保留
      expect(c.version).toBe(2)
    })
  })

  describe('Scenario: 用户删除一个无效的设定条目', () => {
    const mgr = new SettingsManager()

    it('Given 设定库中有一个临时添加的错误条目', async () => {
      await mgr.add({ type: 'item', name: '写错名字的物品XYZ' })
      expect(mgr.listByType('item')).toHaveLength(1)
    })

    it('When 用户删除该条目 → 删除成功', async () => {
      const e = mgr.listByType('item')[0]
      const ok = await mgr.remove(e.id)
      expect(ok).toBe(true)
    })

    it('Then 物品列表应为空', () => {
      expect(mgr.listByType('item')).toHaveLength(0)
    })
  })

  describe('Scenario: AI 提取后批量审核导入设定', () => {
    // Given: AI 提取了 3 个候选实体
    const aiCandidates: Array<{
      id: string
      type: SettingEntityType
      name: string
      chapterNo: number
      summary: string
      structuredData: Record<string, unknown>
    }> = [
      {
        id: 'ai_001', type: 'character', name: '林雪', chapterNo: 2,
        summary: '女二，26岁律师，冷静聪明，和女主是闺蜜',
        structuredData: { gender: '女', age: '26', identity: '律师', personality: '理智、忠诚' },
      },
      {
        id: 'ai_002', type: 'world_setting', name: '南城', chapterNo: 1,
        summary: '故事发生地，一线城市的缩影',
        structuredData: { category: '地理', description: '沿海一线城市', scope: '全局' },
      },
      {
        id: 'ai_003', type: 'foreshadowing', name: '梅花玉佩的来历', chapterNo: 3,
        summary: '女主随身玉佩，暗示其真实身份',
        structuredData: { plantedAt: '第3章', expectedAt: '第10章', resolved: false },
      },
    ]

    it('When 用户审核通过全部 3 个候选 → 批量导入', async () => {
      const mgr = new SettingsManager()
      const result = await mgr.importMany(aiCandidates.map(c => ({
        ...c,
        source: 'ai_extraction' as const,
      })))

      expect(result).toHaveLength(3)
      expect(mgr.listAll()).toHaveLength(3)
    })

    it('Then 角色列表应有"林雪"、世界观列表应有"南城"、伏笔列表应有"梅花玉佩的来历"', async () => {
      const mgr = new SettingsManager()
      await mgr.importMany(aiCandidates.map(c => ({
        ...c,
        source: 'ai_extraction' as const,
      })))

      const chars = mgr.listByType('character')
      const worlds = mgr.listByType('world_setting')
      const fores = mgr.listByType('foreshadowing')

      expect(chars.find(c => c.name === '林雪')).toBeTruthy()
      expect(worlds.find(w => w.name === '南城')).toBeTruthy()
      expect(fores.find(f => f.name === '梅花玉佩的来历')).toBeTruthy()
    })

    it('Then 所有导入实体的 source 应为 ai_extraction', async () => {
      const mgr = new SettingsManager()
      await mgr.importMany(aiCandidates.map(c => ({
        ...c,
        source: 'ai_extraction' as const,
      })))

      for (const e of mgr.listAll()) {
        expect(e.source).toBe('ai_extraction')
      }
    })
  })

  describe('Scenario: 已有设定与 AI 提取结果合并', () => {
    it('Given 已有角色"苏婉"，AI 再次提取到同名角色 → 应合并而非重复', async () => {
      const mgr = new SettingsManager()

      // Given: 手动添加
      await mgr.add({
        type: 'character', name: '苏婉',
        chapterNo: 1,
        summary: '女主',
        structuredData: { gender: '女', age: '25', identity: '医生', alive: true },
      })

      // When: AI 提取
      const result = await mgr.importMany([
        {
          id: 'ai_new', type: 'character' as SettingEntityType, name: '苏婉',
          chapterNo: 2, summary: '女主，外科医生，在第2章揭露了隐藏身份',
          structuredData: { identity: '外科主治医师', personality: '外冷内热' },
          source: 'ai_extraction' as const,
        },
      ])

      // Then
      expect(mgr.listByType('character')).toHaveLength(1) // 不新增
      const c = mgr.listByType('character')[0]
      expect(c.version).toBe(2)
      expect(c.summary).toBe('女主，外科医生，在第2章揭露了隐藏身份')
      expect((c.structuredData as any).identity).toBe('外科主治医师')  // 更新
      expect((c.structuredData as any).gender).toBe('女')               // 保留
      expect((c.structuredData as any).alive).toBe(true)                // 保留
      expect((c.structuredData as any).personality).toBe('外冷内热')    // 新增
    })
  })

  describe('Scenario: 空数据类型的默认值', () => {
    it('每种实体类型都应有合理的默认结构化数据', () => {
      const types: SettingEntityType[] = ['character', 'world_setting', 'item', 'foreshadowing', 'plot_arc']
      for (const t of types) {
        const d = defaultDataForType(t)
        expect(d).toBeDefined()
        expect(typeof d).toBe('object')
        expect(Object.keys(d).length).toBeGreaterThan(0)
      }
    })
  })
})
