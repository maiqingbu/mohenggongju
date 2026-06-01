import { describe, it, expect, beforeEach } from 'vitest'
import { parseChapterOutlinesText, upsertOutline, getOutline } from '../composables/useOutlines'
import type { ChapterOutlineStructured } from '../composables/useOutlines'

// 模拟 AI 结构化章纲输出（完全匹配模板格式）
const STRUCTURED_OUTPUT = `第1章：签字笔锋下的逆转
类型：冲突升级
字数限制：3000

出场角色：张三，李四，王五
核心场景：公司会议室
时间跨度：九点至十一点
核心爽点：张三当众揭穿李四伪造合同
底层博弈：信息不对称下的权力角逐
本章收益：张三获得关键证据

对应Phase节点：Phase 1（1-4章），会客厅第一阶段交锋
剧情进度自检：当前第1章，禁止在本章写完Phase核心结局

起·切入与危机：张三收到匿名信，发现李四在背后操控公司合同
承·冲突升级：张三在会议上质问李四，李四反咬一口
转·关键破局：张三拿出匿名信和监控录像，证据链完整
合·余波与代价：李四被停职，但王五暗示背后还有更大的势力

黄金钩子：会议结束后，张三发现匿名信的笔迹竟然和自己的合伙人一模一样
钩子类型：信息钩

---

第2章：暗流涌动的棋局
类型：揭秘
字数限制：2500

出场角色：张三，赵六
核心场景：张三的办公室
时间跨度：下午两点至四点
核心爽点：赵六主动投诚，揭露公司内部腐败链条
底层博弈：信任建立与信息验证的心理战
本章收益：张三获得内部举报人赵六

对应Phase节点：Phase 1（1-4章），信息收集阶段
剧情进度自检：当前第2章，Phase 1还剩2章，禁止揭露幕后黑手身份

起·切入与危机：张三调查匿名信来源，发现公司财务数据异常
承·冲突升级：赵六深夜到访，声称愿意做污点证人
转·关键破局：赵六提供了一份内部转账记录，金额高达千万
合·余波与代价：赵六要求保护，张三承诺但心存疑虑

黄金钩子：赵六离开后，张三发现他的手机里有一条未读消息："计划顺利"
钩子类型：危机钩`

describe('结构化章纲完整落库链路', () => {
  it('解析结果应包含所有结构化字段', () => {
    const parsed = parseChapterOutlinesText(STRUCTURED_OUTPUT)
    expect(parsed).toHaveLength(2)

    // 检查第一章
    const ch1 = parsed[0]
    expect(ch1.chapterTitle).toContain('签字笔锋')
    expect(ch1.data.chapterType).toBe('冲突升级')
    expect(ch1.data.wordLimit).toBe(3000)
    expect(ch1.data.characters).toBe('张三，李四，王五')
    expect(ch1.data.coreScene).toBe('公司会议室')
    expect(ch1.data.timeSpan).toBe('九点至十一点')
    expect(ch1.data.coreCoolPoint).toBe('张三当众揭穿李四伪造合同')
    expect(ch1.data.underlyingGame).toBe('信息不对称下的权力角逐')
    expect(ch1.data.chapterGains).toBe('张三获得关键证据')
    expect(ch1.data.phaseAlignment).toBeTruthy()
    expect(ch1.data.progressCheck).toBeTruthy()
    // 起承转合
    expect(ch1.data.act1_entryAndCrisis).toBeTruthy()
    expect(ch1.data.act2_conflictEscalation).toBeTruthy()
    expect(ch1.data.act3_keyBreakthrough).toBeTruthy()
    expect(ch1.data.act4_aftermathAndCost).toBeTruthy()
    // 钩子
    expect(ch1.data.goldenHook).toBeTruthy()
    expect(ch1.data.hookType).toBe('信息钩')

    // 检查第二章
    const ch2 = parsed[1]
    expect(ch2.chapterTitle).toContain('暗流涌动')
    expect(ch2.data.chapterType).toBe('揭秘')
    expect(ch2.data.wordLimit).toBe(2500)
  })

  it('解析后的数据应能通过 as 断言转为 ChapterOutlineStructured', () => {
    const parsed = parseChapterOutlinesText(STRUCTURED_OUTPUT)
    for (const ch of parsed) {
      const sd = { ...ch.data, chapterTitle: ch.chapterTitle } as ChapterOutlineStructured
      // 关键字段必须有值，否则 as 断言虽通过但运行时会出问题
      expect(typeof sd.chapterTitle === 'string' && sd.chapterTitle.length > 0).toBe(true)
      expect(typeof sd.chapterType === 'string' && sd.chapterType.length > 0).toBe(true)
      expect(typeof sd.wordLimit === 'number' && sd.wordLimit > 0).toBe(true)
      expect(typeof sd.characters === 'string').toBe(true)
      expect(typeof sd.coreScene === 'string').toBe(true)
    }
  })

  it.skip('模拟落库链路：解析 → upsertOutline → getOutline（需要 Tauri FS 或 localStorage 环境）', async () => {
    const parsed = parseChapterOutlinesText(STRUCTURED_OUTPUT)
    expect(parsed).toHaveLength(2)

    // 模拟 ChapterOutlineStructured 的构建（与 OutlinePanel.vue:1003 一致）
    for (let i = 0; i < parsed.length; i++) {
      const { chapterTitle, data } = parsed[i]
      const chId = 100 + i // 模拟 chapterId
      const structuredData = { ...data, chapterTitle: chapterTitle || data.chapterTitle || `第${i + 1}章` } as ChapterOutlineStructured

      // 验证 structuredData 的关键字段
      expect(structuredData.chapterTitle).toBeTruthy()
      expect(structuredData.chapterType).toBeTruthy()
      expect(structuredData.wordLimit).toBeGreaterThan(0)
      expect(structuredData.characters).toBeTruthy()
      expect(structuredData.coreScene).toBeTruthy()
      expect(structuredData.act1_entryAndCrisis).toBeTruthy()
      expect(structuredData.goldenHook).toBeTruthy()

      // 尝试落库
      const result = await upsertOutline({
        workId: 999,
        type: 'chapter',
        volumeId: 1,
        chapterId: chId,
        content: STRUCTURED_OUTPUT.slice(0, 2000),
        structuredData,
      })

      // upsertOutline 不应返回 null
      expect(result).not.toBeNull()
      if (result) {
        expect(result.structuredData).toBeTruthy()
        expect(result.structuredData!.chapterTitle).toBe(structuredData.chapterTitle)
        expect(result.structuredData!.chapterType).toBe(structuredData.chapterType)
        expect(result.structuredData!.characters).toBe(structuredData.characters)
        expect(result.structuredData!.act1_entryAndCrisis).toBe(structuredData.act1_entryAndCrisis)
      }
    }

    // 验证回读
    for (let i = 0; i < parsed.length; i++) {
      const chId = 100 + i
      const saved = await getOutline('chapter', chId)
      expect(saved).not.toBeNull()
      if (saved) {
        expect(saved.structuredData).toBeTruthy()
        expect(saved.structuredData!.chapterTitle).toContain(i === 0 ? '签字笔锋' : '暗流涌动')
        // 验证 content 也已保存
        expect(saved.content.length).toBeGreaterThan(0)
      }
    }
  })

  it('字段值不应包含标签名本身（模板要求）', () => {
    const parsed = parseChapterOutlinesText(STRUCTURED_OUTPUT)
    for (const ch of parsed) {
      // 检查各字段值是否以对应的标签名开头（不应该）
      const checks: [string, string][] = [
        ['chapterType', '类型'],
        ['characters', '出场角色'],
        ['coreScene', '核心场景'],
        ['coreCoolPoint', '核心爽点'],
        ['goldenHook', '黄金钩子'],
      ]
      for (const [key, label] of checks) {
        const val = ch.data[key as keyof ChapterOutlineStructured] as string
        if (val) {
          expect(val.startsWith(label)).toBe(false)
        }
      }
    }
  })

  it('解析后的字段值不应为空字符串', () => {
    const parsed = parseChapterOutlinesText(STRUCTURED_OUTPUT)
    for (const ch of parsed) {
      // 核心字段不应为空
      expect(ch.data.chapterType?.length).toBeGreaterThan(0)
      expect(ch.data.characters?.length).toBeGreaterThan(0)
      expect(ch.data.coreScene?.length).toBeGreaterThan(0)
      expect(ch.data.act1_entryAndCrisis?.length).toBeGreaterThan(0)
      expect(ch.data.act2_conflictEscalation?.length).toBeGreaterThan(0)
      expect(ch.data.act3_keyBreakthrough?.length).toBeGreaterThan(0)
      expect(ch.data.act4_aftermathAndCost?.length).toBeGreaterThan(0)
    }
  })
})
