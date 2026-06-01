/**
 * 平台发布输出模块
 *
 * 按 14 个平台各自的格式要求输出内容
 * 支持：格式化输出 / 剪贴板复制 / 平台 URL 跳转
 */

export interface PlatformOutput {
  title: string
  intro?: string
  tags: string[]
  content: string
  chapters?: { title: string; content: string }[]
}

// ── 平台格式规则 ──

interface FormatRule {
  tagPrefix: '#' | ''        // 标签是否带 #
  chapterStyle: 'titles' | 'none'  // 是否展示章节标题
  includeIntro: boolean
  introLabel: string
  emojiDecorate: boolean
  interactGuide: boolean      // 结尾互动引导（小红书特有）
  firstPersonHint: boolean    // 第一人称提示（头条特有）
}

const FORMAT_RULES: Record<string, FormatRule> = {
  zhihu_salt:      { tagPrefix: '#', chapterStyle: 'titles', includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  fanqie:           { tagPrefix: '#', chapterStyle: 'titles', includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  qimao:            { tagPrefix: '#', chapterStyle: 'titles', includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  toutiao:          { tagPrefix: '#', chapterStyle: 'none',  includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: true },
  weixin_mp:        { tagPrefix: '',  chapterStyle: 'none',  includeIntro: false, introLabel: '', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  xiaohongshu:      { tagPrefix: '#', chapterStyle: 'none',  includeIntro: false, introLabel: '', emojiDecorate: true, interactGuide: true, firstPersonHint: false },
  qidian:           { tagPrefix: '',  chapterStyle: 'titles', includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  jjwxc:            { tagPrefix: '',  chapterStyle: 'titles', includeIntro: true, introLabel: '文案', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  faloo:            { tagPrefix: '',  chapterStyle: 'titles', includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  ciweimao:         { tagPrefix: '#', chapterStyle: 'titles', includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  douban_read:      { tagPrefix: '',  chapterStyle: 'none',  includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  everyday_story:   { tagPrefix: '#', chapterStyle: 'none',  includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  jianshu:          { tagPrefix: '',  chapterStyle: 'none',  includeIntro: false, introLabel: '', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
  lofter:           { tagPrefix: '#', chapterStyle: 'none',  includeIntro: false, introLabel: '', emojiDecorate: false, interactGuide: false, firstPersonHint: false },
}

const DEFAULT_RULE: FormatRule = { tagPrefix: '#', chapterStyle: 'titles', includeIntro: true, introLabel: '简介', emojiDecorate: false, interactGuide: false, firstPersonHint: false }

// ── 平台投稿 URL ──

const PLATFORM_URLS: Record<string, string> = {
  zhihu_salt: 'https://www.zhihu.com/creator/writing',
  fanqie: 'https://fanqienovel.com/writer/zone',
  qimao: 'https://www.qimao.com/author',
  toutiao: 'https://mp.toutiao.com/',
  weixin_mp: 'https://mp.weixin.qq.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/',
  qidian: 'https://write.qidian.com/',
  jjwxc: 'https://www.jjwxc.net/',
  faloo: 'https://b.faloo.com/',
  ciweimao: 'https://www.ciweimao.com/',
  douban_read: 'https://read.douban.com/',
  everyday_story: 'https://www.dudiandian.com/',
  jianshu: 'https://www.jianshu.com/',
  lofter: 'https://www.lofter.com/',
}

// ── 格式化 ──

export function formatForPlatform(output: PlatformOutput, platformId: string): string {
  const rule = FORMAT_RULES[platformId] || DEFAULT_RULE
  const parts: string[] = []

  // 标题
  if (rule.emojiDecorate) {
    parts.push(`📖 ${output.title}`)
  } else if (rule.firstPersonHint) {
    const firstPersonTitle = output.title.startsWith('我') ? output.title : `我来讲个真事：${output.title}`
    parts.push(firstPersonTitle)
  } else {
    parts.push(output.title)
  }

  // 简介
  if (rule.includeIntro && output.intro) {
    parts.push(`\n【${rule.introLabel}】${output.intro}`)
  }

  // 标签
  if (output.tags.length > 0) {
    const prefix = rule.tagPrefix
    const tagLine = output.tags.map(t => `${prefix}${t}`).join(' ')
    parts.push(`\n${tagLine}`)
  }

  // 正文
  parts.push('\n' + '─'.repeat(40))

  if (rule.chapterStyle === 'titles' && output.chapters && output.chapters.length > 0) {
    for (const ch of output.chapters) {
      parts.push(`\n[${ch.title}]\n${ch.content}`)
    }
  } else {
    parts.push('\n' + output.content)
  }

  // 互动引导（小红书）
  if (rule.interactGuide) {
    parts.push('\n\n—'.repeat(10))
    parts.push('姐妹们怎么看？评论区聊聊 👇')
  }

  // 头条第一人称收尾
  if (rule.firstPersonHint) {
    parts.push('\n\n（本文根据真实经历改编，人物为化名）')
  }

  return parts.join('\n')
}

// ── 剪贴板复制文本 ──

export function generateCopyText(output: PlatformOutput, platformId: string): string {
  const formatted = formatForPlatform(output, platformId)
  // 清除所有可能残留的 Markdown 符号
  return formatted
    .replace(/\*\*/g, '')
    .replace(/##/g, '')
    .replace(/---/g, '─')
}

// ── 平台 URL ──

export function getPlatformUrl(platformId: string): string {
  return PLATFORM_URLS[platformId] || ''
}

/** 获取平台信息，供 UI 展示 */
export function getPlatformFormatInfo(platformId: string): FormatRule {
  return FORMAT_RULES[platformId] || DEFAULT_RULE
}
