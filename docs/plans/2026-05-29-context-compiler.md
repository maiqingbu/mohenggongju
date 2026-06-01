# 上下文编译引擎 + 写后校验 实现计划

> **For Hermes:** 按任务顺序逐项实现，每项完成后 commit。

**Goal:** 在 NovelStudio 中实现类 inkos 的上下文编译引擎和写后校验器，解决长篇小说越往后 AI 越容易"失忆"的问题。

**Architecture:** 新增三个 composable：`useContextCompiler`(上下文检索+组装)、`postWriteValidator`(硬规则校验)、`tokenBudget`(Token估算+截断)，并集成到 AiModal.doGenerate 中。

**Tech Stack:** TypeScript + Vue3 composables，纯逻辑层，不涉及 UI 改动。

---

## 任务 1：创建 Token 预算计算器

**Objective:** 实现简洁的 token/token 估算和头尾截断策略

**Files:**
- Create: `src/composables/tokenBudget.ts`

**Step 1: 写实现**

```typescript
/**
 * Token 预算计算器
 * 对标 inkos 的 capContextBlock + plotbunni 的 tokenCount
 */

/** 粗略 token 估算：中文每字 ≈1.5 token，英文每词 ≈1.3 token，标点 ≈1 token */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  const others = text.replace(/[\u4e00-\u9fffa-zA-Z\s]/g, '').length
  return Math.ceil(chineseChars * 1.5 + englishWords * 1.3 + others)
}

export interface TokenBudget {
  contextLength: number       // 模型上下文窗口
  maxOutputTokens: number     // 预留输出
  systemPromptTokens: number  // 系统提示词用量
  availableForContext: number // 上下文可用
  currentContextTokens: number // 当前上下文用量
  remaining: number           // 剩余额度
  needsTruncation: boolean    // 是否需要截断
}

/** 计算 token 预算 */
export function calculateBudget(params: {
  contextLength: number
  maxOutputTokens: number
  systemPrompt: string
  context: string
  safetyBuffer?: number
}): TokenBudget {
  const safety = params.safetyBuffer ?? 200
  const systemPromptTokens = estimateTokens(params.systemPrompt)
  const availableForContext = params.contextLength - params.maxOutputTokens - systemPromptTokens - safety
  const currentContextTokens = estimateTokens(params.context)
  const remaining = availableForContext - currentContextTokens
  return {
    contextLength: params.contextLength,
    maxOutputTokens: params.maxOutputTokens,
    systemPromptTokens,
    availableForContext,
    currentContextTokens,
    remaining,
    needsTruncation: remaining < 0,
  }
}

/**
 * 头尾保留式截断 — 对标 inkos capContextBlock
 * 保留开头 40% + 末尾 60%，中间省略并声明
 */
export function truncateHeadTail(
  text: string,
  maxTokens: number,
  label: string = '上下文',
): { truncated: string; omitted: number } {
  const currentTokens = estimateTokens(text)
  if (currentTokens <= maxTokens) return { truncated: text, omitted: 0 }

  const omitted = currentTokens - maxTokens
  const headRatio = 0.4
  const note = `\n\n[上下文预算限制：${label}省略了约 ${omitted} tokens；保留了开头和最新尾部]\n\n`
  const noteTokens = estimateTokens(note)

  const keepTokens = maxTokens - noteTokens
  const headTokens = Math.floor(keepTokens * headRatio)
  const tailTokens = keepTokens - headTokens

  // 按 token 比例估算字符数（近似）
  const totalChars = text.length
  const headChars = Math.floor(totalChars * (headTokens / currentTokens))
  const tailChars = Math.floor(totalChars * (tailTokens / currentTokens))

  return {
    truncated: text.slice(0, headChars) + note + text.slice(-tailChars),
    omitted,
  }
}
```

**Step 2: Commit**

```bash
git add src/composables/tokenBudget.ts
git commit -m "feat: add token budget calculator with head-tail truncation"
```

---

## 任务 2：创建上下文编译器

**Objective:** 从章节大纲结构化数据 + 作品状态中检索并组装最小必要上下文

**Files:**
- Create: `src/composables/useContextCompiler.ts`

**Step 1: 写核心接口和关键词提取**

```typescript
/**
 * 上下文编译器 — 对标 inkos Composer + MemoryRetrieval
 * 输入：章纲结构化数据 + 作品全局状态
 * 输出：精简的上下文字符串，随章节数增长自动控制体积
 */

import type { ChapterOutlineStructured } from './useOutlines'
import { estimateTokens, calculateBudget, truncateHeadTail } from './tokenBudget'

export interface NovelState {
  title: string
  genre: string
  style: string
  summary: string
  targetWordCount: number
  wordsPerChapter: number
  currentChapter: number
  // 从 workStore 提取的关键数据
  characters: CharacterSnapshot[]
  foreshadowings: ForeshadowingSnapshot[]
  recentChapters: ChapterSnapshot[]
  worldSettings: WorldSettingSnapshot[]
  volumeOutlines: string[]
}

export interface CharacterSnapshot {
  name: string
  category?: string
  status?: string       // alive / dead / missing
  location?: string
  mood?: string
  goal?: string
  lastAppearedChapter?: number
}

export interface ForeshadowingSnapshot {
  id: string
  name: string
  status: string        // open / progressing / resolved
  plantedChapter: number
  expectedChapter?: number
  secret?: string
  silenceChapters: number  // 距离上次推进已过多少章
}

export interface ChapterSnapshot {
  chapterNumber: number
  title: string
  summary: string       // 前300字
  mood?: string
  chapterType?: string
  endingLine?: string   // 最后一句（防结尾重复）
}

export interface WorldSettingSnapshot {
  name: string
  category?: string
  description: string
}

export interface CompiledContext {
  systemContext: string     // 注入 system prompt 的部分
  tokenUsage: {
    estimated: number
    budget: number
    truncated: boolean
  }
}

/** 从章纲 goal/mustKeep 中提取中英文关键词（对标 inkos extractQueryTerms） */
function extractKeywords(chapterOutline: ChapterOutlineStructured): string[] {
  const stopWords = new Set([
    '本章', '继续', '推进', '优先', '围绕', '聚焦', '保持', '本章重点',
    'bring', 'focus', 'chapter', 'keep', 'must', 'avoid', 'without',
  ])

  const source = [
    chapterOutline.coreCoolPoint,
    chapterOutline.underlyingGame,
    chapterOutline.chapterGains,
    chapterOutline.act3_keyBreakthrough,
  ].filter(Boolean).join(' ')

  // 提取中文双字及以上词组
  const chinese = (source.match(/[\u4e00-\u9fff]{2,4}/g) || [])
    .filter((t) => !stopWords.has(t))
    .slice(0, 8)

  // 提取英文 4 字母以上单词
  const english = (source.match(/[a-z]{4,}/gi) || [])
    .filter((t) => !stopWords.has(t.toLowerCase()))
    .slice(0, 4)

  return [...new Set([...chinese, ...english])]
}

/** 关键词匹配打分 */
function scoreByKeywords(text: string, keywords: string[]): number {
  return keywords.reduce((score, kw) => {
    return score + (text.includes(kw) ? kw.length : 0)
  }, 0)
}

/** 选择相关角色（最多5个） */
function selectRelevantCharacters(
  characters: CharacterSnapshot[],
  keywords: string[],
  currentChapter: number,
): CharacterSnapshot[] {
  const scored = characters
    .filter((c) => c.lastAppearedChapter == null || currentChapter - c.lastAppearedChapter <= 20)
    .map((c) => ({
      char: c,
      score: scoreByKeywords(
        [c.name, c.location || '', c.goal || '', c.status || ''].join(' '),
        keywords,
      ),
    }))

  // 优先取关键词命中的，再补最近出场的
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  const recent = scored.sort((a, b) => (b.char.lastAppearedChapter || 0) - (a.char.lastAppearedChapter || 0))

  const selected = new Set<CharacterSnapshot>()
  for (const { char } of [...matched, ...recent]) {
    if (selected.size >= 5) break
    selected.add(char)
  }
  return [...selected]
}

/** 选择相关伏笔（最多6条）
 *  对标 inkos selectRelevantHooks — 关键词命中的优先，再加最沉默的 */
function selectRelevantHooks(
  hooks: ForeshadowingSnapshot[],
  keywords: string[],
): ForeshadowingSnapshot[] {
  const active = hooks.filter((h) => h.status !== 'resolved' && h.status !== '已回收')
  const scored = active.map((h) => ({
    hook: h,
    score: scoreByKeywords(
      [h.name, h.secret || ''].join(' '),
      keywords,
    ),
    silence: h.silenceChapters,
  }))

  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  const stale = scored
    .filter((s) => !matched.includes(s))
    .filter((s) => s.silence >= 8) // 静默 8 章以上需要关注
    .sort((a, b) => b.silence - a.silence)

  const selected = new Set<ForeshadowingSnapshot>()
  for (const { hook } of [...matched, ...stale]) {
    if (selected.size >= 6) break
    selected.add(hook)
  }
  return [...selected]
}
```

**Step 2: 写主编译函数**

```typescript
/** 主入口：编译本章所需的上下文 */
export function compileChapterContext(params: {
  chapterOutline: ChapterOutlineStructured
  novelState: NovelState
  modelContextLength?: number
  modelMaxOutputTokens?: number
  systemPrompt: string
  extraContext?: string        // 用户手动添加的补充上下文
}): CompiledContext {
  const {
    chapterOutline,
    novelState,
    modelContextLength = 65536,   // 默认 DeepSeek 64K
    modelMaxOutputTokens = 4096,
    systemPrompt,
    extraContext,
  } = params

  const keywords = extractKeywords(chapterOutline)
  const { currentChapter } = novelState

  // 1. 选择相关角色（最多5个）
  const relevantChars = selectRelevantCharacters(
    novelState.characters,
    keywords,
    currentChapter,
  )

  // 2. 选择相关伏笔（最多6条）
  const relevantHooks = selectRelevantHooks(
    novelState.foreshadowings,
    keywords,
  )

  // 3. 最近章节（最近5章摘要）
  const recentChapters = novelState.recentChapters.slice(-5)

  // 4. Phase 位置信息
  const phaseInfo = buildPhaseInfo(chapterOutline)

  // 5. 组装上下文
  let context = ''

  // 5a. 作品基础信息
  context += `【作品信息】\n`
  context += `书名：${novelState.title}\n`
  context += `类型：${novelState.genre} | 文风：${novelState.style}\n`
  if (novelState.summary) context += `简介：${novelState.summary}\n`
  context += `目标字数：${novelState.targetWordCount} | 每章字数：${novelState.wordsPerChapter}\n`
  context += `当前第 ${currentChapter} 章\n\n`

  // 5b. Phase 位置
  context += `【Phase 位置】\n${phaseInfo}\n\n`

  // 5c. 本章目标
  context += `【本章目标】\n`
  context += `标题：${chapterOutline.chapterTitle}\n`
  context += `类型：${chapterOutline.chapterType}\n`
  context += `核心爽点：${chapterOutline.coreCoolPoint}\n`
  context += `字数限制：${chapterOutline.wordLimit}\n\n`

  // 5d. 出场角色（精简版）
  if (relevantChars.length > 0) {
    context += `【本章相关角色】\n`
    for (const c of relevantChars) {
      const parts = [c.name]
      if (c.location) parts.push(`位置:${c.location}`)
      if (c.mood) parts.push(`情绪:${c.mood}`)
      if (c.goal) parts.push(`目标:${c.goal}`)
      if (c.lastAppearedChapter) parts.push(`上次出场:第${c.lastAppearedChapter}章`)
      context += `- ${parts.join(' | ')}\n`
    }
    context += '\n'
  }

  // 5e. 活跃伏笔（只显示相关的）
  if (relevantHooks.length > 0) {
    context += `【待推进伏笔】\n`
    for (const h of relevantHooks) {
      const icon = h.silenceChapters >= 10 ? '🔴' : h.silenceChapters >= 5 ? '🟡' : '🟢'
      context += `${icon} ${h.name} (静默${h.silenceChapters}章)`
      if (h.secret) context += ` → ${h.secret}`
      context += '\n'
    }
    context += '\n'
  }

  // 5f. 最近章节摘要
  if (recentChapters.length > 0) {
    context += `【最近章节回顾】\n`
    for (const ch of recentChapters) {
      context += `第${ch.chapterNumber}章 ${ch.title}: ${ch.summary.slice(0, 200)}\n`
      if (ch.endingLine) context += `  结尾: ${ch.endingLine}\n`
    }
    context += '\n'
  }

  // 5g. 起承转合
  context += `【剧情推演参考】\n`
  context += `起: ${chapterOutline.act1_entryAndCrisis}\n`
  context += `承: ${chapterOutline.act2_conflictEscalation}\n`
  context += `转: ${chapterOutline.act3_keyBreakthrough}\n`
  context += `合: ${chapterOutline.act4_aftermathAndCost}\n`
  context += `钩子: ${chapterOutline.goldenHook}\n\n`

  // 6. Token 预算检查
  const budget = calculateBudget({
    contextLength: modelContextLength,
    maxOutputTokens: modelMaxOutputTokens,
    systemPrompt,
    context,
  })

  // 7. 超预算则截断（优先裁最近章节回顾的正文）
  if (budget.needsTruncation) {
    const { truncated } = truncateHeadTail(context, budget.availableForContext, '章节编译上下文')
    context = truncated
  }

  return {
    systemContext: context,
    tokenUsage: {
      estimated: budget.currentContextTokens,
      budget: budget.availableForContext,
      truncated: budget.needsTruncation,
    },
  }
}

function buildPhaseInfo(outline: ChapterOutlineStructured): string {
  const parts = [`Phase 对齐：${outline.phaseAlignment}`]
  if (outline.progressCheck) parts.push(`进度自检：${outline.progressCheck}`)
  return parts.join('\n')
}

/**
 * 从 workStore 提取 NovelState（供 AiModal 调用）
 * 这个函数在 AiModal 的 buildResolverCtx 中调用
 */
export function extractNovelState(workStore: any, outlines?: Map<string, string>): NovelState {
  const ws = workStore
  const w = ws?.currentWork
  const settings = ws?.workspaceSettings

  // 提取角色快照
  const characters: CharacterSnapshot[] = (w?.characters || []).map((c: any) => ({
    name: c.name || '',
    category: c.structuredData?.category || c.category,
    status: c.state?.status || c.structuredData?.state?.status || 'alive',
    location: c.state?.location || c.structuredData?.location,
    mood: c.state?.mood,
    goal: c.state?.goal,
    lastAppearedChapter: c.lastAppearedChapter || c.structuredData?.lastAppearedChapter,
  }))

  // 提取伏笔快照
  const foreshadowings: ForeshadowingSnapshot[] = (w?.foreshadowings || []).map((f: any, i: number) => ({
    id: f.id || `hook-${i}`,
    name: f.name || '',
    status: f.status || 'open',
    plantedChapter: f.structuredData?.plantedChapter || f.plantedChapter || 1,
    expectedChapter: f.structuredData?.expectedChapter,
    secret: f.structuredData?.secret || f.secret,
    silenceChapters: (settings?.currentChapter || 1) - (f.lastPushedChapter || f.plantedChapter || 1),
  }))

  // 提取最近章节摘要
  const allChapters: any[] = []
  for (const chs of Object.values(w?.chapterMap || {}) as any[]) {
    allChapters.push(...(chs as any[]))
  }
  allChapters.sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0))

  const recentChapters: ChapterSnapshot[] = allChapters.slice(0, 5).map((c: any) => ({
    chapterNumber: (c.sort_order || 0) + 1,
    title: c.title || '',
    summary: (c.content || '').slice(0, 300),
    mood: c.mood || c.structuredData?.mood,
    chapterType: c.chapterType || c.structuredData?.chapterType,
    endingLine: extractEndingLine(c.content || ''),
  })).reverse()

  // 提取世界观快照
  const worldSettings: WorldSettingSnapshot[] = (w?.worldSettings || []).map((ws2: any) => ({
    name: ws2.name || '',
    category: ws2.structuredData?.category,
    description: ws2.raw_text || ws2.desc || '',
  }))

  // 提取卷纲
  const volumeOutlines: string[] = []
  if (outlines) {
    for (const [key, content] of outlines) {
      if (key.startsWith('volume_')) volumeOutlines.push(content)
    }
  }

  return {
    title: w?.title || '',
    genre: settings?.genre || '',
    style: settings?.style || '',
    summary: settings?.summary || '',
    targetWordCount: settings?.targetWordCount || 1000000,
    wordsPerChapter: settings?.wordsPerChapter || 2500,
    currentChapter: allChapters.length + 1,
    characters,
    foreshadowings,
    recentChapters,
    worldSettings,
    volumeOutlines,
  }
}

function extractEndingLine(content: string): string | undefined {
  const lines = content.split('\n').map((l) => l.trim()).filter(
    (l) => l.length > 5 && !l.startsWith('#') && !l.startsWith('|'),
  )
  const last = lines.at(-1)
  return last && last.length > 60 ? last.slice(0, 57) + '...' : last
}
```

**Step 3: Commit**

```bash
git add src/composables/useContextCompiler.ts
git commit -m "feat: add context compiler with keyword retrieval and budget control"
```

---

## 任务 3：创建写后校验器

**Objective:** AI 产出后自动检查硬规则 — 对标 inkos PostWriteValidator

**Files:**
- Create: `src/composables/postWriteValidator.ts`

**Step 1: 写实现**

```typescript
/**
 * 写后校验器 — 对标 inkos PostWriteValidator
 * AI 产出正文后自动执行硬规则检查
 */

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  rule: string
  description: string
  suggestion: string
}

export interface ValidationResult {
  passed: boolean
  issues: ValidationIssue[]
  wordCount: number
  chapterWordTarget: number
}

interface ValidationParams {
  content: string                    // AI 产出正文
  chapterTitle: string               // 本章标题
  existingTitles: string[]           // 已有章节标题（防重复）
  wordTarget: number                 // 本章字数目标
  previousEndingLines: string[]      // 最近几章的末尾句（防结尾同构）
  hookChecks: {
    committedHooks: string[]         // 章纲中承诺推进的伏笔名
    content: string                  // 正文内容
  }[]
  avoidPhrases?: string[]            // 要避免的短语（如作品级别的避免项）
}

/**
 * 主校验函数
 */
export function validatePostWrite(params: ValidationParams): ValidationResult {
  const issues: ValidationIssue[] = []

  // 规则 1：空内容检查
  if (!params.content || params.content.trim().length < 50) {
    issues.push({
      severity: 'error',
      rule: '空内容',
      description: 'AI 产出正文不足 50 字符，可能是生成失败',
      suggestion: '重试生成，或检查模型配置',
    })
    return { passed: false, issues, wordCount: 0, chapterWordTarget: params.wordTarget }
  }

  // 规则 2：标题重复检查（对标 inkos resolveDuplicateTitle）
  const normalizedTitle = params.chapterTitle.replace(/^第[0-9零一二三四五六七八九十百千]+章[:：\s]*/, '').trim()
  const duplicateTitle = params.existingTitles.some((t) => {
    const nt = t.replace(/^第[0-9零一二三四五六七八九十百千]+章[:：\s]*/, '').trim()
    return nt === normalizedTitle
  })
  if (duplicateTitle) {
    issues.push({
      severity: 'warning',
      rule: '标题重复',
      description: `章节标题 "${params.chapterTitle}" 与已有章节重复`,
      suggestion: '手动修改标题，避免读者混淆',
    })
  }

  // 规则 3：字数检查
  const chineseChars = (params.content.match(/[\u4e00-\u9fff]/g) || []).length
  const totalLen = params.content.length
  const estimatedWords = chineseChars  // 中文以字数为准

  if (estimatedWords < params.wordTarget * 0.5) {
    issues.push({
      severity: 'warning',
      rule: '字数不足',
      description: `正文约 ${estimatedWords} 字，不足目标 ${params.wordTarget} 字的 50%`,
      suggestion: '可尝试用「扩充」功能补充内容',
    })
  }

  if (estimatedWords > params.wordTarget * 1.5) {
    issues.push({
      severity: 'info',
      rule: '字数超出',
      description: `正文约 ${estimatedWords} 字，超出目标 ${params.wordTarget} 字的 50%`,
      suggestion: '可手动删减或使用「压缩」功能',
    })
  }

  // 规则 4：结尾同构检查（对标 inkos buildRecentEndingTrail）
  const thisEnding = extractLastSentence(params.content)
  if (thisEnding && params.previousEndingLines.length > 0) {
    const similarEndings = params.previousEndingLines.filter((ending) => {
      return textSimilarity(thisEnding, ending) > 0.6
    })
    if (similarEndings.length >= 2) {
      issues.push({
        severity: 'warning',
        rule: '结尾同构',
        description: `本章结尾与最近 ${similarEndings.length} 章高度相似`,
        suggestion: '修改结尾句式，避免读者审美疲劳',
      })
    }
  }

  // 规则 5：伏笔推进检查
  for (const hc of params.hookChecks) {
    for (const hookName of hc.committedHooks) {
      if (!hc.content.includes(hookName)) {
        issues.push({
          severity: 'warning',
          rule: '伏笔遗漏',
          description: `章纲承诺推进伏笔「${hookName}」，但正文未提及`,
          suggestion: '手动在正文中补充伏笔推进的描写',
        })
      }
    }
  }

  // 规则 6：避免项检查
  if (params.avoidPhrases && params.avoidPhrases.length > 0) {
    for (const phrase of params.avoidPhrases) {
      if (params.content.includes(phrase)) {
        issues.push({
          severity: 'warning',
          rule: '避免项',
          description: `正文中出现应避免的短语：「${phrase}」`,
          suggestion: '修改或删除该段文字',
        })
      }
    }
  }

  // 规则 7：套话密度检查（对标 inkos 套话密度维度）
  const cliches = [
    '不知过了多久', '与此同时', '就在这时', '突然', '忽然', '猛地',
    '只见', '只听得', '心中一凛', '眉头一皱', '嘴角勾起', '眼中闪过',
    '深吸一口气', '冷笑一声', '沉声说道', '缓缓开口', '淡淡地说道',
  ]
  const clicheCount = cliches.reduce((count, cliche) => {
    return count + (params.content.split(cliche).length - 1)
  }, 0)
  if (clicheCount > 5) {
    issues.push({
      severity: 'info',
      rule: '套话密度',
      description: `正文中出现 ${clicheCount} 处常见套话`,
      suggestion: '适当替换为更有画面感的原创表达',
    })
  }

  const errors = issues.filter((i) => i.severity === 'error')
  return {
    passed: errors.length === 0,
    issues,
    wordCount: estimatedWords,
    chapterWordTarget: params.wordTarget,
  }
}

/** 提取正文最后一句有意义的句子 */
function extractLastSentence(content: string): string | undefined {
  const lines = content.split('\n').map((l) => l.trim()).filter(
    (l) => l.length > 5 && !l.startsWith('#') && !l.startsWith('|'),
  )
  const last = lines.at(-1)
  return last && last.length > 60 ? last.slice(0, 57) + '...' : last
}

/** 简单的文本相似度（基于字符重叠率） */
function textSimilarity(a: string, b: string): number {
  const setA = new Set(a.replace(/\s/g, ''))
  const setB = new Set(b.replace(/\s/g, ''))
  if (setA.size === 0 || setB.size === 0) return 0
  let overlap = 0
  for (const char of setA) {
    if (setB.has(char)) overlap++
  }
  return overlap / Math.max(setA.size, setB.size)
}
```

**Step 2: Commit**

```bash
git add src/composables/postWriteValidator.ts
git commit -m "feat: add post-write validator with 7 hard rule checks"
```

---

## 任务 4：集成到 AiModal.doGenerate

**Objective:** 在 AiModal 中使用上下文编译器替代当前的 context dump，并添加写后校验提示

**Files:**
- Modify: `src/components/AiModal.vue`

**Step 1: 添加 import 和集成编译上下文**

在 AiModal.vue 顶部添加：

```typescript
import { compileChapterContext, extractNovelState } from '../composables/useContextCompiler'
import { validatePostWrite } from '../composables/postWriteValidator'
```

**Step 2: 修改 buildResolverCtx，在 doGenerate 中使用编译器**

在 `doGenContinue` 中（line ~1907），替换原来的 context injection 逻辑：

```typescript
// 原代码（约 1907-1917）：
// try {
//   const resolverCtx = await buildResolverCtx()
//   const ctxInjection = await resolveContextInjection(resolverCtx)
//   let fullSystemPrompt = '你是专业的小说AI助手。\n\n' + COMPACT_CONSTITUTION + '\n\n---\n\n' + systemPrompt.value
//   if (ctxInjection) fullSystemPrompt += '\n\n## 上下文参考数据\n...' + ctxInjection
//   ...

// 新逻辑：如果是正文写作（opening/continue/章节范围），使用智能编译
const isBodyWriting = props.field === 'opening' || props.field === 'continue' || props.mode === 'chapterRange'
if (isBodyWriting) {
  // 需要章纲结构化数据才能编译
  const chapterOutline = getCurrentChapterOutline()  // 从 outline 数据中提取
  if (chapterOutline) {
    const workStore = useWorkStore()
    const novelState = extractNovelState(workStore, loadedOutlines.value)
    const compiled = compileChapterContext({
      chapterOutline,
      novelState,
      systemPrompt: COMPACT_CONSTITUTION,
      extraContext: extra.value,
    })
    fullSystemPrompt = '你是专业的小说AI助手。\n\n' + COMPACT_CONSTITUTION
    fullSystemPrompt += '\n\n## 上下文参考数据\n' + compiled.systemContext
    if (compiled.tokenUsage.truncated) {
      msg.info(`上下文已自动精简（预算 ${compiled.tokenUsage.budget} tokens）`)
    }
  } else {
    // fallback: 没有结构化章纲就用原来的方式
    // ... 保留原逻辑
  }
}
```

**Step 3: 添加写后校验**

在 `onDone` 回调中（generate 完成后），添加校验：

```typescript
generate(...).then(() => {
  // 原有的 onDone 逻辑 ...
  
  // 新增：写后校验
  if (isBodyWriting && output.value) {
    const allTitles = getAllChapterTitles()
    const last3Endings = getLast3ChapterEndings()
    const validation = validatePostWrite({
      content: output.value,
      chapterTitle: currentTitle,
      existingTitles: allTitles,
      wordTarget: wsData.value?.wordsPerChapter || 2500,
      previousEndingLines: last3Endings,
      hookChecks: [],  // TODO: 从章纲中提取伏笔承诺
      avoidPhrases: [],
    })
    if (!validation.passed || validation.issues.length > 0) {
      showValidationToast(validation)
    }
  }
})
```

**Step 4: 添加校验结果提示 UI**

```typescript
function showValidationToast(result: ValidationResult) {
  const warnings = result.issues.filter((i) => i.severity !== 'info')
  if (warnings.length === 0) return
  msg.warning(
    `写后校验发现 ${warnings.length} 个问题：\n${warnings.map((w) => `• ${w.description}`).join('\n')}`,
    { duration: 8000 }
  )
}
```

**Step 5: Commit**

```bash
git add src/components/AiModal.vue
git commit -m "feat: integrate context compiler and post-write validator into AiModal"
```

---

## 验证方式

写完所有代码后：

1. `npm run typecheck` — 确保 TypeScript 无错误
2. `npm run dev` — 启动，打开一个已有章纲的小说
3. 在 AiModal 中点击生成正文，观察：
   - 控制台输出 token 预算信息
   - 生成完成后是否有写后校验提示
4. 检查长篇小说（20章以上）的生成 — 上下文是否被精简

---
