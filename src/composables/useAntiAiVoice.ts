/**
 * 反 AI 痕迹检测系统
 *
 * 纯函数模块，检测中文网文中的 AI 生成痕迹：
 * 1. 疲劳词检测 — 7 大类高频 AI 词汇
 * 2. 句式违规检测 — 8 种结构性句式癖好
 *
 * 参考：awesome-novel-skill chapter-quality-checklist
 *       Chinese-WebNovel-Skill anti_ai_voice 模块
 */

// ── 类型定义 ──

/** 疲劳词类别 */
export type FatigueCategory =
  | 'adverb'        // 副词滥用
  | 'verb'          // 心理动词
  | 'adjective'     // 形容词空洞
  | 'connector'     // 连接词/翻译腔句式
  | 'bodyReaction'  // 身体反应模板
  | 'metaNarrative' // 元叙事/AI套话
  | 'englishTone'   // 英文/翻译腔

export interface FatigueWordHit {
  word: string
  category: FatigueCategory
  count: number
  threshold: number
  exceeded: boolean
}

export interface PatternViolation {
  patternKey: string
  description: string
  count: number
  threshold: number
  exceeded: boolean
  samples: string[]
}

export interface AntiAiReport {
  fatigueWordHits: FatigueWordHit[]
  patternViolations: PatternViolation[]
  totalFatigueWordExceeded: number
  totalPatternExceeded: number
  passed: boolean
  suggestions: string[]
}

// ── 疲劳词库 ──

interface FatigueWordEntry {
  words: string[]
  threshold: number
}

const FATIGUE_WORD_LIBRARY: Record<FatigueCategory, FatigueWordEntry> = {
  adverb: {
    threshold: 4,
    words: [
      '似乎', '仿佛', '好像', '或许', '大概', '也许', '可能', '应该',
      '不由得', '不禁', '忍不住', '不由自主地', '下意识地', '鬼使神差地',
      '一种难以言喻的', '一种说不清道不明的',
      '某种程度上', '某种意义上',
    ],
  },
  verb: {
    threshold: 5,
    words: [
      '感到', '觉得', '意识到', '想到', '想起',
      '心想', '心说', '寻思', '暗忖', '暗想',
    ],
  },
  adjective: {
    threshold: 4,
    words: [
      '强大的', '恐怖的', '可怕的', '令人窒息的',
      '不可思议的', '难以想象', '难以形容', '不可思议', '匪夷所思',
      '巨大的', '无比的',
    ],
  },
  connector: {
    threshold: 3,
    words: [
      '与此同时', '在这个过程中', '通过……的方式',
      '对……进行', '在……之后', '就在这时', '正当……之时',
      '不仅……而且', '既……又',
      '然而', '不过', '于是', '随即', '紧接着',
    ],
  },
  bodyReaction: {
    threshold: 3,
    words: [
      '心中一紧', '瞳孔一缩', '倒吸一口凉气',
      '脸色一变', '眉头一皱', '目光一凝',
      '心中暗道', '心中一惊', '心中一动',
      '眼中闪过一丝', '嘴角勾起一抹', '嘴角上扬',
      '浑身一震', '身体一僵', '心头一颤',
      '呼吸一滞', '呼吸一紧', '呼吸急促',
      '后背一凉', '头皮发麻',
    ],
  },
  metaNarrative: {
    threshold: 0,  // 出现即违规
    words: [
      '总的来说', '综上所述', '总而言之', '说来也怪',
      '欲知后事如何', '且听下回分解',
      '只见', '只听得', '但见',
      '本章讲述了', '接下来', '在这一章中', '故事还在继续',
      '这一夜他明白了', '从那天起',
    ],
  },
  englishTone: {
    threshold: 2,
    words: [
      '事实上', '不可否认', '显而易见', '毫无疑问',
      '值得注意的是', '必须承认', '从某种意义上说',
      'OK', 'anyway',
    ],
  },
}

// ── 句式违规规则 ──

interface SentencePatternRule {
  key: string
  description: string
  threshold: number
  detect: (text: string) => { count: number; samples: string[] }
}

const SENTENCE_PATTERN_RULES: SentencePatternRule[] = [
  {
    key: 'summary_ending',
    description: '段末/章末使用总结句式（"总的来说/总而言之/这一夜他明白了"）',
    threshold: 0,
    detect(text) {
      const patterns = ['总的来说', '综上所述', '总而言之', '这一夜他明白了', '从那天起', '从此以后']
      const hits: string[] = []
      for (const p of patterns) {
        let idx = text.indexOf(p)
        while (idx !== -1) {
          hits.push(text.slice(Math.max(0, idx - 10), idx + p.length + 10))
          idx = text.indexOf(p, idx + 1)
        }
      }
      return { count: hits.length, samples: hits.slice(0, 3) }
    },
  },
  {
    key: 'consecutive_psychology',
    description: '连续 3 句以上以"他想/他感到/他觉得/他意识到"开头的心理描写',
    threshold: 0,  // 出现即违规
    detect(text) {
      const psychStarters = ['他想', '他感到', '他觉得', '他意识到', '她感到', '她觉得', '她意识到', '她心想']
      const sentences = text.split(/[。！？；\n]/).filter(s => s.trim().length > 0)
      let maxConsecutive = 0
      let currentRun = 0
      const samples: string[] = []
      for (const s of sentences) {
        const trimmed = s.trim()
        if (psychStarters.some(ps => trimmed.startsWith(ps))) {
          currentRun++
          if (currentRun > maxConsecutive) maxConsecutive = currentRun
          if (currentRun >= 3 && samples.length < 6) samples.push(trimmed.slice(0, 30))
        } else {
          currentRun = 0
        }
      }
      return { count: maxConsecutive >= 3 ? 1 : 0, samples: samples.slice(0, 3) }
    },
  },
  {
    key: 'monotonous_short_sentences',
    description: '连续 5 句以上长度 < 10 字的短句堆砌',
    threshold: 0,  // 出现即违规
    detect(text) {
      const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 0)
      let maxConsecutive = 0
      let currentRun = 0
      let runStart = 0
      const samples: string[] = []
      for (let i = 0; i < sentences.length; i++) {
        if (sentences[i].trim().length < 10) {
          currentRun++
          if (currentRun > maxConsecutive) maxConsecutive = currentRun
          if (currentRun >= 5 && currentRun <= 8) runStart = i - currentRun + 1
        } else {
          if (currentRun >= 5 && samples.length < 3) {
            samples.push(sentences.slice(runStart, i).join('。') + '。')
          }
          currentRun = 0
        }
      }
      return { count: maxConsecutive >= 5 ? 1 : 0, samples: samples.slice(0, 3) }
    },
  },
  {
    key: 'exclamation_abuse',
    description: '单段内感叹号 > 3 个',
    threshold: 0,  // 出现即违规
    detect(text) {
      const paragraphs = text.split(/\n\n+/)
      let violationCount = 0
      const samples: string[] = []
      for (const p of paragraphs) {
        const count = (p.match(/！/g) || []).length
        if (count > 3) {
          violationCount++
          if (samples.length < 3) samples.push(p.slice(0, 60) + '…')
        }
      }
      return { count: violationCount, samples }
    },
  },
  {
    key: 'paragraph_fragmentation',
    description: '连续 3 段以上每段只有 1 句话',
    threshold: 0,  // 出现即违规
    detect(text) {
      const paragraphs = text.split(/\n\n+/)
      let currentRun = 0
      let maxRun = 0
      const samples: string[] = []
      for (let i = 0; i < paragraphs.length; i++) {
        const sentencesInPara = paragraphs[i].split(/[。！？]/).filter(s => s.trim().length > 0).length
        if (sentencesInPara <= 1 && paragraphs[i].trim().length > 0) {
          currentRun++
          if (currentRun > maxRun) maxRun = currentRun
        } else {
          if (currentRun >= 3 && samples.length < 3) {
            samples.push(`连续 ${currentRun} 段单句: ` + paragraphs[Math.max(0, i - currentRun)].slice(0, 30) + '…')
          }
          currentRun = 0
        }
      }
      return { count: maxRun >= 3 ? 1 : 0, samples: samples.slice(0, 3) }
    },
  },
  {
    key: 'repeated_dialogue_structure',
    description: '连续 4 次以上"XX说/道/问/喊/叫："的重复对话结构',
    threshold: 0,  // 出现即违规
    detect(text) {
      const lines = text.split('\n')
      let currentRun = 0
      let maxRun = 0
      const samples: string[] = []
      for (const line of lines) {
        if (/\S[说问道喊叫]：/.test(line.trim())) {
          currentRun++
          if (currentRun > maxRun) maxRun = currentRun
        } else if (line.trim().length > 0) {
          if (currentRun >= 4 && samples.length < 3) {
            samples.push(`连续 ${currentRun} 次对话结构`)
          }
          currentRun = 0
        }
      }
      return { count: maxRun >= 4 ? 1 : 0, samples: samples.slice(0, 3) }
    },
  },
  {
    key: 'pov_jumping',
    description: '同一段内出现多个人物的心理描写（视角跳跃）',
    threshold: 0,  // 出现即违规
    detect(text) {
      const paragraphs = text.split(/\n\n+/)
      let violationCount = 0
      const samples: string[] = []
      for (const p of paragraphs) {
        const psychMatches = p.match(/[他她][感到觉想法暗自道说心想忖]/g)
        if (psychMatches && psychMatches.length >= 3) {
          violationCount++
          if (samples.length < 3) samples.push(p.slice(0, 60) + '…')
        }
      }
      return { count: violationCount, samples }
    },
  },
  {
    key: 'redundant_modifiers',
    description: '100 字内连续使用"的"超过 8 次',
    threshold: 0,  // 出现即违规
    detect(text) {
      // 按 100 字窗口滑动检测
      const windowSize = 100
      let violationCount = 0
      const samples: string[] = []
      for (let i = 0; i < text.length - windowSize; i += 50) {
        const window = text.slice(i, i + windowSize)
        const deCount = (window.match(/的/g) || []).length
        if (deCount > 8) {
          violationCount++
          if (samples.length < 3) samples.push(window.slice(0, 50) + '…')
        }
      }
      return { count: violationCount, samples: samples.slice(0, 3) }
    },
  },
  {
    key: 'wide_angle_lens',
    description: '使用广角/上帝视角概括性描写（"到处都是""众人纷纷""乱作一团""混战中"）',
    threshold: 0,  // 出现即违规
    detect(text) {
      const patterns = [
        '到处都是', '众人纷纷', '乱作一团', '惨叫声此起彼伏',
        '混战中', '混战', '战斗更加激烈', '战场上一片',
        '所有人都在', '人们纷纷', '大家纷纷',
      ]
      const hits: string[] = []
      for (const p of patterns) {
        let idx = text.indexOf(p)
        while (idx !== -1) {
          hits.push(text.slice(Math.max(0, idx - 15), idx + p.length + 15))
          idx = text.indexOf(p, idx + 1)
        }
      }
      return { count: hits.length, samples: hits.slice(0, 3) }
    },
  },
  {
    key: 'first_person_pov_violation',
    description: '第一人称视角越界：写了"我"视线之外/不可能知道的他人细节',
    threshold: 0,  // 出现即违规
    detect(text) {
      // 检测模式："他/她背对着我" + 对方面部表情/眼神描写
      const violationPatterns = [
        /他背对着\S{0,3}[，,][^。]{0,30}(?:嘴角|臉上|脸上|眼神|目光|笑|表情)/g,
        /她背对着\S{0,3}[，,][^。]{0,30}(?:嘴角|臉上|脸上|眼神|目光|笑|表情)/g,
        // "他的眼神变了一瞬，那个变化太快了，我没能捕捉到" — 既想写又假装没看到
        /(?:眼神|目光|表情).{0,10}(?:变了|闪过|掠过).{0,15}(?:没能|没有|无法)(?:捕捉|看清|注意)/g,
        // "他不知道的是…" — 上帝视角
        /(?:他|她)不知道的是/g,
        // "此刻的XX还不知道…" — 上帝视角
        /此刻的.{0,5}还不知道/g,
      ]
      let totalHits = 0
      const samples: string[] = []
      for (const re of violationPatterns) {
        const matches = text.match(re)
        if (matches) {
          totalHits += matches.length
          for (const m of matches.slice(0, 2)) {
            if (samples.length < 3) samples.push(m.slice(0, 60))
          }
        }
      }
      return { count: totalHits, samples: samples.slice(0, 3) }
    },
  },
  {
    key: 'idiom_emotion_summary',
    description: '使用成语概括/替代情绪描写（"大惊失色""追悔莫及""欣喜若狂"等）',
    threshold: 2,  // 超过2处即违规
    detect(text) {
      const idiomPatterns = [
        '大惊失色', '追悔莫及', '欣喜若狂', '惊慌失措', '目瞪口呆',
        '面如土色', '魂飞魄散', '胆战心惊', '心花怒放', '怒发冲冠',
        '悲痛欲绝', '泪如雨下', '忐忑不安', '坐立不安', '心神不宁',
        '毛骨悚然', '不寒而栗', '瞠目结舌', '哑口无言', '怒火中烧',
        '心如刀绞', '喜出望外', '垂头丧气', '趾高气扬', '咬牙切齿',
        '面红耳赤', '呆若木鸡', '手足无措', '六神无主', '气急败坏',
      ]
      const hits: string[] = []
      for (const idiom of idiomPatterns) {
        let idx = text.indexOf(idiom)
        while (idx !== -1) {
          hits.push(text.slice(Math.max(0, idx - 5), idx + idiom.length + 5))
          idx = text.indexOf(idiom, idx + 1)
        }
      }
      return { count: hits.length, samples: hits.slice(0, 5) }
    },
  },
  {
    key: 'rhetorical_question_chain',
    description: '连续 3 个以上反问句排比（"难道……？为什么……？到底……？"）',
    threshold: 0,  // 出现即违规
    detect(text) {
      // 将文本按句子分割，检测连续反问句
      const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 0)
      let maxConsecutive = 0
      let currentRun = 0
      const samples: string[] = []
      const rhetoricalMarkers = ['难道', '为什么', '到底', '凭什么', '怎么', '为何', '岂能', '怎会', '何不']
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i].trim()
        const isRhetorical = rhetoricalMarkers.some(m => s.includes(m)) && s.includes('？')
        if (isRhetorical) {
          currentRun++
          if (currentRun > maxConsecutive) maxConsecutive = currentRun
        } else {
          if (currentRun >= 3 && samples.length < 3) {
            const start = Math.max(0, i - currentRun)
            samples.push(sentences.slice(start, i).join('？') + '？')
          }
          currentRun = 0
        }
      }
      // Check end of text too
      if (currentRun >= 3 && samples.length < 3) {
        const start = sentences.length - currentRun
        samples.push(sentences.slice(start).join('？') + '？')
      }
      return { count: maxConsecutive >= 3 ? 1 : 0, samples }
    },
  },
  {
    key: 'golden_sentence_density',
    description: '金句密度过高：每 1000 字中脱离上下文的格言/哲理/抒情单句超过 2 处',
    threshold: 0,  // 出现即违规
    detect(text) {
      // 检测具有格言/哲理/抒情特征的独立短句
      // 模式："XX不是XX，而是XX" / "真正的XX，从来都XX" / "这世上最XX的XX"
      const goldenPatterns = [
        /不是.{1,10}，而是.{1,15}/g,
        /真正的.{1,8}，.{0,5}(?:从来|永远|一直|都)/g,
        /这世上最.{1,8}的.{1,8}/g,
        /有些.{1,8}，.{0,3}(?:一辈子|永远|再也)/g,
        /原来.{1,8}(?:从来|一直|根本)/g,
        /没有.{1,6}(?:比|胜过|能)/g,
        /最.{1,6}的不是.{1,10}，而是.{1,10}/g,
      ]
      let totalHits = 0
      const samples: string[] = []
      for (const re of goldenPatterns) {
        const matches = text.match(re)
        if (matches) {
          totalHits += matches.length
          for (const m of matches.slice(0, 2)) {
            if (samples.length < 5) samples.push(m.slice(0, 50))
          }
        }
      }
      // 按字数计算密度：每1000字超过2处即违规
      const charCount = text.replace(/\s/g, '').length
      const density = charCount > 0 ? totalHits / (charCount / 1000) : 0
      const exceeded = density > 2
      return {
        count: exceeded ? Math.ceil(totalHits) : 0,
        samples: exceeded ? samples.slice(0, 5) : [],
      }
    },
  },
]

// ── 公共 API ──

const CATEGORY_LABELS: Record<FatigueCategory, string> = {
  adverb: '副词滥用',
  verb: '心理动词/感知动词',
  adjective: '空洞形容词',
  connector: '连接词/翻译腔句式',
  bodyReaction: '身体反应模板',
  metaNarrative: '元叙事/AI套话',
  englishTone: '英文/翻译腔残留',
}

/**
 * 扫描文本中的疲劳词，返回所有命中的条目
 * 只返回 count > 0 的条目
 */
export function scanFatigueWords(text: string): FatigueWordHit[] {
  const hits: FatigueWordHit[] = []

  // 归一化省略号变体（... 和 … → ……），使模式库中的 …… 能匹配所有变体
  text = text.replace(/\.{3,}/g, '……').replace(/…/g, '……')

  for (const [catKey, entry] of Object.entries(FATIGUE_WORD_LIBRARY) as [FatigueCategory, FatigueWordEntry][]) {
    for (const word of entry.words) {
      // 用简单匹配计数
      let count = 0
      let idx = text.indexOf(word)
      while (idx !== -1) {
        count++
        idx = text.indexOf(word, idx + 1)
      }
      if (count > 0) {
        hits.push({
          word,
          category: catKey,
          count,
          threshold: entry.threshold,
          exceeded: count > entry.threshold,
        })
      }
    }
  }

  return hits
}

/**
 * 扫描句式违规
 */
export function scanSentencePatterns(text: string): PatternViolation[] {
  return SENTENCE_PATTERN_RULES.map(rule => {
    const { count, samples } = rule.detect(text)
    return {
      patternKey: rule.key,
      description: rule.description,
      count,
      threshold: rule.threshold,
      exceeded: count > rule.threshold,
      samples,
    }
  })
}

/**
 * 生成完整的 AI 痕迹检测报告
 * @param text 待检测文本
 * @returns 包含所有检测结果和建议的报告对象
 */
export function generateAntiAiReport(text: string): AntiAiReport {
  const fatigueWordHits = scanFatigueWords(text)
  const patternViolations = scanSentencePatterns(text)

  const totalFatigueWordExceeded = fatigueWordHits.filter(h => h.exceeded).length
  const totalPatternExceeded = patternViolations.filter(v => v.exceeded).length

  // 生成改进建议
  const suggestions: string[] = []

  // 按类别统计超阈值疲劳词
  const exceededByCategory = new Map<FatigueCategory, FatigueWordHit[]>()
  for (const hit of fatigueWordHits) {
    if (hit.exceeded) {
      const list = exceededByCategory.get(hit.category) || []
      list.push(hit)
      exceededByCategory.set(hit.category, list)
    }
  }

  for (const [cat, hits] of exceededByCategory) {
    const wordList = hits.map(h => `"${h.word}"(${h.count}次)`).join('、')
    suggestions.push(
      `【${CATEGORY_LABELS[cat]}】出现频率过高：${wordList}。建议：${
        cat === 'adverb' ? '删除模糊副词，用具体动作和画面替代'
        : cat === 'verb' ? '用外部动作和外化行为替代直接心理报告'
        : cat === 'adjective' ? '写具体是什么让人感到"强大/恐怖"，不写抽象形容词'
        : cat === 'connector' ? '删除多余连接词，让句子直接碰撞产生张力'
        : cat === 'bodyReaction' ? '换用更独特的身体反应，避免模板化表达'
        : cat === 'metaNarrative' ? '删除所有元叙事，直接从场景切入'
        : '用中文口语化表达替代翻译腔'
      }。`,
    )
  }

  // 句式违规建议
  for (const v of patternViolations) {
    if (v.exceeded) {
      suggestions.push(`【句式违规：${v.description}】检测到 ${v.count} 处。请检查并修正对应段落。`)
    }
  }

  // 如果完全通过
  if (suggestions.length === 0) {
    suggestions.push('✓ 未检测到明显的 AI 疲劳词和句式违规，文本自然度良好。')
  }

  return {
    fatigueWordHits,
    patternViolations,
    totalFatigueWordExceeded,
    totalPatternExceeded,
    passed: totalFatigueWordExceeded === 0 && totalPatternExceeded === 0,
    suggestions,
  }
}
