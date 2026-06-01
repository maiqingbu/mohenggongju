<template>
  <div class="ag-root" :class="props.isDark === false ? 'ag-theme-light' : 'ag-theme-dark'">
    <!-- Header -->
    <div class="ag-header">
      <div class="ag-header-left">
        <button class="ag-header-tab" :class="{ active: mode === 'master' }" @click="mode = 'master'">自动工作流</button>
        <button class="ag-header-tab" :class="{ active: mode === 'agent' }" @click="mode = 'agent'">智能体</button>
      </div>
      <div class="ag-header-right">
      </div>
    </div>

    <!-- ═══════════════ 自动工作流 (Master) ═══════════════ -->
    <template v-if="mode === 'master'">
      <!-- R11: 待审任务恢复横幅 -->
      <div v-if="hasAwaitingTasks" class="ag-recover-banner">
        <div class="ag-recover-inner">
          <span>📋 有 {{ recoveredRuns.length }} 个待审任务</span>
          <button v-for="r in recoveredRuns" :key="r.id" class="ag-recover-btn" @click="restoreRun(r)">
            恢复 {{ r.workflowName }}（{{ formatTimeAgo(r.createdAt) }}）
          </button>
        </div>
      </div>
      <!-- R12: 上下文变更提示 -->
      <div v-if="contextChanged" class="ag-ctx-change">
        ⚠️ 作品设定已在外部变更，建议重做当前审阅步骤以确保一致性
        <button class="ag-recover-btn" @click="contextChanged = false">知道了</button>
      </div>

      <!-- Chat area -->
      <div class="ag-chat" ref="chatContainer">
        <div v-if="!messages.length && !streaming && !recommendations.length" class="ag-empty">
          <div class="ag-empty-icon ag-empty-icon-master">💬</div>
          <p class="ag-empty-title" v-if="hasCurrentWork">直接和 自动工作流 对话创作</p>
          <p class="ag-empty-title" v-else>尚未选择作品</p>
          <p class="ag-empty-hint" v-if="!hasCurrentWork">请先在左侧作品目录中选择或创建一部作品，才能开始自动创作。</p>
          <p class="ag-empty-hint" v-else>在下方输入需求，或点击推荐卡片开始；历史对话会自动恢复。</p>
          <button v-if="!hasCurrentWork" class="ag-empty-cta" @click="$emit('navigate', { panel: 'content', action: 'inspire' })">创建新作品</button>
        </div>
        <div v-for="(msg, i) in messages" :key="i" class="ag-msg" :class="msg.role">
          <template v-if="msg.role === 'approval' && msg.approvalCard">
            <ApprovalCard :card="msg.approvalCard" @decide="(d: any) => handleApprovalDecision(i, d)" />
          </template>
          <template v-else>
            <details v-if="msg.reasoning" class="ag-reasoning">
              <summary class="ag-reasoning-summary">🧠 思考过程 ({{ msg.reasoning.length }} 字)</summary>
              <pre class="ag-reasoning-text">{{ msg.reasoning }}</pre>
            </details>
            <div class="ag-msg-text">{{ msg.content }}</div>
          </template>
        </div>
        <div v-if="streaming" class="ag-msg assistant">
          <details v-if="reasoningBuf" class="ag-reasoning" open>
            <summary class="ag-reasoning-summary">🧠 正在思考...</summary>
            <pre class="ag-reasoning-text">{{ reasoningBuf }}</pre>
          </details>
          <div class="ag-msg-text">{{ streamText }}<span class="ag-cursor">|</span></div>
        </div>
      </div>

      <!-- Input area -->
      <div class="ag-input-area">
        <!-- 推荐操作：卡片式逐步引导 -->
      <div v-if="recommendations.length" class="ag-recommend-card" :class="{ 'ag-rec-nocurrent': !hasCurrentWork }">
        <div class="ag-rec-card-hd">
          <span class="ag-rec-step-badge">
            {{ currentRecIndex + 1 }} / {{ recommendations.length }}
          </span>
          <span class="ag-rec-stage-tag">{{ stageLabel(recommendations[currentRecIndex].stage) }}</span>
          <button class="ag-recommend-refresh" @click="scanSettings()" title="重新扫描">🔄</button>
        </div>
        <div class="ag-rec-card-body">
          <p class="ag-rec-card-label">{{ recommendations[currentRecIndex].label }}</p>
          <p class="ag-rec-card-desc">{{ recommendations[currentRecIndex].desc }}</p>
        </div>
        <div class="ag-rec-card-actions">
          <button class="ag-rec-card-btn primary" :class="{ 'ag-rec-done': _executedActions.has(recommendations[currentRecIndex].action) }" @click="executeRecommendation(recommendations[currentRecIndex])">
            {{ _executedActions.has(recommendations[currentRecIndex].action) ? '已完成' : ({ create_work_inspire: '灵感火花', create_work_manual: '手动新建', open_workspace_config: '填写作品信息' })[recommendations[currentRecIndex].action] || '执行此步骤' }}
          </button>
        </div>
        <div class="ag-rec-card-nav">
          <button class="ag-rec-nav-btn" :disabled="currentRecIndex === 0" @click="currentRecIndex--">◀ 上一步</button>
          <button class="ag-rec-nav-btn" :disabled="currentRecIndex >= recommendations.length - 1" @click="currentRecIndex++">下一步 ▶</button>
        </div>
      </div>

        <!-- Toolbar -->
        <div class="ag-toolbar">
          <button class="ag-toolbar-btn" @click="isQuoteModal = true">
            <span class="ag-at">@</span> 引用
          </button>
          <div class="ag-quick-cmd-wrap" @click.stop>
            <button class="ag-toolbar-btn ag-quick-cmd-btn" @click="showQuickCmd = !showQuickCmd">
              <span class="ag-bolt">⚡</span> 快捷指令
            </button>
            <div v-if="showQuickCmd" class="ag-quick-cmd-pop">
              <div class="ag-quick-cmd-hd">⚡ 快捷指令</div>
              <div class="ag-quick-cmd-body">
                <div class="ag-quick-cmd-group">生成</div>
                <button v-for="cmd in quickCmds.generate" :key="cmd" class="ag-quick-cmd-item"
                  @click="startWorkflow(extractWorkflowChapterCount(cmd))">{{ cmd }}</button>
              </div>
            </div>
          </div>
          <button class="ag-toolbar-btn" @click="showAgentSettings = true">Agent设置</button>
        </div>

        <!-- Textarea -->
        <div class="ag-input-wrap master">
          <div class="ag-input-mode-bar">
            <span class="ag-input-mode-badge master">⚙️ 自动工作流</span>
            <span class="ag-input-mode-hint">统筹调度 9 个专业智能体协同创作</span>
          </div>
          <textarea class="ag-textarea" v-model="draft" rows="3"
            placeholder="描述你的创作需求，或切换到下方的专业智能体进行针对性操作…"
            @keydown.enter.exact.prevent="send"></textarea>
        </div>

        <!-- Bottom bar -->
        <div class="ag-bottom-bar">
          <div class="ag-bottom-left">
            <!-- Approval switcher -->
            <div class="ag-bottom-select" @click.stop>
              <button class="ag-bottom-select-btn" @click="showApprovalMenu = !showApprovalMenu">
                {{ currentApproval }} <span class="ag-chevron">▾</span>
              </button>
              <div v-if="showApprovalMenu" class="ag-pop-menu">
                <button v-for="a in ['审批模式','全自动']" :key="a"
                  class="ag-pop-item" :class="{ active: currentApproval === a }"
                  @click="switchApprovalMode(a)">
                  <span v-if="currentApproval === a" class="ag-dot"></span>{{ a }}
                </button>
              </div>
            </div>
            <!-- Model selector -->
            <button class="ag-model-btn" @click="showModelSelector = true">
              {{ currentModel }} <span class="ag-chevron">▾</span>
            </button>
          </div>
          <button v-if="!streaming" class="ag-send-btn ag-send-master" @click="send" :disabled="!draft.trim()">
            <span class="ag-send-arrow">↑</span>
          </button>
          <button v-else class="ag-send-btn ag-send-master ag-send-stop" @click="stop">■</button>
        </div>
      </div>
    </template>

    <!-- ═══════════════ 智能体 (Agent) ═══════════════ -->
    <template v-else>
      <!-- Agent Selector -->
      <div class="ag-selector">
        <div class="ag-selector-card" @click="isAgentDropdown = !isAgentDropdown">
          <div class="ag-selector-left">
            <span class="ag-selector-icon">📄</span>
            <div>
              <div class="ag-selector-name">{{ currentAgent.name }}</div>
              <div class="ag-selector-desc">{{ currentAgent.desc }}</div>
            </div>
          </div>
          <div class="ag-selector-right">
            <span class="ag-selector-arrow" :class="{ open: isAgentDropdown }">▾</span>
            <button class="ag-selector-refresh" @click.stop="refreshAgentTasks">🔄 刷新</button>
          </div>
        </div>

        <!-- Agent Dropdown -->
        <div v-if="isAgentDropdown" class="ag-dropdown">
          <input class="ag-dropdown-search" v-model="agentSearch" placeholder="搜索智能体、能力或提示词方向" />
          <div class="ag-dropdown-filters">
            <button v-for="f in ['全部','大纲','正文','设定','脑洞','提示词']" :key="f"
              class="ag-filter-btn" :class="{ active: agentFilter === f }" @click="agentFilter = f">{{ f }}</button>
          </div>
          <div class="ag-dropdown-grid">
            <div v-for="a in filteredAgents" :key="a.id"
              class="ag-dropdown-card" :class="{ active: currentAgent.id === a.id }"
              @click="selectAgent(a)">
              <div class="ag-dropdown-card-top">
                <span class="ag-agent-icon-sm">📄</span>
                <span class="ag-agent-name-sm">{{ a.name }}</span>
              </div>
              <p class="ag-agent-desc-sm">{{ a.desc }}</p>
              <span class="ag-agent-tag-sm">{{ a.tag }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- R11: 待审任务恢复横幅 -->
      <div v-if="hasAwaitingTasks" class="ag-recover-banner">
        <div class="ag-recover-inner">
          <span>📋 有 {{ recoveredRuns.length }} 个待审任务</span>
          <button v-for="r in recoveredRuns" :key="r.id" class="ag-recover-btn" @click="restoreRun(r)">
            恢复 {{ r.workflowName }}（{{ formatTimeAgo(r.createdAt) }}）
          </button>
        </div>
      </div>

      <!-- Chat area -->
      <div class="ag-chat" ref="chatContainer">
        <div v-if="!messages.length && !streaming" class="ag-empty">
          <div class="ag-empty-icon">💬</div>
          <p class="ag-empty-title" v-if="hasCurrentWork">直接和 {{ currentAgent.name }} 对话创作</p>
          <p class="ag-empty-title" v-else>尚未选择作品</p>
          <p class="ag-empty-hint" v-if="!hasCurrentWork">请先在左侧作品目录中选择或创建一部作品，才能开始创作。</p>
          <p class="ag-empty-hint" v-else>在下方输入需求；历史对话会自动恢复。</p>
          <button v-if="!hasCurrentWork" class="ag-empty-cta" @click="$emit('navigate', { panel: 'content', action: 'inspire' })">创建新作品</button>
        </div>
        <div v-for="(msg, i) in messages" :key="i" class="ag-msg" :class="msg.role">
          <template v-if="msg.role === 'approval' && msg.approvalCard">
            <ApprovalCard :card="msg.approvalCard" @decide="(d: any) => handleApprovalDecision(i, d)" />
          </template>
          <template v-else>
            <details v-if="msg.reasoning" class="ag-reasoning">
              <summary class="ag-reasoning-summary">🧠 思考过程 ({{ msg.reasoning.length }} 字)</summary>
              <pre class="ag-reasoning-text">{{ msg.reasoning }}</pre>
            </details>
            <div class="ag-msg-text">{{ msg.content }}</div>
          </template>
        </div>
        <div v-if="streaming" class="ag-msg assistant">
          <details v-if="reasoningBuf" class="ag-reasoning" open>
            <summary class="ag-reasoning-summary">🧠 正在思考...</summary>
            <pre class="ag-reasoning-text">{{ reasoningBuf }}</pre>
          </details>
          <div class="ag-msg-text">{{ streamText }}<span class="ag-cursor">|</span></div>
        </div>
      </div>

      <!-- Input area -->
      <div class="ag-input-area">
        <!-- Association panel -->
        <div v-if="isAssociationOpen" class="ag-association">
          <div class="ag-association-hd">
            <span>选择本轮对话要携带的关联内容。当前快照 {{ _snapshotWordCount }} 字。</span>
            <button class="ag-association-refresh">🔄 刷新关联</button>
          </div>
          <div class="ag-association-grid">
            <div v-for="t in associationToggles" :key="t.key" class="ag-association-item">
              <div>
                <span class="ag-association-name">{{ t.label }}</span>
                <span class="ag-association-type">{{ t.type }}</span>
              </div>
              <button class="ag-toggle" :class="{ on: t.enabled }" @click="t.enabled = !t.enabled">
                <span class="ag-toggle-knob" :class="{ on: t.enabled }"></span>
              </button>
            </div>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="ag-toolbar">
          <button class="ag-toolbar-btn amber" @click="isAssociationOpen = !isAssociationOpen">
            📋 关联 <span class="ag-count-badge">5</span>
            <span class="ag-toolbar-arrow" :class="{ open: isAssociationOpen }">▾</span>
          </button>
          <button class="ag-toolbar-btn" @click="isQuoteModal = true">
            <span class="ag-at">@</span> 引用
          </button>
        </div>

        <!-- Textarea -->
        <div class="ag-input-wrap agent">
          <div class="ag-input-mode-bar">
            <span class="ag-input-mode-badge agent">{{ currentAgent.name }}</span>
            <span class="ag-input-mode-tag">{{ currentAgent.tag }}</span>
            <button class="ag-input-mode-switch" @click="mode = 'master'" title="切回自动工作流">↩ Master</button>
          </div>
          <textarea class="ag-textarea" v-model="draft" rows="3"
            :placeholder="`告诉${currentAgent.name}你的需求…`"
            @keydown.enter.exact.prevent="send"></textarea>
        </div>

        <!-- Bottom bar -->
        <div class="ag-bottom-bar">
          <div class="ag-bottom-left">
            <span class="ag-model">{{ currentModel }}</span>
            <span>Enter 发送，Shift + Enter 换行</span>
          </div>
          <button v-if="!streaming" class="ag-send-btn" @click="send" :disabled="!draft.trim()">发送</button>
          <button v-else class="ag-send-btn ag-send-stop" @click="stop">停止</button>
        </div>
      </div>
    </template>

    <!-- ═══════════════ @引用变量弹窗 (共享) ═══════════════ -->
    <div v-if="isQuoteModal" class="ag-quote-overlay" @click.self="isQuoteModal = false">
      <div class="ag-quote-root">
        <div class="ag-quote-header">
          <div>
            <h3 class="ag-quote-title">@ 引用变量</h3>
            <p class="ag-quote-desc">按需把基础信息、核心构架、总纲卷纲、正文上下文等变量插入到当前对话里。</p>
          </div>
          <button class="ag-quote-close" @click="isQuoteModal = false">✕</button>
        </div>
        <div class="ag-quote-search">
          <span class="ag-quote-at">@</span>
          <input type="text" v-model="quoteSearch" placeholder="搜索变量，例如：核心构架 / 当前章纲 / 前3章正文" />
        </div>
        <div class="ag-quote-body">
          <div class="ag-quote-grid">
            <div class="ag-quote-left">
              <div v-for="cat in quoteCategories" :key="cat.name" class="ag-quote-cat">
                <h4 class="ag-quote-cat-title"><span class="ag-quote-cat-dot"></span> {{ cat.name }}</h4>
                <div class="ag-quote-tags">
                  <button v-for="v in cat.vars" :key="v.key"
                    class="ag-quote-tag" :class="{ active: activeQuoteVar?.key === v.key }"
                    @click="insertQuoteVar(v.key)">
                    {{ v.label }}
                  </button>
                </div>
              </div>
            </div>
            <div class="ag-quote-right">
              <div class="ag-quote-info">
                <h4 class="ag-quote-info-title">变量说明</h4>
                <template v-if="activeQuoteVar">
                  <span class="ag-quote-info-badge">{{ activeQuoteVar.label }}</span>
                  <p class="ag-quote-info-desc">{{ activeQuoteVar.desc }}</p>
                </template>
                <p v-else class="ag-quote-info-empty">点击左侧变量查看说明，双击直接插入</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════ Agent设置弹窗 (Master only) ═══════════════ -->
    <div v-if="showAgentSettings" class="ag-modal-overlay" @click.self="showAgentSettings = false">
      <div class="ag-modal ag-settings-modal" @click.stop>
        <div class="ag-modal-header">
          <div>
            <span class="ag-badge-sm">环境配置</span>
            <h3 class="ag-modal-title">智能体设定</h3>
            <p class="ag-modal-desc">配置创作助手的工作模式与默认行为（作品级别保存）。</p>
          </div>
          <button class="ag-modal-close" @click="showAgentSettings = false">✕</button>
        </div>
        <div class="ag-modal-body">
          <!-- 1. 工作模式 -->
          <div class="ag-settings-block">
            <h4 class="ag-settings-block-title">工作模式</h4>
            <div class="ag-settings-dropdown" @click.stop>
              <button class="ag-settings-dropdown-btn" @click="workModeOpen = !workModeOpen">
                <span>{{ workMode }}</span>
                <span class="ag-chevron">▾</span>
              </button>
              <div v-if="workModeOpen" class="ag-settings-dropdown-menu">
                <button v-for="m in ['全自动 (AUTO)','审批 (APPROVAL)']" :key="m"
                  class="ag-settings-dropdown-item" :class="{ active: workMode === m }"
                  @click="selectWorkMode(m)">
                  <span v-if="workMode === m" class="ag-check">✓</span>{{ m }}
                </button>
              </div>
            </div>
            <p class="ag-settings-hint">
              <template v-if="workMode.includes('全自动')">所有步骤自动执行，审稿/消痕/写入不暂停。需先完成开篇才能切换到此模式。</template>
              <template v-else>关键步骤暂停等待审批：一致性警告、文风问题、写入落盘等节点由你确认后继续。适合开篇和精细控制。</template>
            </p>
            <!-- 自动提取设定（独立控制，不再硬编码 mode==='auto'） -->
            <div class="ag-settings-enhance">
              <div class="ag-settings-enhance-item">
                <div>
                  <div class="ag-settings-enhance-title">每章后自动提取设定条目</div>
                  <div class="ag-settings-hint">正文生成后自动分析并提取新角色/世界观/伏笔等设定数据，更新到设定库。</div>
                </div>
                <button class="ag-toggle" :class="{ on: autoExtractSettings }" @click="autoExtractSettings = !autoExtractSettings; saveAgentConfig()">
                  <span class="ag-toggle-knob" :class="{ on: autoExtractSettings }"></span>
                </button>
              </div>
              <div v-if="autoExtractSettings" class="ag-settings-enhance-item">
                <div>
                  <div class="ag-settings-enhance-title">包含卷边界检测</div>
                  <div class="ag-settings-hint">检测章节是否跨越卷边界，自动触发卷纲规划。</div>
                </div>
                <button class="ag-toggle" :class="{ on: volumeBoundaryCheck }" @click="volumeBoundaryCheck = !volumeBoundaryCheck; saveAgentConfig()">
                  <span class="ag-toggle-knob" :class="{ on: volumeBoundaryCheck }"></span>
                </button>
              </div>
            </div>
            <div class="ag-settings-row-inline">
              <span class="ag-settings-label">默认一次生成</span>
              <div class="ag-settings-dropdown ag-settings-dropdown-sm" @click.stop>
                <button class="ag-settings-dropdown-btn" @click="genCountOpen = !genCountOpen">
                  <span>{{ genCount }}</span>
                  <span class="ag-chevron">▾</span>
                </button>
                <div v-if="genCountOpen" class="ag-settings-dropdown-menu">
                  <button v-for="n in 5" :key="n"
                    class="ag-settings-dropdown-item" :class="{ active: n === genCount }"
                    @click="genCount = n; genCountOpen = false">{{ n }}</button>
                </div>
              </div>
              <span class="ag-settings-label">章/次</span>
            </div>
          </div>

          <!-- 2. 对话上下文 -->
          <div class="ag-settings-block">
            <h4 class="ag-settings-block-title">对话上下文</h4>
            <p class="ag-settings-hint">默认仅携带最近 10 条对话，可按条数/字数控制成本与延迟。</p>
            <div class="ag-settings-field-row">
              <div>
                <label class="ag-settings-label">最近消息条数</label>
                <input type="number" v-model.number="contextCount" class="ag-input ag-input-full" />
              </div>
              <div>
                <label class="ag-settings-label">最大字数（0=不限制）</label>
                <input type="number" v-model.number="contextWords" class="ag-input ag-input-full" />
              </div>
            </div>
          </div>

          <!-- 3. 生成增强 -->
          <div class="ag-settings-block">
            <h4 class="ag-settings-block-title">生成增强</h4>
            <p class="ag-settings-hint">可选启用"审稿/优化"增强能力；默认关闭以节省灵石。</p>
            <div class="ag-settings-enhance">
              <div class="ag-settings-enhance-item">
                <div>
                  <div class="ag-settings-enhance-title">正文后自动审稿→优化改进（可选）</div>
                  <div class="ag-settings-hint">开启后：全自动模式会全自动执行；审批模式在写入正文后弹出提示，可选择跳过。</div>
                </div>
                <button class="ag-toggle" :class="{ on: autoReview }" @click="autoReview = !autoReview; saveAgentConfig()">
                  <span class="ag-toggle-knob" :class="{ on: autoReview }"></span>
                </button>
              </div>
              <div class="ag-settings-enhance-item">
                <div>
                  <div class="ag-settings-enhance-title">正文后自动消除AI痕迹（可选）</div>
                  <div class="ag-settings-hint">开启后：全自动模式会全自动执行；审批模式在写入正文后弹出提示，可选择跳过。若同时开启"自动审稿→优化改进"，会先审稿优化完成后再消痕。</div>
                </div>
                <button class="ag-toggle" :class="{ on: autoClean }" @click="autoClean = !autoClean; saveAgentConfig()">
                  <span class="ag-toggle-knob" :class="{ on: autoClean }"></span>
                </button>
              </div>
            </div>
          </div>

          <!-- 4. 设定数据字段配置 -->
          <div class="ag-settings-block ag-settings-block--fields">
            <div class="ag-settings-block-hd">
              <h4 class="ag-settings-block-title">设定数据字段配置</h4>
              <button class="ag-text-btn" @click="restoreFieldDefaults">恢复默认</button>
            </div>
            <p class="ag-settings-hint">
              自定义「角色/设定/伏笔」卡片的展示字段与中文标签；也会影响 @设定数据 的注入摘要（优先注入 inCard=true）。建议只保留对长期剧情判断有用的信息，避免上下文过长。<br>
              <span class="ag-mono-hint">path 示例: initial.fields.profession / initial.raw_text / state.status</span>
            </p>
            <div class="ag-settings-fields-add">
              <select class="ag-select" v-model="fieldType">
                <option value="role">角色</option>
                <option value="setting">设定</option>
                <option value="foreshadow">伏笔</option>
              </select>
              <button class="ag-btn-sm ag-btn-ghost" @click="addField">+ 添加字段</button>
            </div>
            <div class="ag-settings-fields-list">
              <div v-for="(field, index) in fields" :key="index" class="ag-settings-field-card">
                <button class="ag-settings-field-delete" @click="removeField(index)" title="删除">✕</button>
                <div class="ag-settings-field-row">
                  <div>
                    <label class="ag-settings-label">中文标签</label>
                    <input type="text" v-model="field.label" class="ag-input ag-input-full" />
                  </div>
                  <div>
                    <label class="ag-settings-label">字段路径 (path)</label>
                    <input type="text" v-model="field.path" class="ag-input ag-input-full ag-input-mono" />
                  </div>
                </div>
                <div class="ag-settings-field-bottom">
                  <select class="ag-select ag-select-sm" v-model="field.renderType">
                    <option value="kv">KV (一行)</option>
                    <option value="chips">标签 (chips)</option>
                    <option value="text">文本 (多行)</option>
                  </select>
                  <div class="ag-settings-field-checks">
                    <label><input type="checkbox" v-model="field.showCard" /> 卡片预览</label>
                    <label><input type="checkbox" v-model="field.showDetail" /> 详情展示</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="ag-modal-footer">
          <button class="ag-btn-sm ag-btn-ghost" @click="showAgentSettings = false">取消</button>
          <button class="ag-btn-sm ag-btn-primary" @click="saveAgentConfig(); showAgentSettings = false">✓ 保存设置</button>
        </div>
      </div>
    </div>

    <!-- ═══════════════ 模型选择弹窗 (Master only) ═══════════════ -->
    <div v-if="showModelSelector" class="ag-modal-overlay" @click.self="showModelSelector = false">
      <div class="ag-modal ag-model-modal" @click.stop>
        <div class="ag-modal-header">
          <div>
            <h3 class="ag-modal-title">选择 AI 模型 / 通道</h3>
            <p class="ag-modal-desc">所有模型来自后台配置，已自动过滤不可用通道。选择后应用将写入右侧对话栏。</p>
          </div>
          <button class="ag-modal-close" @click="showModelSelector = false">✕</button>
        </div>
        <div class="ag-modal-body">
          <div v-for="group in modelGroups" :key="group.provider" class="ag-model-group">
            <h4 class="ag-model-provider">{{ group.provider }} <span class="ag-model-count">{{ group.models.length }}</span></h4>
            <div class="ag-model-grid">
              <button v-for="m in group.models" :key="m.name"
                class="ag-model-card" :class="{ active: currentModel === m.name }"
                @click="currentModel = m.name">
                <span v-if="m.isDefault" class="ag-model-badge">默认</span>
                <span v-else-if="currentModel === m.name" class="ag-model-dot-active"></span>
                <div class="ag-model-name">{{ m.name }}</div>
                <div class="ag-model-price" v-if="m.price">{{ m.price }}</div>
                <div class="ag-model-status" v-if="currentModel === m.name">当前</div>
              </button>
            </div>
          </div>
        </div>
        <div class="ag-modal-footer ag-modal-footer-between">
          <div class="ag-model-selected">待应用：<strong>{{ currentModel }}</strong></div>
          <div class="ag-modal-footer-actions">
            <button class="ag-btn-sm ag-btn-ghost" @click="showModelSelector = false">取消</button>
            <button class="ag-btn-sm ag-btn-primary" @click="showModelSelector = false">应用</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 二次审核弹窗 -->
  <div v-if="showReviewModal" class="ag-review-overlay" @click.self="showReviewModal = false">
    <div class="ag-review-modal">
      <div class="ag-review-header">
        <div>
          <h3>🔍 二次审核</h3>
          <p class="ag-review-desc">检测已写章节的矛盾、设定偏离、伏笔回收等问题</p>
        </div>
        <button class="ag-review-close" @click="showReviewModal = false">✕</button>
      </div>

      <div class="ag-review-body">
        <!-- 章节选择 -->
        <div class="ag-review-section">
          <div class="ag-review-section-hd">
            <span class="ag-review-section-title">选择审核范围</span>
            <span class="ag-review-section-hint">已选 {{ selectedChapterCount }} / {{ reviewChapters.length }} 章</span>
            <button class="ag-review-link" @click="toggleAllChapters">{{ allChaptersSelected ? '取消全选' : '全选' }}</button>
          </div>
          <div class="ag-review-chapters">
            <label v-for="ch in reviewChapters" :key="ch.id" class="ag-review-chapter-item">
              <input type="checkbox" v-model="ch.selected" :disabled="reviewRunning" />
              <span class="ag-review-chapter-title">{{ ch.title }}</span>
              <span class="ag-review-chapter-meta">{{ ch.wordCount || 0 }} 字</span>
            </label>
          </div>
          <p v-if="!reviewChapters.length" class="ag-review-empty">当前作品暂无章节，请先创作内容。</p>
        </div>

        <!-- 操作按钮 -->
        <div class="ag-review-actions">
          <button class="ag-review-btn quick" @click="runQuickCheck" :disabled="reviewRunning || !selectedChapterCount">
            <span v-if="reviewRunning && reviewMode === 'quick'" class="ag-spinner-sm"></span>
            ⚡ 快速检测
          </button>
          <button class="ag-review-btn deep" @click="runDeepReview" :disabled="reviewRunning || !selectedChapterCount">
            <span v-if="reviewRunning && reviewMode === 'deep'" class="ag-spinner-sm"></span>
            🔬 深度审稿 (AI)
          </button>
          <span class="ag-review-hint">快速检测基于锚点比对；深度审稿调用 AI 做全面分析。</span>
        </div>

        <!-- 进度 -->
        <div v-if="reviewRunning" class="ag-review-progress">
          <div class="ag-spinner"></div>
          <p>{{ reviewStatus }}</p>
        </div>

        <!-- 结果 -->
        <div v-if="!reviewRunning && reviewRun && reviewResults.length > 0" class="ag-review-results">
          <div class="ag-review-summary">
            <span class="ag-review-stat error">🔴 {{ errorCount }} 错误</span>
            <span class="ag-review-stat warn">🟡 {{ warningCount }} 警告</span>
            <span class="ag-review-stat ok" v-if="reviewResults.length - errorCount - warningCount > 0">✅ {{ reviewResults.length - errorCount - warningCount }} 通过</span>
            <button class="ag-review-link" @click="copyReviewResults">📋 复制结果</button>
          </div>
          <div v-for="(group, idx) in groupedResults" :key="idx" class="ag-review-group">
            <h4 class="ag-review-group-title">{{ group.chapter }}</h4>
            <div v-for="(issue, i) in group.issues" :key="i" class="ag-review-issue" :class="issue.level === 'ERROR' ? 'ag-review-issue-error' : 'ag-review-issue-warn'">
              <span class="ag-review-issue-level">{{ issue.level === 'ERROR' ? '🔴' : '🟡' }}</span>
              <span class="ag-review-issue-type">[{{ issue.type }}]</span>
              <span class="ag-review-issue-msg">{{ issue.message }}</span>
            </div>
          </div>
        </div>

        <!-- 无问题 -->
        <div v-if="!reviewRunning && reviewRun && reviewResults.length === 0" class="ag-review-pass">
          ✅ 未发现矛盾或不一致，审核通过。
        </div>
      </div>

      <div class="ag-review-footer">
        <button class="ag-review-close-btn" @click="showReviewModal = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onUnmounted, watch } from 'vue'

const props = defineProps<{ isDark?: boolean; settingsMgr?: SettingsManager }>()
import { useModelStore } from '../stores/modelStore'
import { useWorkStore } from '../stores/workStore'
import { showConfirm } from '../composables/useConfirm'
import { sendAiMessageStream } from '../composables/useAiChat'
import { expandPrompt, type ResolverCtx } from '../composables/useContextResolver'
import { SettingsManager } from '../composables/useSettings'
import { WorkspaceSettings } from '../composables/useWorkspaceSettings'
import { getOutline, upsertOutline } from '../composables/useOutlines'
import { WorkflowRunner } from '../agents/runner'
import { outlineAgent } from '../agents/outline'
import { chapterAgent } from '../agents/chapter'
import { bodyAgent } from '../agents/body'
import { createConsistencyCheckAgent } from '../agents/steps/consistencyCheck'
import { createCommitWriteAgent } from '../agents/steps/commitWrite'
import { createExtractSettingsAgent } from '../agents/steps/extractSettings'
import { createStyleReviewAgent } from '../agents/steps/styleReview'
import { createLengthCheckAgent } from '../agents/steps/lengthCheck'
import { createCompressExpandAgent } from '../agents/steps/compressExpand'
import { createParagraphFixAgent } from '../agents/steps/paragraphFix'
import { createVolumeBoundaryCheckAgent } from '../agents/steps/volumeBoundaryCheck'
import { createLengthNormalizerAgent } from '../agents/steps/lengthNormalizer'
import { createReviserAgent } from '../agents/steps/reviser'
import { createSettingDetectorAgent } from '../agents/steps/settingDetectorAgent'
import { createInfoDetectorAgent } from '../agents/steps/infoDetectorAgent'
import { createOutlineDetectorAgent } from '../agents/steps/outlineDetectorAgent'
import { createPreflightCheckAgent } from '../agents/steps/preflightCheckAgent'
import { ideaAgent } from '../agents/idea'
import { settingAgent } from '../agents/setting'
import { characterAgent } from '../agents/character'
import { buildContinueChapterWorkflow } from '../agents/workflows/continueChapter'
import { detectLifecycleStage, buildOpeningWorkflow, buildContinueWithPreflightWorkflow, formatLifecycleResult } from '../agents/lifecycle'
import { playNotifySound, playClickSound } from '../composables/useEditorSettings'
import { findAwaitingRuns, getRun, updateRun, type WorkflowRunRecord } from '../agents/persistence'
import ApprovalCard from './ApprovalCard.vue'
import type { Decision, ChatMessage, ApprovalCardData, ConsistencyIssue } from '../agents/types'
import { useMessage } from 'naive-ui'
import { createProjectOrchestrator } from '../composables/useProjectOrchestrator'

const emit = defineEmits<{
  (e: 'navigate', payload: { panel: string; action: string }): void
  (e: 'settings-updated'): void
}>()
const message = useMessage()
const mode = ref<'master' | 'agent'>('master')
const draft = ref('')
const messages = ref<ChatMessage[]>([])
const streamText = ref('')
const streaming = ref(false)
const reasoningBuf = ref('')
const chatContainer = ref<HTMLElement | null>(null)
let stopFlag = false
let _activeAbort: (() => void) | null = null
const _scanTimers: ReturnType<typeof setTimeout>[] = []
const _snapshotWordCount = ref(0) // D2: 当前关联快照字数（template 中渲染）

// ── R6: Runner 实例 ──
const runner = new WorkflowRunner()
runner.registerAgents([
  // 灵感 & 设定阶段
  ideaAgent,
  settingAgent,
  characterAgent,
  createSettingDetectorAgent(),
  createInfoDetectorAgent(),
  // 大纲阶段
  outlineAgent,
  chapterAgent,
  createOutlineDetectorAgent(),
  // 创作阶段
  bodyAgent,
  // 续写前置检测
  createPreflightCheckAgent(),
  // 质量保障
  createConsistencyCheckAgent(),
  createCommitWriteAgent(),
  createExtractSettingsAgent(),
  createStyleReviewAgent(),
  createLengthCheckAgent(),
  createCompressExpandAgent(),
  createParagraphFixAgent(),
  createVolumeBoundaryCheckAgent(),
  createLengthNormalizerAgent(),
  createReviserAgent(),
])

// R11: 持久化钩子 — 进入 awaiting 时存完整 Runner 快照
runner.setSaveAwaitingHook((_stepId, _output) => {
  const snap = runner.serialize()
  // 存到当前活跃的 run 记录（如果有的话）
  const activeRunId = _activeRunId
  if (activeRunId) {
    updateRun(activeRunId, {
      status: 'awaiting_approval',
      awaitingStep: _stepId,
      awaitingOutput: _output,
      awaitingSince: Date.now(),
      runnerSnapshot: JSON.stringify(snap),
    })
  }
})

let _activeRunId: string | null = null

// 将 Runner 事件转写为 chat messages
const _awaitingStepIds = new Set<string>()

runner.on('step:start', (step) => {
  messages.value.push({ role: 'system' as const, content: `🔄 开始执行：${step.id}`, level: 'info' })
})
runner.on('step:chunk', (text) => {
  streamText.value += text
})
runner.on('step:awaiting', (card: ApprovalCardData) => {
  _awaitingStepIds.add(card.stepId)
  // 将审阅卡插入 messages
  messages.value.push({
    role: 'approval' as const,
    content: '',
    approvalCard: card,
  })
  streaming.value = false
  streamText.value = ''
  scrollToBottom()
  playClickSound()
})
runner.on('step:decided', (stepId, decision) => {
  const msg = [...messages.value].reverse().find(m => m.role === 'approval' && m.approvalCard?.stepId === stepId)
  if (msg && msg.approvalCard) {
    msg.approvalCard.status = 'decided'
    msg.approvalCard.decision = decision
  }
  // 推完成总结消息
  const card = msg?.approvalCard
  const agentName = card?.agentName || ''
  const actionMap: Record<string, string> = { approve: '已通过', edit_approve: '已编辑通过', redo: '已重做', edit_redo: '已反馈重做', skip: '已跳过', abort: '已中止' }
  const action = actionMap[decision.type] || '已处理'
  messages.value.push({
    role: 'system' as const,
    content: `✅ ${agentName} · ${stepId} — ${action}`,
    level: 'info',
  })
  scrollToBottom()
})
runner.on('step:writeBack', (stepId, data) => {
  if (_awaitingStepIds.has(stepId)) {
    _awaitingStepIds.delete(stepId)
    return // 阻塞步骤的完成消息已由 step:decided 处理
  }
  // 非阻塞步骤：推完成消息
  const summary = summarizeStepOutput(stepId, data)
  if (summary) {
    messages.value.push({ role: 'system' as const, content: `✅ ${summary}`, level: 'info' })
    scrollToBottom()
  }
})
runner.on('run:done', () => {
  messages.value.push({ role: 'system' as const, content: '✅ 工作流执行完成', level: 'info' })
  streaming.value = false
  scrollToBottom()
  playNotifySound()
  // 刷新推荐
  _scanTimers.push(window.setTimeout(() => scanSettings(), 500))
})
runner.on('run:aborted', () => {
  messages.value.push({ role: 'system' as const, content: '⊘ 工作流已中止', level: 'warn' })
  streaming.value = false
  scrollToBottom()
})
runner.on('run:failed', (err) => {
  messages.value.push({ role: 'system' as const, content: '❌ 工作流执行失败: ' + err.message, level: 'error' })
  streaming.value = false
  scrollToBottom()
  _scanTimers.push(window.setTimeout(() => scanSettings(), 500))
})

function handleApprovalDecision(msgIndex: number, decision: Decision) {
  try {
    runner.decide(decision)
  } catch (e: any) {
    messages.value.push({ role: 'system' as const, content: '⚠️ ' + e.message, level: 'error' })
  }
}

// ── R11: 跨重启恢复 ──
const recoveredRuns = ref<WorkflowRunRecord[]>([])
const hasAwaitingTasks = computed(() => recoveredRuns.value.length > 0)

function scanRecoverableTasks() {
  recoveredRuns.value = findAwaitingRuns()
}
scanRecoverableTasks() // 组件挂载时扫一次

/** Agent 刷新：扫描待恢复任务 + 刷新推荐列表 */
function refreshAgentTasks() {
  scanRecoverableTasks()
  scanSettings()
}

// 切换 自动工作流/智能体 模式时自动刷新
watch(mode, () => {
  scanRecoverableTasks()
  scanSettings()
})

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

async function restoreRun(run: WorkflowRunRecord) {
  if (runner.status === 'running') {
    message.warning('当前有任务正在运行，请等待完成后再恢复')
    return
  }
  if (!run.runnerSnapshot) {
    // 旧格式兼容：仅有 awaitingOutput，无完整快照 → 跳回旧逻辑
    if (!run.awaitingStep || !run.awaitingOutput) return
    messages.value.push({
      role: 'system' as const, content: '⚠️ 待审任务快照不完整，无法恢复', level: 'warn',
    })
    return
  }

  messages.value.push({
    role: 'system' as const,
    content: `🔄 恢复待审任务：${run.workflowName}（${formatTimeAgo(run.awaitingSince ? new Date(run.awaitingSince).toISOString() : run.createdAt)}）`,
    level: 'info',
  })

  // R11: 从完整快照恢复 Runner 状态
  const snap = JSON.parse(run.runnerSnapshot)
  runner.restore(snap)

  // G3: 用真实 LLM 工厂
  runner.setLlmCall(createLlmCall())

  // 恢复上下文解析器
  const workId = snap.ctx?.workId as number
  if (workId) runner.setResolverCtx(await buildResolverCtx(workId))

  _activeRunId = run.id
  updateRun(run.id, { status: 'running' })
  recoveredRuns.value = recoveredRuns.value.filter(r => r.id !== run.id)

  // R11: 从恢复点继续执行（重新进入审批门控，重新 emit step:awaiting 卡）
  runner.resumeFromRestore('approval').catch((e: any) => {
    messages.value.push({ role: 'system' as const, content: '❌ 恢复失败: ' + (e.message || String(e)), level: 'error' })
  })
}

// ── G1: 创建真实 LLM 调用工厂 ──
// 根据 currentModel 选择字符串解析出 provider 和 modelId
function resolveModelFromSelection(selection: string, providers: any[]) {
  let provider = providers[0]
  let modelId: string | undefined
  if (selection) {
    for (const p of providers) {
      const models = 'models' in p ? p.models : [{ id: p.modelId, name: p.name }]
      const match = models.find((m: any) =>
        m.name === selection || m.id === selection ||
        `${p.name} / ${m.name}` === selection
      )
      if (match) {
        provider = p
        modelId = match.id
        break
      }
    }
  }
  return { provider, modelId }
}

function createLlmCall(): (sp: string, up: string, onChunk?: (text: string) => void) => Promise<string> {
  const modelStore = useModelStore()
  const providers = modelStore.getEnabledProviders()

  if (providers.length === 0) {
    return async () => { throw new Error('未配置模型') }
  }

  const resolved = resolveModelFromSelection(currentModel.value, providers)
  const provider = resolved.provider
  let modelId = resolved.modelId

  // 初始化 currentModel（首次调用时设置）
  if (!currentModel.value) {
    if ('models' in provider) {
      const m = provider.models[0]
      currentModel.value = `${provider.name} / ${m.name}`
      modelId = m.id
    } else {
      currentModel.value = provider.name
      modelId = provider.modelId
    }
  }

  const providerId = provider.id
  const finalModelId = modelId || ('defaultModelId' in provider ? provider.defaultModelId : undefined)

  return (systemPrompt: string, userPrompt: string, onChunk?: (text: string) => void) => {
    return new Promise((resolve, reject) => {
      // 检查模型是否支持思考
      const modelInfo = 'models' in provider
        ? provider.models.find((m: any) => m.id === finalModelId || m.id === modelId)
        : null
      const supportsThink = modelInfo?.supportsThink ?? false

      const { result } = sendAiMessageStream(
        { providerId, modelId: finalModelId, messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], stream: true, think: supportsThink },
        {
          onChunk: (text: string) => onChunk?.(text),
          onDone: (full: string) => resolve(full),
          onError: (err: string) => reject(new Error(err)),
        },
      )
      result.catch(reject)
    })
  }
}

// ── 大纲生成 ──
// ── G1: 从快捷指令文本提取章数 ──
function extractWorkflowChapterCount(cmd: string): number {
  const m = cmd.match(/生成第(\d+)/)
  return m ? parseInt(m[1]) : 3
}

// ── G1: workflow 入口 ──
async function startWorkflow(chapterCount: number) {
  const { useWorkRepo } = await import('../composables/useWorkRepo')
  const repo = useWorkRepo()
  const workId = repo.currentWorkId.value
  if (!workId) {
    messages.value.push({ role: 'system' as const, content: '⚠️ 请先选择一部作品，左侧目录选择一个作品后再试', level: 'warn' })
    return
  }

  // 检查模型
  const enabledProviders = useModelStore().getEnabledProviders()
  if (!enabledProviders.length) {
    messages.value.push({ role: 'system' as const, content: '⚠️ 请先在设置中配置并启用模型（设置 → 大模型）', level: 'error' })
    return
  }

  // ── 前置：确保有卷 ──
  const vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
  let volId: number | null = vols.length > 0 ? vols[0].id : null
  if (!volId) {
    volId = await repo.addVolume(workId, '默认卷')
  }
  if (!volId) {
    messages.value.push({ role: 'system' as const, content: '⚠️ 创建卷失败', level: 'error' })
    return
  }

  // 扫描目标卷中已有章节（按 sort_order）及章纲
  const allChs = Object.values(repo.chapterMap.value).flat()
  const totalChs = allChs.length
  const startChapterNo = totalChs + 1

  const existingInVol = (repo.chapterMap.value[volId] || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
  const existingByOrder = new Map<number, any>()
  for (const ch of existingInVol) {
    existingByOrder.set(ch.sort_order + 1, ch) // sort_order 从0起，章号从1起
  }

  // 检测是否有章纲目录冲突：对即将创建的章号，检查是否已有章纲
  const outlineChecks: Promise<any>[] = []
  for (let i = 0; i < chapterCount; i++) {
    const chNo = startChapterNo + i
    const existing = existingByOrder.get(chNo)
    if (existing) {
      outlineChecks.push(getOutline('chapter', existing.id).then(o => ({ chNo, existing, hasOutline: !!o })))
    }
  }
  const outlineResults = await Promise.all(outlineChecks)
  const existingOutlineChs = outlineResults.filter(r => r.hasOutline)
  if (existingOutlineChs.length > 0) {
    const names = existingOutlineChs.map(r => `第${r.chNo}章「${r.existing.title || ''}」`).join('、')
    showConfirm(`检测到以下章节已有章纲：\n${names}\n\n续写将覆盖章纲内容。是否继续？`, () => {
      doContinue()
    })
    return
  }
  await doContinue()
  return

  async function doContinue() {
  // 章节必须已存在（由章纲生成自动创建），开篇/续写不再自动创建章节
  const newChapterIds: number[] = []
  let reusedCount = 0
  const missingChapters: number[] = []
  for (let i = 0; i < chapterCount; i++) {
    const chNo = startChapterNo + i
    const existing = existingByOrder.get(chNo)

    if (existing) {
      // 复用已有章节 ID
      newChapterIds.push(existing.id)
      reusedCount++
      if (existing.content && existing.content.trim().length > 100) {
        messages.value.push({ role: 'system' as const, content: `ℹ️ 第${chNo}章已有正文（${existing.word_count || 0}字），续写将覆盖旧内容`, level: 'info' })
      }
    } else {
      missingChapters.push(chNo)
    }
  }

  // 如果有缺失章节，提示用户先生成章纲
  if (missingChapters.length > 0) {
    messages.value.push({
      role: 'system' as const,
      content: `⚠️ 以下章节尚未创建，请先生成章纲（章纲会自动创建带标题的章节）：第${missingChapters.join('、')}章`,
      level: 'error',
    })
    return
  }

  if (newChapterIds.length === 0) {
    messages.value.push({ role: 'system' as const, content: '⚠️ 创建章节失败', level: 'error' })
    return
  }

  if (reusedCount > 0) {
    messages.value.push({ role: 'system' as const, content: `📋 复用已有章节 ${reusedCount} 个`, level: 'info' })
  }

  // 读取用户设定的每章目标字数
  const wsSettings = new WorkspaceSettings(workId as number)
  const wordsPerChapter = wsSettings.data.wordsPerChapter || 2000

  // 映射审批模式 → WorkMode
  const modeMap: Record<string, 'auto' | 'approval'> = {
    '全自动': 'auto', '审批模式': 'approval',
  }
  const mode = modeMap[currentApproval.value] || 'approval'

  // 获取卷信息（用于全自动模式的卷边界检测）
  const volumes = repo.volumes.value.filter((v: any) => v.work_id === workId)
  const chapterMap = repo.chapterMap.value
  let currentVolumeId = 0
  let currentVolumeChapterCount = 0

  // 找到当前续写章节所属的卷
  for (const vol of volumes) {
    const volChapters = chapterMap[vol.id] || []
    const hasTargetChapter = volChapters.some((ch: any) =>
      newChapterIds.includes(ch.id)
    )
    if (hasTargetChapter) {
      currentVolumeId = vol.id
      currentVolumeChapterCount = volChapters.length
      break
    }
  }

  // 如果没找到，使用第一卷
  if (!currentVolumeId && volumes.length > 0) {
    currentVolumeId = volumes[0].id
    currentVolumeChapterCount = (chapterMap[volumes[0].id] || []).length
  }

  const steps = buildContinueChapterWorkflow({
    chapterCount: newChapterIds.length,  // 用实际创建成功的数量
    startChapterNo,
    wordsPerChapter,
    chapterIds: newChapterIds,           // 真实 DB chapterId
    autoExtractSettings: autoExtractSettings.value,
    volumeInfo: volumeBoundaryCheck.value ? {
      currentVolumeId,
      currentVolumeChapterCount,
      totalVolumes: volumes.length,
    } : undefined,
  })

  // 注入真实 LLM 调用
  runner.setLlmCall(createLlmCall())

  // 创建持久化记录
  const { generateRunId, createRun } = await import('../agents/persistence')
  const runId = generateRunId()
  _activeRunId = runId
  createRun({
    id: runId, status: 'running', mode, workflowName: `续写 ${chapterCount} 章`,
    totalSteps: steps.length, currentStep: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })

  // 清空上次累积（G6）
  runner.setContext({ workId: workId as number, chapterIds: newChapterIds, _pendingWrites: [] })

  // 构建上下文解析器（供 agent 步骤的 requiredContext 使用）
  runner.setResolverCtx(await buildResolverCtx(workId as number))

  // Agent 增强设置：插入审稿/消痕步骤
  if (autoReview.value || autoClean.value) {
    const enhanced: typeof steps = []
    for (const s of steps) {
      enhanced.push(s)
      if (s.id.startsWith('gen_body_')) {
        if (autoReview.value) {
          enhanced.push({
            id: `review_${s.id}`, agentId: 'consistency_check',
            inputs: { action: 'check', target: '@ctx.lastOutput', chapterNo: s.inputs.chapterNo },
            approval: 'on_warning', skippable: true,
            next: autoClean.value ? `clean_${s.id}` : s.next,
          })
        }
        if (autoClean.value) {
          enhanced.push({
            id: `clean_${s.id}`, agentId: 'body',
            inputs: { ...s.inputs, action: 'unmark', content: '@ctx.lastOutput' },
            approval: 'on_warning', skippable: true,
            next: s.next,
          })
        }
        // 修正 gen_body 的 next 指向第一个插入的步骤（修复 self-reference bug）
        const insertedCount = (autoReview.value ? 1 : 0) + (autoClean.value ? 1 : 0)
        if (insertedCount > 0) {
          enhanced[enhanced.length - insertedCount - 1].next = enhanced[enhanced.length - insertedCount].id
        }
      }
    }
    // 用增强后的步骤替换
    enhanced.length && (steps.length = 0, steps.push(...enhanced))
  }

  const isOpening = totalChs === 0
  messages.value.push({
    role: 'system' as const,
    content: isOpening
      ? `🚀 开始写开篇 ${newChapterIds.length} 章（${currentApproval}模式）`
      : `🚀 续写 ${newChapterIds.length} 章（${currentApproval}模式）`,
    level: 'info',
  })
  scrollToBottom()

  try {
    await runner.run(steps, mode)
  } catch (e: any) {
    console.error('[AgentPanel] runner.run failed:', e)
    messages.value.push({
      role: 'system' as const, content: '❌ 工作流异常: ' + (e.message || String(e)), level: 'error',
    })
  } finally {
    _activeRunId = null
  }
  }
}

// ── R12: 上下文变更检测 ──
let _ctxChangeVersion = 0
const contextChanged = ref(false)

function markContextChanged() {
  _ctxChangeVersion++
  contextChanged.value = true
}

/** 外部（OutlinePanel 等）修改设定后调此方法通知 AgentPanel */
function notifyContextChange() {
  markContextChanged()
}

defineExpose({ notifyContextChange, scanRecoverableTasks, hasAwaitingTasks, refreshOrchestrator: scanSettings })

// ── R12: 退出确认 ──
// 浏览器 dev 模式：beforeunload（组件卸载时清理，避免重复注册）
const _beforeUnloadHandler = (e: BeforeUnloadEvent) => {
  if (hasAwaitingTasks.value) {
    e.preventDefault()
    e.returnValue = '有未完成的审阅任务，关闭后可在下次启动时继续。确定离开？'
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', _beforeUnloadHandler)
}
onUnmounted(() => {
  // 清理 LLM 流：中止进行中的请求，防止后台继续消耗 tokens
  stopFlag = true
  if (_activeAbort) {
    _activeAbort()
    _activeAbort = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', _beforeUnloadHandler)
    _scanTimers.forEach(t => clearTimeout(t))
    _scanTimers.length = 0
  }
})


// ── 设定扫描 & 推荐（编排器驱动）──

function stageLabel(stage: string) {
  const map: Record<string, string> = {
    fix: '补充设定', expand: '拓展', extract: '提取', write: '开始创作',
    S0: '创建作品', S1: '选择作品', S2: '填写信息', S3: '补充设定',
    S4: '写总纲', S5: '写卷纲', S6: '写章纲',
    S7: '黄金开篇', S8: '续写',
  }
  return map[stage] || stage
}

// Agent 单次生成弹窗（大纲/审稿/脑洞）
const showReviewModal = ref(false)

// ── 二次审核 ──
interface ReviewChapter { id: number; title: string; wordCount: number; content: string; selected: boolean }
const reviewChapters = ref<ReviewChapter[]>([])
const reviewRunning = ref(false)
const reviewMode = ref<'quick' | 'deep' | ''>('')
const reviewStatus = ref('')
const reviewRun = ref(false)
const reviewResults = ref<ConsistencyIssue[]>([])
const selectedChapterCount = computed(() => reviewChapters.value.filter(c => c.selected).length)
const allChaptersSelected = computed(() => reviewChapters.value.length > 0 && reviewChapters.value.every(c => c.selected))
const errorCount = computed(() => reviewResults.value.filter(r => r.level === 'ERROR').length)
const warningCount = computed(() => reviewResults.value.filter(r => r.level === 'WARNING').length)
const groupedResults = computed(() => {
  const groups: { chapter: string; issues: ConsistencyIssue[] }[] = []
  const map = new Map<number, ConsistencyIssue[]>()
  for (const r of reviewResults.value) {
    const list = map.get(r.chapter) || []
    list.push(r)
    map.set(r.chapter, list)
  }
  for (const [ch, issues] of map) {
    const chInfo = reviewChapters.value.find(c => c.id === ch)
    groups.push({ chapter: chInfo?.title || `第${ch}章`, issues })
  }
  return groups
})

async function loadReviewChapters() {
  try {
    const { useWorkRepo: _r } = await import('../composables/useWorkRepo')
    const repo = _r()
    const workId = repo.currentWorkId.value
    if (!workId) { reviewChapters.value = []; return }
    const chs = Object.values(repo.chapterMap.value).flat()
    reviewChapters.value = chs.map((c: any) => ({
      id: c.id || 0,
      title: c.title || `第${c.chapter_no || '?'}章`,
      wordCount: (c.content || '').length,
      content: c.content || '',
      selected: true,
    }))
  } catch { reviewChapters.value = [] }
}

watch(showReviewModal, async (v) => {
  if (v) {
    reviewRun.value = false
    reviewResults.value = []
    reviewStatus.value = ''
    await loadReviewChapters()
  }
})

function toggleAllChapters() {
  const val = !allChaptersSelected.value
  reviewChapters.value.forEach(c => { c.selected = val })
}

async function runQuickCheck() {
  reviewRunning.value = true; reviewMode.value = 'quick'; reviewRun.value = true
  reviewResults.value = []; reviewStatus.value = '正在加载检测引擎...'
  try {
    const { runConsistencyCheck } = await import('../agents/steps/consistencyCheck')
    const selected = reviewChapters.value.filter(c => c.selected)
    const allIssues: ConsistencyIssue[] = []
    for (let i = 0; i < selected.length; i++) {
      const ch = selected[i]
      reviewStatus.value = `正在检测：${ch.title} (${i + 1}/${selected.length})`
      await new Promise(r => setTimeout(r, 30)) // 让 UI 刷新
      const issues = await runConsistencyCheck(ch.content, ch.id)
      allIssues.push(...issues)
    }
    reviewResults.value = allIssues
    reviewStatus.value = allIssues.length === 0 ? '✅ 检测完成，未发现问题' : `检测完成：${allIssues.filter(i => i.level === 'ERROR').length} 错误，${allIssues.filter(i => i.level === 'WARNING').length} 警告`
  } catch (e: any) {
    reviewStatus.value = '检测失败: ' + (e.message || String(e))
  } finally {
    reviewRunning.value = false
  }
}

async function runDeepReview() {
  reviewRunning.value = true; reviewMode.value = 'deep'; reviewRun.value = true
  reviewResults.value = []; reviewStatus.value = '正在准备 AI 审稿...'
  try {
    const selected = reviewChapters.value.filter(c => c.selected)
    const allContent = selected.map(c => `【${c.title}】\n${c.content.slice(0, 3000)}`).join('\n\n---\n\n')
    if (!allContent.trim()) { reviewStatus.value = '所选章节无正文内容'; reviewRunning.value = false; return }

    // 加载作品设定作为审核基准
    const { useWorkRepo: _r } = await import('../composables/useWorkRepo')
    const repo = _r()
    const workId = repo.currentWorkId.value
    let settingsContext = ''
    if (workId) {
      try {
        const ws = new (await import('../composables/useWorkspaceSettings')).WorkspaceSettings(workId)
        const d = ws.data
        const parts: string[] = []
        if (d.title) parts.push(`书名：${d.title}`)
        if (d.worldSetting) parts.push(`世界观：${d.worldSetting}`)
        if (d.mainCharacter) parts.push(`主角设定：${d.mainCharacter}`)
        if (d.powerSystem) parts.push(`力量体系：${d.powerSystem}`)
        if (d.cheatAbility) parts.push(`金手指：${d.cheatAbility}`)
        if (parts.length) settingsContext = '【作品设定基准】\n' + parts.join('\n') + '\n\n'
      } catch {}
    }

    reviewStatus.value = '正在调用 AI 深度分析...'
    const prompt = `你是一位资深小说编辑。请对以下小说章节进行深度审稿，检测：

1. **剧情矛盾**：前后情节不一致、逻辑漏洞、时间线错乱
2. **人设偏离**：角色行为与设定性格不符、能力忽高忽低
3. **伏笔回收**：已埋下但未回收的伏笔（标记为 WARNING）
4. **设定冲突**：与世界设定/力量体系矛盾的内容
5. **节奏问题**：拖沓或跳跃过快的段落

${settingsContext}【待审章节】
${allContent.slice(0, 12000)}

请输出纯 JSON 数组格式（不要包含 markdown 代码块标记）：
[
  { "level": "ERROR", "type": "剧情矛盾", "message": "具体描述...", "chapter": 1 },
  { "level": "WARNING", "type": "伏笔未收", "message": "具体描述...", "chapter": 2 }
]
如果没有问题，输出空数组 []。`

    const store = useModelStore()
    const providers = store.getEnabledProviders()
    const firstProvider = providers[0]
    const modelId = firstProvider && 'models' in firstProvider ? firstProvider.models[0]?.id : (firstProvider && 'modelId' in firstProvider ? (firstProvider as import('../stores/modelStore').CustomProvider).modelId : '')

    if (!modelId) { reviewStatus.value = '未配置 AI 模型，请先在模型设置中启用一个模型'; reviewRunning.value = false; return }

    const llmCall = createLlmCall()
    const result = await llmCall(prompt, '请输出纯 JSON 审核结果。')
    const json = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed)) {
      reviewResults.value = parsed.map((r: any) => ({
        level: r.level === 'ERROR' ? 'ERROR' : 'WARNING',
        type: r.type || '未分类',
        message: r.message || '',
        chapter: r.chapter || 1,
      }))
    }
    reviewStatus.value = reviewResults.value.length === 0 ? '✅ 深度审稿完成，未发现问题' : `深度审稿完成：${reviewResults.value.filter(i => i.level === 'ERROR').length} 错误，${reviewResults.value.filter(i => i.level === 'WARNING').length} 警告`
  } catch (e: any) {
    reviewStatus.value = '审稿失败: ' + (e.message || String(e))
  } finally {
    reviewRunning.value = false
  }
}

function copyReviewResults() {
  const text = groupedResults.value.map(g => {
    const lines = g.issues.map(i => `  [${i.level}] [${i.type}] ${i.message}`)
    return `${g.chapter}\n${lines.join('\n')}`
  }).join('\n\n')
  navigator.clipboard.writeText(`审核报告\n${'='.repeat(40)}\n\n${text}`).then(() => {
    message.success('已复制审核结果')
  }).catch(() => {})
}


// ── 项目编排器（替代旧 scanSettings）──
const _settingsMgr = new SettingsManager()
const orchestrator = createProjectOrchestrator(_settingsMgr, (panel: string, action: string) => {
  // 编排器的 navigate 回调 → 映射到现有弹窗/面板
  const NAV: Record<string, { panel: string; action: string }> = {
    'workspace_config/open':       { panel: 'workspace_config', action: 'open' },
    'outline_config/gen_main':     { panel: 'outline_config', action: 'ai-generate-main' },
    'outline_config/gen_volume':   { panel: 'outline_config', action: 'ai-generate-volume' },
    'outline_config/gen_chapter':  { panel: 'outline_config', action: 'ai-generate-chapter-structured' },
    'content/opening':             { panel: 'content', action: 'opening' },
    'content/continue':            { panel: 'content', action: 'continue' },
    'content/updateSettings':      { panel: 'settings', action: 'ai-update-settings' },
    'content/inspire':             { panel: 'content', action: 'inspire' },
    'settings/open':               { panel: 'settings', action: 'open' },
  }
  const nav = NAV[`${panel}/${action}`]
  if (nav) emit('navigate', nav)
})

// 兼容旧模板接口：将编排器的单卡片包装为数组格式
const recommendations = computed(() => {
  const card = orchestrator.currentCard.value
  if (!card) return []
  return [{ label: card.message, action: card.buttons[0]?.action || '', desc: card.buttons.map(b => b.label).join(' / '), stage: card.stage, _card: card }]
})
const currentRecIndex = ref(0)

// 跟踪已执行的推荐，用于状态转换时推完成消息
const _lastExecuted = ref<{ stage: string; label: string; action: string } | null>(null)
const _executedActions = new Set<string>()

let _scanning = false
async function scanSettings() {
  if (_scanning) return
  _scanning = true
  try {
    const { useWorkRepo: _r } = await import('../composables/useWorkRepo')
    const repo = _r()
    const workId = repo.currentWorkId.value
    if (!workId) { orchestrator.currentCard.value = null; return }
    if (workId) { try { await _settingsMgr.load(workId) } catch {} }
    const prevCard = orchestrator.currentCard.value
    await orchestrator.refresh()
    const newCard = orchestrator.currentCard.value

    // 检测推荐阶段是否推进：之前执行过的步骤现在不再是当前推荐 → 补完成消息
    if (_lastExecuted.value && prevCard?.stage !== newCard?.stage) {
      const done = _lastExecuted.value
      messages.value.push({
        role: 'system' as const,
        content: `✅ ${done.label} — 已完成`,
        level: 'info',
      })
      _lastExecuted.value = null
    }
  } finally {
    _scanning = false
  }
}

// 上下文开关（对齐 ChapterEditor AI_EDITOR_CONFIG）
const outlineSwitches = [
  { key:'base', label:'基础信息', desc:'基础信息大类全文拼接', enabled:true },
  { key:'core', label:'核心构架', desc:'核心构架大类全文拼接', enabled:true },
  { key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密等', enabled:true },
]
const openingSwitches = [
  { key:'outline', label:'总纲', desc:'全书总纲', enabled:true },
  { key:'base', label:'基础信息', desc:'基础信息大类全文拼接', enabled:true },
  { key:'core', label:'核心构架', desc:'核心构架大类全文拼接', enabled:true },
  { key:'worldview', label:'世界观', desc:'世界观摘要', enabled:true },
  { key:'cheat', label:'金手指', desc:'金手指/外挂机制', enabled:true },
  { key:'powerSystem', label:'力量体系', desc:'力量/等级/修炼体系', enabled:true },
  { key:'protagonist', label:'主角', desc:'主角核心构架', enabled:true },
  { key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密等', enabled:true },
  { key:'chapterOutline', label:'本章章纲', desc:'当前章节大纲', enabled:true },
]

async function executeRecommendation(rec: any) {
  const action = rec._card?.buttons?.[0]?.action || rec.action
  if (!action) return

  // 特殊动作（非编排器标准动作）
  if (action === 'review') { showReviewModal.value = true; return }
  if (action === 'brainstorm') {
    draft.value = '请根据当前作品设定，脑洞拓展 5 个可能的剧情发展方向，每个方向给出一句话描述。'
    send(); return
  }

  // 记录已执行
  _executedActions.add(action)
  const label = rec.label || rec._card?.message || action
  messages.value.push({
    role: 'system' as const,
    content: `▶ 开始：${label}`,
    level: 'info',
  })
  scrollToBottom()

  // 编排器标准动作 → handleAction 处理（内部调 navigate 回调）
  await orchestrator.handleAction(action)
  _lastExecuted.value = { stage: rec.stage, label, action }
  // 刷新下一张推荐卡片
  await scanSettings()
}

// 审核：本地一致性检测
async function runConsistencyReview() {
  const { useWorkRepo: _r } = await import('../composables/useWorkRepo')
  const repo = _r()
  const workId = repo.currentWorkId.value
  if (!workId) { messages.value.push({ role: 'system', content: '⚠️ 请先选择作品', level: 'warn' }); return }

  const chs = Object.values(repo.chapterMap.value).flat()
  if (!chs.length) { messages.value.push({ role: 'system', content: '⚠️ 没有章节可审核', level: 'warn' }); return }

  messages.value.push({ role: 'system', content: '🔍 正在审核已写章节...', level: 'info' })

  try {
    const { createConsistencyCheckAgent } = await import('../agents/steps/consistencyCheck')
    const agent = createConsistencyCheckAgent()
    const allContent = chs.map((c: any) => c.content || '').filter(Boolean).join('\n\n')
    const result = await agent.localExecute!({ action: 'check', target: 'all', chapterNo: String(chs.length) }, {
      workId,
      chapterContent: allContent,
      chapterCount: chs.length,
    })
    const parsed = JSON.parse(result)
    const warnings = parsed.warnings || []
    if (warnings.length === 0) {
      messages.value.push({ role: 'system', content: '✅ 审核通过，未发现矛盾或不一致', level: 'info' })
    } else {
      const errCount = warnings.filter((w: any) => w.level === 'ERROR').length
      const warnCount = warnings.filter((w: any) => w.level === 'WARNING').length
      messages.value.push({
        role: 'system',
        content: `⚠️ 审核完成：${errCount} 个错误，${warnCount} 个警告\n${warnings.map((w: any, i: number) => `${i + 1}. [${w.level}] ${w.message}`).join('\n')}`,
        level: errCount > 0 ? 'error' : 'warn',
      })
    }
  } catch (e: any) {
    messages.value.push({ role: 'system', content: '⚠️ 审核失败: ' + (e.message || String(e)), level: 'error' })
  }
}

// 设定提取：LLM 从章节正文中提取实体写入 SettingsManager
async function startSettingsExtraction() {
  const { useWorkRepo } = await import('../composables/useWorkRepo')
  const repo = useWorkRepo()
  const workId = repo.currentWorkId.value
  if (!workId) return

  const chs = Object.values(repo.chapterMap.value).flat()
  if (!chs.length) { messages.value.push({ role: 'system', content: '⚠️ 没有章节可提取', level: 'warn' }); return }

  messages.value.push({ role: 'system', content: '🔍 正在从已写章节提取设定信息...', level: 'info' })

  const allContent = chs.map((c: any) => c.content || '').filter(Boolean).join('\n\n')
  if (!allContent) { messages.value.push({ role: 'system', content: '⚠️ 章节正文为空', level: 'warn' }); return }

  const prompt = `你是一个小说设定提取专家。请从以下小说正文中提取所有可识别的：
- 角色（character）：姓名、性别、年龄、身份、性格、外貌、能力、关系
- 世界观设定（world_setting）：时代、地理、势力、规则、魔法体系等
- 物品（item）：重要道具、金手指、法器、特殊物品等
- 伏笔（foreshadowing）：已埋下的线索

请输出纯 JSON 格式：
{
  "entities": [
    { "type": "character", "name": "角色名", "summary": "50字摘要", "structuredData": { "gender": "", "identity": "", "personality": "", "abilities": [], "relationships": [{"name":"","relation":""}] } },
    { "type": "world_setting", "name": "设定名", "summary": "描述", "structuredData": { "category": "", "description": "" } },
    { "type": "item", "name": "物品名", "summary": "描述", "structuredData": { "owner": "", "function": "" } }
  ]
}

正文内容：
${allContent.slice(0, 8000)}`

  try {
    const llmCall = createLlmCall()
    const result = await llmCall(prompt, '请提取设定。')
    const json = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(json)

    const mgr = props.settingsMgr || new (await import('../composables/useSettings')).SettingsManager()
    try { await mgr.load(workId) } catch {}

    let added = 0
    for (const entity of (parsed.entities || [])) {
      if (!entity.type || !entity.name) continue
      const existing = mgr.listByType(entity.type).find((e: any) => e.name === entity.name)
      if (!existing) {
        await mgr.add({
          type: entity.type,
          name: entity.name,
          summary: entity.summary || '',
          source: 'ai_extraction',
          structuredData: entity.structuredData || {},
        })
        added++
      }
    }
    await mgr.save(workId)
    messages.value.push({ role: 'system', content: `✅ 已提取 ${added} 个新实体到设定面板`, level: 'info' })
    emit('settings-updated')
    _scanTimers.push(window.setTimeout(() => scanSettings(), 200))
  } catch (e: any) {
    messages.value.push({ role: 'system', content: '⚠️ 设定提取失败: ' + (e.message || String(e)), level: 'error' })
  }
}

// 作品切换时自动扫描（同步调用，确保在 setup 上下文中注册 watch）
import { useWorkRepo as _useWorkRepoForWatch } from '../composables/useWorkRepo'
const _repoForWatch = _useWorkRepoForWatch()
const hasCurrentWork = computed(() => _repoForWatch.currentWorkId.value != null)

// 同步初始化：确保首屏就有推荐卡片（不等 async scanSettings）
if (_repoForWatch.currentWorkId.value) {
  orchestrator.currentCard.value = {
    id: 'init_loading', stage: 'loading', message: '正在扫描作品状态…', buttons: [], prominent: false,
  }
}

watch(() => _repoForWatch.currentWorkId.value, () => {
  scanSettings()
  loadAgentConfig()
}, { immediate: true })

// 监听数据变化自动刷新推荐卡片
// chapterMap 和 works 来自 Pinia store，是项目中唯一对编排器可见的响应式数据源
let _scanDebounce: ReturnType<typeof setTimeout> | undefined
function _debouncedScan() {
  clearTimeout(_scanDebounce)
  _scanDebounce = setTimeout(() => scanSettings(), 300)
}
const _chapterSnapshot = computed(() => {
  const map = _repoForWatch.chapterMap.value
  let count = 0; let lastModified = 0; let hasContent = false
  for (const chs of Object.values(map)) {
    for (const ch of chs as any[]) {
      count++
      if (ch.updated_at) lastModified = Math.max(lastModified, new Date(ch.updated_at).getTime())
      if (ch.content && ch.content.length > 10) hasContent = true
    }
  }
  return { count, lastModified, hasContent }
})
watch(_chapterSnapshot, () => _debouncedScan())

const _worksSnapshot = computed(() => _repoForWatch.works.value.length)
watch(_worksSnapshot, () => _debouncedScan())

const MASTER_SYSTEM_PROMPT = `你是一个专业的小说创作助手，名为"创作大师"。你是作者的创作合伙人，负责统筹协调9个专业智能体协同完成小说创作。

## 可调度的专业智能体
| 智能体 | 专长 |
|--------|------|
| 总纲设计师 | 全书结构总控：主题、主线、三幕推进、分卷规划 |
| 卷纲设计师 | 单卷拆解：升级链、冲突线、信息释放节奏 |
| 章纲设计师 | 章节细纲：节拍推进、钩子安排、前后衔接 |
| 正文大师 | 正文执行：续写、重写、润色、去AI味 |
| 角色设计师 | 角色创建：人设卡、人物弧光、关系网 |
| 设定架构师 | 世界观构建：规则体系、势力格局、渐进披露 |
| 伏笔管理师 | 线索管理：伏笔铺设、追踪、回收检测 |
| 灵感火花 | 创意激发：脑洞拓展、反转设计、爽点配方 |
| 提示词优化师 | 工具优化：提示词分析、调试、模板化 |

## 工作方式
1. 先理解用户意图，判断属于哪个专业领域
2. 建议用户切换到对应的智能体（点击 Agent 选择器）以获得更专业的输出
3. 如果用户在 Master 模式下直接提问，你会从通用的角度给出建议
4. 所有建议必须与作品已有设定保持连贯，引用设定数据时标注来源

请用中文回复。`

// ── Master mode state ──
const showQuickCmd = ref(false)
const showApprovalMenu = ref(false)
const showAgentSettings = ref(false)
const showModelSelector = ref(false)
const currentApproval = ref('审批模式')
const currentModel = ref('')

// 工具栏模式切换（带全自动模式检测）
function switchApprovalMode(mode: string) {
  if (mode === '全自动') {
    const check = canUseAutoMode()
    if (!check.allowed) {
      messages.value.push({
        role: 'system' as const,
        content: check.message!,
        level: 'warn',
      })
      scrollToBottom()
      showApprovalMenu.value = false
      return
    }
  }
  currentApproval.value = mode
  showApprovalMenu.value = false
}

const quickCmds = reactive({
  generate: ['生成第51-100章章纲', '生成第4-6章正文', '生成第51章正文'],
})

// Agent settings — 从 WorkspaceSettings 读/写
const workMode = ref('审批 (APPROVAL)')
const workModeOpen = ref(false)
const genCount = ref(1)
const genCountOpen = ref(false)
const contextCount = ref(10)
const contextWords = ref(0)
const autoReview = ref(false)
const autoClean = ref(false)
const autoExtractSettings = ref(false)
const volumeBoundaryCheck = ref(false)
const fieldType = ref('role')
const fields = reactive<{ label: string; path: string; renderType: string; showCard: boolean; showDetail: boolean; inCard: boolean }[]>([])

async function loadAgentConfig() {
  const ws = new (await import('../composables/useWorkspaceSettings')).WorkspaceSettings(_repoForWatch.currentWorkId.value || 0)
  const cfg = ws.data.agentConfig
  if (!cfg) return
  const modeLabel = cfg.workMode === 'auto' ? '全自动' : '审批模式'
  workMode.value = cfg.workMode === 'auto' ? '全自动 (AUTO)' : '审批 (APPROVAL)'
  currentApproval.value = modeLabel  // 同步到工具栏审批模式
  genCount.value = cfg.genCount || 1
  contextCount.value = cfg.contextCount ?? 10
  contextWords.value = cfg.contextWords ?? 0
  autoReview.value = cfg.autoReview ?? false
  autoClean.value = cfg.autoClean ?? false
  autoExtractSettings.value = cfg.autoExtractSettings ?? (cfg.workMode === 'auto')
  volumeBoundaryCheck.value = cfg.volumeBoundaryCheck ?? (cfg.workMode === 'auto')
  fields.length = 0
  if (cfg.fields?.length) fields.push(...(cfg.fields as typeof fields))
}
async function saveAgentConfig() {
  if (!_repoForWatch.currentWorkId.value) return
  const ws = new (await import('../composables/useWorkspaceSettings')).WorkspaceSettings(_repoForWatch.currentWorkId.value!)
  ws.update({
    agentConfig: {
      workMode: workMode.value.includes('全自动') ? 'auto' : 'approval',
      genCount: genCount.value,
      contextCount: contextCount.value,
      contextWords: contextWords.value,
      autoReview: autoReview.value,
      autoClean: autoClean.value,
      autoExtractSettings: autoExtractSettings.value,
      volumeBoundaryCheck: volumeBoundaryCheck.value,
      fields: [...fields],
    },
  })
}
watch(showAgentSettings, (v) => { if (v) loadAgentConfig() })
watch(currentApproval, () => {
  // 工具栏审批模式变化时同步持久化
  const mode: 'auto' | 'approval' = currentApproval.value === '全自动' ? 'auto' : 'approval'
  if (_repoForWatch.currentWorkId.value) {
    const ws = new WorkspaceSettings(_repoForWatch.currentWorkId.value!)
    ws.update({ agentConfig: { ...ws.data.agentConfig, workMode: mode } })
  }
})

const fieldsDefault = [
  { label: '职业', path: 'initial.fields.profession', renderType: 'kv', showCard: true, showDetail: true, inCard: true },
  { label: '人设标签', path: 'initial.fields.persona_tags', renderType: 'chips', showCard: true, showDetail: true, inCard: true },
  { label: '角色简介', path: 'initial.fields.bio', renderType: 'text', showCard: true, showDetail: true, inCard: false },
  { label: '状态', path: 'state.status', renderType: 'kv', showCard: true, showDetail: true, inCard: false },
  { label: '位阶/等级', path: 'state.rank', renderType: 'kv', showCard: true, showDetail: true, inCard: false },
  { label: '身体状态（长期）', path: 'state.physical_status', renderType: 'text', showCard: true, showDetail: true, inCard: false },
  { label: '心理结构/立场（长期）', path: 'state.psychological_state', renderType: 'text', showCard: true, showDetail: true, inCard: false },
  { label: '性格/行为模式', path: 'state.characterization', renderType: 'text', showCard: true, showDetail: true, inCard: false },
  { label: '技能/能力', path: 'state.skills', renderType: 'chips', showCard: true, showDetail: true, inCard: false },
  { label: '关键物品', path: 'state.items', renderType: 'chips', showCard: true, showDetail: true, inCard: true },
]

// 检测是否可以使用全自动模式（必须已完成开篇）
function canUseAutoMode(): { allowed: boolean; message?: string } {
  const workId = _repoForWatch.currentWorkId.value
  if (!workId) {
    return { allowed: false, message: '⚠️ 请先选择一部作品' }
  }

  // 检测是否有正文内容（已完成开篇）
  const chapterMap = _repoForWatch.chapterMap.value
  const volumes = _repoForWatch.volumes.value.filter((v: any) => v.work_id === workId)

  for (const vol of volumes) {
    const chapters = chapterMap[vol.id] || []
    for (const ch of chapters) {
      if (ch.content && ch.content.trim().length > 100) {
        return { allowed: true }
      }
    }
  }

  return {
    allowed: false,
    message: '⚠️ 全自动模式需要先完成开篇创作\n\n请使用审批模式完成以下步骤：\n1. 填写作品信息\n2. 补充设定（人物、世界观等）\n3. 生成总纲、卷纲、章纲\n4. 完成黄金开篇（前3章）\n\n完成开篇后即可切换到全自动模式进行续写。'
  }
}

function selectWorkMode(m: string) {
  // 如果选择全自动模式，先检测是否允许
  if (m.includes('全自动')) {
    const check = canUseAutoMode()
    if (!check.allowed) {
      messages.value.push({
        role: 'system' as const,
        content: check.message!,
        level: 'warn',
      })
      scrollToBottom()
      return
    }
  }
  workMode.value = m
  workModeOpen.value = false
  saveAgentConfig()
}
function addField() {
  fields.push({ label: '新字段', path: 'state.status', renderType: 'kv', showCard: false, showDetail: true, inCard: false })
  saveAgentConfig()
}
function removeField(index: number) { fields.splice(index, 1); saveAgentConfig() }
function restoreFieldDefaults() {
  fields.length = 0
  fieldsDefault.forEach(f => fields.push({ ...f }))
  saveAgentConfig()
}

/** 为非阻塞步骤生成人类可读的完成摘要 */
function summarizeStepOutput(stepId: string, data: Record<string, unknown>): string {
  if (stepId.startsWith('length_check')) {
    const current = String(data.currentWords ?? data.current ?? '?')
    const target = String(data.targetWords ?? data.target ?? '?')
    const status = String(data.status ?? data.verdict ?? '')
    return `字数检测 · ${current}/${target} 字 — ${status || '完成'}`
  }
  if (stepId.startsWith('paragraph_fix')) {
    const fixed = data.fixedCount ?? data.fixed ?? data.changes
    if (fixed !== undefined && Number(fixed) > 0) return `段落修复 · 合并 ${fixed} 处单句段`
    return `段落修复 · 结构良好，无需调整`
  }
  if (stepId.startsWith('extract_settings')) {
    const count = data.extractedCount ?? data.count ?? data.total
    if (count !== undefined && Number(count) > 0) return `设定提取 · 新增 ${count} 条`
    return `设定提取 · 无新增条目`
  }
  if (stepId.startsWith('volume_boundary_check')) {
    const verdict = String(data.verdict ?? data.action ?? '')
    return `卷边界检测 · ${verdict || '已检测'}`
  }
  if (stepId.startsWith('load_context')) {
    return `章纲规划 · 已完成`
  }
  return ''
}

const modelGroups = computed(() => {
  const modelStore = useModelStore()
  const providers = modelStore.getEnabledProviders()
  return providers.map(p => {
    if ('models' in p) {
      return {
        provider: p.name,
        models: p.models.map(m => ({
          name: `${p.name} / ${m.name}`,
          modelId: m.id,
          providerId: p.id,
          price: `输入 ¥${m.pricing.inputPerKTokens}/K · 输出 ¥${m.pricing.outputPerKTokens}/K`,
          isDefault: m.id === p.defaultModelId,
        })),
      }
    } else {
      return {
        provider: p.name,
        models: [{
          name: p.name,
          modelId: p.modelId,
          providerId: p.id,
          price: '' as string | undefined,
          isDefault: true,
        }],
      }
    }
  })
})

// ── Agent mode state ──
const isAgentDropdown = ref(false)
const agentSearch = ref('')
const agentFilter = ref('全部')
interface AgentDef {
  id: string; name: string; badge: string; desc: string; tag: string; cat: string; systemPrompt: string
}

const currentAgent = ref<AgentDef>({
  id: 'outline', name: '总纲设计师', badge: '专业版',
  desc: '全书结构总控。负责主题、主线、卖点节奏、人物成长与三幕推进。',
  tag: '结构总控', cat: '大纲',
  systemPrompt: `你是一位资深的小说总纲设计师，专精于长篇网文的结构设计。

## 核心职责
1. 根据作品设定（书名/类型/世界观/主角人设）设计全书总纲
2. 确定主题思想与核心卖点，确保与目标平台风格匹配
3. 规划三幕/多幕结构，每幕有明确的高潮点和转折
4. 设计人物成长弧线：主角从初始状态到最终状态的完整变化路径
5. 划分卷结构：每卷有独立目标、冲突链和收束点

## ⚠️ 字数约束（最重要）
- 必须严格依据「@目标字数」和「@每章目标字数」来规划全书结构
- 计算总卷数 = 目标总字数 ÷ (每卷章节数 × 每章目标字数)
- 每卷章节数由用户指定（默认50章），每章字数由「@每章目标字数」决定
- 严禁自行增减总字数，所有规划必须围绕用户设定的字数展开
- 示例：目标200万字、每章2000字、每卷50章 → 共200卷、总计1000章

## 输出规范
- 总纲以"核心梗概（100字）→ 主题语句 → 三幕结构 → 分卷规划"的顺序呈现
- 每卷说明：卷名 / 主角等级区间 / 核心冲突 / 关键事件 / 新增角色
- 标注卖点节奏：爽点频率、情感节点、大高潮位置
- 禁止输出与已有设定冲突的内容；引用设定数据需打 @变量名 标注

## 工作方式
- 先理解用户意图，再基于已有设定给出建议
- 对设定缺失的部分，先向用户确认再填充
- 输出后主动询问：是否需要调整节奏、增加冲突密度或重新分配卷长`,
})

const allAgents: AgentDef[] = [
  currentAgent.value,
  {
    id: 'volume', name: '卷纲设计师', badge: '专业版', desc: '单卷结构设计师。负责卷级目标拆解、升级链规划、冲突线与情感线编排。', tag: '卷级规划', cat: '大纲',
    systemPrompt: `你是一位小说卷纲设计师，专精于单卷结构的设计与拆解。

## 核心职责
1. 基于总纲中该卷的定位，细化卷内结构
2. 设计卷级升级链：主角在本卷中能力/地位的阶梯式提升
3. 编排冲突线：主冲突 + 至少 1 条支线冲突，标明起承转合
4. 规划信息释放节奏：世界观揭秘、伏笔铺设、新角色登场时机
5. 确保卷末有强钩子，驱动读者继续阅读

## ⚠️ 字数约束
- 必须依据「@目标字数」和「@每章目标字数」来规划卷内章节数
- 每卷章节数 = 用户指定的章节数（默认50章），每章字数 = @每章目标字数
- 严禁自行增减总字数，所有规划必须围绕用户设定的字数展开

## 输出规范
- 卷纲格式：卷定位（1句话）→ 升级链 → 冲突线（主+支）→ 章节分配 → 关键事件时间线
- 每个关键事件标注：触发条件 / 主角应对 / 结果与影响 / 关联角色
- 标注本卷需要铺设和回收的伏笔
- 给出卷末钩子至少 2 个方案

## 工作方式
- 优先参考总纲中对该卷的定位，不偏离主干
- 根据已有章节的正文字数反推剩余章节的合理分配
- 冲突密度建议：每 3-5 章一个小冲突，每卷末一个中高潮`,
  },
  {
    id: 'chapter', name: '章纲设计师', badge: '旗舰版', desc: '章节施工官。负责单章或多章细纲、节拍推进、冲突链和钩子安排。', tag: '细纲直出', cat: '大纲',
    systemPrompt: `你是一位小说章纲设计师，专精于将卷纲拆解为可执行的章节细纲。

## 核心职责
1. 根据卷纲中的章节分配，为每一章编写详细节拍（beat）
2. 每个节拍包含：场景目标 / 冲突类型 / 情感调性 / 信息释放 / 字数预估
3. 设计章内节奏：开场钩子 → 推进 → 小高潮/转折 → 章末钩子
4. 保证前后章节的自然衔接：时间、空间、情绪三个维度的连续性
5. 控制每章的信息密度，避免"水章"或"爆章"

## 输出规范
- 章纲格式：章标题 → 本章目标（1句话）→ 节拍列表（3-7个beat）→ 章末钩子
- 每个节拍：'[场景/冲突/情感] 具体发生什么，字数约X'
- 标注本章角色出场清单和视角切换点
- 续写场景：标注引用前 N 章的衔接信息

## 工作方式
- 检查章纲与卷纲、总纲的一致性
- 字数控制：根据作品设定的每章字数目标合理分配
- 主动提示节奏问题：连续平淡章、冲突过密章`,
  },
  {
    id: 'body', name: '正文大师', badge: '旗舰版', desc: '正文执行引擎。负责续写、重写、扩写、润色后直达可读正文。', tag: '正文执行', cat: '正文',
    systemPrompt: `你是一位资深小说写手，专精于将章纲转化为高质量正文。

## 核心能力
1. **续写**：基于已有正文和章纲，接续写作，保持文风、人称、语气完全一致
2. **重写/扩写**：在保留原意的前提下增强描写、丰富细节、提升张力
3. **润色**：去AI味——删虚词、砍翻译腔、改被动为主动、断长句、加画面感
4. **镜头感**：远景（环境氛围）→ 中景（动作交互）→ 近景（表情细节）→ 特写（关键道具/微表情）

## 写作原则
- 展示而非告知（Show, don't tell）：用动作和对话推进，避免旁白解释
- 五感描写：每 500 字至少覆盖 2 种感官（视觉、听觉、触觉优先）
- 对话自然：每个人物有独特口癖和节奏，对话占比不超过全文 40%
- 节奏控制：动作场景短句快切（每句 15-25 字），情感场景中速，描写场景适当舒展
- 绝对禁止输出解释性文字、Markdown 标记、章节标题（除非明确要求）

## 输出规范
- 直接输出正文，不加前缀/后缀说明
- 续写时原样保留"选中文本"，在其后无缝接续
- 每 800-1200 字为一个自然段落单元
- 如果用户提供了 @补充要求，必须严格遵守

## 工作方式
- 续写前先确认章纲、前文衔接点、目标字数
- 完成后自查：AI味检测（是否有"仿佛"、"似乎"、"不知为何"等AI高频词）`,
  },
  {
    id: 'character', name: '角色设计师', badge: '专业版', desc: '角色创建与维护。负责新建角色卡、设计人物弧光、检测人设偏离。', tag: '角色塑造', cat: '设定',
    systemPrompt: `你是一位小说角色设计师，专精于创建有深度、有辨识度、可成长的小说角色。

## 核心职责
1. 根据作品世界观和剧情需求，创建完整的角色人设卡
2. 为每个角色设计独特的：外貌特征、口头禅、行为模式、核心欲望、内在缺陷
3. 设计角色关系网：每个主要角色与其他角色的关系类型与张力
4. 追踪角色成长弧光：初始状态 → 触发事件 → 变化过程 → 最终状态
5. 检测角色行为与设定的一致性（人设偏离预警）

## 角色卡模板
\`\`\`
姓名 / 性别 / 年龄 / 表身份 / 里身份（如有）
外貌标志：1个令人记住的特征
性格关键词：3-5个（含1个负面特质）
口头禅/标志性动作：
核心欲望（想要什么）：
内在缺陷（阻碍是什么）：
成长弧光（如何改变）：
初始困境：
与其他主要角色的关系：
能力/技能树：
\`\`\`

## 输出规范
- 角色卡精简、每项不超过 30 字
- 配角可省略部分字段，保留核心辨识信息
- 关系标注方向性（A 对 B 是 __，B 对 A 是 __）

## 工作方式
- 新建角色时检查与已有角色的功能重叠（避免"撞人设"）
- 为每个角色设计至少 1 个独有标签（如"爱数钱的守财奴神医"）
- 提供至少 2 个可选方案供用户选择`,
  },
  {
    id: 'setting', name: '设定架构师', badge: '专业版', desc: '世界观与设定管理。负责扩写世界观、设计规则体系、维护设定一致性。', tag: '世界构建', cat: '设定',
    systemPrompt: `你是一位小说设定架构师，专精于构建自洽、有深度、可扩展的虚构世界。

## 核心职责
1. 设计世界规则体系：物理法则 / 魔法规则 / 社会制度 / 经济体系 / 势力格局
2. 确保设定的内在一致性：每条规则有来源、有边界、有代价
3. 将抽象设定具象化为可写的场景：这条规则如何影响主角的日常？
4. 管理设定的渐进式披露：哪些设定读者现在该知道，哪些该留到后期揭露
5. 检测正文中的设定冲突和漏洞

## 设定设计框架
- **时代与地理**：时代特征 + 关键地理位置 + 空间尺度
- **势力格局**：至少 3 股势力 + 每方的目标/资源/底线
- **核心规则**：这个世界运行的底层逻辑（不超过 3 条大规则）
- **例外与代价**：规则可以被谁打破？打破的代价是什么？
- **日常影响**：这些设定对普通人/主角的日常生活意味着什么？

## 输出规范
- 设定卡格式：名称 → 分类 → 核心描述 → 规则列表 → 关联实体 → 秘密/伏笔潜力
- 每个设定标注：全局/区域级/临时
- 设定变更时标注：变更前 → 变更后 → 影响范围

## 工作方式
- 优先参考已有世界观设定，避免冲突
- 对与已有设定矛盾的提案，先指出冲突再给替代方案
- 每个设定至少提出 1 个可写为剧情冲突的应用场景`,
  },
  {
    id: 'foreshadow', name: '伏笔管理师', badge: '专业版', desc: '伏笔与剧情线管理。负责铺设、追踪、回收伏笔，维护故事一致性。', tag: '线索管理', cat: '设定',
    systemPrompt: `你是一位小说伏笔管理师，专精于伏笔的铺设、追踪与回收。

## 核心职责
1. 识别已写章节中埋下的伏笔，标记状态（已埋/发展中/已回收/遗忘）
2. 为新章节设计伏笔铺设方案：什么信息可以隐藏？什么线索可以误导？
3. 规划伏笔回收时间线：短伏笔（同章回收）/ 中伏笔（同卷回收）/ 长伏笔（跨卷大坑）
4. 检测已遗忘的伏笔，提醒作者及时处理
5. 分析伏笔密度：避免某卷伏笔过多导致回收困难

## 伏笔分类
- **信息差伏笔**：角色/读者知道的信息不对称
- **道具伏笔**：看似普通但后期关键的物品
- **身份伏笔**：角色真实身份的线索
- **规则伏笔**：世界观规则的暗示（Chekhov's Gun）
- **关系伏笔**：角色间未揭示的关系线索

## 输出规范
- 每条伏笔记录：类型 / 铺设章节 / 铺设方式 / 计划回收章 / 当前状态 / 紧急度
- 伏笔网络图（文字描述）：标注关联伏笔和相互影响
- 章节审核时输出：本章铺设 X 条 / 回收 X 条 / 遗忘 X 条

## 工作方式
- 主动扫描前文章节，提取可识别的伏笔
- 对长期未回收的伏笔给出处理建议（回收/转化为公开信息/废弃）
- 新伏笔铺设时检查是否与已有伏笔冲突`,
  },
  {
    id: 'idea', name: '灵感火花', badge: '创意版', desc: '脑洞拓展与创意激发。负责生成剧情方向、反转设计和创意点子。', tag: '创意激发', cat: '脑洞',
    systemPrompt: `你是一位小说创意顾问，专精于生成有趣、可执行、符合市场口味的剧情创意。

## 核心职责
1. 基于已有设定，脑洞拓展至少 3 个不同的剧情发展方向
2. 为每个方向提供：一句话卖点 / 核心冲突 / 目标读者情绪 / 市场适配度
3. 设计剧情反转：读者以为 A 真相是 B（至少 2 层反转）
4. 提供爽点配方：什么样的场景能让目标读者获得最大满足感
5. 竞品参考：类似的成功作品是怎么处理的（给方向，不抄袭）

## 创意方法论
- **加减法**：取出一个设定元素，将其推到极致或完全移除，看会发生什么
- **视角切换**：同一个事件从不同角色的视角看，产生信息差
- **假设反推**：如果 XX 事件没有发生 / 提前发生 / 推迟发生呢？
- **跨类型融合**：玄幻+职场；仙侠+悬疑；科幻+种田

## 输出规范
- 每个创意方向包含：卖点（1句话）/ 核心冲突 / 预期字数区间 / 适合平台
- 反转设计：铺垫线索 → 读者预期 → 真实揭示
- 标注该创意的风险点（如：容易写崩/读者可能反感/需要较强的笔力）

## 工作方式
- 优先给出与当前设定兼容的创意
- 同时提供 1 个"安全牌"（市场验证过的模式）和 1 个"差异牌"（创新方向）
- 创意不强制使用，定位为作者的灵感参考`,
  },
  {
    id: 'prompt', name: '提示词优化师', badge: '工具版', desc: '提示词工程专家。负责优化、调试、翻译小说创作相关的AI提示词。', tag: '工具优化', cat: '提示词',
    systemPrompt: `你是一位 AI 提示词工程专家，专精于优化小说创作场景下的 AI 提示词。

## 核心职责
1. 分析用户当前的提示词，识别模糊、缺失或冲突的部分
2. 将松散的需求转化为结构化、可复用的提示词模板
3. 补充提示词中的隐含约束（如去AI味、字数控制、人称锁定、视角一致）
4. 调试提示词效果：分析 AI 输出为什么不符合预期，定位提示词中的问题
5. 提供提示词变体：同一任务的 3 种提示词写法（精炼版/详细版/创意版）

## 提示词设计原则
- **角色优先**：先定义 AI 的身份和能力边界（Role + Profile）
- **约束前置**：禁止事项放在提示词前部，比后部更有效
- **输入区标准化**：用 @变量名 统一引用系统变量，方便模板复用
- **输出模板化**：给 AI 明确的输出格式，减少随机性
- **反面示例**：告诉 AI 什么是"不对的"往往比告诉它"对的"更有效

## 输出规范
- 优化后的提示词用代码块输出，可直接复制使用
- 标注修改点和修改原因
- 提供使用建议：适合什么场景 / 什么模型 / 什么温度参数

## 工作方式
- 先用 2-3 句话总结原提示词的问题
- 再给出优化版本
- 最后附加一个简短的优化清单`,
  },
]

const filteredAgents = computed(() => allAgents.filter(a => {
  if (agentFilter.value !== '全部' && a.cat !== agentFilter.value) return false
  if (agentSearch.value && !a.name.includes(agentSearch.value) && !a.desc.includes(agentSearch.value)) return false
  return true
}))

function selectAgent(a: AgentDef) {
  currentAgent.value = { ...a }
  isAgentDropdown.value = false
  // 切换到 agent 模式
  mode.value = 'agent'
}

// ── Association ──
const isAssociationOpen = ref(false)
const associationToggles = reactive([
  { key: 'base', label: '基础信息', type: '必带关联', enabled: true },
  { key: 'core', label: '核心构架', type: '必带关联', enabled: true },
  { key: 'settings', label: '设定数据', type: '必带关联', enabled: true },
  { key: 'outline', label: '总纲', type: '可选关联', enabled: true },
  { key: 'recent', label: '最近正文', type: '可选关联', enabled: true },
])

// ── @引用弹窗 ──
const isQuoteModal = ref(false)
const quoteSearch = ref('')
const activeQuoteVar = ref<{ key: string; label: string; desc: string } | null>(null)

const quoteCategories = [
  { name: '基础信息', vars: [
    { key: '@基础信息', label: '@基础信息', desc: '基础信息大类全文拼接（书名/类型/标签/简介/文风/目标字数等）' },
    { key: '@书名', label: '@书名', desc: '作品标题' },
    { key: '@类型', label: '@类型', desc: '题材/流派（通常来自 genre/标签）' },
    { key: '@标签', label: '@标签', desc: '作品标签（用于封面、推荐及AI工具提示）' },
    { key: '@文风', label: '@文风', desc: '文风说明（写作语气/节奏/叙述风格）' },
    { key: '@作品简介', label: '@作品简介', desc: '作品简介（summary/description）' },
    { key: '@故事视角', label: '@故事视角', desc: '故事视角（第一/第三人称等，可手填）' },
    { key: '@目标字数', label: '@目标字数', desc: '目标总字数（默认 1000000）' },
  ]},
  { name: '核心构架', vars: [
    { key: '@核心构架', label: '@核心构架', desc: '核心构架大类全文拼接（世界观/主角/力量体系/金手指等）' },
    { key: '@世界观', label: '@世界观', desc: '世界观摘要（等价于 @世界观摘录）' },
    { key: '@金手指', label: '@金手指', desc: '金手指/外挂机制（核心构架里填写的"金手指"草稿）' },
    { key: '@力量体系', label: '@力量体系', desc: '力量/等级/修炼体系（核心构架里填写的"力量体系"草稿）' },
    { key: '@主角', label: '@主角', desc: '主角核心构架（人设/欲望/缺陷/成长路线）' },
  ]},
  { name: '设定与角色', vars: [
    { key: '@设定数据', label: '@设定数据', desc: '设定数据大类全文拼接（角色/设定条目/伏笔/秘密等）' },
    { key: '@当前设定数据', label: '@当前设定数据', desc: '渐进式披露版设定数据（根据当前章节自动隐藏未揭示的秘密/伏笔）' },
    { key: '@所有角色', label: '@所有角色', desc: '所有角色列表' },
    { key: '@角色列表', label: '@角色列表', desc: '角色列表（按出场顺序）' },
    { key: '@选择角色', label: '@选择角色', desc: '手动选择的角色' },
    { key: '@补充信息', label: '@补充信息', desc: '补充信息（可选）：来自审批弹窗/AI工具的附加指令' },
    { key: '@补充要求', label: '@补充要求', desc: '补充要求（可选）：限制字数/强调设定等' },
  ]},
  { name: '大纲结构', vars: [
    { key: '@总纲', label: '@总纲', desc: '全书总纲' },
    { key: '@卷纲', label: '@卷纲', desc: '全部卷纲' },
    { key: '@当前卷纲', label: '@当前卷纲', desc: '当前所在卷的卷纲' },
    { key: '@章纲', label: '@章纲', desc: '全部章纲' },
    { key: '@当前章纲', label: '@当前章纲', desc: '当前章节的章纲' },
    { key: '@选择卷纲', label: '@选择卷纲', desc: '手动选择的卷纲' },
    { key: '@选择章纲', label: '@选择章纲', desc: '手动选择的章纲' },
    { key: '@章纲范围', label: '@章纲范围', desc: '指定范围的章纲' },
    { key: '@前25章细纲', label: '@前25章细纲', desc: '前25章细纲（常用于续写上下文）' },
    { key: '@自然衔接提醒', label: '@自然衔接提醒', desc: '与前后章节的自然衔接提醒' },
  ]},
  { name: '正文上下文', vars: [
    { key: '@章节标题', label: '@章节标题', desc: '当前章节标题' },
    { key: '@本章正文', label: '@本章正文', desc: '当前章节正文（全文/片段）' },
    { key: '@当前正文', label: '@当前正文', desc: '当前正在编辑的正文内容' },
    { key: '@前文', label: '@前文', desc: '紧接当前章节之前的正文' },
    { key: '@最近章节', label: '@最近章节', desc: '最近完成的章节正文' },
    { key: '@前3章正文', label: '@前3章正文', desc: '前3章有效正文拼接' },
    { key: '@前N章正文', label: '@前N章正文', desc: '最近 N 章有效正文拼接（可配置N）' },
    { key: '@前N章章纲', label: '@前N章章纲', desc: '最近 N 章章纲拼接' },
  ]},
  { name: '进度辅助', vars: [
    { key: '@目前章数', label: '@目前章数', desc: '当前已完成的章节总数' },
    { key: '@续写章数', label: '@续写章数', desc: '本次续写计划生成的章数' },
    { key: '@续写章节数', label: '@续写章节数', desc: '续写章节数（别名）' },
    { key: '@当前卷数', label: '@当前卷数', desc: '当前已完成的卷数' },
  ]},
  { name: '发布平台', vars: [
    { key: '@发布平台', label: '@发布平台', desc: '当前选择的发布平台完整画像（受众、偏好、禁忌、节奏要求等）' },
  ]},
]

function insertQuoteVar(key: string) {
  draft.value = draft.value ? draft.value + ' ' + key + ' ' : key + ' '
  isQuoteModal.value = false
}

// ── Chat ──
async function loadOutlinesForResolver(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const { useWorkRepo: _r } = await import('../composables/useWorkRepo')
    const repo = _r()
    const workId = repo.currentWorkId.value
    if (!workId) return map

    const { getOutline } = await import('../composables/useOutlines')
    const mainOutline = await getOutline('main', workId)
    if (mainOutline?.content) map.set('main', mainOutline.content)

    const vols = repo.volumes.value || []
    for (const vol of vols) {
      const vo = await getOutline('volume', vol.id)
      if (vo?.content) map.set(`volume_${vol.id}`, vo.content)
    }

    const chs = Object.values(repo.chapterMap.value || {}).flat()
    for (const ch of chs) {
      const co = await getOutline('chapter', ch.id)
      if (co?.content) map.set(`chapter_${ch.id}`, co.content)
    }
  } catch {}
  return map
}

/** 构建 Runner 上下文解析器（供 agent 步骤的 requiredContext 使用） */
async function buildResolverCtx(workId: number): Promise<ResolverCtx> {
  const mgr = new SettingsManager()
  await mgr.load(workId)
  const wsc = new WorkspaceSettings(workId)
  const outlines = await loadOutlinesForResolver()

  return {
    workStore: () => {
      try { return useWorkStore() } catch { return null }
    },
    settingsManager: () => mgr,
    workspaceSettings: () => ({
      ...wsc.data,
      // 兼容 @发布平台 resolver 通过 data.platformId 访问
      data: { platformId: wsc.data.platformId },
    }),
    outlines,
  }
}

async function send() {
  const text = draft.value.trim()
  if (!text || streaming.value) return // 重入保护，防止编程式调用并行触发

  // 检查是否有已启用的 provider
  const modelStore = useModelStore()
  const providers = modelStore.getEnabledProviders()
  if (providers.length === 0) {
    messages.value.push({ role: 'user', content: text })
    messages.value.push({
      role: 'assistant',
      content: '⚠️ 未配置模型，请到设置中启用 AI 服务商后再发送消息。',
    })
    draft.value = ''
    return
  }

  messages.value.push({ role: 'user', content: text })
  draft.value = ''
  streaming.value = true
  streamText.value = ''
  reasoningBuf.value = ''
  stopFlag = false

  // 构建 system prompt
  let systemPrompt: string
  if (mode.value === 'master') {
    systemPrompt = MASTER_SYSTEM_PROMPT
  } else {
    // Agent 模式：使用该智能体的专业 systemPrompt + 通用规范
    systemPrompt = currentAgent.value.systemPrompt + `\n\n## 通用规范\n- 使用中文回复\n- 参考提供的关联上下文，但不要编造不存在的信息\n- 给出的方案应具体、可执行，避免泛泛而谈`
  }

  // D2: 根据关联开关注入上下文变量
  const toggleVarMap: Record<string, string> = {
    base: '@基础信息',
    core: '@核心构架',
    settings: '@设定数据',
    outline: '@总纲',
    recent: '@最近章节',
  }

  // 预加载设定数据（agent 聊天模式需要同步返回 SettingsManager）
  const _preloadedSettingsMgr = new SettingsManager()
  try {
    const _wid = useWorkStore()?.currentWorkId
    if (_wid) await _preloadedSettingsMgr.load(_wid)
  } catch { /* 加载失败，返回空 manager */ }

  const resolverCtx = {
    workStore: () => {
      try { return useWorkStore() } catch { return null }
    },
    settingsManager: () => _preloadedSettingsMgr,
    workspaceSettings: () => {
      try {
        const ws = useWorkStore()
        const wid = ws?.currentWorkId
        if (!wid) return null
        const wsc = new WorkspaceSettings(wid)
        // 映射到 resolver 期望的字段名
        return {
          genre: wsc.data.genre,
          style: wsc.data.styleDescription,
          summary: wsc.data.intro,
          perspective: wsc.data.pov,
          tags: wsc.data.tags,
          targetWordCount: wsc.data.targetWordCount,
        }
      } catch { return null }
    },
    // 预加载大纲数据
    outlines: await loadOutlinesForResolver(),
  }

  // 计算快照字数
  let contextSnapshot = ''
  for (const t of associationToggles) {
    if (!t.enabled) continue
    const varName = toggleVarMap[t.key]
    if (!varName) continue
    try {
      const resolved = expandPrompt(varName, resolverCtx)
      contextSnapshot += `\n\n--- ${t.label} ---\n${resolved}`
    } catch { /* 变量解析失败静默跳过 */ }
  }
  _snapshotWordCount.value = contextSnapshot.replace(/[^一-鿿]/g, '').length

  if (contextSnapshot) {
    systemPrompt += `\n\n## 关联上下文\n以下是从当前作品中自动提取的关联信息：\n${contextSnapshot}`
  }

  // 展开用户消息中的 @变量名 引用
  const atRefs = text.match(/@[^\s，。！？、；：""'）】》)]+/g) || []
  let inlineContext = ''
  for (const ref of [...new Set(atRefs)]) {
    try {
      const resolved = expandPrompt(ref, resolverCtx)
      if (resolved && resolved !== `[${ref}: 未知变量]`) {
        inlineContext += `\n\n--- ${ref} ---\n${resolved}`
      }
    } catch { /* 解析失败跳过 */ }
  }
  if (inlineContext) {
    systemPrompt += `\n\n## 用户引用的上下文\n${inlineContext}`
  }

  // 根据 Agent 设置的 contextCount/contextWords 限制消息
  let historyMsgs = messages.value.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }))
  if (contextCount.value > 0) historyMsgs = historyMsgs.slice(-contextCount.value)
  if (contextWords.value > 0) {
    let total = 0
    historyMsgs = historyMsgs.reverse().filter(m => {
      total += m.content.length
      return total <= contextWords.value * 2  // 估算：中文每字约2字符
    }).reverse()
  }

  const allMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMsgs,
  ]

  // 根据 currentModel 匹配 provider（空值时初始化默认模型）
  if (!currentModel.value && providers.length > 0) {
    const p = providers[0]
    if ('models' in p) { currentModel.value = `${p.name} / ${p.models[0].name}` }
    else { currentModel.value = p.name }
  }
  const resolved = resolveModelFromSelection(currentModel.value, providers)
  const provider = resolved.provider
  const modelId = resolved.modelId
  const providerId = provider.id
  const sThink = 'models' in provider
    ? provider.models.find((m: any) => m.id === modelId)?.supportsThink ?? false
    : false

  try {
    const { abort, result } = sendAiMessageStream(
      { providerId, modelId, messages: allMessages, stream: true, think: sThink },
      {
        onChunk(chunk: string) {
          if (stopFlag) return
          streamText.value += chunk
        },
        onReasoning(text: string) {
          reasoningBuf.value += text
        },
        onDone(fullText: string) {
          const reasoning = reasoningBuf.value || undefined
          reasoningBuf.value = ''
          if (stopFlag) {
            messages.value.push({ role: 'assistant', content: (streamText.value || fullText) + '（已停止）', reasoning })
          } else {
            messages.value.push({ role: 'assistant', content: fullText, reasoning })
          }
          streaming.value = false
          streamText.value = ''
          scrollToBottom()
        },
        onError(err: string) {
          streaming.value = false
          messages.value.push({ role: 'assistant', content: '⚠️ ' + err })
          reasoningBuf.value = ''
          streamText.value = ''
          scrollToBottom()
        },
      },
    )
    // B4: stop() 调用 abort()
    _activeAbort = abort
    await result
    _activeAbort = null
  } catch (e: any) {
    streaming.value = false
    messages.value.push({ role: 'assistant', content: '⚠️ 请求失败: ' + (e.message || String(e)) })
    streamText.value = ''
    scrollToBottom()
  }
}

function stop() {
  stopFlag = true
  // B4: 调用真实 abort（Tauri 模式下会终止 Rust 流）
  if (_activeAbort) {
    _activeAbort()
    _activeAbort = null
  }
  if (streamText.value) {
    messages.value.push({ role: 'assistant', content: streamText.value + '（已停止）' })
    streamText.value = ''
  }
  streaming.value = false
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}
</script>

<style scoped>
.ag-root {
  display: flex; flex-direction: column;
  flex: 1; min-height: 0; width: 100%;
  overflow: hidden; background: #fdfbf7;
}

/* ── Header ── */
.ag-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #f3e8d6; background: #fff; flex-shrink: 0; }
.ag-header-left { display: flex; align-items: center; gap: 12px; }
.ag-header-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.ag-header-tab { padding: 5px 16px; border-radius: 20px; border: none; background: transparent; color: #8c8c8c; cursor: pointer; font-size: 13px; font-family: inherit; font-weight: 500; }
.ag-header-tab.active { background: #10b981; color: #fff; }
.ag-btn-sm { padding: 4px 12px; border-radius: 8px; border: 1px solid #d1d5db; background: transparent; color: #4b5563; cursor: pointer; font-size: 12px; font-family: inherit; display: flex; align-items: center; gap: 4px; }
.ag-btn-sm:hover { background: #f9fafb; }
.ag-btn-ghost { border-color: #e5e7eb; }
.ag-btn-primary { background: #10b981; color: #fff; border-color: #10b981; }
.ag-btn-primary:hover { background: #059669; }
.ag-text-btn { padding: 0; border: none; background: none; color: #6b7280; cursor: pointer; font-size: 12px; font-family: inherit; }
.ag-text-btn:hover { color: #10b981; }
.ag-text-btn-danger { color: #9ca3af; }
.ag-text-btn-danger:hover { color: #ef4444; }
.ag-chevron { font-size: 10px; opacity: 0.5; }
.ag-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; flex-shrink: 0; }
.ag-badge-sm { font-size: 10px; padding: 1px 6px; border-radius: 10px; background: #d1fae5; color: #065f46; font-weight: 700; display: inline-block; margin-bottom: 4px; }

/* ── Pop menu ── */
.ag-pop-menu { position: absolute; top: 100%; right: 0; margin-top: 4px; background: #fff; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 4px 16px rgba(0,0,0,0.1); padding: 4px; z-index: 50; min-width: 160px; }
.ag-pop-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; font-size: 12px; color: #4b5563; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font-family: inherit; }
.ag-pop-item:hover { background: #f9fafb; }
.ag-pop-item.active { color: #059669; background: #ecfdf5; }
.ag-check { color: #10b981; font-size: 11px; }

/* ── Chat ── */
.ag-chat { flex: 1; overflow-y: auto; padding: 14px 16px; }
.ag-empty { text-align: center; padding: 40px 0; }
.ag-empty-icon { width: 48px; height: 48px; border-radius: 12px; background: #fef3c7; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; font-size: 22px; }
.ag-empty-icon-master { background: #d1fae5; }
.ag-empty-title { font-size: 15px; font-weight: 700; margin: 0 0 4px; }
.ag-empty-hint { font-size: 12px; color: #8c8c8c; margin: 0 0 12px; }
.ag-empty-cta { padding: 8px 24px; border: none; border-radius: 10px; background: #10b981; color: #fff; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; margin-top: 4px; transition: background 0.15s; }
.ag-empty-cta:hover { background: #059669; }
.ag-rec-nocurrent { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.06); }
.ag-msg { padding: 8px 12px; border-radius: 8px; font-size: 12px; line-height: 1.6; margin-bottom: 8px; }
.ag-msg.user { background: rgba(16,185,129,0.08); }
.ag-msg.assistant { background: rgba(128,128,128,0.04); }

/* 思考链 */
.ag-reasoning { margin-bottom: 8px; }
.ag-reasoning-summary {
  font-size: 11px; opacity: 0.5; cursor: pointer; user-select: none;
  padding: 4px 0; transition: opacity 0.15s;
}
.ag-reasoning-summary:hover { opacity: 0.8; }
.ag-reasoning-text {
  font-size: 11px; line-height: 1.6; opacity: 0.55; white-space: pre-wrap;
  margin: 6px 0; padding: 8px 10px; border-radius: 6px;
  background: rgba(128,128,128,0.06); border-left: 2px solid rgba(128,128,128,0.2);
  max-height: 200px; overflow-y: auto;
}
.ag-cursor { animation: blink 1s step-end infinite; opacity: 0.5; }
@keyframes blink { 50% { opacity: 0; } }

/* ── Input area ── */
.ag-input-area { padding: 0 14px 14px; flex-shrink: 0; }

/* ── 输入区模式指示器 ── */
.ag-input-wrap { border-radius: 12px; overflow: hidden; border: 2px solid #e5e7eb; transition: border-color 0.2s; }
.ag-input-wrap:focus-within { border-color: #d1d5db; }
.ag-input-wrap.master { border-color: #e5e7eb; }
.ag-input-wrap.master:focus-within { border-color: #10b981; }
.ag-input-wrap.agent { border-color: #c4b5fd; }
.ag-input-wrap.agent:focus-within { border-color: #8b5cf6; }

.ag-input-mode-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #f9fafb; border-bottom: 1px solid #f3f4f6; }
.ag-input-wrap.master .ag-input-mode-bar { background: #f0fdf4; border-bottom-color: #d1fae5; }
.ag-input-wrap.agent .ag-input-mode-bar { background: #f5f3ff; border-bottom-color: #ede9fe; }

.ag-input-mode-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
.ag-input-mode-badge.master { background: #10b981; color: #fff; }
.ag-input-mode-badge.agent { background: #8b5cf6; color: #fff; }

.ag-input-mode-hint { font-size: 10px; color: #6b7280; flex: 1; }
.ag-input-mode-tag { font-size: 10px; color: #8b5cf6; background: #ede9fe; padding: 0 6px; border-radius: 4px; }
.ag-input-mode-switch { margin-left: auto; padding: 1px 8px; border: 1px solid #d1d5db; border-radius: 10px; background: #fff; color: #6b7280; cursor: pointer; font-size: 10px; font-family: inherit; white-space: nowrap; }
.ag-input-mode-switch:hover { background: #f3f4f6; color: #374151; }

/* 推荐操作：卡片式逐步引导 */
.ag-recommend-card {
  margin-bottom: 10px; border-radius: 12px;
  border: 1px solid rgba(82,200,160,0.18);
  background: rgba(82,200,160,0.04);
  overflow: hidden;
}
.ag-rec-card-hd {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(128,128,128,0.06);
}
.ag-rec-step-badge {
  font-size: 12px; font-weight: 600; opacity: 0.5;
  padding: 2px 8px; border-radius: 10px;
  background: rgba(128,128,128,0.08);
}
.ag-rec-stage-tag {
  font-size: 11px; opacity: 0.45;
  padding: 2px 8px; border-radius: 8px;
  background: rgba(82,200,160,0.1);
  color: #52c8a0;
}
.ag-rec-card-body {
  padding: 14px 16px 10px;
}
.ag-rec-card-label {
  font-size: 16px; font-weight: 700; margin: 0 0 6px; line-height: 1.4;
}
.ag-rec-card-desc {
  font-size: 13px; opacity: 0.55; margin: 0; line-height: 1.6;
}
.ag-rec-card-actions {
  padding: 0 16px 12px;
}
.ag-rec-card-btn {
  width: 100%; padding: 10px 0; border: none; border-radius: 10px;
  font-size: 14px; font-family: inherit; font-weight: 600; cursor: pointer;
  transition: all 0.15s;
}
.ag-rec-card-btn.primary {
  background: #52c8a0; color: #fff;
}
.ag-rec-card-btn.primary:hover { background: #3ea882; }
.ag-rec-card-btn.ag-rec-done {
  background: #e5e7eb; color: #6b7280; cursor: default; pointer-events: none;
}
.ag-rec-card-nav {
  display: flex; justify-content: space-between;
  padding: 8px 14px 10px;
  border-top: 1px solid rgba(128,128,128,0.06);
}
.ag-rec-nav-btn {
  padding: 5px 14px; border: 1px solid rgba(128,128,128,0.12);
  border-radius: 8px; background: transparent; color: inherit;
  font-size: 12px; font-family: inherit; cursor: pointer;
  opacity: 0.55; transition: all 0.15s;
}
.ag-rec-nav-btn:hover:not(:disabled) { opacity: 0.9; border-color: rgba(128,128,128,0.25); }
.ag-rec-nav-btn:disabled { opacity: 0.18; cursor: default; }
.ag-recommend-refresh {
  width: 26px; height: 26px; border: none; border-radius: 50%;
  background: transparent; cursor: pointer; font-size: 13px;
  opacity: 0.35; transition: opacity 0.15s; margin-left: auto;
}
.ag-recommend-refresh:hover { opacity: 0.7; }

.ag-toolbar { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.ag-toolbar-btn { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; color: #4b5563; cursor: pointer; font-size: 12px; font-family: inherit; }
.ag-toolbar-btn:hover { background: #f9fafb; }
.ag-toolbar-btn.amber { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
.ag-count-badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: #fff; border: 1px solid #fcd34d; }
.ag-toolbar-arrow { font-size: 10px; transition: transform 0.2s; }
.ag-toolbar-arrow.open { transform: rotate(180deg); }
.ag-at { color: #d97706; font-weight: 700; }
.ag-bolt { color: #f59e0b; }

/* ── Quick cmd popover ── */
.ag-quick-cmd-wrap { position: relative; }
.ag-quick-cmd-pop { position: absolute; bottom: 100%; left: 0; margin-bottom: 6px; width: 260px; background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 8px 30px rgba(0,0,0,0.12); overflow: hidden; z-index: 50; }
.ag-quick-cmd-hd { padding: 8px 12px; background: #f9fafb; border-bottom: 1px solid #f3f4f6; font-size: 11px; font-weight: 700; color: #6b7280; }
.ag-quick-cmd-body { padding: 4px; max-height: 240px; overflow-y: auto; }
.ag-quick-cmd-group { padding: 4px 8px; font-size: 10px; color: #9ca3af; font-weight: 500; }
.ag-quick-cmd-item { display: block; width: 100%; text-align: left; padding: 6px 10px; border: none; border-radius: 6px; background: none; color: #4b5563; cursor: pointer; font-size: 12px; font-family: inherit; }
.ag-quick-cmd-item:hover { background: #ecfdf5; color: #059669; }

/* ── Bottom bar ── */
.ag-bottom-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 0; border-top: 1px solid #f3e8d6; }
.ag-bottom-left { font-size: 11px; color: #9ca3af; display: flex; align-items: center; gap: 10px; }
.ag-bottom-select { position: relative; }
.ag-bottom-select-btn { display: flex; align-items: center; gap: 2px; padding: 2px 6px; border-radius: 6px; border: none; background: none; color: #6b7280; cursor: pointer; font-size: 11px; font-family: inherit; }
.ag-bottom-select-btn:hover { background: #f3f4f6; }
.ag-bottom-select .ag-pop-menu { bottom: 100%; top: auto; right: auto; left: 0; margin-bottom: 4px; margin-top: 0; min-width: 120px; }
.ag-model-btn { display: flex; align-items: center; gap: 2px; padding: 2px 6px; border-radius: 6px; border: none; background: none; color: #6b7280; cursor: pointer; font-size: 11px; font-family: inherit; }
.ag-model-btn:hover { background: #f3f4f6; }
.ag-model { color: #6b7280; }

/* Send buttons */
.ag-send-btn { padding: 6px 20px; border: none; border-radius: 10px; background: #d4b483; color: #fff; cursor: pointer; font-size: 12px; font-family: inherit; font-weight: 500; }
.ag-send-btn:hover:not(:disabled) { background: #c4a473; }
.ag-send-btn:disabled { opacity: 0.4; }
.ag-send-master { width: 36px; height: 36px; padding: 0; border-radius: 50%; background: #10b981; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.ag-send-master:hover:not(:disabled) { background: #059669; }
.ag-send-arrow { line-height: 1; }
.ag-send-stop { background: #ef4444 !important; }
.ag-send-stop:hover:not(:disabled) { background: #dc2626 !important; }

/* ── R11: Recovery banner ── */
.ag-recover-banner { padding: 8px 16px; background: #eff6ff; border-bottom: 1px solid #bfdbfe; flex-shrink: 0; }
.ag-recover-inner { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #1e40af; }
.ag-recover-btn { padding: 3px 10px; border: 1px solid #93c5fd; border-radius: 8px; background: #fff; color: #1e40af; cursor: pointer; font-size: 11px; font-family: inherit; }
.ag-recover-btn:hover { background: #dbeafe; }

/* ── R12: Context change notice ── */
.ag-ctx-change { padding: 4px 12px; background: #fffbeb; border-bottom: 1px solid #fcd34d; font-size: 11px; color: #92400e; text-align: center; flex-shrink: 0; }

/* ── Agent Selector ── */
.ag-selector { padding: 12px 16px 6px; flex-shrink: 0; }
.ag-selector-card { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 14px; border: 1px solid #f3e8d6; background: #fffbf2; cursor: pointer; }
.ag-selector-left { display: flex; align-items: center; gap: 10px; }
.ag-selector-icon { width: 36px; height: 36px; border-radius: 10px; background: #fef3c7; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.ag-selector-name { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.ag-selector-badge { font-size: 10px; padding: 1px 6px; border-radius: 10px; border: 1px solid #fcd34d; color: #92400e; }
.ag-selector-desc { font-size: 11px; color: #8c8c8c; margin-top: 2px; }
.ag-selector-right { display: flex; align-items: center; gap: 10px; }
.ag-selector-arrow { font-size: 12px; color: #9ca3af; transition: transform 0.2s; }
.ag-selector-arrow.open { transform: rotate(180deg); }
.ag-selector-refresh { padding: 3px 10px; border: 1px solid #d1d5db; border-radius: 8px; background: transparent; color: #4b5563; cursor: pointer; font-size: 11px; font-family: inherit; }

/* ── Dropdown ── */
.ag-dropdown { margin-top: 8px; padding: 14px; border-radius: 14px; border: 1px solid #f3e8d6; background: #fffbf2; max-height: 420px; overflow-y: auto; }
.ag-dropdown-search { width: 100%; padding: 7px 14px; border: 1px solid #f3e8d6; border-radius: 8px; background: #fff; color: #4a4a4a; font-size: 12px; font-family: inherit; outline: none; margin-bottom: 10px; box-sizing: border-box; }
.ag-dropdown-search:focus { border-color: #fbbf24; }
.ag-dropdown-filters { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.ag-filter-btn { padding: 3px 10px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; color: #4b5563; cursor: pointer; font-size: 11px; font-family: inherit; }
.ag-filter-btn.active { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.ag-dropdown-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ag-dropdown-card { padding: 10px; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; }
.ag-dropdown-card:hover { border-color: #fcd34d; }
.ag-dropdown-card.active { border-color: #fcd34d; background: #fffbf2; }
.ag-dropdown-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.ag-agent-icon-sm { font-size: 14px; width: 28px; height: 28px; border-radius: 8px; background: #fef3c7; display: flex; align-items: center; justify-content: center; }
.ag-agent-name-sm { font-size: 12px; font-weight: 700; }
.ag-agent-badge-sm { font-size: 9px; padding: 1px 5px; border-radius: 8px; border: 1px solid #d1d5db; color: #6b7280; }
.ag-agent-desc-sm { font-size: 10px; color: #6b7280; margin-bottom: 4px; line-height: 1.4; }
.ag-agent-tag-sm { font-size: 9px; padding: 1px 6px; border-radius: 6px; background: #fef3c7; color: #92400e; }

/* ── Association ── */
.ag-association { padding: 12px; border-radius: 12px; border: 1px solid #f3e8d6; background: rgba(255,251,235,0.3); margin-bottom: 8px; }
.ag-association-hd { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #6b7280; margin-bottom: 10px; }
.ag-association-refresh { padding: 2px 8px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #4b5563; cursor: pointer; font-size: 10px; font-family: inherit; }
.ag-association-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ag-association-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 8px; border: 1px solid #f3e8d6; background: #fff; }
.ag-association-name { font-size: 13px; font-weight: 500; display: block; }
.ag-association-type { font-size: 10px; color: #9ca3af; }
.ag-toggle { width: 38px; height: 20px; border-radius: 10px; border: none; background: #d1d5db; cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
.ag-toggle.on { background: #10b981; }
.ag-toggle-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.2s; }
.ag-toggle-knob.on { left: 20px; }

.ag-textarea { width: 100%; padding: 10px; border: none; outline: none; background: transparent; color: #4a4a4a; font-size: 13px; font-family: inherit; resize: none; box-sizing: border-box; }
.ag-textarea::placeholder { color: #9ca3af; }

/* ── @引用 Modal ── */
.ag-quote-overlay { position: fixed; inset: 0; z-index: 10020; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); }
.ag-quote-root { width: 700px; max-width: calc(100vw - 40px); max-height: 80vh; border-radius: 16px; background: #fdfbf7; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
.ag-quote-header { padding: 16px 20px; border-bottom: 1px solid #f3e8d6; display: flex; justify-content: space-between; align-items: flex-start; }
.ag-quote-title { font-size: 18px; font-weight: 700; margin: 0; }
.ag-quote-desc { font-size: 12px; color: #6b7280; margin: 4px 0 0; }
.ag-quote-close { width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: #9ca3af; cursor: pointer; font-size: 16px; }
.ag-quote-search { padding: 12px 20px; position: relative; }
.ag-quote-at { position: absolute; left: 32px; top: 18px; color: #d97706; font-weight: 700; font-size: 14px; pointer-events: none; }
.ag-quote-search input { width: 100%; padding: 7px 14px 7px 32px; border: 1px solid #f3e8d6; border-radius: 12px; background: #fff; color: #4a4a4a; font-size: 13px; font-family: inherit; outline: none; box-sizing: border-box; }
.ag-quote-search input:focus { border-color: #fbbf24; }
.ag-quote-body { flex: 1; overflow-y: auto; padding: 0 20px 20px; }
.ag-quote-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.ag-quote-left { grid-column: span 2; display: flex; flex-direction: column; gap: 18px; }
.ag-quote-cat-title { font-size: 12px; font-weight: 700; color: #92400e; margin: 0 0 8px; display: flex; align-items: center; gap: 6px; }
.ag-quote-cat-dot { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; }
.ag-quote-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.ag-quote-tag { padding: 5px 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; color: #4b5563; cursor: pointer; font-size: 11px; font-family: inherit; transition: all 0.15s; }
.ag-quote-tag:hover { border-color: #fcd34d; color: #92400e; }
.ag-quote-tag.active { background: #fef3c7; border-color: #fcd34d; color: #92400e; font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.ag-quote-right { grid-column: span 1; }
.ag-quote-info { padding: 14px; border-radius: 12px; background: rgba(255,251,235,0.5); border: 1px solid #fef3c7; position: sticky; top: 0; }
.ag-quote-info-title { font-size: 13px; font-weight: 700; color: #92400e; margin: 0 0 10px; }
.ag-quote-info-badge { display: inline-block; padding: 3px 10px; border-radius: 5px; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 500; margin-bottom: 8px; }
.ag-quote-info-desc { font-size: 11px; color: #6b7280; line-height: 1.6; margin: 0; }
.ag-quote-info-empty { font-size: 11px; color: #9ca3af; text-align: center; padding: 20px 0; }

/* ── General Modal (Agent设置 / 模型选择) ── */
.ag-modal-overlay { position: fixed; inset: 0; z-index: 10020; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); }
.ag-modal { background: #fff; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; max-height: 85vh; }
.ag-settings-modal { width: 680px; max-width: calc(100vw - 40px); }
.ag-model-modal { width: 720px; max-width: calc(100vw - 40px); }
.ag-modal-header { padding: 16px 20px; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: flex-start; }
.ag-modal-title { font-size: 17px; font-weight: 700; margin: 0; }
.ag-modal-desc { font-size: 12px; color: #6b7280; margin: 4px 0 0; }
.ag-modal-close { width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: #9ca3af; cursor: pointer; font-size: 16px; flex-shrink: 0; }
.ag-modal-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }
.ag-modal-footer { padding: 12px 20px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: flex-end; gap: 8px; background: #f9fafb; }
.ag-modal-footer-between { justify-content: space-between; }
.ag-modal-footer-actions { display: flex; gap: 8px; }

/* ── Settings blocks ── */
.ag-settings-block { padding: 16px; border-radius: 12px; background: #f9fafb; border: 1px solid rgba(0,0,0,0.06); }
.ag-settings-block--fields { display: flex; flex-direction: column; max-height: 360px; }
.ag-settings-block-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.ag-settings-block-title { font-size: 13px; font-weight: 700; margin: 0 0 8px; }
.ag-settings-hint { font-size: 11px; color: #9ca3af; margin: 4px 0 8px; line-height: 1.5; }
.ag-mono-hint { font-family: 'SF Mono', 'Fira Code', monospace; color: #9ca3af; font-size: 11px; }
.ag-settings-row-inline { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.ag-settings-label { font-size: 11px; color: #6b7280; white-space: nowrap; display: block; margin-bottom: 4px; }
.ag-settings-dropdown { position: relative; }
.ag-settings-dropdown-sm { max-width: 120px; }
.ag-settings-dropdown-btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 6px 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; color: #4a4a4a; cursor: pointer; font-size: 13px; font-family: inherit; }
.ag-settings-dropdown-btn:hover { border-color: #10b981; }
.ag-settings-dropdown-menu { position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); overflow: hidden; z-index: 20; }
.ag-settings-dropdown-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 12px; border: none; background: none; color: #4b5563; cursor: pointer; font-size: 13px; font-family: inherit; text-align: left; }
.ag-settings-dropdown-item:hover { background: #ecfdf5; }
.ag-settings-dropdown-item.active { background: #059669; color: #fff; }
.ag-select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; color: #4a4a4a; font-size: 12px; font-family: inherit; outline: none; cursor: pointer; }
.ag-select:focus { border-color: #10b981; }
.ag-select-sm { font-size: 11px; padding: 4px 8px; }
.ag-input { padding: 5px 10px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; color: #4a4a4a; font-size: 12px; font-family: inherit; outline: none; width: 80px; }
.ag-input:focus { border-color: #10b981; }
.ag-input-full { width: 100%; box-sizing: border-box; }
.ag-input-mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; }
.ag-settings-enhance { display: flex; flex-direction: column; gap: 12px; }
.ag-settings-enhance-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ag-settings-enhance-title { font-size: 13px; font-weight: 500; }
.ag-settings-fields-add { display: flex; gap: 8px; margin-bottom: 10px; }
.ag-settings-fields-list { overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.ag-settings-field-card { padding: 10px 12px; border-radius: 8px; background: #fff; border: 1px solid #e5e7eb; position: relative; }
.ag-settings-field-card:hover { border-color: #a7f3d0; }
.ag-settings-field-delete { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border: none; border-radius: 4px; background: transparent; color: #d1d5db; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.ag-settings-field-delete:hover { color: #ef4444; }
.ag-settings-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.ag-settings-field-bottom { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.ag-settings-field-checks { display: flex; gap: 10px; margin-left: auto; }
.ag-settings-field-checks label { display: flex; align-items: center; gap: 3px; color: #6b7280; cursor: pointer; font-size: 11px; }

/* ── Model selector ── */
.ag-model-group { margin-bottom: 4px; }
.ag-model-provider { font-size: 13px; font-weight: 700; margin: 0 0 8px; display: flex; align-items: center; gap: 6px; }
.ag-model-count { color: #9ca3af; font-weight: 400; }
.ag-model-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ag-model-card { position: relative; padding: 10px 12px; border-radius: 10px; border: 1px solid #e5e7eb; background: #f9fafb; cursor: pointer; text-align: left; font-family: inherit; }
.ag-model-card:hover { border-color: #10b981; background: #ecfdf5; }
.ag-model-card.active { border-color: #10b981; background: #ecfdf5; border-width: 2px; }
.ag-model-badge { position: absolute; top: 6px; right: 6px; font-size: 9px; padding: 2px 6px; border-radius: 8px; background: #10b981; color: #fff; }
.ag-model-dot-active { position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
.ag-model-name { font-size: 13px; font-weight: 600; }
.ag-model-price { font-size: 10px; color: #6b7280; margin-top: 4px; }
.ag-model-status { font-size: 10px; color: #10b981; margin-top: 4px; }
.ag-model-selected { font-size: 12px; color: #6b7280; }

/* ── 二次审核弹窗 ── */
.ag-review-overlay { position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
.ag-review-modal { width: 680px; max-height: 85vh; border-radius: 16px; background: #1c1c22; color: #fff; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); border: 1px solid rgba(128,128,128,0.2); }
.ag-review-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 20px 12px; border-bottom: 1px solid rgba(128,128,128,0.12); flex-shrink: 0; }
.ag-review-header h3 { margin: 0; font-size: 17px; font-weight: 700; }
.ag-review-desc { margin: 4px 0 0; font-size: 11px; opacity: 0.4; }
.ag-review-close { width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.4; }
.ag-review-close:hover { opacity: 1; background: rgba(128,128,128,0.1); }
.ag-review-body { flex: 1; overflow-y: auto; padding: 14px 20px; display: flex; flex-direction: column; gap: 14px; }
.ag-review-footer { padding: 10px 20px; border-top: 1px solid rgba(128,128,128,0.1); display: flex; justify-content: flex-end; flex-shrink: 0; }

.ag-review-section { }
.ag-review-section-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.ag-review-section-title { font-size: 13px; font-weight: 600; }
.ag-review-section-hint { font-size: 11px; opacity: 0.4; }
.ag-review-link { padding: 2px 8px; border: 1px solid rgba(128,128,128,0.15); border-radius: 12px; background: transparent; color: inherit; cursor: pointer; font-size: 10px; font-family: inherit; opacity: 0.6; }
.ag-review-link:hover { opacity: 1; }
.ag-review-chapters { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.ag-review-chapter-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.ag-review-chapter-item:hover { background: rgba(128,128,128,0.05); }
.ag-review-chapter-item input[type="checkbox"] { accent-color: #2ea86a; }
.ag-review-chapter-title { flex: 1; }
.ag-review-chapter-meta { font-size: 10px; opacity: 0.35; }
.ag-review-empty { text-align: center; padding: 20px; font-size: 12px; opacity: 0.35; }

.ag-review-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ag-review-btn { padding: 7px 16px; border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-family: inherit; font-weight: 500; display: flex; align-items: center; gap: 6px; }
.ag-review-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ag-review-btn.quick { background: rgba(128,128,128,0.12); color: inherit; }
.ag-review-btn.quick:hover:not(:disabled) { background: rgba(128,128,128,0.2); }
.ag-review-btn.deep { background: rgba(46,168,106,0.12); color: #2ea86a; }
.ag-review-btn.deep:hover:not(:disabled) { background: rgba(46,168,106,0.2); }
.ag-review-hint { font-size: 10px; opacity: 0.3; }
.ag-spinner-sm { width: 12px; height: 12px; border: 2px solid rgba(128,128,128,0.15); border-top-color: #2ea86a; border-radius: 50%; animation: ag-spin 0.8s linear infinite; display: inline-block; }

.ag-review-progress { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px; }
.ag-spinner { width: 28px; height: 28px; border: 3px solid rgba(128,128,128,0.15); border-top-color: #2ea86a; border-radius: 50%; animation: ag-spin 0.8s linear infinite; }
@keyframes ag-spin { to { transform: rotate(360deg); } }
.ag-review-progress p { font-size: 12px; opacity: 0.5; }

.ag-review-results { display: flex; flex-direction: column; gap: 10px; }
.ag-review-summary { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px; background: rgba(128,128,128,0.05); flex-wrap: wrap; }
.ag-review-stat { font-size: 12px; font-weight: 500; }
.ag-review-stat.error { color: #ef4444; }
.ag-review-stat.warn { color: #f0a020; }
.ag-review-stat.ok { color: #2ea86a; opacity: 0.7; }
.ag-review-group { }
.ag-review-group-title { font-size: 12px; font-weight: 600; margin: 0 0 4px; opacity: 0.6; }
.ag-review-issue { display: flex; align-items: baseline; gap: 4px; padding: 4px 8px; border-radius: 4px; font-size: 11px; line-height: 1.5; }
.ag-review-issue-error { background: rgba(239,68,68,0.06); border-left: 2px solid rgba(239,68,68,0.3); }
.ag-review-issue-warn { background: rgba(240,160,32,0.04); border-left: 2px solid rgba(240,160,32,0.2); }
.ag-review-issue-level { flex-shrink: 0; }
.ag-review-issue-type { color: #f0a020; flex-shrink: 0; font-size: 10px; }
.ag-review-issue-msg { flex: 1; }
.ag-review-pass { text-align: center; padding: 20px; font-size: 13px; color: #2ea86a; }

.ag-review-close-btn { padding: 6px 18px; border: 1px solid rgba(128,128,128,0.15); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; }
.ag-review-close-btn:hover { background: rgba(128,128,128,0.08); }

/* ── 暗色模式 ── */
.ag-theme-dark {
  background: #1a1a1e; color: #c9c9cd;
}
.ag-theme-dark .ag-header { background: #222228; border-bottom-color: #2a2a30; }
.ag-theme-dark .ag-header-tab { color: #888; }
.ag-theme-dark .ag-header-tab.active { background: #10b981; color: #fff; }
.ag-theme-dark .ag-chat { background: transparent; }
.ag-theme-dark .ag-empty { color: #666; }
.ag-theme-dark .ag-empty-title { color: #888; }
.ag-theme-dark .ag-msg-text { color: #c9c9cd; }
.ag-theme-dark .ag-msg.system .ag-msg-text { color: #888; }
.ag-theme-dark .ag-reasoning { background: rgba(255,255,255,0.03); border-color: #333; }
.ag-theme-dark .ag-reasoning-text { color: #999; }
.ag-theme-dark .ag-recommend-card { background: rgba(82,200,160,0.04); border-color: rgba(82,200,160,0.12); }
.ag-theme-dark .ag-rec-card-label { color: #c9c9cd; }
.ag-theme-dark .ag-rec-card-desc { color: #888; }
.ag-theme-dark .ag-rec-nav-btn { color: #888; border-color: #333; }
.ag-theme-dark .ag-rec-nav-btn:hover:not(:disabled) { color: #c9c9cd; border-color: #555; }
.ag-theme-dark .ag-rec-card-hd { border-bottom-color: rgba(255,255,255,0.06); }
.ag-theme-dark .ag-rec-card-nav { border-top-color: rgba(255,255,255,0.06); }
.ag-theme-dark .ag-input-area { border-top-color: #2a2a30; }
.ag-theme-dark .ag-textarea { color: #c9c9cd; background: #222228; border-color: #333; }
.ag-theme-dark .ag-textarea::placeholder { color: #555; }
.ag-theme-dark .ag-toolbar-btn { color: #888; background: rgba(255,255,255,0.03); border-color: #333; }
.ag-theme-dark .ag-toolbar-btn:hover { background: rgba(255,255,255,0.06); color: #aaa; }
.ag-theme-dark .ag-bottom-bar { border-top-color: #2a2a30; }
.ag-theme-dark .ag-bottom-select-btn { color: #888; border-color: #333; background: #222228; }
.ag-theme-dark .ag-model-btn { color: #888; border-color: #333; background: #222228; }
.ag-theme-dark .ag-quick-cmd-pop { background: #222228; border-color: #333; }
.ag-theme-dark .ag-quick-cmd-item { color: #c9c9cd; }
.ag-theme-dark .ag-quick-cmd-item:hover { background: rgba(255,255,255,0.05); }
.ag-theme-dark .ag-pop-menu { background: #222228; border-color: #333; }
.ag-theme-dark .ag-pop-item { color: #888; }
.ag-theme-dark .ag-pop-item:hover { background: rgba(255,255,255,0.05); color: #c9c9cd; }
.ag-theme-dark .ag-selector-card { background: rgba(255,255,255,0.03); border-color: #333; color: #888; }
.ag-theme-dark .ag-selector-card:hover { border-color: #555; }
.ag-theme-dark .ag-modal { background: #222228; color: #c9c9cd; }
.ag-theme-dark .ag-modal-header { border-bottom-color: #2a2a30; }
.ag-theme-dark .ag-modal-footer { border-top-color: #2a2a30; }
.ag-theme-dark .ag-settings-block { border-color: #2a2a30; }
.ag-theme-dark .ag-settings-label { color: #888; }
.ag-theme-dark .ag-settings-hint { color: #666; }
.ag-theme-dark .ag-input { color: #c9c9cd; background: #1a1a1e; border-color: #333; }
.ag-theme-dark .ag-select { color: #c9c9cd; background: #1a1a1e; border-color: #333; }
.ag-theme-dark .ag-settings-dropdown-btn { color: #c9c9cd; background: #1a1a1e; border-color: #333; }
.ag-theme-dark .ag-settings-dropdown-menu { background: #222228; border-color: #333; }
.ag-theme-dark .ag-settings-dropdown-item { color: #888; }
.ag-theme-dark .ag-settings-dropdown-item:hover { background: rgba(255,255,255,0.04); }
.ag-theme-dark .ag-settings-field-card { background: rgba(255,255,255,0.02); border-color: #333; }
.ag-theme-dark .ag-msg.assistant .ag-msg-text { color: #c9c9cd; }
.ag-theme-dark .ag-send-btn { background: #10b981; }
.ag-theme-dark .ag-empty-cta { background: #10b981; }
.ag-theme-dark .ag-empty-cta:hover { background: #059669; }
.ag-theme-dark .ag-rec-nocurrent { border-color: rgba(16,185,129,0.2); background: rgba(16,185,129,0.04); }
.ag-theme-dark .ag-recover-banner { background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.15); }
.ag-theme-dark .ag-ctx-change { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.12); }
.ag-theme-light { background: #fdfbf7; color: #1a1a1a; }
</style>
