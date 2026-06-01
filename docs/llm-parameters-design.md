# LLM 采样参数控制系统 — 开发文档

## 1. 参数总览

### 1.1 核心采样参数

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `temperature` | float | 0.0 ~ 2.0 | 0.7 | 控制输出随机性。低值→确定性高→适合设定/大纲；高值→创意强→适合正文/灵感 |
| `top_p` | float | 0.0 ~ 1.0 | 1.0 | 核采样阈值。与 temperature 互斥使用（官方建议只调一个） |
| `top_k` | int | 1 ~ 100 | 不限 | 仅 Anthropic/Gemini 支持。从概率最高的 K 个 token 中采样 |
| `frequency_penalty` | float | -2.0 ~ 2.0 | 0.0 | 仅 OpenAI 兼容。惩罚已出现 token 的频率，抑制重复 |
| `presence_penalty` | float | -2.0 ~ 2.0 | 0.0 | 仅 OpenAI 兼容。惩罚已出现 token，鼓励新话题 |
| `max_tokens` | int | 1 ~ 模型上限 | 模型默认 | 最大输出 token 数 |
| `stop` | string[] | 最多 4 个 | 空 | 停止序列。遇到则截断输出 |

### 1.2 参数对创作的影响

| 场景 | temperature | top_p | frequency_penalty | presence_penalty | 说明 |
|------|-------------|-------|-------------------|------------------|------|
| 设定/大纲生成 | 0.3 ~ 0.5 | 0.9 | 0.0 | 0.0 | 低随机性，输出结构化、可控 |
| 正文创作 | 0.7 ~ 1.0 | 0.95 | 0.1 ~ 0.3 | 0.1 ~ 0.2 | 中等随机性，兼顾创意和连贯 |
| 灵感/脑洞 | 1.0 ~ 1.5 | 1.0 | 0.3 ~ 0.5 | 0.3 ~ 0.5 | 高随机性，鼓励发散 |
| AI 消痕/润色 | 0.4 ~ 0.6 | 0.9 | 0.2 ~ 0.4 | 0.0 | 低随机性+去重，改写而非重写 |
| 续写（连贯） | 0.5 ~ 0.8 | 0.92 | 0.0 ~ 0.2 | 0.0 | 中低随机性，保持人设一致 |

## 2. 各平台 API 兼容性

### 2.1 OpenAI 兼容（DeepSeek / GPT / Ollama / 自定义）

```json
{
  "temperature": 0.7,
  "top_p": 0.9,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "max_tokens": 4096,
  "stop": ["\n\n\n"]
}
```

**约束**：
- DeepSeek thinking 模式不兼容 temperature/top_p（已跳过）
- frequency_penalty 和 presence_penalty 独立于 temperature/top_p

### 2.2 Anthropic Claude

```json
{
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40,
  "max_tokens": 4096,
  "stop_sequences": ["\n\n\n"]
}
```

**约束**：
- 不支持 frequency_penalty / presence_penalty
- thinking 模式下 temperature 固定为 1（不可设置）
- stop_sequences 替代 stop

### 2.3 Google Gemini

```json
{
  "generationConfig": {
    "temperature": 0.7,
    "topP": 0.9,
    "topK": 40,
    "maxOutputTokens": 4096,
    "stopSequences": ["\n\n\n"]
  }
}
```

**约束**：
- 不支持 frequency_penalty / presence_penalty
- thinking 模式下 temperature 固定为 1（不可设置）
- 字段名使用 camelCase

## 3. 数据结构设计

### 3.1 模型默认参数（ModelInfo 扩展）

```typescript
export interface SamplingParams {
  temperature?: number       // 0.0 ~ 2.0
  topP?: number              // 0.0 ~ 1.0
  topK?: number              // 1 ~ 100（仅 Anthropic/Gemini）
  frequencyPenalty?: number  // -2.0 ~ 2.0（仅 OpenAI 兼容）
  presencePenalty?: number   // -2.0 ~ 2.0（仅 OpenAI 兼容）
  maxTokens?: number         // 最大输出 token
  stop?: string[]            // 停止序列
}
```

每个 ModelInfo 新增 `defaultSampling?: SamplingParams` 字段，存储该模型的推荐默认值。

### 3.2 请求参数（AiChatRequest 扩展）

```typescript
export interface AiChatRequest {
  // ... 已有字段
  sampling?: SamplingParams  // 覆盖模型默认值
}
```

### 3.3 参数优先级

```
请求级 sampling > 模型级 defaultSampling > 硬编码默认值
```

## 4. UI 设计

### 4.1 位置

在 ModelSettings.vue 的「大模型」tab 中，每个启用的服务商卡片下方新增「采样参数」折叠区域。

### 4.2 布局

```
┌─────────────────────────────────────────────┐
│ [开关] DeepSeek                    api.deepseek.com │
│─────────────────────────────────────────────│
│ API Key    [••••••••••]              [已配置] │
│ 默认模型   [V4 Flash ▼]                      │
│                                             │
│ ▼ 采样参数                          [重置默认] │
│ ┌─────────────────────────────────────────┐ │
│ │ Temperature   [====●=====] 0.70         │ │
│ │ Top P         [========●=] 0.95         │ │
│ │ Frequency Pen [====●=====] 0.00         │ │
│ │ Presence Pen  [====●=====] 0.00         │ │
│ │ Max Tokens    [4096      ]              │ │
│ │ 停止序列      [+ 添加]                   │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 模型列表:                                    │
│   V4 Flash  128k ctx  ¥0.00027/0.0011  🧠  │
│   V4 Pro    128k ctx  ¥0.00055/0.00219 🧠  │
└─────────────────────────────────────────────┘
```

### 4.3 交互规则

- 滑块实时显示数值，松手后持久化
- 不支持的参数（如 Anthropic 的 frequency_penalty）自动隐藏
- 「重置默认」按钮恢复该服务商的推荐值
- 参数变更即时生效，无需重启

## 5. 实施步骤

### Step 1: 扩展数据结构
- `modelStore.ts`: ModelInfo 新增 `defaultSampling` 字段
- `useAiChat.ts`: AiChatRequest 新增 `sampling` 字段
- 定义 `SamplingParams` 接口

### Step 2: 修改 API 调用
- `callOpenAiCompat()`: 接收 SamplingParams，注入 body
- `callAnthropic()`: 接收 SamplingParams，过滤不支持的字段
- `callGemini()`: 接收 SamplingParams，转换字段名

### Step 3: 修改 UI
- `ModelSettings.vue`: 为每个服务商添加采样参数面板
- 滑块 + 数字输入混合控件
- 参数不支持时自动隐藏

### Step 4: 持久化
- 采样参数随 BuiltInProvider 一起序列化到 localStorage
- 自定义模型独立存储

## 6. 默认值表

| 服务商 | temperature | top_p | top_k | freq_pen | pres_pen | max_tokens |
|--------|-------------|-------|-------|----------|----------|------------|
| DeepSeek | 0.7 | 1.0 | — | 0.0 | 0.0 | 16384 |
| Anthropic | 0.7 | 1.0 | — | — | — | 16000 |
| OpenAI | 0.7 | 1.0 | — | 0.0 | 0.0 | 16000 |
| Gemini | 0.7 | 1.0 | — | — | — | 16384 |
| Ollama | 0.7 | 1.0 | — | 0.0 | 0.0 | 8192 |
| 自定义(OpenAI) | 0.7 | 1.0 | — | 0.0 | 0.0 | 8192 |
