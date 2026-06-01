<template>
  <Teleport to="body">
    <div v-if="visible" class="coi-overlay" @click.self="visible = false">
      <div class="coi-root" :class="isDark ? 'coi-dark' : 'coi-light'">
        <!-- Header -->
        <div class="coi-header">
          <span class="coi-badge">智能辅助解析</span>
          <button class="coi-close" @click="visible = false">✕</button>
        </div>
        <div class="coi-header-body">
          <h2 class="coi-title">智能导入章纲</h2>
          <p class="coi-desc">粘贴包含「第N章」标题的章纲文本，将自动拆分并写入对应章节。支持 Markdown（识别章节号时会忽略标题/列表/加粗等格式），内容按原样写入。</p>
        </div>

        <!-- Body: LR columns -->
        <div class="coi-body">
          <div class="coi-left">
            <div class="coi-left-hd">
              <span>📄 原始文本素材</span>
              <button class="coi-link" @click="rawText = ''">清空内容</button>
            </div>
            <textarea
              class="coi-textarea"
              v-model="rawText"
              placeholder="在这里粘贴要导入的章纲内容...（可直接粘贴历史记录/Markdown）"
            ></textarea>
          </div>

          <div class="coi-right">
            <div class="coi-card">
              <h3 class="coi-card-title">✨ 支持识别的内容</h3>
              <ul class="coi-list">
                <li><span class="coi-dot"></span><div><strong>结构化章纲</strong><p>以"第X章"等作为段落分隔标志的章纲文本。</p></div></li>
                <li><span class="coi-dot"></span><div><strong>智能拆分匹配</strong><p>自动根据章节号匹配并填充至对应章节内。</p></div></li>
                <li><span class="coi-dot"></span><div><strong>Markdown兼容</strong><p>解析时自动过滤控制符，准确提取并写入。</p></div></li>
              </ul>
            </div>

            <div class="coi-card">
              <h3 class="coi-card-title">💡 使用提示</h3>
              <p class="coi-hint-text">导入文本中如果带有明确的章节号关系，会自动合并进入对应的章。</p>
              <p class="coi-hint-text">您可以直接从与 AI 探讨的历史记录中，复制 AI 为您总结好的多章连贯章纲进行一键导入。</p>
            </div>

            <!-- Preview -->
            <div v-if="parsedItems.length" class="coi-card">
              <h3 class="coi-card-title">📊 解析预览（共 {{ parsedItems.length }} 章）</h3>
              <div class="coi-preview-list">
                <div v-for="item in parsedItems" :key="item.chapterNo" class="coi-preview-item">
                  <span class="coi-preview-no">第{{ item.chapterNo }}章</span>
                  <span class="coi-preview-preview">{{ item.content.slice(0, 60) }}{{ item.content.length > 60 ? '…' : '' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="coi-footer">
          <span class="coi-footer-hint">章纲导入操作直接并立即覆盖原有章纲</span>
          <div class="coi-footer-btns">
            <button class="coi-btn-cancel" @click="visible = false">取消</button>
            <button class="coi-btn-import" @click="doImport" :disabled="!parsedItems.length">☁ 一键导入</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { isTauri, localChapterMap, localCurrentWorkId, localUpdateChapterContent } from '../composables/useLocalWorkTree'
import { updateChapterContent, countWords } from '../composables/useDatabase'

const props = defineProps<{ isDark?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const msg = useMessage()
const visible = ref(false)
const rawText = ref('')

interface ParsedItem { chapterNo: number; content: string }

const parsedItems = computed<ParsedItem[]>(() => {
  const text = rawText.value.trim()
  if (!text) return []

  // Split by "第N章" pattern
  const pattern = /第\s*(\d+)\s*章/g
  const items: ParsedItem[] = []
  let lastIdx = 0
  let lastChapterNo = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (lastChapterNo > 0) {
      const content = text.slice(lastIdx, match.index).trim()
      if (content) items.push({ chapterNo: lastChapterNo, content: stripMarkdown(content) })
    }
    lastChapterNo = parseInt(match[1])
    lastIdx = match.index + match[0].length
  }
  // Last segment
  if (lastChapterNo > 0) {
    const content = text.slice(lastIdx).trim()
    if (content) items.push({ chapterNo: lastChapterNo, content: stripMarkdown(content) })
  }
  return items
})

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim()
}

async function doImport() {
  if (!parsedItems.value.length) return

  const allChapters = Object.values(localChapterMap.value).flat().sort((a, b) => a.sort_order - b.sort_order)
  const tauri = isTauri()

  let imported = 0
  for (const item of parsedItems.value) {
    const ch = allChapters.find(c => c.sort_order + 1 === item.chapterNo)
    if (!ch) continue
    const newContent = (ch.content || '') ? ch.content + '\n\n' + item.content : item.content
    const wc = countWords(newContent)
    try {
      if (tauri) {
        await updateChapterContent(ch.id, newContent)
      }
      // 浏览器模式：localUpdateChapterContent 同时更新内存 + persist()
      localUpdateChapterContent(ch.id, ch.volume_id, newContent, wc)
      imported++
    } catch (e) { console.warn('[ChapterOutlineImporter] 写入失败:', e) }
  }

  visible.value = false
  msg.success(`已导入 ${imported} 章的章纲`)
}

function open() {
  rawText.value = ''
  visible.value = true
}

defineExpose({ open })
</script>

<style scoped>
.coi-overlay { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; }
.coi-root { width: 920px; max-width: calc(100vw - 40px); max-height: 90vh; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.4); }
.coi-dark { background: #1c1c22; color: #d4d4d4; }
.coi-light { background: #f8faf9; color: #1a1a1a; }
.coi-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 28px 0; }
.coi-badge { font-size: 11px; padding: 3px 10px; border-radius: 12px; background: #2ea86a; color: #fff; }
.coi-close { width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; cursor: pointer; font-size: 16px; opacity: 0.4; display: flex; align-items: center; justify-content: center; }
.coi-dark .coi-close { color: #d4d4d4; }
.coi-header-body { padding: 12px 28px 20px; }
.coi-title { font-size: 22px; font-weight: 700; margin: 8px 0 0; }
.coi-desc { font-size: 12px; opacity: 0.5; line-height: 1.6; margin: 6px 0 0; }
.coi-body { display: flex; gap: 20px; padding: 0 24px 20px; flex: 1; min-height: 300px; }
.coi-left { flex: 1; display: flex; flex-direction: column; background: #fff; border-radius: 14px; border: 1px solid rgba(128,128,128,0.1); overflow: hidden; }
.coi-dark .coi-left { background: #28282f; }
.coi-left-hd { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid rgba(128,128,128,0.06); font-size: 13px; font-weight: 500; }
.coi-link { background: none; border: none; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; opacity: 0.4; }
.coi-link:hover { opacity: 0.8; }
.coi-textarea { flex: 1; padding: 16px; border: none; outline: none; background: transparent; color: inherit; font-size: 13px; font-family: inherit; resize: none; }
.coi-textarea::placeholder { opacity: 0.3; }
.coi-right { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.coi-card { padding: 16px; border-radius: 14px; background: #fff; border: 1px solid rgba(128,128,128,0.08); }
.coi-dark .coi-card { background: #28282f; }
.coi-card-title { font-size: 13px; font-weight: 600; margin: 0 0 10px; }
.coi-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.coi-list li { display: flex; gap: 10px; }
.coi-dot { width: 6px; height: 6px; border-radius: 50%; background: #2ea86a; margin-top: 5px; flex-shrink: 0; }
.coi-list li strong { font-size: 12px; display: block; }
.coi-list li p { font-size: 11px; opacity: 0.5; margin: 2px 0 0; }
.coi-hint-text { font-size: 11px; opacity: 0.5; margin: 6px 0; line-height: 1.5; }
.coi-preview-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.coi-preview-item { display: flex; gap: 8px; padding: 4px 6px; border-radius: 4px; font-size: 11px; }
.coi-preview-item:hover { background: rgba(128,128,128,0.04); }
.coi-preview-no { font-weight: 600; white-space: nowrap; color: #2ea86a; }
.coi-preview-preview { opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.coi-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 28px; border-top: 1px solid rgba(128,128,128,0.08); background: #fff; }
.coi-dark .coi-footer { background: #1c1c22; }
.coi-footer-hint { font-size: 11px; opacity: 0.35; }
.coi-footer-btns { display: flex; gap: 10px; }
.coi-btn-cancel { padding: 8px 24px; border: 1px solid rgba(128,128,128,0.15); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; font-size: 13px; font-family: inherit; }
.coi-btn-import { padding: 8px 24px; border: none; border-radius: 10px; background: #2ea86a; color: #fff; cursor: pointer; font-size: 13px; font-family: inherit; font-weight: 500; display: flex; align-items: center; gap: 6px; }
.coi-btn-import:hover:not(:disabled) { background: #258d58; }
.coi-btn-import:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
