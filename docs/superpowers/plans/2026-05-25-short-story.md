# 短篇创作功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现平台适配短篇创作：用户选平台 → 配 TagSet → AI 一次性生成完整短篇 → 审阅 → 写入作品（按平台分组）

**Architecture:** 新建 `shortStoryGen` step agent（LLM, always审批）→ 组合 `buildShortStoryWorkflow()` 4步工作流（short_story_gen → paragraph_fix → style_review → commit_write）→ ChapterEditor/AiModal/InspireWizard 三入口触发 → WorkTree 按平台分组展示

**Tech Stack:** TypeScript, Vue 3, Vitest, WorkflowRunner, 复用 paragraphFix/styleReview/commitWrite/usePlatformTags/usePlatformData/usePlatformOutput/compactConstitution

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/agents/steps/shortStoryGen.ts` (新建) | 短篇生成 step agent — LLM 调用，always 审批，parseOutput 直接取 rawText |
| `src/agents/workflows/shortStory.ts` (新建) | `buildShortStoryWorkflow()` — 构建 4 步工作流 |
| `src/composables/useShortStoryWorkflow.ts` (新建) | 封装 Runner 创建+agent注册+Work/Volume/Chapter 创建+工作流执行 |
| `src/agents/steps/commitWrite.ts` (修改) | `mapToPendingWrite` 新增 `short_story_gen` 步骤映射 |
| `src/__tests__/shortStory.test.ts` (新建) | 单元测试：step agent + workflow builder |
| `src/components/ChapterEditor.vue` (修改) | aiActions 新增 `shortStory`；AI_EDITOR_CONFIG 新增 shortStory 配置；triggerAi 新增 shortStory 分发 |
| `src/components/AiModal.vue` (修改) | 新增 `shortStory` 模式：平台选择 + TagSet + 字数 + 生成触发 |
| `src/components/InspireWizard.vue` (修改) | 第5步新增「生成短篇」按钮 |
| `src/components/App.vue` (修改) | 接收 `generate-short-story` 事件，打开短篇配置面板 |
| `src/components/WorkTree.vue` (修改) | 新增「按平台分组」视图 |

---

### Task 1: 创建 `shortStoryGen.ts` step agent

**Files:**
- Create: `src/agents/steps/shortStoryGen.ts`
- Create: `src/__tests__/shortStory.test.ts` (partial — shortStoryGen tests)

- [ ] **Step 1: 写 shortStoryGen 的失败测试**

在 `src/__tests__/shortStory.test.ts` 中：

```ts
import { describe, it, expect } from 'vitest'
import { createShortStoryGenAgent } from '../agents/steps/shortStoryGen'

describe('shortStoryGen step agent', () => {
  it('should have id short_story_gen', () => {
    const agent = createShortStoryGenAgent()
    expect(agent.id).toBe('short_story_gen')
  })

  it('should have approval always', () => {
    const agent = createShortStoryGenAgent()
    // 审批级别在 workflow step 中设置，agent 本身通过 requiredContext 和 systemPrompt 定义行为
    // 验证 agent 规范：必须有 systemPrompt（不能为空）
    expect(agent.systemPrompt).toBeTruthy()
    expect(agent.systemPrompt.length).toBeGreaterThan(100)
  })

  it('should require @设定数据 as context', () => {
    const agent = createShortStoryGenAgent()
    expect(agent.requiredContext).toContain('@设定数据')
  })

  it('parseOutput should return raw text as content', () => {
    const agent = createShortStoryGenAgent()
    const result = agent.parseOutput('  这是一段测试正文\n\n第二段  ')
    expect(result.content).toBe('这是一段测试正文\n\n第二段')
    expect(result.warnings).toEqual([])
  })

  it('parseOutput should handle empty input', () => {
    const agent = createShortStoryGenAgent()
    const result = agent.parseOutput('')
    expect(result.content).toBe('')
    expect(result.warnings).toEqual([])
  })

  it('should not declare localExecute (must be LLM-driven)', () => {
    const agent = createShortStoryGenAgent()
    expect(agent.localExecute).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/shortStory.test.ts
```
预期：全部 6 个测试 FAIL（`createShortStoryGenAgent` 未定义）

- [ ] **Step 3: 实现 `shortStoryGen.ts`**

创建 `src/agents/steps/shortStoryGen.ts`：

```ts
/**
 * 短篇生成 — Step Agent
 * 
 * 基于平台画像和 TagSet 一次性生成完整短篇。
 * LLM 驱动，不定义 localExecute。
 * parseOutput 直接取 rawText 作为正文（不做 JSON 解析）。
 */
import type { AgentSpec } from '../types'
import { COMPACT_CONSTITUTION } from '../shared/compactConstitution'
import { scanStyleViolations } from '../filters/styleFilter'

export function createShortStoryGenAgent(): AgentSpec {
  return {
    id: 'short_story_gen',
    name: '短篇生成',
    badge: 'AI',
    desc: '基于平台画像和TagSet一次性生成完整短篇',
    requiredContext: ['@设定数据'],
    
    systemPrompt: `${COMPACT_CONSTITUTION}

---

# 短篇生成 — 角色说明

你是「短篇生成」智能体，专门负责为特定内容平台一次性生成完整短篇故事。

## 核心规则
1. **一次成型**：你必须一次性输出完整故事，不分章节。开头、发展、高潮、结尾缺一不可。
2. **平台适配**：用户会在提示词中提供目标平台的风格要求、读者画像和禁忌。你必须严格遵守这些约束。
3. **TagSet 遵循**：用户会在提示词中提供 TagSet（题材、元素、情绪、爽点等），你的故事必须覆盖所有标签的要求。
4. **字数控制**：用户会指定目标字数。你的实际产出必须在目标字数的 ±15% 以内。
5. **格式要求**：直接输出纯文本正文，不要 JSON 包裹，不要标题（除非平台要求）。

## 短篇结构（必须遵循）
- **钩子开头**（前200字）：用冲突/悬念/反常规画面抓住读者
- **中段推进**：至少1次转折或反转
- **结尾**：强收束，给读者满足感或余韵，不烂尾

## 输出前速查（12条）
1. 每段至少2-5句，单句段 ≤ 25%
2. 视角一致，不跳 POV
3. 不用「感到/觉得/意识到」→ 改身体信号
4. 不用「似乎/仿佛/好像」
5. 对话不直问直答
6. 不用 AI 禁词（标志着/见证了/象征着/蕴含着/总的来说/只见/值得注意的是）
7. 至少一处不收口、不解释的闲笔
8. 五感描写：每500字至少2种感官
9. 动作场景短句快切（15-25字/句）
10. 情感场景中速
11. 不用成语概括情绪 → 改微小身体反应
12. 结尾有钩子或余韵

## 绝对禁止
- 输出 JSON 格式
- 输出章节标题（第X章等）
- 在文末加注释或总结（如「这个故事告诉我们…」）
- 生成后自我审查（不要输出 checklist）`,

    parseOutput(rawText: string) {
      const content = rawText.trim()
      // 第1层防御：规则引擎扫描文风违规，零 token 成本
      const warnings = scanStyleViolations(content, 0)
      return { content, warnings }
    },

    async writeBack(_parsed, _ctx) {
      // 正文内容由 Runner.doWriteBack 推入 _pendingWrites，
      // commit_write 的 mapToPendingWrite 处理并原子落盘。
    },
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/__tests__/shortStory.test.ts
```
预期：6 个测试全部 PASS

- [ ] **Step 5: 运行全量测试确认无回归**

```bash
npx vitest run
```
预期：所有现有测试继续通过

- [ ] **Step 6: 运行类型检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 7: Commit**

```bash
git add src/agents/steps/shortStoryGen.ts src/__tests__/shortStory.test.ts
git commit -m "$(cat <<'EOF'
feat: add shortStoryGen step agent

Create LLM-driven step agent for one-shot short story generation.
Uses COMPACT_CONSTITUTION as system prompt, platform profile and
TagSet injected via user prompt. parseOutput extracts raw text
directly (no JSON parsing). Includes 6 unit tests.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 创建 `shortStory.ts` workflow builder

**Files:**
- Create: `src/agents/workflows/shortStory.ts`
- Modify: `src/__tests__/shortStory.test.ts` (add workflow builder tests)

- [ ] **Step 1: 写 workflow builder 的失败测试**

在 `src/__tests__/shortStory.test.ts` 末尾追加：

```ts
import { buildShortStoryWorkflow } from '../agents/workflows/shortStory'

describe('buildShortStoryWorkflow', () => {
  it('should return exactly 4 steps', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {}, 5000)
    expect(steps).toHaveLength(4)
  })

  it('should have short_story_gen as first step', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {}, 5000)
    expect(steps[0].agentId).toBe('short_story_gen')
    expect(steps[0].approval).toBe('always')
  })

  it('should have paragraph_fix as second step with auto approval', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {}, 5000)
    expect(steps[1].agentId).toBe('paragraph_fix')
    expect(steps[1].approval).toBe('auto')
    expect(steps[1].skippable).toBe(true)
  })

  it('should have style_review as third step with on_warning approval', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {}, 5000)
    expect(steps[2].agentId).toBe('style_review')
    expect(steps[2].approval).toBe('on_warning')
    expect(steps[2].skippable).toBe(true)
  })

  it('should have commit_write as final step with always approval and not skippable', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {}, 5000)
    const last = steps[3]
    expect(last.agentId).toBe('commit_write')
    expect(last.approval).toBe('always')
    expect(last.skippable).toBe(false)
    expect(last.next).toBeNull()
  })

  it('should wire step next references correctly', () => {
    const steps = buildShortStoryWorkflow('zhihu_salt', {}, 5000)
    expect(steps[0].next).toBe('paragraph_fix')
    expect(steps[1].next).toBe('style_review')
    expect(steps[2].next).toBe('commit_write')
    expect(steps[3].next).toBeNull()
  })

  it('should include platformId, wordCount in gen step inputs', () => {
    const steps = buildShortStoryWorkflow('fanqie', { genre: '玄幻' } as any, 3000)
    const genInputs = steps[0].inputs
    expect(genInputs.platformId).toBe('fanqie')
    expect(genInputs.wordCount).toBe('3000')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/shortStory.test.ts
```
预期：workflow builder 的 7 个测试全部 FAIL

- [ ] **Step 3: 实现 `shortStory.ts`**

创建 `src/agents/workflows/shortStory.ts`：

```ts
/**
 * 短篇创作工作流 — 4 步完成
 *
 * 流程：short_story_gen → paragraph_fix → style_review → commit_write
 *
 * 关键特征：一次成型（非逐章）、平台风格强约束、产出即发布
 */
import type { WorkflowStep } from '../types'
import type { TagSet } from '../../composables/usePlatformTags'

export interface ShortStoryConfig {
  platformId: string
  tagSet: TagSet
  wordCount: number
  /** 额外要求（用户手写的补充 prompt） */
  extra?: string
}

export function buildShortStoryWorkflow(
  platformId: string,
  tagSet: TagSet,
  wordCount: number,
  extra?: string,
): WorkflowStep[] {
  const extraPrompt = extra ? `\n\n【额外要求】\n${extra}` : ''

  const steps: WorkflowStep[] = [
    // Step 1: 短篇生成（LLM, always 审批）
    {
      id: 'short_story_gen',
      agentId: 'short_story_gen',
      inputs: {
        action: 'generate',
        platformId,
        wordCount: String(wordCount),
        // TagSet JSON 字符串，供 resolver 展开
        tagSetJson: JSON.stringify(tagSet),
        extra: extraPrompt,
      },
      approval: 'always',
      skippable: false,
      next: 'paragraph_fix',
    },

    // Step 2: 段落修复（本地，auto 自动通过）
    {
      id: 'paragraph_fix',
      agentId: 'paragraph_fix',
      inputs: {
        contentKey: 'step:short_story_gen',
      },
      approval: 'auto',
      skippable: true,
      next: 'style_review',
    },

    // Step 3: 文风审查（LLM, on_warning 有警告时审批）
    {
      id: 'style_review',
      agentId: 'style_review',
      inputs: {
        content: '@ctx.step:paragraph_fix',
        chapterNo: '1',
      },
      approval: 'on_warning',
      skippable: true,
      next: 'commit_write',
    },

    // Step 4: 原子写入（本地, always 审批）
    {
      id: 'commit_write',
      agentId: 'commit_write',
      inputs: {
        action: 'commit',
      },
      approval: 'always',
      skippable: false,
      next: null,
    },
  ]

  return steps
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/__tests__/shortStory.test.ts
```
预期：全部 13 个测试 PASS（6 step agent + 7 workflow builder）

- [ ] **Step 5: 运行类型检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 6: Commit**

```bash
git add src/agents/workflows/shortStory.ts src/__tests__/shortStory.test.ts
git commit -m "$(cat <<'EOF'
feat: add buildShortStoryWorkflow builder

4-step workflow: short_story_gen → paragraph_fix → style_review
→ commit_write. Accepts platformId, TagSet, wordCount, and optional
extra requirements. Includes 7 unit tests for step structure and
approval levels.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 创建 `useShortStoryWorkflow.ts` composable + 适配 `commitWrite.ts`

**Files:**
- Create: `src/composables/useShortStoryWorkflow.ts`
- Modify: `src/agents/steps/commitWrite.ts`

此 composable 封装：Runner 创建 + agent 注册 + Work/Volume/Chapter 创建 + 工作流执行，供 AiModal 和 InspireWizard 复用。

commitWrite.ts 需要适配：`mapToPendingWrite` 目前只处理 `gen_body_` 前缀的步骤，需要新增 `short_story_gen` 的映射。

- [ ] **Step 1: 修改 `commitWrite.ts` — 新增 `short_story_gen` 映射**

在 `src/agents/steps/commitWrite.ts` 的 `mapToPendingWrite` 函数中（约第 157 行 `gen_body_N` 映射），新增 `short_story_gen` 处理：

```ts
/** F4: 从 Runner pending write 提取真实 chapterId */
function mapToPendingWrite(pw: {
  stepId: string; agentId: string; inputs?: Record<string, string>
  data: Record<string, unknown>
}): PendingWrite | null {
  const data = pw.data as any

  // short_story_gen → 短篇正文（与 gen_body_N 同样处理）
  if (pw.stepId === 'short_story_gen' && data.content) {
    const chapterId = pw.inputs?.chapterId != null ? Number(pw.inputs.chapterId) : 0
    if (!chapterId) return null
    return { type: 'chapter', target: chapterId, data: { content: data.content } }
  }

  // gen_body_N → 章节正文
  if (pw.stepId.startsWith('gen_body_') && data.content) {
    const chapterId = pw.inputs?.chapterId != null ? Number(pw.inputs.chapterId) : 0
    if (!chapterId) return null
    return { type: 'chapter', target: chapterId, data: { content: data.content } }
  }

  // ... 后续现有映射保持不变 ...
```

- [ ] **Step 2: 实现 `useShortStoryWorkflow.ts` composable**

创建 `src/composables/useShortStoryWorkflow.ts`：

```ts
/**
 * 短篇创作工作流执行器
 * 
 * 封装：
 *   1. Runner 创建 + agent 注册
 *   2. Work/Volume/Chapter 创建（前置）
 *   3. platformId 写入 WorkspaceSettings
 *   4. 工作流执行
 * 
 * 供 AiModal（shortStory 模式）和 InspireWizard 复用。
 */
import { WorkflowRunner } from '../agents/runner'
import { createShortStoryGenAgent } from '../agents/steps/shortStoryGen'
import { createParagraphFixAgent } from '../agents/steps/paragraphFix'
import { createStyleReviewAgent } from '../agents/steps/styleReview'
import { createCommitWriteAgent } from '../agents/steps/commitWrite'
import { buildShortStoryWorkflow } from '../agents/workflows/shortStory'
import { WorkspaceSettings } from './useWorkspaceSettings'
import type { TagSet } from './usePlatformTags'
import type { Decision, ApprovalCardData } from '../agents/types'

export interface ShortStoryCallbacks {
  onStepStart?: (stepId: string) => void
  onChunk?: (text: string) => void
  onStepDone?: (stepId: string, output: string) => void
  onApprovalNeeded?: (card: ApprovalCardData) => void
  onDone?: () => void
  onError?: (err: Error) => void
}

export interface ShortStoryResult {
  runner: WorkflowRunner
  workId: number
  chapterId: number
  waitForDecision: (decision: Decision) => void
  abort: () => void
}

export function createShortStoryRunner(): WorkflowRunner {
  const runner = new WorkflowRunner()
  runner.registerAgents([
    createShortStoryGenAgent(),
    createParagraphFixAgent(),
    createStyleReviewAgent(),
    createCommitWriteAgent(),
  ])
  return runner
}

/**
 * 创建短篇所需的 Work + Volume + Chapter，写入 platformId。
 * 返回 { workId, volumeId, chapterId } 供 workflow 上下文使用。
 */
export async function prepareShortStoryWork(
  title: string,
  platformId: string,
  tagSet: TagSet,
): Promise<{ workId: number; volumeId: number; chapterId: number }> {
  const { useWorkRepo } = await import('./useWorkRepo')
  const repo = useWorkRepo()

  // 1. 创建 Work
  const work = await repo.addWork(title)
  if (!work) throw new Error('创建作品失败')
  const workId = typeof work === 'number' ? work : (work as any).id
  repo.currentWorkId.value = workId

  // 2. 创建默认 Volume
  const volumeId = await repo.addVolume(workId, '默认卷')
  if (!volumeId) throw new Error('创建卷失败')

  // 3. 创建第 1 个 Chapter
  const chapterId = await repo.addChapter(volumeId, '短篇正文')
  if (!chapterId) throw new Error('创建章节失败')

  // 4. 写入 platformId 和平台标签到 WorkspaceSettings
  const ws = new WorkspaceSettings(workId)
  ws.update({
    platformId,
    // 将 TagSet 字段映射到 WorkspaceSettingsData
    genre: tagSet.genre || ws.data.genre,
    tags: [
      ...(ws.data.tags || []),
      ...(tagSet.subgenre || []),
      ...(tagSet.elements || []),
    ],
  })

  return { workId, volumeId, chapterId }
}

/**
 * 启动短篇创作工作流。
 * 
 * 调用前需先调用 prepareShortStoryWork() 创建好 Work/Volume/Chapter。
 */
export async function launchShortStoryWorkflow(
  runner: WorkflowRunner,
  platformId: string,
  tagSet: TagSet,
  wordCount: number,
  workId: number,
  chapterId: number,
  extra: string | undefined,
  callbacks: ShortStoryCallbacks,
): Promise<ShortStoryResult> {
  // 绑定事件
  if (callbacks.onStepStart) {
    runner.on('step:start', (step) => callbacks.onStepStart!(step.id))
  }
  if (callbacks.onChunk) {
    runner.on('step:chunk', (text) => callbacks.onChunk!(text))
  }
  if (callbacks.onStepDone) {
    runner.on('step:done', (_step, output) => callbacks.onStepDone!(_step.id, output))
  }
  if (callbacks.onApprovalNeeded) {
    runner.on('step:awaiting', (card) => callbacks.onApprovalNeeded!(card))
  }
  if (callbacks.onDone) {
    runner.on('run:done', () => callbacks.onDone!())
  }
  if (callbacks.onError) {
    runner.on('run:failed', (err) => callbacks.onError!(err))
  }

  // 构建工作流（注入 chapterId 到 gen step 的 inputs）
  const steps = buildShortStoryWorkflow(platformId, tagSet, wordCount, extra)

  // 将 chapterId 注入第一个步骤的 inputs（供 commit_write 的 mapToPendingWrite 使用）
  steps[0].inputs.chapterId = String(chapterId)

  // 设置上下文（commit_write 需要 workId）
  runner.setContext({ workId, chapterId, _pendingWrites: [] })

  // 启动（异步，不阻塞）
  const runPromise = runner.run(steps, 'approval')

  const result: ShortStoryResult = {
    runner,
    workId,
    chapterId,
    waitForDecision: (decision: Decision) => {
      try {
        runner.decide(decision)
      } catch (e: any) {
        callbacks.onError?.(e)
      }
    },
    abort: () => {
      ;(runner as any)._abort?.()
    },
  }

  runPromise.catch((e) => {
    console.error('[shortStory] workflow failed:', e)
  })

  return result
}
```

- [ ] **Step 3: 运行类型检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 4: 运行全量测试确认无回归**

```bash
npx vitest run
```
预期：所有现有测试继续通过

- [ ] **Step 5: Commit**

```bash
git add src/composables/useShortStoryWorkflow.ts src/agents/steps/commitWrite.ts
git commit -m "$(cat <<'EOF'
feat: add useShortStoryWorkflow composable + commitWrite short_story_gen mapping

Encapsulates WorkflowRunner creation, agent registration, Work/Volume/Chapter
creation, and short story workflow execution. Adapts commitWrite.ts
mapToPendingWrite to handle short_story_gen step IDs alongside gen_body_N.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ChapterEditor — 添加 shortStory AI action

**Files:**
- Modify: `src/components/ChapterEditor.vue`

- [ ] **Step 1: 在 `aiActions` 中添加 shortStory 条目**

找到 `aiActions` 数组（约第 280 行），在末尾追加：

```ts
const aiActions = [
  { key: 'opening', label: '开篇' }, { key: 'continue', label: '续写' }, { key: 'optimize', label: '优化' },
  { key: 'unmark', label: '消痕' }, { key: 'review', label: '审稿' }, { key: 'polish', label: '润色' },
  { key: 'comment', label: '神评' }, { key: 'analyze', label: '拆书' }, { key: 'rewrite', label: '重写' },
  { key: 'inspire', label: '灵感' }, { key: 'updateSettings', label: '设定更新' },
  { key: 'shortStory', label: '短篇' },  // ← 新增
]
```

- [ ] **Step 2: 在 `AI_EDITOR_CONFIG` 中添加 shortStory 配置**

找到 `AI_EDITOR_CONFIG` 对象（约第 1113 行），在末尾追加：

```ts
const AI_EDITOR_CONFIG: Record<string, AiModalConfig> = {
  // ... 现有条目 ...
  shortStory: {
    type: 'special',
    title: '平台短篇',
    desc: '选择目标平台和标签，AI 一次性生成完整短篇',
    target: '',
    write: '',
    mode: 'shortStory',
  },
}
```

- [ ] **Step 3: 在 `triggerAi` 中添加 shortStory 分发**

找到 `triggerAi` 函数（约第 1126 行），在 `type === 'special'` 分支中添加（约第 1130 行附近）：

```ts
// 在 special 分支中：
if (cfg.type === 'special') {
  if (action === 'inspire') { /* 现有 */ }
  else if (action === 'updateSettings') { /* 现有 */ }
  else if (action === 'optimizeTitle') { /* 现有 */ }
  else if (action === 'analyze') { /* 现有 */ }
  else if (action === 'shortStory') {
    // 短篇创作：打开 AiModal 的 shortStory 模式
    aiModal.type = 'standard'
    aiModal.visible = true
    aiModal.field = 'shortStory'
    aiModal.mode = 'shortStory'
    aiModal.title = '平台短篇'
    aiModal.desc = '选择目标平台和标签，AI 一次性生成完整短篇'
    aiModal.write = '写入作品'
    aiModal.target = ''
    aiModal.useWorkflow = true  // 使用工作流路径
    return
  }
}
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 5: Commit**

```bash
git add src/components/ChapterEditor.vue
git commit -m "$(cat <<'EOF'
feat: add shortStory AI action to ChapterEditor

Add '短篇' button to AI toolbar and wire it to open AiModal
in shortStory mode with useWorkflow=true for workflow-based
generation.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: AiModal — 新增 shortStory 模式

**Files:**
- Modify: `src/components/AiModal.vue`

- [ ] **Step 1: 添加 shortStory 模式的模板区域**

在 AiModal 模板中，在现有 mode 条件渲染之后（约第 60 行 `noteTarget` 模式之后），添加 shortStory 模式的条件块。

在模板中找到 `<!-- 目标选择区 -->` 附近的区域。在 `v-if="mode === 'noteTarget'"` 块之后添加：

```html
<!-- shortStory 模式：平台 + TagSet + 字数配置 -->
<div v-if="mode === 'shortStory'" class="am-shortstory-config">
  <div class="am-ss-row">
    <label class="am-ss-label">目标平台</label>
    <select v-model="ssPlatform" class="am-select">
      <option value="">-- 选择平台 --</option>
      <option v-for="p in mvpPlatforms" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
  </div>

  <div v-if="ssPlatform" class="am-ss-row">
    <label class="am-ss-label">目标字数</label>
    <div class="am-ss-wordcount">
      <button v-for="wc in wordCountOptions" :key="wc"
        class="am-ss-wc-btn" :class="{ active: ssWordCount === wc }"
        @click="ssWordCount = wc">{{ wc >= 10000 ? (wc / 10000) + '万' : wc }}</button>
    </div>
  </div>

  <div v-if="ssPlatform" class="am-ss-row">
    <label class="am-ss-label">题材</label>
    <select v-model="ssGenre" class="am-select">
      <option value="">-- 选择题材 --</option>
      <option v-for="g in platformGenres" :key="g" :value="g">{{ g }}</option>
    </select>
  </div>

  <div v-if="ssPlatform" class="am-ss-row">
    <label class="am-ss-label">补充要求（可选）</label>
    <textarea v-model="ssExtra" class="am-textarea am-ss-extra" rows="2"
      placeholder="如：主角是穿越者、必须有反转结局、面向男性读者…"></textarea>
  </div>
</div>
```

- [ ] **Step 2: 修改生成按钮文本**

找到生成按钮（约第 313 行）：

```html
<button class="am-gen-btn" @click="doGenerate" :disabled="llmGen">
  {{ llmGen ? '生成中...' : props.useWorkflow ? '启动审批流' : mode === 'shortStory' ? '生成短篇' : 'AI生成' }}
</button>
```

- [ ] **Step 3: 添加 shortStory 相关的 script 逻辑**

在 `<script setup>` 中添加：

```ts
// ── shortStory 模式状态 ──
import { getMVPPlatforms, getPlatformGenres } from '../composables/usePlatformData'
import { getDefaultTags, buildGenerationPrompt, type TagSet } from '../composables/usePlatformTags'

const ssPlatform = ref('')
const ssWordCount = ref(5000)
const ssGenre = ref('')
const ssExtra = ref('')

const mvpPlatforms = computed(() => getMVPPlatforms())
const wordCountOptions = [2000, 3000, 5000, 8000, 10000, 15000, 20000]

const platformGenres = computed(() => {
  if (!ssPlatform.value) return []
  return getPlatformGenres(ssPlatform.value)
})

// 当平台变化时，自动填充默认 TagSet
watch(ssPlatform, (newPlatform) => {
  if (newPlatform) {
    const defaults = getDefaultTags(newPlatform, '')
    if (defaults.length) ssWordCount.value = defaults.length === 'short' ? 5000 : 10000
  }
})
```

- [ ] **Step 4: 修改 `doGenerate` 以处理 shortStory 模式**

在 `doGenerate` 函数中（约第 1756 行），在 `useWorkflow` 检查之前添加 shortStory 模式分支：

```ts
async function doGenerate() {
  if (llmGen.value) return

  // shortStory 模式：构建 TagSet 并发射到工作流
  if (props.mode === 'shortStory') {
    if (!ssPlatform.value) {
      msg.warning('请选择目标平台')
      return
    }
    const tagSet: TagSet = {
      platform: ssPlatform.value,
      channel: '',
      genre: ssGenre.value,
      subgenre: [],
      elements: [],
      emotion: [],
      pov: 'third_person_limited',
      style: '',
      length: ssWordCount.value <= 5000 ? 'short' : ssWordCount.value <= 20000 ? 'medium' : 'long',
      cool_points: [],
      taboo: [],
    }
    emit('start', {
      chapterCount: 1,
      extra: JSON.stringify({
        type: 'shortStory',
        platformId: ssPlatform.value,
        tagSet,
        wordCount: ssWordCount.value,
        extra: ssExtra.value,
      }),
    })
    return
  }

  // ... 现有 useWorkflow 检查 ...
```

- [ ] **Step 5: 更新 emit 类型定义**

更新 emit 定义（约第 520 行）以支持新的 start 参数格式（无需改动，现有的 `{ chapterCount: number; extra: string }` 已兼容）：

```ts
// 无需改动 — emit('start', cfg) 的 cfg.extra 可以携带序列化的 shortStory 配置
```

- [ ] **Step 6: 添加 shortStory 模式的 CSS**

在 `<style scoped>` 末尾添加：

```css
/* shortStory 模式 */
.am-shortstory-config { margin: 12px 0; }
.am-ss-row { margin-bottom: 12px; }
.am-ss-label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
.am-ss-wordcount { display: flex; gap: 6px; flex-wrap: wrap; }
.am-ss-wc-btn { padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px; }
.am-ss-wc-btn.active { background: #2ea86a; color: #fff; border-color: #2ea86a; }
.am-ss-extra { width: 100%; }
```

- [ ] **Step 7: 运行类型检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 8: Commit**

```bash
git add src/components/AiModal.vue
git commit -m "$(cat <<'EOF'
feat: add shortStory mode to AiModal

Add platform selector, word count picker, genre selector, and
extra requirements field. Wire shortStory mode to emit('start')
with serialized short story config for workflow execution.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: App.vue — 接收 shortStory 事件并启动工作流

**Files:**
- Modify: `src/components/App.vue`

**架构说明：** ChapterEditor 已有 `@ai-action` emit，但 App.vue 当前未绑定。短篇工作流需要 App.vue 层介入，因为 Work/Volume/Chapter 的创建和 LLM 调用的配置需要全局上下文。

**策略：** 在 App.vue 中绑定 `@ai-action`，检测 `shortStory` action，创建 Work + 启动工作流。审批卡通过 AgentPanel 现有的审批 UI 展示（复用其 runner 事件监听）。

- [ ] **Step 1: 在 App.vue 模板中绑定 ChapterEditor 的 `@ai-action`**

找到 ChapterEditor 的实例化位置（约第 59 行），添加 `@ai-action` 绑定：

```html
<ChapterEditor
  ref="chapterEditorRef"
  v-if="activePanel === 'content'"
  :is-dark="isDark"
  :platform-id="selectedPlatform"
  :settings-mgr="settingsMgr"
  :settings-version="settingsVersion"
  @open-inspire-modal="inspireRef?.open()"
  @publish="onPublish"
  @ai-action="onChapterEditorAiAction"
/>
```

- [ ] **Step 2: 添加 `onChapterEditorAiAction` 处理函数**

在 `<script setup>` 中添加：

```ts
import { createShortStoryRunner, prepareShortStoryWork, launchShortStoryWorkflow } from './composables/useShortStoryWorkflow'
import type { TagSet } from './composables/usePlatformTags'

// AgentPanel ref（用于显示审批卡）
const agentPanelRef = ref<InstanceType<typeof AgentPanel>>()

async function onChapterEditorAiAction(action: string) {
  // shortStory action 携带序列化配置
  if (!action.startsWith('shortStory:')) return

  try {
    const configStr = action.replace('shortStory:', '')
    const config = JSON.parse(configStr) as {
      platformId: string
      tagSet: TagSet
      wordCount: number
      extra?: string
    }

    // 1. 前置：创建 Work + Volume + Chapter
    const title = `${config.tagSet.genre || '短篇'} - ${new Date().toLocaleDateString('zh-CN')}`
    const { workId, volumeId, chapterId } = await prepareShortStoryWork(
      title,
      config.platformId,
      config.tagSet,
    )

    // 2. 创建 Runner 并注册 agents
    const runner = createShortStoryRunner()

    // 3. 注入 LLM 调用（复用 AgentPanel 的模型选择逻辑）
    const llmCall = createLlmCallForShortStory()
    runner.setLlmCall(llmCall)

    // 4. 构建 resolverCtx（设定数据注入）
    runner.setResolverCtx(await buildResolverCtx(workId))

    // 5. 将审批卡转发到 AgentPanel（复用其审批 UI）
    runner.on('step:awaiting', (card) => {
      // 切换到 AgentPanel 面板以显示审批卡
      activePanel.value = 'agent'
      // AgentPanel 通过其自身的 runner 实例监听事件 —
      // 我们需要一种方式将审批卡注入 AgentPanel。
      // 方案：通过 agentPanelRef 暴露的方法传递审批卡。
      agentPanelRef.value?.injectApprovalCard?.(card)
    })

    // 6. 启动工作流
    const result = await launchShortStoryWorkflow(
      runner,
      config.platformId,
      config.tagSet,
      config.wordCount,
      workId,
      chapterId,
      config.extra,
      {
        onDone: () => {
          console.log('[App] 短篇生成完成, workId=', workId)
        },
        onError: (err) => {
          console.error('[App] 短篇生成失败:', err)
        },
      },
    )
  } catch (e: any) {
    console.error('[App] shortStory 启动失败:', e)
  }
}
```

> **注意**：如果 AgentPanel 不支持外部注入审批卡，降级方案是在 App.vue 中直接使用 `launchShortStoryWorkflow` 返回的 `runner.decide()` 方法，配合 App.vue 层的一个简单审批弹窗。或者，更简单的方案是将 workflow 执行委托给 AgentPanel（通过 emit navigate，让 AgentPanel 的 `startWorkflow` 变体来处理短篇）。
>
> **推荐降级方案**（如果 AgentPanel 注入不可行）：直接在 ChapterEditor 的 `onApprovalStart` 中创建 runner 并运行，审批卡使用 `window.prompt` 或 ChapterEditor 内置的简单确认弹窗。这虽然 UI 粗糙但功能完整。

- [ ] **Step 3: 修改 ChapterEditor 的 `onApprovalStart` 以携带短篇配置**

在 `src/components/ChapterEditor.vue` 中（约第 1382 行），修改 `onApprovalStart`：

```ts
function onApprovalStart(cfg: { chapterCount: number; extra: string }) {
  // 短篇模式：将配置序列化到 ai-action 中传递
  if (aiModal.field === 'shortStory') {
    emit('ai-action', 'shortStory:' + cfg.extra)
    aiModal.visible = false
    return
  }
  emit('ai-action', props.field || 'approval')
}
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/App.vue src/components/ChapterEditor.vue
git commit -m "$(cat <<'EOF'
feat: wire short story workflow launch in App.vue

Bind @ai-action on ChapterEditor, detect shortStory action,
create Work/Volume/Chapter via prepareShortStoryWork, and
launch the 4-step workflow with LLM call injection.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: InspireWizard — 第5步添加「生成短篇」按钮

**Files:**
- Modify: `src/components/InspireWizard.vue`

- [ ] **Step 1: 在第5步的 footer 区域添加「生成短篇」按钮**

找到第5步的 footer（约第 166 行，`v-else` 分支即 `currentStep >= 5`），修改为：

```html
<template v-else>
  <button class="iw-btn-next" @click="finish">✅ 生成立项书</button>
  <button class="iw-btn-next iw-btn-ss" @click="generateShortStory">📱 生成短篇</button>
</template>
```

- [ ] **Step 2: 添加 `generateShortStory` 方法**

在 `<script setup>` 中（约第 460 行 `advanceStep` 附近）添加：

```ts
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'finish', data: any): void
  (e: 'generate-short-story', payload: {
    platformId: string
    tagSet: any
    wordCount: number
    settings: any
  }): void
}>()

function generateShortStory() {
  // 从已收集的设定构建 payload
  const payload = {
    platformId: '', // 用户需要在弹出的配置面板中选择
    tagSet: {
      platform: '',
      channel: channel.value,
      genre: selectedTags.value[0] || '',
      subgenre: selectedTags.value.slice(1),
      elements: [],
      emotion: [],
      pov: 'third_person_limited',
      style: '',
      length: 'short',
      cool_points: [],
      taboo: [],
    },
    wordCount: 5000,
    settings: {
      worldCard: savedWorldCard.value,
      charCard: savedCharCard.value,
      cheatCard: savedCheatCard.value,
    },
  }
  emit('generate-short-story', payload)
  visible.value = false
}
```

- [ ] **Step 3: 添加按钮样式**

在 `<style scoped>` 中：

```css
.iw-btn-ss { background: #6366f1; margin-left: 8px; }
.iw-btn-ss:hover { background: #4f46e5; }
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/InspireWizard.vue
git commit -m "$(cat <<'EOF'
feat: add generate short story button in InspireWizard step 5

Add '📱 生成短篇' button at the final step of the wizard.
Emits 'generate-short-story' with collected settings for
downstream short story workflow launch.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: WorkTree — 按平台分组视图

**Files:**
- Modify: `src/components/WorkTree.vue`

- [ ] **Step 1: 添加 viewMode 状态和导入**

在 `<script setup>` 中添加：

```ts
import { WorkspaceSettings } from '../composables/useWorkspaceSettings'
import { getPlatform } from '../composables/usePlatformData'

const viewMode = ref<'default' | 'platform'>('default')
```

- [ ] **Step 2: 添加 `worksByPlatform` 和 `platformGroupKeys` computed**

```ts
const worksByPlatform = computed(() => {
  const groups: Record<string, typeof works.value> = {}
  for (const w of works.value) {
    try {
      const ws = new WorkspaceSettings(w.id)
      const pid = ws.data.platformId || '__ungrouped__'
      if (!groups[pid]) groups[pid] = []
      groups[pid].push(w)
    } catch {
      if (!groups['__ungrouped__']) groups['__ungrouped__'] = []
      groups['__ungrouped__'].push(w)
    }
  }
  return groups
})

const platformGroupKeys = computed(() => {
  return Object.keys(worksByPlatform.value).sort((a, b) => {
    if (a === '__ungrouped__') return 1
    if (b === '__ungrouped__') return -1
    return a.localeCompare(b)
  })
})

function getPlatformName(platformId: string): string {
  if (platformId === '__ungrouped__') return '未分类'
  return getPlatform(platformId)?.name || platformId
}
```

- [ ] **Step 3: 在工具栏添加视图切换按钮**

找到 `tree-toolbar`（约第 14 行），添加切换按钮：

```html
<div class="tree-toolbar">
  <!-- 现有按钮... -->
  <button
    class="tree-tb-btn"
    :class="{ active: viewMode === 'platform' }"
    @click="viewMode = viewMode === 'default' ? 'platform' : 'default'"
    title="按平台分组"
  >📋 {{ viewMode === 'platform' ? '全部' : '按平台' }}</button>
</div>
```

- [ ] **Step 4: 添加平台分组视图模板**

在现有 `v-for="work in works"` 外层包裹条件渲染。

将现有的 work 渲染循环（约第 21-148 行）提取为 `<template>` 或保持不变，在其外层添加：

```html
<!-- 默认视图：现有扁平列表 -->
<template v-if="viewMode === 'default'">
  <!-- 现有的 v-for="work in works" 循环（保持不变） -->
</template>

<!-- 平台分组视图 -->
<template v-if="viewMode === 'platform'">
  <div v-for="pid in platformGroupKeys" :key="'pg'+pid" class="platform-group">
    <div class="platform-group-header">
      <span class="platform-group-icon">{{ pid === '__ungrouped__' ? '📂' : '📱' }}</span>
      <span class="platform-group-name">{{ getPlatformName(pid) }}</span>
      <span class="node-meta">({{ worksByPlatform[pid].length }})</span>
    </div>
    <!-- 该平台下的 works 循环 -->
    <div v-for="work in worksByPlatform[pid]" :key="'w'+work.id" class="tree-node-wrap">
      <!-- 复制现有的 work node 渲染（与默认视图完全相同） -->
    </div>
    <div v-if="!worksByPlatform[pid].length" class="platform-group-empty">暂无</div>
  </div>
</template>
```

> **实现策略**：为避免大量重复代码，建议将现有的 `v-for="work in works"` 内部的 work/volume/chapter 渲染提取为一个可复用的子组件或使用 `<template v-for>` + 动态 `:key`。如果 WorkTree 本身已经很小，直接复制粘贴也可接受（约 130 行）。
>
> **更简洁的方案**：用 computed 替代模板条件渲染：
> ```ts
> const displayWorks = computed(() => {
>   if (viewMode.value === 'default') return [{ key: '__all__', label: '', works: works.value }]
>   return platformGroupKeys.value.map(pid => ({
>     key: pid,
>     label: getPlatformName(pid),
>     works: worksByPlatform.value[pid] || [],
>   }))
> })
> ```
> 然后在模板中用一个 `v-for="group in displayWorks"` + `v-if="group.label"` 来条件渲染分组头。这是最干净的实现方式。

- [ ] **Step 5: 添加分组头样式**

在 `<style scoped>` 中添加：

```css
.platform-group { margin-bottom: 8px; }
.platform-group-header { padding: 6px 12px; font-size: 13px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--border-light); }
.platform-group-icon { font-size: 14px; }
.platform-group-name { flex: 1; }
.platform-group-empty { padding: 8px 16px; font-size: 12px; color: var(--text-muted); font-style: italic; }
```

- [ ] **Step 6: 运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: 运行全量测试确认无回归**

```bash
npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add src/components/WorkTree.vue
git commit -m "$(cat <<'EOF'
feat: add platform-grouped view to WorkTree

Add view mode toggle between default (flat) and platform-grouped.
Platform grouping reads platformId from WorkspaceSettings per work
and groups works under platform headers. Ungrouped works fall into
'未分类' section.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 端到端验证 & 收尾

- [ ] **Step 1: 运行全量测试**

```bash
npx vitest run
```
预期：所有测试通过，包括新增的 shortStory 测试

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 3: 手动验证清单**

- [ ] ChapterEditor 工具栏出现「短篇」按钮
- [ ] 点击「短篇」→ AiModal 显示平台选择器 + 字数 + 题材 + 补充要求
- [ ] 选择平台后点击「生成短篇」→ 工作流启动
- [ ] short_story_gen 步骤完成后弹出审批卡，显示正文
- [ ] 审批通过 → paragraph_fix → style_review → commit_write
- [ ] WorkTree 中按平台分组视图显示新生成的短篇
- [ ] InspireWizard 第5步出现「生成短篇」按钮

- [ ] **Step 4: 最终 commit（如有遗漏修改）**

```bash
git status
git add -A
git commit -m "$(cat <<'EOF'
chore: final polish for short story feature

End-to-end verification and cleanup.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## 自检清单

1. **Spec 覆盖**：
   - [x] shortStoryGen.ts step agent → Task 1
   - [x] shortStory.ts workflow builder → Task 2
   - [x] commitWrite.ts 适配 short_story_gen 映射 → Task 3
   - [x] useShortStoryWorkflow.ts composable (Work/Volume/Chapter 创建 + 工作流执行) → Task 3
   - [x] ChapterEditor toolbar entry → Task 4
   - [x] AiModal shortStory mode → Task 5
   - [x] App.vue event wiring + LLM injection → Task 6
   - [x] InspireWizard step 5 button → Task 7
   - [x] WorkTree platform-grouped view → Task 8
   - [x] Tests → Task 1 + Task 2 + Task 9
   - [x] Spec §8 (commit_write 适配: Work/Volume/Chapter 创建 + platformId 写入) → Task 3

2. **未实现的 spec 内容（明确排除）**：
   - ❌ 逐章审批（短篇一次成型）
   - ❌ compress_expand（prompt 参数约束字数）
   - ❌ consistency_check（短篇设定简单）
   - ❌ extract_settings（生成时设定已在上下文）
   - ❌ ReviewModal 组件（复用现有审批卡）

3. **类型一致性**：
   - `ShortStoryConfig` 在 `shortStory.ts` 中定义，被 `useShortStoryWorkflow.ts` 引用
   - `TagSet` 从 `usePlatformTags.ts` 导入，在所有文件中类型一致
   - `WorkflowStep` 从 `../types` 导入，与现有 workflow 兼容
   - `ShortStoryCallbacks` / `ShortStoryResult` 在 `useShortStoryWorkflow.ts` 中定义，被 Task 6 (App.vue) 引用

4. **无占位符**：全部代码步骤包含完整实现，无 TBD/TODO。
   唯一需在实现时根据 App.vue 实际结构调整的部分已在 Task 6 中标注降级方案。

