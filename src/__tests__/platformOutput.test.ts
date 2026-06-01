import { describe, it, expect } from 'vitest'
import { formatForPlatform, getPlatformUrl, generateCopyText, type PlatformOutput } from '../composables/usePlatformOutput'

const sampleOutput: PlatformOutput = {
  title: '重生回到离婚那天，我笑着签了字',
  intro: '结婚三年，他递来离婚协议。上一世我哭过求过，这一世我只笑着说了一个字。',
  tags: ['重生', '追妻火葬场', '女频现言', '虐恋', '打脸'],
  content: '我嫁给陆景行的第三年，他递给我一份离婚协议。\n\n那天是他生日。我做了六个菜，等他到晚上十点。',
  chapters: [
    { title: '第一章 重生', content: '正文内容...' },
    { title: '第二章 反击', content: '正文内容...' },
  ],
}

describe('formatForPlatform - 按平台格式化', () => {
  it('知乎盐选格式：标题+简介+标签#号+正文', () => {
    const result = formatForPlatform(sampleOutput, 'zhihu_salt')
    expect(result).toContain('重生回到离婚那天')
    expect(result).toContain('结婚三年')
    expect(result).toContain('#重生')
    expect(result).toContain('#追妻火葬场')
  })

  it('微信公众号格式：无#号标签+不分章', () => {
    const result = formatForPlatform(sampleOutput, 'weixin_mp')
    expect(result).not.toContain('#重生') // 公众号标签不用 #
    expect(result).toContain('重生')       // 标签仍出现
    expect(result).not.toContain('第一章')  // 公众号不分章
  })

  it('小红书格式：多#标签+emoji+互动引导', () => {
    const result = formatForPlatform(sampleOutput, 'xiaohongshu')
    expect(result).toContain('#')
    expect(result).toContain('姐妹们')  // 小红书特有引导语
  })

  it('番茄小说格式：分章节标题', () => {
    const result = formatForPlatform(sampleOutput, 'fanqie')
    expect(result).toContain('第一章 重生')
    expect(result).toContain('第二章 反击')
  })

  it('LOFTER格式：无章节+多#标签', () => {
    const result = formatForPlatform(sampleOutput, 'lofter')
    expect(result).not.toContain('第一章')
    expect(result.match(/#/g)!.length).toBeGreaterThanOrEqual(sampleOutput.tags.length)
  })

  it('头条格式：标题党风格+第一人称提示', () => {
    const result = formatForPlatform(sampleOutput, 'toutiao')
    expect(result).toContain('我')
  })

  it('未知平台应使用通用格式', () => {
    const result = formatForPlatform(sampleOutput, 'unknown_platform')
    expect(result).toContain('重生回到离婚那天')
    expect(result).toContain('正文内容')
  })

  it('无章节时不应报错', () => {
    const noChapters = { ...sampleOutput, chapters: undefined }
    expect(() => formatForPlatform(noChapters, 'fanqie')).not.toThrow()
  })
})

describe('getPlatformUrl', () => {
  it('应返回已知平台的投稿/发布 URL', () => {
    expect(getPlatformUrl('zhihu_salt')).toContain('zhihu.com')
    expect(getPlatformUrl('fanqie')).toContain('fanqienovel.com')
    expect(getPlatformUrl('qidian')).toContain('qidian.com')
  })

  it('未知平台应返回空', () => {
    expect(getPlatformUrl('unknown')).toBe('')
  })
})

describe('generateCopyText', () => {
  it('应生成适合复制到剪贴板的纯文本', () => {
    const text = generateCopyText(sampleOutput, 'zhihu_salt')
    expect(text).toContain('重生回到离婚那天')
    expect(text.length).toBeGreaterThan(100)
  })

  it('内容不应包含 HTML 或 Markdown 符号', () => {
    const text = generateCopyText(sampleOutput, 'weixin_mp')
    expect(text).not.toContain('**')
    expect(text).not.toContain('<p>')
    expect(text).not.toContain('##')
  })
})
