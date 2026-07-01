/**
 * 文本规范化：artist_normalized 用于搜索与艺人聚合统计（设计 §5.1、§12）。
 * 规则：小写、去除常见前缀 "the"、压缩空白、去除标点。中文保留原字。
 */

export function normalizeArtist(input: string | null | undefined): string | null {
  if (!input) return null
  let s = input.trim().toLowerCase()
  // 去除前缀 "the "（英文常见冠词，归一艺人分组）
  s = s.replace(/^the\s+/, '')
  // 全角/半角空白统一并压缩
  s = s.replace(/[　\s]+/g, ' ')
  // 去除分隔类标点
  s = s.replace(/[/\\,&!'"().]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s || null
}

export function normalizeTitle(input: string | null | undefined): string {
  if (!input) return ''
  return input.trim().replace(/[　\s]+/g, ' ').trim()
}

/** 取标题第一个有意义字符的"首字母组"用于 A-Z 分组导航 */
export function titleGroupKey(
  title: string,
  pinyinInitial: string | null
): string {
  if (pinyinInitial && pinyinInitial.length > 0) return pinyinInitial[0]!.toUpperCase()
  const t = title.trim()
  return t ? t[0]!.toUpperCase() : '#'
}
