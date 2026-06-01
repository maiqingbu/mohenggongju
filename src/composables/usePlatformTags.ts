/**
 * 平台标签系统：验证 + Prompt 生成
 *
 * v2: 男女频分离标签体系 + 预设爽点/元素/情绪
 */

import { getPlatform } from './usePlatformData'
import { COMPACT_CONSTITUTION } from '../agents/shared/compactConstitution'

export interface TagSet {
  platform: string
  channel: string
  genre: string
  subgenre: string[]
  elements: string[]
  emotion: string[]
  pov: string
  style: string
  length: string
  cool_points: string[]
  taboo: string[]
}

// ── 频道标签 ──

export const CHANNEL_LABELS: Record<string, string> = {
  male: '♂ 男频', female: '♀ 女频',
}

// ══════════════════════════════════════════════
//  题材（按频道分离）
// ══════════════════════════════════════════════

export const MALE_GENRES: Record<string, string> = {
  urban: '都市',
  fantasy: '玄幻',
  xianxia: '仙侠',
  scifi: '科幻',
  history: '历史',
  suspense: '悬疑',
  game: '游戏',
  brain_hole: '脑洞',
  anime_light_novel: '轻小说',
  military: '军事',
}

export const FEMALE_GENRES: Record<string, string> = {
  modern_romance: '现言',
  ancient_romance: '古言',
  fantasy_romance: '幻言',
  urban: '都市',
  period_drama: '年代',
  campus: '校园',
  suspense: '悬疑',
  family: '家庭',
  farming: '种田',
  book_transmigration: '穿书',
  quick_transmigration: '快穿',
  rebirth: '重生',
  danmei: '耽美',
  yuri: '百合',
  fanfic: '同人',
}

export const UNISEX_GENRES: Record<string, string> = {
  literary_short: '文学短篇',
  realistic: '现实主义',
  anecdote: '奇闻轶事',
  horror: '恐怖',
}

/** 合并后的全量题材表（向后兼容 prompt 构建） */
export const GENRE_LABELS: Record<string, string> = {
  ...MALE_GENRES,
  ...FEMALE_GENRES,
  ...UNISEX_GENRES,
}

/** 按频道返回可选题材 */
export function getGenresForChannel(channel: 'male' | 'female'): Record<string, string> {
  return channel === 'male'
    ? { ...MALE_GENRES, ...UNISEX_GENRES }
    : { ...FEMALE_GENRES, ...UNISEX_GENRES }
}

// ══════════════════════════════════════════════
//  子标签（按题材分组，频道过滤）
// ══════════════════════════════════════════════

/** 男频子标签：题材 → 子标签列表 */
export const MALE_SUBGENRES: Record<string, string[]> = {
  urban: ['都市修真', '都市高武', '战神归来', '神医下山', '隐藏身份', '赘婿逆袭', '商战博弈', '直播打脸', '小镇逆袭'],
  fantasy: ['东方玄幻', '升级打怪', '无敌流', '签到系统', '抽奖系统', '重生宝箱', '属性掠夺', '全民觉醒', '数据面板'],
  xianxia: ['修仙问道', '宗门经营', '凡人流', '丹道器修', '剑修', '散仙', '血脉觉醒'],
  scifi: ['末世求生', '赛博朋克', '星际文明', '机甲', '废土重建', 'AI觉醒'],
  history: ['架空历史', '历史穿越', '宫廷权谋', '三国争霸', '明末风云', '抗战谍战'],
  suspense: ['诡异复苏', '灵异探险', '盗墓笔记', '推理破案', '无限流', '克苏鲁'],
  game: ['网游竞技', '虚拟现实', '塔防经营', '数据游戏', '领主种田', '全民转职'],
  brain_hole: ['诸天万界', '聊天群', '系统流', '反套路', '信息差', '幕后黑手', '规则怪谈'],
  anime_light_novel: ['异世界', '校园', '日常', '萌系后宫', '综漫同人', '转生'],
  military: ['军旅生涯', '特种兵', '抗战', '谍战', '架空军武'],
  literary_short: ['纯文学', '意识流', '白描'],
  realistic: ['现实题材', '社会议题', '真实事件改编'],
  anecdote: ['奇闻怪谈', '乡土奇闻', '怪谈'],
  horror: ['恐怖惊悚', '灵异', '心理恐怖'],
}

/** 女频子标签：题材 → 子标签列表 */
export const FEMALE_SUBGENRES: Record<string, string[]> = {
  modern_romance: ['霸总甜宠', '追妻火葬场', '闪婚蜜爱', '先婚后爱', '豪门恩怨', '隐婚甜文', '双向暗恋', '破镜重圆'],
  ancient_romance: ['宫斗宅斗', '将军夫人', '重生复仇', '穿越庶女', '种田经商', '古言探案', '将军甜宠', '亡国公主'],
  fantasy_romance: ['修仙言情', '异世界恋爱', '末世甜文', '女尊天下', '玄幻言情', '穿越修真'],
  urban: ['职场逆袭', '娱乐圈', '都市丽人', '中年逆袭', '独立女性', '创业奋斗'],
  period_drama: ['年代文', '军嫂文', '知青下乡', '改革开放', '七零八零', '怀旧温情'],
  campus: ['青春甜宠', '学霸恋爱', '暗恋成真', '校园成长', '毕业季'],
  suspense: ['古言探案', '现代推理', '灵异奇谭', '女性悬疑', '密室逃脱'],
  family: ['家庭伦理', '婆媳关系', '育儿日常', '家族兴衰', '亲情治愈'],
  farming: ['古代种田', '现代种田', '空间种田', '经营致富', '田园生活'],
  book_transmigration: ['穿书自救', '穿书逆袭', '穿书炮灰', '穿书反派', '穿书女配'],
  quick_transmigration: ['任务快穿', '逆袭快穿', '拯救快穿', '反派快穿', '系统快穿'],
  rebirth: ['重生复仇', '重生逆袭', '重生报恩', '重生补偿', '重生经商'],
  danmei: ['纯爱', '虐恋', '娱乐圈', '古代', '校园', '破镜重圆'],
  yuri: ['校园百合', '职场百合', '古风百合', '奇幻百合'],
  fanfic: ['综漫同人', '影视同人', '游戏同人', '真人同人'],
  literary_short: ['纯文学', '意识流', '白描'],
  realistic: ['现实题材', '社会议题', '真实事件改编'],
  anecdote: ['奇闻怪谈', '乡土奇闻', '怪谈'],
  horror: ['恐怖惊悚', '灵异', '心理恐怖'],
}

/** 全量子标签查找表（key = 子标签中文名，用于 prompt 翻译兼容） */
export const SUBGENRE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const subs of Object.values(MALE_SUBGENRES)) for (const s of subs) map[s] = s
  for (const subs of Object.values(FEMALE_SUBGENRES)) for (const s of subs) if (!map[s]) map[s] = s
  return map
})()

/** 按频道 + 题材返回子标签列表 */
export function getSubgenresForGenre(channel: 'male' | 'female', genre: string): string[] {
  const table = channel === 'male' ? MALE_SUBGENRES : FEMALE_SUBGENRES
  return table[genre] || []
}

// ══════════════════════════════════════════════
//  爽点预设（按频道分离）
// ══════════════════════════════════════════════

export interface PresetCategory {
  label: string
  items: string[]
}

export const MALE_COOL_POINTS: PresetCategory[] = [
  { label: '打脸逆袭', items: ['退婚打脸', '装逼打脸', '扮猪吃虎', '废物逆袭', '底层翻盘'] },
  { label: '实力碾压', items: ['无敌碾压', '越级挑战', '一招制敌', '天赋碾压', '血脉压制'] },
  { label: '身份揭秘', items: ['隐藏身份', '大佬回归', '真少爷', '幕后黑手', '全知全能'] },
  { label: '收获获得', items: ['金手指', '奇遇传承', '宝物获得', '神级技能', '抽奖暴击'] },
  { label: '势力经营', items: ['建立势力', '收小弟', '商会崛起', '领地建设', '文明升级'] },
  { label: '热血燃点', items: ['以一敌百', '力挽狂澜', '绝地反击', '燃爆全场', '战场封神'] },
]

export const FEMALE_COOL_POINTS: PresetCategory[] = [
  { label: '甜宠撒糖', items: ['全员宠我', '霸道宠溺', '暗恋成真', '先婚后爱', '日常撒糖'] },
  { label: '复仇虐渣', items: ['打脸白莲', '虐渣男', '手撕绿茶', '复仇翻盘', '前世今生'] },
  { label: '身份逆袭', items: ['真假千金', '隐藏大佬', '豪门认亲', '逆天改命', '女强崛起'] },
  { label: '事业高光', items: ['事业逆袭', '才华惊艳', '全场最美', '商业帝国', '独立自强'] },
  { label: '感情虐点', items: ['追妻火葬场', '替身文学', '虐恋情深', '错过重逢', '双向暗恋'] },
  { label: '人设魅力', items: ['天才少女', '万人迷', '团宠', '病娇美人', '清冷仙女'] },
]

export function getCoolPointsForChannel(channel: 'male' | 'female'): PresetCategory[] {
  return channel === 'male' ? MALE_COOL_POINTS : FEMALE_COOL_POINTS
}

// ══════════════════════════════════════════════
//  核心元素预设（按频道分离）
// ══════════════════════════════════════════════

export const MALE_ELEMENTS: PresetCategory[] = [
  { label: '世界观', items: ['灵气复苏', '异能觉醒', '数据化世界', '游戏面板', '副本系统'] },
  { label: '能力体系', items: ['修炼等级', '血脉天赋', '异能分类', '科技树', '武道境界'] },
  { label: '金手指', items: ['系统', '签到', '抽奖', '重生记忆', '空间', '聊天群', '模拟器'] },
  { label: '场景', items: ['大学', '公司', '末世废土', '宗门', '星际', '地下城', '竞技场'] },
]

export const FEMALE_ELEMENTS: PresetCategory[] = [
  { label: '关系', items: ['青梅竹马', '契约关系', '主仆', '师徒', '联姻', '替身'] },
  { label: '身份', items: ['千金小姐', '庶女', '亡国公主', '女将军', '神医', '商女'] },
  { label: '冲突', items: ['宅斗', '宫斗', '家族内斗', '商战', '皇位争夺', '身世之谜'] },
  { label: '道具', items: ['空间', '灵泉', '系统商城', '前世记忆', '读心术', '预知梦'] },
]

export function getElementsForChannel(channel: 'male' | 'female'): PresetCategory[] {
  return channel === 'male' ? MALE_ELEMENTS : FEMALE_ELEMENTS
}

// ══════════════════════════════════════════════
//  情绪走向预设（按频道分离）
// ══════════════════════════════════════════════

export const MALE_EMOTION_PRESETS: string[] = [
  '热血燃向', '逆袭打脸', '爽→更爽', '低谷→逆袭→封神', '全程高爽',
  '慢热成长', '暗黑反转', '绝地反击', '轻松搞笑', '史诗悲壮',
]

export const FEMALE_EMOTION_PRESETS: string[] = [
  '甜→虐→爽', '爽→虐→甜', '全程甜宠', '虐到底', '酸涩向',
  '先婚后爱', '破镜重圆', '暗恋成真', '虐恋情深', '轻松日常',
]

export function getEmotionPresetsForChannel(channel: 'male' | 'female'): string[] {
  return channel === 'male' ? MALE_EMOTION_PRESETS : FEMALE_EMOTION_PRESETS
}

// ══════════════════════════════════════════════
//  验证 + Prompt 构建
// ══════════════════════════════════════════════

const REQUIRED_FIELDS: { key: keyof TagSet; label: string; type: 'string' | 'array' }[] = [
  { key: 'platform', label: '平台', type: 'string' },
  { key: 'channel', label: '频道', type: 'string' },
  { key: 'genre', label: '题材', type: 'string' },
  { key: 'pov', label: '人称视角', type: 'string' },
  { key: 'style', label: '写作风格', type: 'string' },
  { key: 'length', label: '字数档位', type: 'string' },
]

export function validateTagSet(tags: TagSet): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (const field of REQUIRED_FIELDS) {
    if (field.type === 'string' && !tags[field.key]) errors.push(`${field.label}必选`)
    if (field.type === 'array' && (tags[field.key] as unknown[]).length === 0) errors.push(`${field.label}必选`)
  }
  if (tags.subgenre.length === 0) errors.push('至少选一个子标签')
  if (tags.emotion.length === 0) errors.push('至少选一个情绪标签')
  return { valid: errors.length === 0, errors }
}

export function buildGenerationPrompt(tags: TagSet): string {
  const parts: string[] = [
    `【平台】${tags.platform}`,
    `【频道】${tags.channel}`,
    `【题材】${tags.genre}`,
    `【子标签】${tags.subgenre.join('、')}`,
    `【核心元素】${tags.elements.join('、')}`,
    `【情绪走向】${tags.emotion.join(' → ')}`,
    `【人称】${tags.pov}`,
    `【风格】${tags.style}`,
    `【字数】${tags.length}`,
    `【爽点】${tags.cool_points.join('、')}`,
    `【禁忌】${tags.taboo.join('、')}`,
  ]
  return parts.join('\n')
}

export function getPlatformLabel(platformId: string): string {
  const p = getPlatform(platformId)
  return p?.name || platformId
}

// ══════════════════════════════════════════════
//  分层系统创作指令
// ══════════════════════════════════════════════

/**
 * 构建短篇分层系统创作指令
 *
 * 分层架构（与长篇立项对齐）：
 *   Layer 0 — 创作宪法（绝对约束，最高优先级）
 *   Layer 1 — 平台角色卡（风格基底、读者画像、结构要求、禁忌）
 *   Layer 2 — 任务标签（题材/子标签/元素/情绪/爽点）
 *   Layer 3 — 写作规范（视角/风格/字数/短篇结构）
 */
export function buildLayeredSystemPrompt(
  platformId: string,
  tagSet: TagSet,
  wordCount: number,
  extra?: string,
): string {
  const p = getPlatform(platformId)
  const platformName = p?.name || platformId

  const layers: string[] = []

  // ── Layer 0: 创作宪法（绝对约束）──
  layers.push(`【Layer 0 — 创作宪法】\n\n${COMPACT_CONSTITUTION}`)

  // ── Layer 1: 平台角色卡 ──
  if (p?.structure && p?.audience) {
    const audience = p.audience
    const layer1 = [
      `【Layer 1 — 平台角色卡：${platformName}】`,
      '',
      '## 读者画像',
      `- 性别：${audience.gender || '未知'}`,
      `- 年龄：${audience.age || '未知'}`,
      `- 城市等级：${audience.tier || '未知'}`,
      `- 付费意愿：${audience.payment_will || '未知'}`,
      '',
      '## 平台风格规则（严格遵守）',
      ...(p.style_rules || []).map(r => `- ${r}`),
      '',
      '## 结构要求',
      `- 开篇：${p.structure.opening || '无特殊要求'}`,
      `- 中段：${p.structure.middle || '无特殊要求'}`,
      `- 结尾：${p.structure.ending || '无特殊要求'}`,
      '',
      `## 节奏要求：${p.rhythm || '无特殊要求'}`,
      '',
      '## 绝对禁忌',
      ...(p.taboo || []).map((t: string) => `- 禁止：${t}`),
    ]
    if (p.hot_topics_2026?.length) {
      layer1.push('', '## 当前热门主题（可参考）', ...p.hot_topics_2026.map((t: string) => `- ${t}`))
    }
    if (p.iconic_works?.length) {
      layer1.push('', '## 标杆作品（风格参考）', ...p.iconic_works.map((t: string) => `- ${t}`))
    }
    layers.push(layer1.join('\n'))
  }

  // ── Layer 2: 任务标签 ──
  const layer2 = [
    `【Layer 2 — 任务标签】`,
    '',
    `- 频道：${CHANNEL_LABELS[tagSet.channel] || tagSet.channel}`,
    `- 题材：${GENRE_LABELS[tagSet.genre] || tagSet.genre}`,
    `- 子标签：${tagSet.subgenre.join('、') || '无'}`,
    `- 核心元素：${tagSet.elements.join('、') || '无'}`,
    `- 情绪走向：${tagSet.emotion.join(' → ') || '无'}`,
    `- 爽点：${tagSet.cool_points.join('、') || '无'}`,
    `- 禁忌：${tagSet.taboo.join('、') || '无'}`,
  ].join('\n')
  layers.push(layer2)

  // ── Layer 3: 写作规范 ──
  const povMap: Record<string, string> = {
    first_person: '第一人称（"我"视角，代入感强）',
    third_person_limited: '第三人称限知（跟随主角视角）',
    third_person_omniscient: '全知视角（上帝视角）',
  }
  const layer3 = [
    `【Layer 3 — 写作规范】`,
    '',
    `- 叙事视角：${povMap[tagSet.pov] || tagSet.pov}`,
    `- 写作风格：${tagSet.style || '默认'}`,
    `- 目标字数：${wordCount}字（±15%）`,
    `- 字数档位：${tagSet.length}`,
    '',
    '## 短篇结构要求',
    '- 一次性输出完整故事，不分章节',
    '- 钩子开头（前200字）：用冲突/悬念/反常规画面抓住读者',
    '- 中段推进：至少1次转折或反转',
    '- 结尾强收束：给读者满足感或余韵',
    '',
    '## 输出格式',
    '- 直接输出纯文本正文，不要 JSON 包裹，不要章节标题',
    '- 段落之间用空行分隔',
  ].join('\n')
  layers.push(layer3)

  if (extra?.trim()) {
    layers.push(`【补充要求】\n${extra}`)
  }

  return layers.join('\n\n---\n\n')
}

export function getDefaultTags(platform: string, channel: string): Partial<TagSet> {
  return {
    platform,
    channel,
    subgenre: [],
    elements: [],
    emotion: [],
    cool_points: [],
    taboo: [],
    pov: channel === 'female' ? 'first_person' : 'third_person_limited',
    style: platform === 'zhihu_salt' ? '知乎体' : '番茄风',
    length: 'short',
  }
}
