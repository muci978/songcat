/**
 * 拼音首字母预计算（设计 §5.1）。
 * 在歌曲创建/更新时由 main 进程调用，结果写入 songs.title_pinyin_initial，
 * 避免运行时全文拼音转换。
 *
 * 规则：
 *   - 中文字符：取其拼音首字母（大写），逐字拼接。如「简单爱」→「JDA」。
 *   - 拉丁字母：按"单词"取首字母（连续字母段的第一位），如「Yesterday」→「Y」。
 *   - 数字：按"数字段"取首位。
 *   - 空格 / 标点：作为分隔符，重置单词状态。
 *   - 多音字取 pinyin-pro 默认读音。
 */
import { pinyin } from 'pinyin-pro'

const CJK = /[㐀-鿿豈-﫿]/
const LATIN = /[a-zA-Z]/
const DIGIT = /[0-9]/

export function computeTitleInitial(title: string | null | undefined): string {
  if (!title) return ''
  let result = ''
  let inLatinWord = false
  let inDigitRun = false

  for (const ch of Array.from(title)) {
    if (CJK.test(ch)) {
      const py = pinyin(ch, { pattern: 'first', toneType: 'none' })
      const f = typeof py === 'string' ? py.replace(/[^a-zA-Z]/g, '') : ''
      if (f) result += f.toUpperCase()
      inLatinWord = false
      inDigitRun = false
    } else if (LATIN.test(ch)) {
      if (!inLatinWord) result += ch.toUpperCase()
      inLatinWord = true
      inDigitRun = false
    } else if (DIGIT.test(ch)) {
      if (!inDigitRun) result += ch
      inDigitRun = true
      inLatinWord = false
    } else {
      inLatinWord = false
      inDigitRun = false
    }
  }

  return result
}
