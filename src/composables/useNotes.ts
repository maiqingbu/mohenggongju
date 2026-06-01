/**
 * 写作笔记管理 — localStorage 持久化
 * 笔记默认不对 AI 可见，需 @ 引用才会注入 prompt
 */

export interface Note {
  id: string
  title: string
  content: string
  folder: string
  extra?: string
  createdAt: string
  updatedAt: string
}

const LS_KEY = 'ns:notes'

function loadAll(): Note[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveAll(notes: Note[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(notes)) } catch {}
}

let nextId = 1

export class NotesManager {
  private notes: Note[] = []

  constructor() {
    this.notes = loadAll()
    const ids = this.notes.map(n => parseInt(n.id.replace('note_', ''), 10) || 0)
    nextId = Math.max(0, ...ids) + 1
  }

  list(folder?: string): Note[] {
    const filtered = (folder !== undefined && folder !== '')
      ? this.notes.filter(n => n.folder === folder)
      : this.notes
    return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  /** 返回所有不重复的文件夹名 */
  folders(): string[] {
    const set = new Set(this.notes.map(n => n.folder).filter(Boolean))
    return [...set].sort()
  }

  get(id: string): Note | undefined {
    return this.notes.find(n => n.id === id)
  }

  create(title: string, folder = ''): Note {
    const now = new Date().toISOString()
    const note: Note = {
      id: `note_${nextId++}`,
      title,
      content: '',
      folder,
      createdAt: now,
      updatedAt: now,
    }
    this.notes.push(note)
    saveAll(this.notes)
    return note
  }

  update(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'folder' | 'extra'>>): boolean {
    const n = this.notes.find(x => x.id === id)
    if (!n) return false
    if (patch.title !== undefined) n.title = patch.title
    if (patch.content !== undefined) n.content = patch.content
    if (patch.folder !== undefined) n.folder = patch.folder
    if (patch.extra !== undefined) n.extra = patch.extra
    n.updatedAt = new Date().toISOString()
    saveAll(this.notes)
    return true
  }

  remove(id: string): boolean {
    const idx = this.notes.findIndex(n => n.id === id)
    if (idx === -1) return false
    this.notes.splice(idx, 1)
    saveAll(this.notes)
    return true
  }
}
