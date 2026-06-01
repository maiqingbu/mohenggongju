<template>
  <div class="app-layout" :class="{ 'theme-dark': isDark, 'theme-light': !isDark }">
    <!-- 顶部工具栏 -->
    <header class="top-bar">
      <div class="top-bar-left">
        <span class="top-bar-sep" style="visibility:hidden"></span>
        <span class="app-title">墨衡</span>
      </div>
      <div class="top-bar-center">
        <template v-for="btn in topBarButtons" :key="btn.key">
          <button
            class="toolbar-text-btn"
            :class="{ active: activePanel === btn.key }"
            @click="activePanel = btn.key"
          >{{ btn.label }}</button>
        </template>
      </div>
      <div class="top-bar-right">
        <span class="top-bar-model">{{ modelStore.getEnabledProviders()[0]?.name || '未配置模型' }}</span>
        <button class="toolbar-btn" title="创作向导" @click="inspireRef?.open()"><n-icon size="17"><BulbOutline /></n-icon></button>
        <button class="toolbar-btn" title="导入备份" @click="importDatabase">📥</button>
        <button class="toolbar-btn" title="导出备份" @click="exportDatabase">📤</button>
        <button class="toolbar-btn" title="设置" @click="showSettings = true"><n-icon size="17"><SettingsOutline /></n-icon></button>
        <button class="toolbar-btn" :title="isDark ? '浅色模式' : '深色模式'" @click="isDark = !isDark">
          <n-icon size="17"><SunnyOutline v-if="isDark" /><MoonOutline v-else /></n-icon>
        </button>
      </div>
    </header>

    <!-- 主体三栏 -->
    <main class="main-area">
      <!-- 左栏：作品目录 -->
      <aside class="left-panel" :class="{ collapsed: leftCollapsed }" :style="leftCollapsed ? {} : { width: leftWidth + 'px' }">
        <div class="panel-header">
          <span class="panel-header-title">作品目录</span>
          <button class="panel-collapse-btn" @click="leftCollapsed = !leftCollapsed" :title="leftCollapsed ? '展开' : '折叠'">
            <n-icon size="14"><ChevronBackOutline v-if="!leftCollapsed" /><ChevronForwardOutline v-else /></n-icon>
          </button>
        </div>
        <div class="panel-scroll" v-show="!leftCollapsed">
          <WorkTree @chapter-select="onChapterSelect" />
        </div>
      </aside>

      <!-- 左栏拖拽调整器 -->
      <div v-show="!leftCollapsed" class="resizer" @mousedown="startLeftResize"></div>

      <!-- 折叠后的展开条 -->
      <div v-if="leftCollapsed" class="collapsed-strip" @click="leftCollapsed = false" title="展开作品目录">
        <n-icon size="12"><ChevronForwardOutline /></n-icon>
      </div>

      <!-- 右栏主体：面板内容 + Agent 工作台 -->
      <section class="right-main">
        <!-- 面板内容区 -->
        <div class="panel-content">
          <!-- 作品内容面板 -->
          <ChapterEditor
            ref="chapterEditorRef"
            v-if="activePanel === 'content'"
            :is-dark="isDark"
            :platform-id="selectedPlatform"
            :settings-mgr="settingsMgr"
            :settings-version="settingsVersion"
            @open-inspire-modal="inspireRef?.open()"
            @publish="onPublish"
          />

          <!-- 作品设定面板 -->
          <WorkspaceSettings ref="wsSettingsRef" v-else-if="activePanel === 'workspace_config'" :is-dark="isDark" />

          <!-- 信息设定面板 -->
          <SettingsPanel ref="settingsPanelRef" v-else-if="activePanel === 'settings'" :manager="settingsMgr" :is-dark="isDark" @changed="onSettingsChanged" />

          <!-- 大纲设定面板 -->
          <OutlinePanel ref="outlinePanelRef" v-else-if="activePanel === 'outline_config'" :is-dark="isDark" />

          <!-- 写作笔记面板 -->
          <NotesPanel v-else-if="activePanel === 'notes'" :is-dark="isDark" />
        </div>

        <!-- Agent 工作台拖拽调整器 -->
        <div v-show="agentOpen" class="resizer" @mousedown="startAgentResize"></div>

        <!-- Agent 工作台 -->
        <aside class="agent-sidebar" :class="{ open: agentOpen }" :style="agentOpen ? { width: agentWidth + 'px' } : {}">
          <template v-if="agentOpen">
            <div class="panel-header">
              <span class="panel-header-title">Agent</span>
              <button class="panel-collapse-btn" @click="agentOpen = false" title="收起">
                <n-icon size="14"><ChevronForwardOutline /></n-icon>
              </button>
            </div>
            <div class="panel-scroll agent-panel-scroll">
              <AgentPanel ref="agentPanelRef" :is-dark="isDark" :settings-mgr="settingsMgr" @navigate="onAgentNavigate" @settings-updated="onSettingsUpdated" />
            </div>
          </template>
        </aside>

        <!-- Agent 悬浮按钮（收起时显示） -->
        <button
          v-show="!agentOpen"
          class="agent-float-btn"
          :style="{ top: floatY + 'px', right: floatX + 'px' }"
          @mousedown="startFloatDrag"
          @click="agentOpen = true"
          title="展开 Agent 工作台"
        >
          <n-icon size="18"><DesktopOutline /></n-icon>
        </button>
      </section>
    </main>

    <!-- 设置弹窗 -->
    <ModelSettings v-if="showSettings" :is-dark="isDark" @close="showSettings = false" @settings-changed="onEditorSettingsChanged" />
    <InspireModal ref="inspireRef" :is-dark="isDark"
      @open-wizard="(p) => { inspireWizardRef?.open(p) }"
      @open-smart-import="smartImportRef?.open()" />
    <InspireWizard ref="inspireWizardRef" :is-dark="isDark" @open-settings="showSettings = true" />
    <SmartImportModal ref="smartImportRef" :manager="settingsMgr" :is-dark="isDark" />

    <!-- 底部状态栏 -->
    <footer class="status-bar">
      <span class="status-item">创作数据 自动保存</span>
      <span class="status-item" style="opacity:0.4">{{ selectedPlatform ? platformInfo?.name : '未选择平台' }}</span>
      <span style="flex:1"></span>
    </footer>
  </div>

  <!-- 全局确认弹窗（替代 window.confirm） -->
  <Teleport to="body">
    <div v-if="confirmState.visible" class="g-confirm-overlay" @click.self="onConfirmCancel()">
      <div class="g-confirm-dialog">
        <p class="g-confirm-msg">{{ confirmState.message }}</p>
        <div class="g-confirm-btns">
          <button class="g-confirm-btn cancel" @click="onConfirmCancel()">{{ confirmState.cancelText }}</button>
          <button class="g-confirm-btn ok" @click="onConfirmOk()">{{ confirmState.okText }}</button>
        </div>
      </div>
    </div>
  </Teleport>

</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { NSelect, NButton, NIcon, NTag, NRadioGroup, NRadioButton, useMessage } from 'naive-ui'
import { SunnyOutline, MoonOutline, SettingsOutline, ChevronBackOutline, ChevronForwardOutline, BulbOutline, DesktopOutline } from '@vicons/ionicons5'
import { getAllPlatforms, getPlatform, getGenreScore } from './composables/usePlatformData'
import { useModelStore } from './stores/modelStore'
import { getPlatformUrl } from './composables/usePlatformOutput'
import ModelSettings from './components/ModelSettings.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import WorkTree from './components/WorkTree.vue'
import WorkspaceSettings from './components/WorkspaceSettings.vue'
import ChapterEditor from './components/ChapterEditor.vue'
import OutlinePanel from './components/OutlinePanel.vue'
import NotesPanel from './components/NotesPanel.vue'
import AgentPanel from './components/AgentPanel.vue'
import InspireModal from './components/InspireModal.vue'
import InspireWizard from './components/InspireWizard.vue'
import SmartImportModal from './components/SmartImportModal.vue'
import { SettingsManager } from './composables/useSettings'
import { useWorkRepo } from './composables/useWorkRepo'
import { showConfirm, confirmState, onConfirmOk, onConfirmCancel } from './composables/useConfirm'
import { useEditorSettings } from './composables/useEditorSettings'

const message = useMessage()

// ── 主题 ──
import { useAppTheme } from './composables/useTheme'
const { isDark } = useAppTheme()

// ── 编辑器设置（CSS 变量自动注入）──
const editorSettings = useEditorSettings()

// ── 左栏（作品目录）折叠 ──
const leftCollapsed = ref(false)
const leftWidth = ref(280)

// 拖拽清理：组件卸载时自动释放所有 window 监听
let _activeDragCleanup: (() => void) | null = null
onUnmounted(() => { _activeDragCleanup?.() })

function startLeftResize(e: MouseEvent) {
  _activeDragCleanup?.()
  const startX = e.clientX
  const startW = leftWidth.value
  const onMove = (ev: MouseEvent) => { leftWidth.value = Math.max(200, Math.min(400, startW + ev.clientX - startX)) }
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); _activeDragCleanup = null }
  _activeDragCleanup = onUp
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── Agent 工作台 ──
const agentOpen = ref(localStorage.getItem('novelstudio.agentOpen') !== '0')
const agentWidth = ref(Math.max(320, Number(localStorage.getItem('novelstudio.agentWidth')) || 380))
watch(agentOpen, (v) => localStorage.setItem('novelstudio.agentOpen', v ? '1' : '0'))
watch(agentWidth, (w) => localStorage.setItem('novelstudio.agentWidth', String(w)))

function startAgentResize(e: MouseEvent) {
  _activeDragCleanup?.()
  const startX = e.clientX
  const startW = agentWidth.value
  const onMove = (ev: MouseEvent) => { agentWidth.value = Math.max(240, Math.min(450, startW - (ev.clientX - startX))) }
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); _activeDragCleanup = null }
  _activeDragCleanup = onUp
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// Agent 悬浮按钮拖拽
const floatX = ref(16)
const floatY = ref(120)
let floatDragStart = { x: 0, y: 0, bx: 0, by: 0 }

function startFloatDrag(e: MouseEvent) {
  e.preventDefault()
  _activeDragCleanup?.()
  floatDragStart = { x: e.clientX, y: e.clientY, bx: floatX.value, by: floatY.value }
  const onMove = (ev: MouseEvent) => {
    floatX.value = Math.max(0, Math.min(200, floatDragStart.bx - (ev.clientX - floatDragStart.x)))
    floatY.value = Math.max(60, Math.min(600, floatDragStart.by + (ev.clientY - floatDragStart.y)))
  }
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); _activeDragCleanup = null }
  _activeDragCleanup = onUp
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── 平台选择 ──
const selectedPlatform = ref<string | null>(null)
const platforms = getAllPlatforms()
const platformOptions = platforms.map(p => ({ label: `${p.name} (⭐${p.rating})`, value: p.id }))
const platformInfo = computed(() => selectedPlatform.value ? getPlatform(selectedPlatform.value) : null)
const modelStore = useModelStore()

function onPublish() {
  if (!selectedPlatform.value) { message.warning('请先在短篇生成中选择平台'); return }
  const url = getPlatformUrl(selectedPlatform.value)
  if (!url) { message.warning('该平台暂无投稿 URL'); return }
  window.open(url, '_blank')
}

// ── 右栏面板切换 ──
type PanelKey = 'workspace_config' | 'content' | 'settings' | 'outline_config' | 'notes'
const activePanel = ref<PanelKey>('content')
const topBarButtons: { key: PanelKey; label: string }[] = [
  { key: 'workspace_config', label: '作品设定' },
  { key: 'content', label: '作品内容' },
  { key: 'settings', label: '信息设定' },
  { key: 'outline_config', label: '大纲设定' },
  { key: 'notes', label: '写作笔记' },
]
const activePanelLabel = computed(() => topBarButtons.find(b => b.key === activePanel.value)?.label || '')
const repo = useWorkRepo()
const settingsMgr = new SettingsManager()
const settingsVersion = ref(0)

// 当前作品切换时自动加载设定
watch(() => repo.currentWorkId.value, async (workId) => {
  if (workId) { try { await settingsMgr.load(workId); settingsVersion.value++ } catch {} }
}, { immediate: true })

// 启动初始化：加载作品，若已有作品则自动选中第一个
onMounted(async () => {
  await repo.loadWorks()
  if (repo.works.value.length > 0 && !repo.currentWorkId.value) {
    const firstWork = repo.works.value[0] as { id: number }
    await repo.selectWork(firstWork.id)
  }
})

// Tauri 模式：全局监听关闭请求（始终注册，不依赖 AgentPanel 是否打开）
import('./composables/useLocalWorkTree').then(({ isTauri: _it }) => {
if (_it()) {
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('check-pending-close', async () => {
      try {
        const { findAwaitingRuns } = await import('./agents/persistence')
        const awaiting = findAwaitingRuns()
        if (awaiting.length > 0) {
          // 窗口即将关闭，仅提示（不阻止）
          message.warning(`有 ${awaiting.length} 个待审任务，下次启动时可继续`)
        }
      } catch {}
    })
  }).catch(() => {})
}
})

// ── 其他 ──
const inspireRef = ref<InstanceType<typeof InspireModal> | null>(null)
const inspireWizardRef = ref<InstanceType<typeof InspireWizard> | null>(null)
const smartImportRef = ref<InstanceType<typeof SmartImportModal> | null>(null)
const showSettings = ref(false)

// Agent 导航：接收到 Agent 推荐按钮点击 → 切换面板并触发对应弹窗
const chapterEditorRef = ref<InstanceType<typeof ChapterEditor> | null>(null)
const wsSettingsRef = ref<InstanceType<typeof WorkspaceSettings> | null>(null)
const outlinePanelRef = ref<InstanceType<typeof OutlinePanel> | null>(null)
const agentPanelRef = ref<any>(null)

// 面板切换时刷新编排器状态（用户从其他面板回来时自动重扫）
watch(activePanel, () => {
  agentPanelRef.value?.refreshOrchestrator?.()
})
const settingsPanelRef = ref<InstanceType<typeof SettingsPanel> | null>(null)

async function onAgentNavigate({ panel, action }: { panel: string; action: string }) {
  activePanel.value = panel as any
  await nextTick()
  // 等待组件挂载后调用其 triggerAi
  setTimeout(() => {
    if (panel === 'content') {
      chapterEditorRef.value?.triggerAi?.(action)
    } else if (panel === 'workspace_config') {
      wsSettingsRef.value?.triggerAi?.(action)
    } else if (panel === 'outline_config') {
      outlinePanelRef.value?.triggerAi?.(action)
    } else if (panel === 'settings') {
      settingsPanelRef.value?.triggerAi?.(action)
    }
  }, 100)
}
async function handleExit() {
  const { isTauri: _t } = await import('./composables/useLocalWorkTree')
  if (_t()) {
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close())
  } else {
    window.close()
  }
}
function onChapterSelect(_ch: any) {
  activePanel.value = 'content'
}

function onSettingsChanged() {
  settingsVersion.value++
}

function onEditorSettingsChanged(s: any) {
  editorSettings.update(s)
}

async function onSettingsUpdated() {
  const workId = (await import('./composables/useWorkRepo')).useWorkRepo().currentWorkId.value
  if (workId) {
    try {
      await settingsMgr.load(workId)
      settingsVersion.value++
    } catch {}
  }
}

// ── 数据库导入导出 ──
const EXPORT_SKIP_KEYS = ['ns:api_keys', 'ns:custom_models']
const DISK_FILES_KEY = '__disk_files__'

/**
 * 递归收集 AppData 下所有 .json 文件
 * 覆盖范围：novel-studio/（正文/卷/章/大纲）+ 根目录（设定/模板等）
 */
async function collectDiskFiles(): Promise<Record<string, string>> {
  const fs = await import('@tauri-apps/plugin-fs')
  const diskFiles: Record<string, string> = {}
  async function walkDir(dir: string) {
    try {
      const entries = await fs.readDir(dir, { baseDir: fs.BaseDirectory.AppData })
      for (const entry of entries) {
        const fullPath = dir ? `${dir}/${entry.name}` : entry.name
        if (entry.isDirectory) {
          await walkDir(fullPath)
        } else if (entry.name.endsWith('.json')) {
          try {
            const content = await fs.readTextFile(fullPath, { baseDir: fs.BaseDirectory.AppData })
            diskFiles[fullPath] = content
          } catch { /* 跳过无法读取的文件 */ }
        }
      }
    } catch { /* 目录不存在或读取失败 */ }
  }
  await walkDir('')  // 从 AppData 根目录开始，捕获所有 .json 文件
  return diskFiles
}

async function exportDatabase() {
  const data: Record<string, any> = {}
  let lsCount = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('ns:') && !EXPORT_SKIP_KEYS.includes(key)) {
      try { data[key] = JSON.parse(localStorage.getItem(key) || '') } catch { data[key] = localStorage.getItem(key) }
      lsCount++
    }
  }
  // Tauri 模式：收集 AppData 下所有磁盘文件
  let diskCount = 0
  try {
    const { isTauri } = await import('./composables/useLocalWorkTree')
    if (isTauri()) {
      const diskFiles = await collectDiskFiles()
      diskCount = Object.keys(diskFiles).length
      if (diskCount > 0) data[DISK_FILES_KEY] = diskFiles
    }
  } catch { /* 非 Tauri 环境 */ }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `novelstudio-backup-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  message.success(`已导出 ${lsCount} 个本地数据项${diskCount > 0 ? ` + ${diskCount} 个磁盘文件` : ''}`)
}

function importDatabase() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (typeof data !== 'object' || !data || Array.isArray(data)) { message.error('无效的备份文件格式'); return }
        const keys = Object.keys(data)
        const validKeys = keys.filter(k => k.startsWith('ns:') && !EXPORT_SKIP_KEYS.includes(k))
        const hasDiskFiles = !!data[DISK_FILES_KEY]
        if (!validKeys.length && !hasDiskFiles) { message.warning('备份文件中无可导入的有效数据'); return }
        // 安全校验
        for (const k of validKeys) {
          const v = data[k]
          if (typeof v === 'function' || typeof v === 'symbol' || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== Array.prototype && Object.getPrototypeOf(v) !== null)) {
            message.error(`备份文件包含不安全的键: ${k}`); return
          }
        }
        const diskCount = hasDiskFiles ? Object.keys(data[DISK_FILES_KEY]).length : 0
        showConfirm(`将导入 ${validKeys.length} 个本地数据项${diskCount > 0 ? ` + ${diskCount} 个磁盘文件` : ''}，可能覆盖现有数据。是否继续？`, async () => {
          // 1. 写入 localStorage
          for (const key of validKeys) {
            try { localStorage.setItem(key, typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key])) } catch {}
          }
          // 2. 写入磁盘文件（Tauri 模式）
          if (hasDiskFiles) {
            try {
              const { isTauri } = await import('./composables/useLocalWorkTree')
              if (isTauri()) {
                const fs = await import('@tauri-apps/plugin-fs')
                let restored = 0
                for (const [path, content] of Object.entries(data[DISK_FILES_KEY])) {
                  try {
                    const parts = path.split('/')
                    if (parts.length > 1) {
                      const dir = parts.slice(0, -1).join('/')
                      const dirExists = await fs.exists(dir, { baseDir: fs.BaseDirectory.AppData })
                      if (!dirExists) await fs.mkdir(dir, { baseDir: fs.BaseDirectory.AppData, recursive: true })
                    }
                    await fs.writeTextFile(path, content as string, { baseDir: fs.BaseDirectory.AppData })
                    restored++
                  } catch (err) { console.warn('[import] 磁盘文件写入失败:', path, err) }
                }
                // 3. 修复 state.json 自增 ID，避免恢复后 ID 冲突
                try {
                  const statePath = 'novel-studio/state.json'
                  const stateRaw = await fs.readTextFile(statePath, { baseDir: fs.BaseDirectory.AppData })
                  const state = JSON.parse(stateRaw)
                  // 扫描所有已存在的 ID，确保计数器 > max
                  let maxWork = state.nextWorkId || 1
                  let maxVol = state.nextVolumeId || 1
                  let maxCh = state.nextChapterId || 1
                  // 扫描 works/index.json
                  try {
                    const worksRaw = await fs.readTextFile('novel-studio/works/index.json', { baseDir: fs.BaseDirectory.AppData })
                    const works = JSON.parse(worksRaw)
                    for (const w of Object.values(works) as any[]) { if (w.id >= maxWork) maxWork = w.id + 1 }
                  } catch {}
                  // 扫描所有卷和章节文件
                  try {
                    const chaptersDir = 'novel-studio/chapters'
                    const chEntries = await fs.readDir(chaptersDir, { baseDir: fs.BaseDirectory.AppData })
                    for (const entry of chEntries) {
                      if (entry.name === '_parent.json' || !entry.name.endsWith('.json')) continue
                      const volId = parseInt(entry.name)
                      if (volId >= maxVol) maxVol = volId + 1
                      try {
                        const chRaw = await fs.readTextFile(`${chaptersDir}/${entry.name}`, { baseDir: fs.BaseDirectory.AppData })
                        const chs = JSON.parse(chRaw)
                        for (const ch of Object.values(chs) as any[]) { if (ch.id >= maxCh) maxCh = ch.id + 1 }
                      } catch {}
                    }
                  } catch {}
                  // 写入修复后的 state.json
                  const fixedState = { nextWorkId: maxWork, nextVolumeId: maxVol, nextChapterId: maxCh }
                  await fs.writeTextFile(statePath, JSON.stringify(fixedState), { baseDir: fs.BaseDirectory.AppData })
                } catch (err) { console.warn('[import] state.json 修复失败:', err) }
                console.log(`[import] 已恢复 ${restored} 个磁盘文件`)
              }
            } catch { /* 非 Tauri 环境 */ }
          }
          message.success(`已导入 ${validKeys.length} 个数据项${diskCount > 0 ? ` + ${diskCount} 个磁盘文件` : ''}，刷新页面中...`)
          setTimeout(() => window.location.reload(), 1500)
        }, '确认导入')
      } catch { message.error('JSON 格式无效') }
    }
    reader.readAsText(file)
  }
  input.click()
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; overflow: hidden; }

.app-layout {
  display: flex; flex-direction: column; height: 100vh; width: 100vw;
  --border-color: rgba(128,128,128,0.2); --bg-panel: #28282f;
  --btn-color: rgba(210,210,210,0.65); --btn-hover-bg: rgba(255,255,255,0.08);
}

/* ── 顶部栏 ── */
.top-bar {
  position: relative; height: 48px; display: flex; align-items: center;
  justify-content: space-between; padding: 0 12px;
  border-bottom: 1px solid var(--border-color); flex-shrink: 0;
  -webkit-app-region: drag; user-select: none;
}
.app-title {
  font-size: 14px; font-weight: 700; letter-spacing: 0.5px;
  background: linear-gradient(135deg, #52c8a0 0%, #3ba0d0 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.top-bar-left { -webkit-app-region: no-drag; display: flex; align-items: center; gap: 6px; }
.top-bar-sep { width: 1px; height: 18px; background: var(--border-color); border-radius: 1px; }
.exit-btn {
  opacity: 0.4; font-size: 12px; padding: 3px 8px; border-radius: 5px;
}
.exit-btn:hover { opacity: 0.75; background: rgba(220,60,60,0.1); color: #e06060; }
.top-bar-model {
  font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
  padding: 2px 8px; border-radius: 10px;
  background: rgba(128,128,128,0.08); opacity: 0.55;
}
.top-bar-center {
  display: flex; align-items: center; gap: 1px;
  position: absolute; left: 50%; transform: translateX(-50%);
  -webkit-app-region: no-drag;
  background: rgba(128,128,128,0.04); border-radius: 10px; padding: 3px;
}
.toolbar-text-btn {
  background: transparent; border: none; border-radius: 8px;
  padding: 5px 16px; font-size: 12.5px; font-weight: 500;
  cursor: pointer; font-family: inherit; color: var(--btn-color);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}
.toolbar-text-btn:hover { background: var(--btn-hover-bg); color: #fff; }
.toolbar-text-btn.active {
  background: rgba(82,200,160,0.20); color: #52c8a0;
  box-shadow: 0 1px 3px rgba(82,200,160,0.12);
  font-weight: 600;
}
.top-bar-right {
  display: flex; align-items: center; gap: 3px; -webkit-app-region: no-drag;
}
.toolbar-btn {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border: none; border-radius: 9px;
  background: transparent; cursor: pointer; color: var(--btn-color);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}
.toolbar-btn:hover { background: var(--btn-hover-bg); color: #fff; transform: scale(1.05); }
.toolbar-btn:active { transform: scale(0.95); }

/* ── 主体三栏 ── */
.main-area { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* 左栏：作品目录 */
.left-panel {
  flex-shrink: 0; overflow: hidden; border-right: 1px solid var(--border-color);
  display: flex; flex-direction: column; transition: width 0.2s;
}
.left-panel.collapsed { width: 0 !important; border-right: none; }
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.panel-header-title { font-size: 12px; font-weight: 600; opacity: 0.6; }
.panel-collapse-btn {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: none; border-radius: 4px;
  background: transparent; cursor: pointer; color: var(--btn-color);
}
.panel-collapse-btn:hover { background: var(--btn-hover-bg); }
.panel-scroll { flex: 1; overflow-y: auto; padding: 12px; min-height: 0; }
/* Agent 侧栏：子组件需占满剩余高度，避免 height:100% 塌陷成空白 */
.agent-panel-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}
.config-section { margin-bottom: 14px; }
.section-title { font-size: 11px; font-weight: 600; opacity: 0.4; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.platform-meta { display: flex; gap: 4px; margin-top: 6px; }
.generate-bar { padding: 12px; border-top: 1px solid var(--border-color); flex-shrink: 0; }

/* 拖拽调整器 */
.resizer { width: 4px; cursor: col-resize; flex-shrink: 0; background: transparent; transition: background 0.2s; }
.resizer:hover { background: rgba(128,128,128,0.3); }

/* 左栏折叠后展开条 */
.collapsed-strip {
  width: 20px; flex-shrink: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-right: 1px solid var(--border-color); opacity: 0.3; transition: opacity 0.15s;
}
.collapsed-strip:hover { opacity: 0.7; }

/* 右栏主体 */
.right-main { flex: 1; display: flex; overflow: hidden; min-width: 0; position: relative; }

/* 面板内容区 */
.panel-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* 面板内 Tab */
.main-tabs {
  display: flex; align-items: center; justify-content: center;
  border-bottom: 1px solid var(--border-color); flex-shrink: 0;
  background: rgba(128,128,128,0.04); padding: 0 12px;
}
.main-tab {
  padding: 6px 16px; border: none; background: transparent; cursor: pointer;
  font-size: 12px; font-family: inherit; color: inherit; opacity: 0.5;
  border-bottom: 2px solid transparent; transition: opacity 0.15s, border-color 0.15s;
  display: flex; align-items: center; gap: 6px;
}
.main-tab:hover { opacity: 0.85; }
.main-tab.active { opacity: 1; border-bottom-color: #52c8a0; font-weight: 600; }
.badge-error { background: #e06060; } .badge-warn { background: #f0a020; }


/* 预览工具栏 */
.preview-tabs {
  display: flex; align-items: center; gap: 2px;
  padding: 8px 14px; flex-shrink: 0;
  background: rgba(128,128,128,0.03);
  border-bottom: 1px solid var(--border-color);
}
.preview-tabs > button:not(.pa-btn) {
  padding: 6px 14px; border: none; border-radius: 7px;
  background: transparent; color: inherit; cursor: pointer;
  font-size: 12.5px; font-weight: 500; font-family: inherit;
  opacity: 0.5; transition: all 0.2s;
}
.preview-tabs > button:not(.pa-btn).active {
  opacity: 1; background: rgba(128,128,128,0.1);
  font-weight: 600;
}
.tab-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 17px; padding: 0 5px;
  font-size: 10px; font-weight: 700; color: #fff;
  background: #e06060; border-radius: 9px;
  margin-left: 4px; vertical-align: middle;
}

/* 预览操作按钮 */
.pa-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; font-size: 12px; font-weight: 500; font-family: inherit;
  border: 1px solid rgba(128,128,128,0.18); border-radius: 8px;
  background: rgba(128,128,128,0.04); color: inherit; cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.pa-btn:hover {
  background: rgba(128,128,128,0.1); border-color: rgba(128,128,128,0.3);
  transform: translateY(-1px);
}

/* 各操作按钮色彩区分 */

.story-output { white-space: pre-wrap; line-height: 1.8; font-size: 15px; max-width: 720px; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; }



/* Agent 工作台 */
.agent-sidebar {
  flex-shrink: 0; overflow: hidden;
  border-left: 1px solid var(--border-color);
  display: flex; flex-direction: column; transition: width 0.2s;
  width: 0; min-height: 0; align-self: stretch;
}
.agent-sidebar.open { min-width: 320px; }

/* Agent 悬浮按钮 */
.agent-float-btn {
  position: absolute; z-index: 100;
  width: 40px; height: 40px; border-radius: 50%; border: none;
  background: #52c8a0; color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 12px rgba(82,200,160,0.4);
  transition: transform 0.15s;
}
.agent-float-btn:hover { transform: scale(1.1); }

/* 底部状态栏 */
.status-bar {
  height: 28px; display: flex; align-items: center; padding: 0 12px; gap: 12px;
  font-size: 11px; border-top: 1px solid var(--border-color); flex-shrink: 0;
  color: var(--btn-color);
}
.status-item { opacity: 0.45; }

/* 主题 */
.theme-dark { background: #1a1a20; color: white; }
.theme-dark .top-bar { background: #1e1e26; }
.theme-dark .top-bar-center { background: rgba(255,255,255,0.03); }
.theme-dark .left-panel { background: #1a1a22; }
.theme-dark .agent-sidebar { background: #1a1a22; }
.theme-dark .status-bar { background: #1e1e26; color: rgba(255,255,255,0.4); }

.theme-light { background: #f3f3f4; color: #1a1a1a;
  --border-color: rgba(0,0,0,0.08); --bg-panel: #ffffff;
  --btn-color: rgba(50,50,50,0.5); --btn-hover-bg: rgba(0,0,0,0.06); }
.theme-light .top-bar { background: #ffffff; }
.theme-light .top-bar-center { background: rgba(0,0,0,0.03); }
.theme-light .toolbar-text-btn.active { background: rgba(82,200,160,0.15); color: #2ea86a; }
.theme-light .left-panel { background: #fafafa; }
.theme-light .agent-sidebar { background: #fafafa; }
.theme-light .status-bar { background: #f9f9f9; color: #999; }
</style>

<style>
/* ── 原生表单元素主题适配 ── */
.theme-light input:not([type="checkbox"]):not([type="radio"]),
.theme-light textarea,
.theme-light select {
  background: white;
  border-color: rgba(0,0,0,0.1);
  color: #1a1a1a;
}

body.theme-dark input:not([type="checkbox"]):not([type="radio"]),
body.theme-dark textarea,
body.theme-dark select {
  color: white;
}

/* 确保原生 select 深色模式下 option 可见 */
body.theme-dark select option {
  background: #1c1c22;
  color: #d4d4d4;
}

/* ── Naive UI 弹窗/下拉安全网 ──
   NConfigProvider darkTheme 已覆盖绝大多数场景，以下为 teleported 组件的兜底 */
body.theme-dark .n-modal,
body.theme-dark .n-card,
body.theme-dark .n-popover,
body.theme-dark .n-dropdown-menu,
body.theme-dark .n-base-select-menu {
  background: #1c1c22 !important;
  color: #d4d4d4 !important;
}

.theme-light .n-modal,
.theme-light .n-card,
.theme-light .n-popover,
.theme-light .n-dropdown-menu,
.theme-light .n-base-select-menu {
  background: #ffffff !important;
  color: #1a1a1a !important;
}

/* ── AiModal Teleported 安全网 ──
   当 scoped CSS 无法覆盖 teleported 到 body 的 AiModal 时兜底 */
body.theme-dark .am-root {
  background: #1c1c22 !important;
  color: #d4d4d4 !important;
}
body.theme-dark .am-popover {
  background: #2a2a35 !important;
  color: #d4d4d4 !important;
}
.theme-light .am-root {
  background: #f5f5f5 !important;
  color: #1a1a1a !important;
}
.theme-light .am-popover {
  background: #ffffff !important;
  color: #1a1a1a !important;
}

/* ── 短篇审阅弹窗 ── */
.rm-overlay {
  position: fixed; inset: 0; z-index: 10020;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
}
.rm-root {
  width: 780px; max-width: calc(100vw - 48px); max-height: 90vh;
  border-radius: 16px; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 12px 48px rgba(0,0,0,0.5);
}
.rm-dark { background: #1c1c22; color: #d4d4d4; }
.rm-light { background: #fff; color: #1a1a1a; }
.rm-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 10px; flex-shrink: 0;
}
.rm-title { font-size: 17px; font-weight: 700; margin: 0; }
.rm-close {
  width: 28px; height: 28px; border: none; border-radius: 50%;
  background: transparent; color: inherit; cursor: pointer;
  font-size: 16px; opacity: 0.4; display: flex; align-items: center; justify-content: center;
  transition: opacity 0.15s;
}
.rm-close:hover:not(:disabled) { opacity: 0.8; }
.rm-close:disabled { opacity: 0.15; cursor: not-allowed; }
.rm-body {
  flex: 1; overflow-y: auto; padding: 12px 20px 20px;
}
.rm-loading {
  display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
}
.rm-spinner {
  width: 24px; height: 24px; border: 3px solid rgba(128,128,128,0.15);
  border-top-color: #52c8a0; border-radius: 50%;
  animation: rm-spin 0.8s linear infinite;
}
@keyframes rm-spin { to { transform: rotate(360deg); } }
.rm-loading-text { font-size: 13px; opacity: 0.5; margin: 0; }
.rm-streaming { margin-bottom: 8px; }
.rm-streaming-label {
  font-size: 11px; opacity: 0.35; margin-bottom: 6px; font-weight: 500;
}
.rm-content {
  white-space: pre-wrap; line-height: 1.8; font-size: 15px;
  max-width: none;
}
.rm-footer {
  display: flex; justify-content: flex-end; align-items: center; gap: 10px;
  padding: 14px 20px; border-top: 1px solid rgba(128,128,128,0.1); flex-shrink: 0;
}
.rm-footer-hint { font-size: 12px; opacity: 0.3; }
.rm-btn {
  padding: 8px 20px; border: none; border-radius: 10px;
  font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer;
  transition: all 0.2s;
}
.rm-btn-discard {
  background: transparent; color: inherit; opacity: 0.4;
  border: 1px solid rgba(128,128,128,0.15);
}
.rm-btn-discard:hover { opacity: 0.75; border-color: rgba(220,60,60,0.4); color: #e06060; }
.rm-btn-retry {
  background: transparent; color: inherit; opacity: 0.6;
  border: 1px solid rgba(128,128,128,0.2);
}
.rm-btn-retry:hover { opacity: 1; border-color: rgba(128,128,128,0.4); }
.rm-btn-confirm {
  background: #2ea86a; color: #fff;
}
.rm-btn-confirm:hover { background: #258d58; }

/* ── 全局确认弹窗（Teleport to body，需 body.theme-* 选择器）── */
.g-confirm-overlay {
  position: fixed; inset: 0; z-index: 100000;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
}
.g-confirm-dialog {
  border-radius: 8px; padding: 24px 28px; min-width: 320px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.g-confirm-msg {
  margin: 0 0 20px; font-size: 14px; line-height: 1.6;
}
.g-confirm-btns { display: flex; gap: 12px; justify-content: flex-end; }
.g-confirm-btn {
  padding: 6px 18px; border-radius: 4px;
  font-size: 13px; cursor: pointer; background: transparent;
}
.g-confirm-btn.ok { background: #d32f2f; color: #fff; border-color: #d32f2f; }
.g-confirm-btn.ok:hover { background: #b71c1c; }

/* 暗色主题 */
body.theme-dark .g-confirm-dialog {
  background: #1e1e26; border: 1px solid #333; color: #d4d4d4;
}
body.theme-dark .g-confirm-msg { color: #ccc; }
body.theme-dark .g-confirm-btn {
  border: 1px solid #444; color: #d4d4d4;
}
body.theme-dark .g-confirm-btn.cancel { color: #888; }
body.theme-dark .g-confirm-btn.cancel:hover { background: rgba(255,255,255,0.05); }

/* 浅色主题 */
body.theme-light .g-confirm-dialog {
  background: #ffffff; border: 1px solid rgba(0,0,0,0.1); color: #1a1a1a;
}
body.theme-light .g-confirm-msg { color: #333; }
body.theme-light .g-confirm-btn {
  border: 1px solid rgba(0,0,0,0.12); color: #555;
}
body.theme-light .g-confirm-btn.cancel { color: #999; }
body.theme-light .g-confirm-btn.cancel:hover { background: rgba(0,0,0,0.04); }
</style>
