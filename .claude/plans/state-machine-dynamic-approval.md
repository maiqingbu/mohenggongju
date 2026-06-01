# 状态机动态审批 — 实施计划

## 基于文档
`/Users/mac/Desktop/墨衡/状态机动态审批.md`（572行完整设计文档）

---

## 总览

将当前线性流水线改造为**带条件循环的引导式状态机**，实现：
- 按需检测、缺什么补什么（不是一次性跑完所有步骤）
- 审批卡片以消息形式展现在 Agent 面板
- 状态字样随进度实时更新
- 审批卡片精准接通 AiModal

---

## 阶段1：Runner 核心改造

### 1.1 types.ts — 增加 condition 字段

文件：`src/agents/types.ts`

```diff
interface WorkflowStep {
  id: string
  agentId: string
  inputs: Record<string, string>
  approval?: 'always' | 'on_warning' | 'never'
  skippable?: boolean
  next?: string              // 已有，未使用
+ condition?: (output: string) => string | null  // 条件路由：返回下一步stepId或null
+ retryable?: boolean        // 是否可重试（LLM 步骤默认 true）
}
```

### 1.2 runner.ts — run() 改为步骤图路由

文件：`src/agents/runner.ts`

**改动要点：**

1. **run() 方法**：将 `for (let i = 0; i < steps.length; i++)` 改为 `while (currentStepId)` 步骤图路由
   - 构建 `stepMap = new Map(steps.map(s => [s.id, s]))`
   - 从 `steps[0].id` 开始
   - 每步执行后：如果有 `condition`，调用它决定下一步；否则用 `step.next`；都没有则按数组顺序取下一个

2. **LLM 自动重试**：在 `executeAgent` 调用外层包装重试逻辑
   - 最多 3 次，指数退避（1s/2s/4s）
   - 仅对 LLM 调用错误重试，对 abort/用户取消不重试

3. **合并 redo 逻辑**：提取 `handleRedoLoop()` 公共方法
   - `run()` 和 `resumeFromRestore()` 共用
   - 消除当前约 50 行的重复代码

4. **resumeFromRestore()**：同步改为步骤图路由模式

### 1.3 runner.ts — 序列化/反序列化增强

确保 `serialize()` 保存 `currentStepId`（而非 index），`restore()` 恢复后能从正确步骤继续。

---

## 阶段2：新增检测步骤 Agent

### 2.1 src/agents/steps/settingDetector.ts — 作品设定检测

- `localExecute`：扫描 WorkspaceSettings 中的必填字段
- 检测项：书名、类型/题材、简介、核心卖点、目标读者、金手指
- 输出 JSON：`{ complete: boolean, missing: [{field, label, path}] }`
- 当 `complete === false` 时，审批卡片列出缺失项，每项有精准跳转按钮

### 2.2 src/agents/steps/infoDetector.ts — 信息设定检测

- 检测项：主要角色、世界观/背景、伏笔/悬念、关键物品
- 使用 SettingsManager 扫描设定数据
- 输出 JSON：`{ complete: boolean, missing: [{field, label, hasData}] }`

### 2.3 src/agents/steps/outlineDetector.ts — 大纲层级检测

- 检测总纲 → 卷纲 → 章纲的层级依赖
- 输出 JSON：`{ hasMain: boolean, missingVolumes: number[], missingChapters: number[] }`
- condition 函数根据输出决定路由：
  - 无总纲 → 跳到 `gen_main_outline`
  - 有总纲无卷纲 → 跳到 `gen_volume_outline`
  - 有卷纲无章纲 → 跳到 `gen_chapter_outline`
  - 全部齐全 → 跳到 `next_phase`

### 2.4 src/agents/steps/preflightCheck.ts — 续写前动态检测

- 输入：targetChapterNo, workId
- 检测该章所属卷是否有卷纲、该章是否有章纲、设定是否齐全
- 输出 JSON：`{ ready: boolean, missing: [{type, volumeNo?, chapterNo?}] }`
- condition 函数根据缺失项路由到对应生成步骤

---

## 阶段3：生命周期工作流

### 3.1 src/agents/workflows/lifecycle.ts — 全生命周期工作流构建器

```typescript
function buildLifecycleWorkflow(opts: {
  workId: number
  mode: 'opening' | 'continue'
  chapterCount: number
  startChapterNo: number
  wordsPerChapter: number
  chapterIds: number[]
}): WorkflowStep[]
```

**步骤图结构：**

```
check_settings → [condition: 缺失 → fix_settings, 齐全 → check_info]
check_info → [condition: 缺失 → fix_info, 齐全 → check_outline]
check_outline → [condition: 无总纲 → gen_main, 有总纲无卷纲 → gen_volume, 有卷纲无章纲 → gen_chapter, 全齐 → preflight]
gen_main → check_outline (循环回检测)
gen_volume → check_outline
gen_chapter → check_outline
preflight → [condition: 缺失 → 按缺失项路由, 齐全 → gen_body]
gen_body → [autoReview? → review : commit]
review → [autoClean? → clean : commit]
clean → commit
commit → [设定更新检测 → update_settings → 下一章 preflight | done]
```

### 3.2 步骤ID命名规范

```
check_settings_0        — 作品设定检测
fix_settings_0          — 作品设定修复（审批卡片）
check_info_0            — 信息设定检测
fix_info_0              — 信息设定修复（审批卡片）
check_outline_0         — 大纲层级检测
gen_main_outline_0      — 生成总纲
gen_volume_outline_{n}  — 生成第n卷卷纲
gen_chapter_outline_{n} — 生成第n章章纲
preflight_{n}           — 第n章续写前置检测
gen_body_{n}            — 第n章正文生成
review_{n}              — 第n章审稿
clean_{n}               — 第n章消痕
commit_{n}              — 第n章落库
update_settings_{n}     — 第n章后设定更新
```

---

## 阶段4：UI 集成

### 4.1 AgentPanel.vue — 审批卡片消息化

**改动区域：** startWorkflow 函数

- 替换当前的 `buildContinueChapterWorkflow()` 调用为 `buildLifecycleWorkflow()`
- 审批卡片已有 `step:awaiting` 事件 → `ApprovalCard` 组件渲染
- 需要增强 ApprovalCardData 类型，支持：
  - `actions: ApprovalAction[]` — 每个操作按钮（去补充、生成总纲等）
  - `statusLabel: string` — 动态状态字样
  - `targetPanel?: string` — 精准跳转目标

### 4.2 ApprovalCard.vue — 精准按钮对接

- 每个 action 按钮点击后触发 `emit('action', actionId, payload)`
- AgentPanel 监听 action 事件，执行对应操作：
  - `navigate_to_setting` → `emit('navigate', { panel: 'settings', action: 'focus', field })` 
  - `generate_outline` → 调用 AiModal 预填任务
  - `approve_and_continue` → `runner.decide({ type: 'approve' })`

### 4.3 状态字样动态更新

- AgentPanel 中新增 `lifecycleStatus` ref
- 每个 `step:done` 事件更新对应状态标签
- 在推荐卡片区域显示当前阶段进度

### 4.4 AiModal 精准对接

- 审批卡片的"生成XX"按钮 → 打开 AiModal 并预填 prompt
- AiModal 完成后回调 → 将结果写回对应数据源 → 触发 runner 继续

---

## 阶段5：设定更新步骤

### 5.1 commitWrite.ts — 落库后触发设定更新钩子

- commit 步骤完成后，自动注入 `update_settings_{n}` 步骤
- 使用现有 `createExtractSettingsAgent()` 分析已写内容
- 审批卡片展示需要更新的设定项

---

## 实施顺序

| 步骤 | 内容 | 预估改动量 |
|------|------|-----------|
| 1 | types.ts: 增加 condition/retryable 字段 | ~10行 |
| 2 | runner.ts: 步骤图路由 + LLM重试 + 合并redo | ~200行改动 |
| 3 | settingDetector.ts + infoDetector.ts | 新增 ~150行 |
| 4 | outlineDetector.ts + preflightCheck.ts | 新增 ~200行 |
| 5 | lifecycle.ts: 全生命周期工作流构建器 | 新增 ~300行 |
| 6 | AgentPanel.vue: 接入lifecycle + 审批卡片增强 | ~200行改动 |
| 7 | ApprovalCard.vue: 精准按钮 + 状态字样 | ~100行改动 |
| 8 | AiModal.vue: 预填任务对接 | ~50行改动 |
| 9 | types.ts: 增强 ApprovalCardData | ~20行改动 |

---

## 风险与注意事项

1. **AgentPanel.vue 已有 2680 行**：改动要精确，避免引入回归 bug
2. **Runner 改造是核心**：步骤图路由必须向后兼容现有 continueChapter workflow
3. **持久化兼容**：serialize/restore 必须兼容旧格式（迁移期）
4. **审批卡片与 AiModal 的双向通信**：需要事件总线或回调机制

---

## 验证方案

1. Runner 单元测试：步骤图路由、condition 跳转、redo 循环、LLM 重试
2. 手动测试：创建新作品 → 设定检测 → 大纲生成 → 黄金三章 → 续写循环
3. 回归测试：现有续写工作流（continueChapter）不受影响
