/**
 * Web 搜索接口 — 为网文潜力评估提供实时市场情报
 *
 * 支持 Tavily Search API（专为 AI 设计），可选配置 API Key。
 * 未配置时回退到 LLM 内嵌知识评估。
 */

import { isTauri } from './useLocalWorkTree'

export interface SearchResult {
  title: string
  url: string
  content: string
  score?: number
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  answer?: string        // Tavily 生成的综合答案
}

// ── API Key 管理 ──

const SEARCH_KEY_LS = 'ns:searchApiKey'

export function getSearchApiKey(): string | null {
  try {
    return localStorage.getItem(SEARCH_KEY_LS) || null
  } catch { return null }
}

export function setSearchApiKey(key: string) {
  localStorage.setItem(SEARCH_KEY_LS, key)
}

// ── HTTP 请求 ──

async function httpPost(url: string, body: unknown, apiKey: string): Promise<any> {
  const payload = JSON.stringify(body)

  if (isTauri()) {
    // 动态导入 Tauri API，避免浏览器模式报错
    const { invoke } = await import('@tauri-apps/api/core')
    const res: { status: number; headers: Record<string, string>; body: string } = await invoke('proxy_fetch', {
      input: {
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: Array.from(new TextEncoder().encode(payload)),
      },
    })
    if (res.status >= 400) {
      throw new Error(`搜索API返回 ${res.status}: ${res.body.slice(0, 200)}`)
    }
    return JSON.parse(res.body)
  }

  // 浏览器模式
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: payload,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`搜索API返回 ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ── Tavily Search ──

export async function searchWeb(query: string, options?: {
  maxResults?: number
  includeAnswer?: boolean
  searchDepth?: 'basic' | 'advanced'
}): Promise<SearchResponse> {
  const apiKey = getSearchApiKey()
  if (!apiKey) {
    throw new Error('未配置搜索 API Key，请在模型设置中配置 Tavily Search API Key')
  }

  const body = {
    query,
    max_results: options?.maxResults ?? 5,
    include_answer: options?.includeAnswer ?? true,
    search_depth: options?.searchDepth ?? 'basic',
  }

  const data = await httpPost('https://api.tavily.com/search', body, apiKey)

  return {
    query: data.query || query,
    answer: data.answer || undefined,
    results: (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      score: r.score,
    })),
  }
}

// ── 组合搜索：多关键词并行 ──

export interface ParallelSearchResult {
  searches: { query: string; response: SearchResponse }[]
  mergedContent: string    // 所有搜索结果合并后的文本，供 LLM 分析
}

export async function parallelSearch(queries: string[]): Promise<ParallelSearchResult> {
  const apiKey = getSearchApiKey()

  // 无 API Key 时抛出明确错误，让调用方回退到 LLM-only 模式
  if (!apiKey) {
    throw new Error('未配置搜索 API Key')
  }

  const results = await Promise.all(queries.map(async q => {
    try {
      const r = await searchWeb(q, { maxResults: 3, includeAnswer: true })
      return { query: q, response: r }
    } catch (e) {
      console.warn(`[searchWeb] "${q}" 搜索失败:`, e)
      return { query: q, response: { query: q, results: [] } }
    }
  }))

  // 合并所有内容
  const parts: string[] = []
  for (const { query, response } of results) {
    parts.push(`## 搜索: ${query}`)
    if (response.answer) parts.push(`综合答案: ${response.answer}`)
    for (const r of response.results) {
      parts.push(`- ${r.title}\n  ${r.content.slice(0, 300)}`)
    }
    parts.push('')
  }

  return { searches: results, mergedContent: parts.join('\n') }
}
