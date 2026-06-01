/**
 * 压缩/扩展 Agent — LLM-based 字数调整
 *
 * 在 length_check 检测到偏差后，由 LLM 对正文执行定向压缩或扩展。
 * 遵循严格的文学编辑原则：删除冗余、保留冲击段、控制段落呼吸。
 *
 * approval: 'always'（用户始终审阅）
 * skippable: true
 */
import type { AgentSpec } from '../types'
import { scanStyleViolations } from '../filters/styleFilter'

export function createCompressExpandAgent(): AgentSpec {
  return {
    id: 'compress_expand',
    name: '字数调整',
    badge: '旗舰版',
    desc: '对超出/不足目标字数的章节执行压缩或扩展，保留文风和节奏',
    requiredContext: [],
    systemPrompt: `你是文学编辑。你的任务是调整章节字数到目标范围。

【铁律】字数偏差 ≤20% 时不做任何修改，原样输出原文。
当前章节信息将由用户消息提供（currentWords + targetWords + action）。

## 压缩原则（按优先级执行）
1. 情节点、关键决策、对话交锋、章末钩子 → 一字不动
2. 删除冗余心理描写：同一情绪只保留最锐利的一句
3. 合并重复信息，收紧过渡段
4. 删除环境纯描写中不带人物视角的部分
5. 收紧长句中的冗余修饰语和副词
6. 保留段落节奏呼吸：连续推进段后必须保留氛围/内省段
7. 保留所有冲击段（1-2句）不动
8. 保留长铺垫→短爆发结构完整

## 扩展原则（按优先级执行）
1. 氛围段：加1-2句带人物视角的环境细节
2. 内省段：在情绪转折处加一层心理递进
3. 对峙段：对话间隙插入身体动作/环境细节
4. 推进段之间加一句呼吸过渡
5. 禁止扩展：冲击段、章末钩子、自观句

## 输出格式
直接输出调整后的完整章节正文（不是摘要，不是改写说明，不要 JSON 包裹）。`,

    parseOutput(rawText: string) {
      const content = rawText.trim()
      // 编辑后重新扫描文风违规（零 token 成本），防止压缩/扩展引入新 AI 痕迹
      const violations = scanStyleViolations(content, 0)
      if (violations.length > 0) {
        console.log(`[compressExpand] 文风违规 ${violations.length} 项:`, violations.map(v => v.message))
      }
      return { content, warnings: violations }
    },

    async writeBack(_parsed, _ctx) {
      // 只读编辑，不单独写入数据层
      // compress_expand 产出由 commit_write 统一处理
    },
  }
}
