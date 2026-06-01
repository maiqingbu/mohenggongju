<template>
  <div class="sd-root">
    <div v-for="diff in diffs" :key="diff.entityId" class="sd-entity">
      <div class="sd-entity-hd">
        <span class="sd-entity-name">{{ diff.entityName }}</span>
        <span class="sd-entity-type">{{ typeLabel(diff.entityType) }}</span>
        <span class="sd-changed-count">{{ changedCount(diff) }} 项变更</span>
      </div>

      <div class="sd-fields">
        <div v-for="f in diff.fields" :key="f.field" class="sd-field" :class="{ 'sd-changed': f.changed }">
          <label class="sd-field-check">
            <input type="checkbox" :checked="f.selected" :disabled="!f.changed" @change="toggleField(diff, f.field, ($event.target as HTMLInputElement).checked)" />
            <span class="sd-field-label">{{ f.label }}</span>
          </label>

          <div class="sd-values" v-if="f.changed">
            <div class="sd-old">
              <span class="sd-tag">旧</span>
              <span>{{ f.oldValue || '(空)' }}</span>
            </div>
            <div class="sd-arrow">→</div>
            <div class="sd-new">
              <span class="sd-tag new">新</span>
              <span>{{ f.newValue || '(空)' }}</span>
            </div>
          </div>
          <div v-else class="sd-unchanged">
            <span>{{ f.oldValue || '(空)' }}</span>
            <span class="sd-unchanged-hint">未变化</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!diffs.length" class="sd-empty">
      ✅ 未检测到设定变更
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsDiff } from '../agents/steps/extractSettings'

const props = defineProps<{ diffs: SettingsDiff[] }>()
const emit = defineEmits<{ (e: 'toggle', entityId: string, field: string, selected: boolean): void }>()

function toggleField(diff: SettingsDiff, field: string, selected: boolean) {
  const f = diff.fields.find(x => x.field === field)
  if (f) f.selected = selected
  emit('toggle', diff.entityId, field, selected)
}

const TYPE_LABELS: Record<string, string> = { character: '角色', world_setting: '世界观', item: '物品', foreshadowing: '伏笔', plot_arc: '情节线' }
function typeLabel(t: string) {
  return TYPE_LABELS[t] || t
}

function changedCount(d: SettingsDiff) {
  return d.fields.filter(f => f.changed).length
}
</script>

<style scoped>
.sd-root { font-size: 13px; }
.sd-entity { margin-bottom: 14px; }
.sd-entity-hd { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.sd-entity-name { font-weight: 700; }
.sd-entity-type { font-size: 10px; padding: 1px 6px; border-radius: 6px; background: #f3f4f6; color: #6b7280; }
.sd-changed-count { font-size: 11px; color: #f59e0b; margin-left: auto; }

.sd-fields { display: flex; flex-direction: column; gap: 6px; }
.sd-field { padding: 6px 8px; border-radius: 8px; border: 1px solid #e5e7eb; }
.sd-field.sd-changed { border-color: #fcd34d; background: #fffbeb; }
.sd-field-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.sd-field-label { font-size: 12px; font-weight: 500; }
.sd-values { display: flex; align-items: flex-start; gap: 8px; margin-top: 4px; padding-left: 22px; font-size: 11px; }
.sd-old, .sd-new { flex: 1; }
.sd-tag { font-size: 9px; padding: 1px 4px; border-radius: 4px; background: #fee2e2; color: #991b1b; margin-right: 4px; }
.sd-tag.new { background: #d1fae5; color: #065f46; }
.sd-arrow { color: #9ca3af; padding-top: 1px; }
.sd-unchanged { padding-left: 22px; font-size: 11px; color: #9ca3af; }
.sd-unchanged-hint { margin-left: 8px; font-size: 10px; }
.sd-empty { text-align: center; color: #6b7280; padding: 20px; }
</style>
