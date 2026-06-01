/**
 * 作品设定管理 — 持久化到 localStorage，按 workId 隔离
 */

import { reactive } from 'vue'

export type ProgressStage = 'init' | 'outline_main' | 'outline_volume' | 'outline_chapter' | 'opening' | 'review' | 'extract' | 'continue'

export interface AgentConfig {
  workMode: 'auto' | 'approval'
  genCount: number
  contextCount: number
  contextWords: number
  autoReview: boolean
  autoClean: boolean
  autoExtractSettings: boolean
  volumeBoundaryCheck: boolean
  fields: { label: string; path: string; renderType: string; showCard: boolean; showDetail: boolean; inCard: boolean }[]
}

export interface WorkspaceSettingsData {
  title: string
  tags: string[]
  genre: string
  subgenre: string
  pov: string
  platformId: string
  targetWordCount: number
  wordsPerChapter: number
  chaptersPerVolume: number
  intro: string
  styleDescription: string
  worldSetting: string
  mainCharacter: string
  powerSystem: string
  cheatAbility: string
  progress: ProgressStage
  agentConfig: AgentConfig
}

const LS_PREFIX = 'ns:ws:'

export function defaultSettings(): WorkspaceSettingsData {
  return {
    title: '',
    tags: [],
    genre: '',
    subgenre: '',
    pov: '第三人称',
    platformId: '',
    targetWordCount: 0,
    wordsPerChapter: 2000,
    chaptersPerVolume: 50,
    intro: '',
    styleDescription: '',
    worldSetting: '',
    mainCharacter: '',
    powerSystem: '',
    cheatAbility: '',
    progress: 'init',
    agentConfig: {
      workMode: 'approval',
      genCount: 1,
      contextCount: 10,
      contextWords: 0,
      autoReview: false,
      autoClean: false,
      autoExtractSettings: true,
      volumeBoundaryCheck: true,
      fields: [],
    },
  }
}

export class WorkspaceSettings {
  data: WorkspaceSettingsData

  constructor(public workId: number) {
    this.data = this.load()
  }

  private key(): string { return `${LS_PREFIX}${this.workId}` }

  load(): WorkspaceSettingsData {
    try {
      const raw = localStorage.getItem(this.key())
      if (raw) return { ...defaultSettings(), ...JSON.parse(raw) }
    } catch (e) { console.warn('[WorkspaceSettings] load failed:', e) }
    return defaultSettings()
  }

  save() {
    try { localStorage.setItem(this.key(), JSON.stringify(this.data)) } catch (e) { console.warn('[WorkspaceSettings] save failed:', e) }
  }

  update(patch: Partial<WorkspaceSettingsData>) {
    Object.assign(this.data, patch)
    this.save()
  }

  /** 返回所有已填的非空标签 */
  activeTags(): string[] {
    const result = [...this.data.tags]
    if (this.data.genre) result.push(this.data.genre)
    if (this.data.subgenre) result.push(this.data.subgenre)
    return [...new Set(result)]
  }
}
