/**
 * 卷边界检测 Agent
 *
 * 在全自动续写模式下，检测当前卷是否写完，以及下一卷的卷纲、章纲是否就绪。
 * 如果缺失，返回缺失项供 runner 推送审批卡片或自动暂停。
 */

import type { AgentSpec } from '../types'

export function createVolumeBoundaryCheckAgent(): AgentSpec {
  return {
    id: 'volume_boundary_check',
    name: '卷边界检测',
    badge: '系统',
    desc: '检测当前卷是否写完，下一卷大纲是否就绪',
    requiredContext: [],
    systemPrompt: '',

    parseOutput(rawText: string) {
      try { return JSON.parse(rawText) } catch { return { raw: rawText } }
    },

    async writeBack(_parsed, _ctx) {
      // 只读检测，不写入
    },

    // 本地执行：不调 LLM，直接检测卷边界
    async localExecute(inputs, ctx) {
      const currentVolumeId = parseInt(String(inputs.currentVolumeId || '0'))
      const currentVolumeChapterCount = parseInt(String(inputs.currentVolumeChapterCount || '0'))
      const totalVolumes = parseInt(String(inputs.totalVolumes || '1'))
      const workId = (ctx?.workId as number) || 1

      console.log(`[volumeBoundaryCheck] 检测卷边界:`, {
        currentVolumeId,
        currentVolumeChapterCount,
        totalVolumes,
        workId,
      })

      const missing: Array<{ type: string; field: string; label: string; autoGeneratable: boolean }> = []

      // 检测下一卷是否存在
      if (totalVolumes <= 1) {
        // 只有一卷，不需要检测下一卷
        return JSON.stringify({
          ready: true,
          missing: [],
          message: '✅ 单卷作品，无需检测下一卷',
        })
      }

      // 检测下一卷的卷纲
      const { useWorkRepo } = await import('../../composables/useWorkRepo')
      const { getOutline } = await import('../../composables/useOutlines')
      const repo = useWorkRepo()
      const volumes = repo.volumes.value.filter((v: any) => v.work_id === workId)

      // 找到当前卷的索引
      const currentVolumeIndex = volumes.findIndex((v: any) => v.id === currentVolumeId)
      if (currentVolumeIndex === -1) {
        return JSON.stringify({
          ready: false,
          missing: [{ type: 'error', field: 'volume', label: '未找到当前卷', autoGeneratable: false }],
          message: '❌ 未找到当前卷信息',
        })
      }

      // 检测下一卷是否存在
      const nextVolumeIndex = currentVolumeIndex + 1
      if (nextVolumeIndex >= volumes.length) {
        // 没有下一卷，可能是最后一卷
        return JSON.stringify({
          ready: true,
          missing: [],
          message: '✅ 当前卷已是最后一卷',
        })
      }

      const nextVolume = volumes[nextVolumeIndex]

      // 检测下一卷的卷纲
      const nextVolumeOutline = await getOutline('volume', nextVolume.id)
      if (!nextVolumeOutline) {
        missing.push({
          type: 'outline',
          field: 'volume_outline',
          label: `第${nextVolumeIndex + 1}卷卷纲`,
          autoGeneratable: true,
        })
      }

      // 检测下一卷的章纲（至少前3章）
      const chapterMap = repo.chapterMap.value
      const nextVolumeChapters = chapterMap[nextVolume.id] || []
      const chaptersToCheck = nextVolumeChapters.slice(0, 3)

      for (const ch of chaptersToCheck) {
        const chapterOutline = await getOutline('chapter', ch.id)
        if (!chapterOutline) {
          missing.push({
            type: 'outline',
            field: 'chapter_outline',
            label: `第${nextVolumeIndex + 1}卷第${ch.sort_order + 1}章章纲`,
            autoGeneratable: true,
          })
        }
      }

      const result = {
        ready: missing.length === 0,
        missing,
        message: missing.length === 0
          ? `✅ 第${nextVolumeIndex + 1}卷大纲已就绪`
          : `❌ 第${nextVolumeIndex + 1}卷大纲缺失，需要先生成`,
        nextVolumeId: nextVolume.id,
        nextVolumeIndex: nextVolumeIndex + 1,
      }

      console.log(`[volumeBoundaryCheck] 检测结果:`, result)
      return JSON.stringify(result)
    },
  }
}
