/**
 * useChapterAudit 独立审计系统 — 深度测试
 * 测试纯函数：formatAuditReport、审计维度、评分逻辑
 */
import { describe, it, expect } from 'vitest'
import { useChapterAudit, type AuditResult } from '../composables/useChapterAudit'

describe('useChapterAudit — formatAuditReport', () => {
  const { formatAuditReport } = useChapterAudit()

  it('通过审计应包含总分和通过标记', () => {
    const result: AuditResult = {
      passed: true,
      overallScore: 92,
      summary: '整体质量优秀，对话自然，段落节奏良好。',
      issues: [],
      dimensionScores: {
        '视角一致性': 95,
        '段落节奏': 88,
        '对话自然度': 93,
        '具象展示': 90,
        '套话密度': 94,
        '章末钩子': 91,
        '情绪表达': 89,
        '世界观呈现': 92,
      },
    }

    const report = formatAuditReport(result)
    expect(report).toContain('通过')
    expect(report).toContain('92')
    expect(report).toContain('100')
    expect(report).toContain('视角一致性')
  })

  it('未通过审计应包含失败标记', () => {
    const result: AuditResult = {
      passed: false,
      overallScore: 55,
      summary: '多个维度存在严重问题，需要大幅修改。',
      issues: [
        {
          severity: 'error',
          category: '段落节奏',
          description: '单句段占比达到 60%，严重超过 25% 上限',
          suggestion: '请合并相邻单句段为 2-5 句的完整段落',
        },
      ],
      dimensionScores: {
        '视角一致性': 70,
        '段落节奏': 35,
        '对话自然度': 60,
        '具象展示': 55,
        '套话密度': 50,
        '章末钩子': 65,
        '情绪表达': 48,
        '世界观呈现': 72,
      },
    }

    const report = formatAuditReport(result)
    expect(report).toContain('未通过')
    expect(report).toContain('55')
    expect(report).toContain('段落节奏')
    expect(report).toContain('单句段占比')
  })

  it('应格式化所有审计维度', () => {
    const result: AuditResult = {
      passed: true,
      overallScore: 80,
      summary: '合格。',
      issues: [],
      dimensionScores: {
        '视角一致性': 85,
        '段落节奏': 78,
        '对话自然度': 82,
        '具象展示': 76,
        '套话密度': 88,
        '章末钩子': 72,
        '情绪表达': 80,
        '世界观呈现': 84,
      },
    }

    const report = formatAuditReport(result)
    // 所有维度都应出现
    expect(report).toContain('视角一致性')
    expect(report).toContain('段落节奏')
    expect(report).toContain('对话自然度')
    expect(report).toContain('具象展示')
    expect(report).toContain('套话密度')
    expect(report).toContain('章末钩子')
    expect(report).toContain('情绪表达')
    expect(report).toContain('世界观呈现')
  })

  it('应渲染评分柱状条', () => {
    const result: AuditResult = {
      passed: true,
      overallScore: 85,
      summary: '合格。',
      issues: [],
      dimensionScores: {
        '视角一致性': 100,
        '段落节奏': 0,
        '对话自然度': 50,
        '具象展示': 85,
        '套话密度': 85,
        '章末钩子': 85,
        '情绪表达': 85,
        '世界观呈现': 85,
      },
    }

    const report = formatAuditReport(result)
    // 满分应显示 10 个 █
    expect(report).toContain('██████████')
    // 0 分应显示 10 个 ░
    expect(report).toContain('░░░░░░░░░░')
  })

  it('应列出 issues 及 severity', () => {
    const result: AuditResult = {
      passed: false,
      overallScore: 60,
      summary: '需改进。',
      issues: [
        { severity: 'error', category: '段落节奏', description: '问题A', suggestion: '建议A' },
        { severity: 'warning', category: '对话自然度', description: '问题B', suggestion: '建议B' },
        { severity: 'info', category: '具象展示', description: '问题C', suggestion: '建议C' },
      ],
      dimensionScores: {
        '视角一致性': 60, '段落节奏': 60, '对话自然度': 60,
        '具象展示': 60, '套话密度': 60, '章末钩子': 60,
        '情绪表达': 60, '世界观呈现': 60,
      },
    }

    const report = formatAuditReport(result)
    expect(report).toContain('问题A')
    expect(report).toContain('建议A')
    expect(report).toContain('问题B')
    expect(report).toContain('问题C')
  })

  it('空 issues 不应有"发现的问题"标题', () => {
    const result: AuditResult = {
      passed: true,
      overallScore: 90,
      summary: '优秀。',
      issues: [],
      dimensionScores: {
        '视角一致性': 90, '段落节奏': 90, '对话自然度': 90,
        '具象展示': 90, '套话密度': 90, '章末钩子': 90,
        '情绪表达': 90, '世界观呈现': 90,
      },
    }

    const report = formatAuditReport(result)
    expect(report).not.toContain('发现的问题')
  })
})

describe('useChapterAudit — 实例创建', () => {
  it('应返回所有需要的函数和状态', () => {
    const audit = useChapterAudit()
    expect(audit).toHaveProperty('generating')
    expect(audit).toHaveProperty('output')
    expect(audit).toHaveProperty('error')
    expect(audit).toHaveProperty('auditChapter')
    expect(audit).toHaveProperty('formatAuditReport')
    expect(audit).toHaveProperty('abort')
  })
})
