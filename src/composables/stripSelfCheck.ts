/** 剥离 LLM 输出中的自查清单，仅保留正文。
 * 处理单章、开篇多章拼接、follow-up 追问追加等场景。 */
export function stripSelfCheck(text: string): string {
  // 匹配 LLM 可能输出的各种 --- 分隔符格式
  const parts = text.split(/\n+---\n+/)
  let result = parts[0]
  for (let i = 1; i < parts.length; i++) {
    const isChecklist = /\[[ x✓✔✗]\s*\]/.test(parts[i])
      || /^[\s　]*(自查|自检|检查清单|输出前|本章.?自)/.test(parts[i])
    if (isChecklist) {
      const nextBreak = parts[i].indexOf('\n\n')
      if (nextBreak >= 0) {
        result += '\n\n' + parts[i].slice(nextBreak).trim()
      }
    } else {
      result += '\n\n---\n' + parts[i]
    }
  }
  result = result.replace(/\n*#{1,3}\s*(输出前自检|自查清单|自检结果|本章.?自).*(\n|$)/g, '\n')
  return result.trim()
}
