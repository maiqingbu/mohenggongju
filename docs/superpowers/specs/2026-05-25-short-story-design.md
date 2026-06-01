# 平台适配短篇创作 — 设计文档

> 日期：2026-05-25 | 状态：设计中

## 1. 概述

### 1.1 核心场景

用户选平台 → 配 TagSet → AI 一次性生成完整短篇 → 审阅 → 写入作品（按平台分组）→ 格式化发布

关键特征：**一次成型**（非逐章）、**平台风格强约束**、**产出即发布**、**按平台分类存储**。

### 1.2 方案选择

选用 **方案 B：轻量工作流** — 新建 `buildShortStoryWorkflow()`，走 WorkflowRunner，4 步完成：

```
short_story_gen (LLM, always审批)
  → paragraph_fix (本地, auto)
  → style_review (LLM, on_warning)
  → commit_write (本地, always)
```

不做逐章审批、不做 compress_expand（prompt 参数约束字数），短篇一次成型。

### 1.3 存储模型

每篇短篇 = 一个独立 Work，通过 `WorkspaceSettings.platformId` 存储平台标识。WorkTree 新增"按平台分组"视图。

---

## 2. 新建文件

| 文件 | 说明 |
|------|------|
| `src/agents/workflows/shortStory.ts` | `buildShortStoryWorkflow(platformId, tagSet, wordCount)` |
| `src/agents/steps/shortStoryGen.ts` | 短篇生成 step agent（LLM） |
| `src/__tests__/shortStory.test.ts` | 测试：工作流构建 + shortStoryGen step |

---

## 3. 改造文件

| 文件 | 改动 |
|------|------|
| `src/components/ChapterEditor.vue` | `AI_EDITOR_CONFIG` 新增 `shortStory` action；工具栏加 `shortStory` 按钮 |
| `src/components/InspireWizard.vue` | 第 5 步加「生成短篇」按钮，调用 `emit('generate-short-story', payload)` |
| `src/components/App.vue` | 接收 `generate-short-story` 事件，打开短篇配置面板 |
| `src/components/WorkTree.vue` | 新增「按平台分组」视图 |
| `src/components/AiModal.vue` | 新增 `shortStory` 模式：平台选择 + TagSet 配置 + 生成触发 |

---

## 4. 复用文件（不改）

| 文件 | 用途 |
|------|------|
| `src/agents/runner.ts` | WorkflowRunner — 直接复用 |
| `src/agents/steps/paragraphFix.ts` | 段落合并 — localExecute，零 token |
| `src/agents/steps/styleReview.ts` | 文风审查 — LLM，on_warning |
| `src/agents/steps/commitWrite.ts` | 原子写入 — localExecute，always |
| `src/composables/usePlatformTags.ts` | TagSet 验证 + `buildGenerationPrompt()` |
| `src/composables/usePlatformData.ts` | `getPlatformProfile()` |
| `src/composables/usePlatformOutput.ts` | `formatForPlatform()` / `getPlatformUrl()` |
| `src/agents/shared/compactConstitution.ts` | 短篇写作铁律（48 条） |

---

## 5. 数据流

```
                                     ┌──────────────┐
                                     │ 入口选择     │
                                     └──────┬───────┘
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                    ┌─────────────────┐         ┌─────────────────┐
                    │ InspireWizard   │         │ ChapterEditor   │
                    │ 第5步 [生成短篇] │         │ [📱 平台短篇]    │
                    └────────┬────────┘         └────────┬────────┘
                             └───────────┬──────────────┘
                                         ▼
                              ┌─────────────────────┐
                              │ 短篇配置面板         │
                              │ - 平台选择           │
                              │ - TagSet 自动填充     │
                              │ - 字数目标           │
                              │ - 额外要求（可选）    │
                              └──────────┬──────────┘
                                         ▼
                              ┌─────────────────────────────┐
                              │ WorkflowRunner               │
                              │ buildShortStoryWorkflow()    │
                              │                             │
                              │ Step 1: short_story_gen     │
                              │   LLM: TagSet prompt        │
                              │       + platformProfile     │
                              │       + COMPACT_CONST       │
                              │       + targetWordCount     │
                              │   approval: always          │
                              │                             │
                              │ Step 2: paragraph_fix       │
                              │   local: 合并碎片段落       │
                              │   approval: auto            │
                              │                             │
                              │ Step 3: style_review        │
                              │   LLM: 11区深度审查         │
                              │   approval: on_warning      │
                              │                             │
                              │ Step 4: commit_write        │
                              │   创建 Work + Volume        │
                              │   + 写入正文到 Chapter      │
                              │   + 设 platformId           │
                              │   + 写入平台标签            │
                              │   approval: always          │
                              └──────────┬──────────────────┘
                                         ▼
                              ┌─────────────────────┐
                              │ 审阅弹窗             │
                              │ - 正文预览（可编辑）  │
                              │ - 风格问题列表       │
                              │ - [通过] [修改] [重做]│
                              └──────────┬──────────┘
                                         ▼
                              ┌─────────────────────┐
                              │ 写入成功             │
                              │ - WorkTree 刷新      │
                              │ - 可选：格式化发布    │
                              └─────────────────────┘
```

---

## 6. WorkTree 按平台分组

```
现有视图：全部作品（按创建时间）
新增视图：按平台分组

┌──────────────────┐
│ [全部] [按平台]   │  ← 切换
├──────────────────┤
│ 📱 知乎盐选 (2)   │
│   那个雨夜        │
│   消失的室友      │
│ 🍅 番茄小说 (1)   │
│   开局签到系统    │
│ 📰 头条 (0)       │
│   暂无            │
│ 🐉 起点 (0)       │
│   暂无            │
│ 未分类 (3)        │
│   测试作品        │
│   ...             │
└──────────────────┘
```

---

## 7. `shortStoryGen.ts` step agent

### 7.1 AgentSpec

```ts
{
  id: 'short_story_gen',
  name: '短篇生成',
  badge: 'AI',
  desc: '基于平台画像和TagSet一次性生成完整短篇',
  requiredContext: ['@设定数据', '@TagSet', '@平台画像'],
  systemPrompt: COMPACT_CONSTITUTION + 平台风格规则,
  approval: 'always',
}
```

### 7.2 提示词结构

- `systemPrompt`: COMPACT_CONSTITUTION（48 条写作铁律）+ 平台特定风格规则
- `userPrompt`: 
  - `buildGenerationPrompt(tagSet)` — TagSet → 结构化提示
  - `getPlatformProfile(platformId)` — 平台画像（风格/字数/禁忌）
  - 目标字数约束
  - 作品基础信息（书名/类型/简介，如有）
  - 角色/世界观设定（如有）

### 7.3 parseOutput

直接取 rawText 作为正文（不做 JSON 解析）。

---

## 8. commit_write 适配

现有 `commitWrite.ts` 已支持创建章节。短篇场景下需要额外处理：

1. 创建 Work（如 InspireWizard 还未创建）
2. 创建默认 Volume
3. 写入短篇正文到第 1 个 Chapter
4. 写入 `platformId` 到 WorkspaceSettings
5. 写入 TagSet 标签到 WorkspaceSettings.platformTags

---

## 9. 不做的

- ❌ 不做逐章审批（短篇通常 1-3 章，一篇一次审批足够）
- ❌ 不做 compress_expand（prompt 参数约束字数更省 token）
- ❌ 不做 consistency_check（短篇角色少，设定简单）
- ❌ 不做 extract_settings（短篇生成时设定已在上下文）
- ❌ 不新建 ReviewModal 组件（复用现有审阅弹窗机制）
- ❌ 不新建 publish 流程（已有 `formatForPlatform` + `getPlatformUrl` 够用）

---

## 10. 测试策略

| 测试类型 | 内容 |
|---------|------|
| 单元测试 | `buildShortStoryWorkflow()` 返回正确的步骤数、审批级别 |
| 单元测试 | `shortStoryGen` agent 的 prompt 包含预期平台标签 |
| 集成测试 | WorkflowRunner + shortStory workflow 完整流程 |
| 场景测试 | InspireWizard → 短篇配置 → 生成 → 审阅 → 写入 |

---

## 11. 实现优先级

1. `shortStoryGen.ts` — step agent（核心，无依赖）
2. `shortStory.ts` — workflow builder（依赖 step）
3. ChapterEditor + AiModal — 平台短篇入口（依赖 workflow）
4. InspireWizard — 立项后生成（依赖 1+2）
5. WorkTree 按平台分组视图（独立，可并行）
6. 测试（贯穿）
