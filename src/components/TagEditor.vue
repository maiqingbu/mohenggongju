<template>
  <Teleport to="body">
    <div v-if="visible" class="tge-overlay" @click.self="visible = false">
      <div class="tge-root" :class="isDark ? 'tge-dark' : 'tge-light'">
        <!-- Header -->
        <div class="tge-header">
          <div>
            <h2 class="tge-title">编辑作品标签</h2>
            <p class="tge-desc">先选择作品类型（题材/赛道），再挑 3~5 个标签，用于封面、推荐及 AI 工具提示。</p>
          </div>
          <button class="tge-close" @click="visible = false">✕</button>
        </div>

        <!-- Body -->
        <div class="tge-body">
          <!-- 已选标签 -->
          <div class="tge-section">
            <div class="tge-section-hd">
              <span class="tge-label">已选标签（点击删除）</span>
              <button class="tge-link" @click="selectedTags = []">清空</button>
            </div>
            <div class="tge-tags-row">
              <span v-for="(t, i) in selectedTags" :key="i" class="tge-tag tge-tag-sel" @click="selectedTags.splice(i, 1)">
                {{ t }} <span class="tge-tag-x">✕</span>
              </span>
              <span v-if="!selectedTags.length" class="tge-empty-tag">暂无已选标签</span>
            </div>
          </div>

          <!-- 类型选择 -->
          <div class="tge-section">
            <div class="tge-section-hd">
              <span class="tge-label">类型（题材/赛道，必选）</span>
              <button class="tge-link" @click="currentType = ''">清空</button>
            </div>
            <div class="tge-types-row">
              <button v-for="t in types" :key="t" class="tge-type-btn" :class="{ active: currentType === t }" @click="currentType = t">{{ t }}</button>
            </div>
            <div class="tge-type-box">{{ currentType || '请选择类型...' }}</div>
            <p class="tge-hint">该"类型"会写入作品基础信息，用于前置检查与 @类型 引用。</p>
          </div>

          <!-- 自定义标签 -->
          <div class="tge-custom-row">
            <input class="tge-input" v-model="customTagInput" placeholder="添加自定义标签" @keydown.enter="addCustomTag" />
            <button class="tge-btn" @click="addCustomTag">添加</button>
          </div>

          <!-- 分类标签列表 -->
          <div class="tge-cats">
            <div v-for="(cat, ci) in categories" :key="cat.name" class="tge-cat">
              <div class="tge-cat-title-row">
                <h3 class="tge-cat-title">{{ cat.name }}</h3>
                <button class="tge-cat-add" @click="openCatInput(ci)" title="添加自定义标签">+</button>
              </div>
              <div class="tge-cat-tags">
                <button
                  v-for="(t, ti) in cat.tags" :key="t"
                  class="tge-cat-btn"
                  :class="{ active: selectedTags.includes(t), custom: isCustomTag(t) }"
                  @click="toggleTag(t)"
                  @contextmenu.prevent="removeCatTag(ci, ti)"
                  :title="isCustomTag(t) ? '右键删除自定义标签' : '点击选中/取消'"
                >
                  {{ t }}
                  <span v-if="isCustomTag(t)" class="tge-cat-btn-x" @click.stop="removeCatTag(ci, ti)">×</span>
                </button>
                <template v-if="catInputIdx === ci">
                  <input
                    class="tge-cat-input"
                    v-model="catInputVal"
                    placeholder="自定义标签"
                    @keydown.enter="addCatTag(ci)"
                    @blur="addCatTag(ci)"
                    @keydown.escape="cancelCatTag"
                    ref="catInputRef"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="tge-footer">
          <button class="tge-btn-cancel" @click="visible = false">取消</button>
          <button class="tge-btn-apply" @click="applyTags">应用</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

const props = defineProps<{ isDark?: boolean }>()
const emit = defineEmits<{
  (e: 'apply', data: { type: string; tags: string[] }): void
}>()

const visible = ref(false)
const selectedTags = ref<string[]>([])
const currentType = ref('')
const customTagInput = ref('')

const types = ['玄幻', '仙侠', '都市', '科幻', '历史', '悬疑', '游戏', '衍生', '轻小说', '奇幻', '武侠', '军事', '竞技', '同人', '短篇']

// 预置标签（不可删除）
const PRESET_TAGS: Record<string, string[]> = {
  '细分流派': ['灵气复苏', '高武复苏', '战神赘婿', '都市修真', '职场整顿', '末世废土', '诡异复苏', '数据游戏', '种田经营', '系统流', '无系统', '赛博朋克', '蒸汽朋克', '克苏鲁', '无限流', '综武', '玄幻脑洞', '科技修真', '全球神祇', '全民修炼'],
  '剧情 / 爽点': ['重生', '穿越', '退婚打脸', '签到变强', '无敌流', '群像', '多女主', '单女主', '成长流', '反套路', '直播', '诸天万界', '扮猪吃虎', '凡人流', '刺客流', '商会经营', '领主种田', '学院流', '盗墓', '悬疑破案', '幕后流', '信息差', '追妻火葬场'],
  '情绪 / 文风': ['热血', '轻松搞笑', '杀伐果断', '爽文', '慢热', '快节奏', '暗黑', '治愈', '甜宠', '虐文', '爆笑', '深沉', '文艺', '白描', '意识流'],
  '时空 / 背景': ['现代', '古代', '未来', '异世界', '民国', '校园', '宗门', '军旅', '职场', '娱乐圈', '洪荒', '星际', '末世', '原始', '武侠江湖', '官场', '宫廷', '乡村', '地下城', '塔防世界'],
}

// 自定义标签集合（跨会话持久化）
const LS_KEY = 'ns:tagEditor:customTags'
const customTagNames = ref<Set<string>>(new Set())

function loadCustomTags(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

function saveCustomTags(map: Record<string, string[]>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)) } catch {}
}

function buildCategories(): { name: string; tags: string[] }[] {
  const saved = loadCustomTags()
  const customSet = new Set<string>()
  return Object.entries(PRESET_TAGS).map(([name, presets]) => {
    const extras = saved[name] || []
    extras.forEach(t => customSet.add(t))
    return { name, tags: [...presets, ...extras] }
  })
}

function persistCategories() {
  const map: Record<string, string[]> = {}
  for (const cat of categories.value) {
    const presets = new Set(PRESET_TAGS[cat.name] || [])
    const extras = cat.tags.filter(t => !presets.has(t))
    if (extras.length) map[cat.name] = extras
  }
  saveCustomTags(map)
  // 更新 customTagNames
  const s = new Set<string>()
  for (const arr of Object.values(map)) arr.forEach(t => s.add(t))
  customTagNames.value = s
}

const categories = ref(buildCategories())

const catInputIdx = ref(-1)
const catInputVal = ref('')
const catInputRef = ref<HTMLInputElement | null>(null)
let _escapeCancel = false

async function openCatInput(idx: number) {
  catInputIdx.value = idx
  catInputVal.value = ''
  _escapeCancel = false
  await nextTick()
  catInputRef.value?.focus()
}

function cancelCatTag() {
  _escapeCancel = true
  catInputVal.value = ''
  catInputIdx.value = -1
}

function addCatTag(ci: number) {
  if (_escapeCancel) { _escapeCancel = false; return }
  const val = catInputVal.value.trim()
  if (!val) { catInputVal.value = ''; catInputIdx.value = -1; return }
  const cat = categories.value[ci]
  // 去重
  if (!cat.tags.includes(val)) {
    cat.tags.push(val)
    customTagNames.value.add(val)
    persistCategories()
  }
  if (!selectedTags.value.includes(val)) {
    selectedTags.value.push(val)
  }
  catInputVal.value = ''
  catInputIdx.value = -1
}

function removeCatTag(ci: number, ti: number) {
  const tag = categories.value[ci].tags[ti]
  // 预置标签不允许删除
  if (PRESET_TAGS[categories.value[ci].name]?.includes(tag)) return
  categories.value[ci].tags.splice(ti, 1)
  customTagNames.value.delete(tag)
  persistCategories()
  // 从已选中移除
  const si = selectedTags.value.indexOf(tag)
  if (si > -1) selectedTags.value.splice(si, 1)
}

function isCustomTag(tag: string): boolean {
  return customTagNames.value.has(tag)
}

function toggleTag(tag: string) {
  const idx = selectedTags.value.indexOf(tag)
  if (idx > -1) selectedTags.value.splice(idx, 1)
  else selectedTags.value.push(tag)
}

function addCustomTag() {
  const val = customTagInput.value.trim()
  if (val && !selectedTags.value.includes(val)) {
    selectedTags.value.push(val)
  }
  customTagInput.value = ''
}

function applyTags() {
  emit('apply', { type: currentType.value, tags: [...selectedTags.value] })
  visible.value = false
}

function open(existing?: { type?: string; tags?: string[] }) {
  categories.value = buildCategories()  // 刷新自定义标签
  selectedTags.value = [...(existing?.tags || [])]
  currentType.value = existing?.type || ''
  visible.value = true
}

defineExpose({ open })
</script>

<style scoped>
.tge-overlay { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; }
.tge-root { width: 820px; max-width: calc(100vw - 40px); max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.4); }
.tge-dark { background: #1c1c22; color: #d4d4d4; }
.tge-light { background: #fff; color: #1a1a1a; }
.tge-header { padding: 18px 22px; border-bottom: 1px solid rgba(128,128,128,0.1); display: flex; justify-content: space-between; align-items: flex-start; flex-shrink: 0; }
.tge-title { font-size: 18px; font-weight: 700; margin: 0; }
.tge-desc { font-size: 12px; opacity: 0.45; margin: 4px 0 0; }
.tge-close { width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.4; }
.tge-close:hover { opacity: 1; }
.tge-body { flex: 1; overflow-y: auto; padding: 18px 22px; }
.tge-section { margin-bottom: 16px; }
.tge-section-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.tge-label { font-size: 12px; opacity: 0.5; font-weight: 500; }
.tge-link { background: none; border: none; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; opacity: 0.4; }
.tge-link:hover { opacity: 0.8; }

.tge-tags-row { display: flex; flex-wrap: wrap; gap: 6px; }
.tge-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 12px; border-radius: 20px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
.tge-tag-sel { background: rgba(46,168,106,0.1); color: #2ea86a; border: 1px solid rgba(46,168,106,0.2); }
.tge-tag-sel:hover { background: rgba(46,168,106,0.2); }
.tge-tag-x { font-size: 10px; opacity: 0.5; }
.tge-empty-tag { font-size: 12px; opacity: 0.3; font-style: italic; padding: 4px 0; }

.tge-types-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.tge-type-btn { padding: 4px 14px; border-radius: 20px; border: 1px solid rgba(128,128,128,0.15); background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.15s; }
.tge-type-btn:hover { border-color: rgba(128,128,128,0.4); }
.tge-type-btn.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.tge-dark .tge-type-btn.active { background: #fff; color: #000; border-color: #fff; }
.tge-type-box { padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(128,128,128,0.1); background: rgba(128,128,128,0.03); font-size: 12px; }
.tge-hint { font-size: 10px; opacity: 0.3; margin-top: 4px; }

.tge-custom-row { display: flex; gap: 8px; margin-bottom: 16px; }
.tge-input { flex: 1; padding: 6px 12px; font-size: 13px; font-family: inherit; border: 1px solid rgba(128,128,128,0.15); border-radius: 8px; background: transparent; color: inherit; outline: none; }
.tge-input:focus { border-color: rgba(46,168,106,0.4); }
.tge-btn { padding: 6px 16px; border: 1px solid rgba(128,128,128,0.15); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; }
.tge-btn:hover { background: rgba(128,128,128,0.06); }

.tge-cats { display: flex; flex-direction: column; gap: 16px; }
.tge-cat-title { font-size: 12px; font-weight: 500; opacity: 0.5; margin: 0; }
.tge-cat-title-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.tge-cat-add { width: 20px; height: 20px; border: 1px solid rgba(128,128,128,0.15); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 14px; font-family: inherit; display: flex; align-items: center; justify-content: center; opacity: 0.35; transition: all 0.15s; line-height: 1; }
.tge-cat-add:hover { opacity: 0.8; border-color: rgba(46,168,106,0.3); color: #2ea86a; }
.tge-cat-input { width: 110px; padding: 2px 8px; font-size: 11px; font-family: inherit; border: 1px solid rgba(46,168,106,0.3); border-radius: 4px; background: rgba(46,168,106,0.04); color: inherit; outline: none; }
.tge-cat-input:focus { border-color: #2ea86a; }
.tge-cat-tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tge-cat-btn { padding: 4px 14px; border-radius: 20px; border: 1px solid rgba(128,128,128,0.15); background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.15s; position: relative; display: inline-flex; align-items: center; gap: 3px; }
.tge-cat-btn:hover { border-color: rgba(128,128,128,0.4); }
.tge-cat-btn.active { background: rgba(46,168,106,0.1); color: #2ea86a; border-color: rgba(46,168,106,0.3); }
.tge-cat-btn.custom { border-style: dashed; border-color: rgba(168,130,250,0.35); background: rgba(168,130,250,0.04); }
.tge-cat-btn.custom:hover { border-color: rgba(168,130,250,0.6); }
.tge-cat-btn-x { font-size: 10px; opacity: 0; color: #a0a0a0; margin-left: 2px; transition: opacity 0.15s; }
.tge-cat-btn:hover .tge-cat-btn-x { opacity: 0.6; }
.tge-cat-btn-x:hover { opacity: 1 !important; color: #ef4444; }

.tge-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid rgba(128,128,128,0.1); flex-shrink: 0; }
.tge-btn-cancel { padding: 8px 20px; border: 1px solid rgba(128,128,128,0.15); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; font-size: 13px; font-family: inherit; }
.tge-btn-cancel:hover { background: rgba(128,128,128,0.04); }
.tge-btn-apply { padding: 8px 24px; border: none; border-radius: 10px; background: #2ea86a; color: #fff; cursor: pointer; font-size: 13px; font-family: inherit; font-weight: 500; }
.tge-btn-apply:hover { background: #258d58; }
</style>
