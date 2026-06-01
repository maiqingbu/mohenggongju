/**
 * A5: AgentPanel 测试 — mount 真组件
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, nextTick } from 'vue'

// ── Mock naive-ui ──
vi.mock('naive-ui', () => ({
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
  NIcon: { template: '<span><slot/></span>', props: ['size'] },
  NTag: { template: '<span><slot/></span>', props: ['size', 'type'] },
  NInput: { template: '<input/>', props: ['size', 'type', 'placeholder', 'value'] },
  NSelect: { template: '<select><slot/></select>', props: ['size', 'value', 'options'] },
  NButton: { template: '<button><slot/></button>', props: ['size'] },
  NConfigProvider: { template: '<div><slot name="default"/></div>' },
  NMessageProvider: { template: '<div><slot name="default"/></div>' },
  NDialogProvider: { template: '<div><slot name="default"/></div>' },
}))

// ── Mock icons ──
vi.mock('@vicons/ionicons5', () => ({
  RefreshOutline: { template: '<span/>' },
  CheckmarkOutline: { template: '<span/>' },
}))

// ── Mock modelStore ──
const mockGetEnabledProviders = vi.fn().mockReturnValue([])
const mockGetDecryptedKey = vi.fn().mockResolvedValue('')
const mockResolveModelConfig = vi.fn().mockReturnValue(null)

vi.mock('../stores/modelStore', () => ({
  useModelStore: () => ({
    getEnabledProviders: mockGetEnabledProviders,
    getDecryptedKey: mockGetDecryptedKey,
    resolveModelConfig: mockResolveModelConfig,
    builtInProviders: { value: [] },
    customProviders: { value: [] },
    getBuiltInApiKeySync: vi.fn().mockReturnValue(''),
    hasApiKeyConfigured: vi.fn().mockReturnValue(false),
    setBuiltInApiKey: vi.fn(),
  }),
}))

// ── Mock workStore ──
vi.mock('../stores/workStore', () => ({
  useWorkStore: () => ({
    works: [], volumes: [], chapterMap: {},
    currentWorkId: null, currentChapterId: null,
    currentWork: null, totalWordCount: 0, dbReady: true,
    loadWorks: vi.fn(), addWork: vi.fn(), selectWork: vi.fn(),
    addVolume: vi.fn(), addChapter: vi.fn(),
    renameWork: vi.fn(), renameVolume: vi.fn(), renameChapter: vi.fn(),
    removeWork: vi.fn(), removeVolume: vi.fn(), removeChapter: vi.fn(),
    moveVolume: vi.fn(), moveChapter: vi.fn(),
    updateLocalWordCount: vi.fn(),
  }),
}))

// ── Mock useProjectOrchestrator (static import dependency) ──
vi.mock('../composables/useProjectOrchestrator', () => ({
  createProjectOrchestrator: () => ({
    currentCard: { value: null },
    hasRecommendation: { value: false },
    refresh: vi.fn().mockResolvedValue(null),
    handleAction: vi.fn().mockResolvedValue(null),
  }),
}))

// ── Mock useAiChat ──
let mockStreamCallbacks: any = null
const mockSendAiMessageStream = vi.fn()

vi.mock('../composables/useAiChat', () => ({
  sendAiMessageStream: (req: any, cb: any) => {
    mockStreamCallbacks = cb
    const result = mockSendAiMessageStream(req, cb)
    return { result: result instanceof Promise ? result : Promise.resolve(result), abort: () => {} }
  },
}))

// ── Mock useSettings ──
const { MockSettingsManager } = vi.hoisted(() => {
  class MockSettingsManager {
    listByType() { return [] }
    listAll() { return [] }
    update() {}
    save() {}
    load() {}
  }
  return { MockSettingsManager }
})
vi.mock('../composables/useSettings', () => ({
  SettingsManager: MockSettingsManager,
}))

// ── Mock useWorkspaceSettings ──
const { MockWorkspaceSettings } = vi.hoisted(() => {
  class MockWorkspaceSettings {
    data = { genre: '', styleDescription: '', intro: '', pov: '第三人称', tags: [], targetWordCount: 0, agentConfig: undefined }
    load() { return Promise.resolve() }
    save() { return Promise.resolve() }
    update() {}
  }
  return { MockWorkspaceSettings }
})
vi.mock('../composables/useWorkspaceSettings', () => ({
  WorkspaceSettings: MockWorkspaceSettings,
}))

// ── Mock useContextResolver ──
vi.mock('../composables/useContextResolver', () => ({
  expandPrompt: vi.fn((t: string) => t),
  resolveVariable: vi.fn((k: string) => `[${k}]`),
}))

// ── Mock agents (vi.hoisted 避免 hoist 时未初始化) ──
const { makeMockAgent } = vi.hoisted(() => {
  return {
    makeMockAgent() {
      return {
        id: 'test', name: 'Test', badge: '', desc: '',
        systemPrompt: '', requiredContext: [], parseOutput: (r: string) => ({ raw: r }),
        writeBack: async () => {},
      }
    },
  }
})
vi.mock('../agents/outline', () => ({ outlineAgent: { ...makeMockAgent(), id: 'outline', name: '总纲设计师', systemPrompt: 'outline-sp' } }))
vi.mock('../agents/chapter', () => ({ chapterAgent: { ...makeMockAgent(), id: 'chapter', name: '章纲设计师', systemPrompt: 'chapter-sp' } }))
vi.mock('../agents/body', () => ({ bodyAgent: { ...makeMockAgent(), id: 'body', name: '正文大师', systemPrompt: 'body-sp' } }))
vi.mock('../agents/steps/consistencyCheck', () => ({ createConsistencyCheckAgent: () => ({ ...makeMockAgent(), id: 'consistency_check', name: '一致性检测' }) }))
vi.mock('../agents/steps/commitWrite', () => ({ createCommitWriteAgent: () => ({ ...makeMockAgent(), id: 'commit_write', name: '写入确认' }) }))
vi.mock('../agents/steps/extractSettings', () => ({ createExtractSettingsAgent: () => ({ ...makeMockAgent(), id: 'extract_settings', name: '设定数据更新' }) }))
vi.mock('../agents/steps/styleReview', () => ({ createStyleReviewAgent: () => ({ ...makeMockAgent(), id: 'style_review', name: '文风审查' }) }))
vi.mock('../agents/steps/lengthCheck', () => ({ createLengthCheckAgent: () => ({ ...makeMockAgent(), id: 'length_check', name: '长度检测' }) }))
vi.mock('../agents/steps/compressExpand', () => ({ createCompressExpandAgent: () => ({ ...makeMockAgent(), id: 'compress_expand', name: '字数调整' }) }))
vi.mock('../agents/steps/paragraphFix', () => ({ createParagraphFixAgent: () => ({ ...makeMockAgent(), id: 'paragraph_fix', name: '段落修复' }) }))
vi.mock('../agents/workflows/continueChapter', () => ({ buildContinueChapterWorkflow: vi.fn().mockReturnValue([]) }))

// ── Mock persistence ──
vi.mock('../agents/persistence', () => ({
  findAwaitingRuns: vi.fn().mockReturnValue([]),
  getRun: vi.fn().mockReturnValue(null),
  updateRun: vi.fn(),
}))

// ── Mock runner ──
vi.mock('../agents/runner', () => ({
  WorkflowRunner: function MockRunner(this: any) {
    this.registerAgent = vi.fn()
    this.registerAgents = vi.fn()
    this.setContext = vi.fn()
    this.setLlmCall = vi.fn()
    this.setSaveAwaitingHook = vi.fn()
    this.setMaxAttempts = vi.fn()
    this.serialize = vi.fn().mockReturnValue({})
    this.restore = vi.fn()
    this.resumeFromRestore = vi.fn().mockResolvedValue(undefined)
    this.on = vi.fn()
    this.run = vi.fn()
    this.decide = vi.fn()
    this.abort = vi.fn()
    this.status = 'idle'
    return this
  } as any,
}))

// ── Mock ApprovalCard ──
vi.mock('../components/ApprovalCard.vue', () => ({
  default: { template: '<div class="mock-approval-card"><slot/></div>', props: ['card'] },
}))

// ── Mock SettingsDiffView ──
vi.mock('../components/SettingsDiffView.vue', () => ({
  default: { template: '<div/>', props: ['diffs'] },
}))

// 现在可以 import AgentPanel
import AgentPanel from '../components/AgentPanel.vue'

function mountPanel() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(AgentPanel, {
    global: { plugins: [pinia], stubs: { Teleport: false } },
  })
}

beforeEach(() => {
  mockGetEnabledProviders.mockReturnValue([])
  mockSendAiMessageStream.mockClear()
  mockSendAiMessageStream.mockResolvedValue(undefined)
})

describe('A5.1: no configured provider', () => {
  it('shows warning and does NOT call sendAiMessageStream', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as any

    // 切到 agent 模式（master 模式默认可见）
    vm.mode = 'agent'
    vm.draft = 'hello'
    await vm.send()
    await nextTick()

    expect(mockSendAiMessageStream).not.toHaveBeenCalled()
    expect(vm.messages.length).toBe(2)
    expect(vm.messages[0].role).toBe('user')
    expect(vm.messages[1].role).toBe('assistant')
    expect(vm.messages[1].content).toContain('⚠️')
    expect(vm.messages[1].content).toContain('未配置模型')
  })
})

describe('A5.2: master mode system prompt', () => {
  beforeEach(() => {
    mockGetEnabledProviders.mockReturnValue([{ id: 'test', name: 'Test' }])
  })

  it('master system prompt contains master name and agent table', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as any

    vm.mode = 'master'
    vm.draft = 'test'
    await vm.send()
    await nextTick()

    expect(mockSendAiMessageStream).toHaveBeenCalledTimes(1)
    const req = mockSendAiMessageStream.mock.calls[0][0]
    const sysMsg = req.messages.find((m: any) => m.role === 'system')
    expect(sysMsg).toBeDefined()
    expect(sysMsg.content).toContain('创作大师')
    // master 提示词现包含 9 个智能体一览表
    expect(sysMsg.content).toContain('总纲设计师')
    expect(sysMsg.content).toContain('可调度的专业智能体')
  })
})

describe('A5.3: agent mode system prompt', () => {
  beforeEach(() => {
    mockGetEnabledProviders.mockReturnValue([{ id: 'deepseek', name: 'DeepSeek' }])
  })

  it('agent system prompt contains currentAgent name and desc', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as any

    vm.mode = 'agent'
    vm.draft = 'test'
    await vm.send()
    await nextTick()

    const req = mockSendAiMessageStream.mock.calls[0][0]
    const sysMsg = req.messages.find((m: any) => m.role === 'system')
    expect(sysMsg).toBeDefined()
    expect(sysMsg.content).toContain('总纲设计师')
  })
})

describe('A5.4: stream accumulation', () => {
  beforeEach(() => {
    mockGetEnabledProviders.mockReturnValue([{ id: 'test' }])
  })

  it('streamText accumulates chunks sequentially', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as any

    const snapshots: string[] = []
    mockSendAiMessageStream.mockImplementation((_req: any, cb: any) => {
      cb.onChunk('你'); snapshots.push(vm.streamText)
      cb.onChunk('好'); snapshots.push(vm.streamText)
      cb.onChunk('啊'); snapshots.push(vm.streamText)
      cb.onDone('你好啊')
    })

    vm.mode = 'master'
    vm.draft = 'hi'
    await vm.send()
    await nextTick()

    expect(snapshots).toEqual(['你', '你好', '你好啊'])
  })
})

describe('A5.5: onDone path', () => {
  beforeEach(() => {
    mockGetEnabledProviders.mockReturnValue([{ id: 'test' }])
  })

  it('streaming=false, streamText="" after onDone', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as any

    mockSendAiMessageStream.mockImplementation((_req: any, cb: any) => {
      cb.onChunk('hello'); cb.onChunk(' world'); cb.onDone('hello world')
    })

    vm.mode = 'master'
    vm.draft = 'hi'
    await vm.send()
    await nextTick()

    expect(vm.streaming).toBe(false)
    expect(vm.streamText).toBe('')
    expect(vm.messages.length).toBe(2)
    expect(vm.messages[1].content).toBe('hello world')
  })
})

describe('A5.6: error path', () => {
  beforeEach(() => {
    mockGetEnabledProviders.mockReturnValue([{ id: 'test' }])
  })

  it('onError adds ⚠️ message, streaming=false', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as any

    mockSendAiMessageStream.mockImplementation((_req: any, cb: any) => {
      cb.onError('网络连接超时')
    })

    vm.mode = 'master'
    vm.draft = 'hi'
    await vm.send()
    await nextTick()

    expect(vm.streaming).toBe(false)
    expect(vm.messages[1].content).toContain('⚠️')
    expect(vm.messages[1].content).toContain('网络连接超时')
  })
})

describe('A5.7: history preserves across sends', () => {
  beforeEach(() => {
    mockGetEnabledProviders.mockReturnValue([{ id: 'test' }])
  })

  it('second send includes previous messages', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as any

    mockSendAiMessageStream.mockImplementation((_req: any, cb: any) => {
      cb.onChunk('reply'); cb.onDone('reply')
    })

    vm.mode = 'master'
    vm.draft = 'hi'
    await vm.send()
    await nextTick()
    expect(vm.messages).toHaveLength(2)

    mockSendAiMessageStream.mockClear()
    vm.draft = 'again'
    await vm.send()
    await nextTick()

    const req = mockSendAiMessageStream.mock.calls[0][0]
    const nonSystem = req.messages.filter((m: any) => m.role !== 'system')
    expect(nonSystem).toHaveLength(3) // user:hi + assistant:reply + user:again
    expect(nonSystem[0].content).toBe('hi')
    expect(nonSystem[1].content).toBe('reply')
    expect(nonSystem[2].content).toBe('again')
  })
})

describe('A5.8: mode switch does not clear messages', () => {
  beforeEach(() => {
    mockGetEnabledProviders.mockReturnValue([{ id: 'test' }])
  })

  it('messages persist after switching tab', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as any

    mockSendAiMessageStream.mockImplementation((_req: any, cb: any) => {
      cb.onChunk('ok'); cb.onDone('ok')
    })

    // master 模式发一条
    vm.mode = 'master'
    vm.draft = 'hello from master'
    await vm.send()
    await nextTick()
    expect(vm.messages).toHaveLength(2)
    const masterMsgCount = vm.messages.length

    // 切换到 agent 模式
    vm.mode = 'agent'
    await nextTick()
    // 历史消息保留
    expect(vm.messages).toHaveLength(masterMsgCount)
    expect(vm.messages[0].content).toBe('hello from master')

    // agent 模式再发一条
    mockSendAiMessageStream.mockClear()
    vm.draft = 'agent message'
    await vm.send()
    await nextTick()

    const req = mockSendAiMessageStream.mock.calls[0][0]
    const nonSystem = req.messages.filter((m: any) => m.role !== 'system')
    expect(nonSystem).toHaveLength(3)
    expect(nonSystem[0].content).toBe('hello from master')
  })
})
