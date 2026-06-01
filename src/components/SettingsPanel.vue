<template>
  <div class="sp-root">
    <!-- 1. 顶部工具栏 -->
    <div class="sp-topbar">
      <div class="sp-topbar-left">
        <span class="sp-breadcrumb">工作台</span>
        <span class="sp-breadcrumb-sep">|</span>
        <span class="sp-breadcrumb active">设定数据</span>
      </div>
      <div class="sp-topbar-right">
        <button class="sp-icon-btn" title="刷新" @click="notifyChanged()"><n-icon size="16"><RefreshOutline /></n-icon></button>
        <button class="sp-icon-btn" title="完成" @click="manager.flush()"><n-icon size="16"><CheckmarkOutline /></n-icon></button>
      </div>
    </div>

    <!-- AI 功能栏 -->
    <div class="sp-ai-bar">
      <div class="sp-ai-bar-left">
        <button class="sp-ai-btn ghost">☰ 隐藏目录</button>
        <button class="sp-ai-btn primary" @click="triggerAi('ai-update-settings')">📋 设定更新</button>
        <button class="sp-ai-btn primary" @click="triggerAi('ai-generate-all')">✨ AI设定生成</button>
        <button class="sp-ai-btn primary" @click="triggerAi('ai-name')">✨ AI取名</button>
        <button class="sp-ai-btn accent" @click="showSmartImportModal = true">智能导入</button>
      </div>
      <div class="sp-ai-bar-right">
        <button class="sp-text-btn" @click="handleImport">↻ 导入</button>
        <button class="sp-text-btn" @click="handleExport">↓ 导出</button>
      </div>
    </div>

    <!-- 主体 -->
    <div class="sp-body">
      <!-- 2. 左侧边栏 -->
      <aside class="sp-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sp-sidebar-header">
          <span>设定目录</span>
          <div class="sp-sidebar-header-r">
            <label class="sp-toggle-label"><input type="checkbox" v-model="showDeprecated" /> 显示弃用</label>
            <button class="sp-side-btn" :class="{ active: multiSelectMode }" @click="toggleMultiSelect">{{ multiSelectMode ? '☑ 退出多选' : '☐ 多选管理' }}</button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="sp-tabs">
          <button v-for="t in displayTabs" :key="t.key" class="sp-tab" :class="{ active: currentTab === t.key }" @click="currentTab = t.key; selectedId = null">{{ t.icon }} {{ t.label }}</button>
        </div>

        <!-- Category filter -->
        <div class="sp-folder-bar">
          <span>分类</span>
          <button v-for="cat in categoryOptions" :key="cat" class="sp-folder-btn" :class="{ active: currentCategory === cat || (cat === '全部' && !currentCategory) }" @click="currentCategory = cat === '全部' ? '' : cat">{{ cat }}</button>
        </div>
        <div v-if="!folders.length" class="sp-folder-empty">暂无子文件夹</div>

        <!-- Entity list -->
        <div class="sp-list">
          <div v-for="item in filteredList" :key="item.id" class="sp-list-item"
            :class="{ selected: selectedId === item.id, deprecated: item.deprecated, multi: multiSelectMode, checked: multiSelectMode && selectedIds.has(item.id) }"
            @click="multiSelectMode ? toggleItemSelect(item.id) : selectItem(item)">
            <input v-if="multiSelectMode" type="checkbox" class="sp-checkbox" :checked="selectedIds.has(item.id)" @click.stop @change="toggleItemSelect(item.id)" />
            <span class="sp-list-name">{{ item.name }}</span>
            <span class="sp-list-meta">v{{ item.version }} {{ item.source === 'ai_extraction' ? '提取' : '新增' }}</span>
          </div>
          <div v-if="filteredList.length === 0" class="sp-list-empty">暂无条目</div>
        </div>

        <!-- 批量操作栏 -->
        <div v-if="multiSelectMode && selectedIds.size > 0" class="sp-bulk-bar">
          <span class="sp-bulk-count">已选 {{ selectedIds.size }} 项</span>
          <button class="sp-bulk-btn" @click="selectAll">全选</button>
          <button class="sp-bulk-btn" @click="deselectAll">取消</button>
          <button class="sp-bulk-btn danger" @click="batchSetDeprecated(true)">弃用</button>
          <button class="sp-bulk-btn danger" @click="batchDelete">删除</button>
          <button class="sp-bulk-btn" @click="batchExport">导出</button>
        </div>

        <!-- Bottom actions -->
        <div class="sp-sidebar-footer">
          <button class="sp-add-btn" @click="startAdd">新增</button>
          <button v-if="selectedId" class="sp-depr-btn" :class="{ active: selectedItem?.deprecated }" @click="toggleDeprecated">{{ selectedItem?.deprecated ? '取消弃用' : '弃用' }}</button>
        </div>
      </aside>

      <!-- 拖拽分割线 -->
      <div class="sp-resizer" @mousedown="startResize"></div>

      <!-- 3. 右侧详情 -->
      <section class="sp-detail">
        <template v-if="!selectedItem">
          <div class="sp-detail-empty">← 从左侧选择或新建条目</div>
        </template>
        <template v-else>
          <div class="sp-detail-scroll">
            <!-- Header: name + lock + AI -->
            <div class="sp-detail-header">
              <input class="sp-name-input" :value="editName" @change="handleNameChange(($event.target as HTMLInputElement).value)" />
              <div class="sp-detail-header-r">
                <button class="sp-action-btn">锁定</button>
                <button class="sp-action-btn primary" @click="triggerAi('ai-generate-all')">AI 细化</button>
              </div>
            </div>

            <!-- Folder -->
            <div class="sp-detail-row">
              <span class="sp-row-label">文件夹</span>
              <span class="sp-row-val">{{ currentFolder || '根目录' }}</span>
            </div>

            <!-- Format toggle -->
            <div class="sp-format-bar">
              <span>V3 统一格式</span>
              <button class="sp-fmt-tab" :class="{ active: editMode === 'structured' }" @click="editMode = 'structured'">结构化</button>
              <button class="sp-fmt-tab" :class="{ active: editMode === 'raw' }" @click="editMode = 'raw'">原文</button>
              <button class="sp-fmt-copy">📋</button>
            </div>

            <!-- 资料 -->
            <div class="sp-section">
              <div class="sp-section-header">资料</div>
              <textarea class="sp-textarea" :value="editSummary" rows="3" placeholder="自由编辑的背景设定，用于生成/细化" @change="handleSummaryChange(($event.target as HTMLTextAreaElement).value)"></textarea>
            </div>

            <!-- 角色 fields -->
            <template v-if="currentTab === 'character'">
              <div class="sp-section"><div class="sp-section-header">角色分类</div>
                <div class="sp-field"><label>角色类别</label>
                  <select class="sp-input" :value="editData.category || '配角'" @change="updateField('category', ($event.target as HTMLSelectElement).value)">
                    <option>主角</option><option>配角</option><option>反派</option><option>路人</option><option>特殊</option>
                  </select>
                </div>
                <div class="sp-field"><label>登场卷号</label><input class="sp-input sm" :value="editData.volume || ''" placeholder="如：第1卷" @change="updateField('volume', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>性别</label>
                  <select class="sp-input" :value="editData.gender" @change="updateField('gender', ($event.target as HTMLSelectElement).value)">
                    <option value="">未设定</option><option>男</option><option>女</option><option>其他</option>
                  </select>
                </div>
                <div class="sp-field"><label>年龄</label><input class="sp-input sm" :value="editData.age || ''" placeholder="如：18" @change="updateField('age', ($event.target as HTMLInputElement).value)" /></div>
              </div>
              <div class="sp-section"><div class="sp-section-header">基本信息</div>
              <div class="sp-field">
                <label>职业 / 身份</label>
                <input class="sp-input" :value="editData.identity" placeholder="例如：炼药师 / 隐世医仙" @change="updateField('identity', ($event.target as HTMLInputElement).value)" />
              </div>
              <div class="sp-field">
                <label>别名 / 称呼</label>
                <input class="sp-input" :value="editData.nickname || ''" placeholder="例如：药老、小医仙" @change="updateField('nickname', ($event.target as HTMLInputElement).value)" />
              </div>
              <div class="sp-field">
                <label>人设标签</label>
                <input class="sp-input" :value="editData.characterTags || ''" placeholder="例如：冰山美人、腹黑、毒舌、护短" @change="updateField('characterTags', ($event.target as HTMLInputElement).value)" />
              </div>
              <div class="sp-field">
                <label>角色简介 ⚡</label>
                <textarea class="sp-textarea" :value="editData.personality" rows="3" placeholder="用自然语言写清：身份、外显形象、隐藏面、长期动机等" @change="updateField('personality', ($event.target as HTMLTextAreaElement).value)"></textarea>
              </div>
              </div>

              <!-- 深层动机 -->
              <div class="sp-section">
                <div class="sp-section-header">深层动机（生态人物树）</div>
                <div class="sp-field"><label>核心创伤 / 心理动机</label><textarea class="sp-textarea" :value="editData.coreTrauma || ''" rows="2" placeholder="角色最深的心理创伤或驱动力来源" @change="updateField('coreTrauma', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
                <div class="sp-field"><label>源动力</label><input class="sp-input" :value="editData.motivation || ''" placeholder="驱动角色前进的根本目标" @change="updateField('motivation', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>成长弧光</label><textarea class="sp-textarea" :value="editData.growthArc || ''" rows="2" placeholder="角色全书的变化轨迹，如：从被动追查的奴隶→主动布局的棋手→棋盘本身" @change="updateField('growthArc', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
              </div>

              <!-- 结局 -->
              <div class="sp-section">
                <div class="sp-section-header">终局信息</div>
                <div class="sp-field"><label>最终结局</label><textarea class="sp-textarea" :value="editData.ending || ''" rows="2" placeholder="角色在全书的最终命运" @change="updateField('ending', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
              </div>

              <!-- 长期状态 -->
              <div class="sp-section">
                <div class="sp-section-header">
                  长期状态
                  <span class="sp-section-note">每次设定更新自动覆盖</span>
                </div>
                <div class="sp-field"><label>状态</label><input class="sp-input" :value="editData.location" placeholder="在场 / 失踪 / 死亡" @change="updateField('location', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>重要度（Rank）</label><input class="sp-input sm" type="number" :value="editData.importance" placeholder="数字越小越重要" @change="updateField('importance', Number(($event.target as HTMLInputElement).value))" /></div>
                <div class="sp-field"><label>身体状态</label><textarea class="sp-textarea" :value="editData.longTermEffects" rows="2" placeholder="只写长期影响（伤残/病根/封印等）" @change="updateField('longTermEffects', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
                <div class="sp-field"><label>心理结构 / 立场</label><textarea class="sp-textarea" :value="editData.tendencies" rows="2" placeholder="只写长期倾向，不写一时情绪" @change="updateField('tendencies', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
                <div class="sp-field"><label>性格 / 行为模式</label><textarea class="sp-textarea" :value="editData.behaviorPatterns" rows="2" placeholder="没有变化可留空" @change="updateField('behaviorPatterns', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
              </div>

              <div class="sp-section">
                <div class="sp-section-header">技能 / 能力</div>
                <div class="sp-field">
                  <input class="sp-input" :value="editData.skills || ''" placeholder="例如：灵火术、炼丹术、剑法·天罡" @change="updateField('skills', ($event.target as HTMLInputElement).value)" />
                </div>
              </div>
              <div class="sp-section">
                <div class="sp-section-header">技能标签（列表）</div>
                <div class="sp-field">
                  <input class="sp-input" :value="(editData.abilities || []).join(', ')" placeholder="输入技能后回车添加" @change="updateField('abilities', ($event.target as HTMLInputElement).value.split(/[,，\n]/).filter(Boolean))" />
                </div>
              </div>
              <div class="sp-section">
                <div class="sp-section-header">关键物品</div>
                <div class="sp-field">
                  <textarea class="sp-textarea" :value="editData.keyItems || ''" rows="2" placeholder="例如：青鸾剑（本命灵器）、玄铁丹炉" @change="updateField('keyItems', ($event.target as HTMLTextAreaElement).value)"></textarea>
                </div>
              </div>
              <div class="sp-section">
                <div class="sp-section-header">人际关系</div>
                <span v-if="!editData.relationships || (Array.isArray(editData.relationships) && !editData.relationships.length)" class="sp-none">暂无（由 State Keeper 自动维护）</span>
                <textarea v-else class="sp-textarea" :value="formatRelationships(editData.relationships)" rows="2" @change="updateField('relationships', parseRelationships(($event.target as HTMLTextAreaElement).value))"></textarea>
              </div>
            </template>

            <!-- 世界观设定 fields -->
            <template v-if="currentTab === 'world_setting'">
              <div class="sp-section"><div class="sp-section-header">基本信息</div>
                <div class="sp-field"><label>类别</label><input class="sp-input" :value="editData.category" placeholder="地理/势力/规则/历史/文化/魔法体系" @change="updateField('category', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>作用范围</label>
                  <select class="sp-input" :value="editData.scope" @change="updateField('scope', ($event.target as HTMLSelectElement).value)">
                    <option>全局</option><option>区域</option><option>局部</option><option>个人</option>
                  </select>
                </div>
                <div class="sp-field"><label>状态</label>
                  <select class="sp-input" :value="editData.status" @change="updateField('status', ($event.target as HTMLSelectElement).value)">
                    <option>活跃</option><option>已落定</option><option>隐藏</option><option>废弃</option>
                  </select>
                </div>
                <div class="sp-field"><label>描述</label><textarea class="sp-textarea" :value="editData.description || ''" rows="3" placeholder="世界观条目的详细描述..." @change="updateField('description', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
                <div class="sp-field"><label>关联实体</label><input class="sp-input" :value="editData.relatedEntities || ''" placeholder="角色/势力/地点名称，逗号分隔" @change="updateField('relatedEntities', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>规则/约束</label><input class="sp-input" :value="(editData.rules || []).join(', ')" placeholder="逗号分隔的规则列表" @change="updateField('rules', ($event.target as HTMLInputElement).value.split(/[,，\n]/).filter(Boolean))" /></div>
              </div>
              <div class="sp-section"><div class="sp-section-header">精确数据</div>
                <div class="sp-field"><label>数值</label><input class="sp-input sm" type="number" :value="editData.numericValue" placeholder="正文明确数值" @change="updateField('numericValue', Number(($event.target as HTMLInputElement).value))" /></div>
                <div class="sp-field"><label>数量</label><input class="sp-input sm" type="number" :value="editData.quantity" placeholder="如 1000000" @change="updateField('quantity', Number(($event.target as HTMLInputElement).value))" /></div>
                <div class="sp-field"><label>货币</label><input class="sp-input" :value="editData.currency || ''" placeholder="CNY / GOLD / SPIRIT_STONE" @change="updateField('currency', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>单位</label><input class="sp-input" :value="editData.unit || ''" placeholder="天 / 次 / 枚" @change="updateField('unit', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>方向</label><input class="sp-input" :value="editData.direction || ''" placeholder="asset / liability" @change="updateField('direction', ($event.target as HTMLInputElement).value)" /></div>
              </div>
              <div class="sp-section"><div class="sp-section-header">时间信息</div>
                <div class="sp-field"><label>时间点</label><input class="sp-input" :value="editData.timePoint || ''" placeholder="YYYY-MM-DD 或 第X章" @change="updateField('timePoint', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>时间精度</label><input class="sp-input" :value="editData.timePrecision || ''" placeholder="天 / 分 / 秒" @change="updateField('timePrecision', ($event.target as HTMLInputElement).value)" /></div>
              </div>
              <div class="sp-field"><label>条款 / 约束</label><textarea class="sp-textarea" :value="editData.terms || ''" rows="2" placeholder="触发条件/违约后果" @change="updateField('terms', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
            </template>

            <!-- 伏笔 fields -->
            <template v-if="currentTab === 'foreshadowing'">
              <div class="sp-section"><div class="sp-section-header">伏笔信息</div>
                <div class="sp-field"><label>埋设章节</label><input class="sp-input" :value="editData.plantedChapter || ''" placeholder="第X章" @change="updateField('plantedChapter', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>预期回收</label><input class="sp-input" :value="editData.expectedChapter || ''" placeholder="第X章" @change="updateField('expectedChapter', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>回收状态</label>
                  <button class="sp-toggle-btn" :class="{on:editData.resolved}" @click="updateField('resolved', !editData.resolved)">{{ editData.resolved ? '✅ 已回收' : '⏳ 未回收' }}</button>
                </div>
                <div class="sp-field"><label>秘密内容</label><textarea class="sp-textarea" :value="editData.secret || ''" rows="3" placeholder="伏笔的核心秘密内容，可被误读/回收/再次触发" @change="updateField('secret', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
                <div class="sp-field"><label>标签</label><input class="sp-input" :value="editData.tags || ''" placeholder="逗号分隔，如：主线伏笔、角色秘密" @change="updateField('tags', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>关联锚点</label><input class="sp-input" :value="(editData.relatedAnchors || []).join(', ')" placeholder="逗号分隔的锚点 ID" @change="updateField('relatedAnchors', ($event.target as HTMLInputElement).value.split(/[,，\n]/).filter(Boolean))" /></div>
              </div>
            </template>

            <!-- 物品 fields -->
            <template v-if="currentTab === 'item'">
              <div class="sp-section"><div class="sp-section-header">物品信息</div>
                <div class="sp-field"><label>持有者</label><input class="sp-input" :value="editData.owner || ''" placeholder="角色名称" @change="updateField('owner', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>位置</label><input class="sp-input" :value="editData.location || ''" placeholder="物品所在位置" @change="updateField('location', ($event.target as HTMLInputElement).value)" /></div>
                <div class="sp-field"><label>功能</label><textarea class="sp-textarea" :value="editData.function || ''" rows="2" placeholder="物品的功能与作用" @change="updateField('function', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
                <div class="sp-field"><label>状态</label>
                  <select class="sp-input" :value="editData.status || '正常'" @change="updateField('status', ($event.target as HTMLSelectElement).value)">
                    <option>正常</option><option>损坏</option><option>丢失</option><option>封印</option><option>已销毁</option>
                  </select>
                </div>
                <div class="sp-field"><label>属性标签</label><input class="sp-input" :value="(editData.properties || []).join(', ')" placeholder="逗号分隔" @change="updateField('properties', ($event.target as HTMLInputElement).value.split(/[,，\n]/).filter(Boolean))" /></div>
                <div class="sp-field"><label>已销毁</label>
                  <button class="sp-toggle-btn" :class="{on:editData.destroyed}" @click="updateField('destroyed', !editData.destroyed)">{{ editData.destroyed ? '💀 已销毁' : '✅ 完好' }}</button>
                </div>
              </div>
            </template>

            <!-- 情节线 fields -->
            <template v-if="currentTab === 'plot_arc'">
              <div class="sp-section"><div class="sp-section-header">情节线信息</div>
                <div class="sp-field"><label>类型</label>
                  <select class="sp-input" :value="editData.arcType || 'sub'" @change="updateField('arcType', ($event.target as HTMLSelectElement).value)">
                    <option value="main">主线</option><option value="sub">支线</option><option value="side">副本</option><option value="background">背景线</option>
                  </select>
                </div>
                <div class="sp-field"><label>状态</label>
                  <select class="sp-input" :value="editData.status || 'planned'" @change="updateField('status', ($event.target as HTMLSelectElement).value)">
                    <option value="planned">计划中</option><option value="in_progress">进行中</option><option value="completed">已完成</option>
                  </select>
                </div>
                <div class="sp-field"><label>描述</label><textarea class="sp-textarea" :value="editData.description || ''" rows="3" placeholder="情节线的详细描述" @change="updateField('description', ($event.target as HTMLTextAreaElement).value)"></textarea></div>
                <div class="sp-field"><label>涉及章节</label><input class="sp-input" :value="(editData.chapters || []).join(', ')" placeholder="逗号分隔的章节号" @change="updateField('chapters', ($event.target as HTMLInputElement).value.split(/[,，\n]/).filter(Boolean).map(Number))" /></div>
                <div class="sp-field"><label>关联角色</label><input class="sp-input" :value="(editData.relatedCharacters || []).join(', ')" placeholder="逗号分隔的角色名" @change="updateField('relatedCharacters', ($event.target as HTMLInputElement).value.split(/[,，\n]/).filter(Boolean))" /></div>
              </div>
            </template>

            <!-- Delete -->
            <button class="sp-delete-btn" @click="confirmDelete">🗑️ 删除此条目</button>
          </div>
        </template>
      </section>
    </div>

    <!-- AI 弹窗 -->
    <AiModal v-if="aiModal.visible" :is-dark="isDark" :title="aiModal.title" :description="aiModal.desc" :target-label="aiModal.target" :write-label="aiModal.write" :mode="aiModal.mode" :show-gen-count="aiModal.showGenCount" :show-note-count="aiModal.showNoteCount" :template-name="aiModal.templateName" :template-desc="aiModal.templateDesc" :default-extra-prompt="aiModal.defaultExtraPrompt" :special-fields="aiModal.specialFields" :context-switches="aiModal.contextSwitches || []" :hide-chapter="true" :skip-strip="true" @close="aiModal.visible = false" @write="onAiWrite" />

    <!-- AI 取名选择面板 -->
    <div v-if="showNamePicker" class="sp-name-picker-overlay" @click.self="cancelNamePicker">
      <div class="sp-name-picker">
        <div class="sp-np-header">
          <span>选择要写入的名称</span>
          <button class="sp-np-close" @click="cancelNamePicker">✕</button>
        </div>
        <div class="sp-np-list">
          <button
            v-for="(opt, i) in nameOptions"
            :key="i"
            class="sp-np-option"
            @click="selectNameOption(opt)"
          >{{ opt }}</button>
        </div>
        <div v-if="nameOptions.length === 0" class="sp-np-empty">未解析到可选条目，请重新生成</div>
      </div>
    </div>

    <!-- 设定更新弹窗 -->
    <SettingsUpdateModal
      v-if="showSettingsUpdateModal"
      :is-dark="isDark"
      :manager="props.manager"
      @close="showSettingsUpdateModal = false"
      @rollback="onSettingsRollback"
      @settings-changed="notifyChanged()"
    />
    <SmartImportModal
      ref="smartImportModalRef"
      v-if="showSmartImportModal"
      :is-dark="isDark"
      :manager="props.manager"
      @close="showSmartImportModal = false"
      @settings-changed="notifyChanged()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { NIcon, useMessage } from 'naive-ui'
import { RefreshOutline, CheckmarkOutline } from '@vicons/ionicons5'
import AiModal, { type ContextSwitch } from './AiModal.vue'
import SettingsUpdateModal from './SettingsUpdateModal.vue'
import SmartImportModal from './SmartImportModal.vue'
import { getTemplate } from '../composables/useTemplates'
import { type SettingsManager, defaultDataForType, type SettingEntity, type SettingEntityType } from '../composables/useSettings'
import { useWorkRepo } from '../composables/useWorkRepo'
import { showConfirm } from '../composables/useConfirm'
import { StateKeeperVersionManager } from '../composables/useStateKeeper'

// ── 健壮的 JSON 提取：从 AI 输出中提取纯 JSON（处理代码块、额外文本等）──
function extractJson(text: string): string {
  // 1. 优先提取 markdown 代码块中的 JSON
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()

  // 2. 尝试提取最外层 JSON 数组 [...]
  const arrMatch = text.match(/\[([\s\S]*)\]/)
  if (arrMatch) {
    // 从第一个 [ 到最后一个 ]，需处理嵌套
    let depth = 0, start = -1
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '[') { if (depth === 0) start = i; depth++ }
      else if (text[i] === ']') {
        depth--
        if (depth === 0 && start >= 0) return text.slice(start, i + 1)
      }
    }
  }

  // 3. 尝试提取最外层 JSON 对象 {...}
  let depth = 0, objStart = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) objStart = i; depth++ }
    else if (text[i] === '}') {
      depth--
      if (depth === 0 && objStart >= 0) return text.slice(objStart, i + 1)
    }
  }

  // 4. 兜底：移除 markdown 代码块标记后返回
  return text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
}

// ── AI 返回类型名归一化 ──
// AI 可能返回中文/英文/变体类型名，统一映射到 SettingEntityType
function normalizeEntityType(raw: string): SettingEntityType {
  const t = (raw || '').trim().toLowerCase()
  if (t === 'character' || t === 'char' || t === '角色' || t === '人物' || t === '人') return 'character'
  if (t === 'world_setting' || t === 'worldsetting' || t === 'world' || t === '世界观' || t === '世界' || t === '设定' || t === '势力' || t === '地点' || t === 'location' || t === '事件' || t === 'event') return 'world_setting'
  if (t === 'item' || t === '物品' || t === '道具' || t === '装备' || t === '武器') return 'item'
  if (t === 'foreshadowing' || t === 'foreshadow' || t === '伏笔' || t === '伏线' || t === '线索' || t === '悬念') return 'foreshadowing'
  if (t === 'plot_arc' || t === 'plotarc' || t === 'plot' || t === '情节线' || t === '剧情线' || t === '支线' || t === 'arc') return 'plot_arc'
  // 兜底：无法识别时归为 world_setting（最常见的设定类型）
  console.warn(`[normalizeEntityType] 未知类型 "${raw}"，兜底为 world_setting`)
  return 'world_setting'
}

// ── 落盘时补全结构化数据默认值 ──
// AI 可能遗漏 category 等分类字段，在写入前补全默认值
// 同时剥离 type/name/desc 等元数据字段，防止污染 structuredData
// 'description' 不在 META_KEYS 中，因为它是 world_setting 和 plot_arc 的合法结构化字段
const META_KEYS = new Set(['type', 'name', 'desc', 'summary', 'title', 'data', 'structuredData', 'entities', 'settings'])

function stripMetaKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!META_KEYS.has(k)) cleaned[k] = v
  }
  return cleaned
}

// ── 字段名映射：AI 返回的可能不匹配的字段 → 标准字段 ──
const FIELD_ALIASES: Record<string, Record<string, string>> = {
  character: {
    // 性别
    'sex': 'gender', '性别': 'gender',
    // 年龄
    '年纪': 'age',
    // 身份
    '职业': 'identity', '身份': 'identity', 'profession': 'identity', 'job': 'identity',
    // 别名
    '外号': 'nickname', '别名': 'nickname', '昵称': 'nickname', 'alias': 'nickname',
    // 性格
    '性格': 'personality', '性格特征': 'personality', '性格关键词': 'personality',
    // 外貌
    '外貌': 'appearance', '外貌特征': 'appearance', '外貌标志': 'appearance', 'appearance': 'appearance',
    // 能力
    '能力': 'abilities', '技能': 'skills', '特殊能力': 'abilities', '超能力': 'abilities',
    'powers': 'abilities', 'talents': 'abilities',
    // 标签
    '标签': 'characterTags', '人设标签': 'characterTags', 'tags': 'characterTags',
    // 物品
    '关键物品': 'keyItems', '道具': 'keyItems', '装备': 'keyItems', 'items': 'keyItems',
    // 位置
    '位置': 'location', '所在地': 'location', '当前位置': 'location', '位置': 'location',
    // 分类
    '类型': 'category', '角色类型': 'category', '人物类型': 'category',
    // 动机
    '动机': 'motivation', '核心动机': 'motivation', '驱动力': 'motivation', '核心驱动力': 'motivation',
    // 创伤
    '创伤': 'coreTrauma', '心理阴影': 'coreTrauma', '核心创伤': 'coreTrauma',
    // 成长
    '成长': 'growthArc', '成长弧光': 'growthArc', '成长路线': 'growthArc', '发展': 'growthArc',
    // 结局
    '结局': 'ending', '最终结局': 'ending',
    // 卷
    '登场卷': 'volume', '登场卷号': 'volume',
    // 关系
    '人际关系': 'relationships', '关系': 'relationships',
  },
  world_setting: {
    // 分类
    '类型': 'category', '设定类型': 'category', '世界观类型': 'category',
    // 描述
    '描述': 'description', '详细描述': 'description', '说明': 'description',
    // 范围
    '范围': 'scope', '影响范围': 'scope',
    // 状态
    '状态': 'status',
    // 规则
    '规则': 'rules', '核心规则': 'rules', '设定规则': 'rules',
    // 相关实体
    '相关实体': 'relatedEntities', '关联设定': 'relatedEntities', '相关设定': 'relatedEntities',
    // 数值
    '数值': 'numericValue', '数量': 'quantity', '货币': 'currency', '单位': 'unit',
    '方向': 'direction', '时间点': 'timePoint', '术语': 'terms',
  },
  item: {
    // 持有者
    '持有者': 'owner', '所有者': 'owner', '归属': 'owner',
    // 位置
    '位置': 'location', '所在地': 'location', '存放位置': 'location',
    // 功能
    '功能': 'function', '用途': 'function', '作用': 'function', '效果': 'function',
    // 状态
    '状态': 'status', '当前状态': 'status',
    // 特性
    '特性': 'properties', '属性': 'properties', '特殊属性': 'properties',
    // 销毁
    '销毁': 'destroyed', '是否销毁': 'destroyed', '已销毁': 'destroyed',
  },
  foreshadowing: {
    // 埋设章节
    '埋设章节': 'plantedChapter', '埋设': 'plantedChapter', '设置章节': 'plantedChapter',
    // 预期章节
    '预期章节': 'expectedChapter', '揭示章节': 'expectedChapter', '回收章节': 'expectedChapter',
    // 秘密
    '秘密': 'secret', '伏笔内容': 'secret', '真相': 'secret',
    // 标签
    '标签': 'tags', '分类': 'tags',
    // 相关锚点
    '相关锚点': 'relatedAnchors', '关联角色': 'relatedAnchors', '关联设定': 'relatedAnchors',
    // 解决
    '解决': 'resolved', '已解决': 'resolved', '已回收': 'resolved',
  },
  plot_arc: {
    // 类型
    '类型': 'arcType', '情节类型': 'arcType', '支线类型': 'arcType',
    // 状态
    '状态': 'status', '进度': 'status',
    // 描述
    '描述': 'description', '情节描述': 'description', '剧情描述': 'description',
    // 章节
    '章节': 'chapters', '涉及章节': 'chapters',
    // 相关角色
    '相关角色': 'relatedCharacters', '涉及角色': 'relatedCharacters', '角色': 'relatedCharacters',
  },
}

function mapFieldNames(raw: Record<string, unknown>, entityType: SettingEntityType): Record<string, unknown> {
  const aliases = FIELD_ALIASES[entityType] || {}
  const mapped: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    const lowerKey = key.toLowerCase().trim()
    const mappedKey = aliases[lowerKey] || aliases[key] || key
    mapped[mappedKey] = value
  }

  return mapped
}

function enrichStructuredData(raw: Record<string, unknown>, entityType: SettingEntityType): Record<string, unknown> {
  // 先映射字段名
  let data = mapFieldNames(raw, entityType)
  // 再剥离元数据
  data = stripMetaKeys(data)

  if (entityType === 'character') {
    // 归一化 category 值，确保与 categoryOptions 对齐
    const CHAR_CATEGORY_MAP: Record<string, string> = {
      '主要盟友': '配角', '盟友': '配角', '友方': '配角',
      '中期boss': '反派', '中期BOSS': '反派', '中期Boss': '反派',
      '最终boss': '反派', '最终BOSS': '反派', '最终Boss': '反派',
      '大反派': '反派', 'boss': '反派', 'BOSS': '反派',
      '龙套': '路人', '群众': '路人', '背景': '路人',
    }
    if (!data.category || data.category === '') {
      data.category = '配角'
    } else {
      const normCat = CHAR_CATEGORY_MAP[data.category] || CHAR_CATEGORY_MAP[data.category.toLowerCase()]
      if (normCat) data.category = normCat
    }
    // 确保数组字段是数组
    for (const f of ['abilities', 'characterTags', 'skills', 'keyItems']) {
      if (!Array.isArray(data[f])) data[f] = typeof data[f] === 'string' ? (data[f] as string).split(/[,，、;；]\s*/).filter(Boolean) : []
    }
    // 确保 relationships 是对象数组
    if (!Array.isArray(data.relationships)) {
      data.relationships = []
    }
  } else if (entityType === 'world_setting') {
    // 归一化 category 值，确保与 categoryOptions 对齐
    const WS_CATEGORY_MAP: Record<string, string> = {
      '时代': '历史', '年代': '历史', '时期': '历史',
    }
    if (!data.category || data.category === '') {
      data.category = '其他'
    } else {
      const normCat = WS_CATEGORY_MAP[data.category] || WS_CATEGORY_MAP[data.category.toLowerCase()]
      if (normCat) data.category = normCat
    }
    if (!Array.isArray(data.rules)) data.rules = typeof data.rules === 'string' ? (data.rules as string).split(/[,，、;；]\s*/).filter(Boolean) : []
    if (!Array.isArray(data.relatedEntities)) data.relatedEntities = typeof data.relatedEntities === 'string' ? (data.relatedEntities as string).split(/[,，、;；]\s*/).filter(Boolean) : []
  } else if (entityType === 'item') {
    if (!Array.isArray(data.properties)) data.properties = typeof data.properties === 'string' ? (data.properties as string).split(/[,，、;；]\s*/).filter(Boolean) : []
    // 确保 destroyed 是布尔值
    if (typeof data.destroyed === 'string') {
      data.destroyed = data.destroyed === 'true' || data.destroyed === '是'
    }
  } else if (entityType === 'foreshadowing') {
    if (!Array.isArray(data.tags)) data.tags = typeof data.tags === 'string' ? (data.tags as string).split(/[,，、;；]\s*/).filter(Boolean) : []
    if (!Array.isArray(data.relatedAnchors)) data.relatedAnchors = typeof data.relatedAnchors === 'string' ? (data.relatedAnchors as string).split(/[,，、;；]\s*/).filter(Boolean) : []
    // 确保 resolved 是布尔值
    if (typeof data.resolved === 'string') {
      data.resolved = data.resolved === 'true' || data.resolved === '是'
    }
  } else if (entityType === 'plot_arc') {
    if (!Array.isArray(data.chapters)) data.chapters = typeof data.chapters === 'string' ? (data.chapters as string).split(/[,，、;；]\s*/).filter(Boolean).map(Number).filter(n => !isNaN(n)) : []
    if (!Array.isArray(data.relatedCharacters)) data.relatedCharacters = typeof data.relatedCharacters === 'string' ? (data.relatedCharacters as string).split(/[,，、;；]\s*/).filter(Boolean) : []
  }
  return data
}

const props = defineProps<{ manager: SettingsManager; isDark?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void; (e: 'toggle-directory'): void; (e: 'ai-update-settings'): void; (e: 'ai-generate-all'): void; (e: 'ai-name'): void; (e: 'smart-import'): void }>()

const repo = useWorkRepo()
const message = useMessage()
const sidebarWidth = ref(220)

function startResize(e: MouseEvent) {
  const startX = e.clientX
  const startW = sidebarWidth.value
  const onMove = (ev: MouseEvent) => { sidebarWidth.value = Math.max(160, Math.min(500, startW + ev.clientX - startX)) }
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const displayTabs: { key: SettingEntityType; label: string; icon: string }[] = [
  { key: 'character', label: '角色', icon: '👥' },
  { key: 'world_setting', label: '设定', icon: '⚙️' },
  { key: 'item', label: '物品', icon: '🎒' },
  { key: 'foreshadowing', label: '伏笔', icon: '✨' },
  { key: 'plot_arc', label: '情节线', icon: '📈' },
]
const currentTab = ref<SettingEntityType>('character')
watch(currentTab, () => { if (multiSelectMode.value) toggleMultiSelect() })
const showSettingsUpdateModal = ref(false)
const showSmartImportModal = ref(false)
const smartImportModalRef = ref<InstanceType<typeof SmartImportModal> | null>(null)
watch(showSmartImportModal, (val) => {
  if (val) nextTick(() => smartImportModalRef.value?.open())
})
const showDeprecated = ref(false)
const selectedId = ref<string | null>(null)
const currentFolder = ref('')
const currentCategory = ref('')
const editMode = ref<'structured' | 'raw'>('structured')
const refreshKey = ref(0)
function notifyChanged() { refreshKey.value++; emit('changed') }

// ── 多选管理 ──
const multiSelectMode = ref(false)
const selectedIds = ref(new Set<string>())

function toggleMultiSelect() {
  multiSelectMode.value = !multiSelectMode.value
  if (!multiSelectMode.value) { selectedIds.value.clear(); selectedId.value = null }
}

function toggleItemSelect(id: string) {
  const s = selectedIds.value
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = new Set(s) // 触发响应式
}

function selectAll() {
  selectedIds.value = new Set(filteredList.value.map(e => e.id))
}

function deselectAll() {
  selectedIds.value = new Set()
}

async function batchSetDeprecated(deprecated: boolean) {
  const ids = [...selectedIds.value]
  if (!ids.length) { message.warning('请先选中条目'); return }
  showConfirm(`确认${deprecated ? '弃用' : '取消弃用'} ${ids.length} 个条目？`, async () => {
  let done = 0
  const errors: string[] = []
  for (const id of ids) {
    try {
      await props.manager.setDeprecated(id, deprecated)
      done++
    } catch (e: any) {
      errors.push(`ID ${id}: ${e?.message || String(e)}`)
    }
  }
  deselectAll()
  notifyChanged()
  if (errors.length) {
    message.warning(`已完成 ${done}/${ids.length}，${errors.length} 个失败：${errors.join('；')}`)
  } else {
    message.success(`已${deprecated ? '弃用' : '取消弃用'} ${done} 个条目`)
  }
  })
}

async function batchDelete() {
  const ids = [...selectedIds.value]
  if (!ids.length) { message.warning('请先选中条目'); return }
  const names = ids.map(id => props.manager.get(id)?.name || id).join('、')
  showConfirm(`确认永久删除以下 ${ids.length} 个条目？\n${names}\n\n此操作不可撤销。`, async () => {
    let done = 0
    const errors: string[] = []
    for (const id of ids) {
      try {
        await props.manager.remove(id)
        done++
      } catch (e: any) {
        errors.push(`ID ${id}: ${e?.message || String(e)}`)
      }
    }
    deselectAll()
    notifyChanged()
    if (errors.length) {
      message.warning(`已删除 ${done}/${ids.length}，${errors.length} 个失败：${errors.join('；')}`)
    } else {
      message.success(`已删除 ${done} 个条目`)
    }
  })
}

function batchExport() {
  const ids = [...selectedIds.value]
  if (!ids.length) { message.warning('请先选中条目'); return }
  const items = ids.map(id => props.manager.get(id)).filter(Boolean)
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'settings_selection.json'; a.click()
  URL.revokeObjectURL(a.href)
  message.success(`已导出 ${items.length} 个条目`)
}

// 根据当前 tab 生成可选分类
const categoryOptions = computed(() => {
  switch (currentTab.value) {
    case 'character': return ['全部', '主角', '配角', '反派', '路人', '特殊']
    case 'world_setting': return ['全部', '地理', '势力', '规则', '历史', '文化', '魔法体系', '其他']
    case 'foreshadowing': return ['全部', '未回收', '已回收']
    default: return ['全部']
  }
})

const folders = computed(() => {
  void refreshKey.value
  const set = new Set<string>()
  for (const e of props.manager.listByTypeWithDeprecated(currentTab.value, true)) {
    const cat = (e.structuredData?.category as string) || ''
    if (cat) set.add(cat)
  }
  return [...set].sort()
})

const filteredList = computed(() => {
  void refreshKey.value
  let items = props.manager.listByTypeWithDeprecated(currentTab.value, showDeprecated.value)
  // 按分类过滤
  if (currentCategory.value && currentCategory.value !== '全部') {
    switch (currentTab.value) {
      case 'character':
        items = items.filter(e => (e.structuredData?.category || '配角') === currentCategory.value)
        break
      case 'world_setting':
        items = items.filter(e => (e.structuredData?.category || '其他') === currentCategory.value)
        break
      case 'foreshadowing':
        if (currentCategory.value === '已回收') items = items.filter(e => e.structuredData?.resolved)
        else if (currentCategory.value === '未回收') items = items.filter(e => !e.structuredData?.resolved)
        break
    }
  }
  return items
})

const selectedItem = computed(() => (void refreshKey.value, selectedId.value ? props.manager.get(selectedId.value) ?? null : null))

// Edit state
const editName = ref('')
const editSummary = ref('')
const editData = ref<Record<string, any>>({})

watch(selectedItem, (item) => {
  if (!item) { editName.value = ''; editSummary.value = ''; editData.value = {}; return }
  editName.value = item.name
  editSummary.value = item.summary
  editData.value = { ...item.structuredData }
})

function selectItem(item: SettingEntity) { selectedId.value = item.id }

async function startAdd() {
  const entity = await props.manager.add({ type: currentTab.value, name: '未命名' + displayTabs.find(t => t.key === currentTab.value)?.label || '', chapterNo: 1, summary: '', structuredData: defaultDataForType(currentTab.value), source: 'manual' })
  notifyChanged(); selectedId.value = entity.id
}

async function saveCurrent() {
  if (!selectedId.value) return
  const name = editName.value.trim()
  // 允许空字符串（用户可能故意清空字段），仅在真正无值时保留原名称
  await props.manager.update(selectedId.value, {
    name: name !== '' ? name : (selectedItem.value?.name ?? '(未命名)'),
    summary: editSummary.value,
  })
  notifyChanged()
}

// 模板事件处理器（await saveCurrent 防止 fire-and-forget）
async function handleNameChange(value: string) {
  editName.value = value
  await saveCurrent()
}
async function handleSummaryChange(value: string) {
  editSummary.value = value
  await saveCurrent()
}

function formatRelationships(val: unknown): string {
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return val.map((r: any) => `${r.name || '?'}(${r.relation || ''})`).join('、')
  return String(val || '')
}

function parseRelationships(text: string): Array<{ name: string; relation: string }> {
  return text.split(/[,，、;；\n]/).filter(Boolean).map(s => {
    const m = s.trim().match(/^(.+?)[（(](.+?)[）)]$/)
    return m ? { name: m[1].trim(), relation: m[2].trim() } : { name: s.trim(), relation: '' }
  }).filter(r => r.name)
}

async function updateField(key: string, value: any) {
  if (!selectedId.value) return
  editData.value[key] = value
  await props.manager.update(selectedId.value, { structuredData: { ...editData.value } })
  notifyChanged()
}

async function toggleDeprecated() {
  if (!selectedId.value || !selectedItem.value) return
  await props.manager.setDeprecated(selectedId.value, !selectedItem.value.deprecated)
  notifyChanged()
}

async function confirmDelete() {
  if (!selectedId.value) return
  showConfirm('确认删除「' + (selectedItem.value?.name || '') + '」？', async () => {
  await props.manager.remove(selectedId.value!); notifyChanged(); selectedId.value = null
  })
}

function addFolder() {
  const name = window.prompt?.('文件夹名')
  if (name) currentFolder.value = name
}

// AI modal
const aiModal = reactive({ visible: false, title: '', desc: '', target: '', write: '', field: '', mode: 'default' as string, showGenCount: false, showNoteCount: false, templateName: '', templateDesc: '', defaultExtraPrompt: '', specialFields: [] as any[], contextSwitches: [] as any[] })

// AI 取名选择器
const showNamePicker = ref(false)
const nameOptions = ref<string[]>([])
const nameAiValue = ref('')

/** 从 AI 命名输出中提取可选条目 */
function parseNameOptions(text: string): string[] {
  const options: string[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    // 编号条目：1. xxx / 1) xxx / 1、xxx
    let m = t.match(/^\d+[\.\)、]\s*(.+)/)
    if (m) { options.push(m[1]); continue }
    // 项目符号：- xxx / • xxx
    m = t.match(/^[-•]\s*(.+)/)
    if (m) { options.push(m[1]); continue }
    // 粗体：**xxx**
    m = t.match(/^\*\*(.+?)\*\*/)
    if (m) { options.push(m[1]); continue }
    // 方括号：【xxx】
    m = t.match(/^【(.+?)】/)
    if (m) { options.push(m[1]); continue }
  }
  return options
}

async function selectNameOption(name: string) {
  editName.value = name; await saveCurrent()
  showNamePicker.value = false; nameOptions.value = []
  aiModal.visible = false
  message.success('名称已写入')
}

function cancelNamePicker() {
  showNamePicker.value = false; nameOptions.value = []
  aiModal.visible = false
}

function triggerAi(action: string) {
  const cfg: Record<string, any> = {
    'ai-update-settings': { title: '设定更新', desc: '从已写章节正文中增量提取角色/世界观/物品等设定数据，更新到当前设定面板。', target: '更新设定', write: '执行', action: 'runStateKeeper' },
    'ai-generate-all': { title: 'AI 批量生成设定', desc: '基于作品基础信息与核心构架，批量生成世界观、角色、伏笔、地点、道具、事件等设定条目。', target: '写入设定数据', write: '✓ 写入设定数据', templateKey: 'sp_genAll', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'settings', label:'当前设定数据', desc:'已创建的设定条目列表', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }], specialFields: [{ key:'worldCount', label:'世界观数量 *', type:'number', defaultValue:3 },{ key:'charCount', label:'角色数量 *', type:'number', defaultValue:3 },{ key:'foreshadowCount', label:'伏笔数量 *', type:'number', defaultValue:2 },{ key:'locationCount', label:'地点数量 *', type:'number', defaultValue:2 },{ key:'itemCount', label:'道具数量 *', type:'number', defaultValue:2 },{ key:'eventCount', label:'事件数量 *', type:'number', defaultValue:1 }] },
    'ai-name': { title: 'AI 命名方案', desc: '为当前选中的设定条目（角色/地点/物品等）生成多套命名方案，每套附音韵美感与文化内涵说明。', target: '写入笔记', write: '✓ 写入笔记', mode: 'noteTarget', templateKey: 'sp_name', defaultExtraPrompt: '请基于当前选中的设定条目和作品题材，生成命名方案。', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'settings', label:'当前设定数据', desc:'已创建的设定条目列表', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
    'smart-import': { title: '智能导入设定', desc: '粘贴外部文本（角色卡、世界观说明、大纲等），AI 自动解析并分类写入设定面板。', target: '解析并导入', write: '✓ 导入', templateKey: 'sp_import', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
  }
  const c = cfg[action]
  if (!c) { emit(action as any); return }
  if (c.action === 'runStateKeeper') {
    showSettingsUpdateModal.value = true
    return
  }
  const tpl = c.templateKey ? getTemplate(c.templateKey as any) : null
  aiModal.visible = true; aiModal.field = action
  aiModal.title = c.title; aiModal.desc = c.desc; aiModal.target = c.target; aiModal.write = c.write
  aiModal.mode = c.mode || 'default'; aiModal.showGenCount = c.showGenCount || false; aiModal.showNoteCount = c.showNoteCount || false
  aiModal.templateName = tpl?.name || c.templateName || ''; aiModal.templateDesc = tpl?.desc || c.templateDesc || ''
  aiModal.defaultExtraPrompt = c.defaultExtraPrompt || ''
  aiModal.contextSwitches = (c.contextSwitches || []).map((cs: any) => ({...cs}))
  aiModal.specialFields = (c.specialFields || []).map((f: any) => ({...f}))
}

async function onAiWrite(value: string) {
  const field = aiModal.field
  try {
    if (field === 'ai-name' && selectedId.value) {
      // 解析 AI 输出为可选条目，弹出选择器
      const options = parseNameOptions(value)
      if (options.length > 0) {
        nameOptions.value = options
        nameAiValue.value = value
        showNamePicker.value = true
        return  // 不关闭 AiModal，等用户选择
      }
      // 解析失败时兜底：取第一行
      editName.value = value.split('\n')[0]?.trim() || value; await saveCurrent()
    } else if (field === 'ai-generate-all') {
      // H5: 批量创建设定条目
      // [DEBUG] 打印 AI 原始返回，方便排查 JSON 解析失败
      console.log('[SettingsPanel] onAiWrite field=ai-generate-all')
      console.log('[SettingsPanel] raw value 长度:', value.length, '前200字符:', value.slice(0, 200))
      const json = extractJson(value)
      console.log('[SettingsPanel] extractJson 结果长度:', json.length, '前200字符:', json.slice(0, 200))
      const parsed = JSON.parse(json)
      console.log('[SettingsPanel] JSON.parse 结果类型:', Array.isArray(parsed) ? 'array' : typeof parsed,
        Array.isArray(parsed) ? `长度=${parsed.length}` : `keys=${Object.keys(parsed).join(',')}`)
      // 兼容多种 AI 输出格式：纯数组、{entities:[...]}、{characters/items/...}
      let items: any[] = []
      if (Array.isArray(parsed)) {
        items = parsed
      } else if (parsed && typeof parsed === 'object') {
        items = parsed.entities || parsed.characters || parsed.settings || []
        console.log('[SettingsPanel] 主路径 items 长度:', items.length)
        // 如果 AI 返回了分类对象（如 {characters:[], worldSettings:[]}），合并所有分类
        if (items.length === 0) {
          for (const v of Object.values(parsed)) {
            if (Array.isArray(v)) items.push(...v)
          }
          console.log('[SettingsPanel] Object.values 合并后 items 长度:', items.length)
        }
      }
      if (items.length === 0) {
        console.warn('[SettingsPanel] items 为空！parsed 内容:', JSON.stringify(parsed).slice(0, 500))
        message.warning('AI 未返回有效的设定条目，请检查生成的 JSON 格式')
        aiModal.visible = false
        return
      }
      let written = 0
      const writeErrors: string[] = []
      const typeCount: Record<string, number> = {}
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        try {
          const entityType = normalizeEntityType(item.type || 'world_setting')
          const rawData = (item.data || item.structuredData || item) as Record<string, unknown>
          await props.manager.add({
            type: entityType,
            name: item.name || item.title || '新条目',
            structuredData: enrichStructuredData(rawData, entityType),
            summary: item.desc || item.summary || item.description || '',
          })
          typeCount[entityType] = (typeCount[entityType] || 0) + 1
          written++
        } catch (e: any) {
          writeErrors.push(`${item.name || item.title || '?'}: ${e?.message || String(e)}`)
        }
      }
      notifyChanged()
      // 自动切换到第一个有数据的分页（当前分页无数据时）
      const typeOrder = ['character', 'world_setting', 'foreshadowing', 'plot_arc', 'item']
      const firstPopulatedTab = typeOrder.find(t => typeCount[t] && typeCount[t] > 0)
      if (firstPopulatedTab && (!typeCount[currentTab.value] || typeCount[currentTab.value] === 0)) {
        currentTab.value = firstPopulatedTab as SettingEntityType
      }
      // 构建类型统计提示
      const typeLabels: Record<string, string> = {
        character: '角色', world_setting: '设定', item: '物品',
        foreshadowing: '伏笔', plot_arc: '情节线',
      }
      const parts = Object.entries(typeCount).map(([t, n]) => `${typeLabels[t] || t} ${n}`)
      const tabHint = (currentTab.value as string) !== 'core'
        ? `，已切换到「${displayTabs.find(t => t.key === currentTab.value)?.label || currentTab.value}」分页`
        : ''
      if (writeErrors.length) {
        const errSummary = writeErrors.length <= 3 ? writeErrors.join('；') : `${writeErrors.slice(0, 3).join('；')}...等${writeErrors.length}个`
        message.warning(`已写入 ${written} 条设定数据（${parts.join('、')}）${tabHint}，${writeErrors.length} 条失败：${errSummary}`)
      } else {
        message.success(`已写入 ${written} 条设定数据（${parts.join('、')}）${tabHint}`)
      }
    } else if (field === 'ai-update-settings') {
      // H5: 走 extractSettingsDiff 写回设定
      const { extractSettingsDiff } = await import('../agents/steps/extractSettings')
      const chars = props.manager.listByType('character')
      const diffs = await extractSettingsDiff(
        [{ chapterNo: 1, title: '', content: value }],
        chars.map((c: any) => c.name),
        chars.map((c: any) => ({ id: c.id, name: c.name, nickname: c.nickname, structuredData: c.structuredData })),
      )
      for (const d of diffs) {
        const patch: Record<string, unknown> = {}
        for (const f of d.fields) {
          if (f.changed) patch[f.field] = f.newValue
        }
        if (Object.keys(patch).length > 0) {
          await props.manager.update(d.entityId, { structuredData: patch })
        }
      }
      notifyChanged()
    } else if (field === 'smart-import') {
      // H5: 解析 JSON 写 manager
      const json = extractJson(value)
      const parsed = JSON.parse(json)
      const items = Array.isArray(parsed) ? parsed : (parsed.entities || [parsed])
      let smartImported = 0
      const smartErrors: string[] = []
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        try {
          const entityType = normalizeEntityType(item.type || 'character')
          const rawData = (item.data || item.structuredData || item) as Record<string, unknown>
          await props.manager.add({
            type: entityType,
            name: item.name || '导入条目',
            structuredData: enrichStructuredData(rawData, entityType),
            summary: item.desc || item.summary || '',
          } as any)
          smartImported++
        } catch (e: any) {
          smartErrors.push(`${item.name || '?'}: ${e?.message || String(e)}`)
        }
      }
      notifyChanged()
      if (smartErrors.length) {
        message.warning(`已导入 ${smartImported} 条，${smartErrors.length} 条失败：${smartErrors.slice(0, 3).join('；')}`)
      } else {
        message.success(`已导入 ${smartImported} 条设定数据`)
      }
    }
    if (field !== 'ai-generate-all' && field !== 'smart-import') {
      message.success('AI 内容已应用')
    }
  } catch (e: any) {
    const errMsg = e instanceof SyntaxError ? 'JSON 格式错误，AI 未返回有效 JSON' : (e?.message || String(e))
    message.error('AI 内容解析失败：' + errMsg)
  }
  aiModal.visible = false
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        const items = Array.isArray(raw) ? raw : (raw.entities || [])
        if (!items.length) { message.warning('文件中无可导入的设定数据'); return }
        showConfirm(`将导入 ${items.length} 条设定条目，可能覆盖同名条目。是否继续？`, async () => {
        let imported = 0
        const importErrors: string[] = []
        for (const item of items) {
          if (!item.name) continue
          try {
            const entityType = normalizeEntityType(item.type || 'world_setting')
            const existing = props.manager.listByType(entityType).find((e: any) => e.name === item.name)
            if (existing) {
              await props.manager.update(existing.id, {
                name: item.name,
                summary: item.summary || existing.summary,
                structuredData: item.structuredData || existing.structuredData,
              })
            } else {
              await props.manager.add({
                type: entityType,
                name: item.name,
                summary: item.summary || '',
                structuredData: item.structuredData || {},
                chapterNo: item.chapterNo || 1,
              })
            }
            imported++
          } catch (e: any) {
            importErrors.push(`${item.name}: ${e?.message || String(e)}`)
          }
        }
        notifyChanged()
        if (importErrors.length) {
          message.warning(`已导入 ${imported} 条设定，${importErrors.length} 条失败：${importErrors.slice(0, 3).join('；')}${importErrors.length > 3 ? `...等${importErrors.length}个` : ''}`)
        } else {
          message.success(`已导入 ${imported} 条设定`)
        }
        })
      } catch { message.error('JSON 格式无效') }
    }
    reader.readAsText(file)
  }
  input.click()
}

function handleExport() {
  const data = props.manager.listAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'settings.json'; a.click()
  URL.revokeObjectURL(a.href)
}

// ── State Keeper 自动提取 ──

async function onSettingsRollback(targetVersion: number) {
  const allTypes = ['character', 'world_setting', 'foreshadowing', 'item', 'plot_arc'] as const
  let rolled = 0
  for (const type of allTypes) {
    for (const entity of props.manager.listByType(type)) {
      const verMgr = new StateKeeperVersionManager(entity.id)
      const snapshot = verMgr.rollback(targetVersion)
      if (snapshot) {
        const patch: Record<string, any> = {}
        for (const [k, v] of Object.entries(snapshot)) {
          if (v !== undefined && v !== null && k !== 'name') patch[k] = v
        }
        if (Object.keys(patch).length) {
          await props.manager.update(entity.id, { structuredData: { ...entity.structuredData, ...patch, _lastExtraction: new Date().toISOString() } })
          rolled++
        }
      }
    }
  }
  notifyChanged()
  message.success(`回滚完成：${rolled} 个条目已恢复到 v${targetVersion} 状态`)
}

defineExpose({ triggerAi })
</script>

<style scoped>
.sp-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.sp-topbar { display: flex; align-items: center; justify-content: space-between; padding: 6px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.sp-breadcrumb { font-size: 11px; opacity: 0.45; }
.sp-breadcrumb.active { opacity: 0.75; font-weight: 500; }
.sp-breadcrumb-sep { margin: 0 6px; opacity: 0.25; }
.sp-topbar-right { display: flex; gap: 4px; }
.sp-icon-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: none; border-radius: 4px; background: transparent; cursor: pointer; color: var(--btn-color); }
.sp-icon-btn:hover { background: var(--btn-hover-bg); }

.sp-ai-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; background: rgba(128,128,128,0.02); }
.sp-ai-bar-left { display: flex; gap: 6px; align-items: center; }
.sp-ai-bar-right { display: flex; gap: 4px; }
.sp-ai-btn { padding: 3px 10px; font-size: 11px; font-family: inherit; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
.sp-ai-btn.primary { background: #2ea86a; color: #fff; }
.sp-ai-btn.primary:hover { background: #258d58; }
.sp-ai-btn.accent { background: #2ea86a; color: #fff; }
.sp-ai-btn.accent:hover { background: #258d58; }
.sp-ai-btn.ghost { background: transparent; color: inherit; opacity: 0.5; }
.sp-text-btn { background: rgba(200,160,80,0.1); border: 1px solid rgba(200,160,80,0.3); border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer; font-family: inherit; color: #d4a040; }

.sp-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* Sidebar */
.sp-sidebar { flex-shrink: 0; border-right: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden; }
.sp-resizer { width: 4px; cursor: col-resize; flex-shrink: 0; background: transparent; transition: background 0.2s; }
.sp-resizer:hover { background: rgba(128,128,128,0.2); }
.sp-sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; font-size: 12px; font-weight: 600; opacity: 0.5; border-bottom: 1px solid var(--border-color); }
.sp-sidebar-header-r { display: flex; align-items: center; gap: 4px; }
.sp-toggle-label { font-size: 9px; opacity: 0.5; cursor: pointer; display: flex; align-items: center; gap: 2px; }
.sp-side-btn { padding: 1px 5px; border: none; border-radius: 3px; background: transparent; color: inherit; cursor: pointer; font-size: 9px; font-family: inherit; opacity: 0.4; }
.sp-side-btn.active { background: rgba(46,168,106,0.15); color: #2ea86a; opacity: 1; }

.sp-tabs { display: flex; gap: 2px; padding: 4px 6px; border-bottom: 1px solid var(--border-color); }
.sp-tab { flex: 1; padding: 4px 6px; border: none; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; opacity: 0.5; text-align: center; }
.sp-tab.active { opacity: 1; background: rgba(46,168,106,0.15); color: #2ea86a; font-weight: 600; }

.sp-folder-bar { display: flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 10px; border-bottom: 1px solid var(--border-color); }
.sp-folder-bar span { opacity: 0.5; }
.sp-folder-btn { padding: 1px 6px; border: 1px solid var(--border-color); border-radius: 3px; background: transparent; color: inherit; cursor: pointer; font-size: 10px; font-family: inherit; opacity: 0.4; }
.sp-folder-btn.active { background: rgba(128,128,128,0.08); }
.sp-folder-empty { padding: 8px; font-size: 10px; opacity: 0.25; text-align: center; }

.sp-list { flex: 1; overflow-y: auto; padding: 2px 4px; }
.sp-list-item { padding: 5px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px; }
.sp-list-item:hover { background: rgba(128,128,128,0.06); }
.sp-list-item.selected { background: rgba(46,168,106,0.12); }
.sp-list-item.deprecated { opacity: 0.4; }
.sp-list-item.multi.checked { background: rgba(46,168,106,0.08); }
.sp-list-name { font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-list-meta { font-size: 9px; opacity: 0.35; flex-shrink: 0; }
.sp-checkbox { width: 14px; height: 14px; accent-color: #2ea86a; cursor: pointer; flex-shrink: 0; margin: 0; }
.sp-list-empty { text-align: center; padding: 20px 0; font-size: 11px; opacity: 0.25; }

/* 批量操作栏 */
.sp-bulk-bar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); background: rgba(46,168,106,0.04); flex-shrink: 0; }
.sp-bulk-count { font-size: 10px; opacity: 0.6; margin-right: 4px; white-space: nowrap; }
.sp-bulk-btn { padding: 2px 8px; border: 1px solid var(--border-color); border-radius: 3px; background: transparent; color: inherit; cursor: pointer; font-size: 10px; font-family: inherit; opacity: 0.6; white-space: nowrap; }
.sp-bulk-btn:hover { opacity: 1; background: rgba(128,128,128,0.06); }
.sp-bulk-btn.danger { color: #e06060; border-color: rgba(224,96,96,0.3); }
.sp-bulk-btn.danger:hover { background: rgba(224,96,96,0.06); }

.sp-sidebar-footer { display: flex; gap: 6px; padding: 6px 8px; border-top: 1px solid var(--border-color); }
.sp-add-btn { flex: 1; padding: 5px; border: 1px solid rgba(46,168,106,0.3); border-radius: 4px; background: rgba(46,168,106,0.08); color: #2ea86a; cursor: pointer; font-size: 12px; font-family: inherit; }
.sp-depr-btn { padding: 5px 10px; border: 1px solid rgba(224,96,96,0.3); border-radius: 4px; background: transparent; color: #e06060; cursor: pointer; font-size: 11px; font-family: inherit; }

/* Detail */
.sp-detail { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.sp-detail-empty { flex: 1; display: flex; align-items: center; justify-content: center; opacity: 0.25; font-size: 14px; }
.sp-detail-scroll { flex: 1; overflow-y: auto; padding: 12px 20px; display: flex; flex-direction: column; gap: 10px; }
.sp-detail-header { display: flex; align-items: center; gap: 8px; }
.sp-name-input { flex: 1; background: transparent; border: none; outline: none; font-size: 18px; font-weight: 700; font-family: inherit; color: inherit; }
.sp-detail-header-r { display: flex; gap: 4px; }
.sp-action-btn { padding: 3px 10px; border: 1px solid var(--border-color); border-radius: 4px; background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; opacity: 0.5; }
.sp-action-btn.primary { border-color: rgba(46,168,106,0.3); color: #2ea86a; background: rgba(46,168,106,0.06); }

.sp-detail-row { display: flex; align-items: center; gap: 8px; }
.sp-row-label { font-size: 11px; opacity: 0.4; }
.sp-row-val { font-size: 12px; }

.sp-format-bar { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid var(--border-color); font-size: 11px; }
.sp-format-bar span { opacity: 0.4; }
.sp-fmt-tab { padding: 2px 10px; border: none; border-radius: 10px; background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; opacity: 0.4; }
.sp-fmt-tab.active { background: rgba(128,128,128,0.1); opacity: 1; }
.sp-fmt-copy { margin-left: auto; background: transparent; border: none; color: inherit; cursor: pointer; font-size: 14px; opacity: 0.3; }

.sp-section { border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 2px; }
.sp-section-header { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.sp-section-note { font-size: 10px; font-weight: 400; opacity: 0.3; }

.sp-field { margin-bottom: 8px; }
.sp-field label { display: block; font-size: 10px; opacity: 0.4; margin-bottom: 2px; }
.sp-input { width: 100%; padding: 5px 8px; font-size: 12px; font-family: inherit; background: rgba(128,128,128,0.04); border: 1px solid transparent; border-radius: 4px; color: inherit; outline: none; }
.sp-input:focus { border-color: rgba(46,168,106,0.4); }
.sp-input.sm { width: auto; min-width: 80px; }
.sp-textarea { width: 100%; padding: 5px 8px; font-size: 12px; font-family: inherit; background: rgba(128,128,128,0.04); border: 1px solid transparent; border-radius: 4px; color: inherit; outline: none; resize: vertical; }
.sp-textarea:focus { border-color: rgba(46,168,106,0.4); }
.sp-none { font-size: 11px; opacity: 0.2; }

.sp-delete-btn { align-self: flex-start; padding: 5px 12px; border: 1px solid rgba(224,96,96,0.2); border-radius: 4px; background: transparent; color: #e06060; cursor: pointer; font-size: 11px; font-family: inherit; }
.sp-delete-btn:hover { background: rgba(224,96,96,0.06); }

.sp-toggle-btn { padding: 4px 12px; border: 1px solid rgba(128,128,128,0.2); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; }
.sp-toggle-btn.on { background: rgba(46,168,106,0.1); color: #2ea86a; border-color: rgba(46,168,106,0.3); }

:global(html .theme-light .sp-input),
:global(html .theme-light .sp-textarea),
:global(html .theme-light .sp-name-input) {
  background: white;
  border-color: white;
}

/* AI 取名选择面板 */
.sp-name-picker-overlay { position: fixed; inset: 0; z-index: 11000; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
.sp-name-picker { width: 400px; max-height: 70vh; background: #1e2a4a; border: 1px solid rgba(128,128,128,0.2); border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; overflow: hidden; }
.sp-np-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid rgba(128,128,128,0.15); font-size: 14px; font-weight: 600; flex-shrink: 0; }
.sp-np-close { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 18px; opacity: 0.4; padding: 0 4px; }
.sp-np-close:hover { opacity: 0.8; }
.sp-np-list { padding: 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.sp-np-option { padding: 10px 14px; border: 1px solid rgba(128,128,128,0.1); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 13px; font-family: inherit; text-align: left; transition: all 0.15s; }
.sp-np-option:hover { border-color: rgba(46,168,106,0.4); background: rgba(46,168,106,0.06); }
.sp-np-empty { padding: 20px; text-align: center; font-size: 12px; opacity: 0.4; }
</style>
