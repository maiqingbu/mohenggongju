import { describe, it, expect } from 'vitest'
import { parseChapterOutlinesText, parseChapterOutlineText } from '../composables/useOutlines'

const MOCK_AI_OUTPUT = `第1章：签字笔锋下的逆转
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

const SIMPLE_OUTPUT = `第1章：初入江湖
类型：过渡
字数限制：2000

出场角色：李明
核心场景：小镇客栈
核心爽点：李明初显身手

起·切入与危机：李明来到陌生小镇
承·冲突升级：客栈里有人挑衅
转·关键破局：李明一招制敌
合·余波与代价：众人惊讶
黄金钩子：客栈老板露出微笑
钩子类型：信息钩`

describe('parseChapterOutlineText', () => {
  it('应正确解析单章结构化章纲', () => {
    const result = parseChapterOutlineText(SIMPLE_OUTPUT)
    expect(result).not.toBeNull()
    expect(result!.chapterTitle).toContain('初入江湖')
    expect(result!.data.chapterType).toBe('过渡')
    expect(result!.data.wordLimit).toBe(2000)
    expect(result!.data.characters).toBe('李明')
    expect(result!.data.coreScene).toBe('小镇客栈')
    expect(result!.data.coreCoolPoint).toBe('李明初显身手')
    expect(result!.data.goldenHook).toBe('客栈老板露出微笑')
  })

  it('应正确解析起承转合字段（含·号标签）', () => {
    const result = parseChapterOutlineText(SIMPLE_OUTPUT)
    expect(result).not.toBeNull()
    expect(result!.data.act1_entryAndCrisis).toBe('李明来到陌生小镇')
    expect(result!.data.act2_conflictEscalation).toBe('客栈里有人挑衅')
    expect(result!.data.act3_keyBreakthrough).toBe('李明一招制敌')
    expect(result!.data.act4_aftermathAndCost).toBe('众人惊讶')
  })

  it('章纲标题为空时应返回 null', () => {
    const result = parseChapterOutlineText('类型：过渡\n核心场景：无')
    expect(result).toBeNull()
  })

  it('无有效内容时应返回 null', () => {
    const result = parseChapterOutlineText('第1章：测试')
    expect(result).toBeNull()
  })
})

describe('parseChapterOutlinesText', () => {
  it('应正确解析多章章纲（--- 分隔）', () => {
    const results = parseChapterOutlinesText(MOCK_AI_OUTPUT)
    expect(results).toHaveLength(2)

    const ch1 = results[0]
    expect(ch1.chapterTitle).toContain('签字笔锋')
    expect(ch1.data.chapterType).toBe('冲突升级')
    expect(ch1.data.wordLimit).toBe(3000)
    expect(ch1.data.characters).toBe('张三，李四，王五')
    expect(ch1.data.coreScene).toBe('公司会议室')
    expect(ch1.data.coreCoolPoint).toBe('张三当众揭穿李四伪造合同')

    const ch2 = results[1]
    expect(ch2.chapterTitle).toContain('暗流涌动')
    expect(ch2.data.chapterType).toBe('揭秘')
    expect(ch2.data.wordLimit).toBe(2500)
  })

  it('应正确解析起承转合的四种字段', () => {
    const results = parseChapterOutlinesText(MOCK_AI_OUTPUT)
    expect(results).toHaveLength(2)
    const ch1 = results[0]
    expect(ch1.data.act1_entryAndCrisis).toContain('匿名信')
    expect(ch1.data.act2_conflictEscalation).toContain('会议上')
    expect(ch1.data.act3_keyBreakthrough).toContain('监控录像')
    expect(ch1.data.act4_aftermathAndCost).toContain('李四被停职')
  })

  it('应正确解析 phase 对齐和进度自检', () => {
    const results = parseChapterOutlinesText(MOCK_AI_OUTPUT)
    const ch1 = results[0]
    expect(ch1.data.phaseAlignment).toBeTruthy()
    expect(ch1.data.progressCheck).toBeTruthy()
    const ch2 = results[1]
    expect(ch2.data.phaseAlignment).toContain('Phase 1')
    expect(ch2.data.progressCheck).toContain('当前第2章')
  })

  it('单章无分隔符时也应正确解析', () => {
    const results = parseChapterOutlinesText(SIMPLE_OUTPUT)
    expect(results).toHaveLength(1)
    expect(results[0].chapterTitle).toContain('初入江湖')
  })

  it('空输入应返回空数组', () => {
    expect(parseChapterOutlinesText('')).toEqual([])
    expect(parseChapterOutlinesText('   ')).toEqual([])
  })

  it('应正确去除 markdown 代码块', () => {
    const withCodeBlock = '```markdown\n' + SIMPLE_OUTPUT + '\n```'
    const results = parseChapterOutlinesText(withCodeBlock)
    expect(results).toHaveLength(1)
    expect(results[0].chapterTitle).toContain('初入江湖')
  })

  it('解析后的数据应满足核心字段要求', () => {
    const results = parseChapterOutlinesText(MOCK_AI_OUTPUT)
    for (const r of results) {
      expect(r.chapterTitle.length).toBeGreaterThan(0)
      const hasCore = r.data.chapterType || r.data.coreScene
        || r.data.act1_entryAndCrisis || r.data.act2_conflictEscalation
        || r.data.act3_keyBreakthrough || r.data.act4_aftermathAndCost
        || r.data.goldenHook || r.data.characters
      expect(hasCore).toBeTruthy()
    }
  })

  it('应正确处理 markdown 标题格式（# 第N章：标题）', () => {
    const mdOutput = `# 第1章：废柴的自我修养
类型：冲突升级
字数限制：3000

出场角色：苏棠，苏家二叔
核心场景：苏家主厅
时间跨度：下午两点至三点半
核心爽点：苏棠被赶出家族时内心疯狂吐槽
底层博弈：二叔急于巩固权力
本章收益：苏棠确认情绪感知能力

起·切入与危机：苏棠被召到主厅
承·冲突升级：二叔当众宣布逐出决定
转·关键破局：苏棠感知到二叔内心的恐惧
合·余波与代价：苏棠离开苏家

黄金钩子：苏棠在门外感知到了一缕特殊的善意
钩子类型：信息钩

---

## 第2章：神经病聚集地
类型：过渡
字数限制：3000

出场角色：苏棠，杂务堂管事
核心场景：青霄宗山门
时间跨度：三天后
核心爽点：苏棠用情绪感知玩转人际关系

起·切入与危机：苏棠来到青霄宗
承·冲突升级：被分到最差的杂役区
转·关键破局：发现杂役区是个宝藏
合·余波与代价：安顿下来

黄金钩子：隔壁传来暴怒的吼声
钩子类型：危机钩`

    const results = parseChapterOutlinesText(mdOutput)
    expect(results).toHaveLength(2)
    expect(results[0].chapterTitle).toContain('废柴的自我修养')
    expect(results[0].data.chapterType).toBe('冲突升级')
    expect(results[0].data.characters).toBe('苏棠，苏家二叔')
    expect(results[1].chapterTitle).toContain('神经病聚集地')
    expect(results[1].data.chapterType).toBe('过渡')
  })
})
