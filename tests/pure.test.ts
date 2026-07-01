import { describe, it, expect } from 'vitest'
import { computeTitleInitial } from '@main/utils/pinyin'
import { normalizeArtist, normalizeTitle } from '@main/utils/normalize'
import {
  formatDuration,
  localDateKey,
  localMonthKey,
  dateKeyRange
} from '@main/utils/time'
import { isWithin, safeJoin } from '@main/utils/path'
import {
  classifyScoreFile,
  extensionFor,
  inferTypeByExt,
  isImageMime,
  isPdfMime
} from '@main/utils/mime'
import { isHttpUrl, hostOf } from '@main/utils/url'
import { aggregatePractice } from '@main/utils/aggregate'

describe('computeTitleInitial（拼音首字母，设计 §5.1）', () => {
  it('中文逐字取拼音首字母', () => {
    expect(computeTitleInitial('简单爱')).toBe('JDA')
    expect(computeTitleInitial('青花瓷')).toBe('QHC')
  })
  it('拉丁按单词首字母', () => {
    expect(computeTitleInitial('Yesterday')).toBe('Y')
    expect(computeTitleInitial('Yesterday Once More')).toBe('YOM')
  })
  it('中英混合', () => {
    expect(computeTitleInitial('简单爱 Sweet')).toBe('JDAS')
  })
  it('含数字与标点', () => {
    expect(computeTitleInitial('Canon in D 2')).toBe('CID2')
  })
  it('空值安全', () => {
    expect(computeTitleInitial('')).toBe('')
    expect(computeTitleInitial(null)).toBe('')
  })
})

describe('normalizeArtist', () => {
  it('小写、去前缀 the、压缩空白、去标点', () => {
    expect(normalizeArtist('The Beatles')).toBe('beatles')
    expect(normalizeArtist('  Jay  Chou ')).toBe('jay chou')
    expect(normalizeArtist('A/B,C&D')).toBe('a b c d')
  })
  it('空返回 null', () => {
    expect(normalizeArtist(null)).toBeNull()
    expect(normalizeArtist('')).toBeNull()
    expect(normalizeArtist('   ')).toBeNull()
  })
  it('normalizeTitle 压缩空白', () => {
    expect(normalizeTitle('  Hello   World  ')).toBe('Hello World')
  })
})

describe('time 工具', () => {
  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(60)).toBe('1m')
    expect(formatDuration(90)).toBe('1m')
    expect(formatDuration(3600)).toBe('1h 0m')
    expect(formatDuration(3900)).toBe('1h 5m')
  })
  it('localDateKey / localMonthKey 用本地时区', () => {
    const d = new Date(2026, 5, 15, 10, 30) // 2026-06-15 本地
    expect(localDateKey(d.toISOString())).toBe('2026-06-15')
    expect(localMonthKey(d.toISOString())).toBe('2026-06')
  })
  it('dateKeyRange 倒序含起止', () => {
    const start = new Date(2026, 5, 13)
    const end = new Date(2026, 5, 15)
    expect(dateKeyRange(start, end)).toEqual(['2026-06-15', '2026-06-14', '2026-06-13'])
  })
})

describe('path 安全（设计 §17.4）', () => {
  it('isWithin', () => {
    expect(isWithin('/a/b', '/a/b/c')).toBe(true)
    expect(isWithin('/a/b', '/a/b/c/d')).toBe(true)
    expect(isWithin('/a/b', '/a/c')).toBe(false)
    expect(isWithin('/a/b', '/a/b')).toBe(false) // 自身不算 within
  })
  it('safeJoin 拒绝 .. 越界', () => {
    expect(() => safeJoin('/a/b', '../c')).toThrow()
    expect(() => safeJoin('/a/b', 'c/../../../d')).toThrow()
  })
  it('safeJoin 正常拼接', () => {
    expect(safeJoin('/a/b', 'c', 'd')).toBe('/a/b/c/d')
  })
})

describe('mime 工具', () => {
  it('isPdfMime / isImageMime', () => {
    expect(isPdfMime('application/pdf')).toBe(true)
    expect(isPdfMime('APPLICATION/PDF; charset=binary')).toBe(true)
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('text/html')).toBe(false)
  })
  it('inferTypeByExt', () => {
    expect(inferTypeByExt('song.pdf')).toBe('pdf')
    expect(inferTypeByExt('PIC.JPEG')).toBe('image')
    expect(inferTypeByExt('song.txt')).toBeNull()
  })
  it('classifyScoreFile 综合', () => {
    expect(classifyScoreFile({ filename: 'a.pdf' }).acceptable).toBe(true)
    expect(classifyScoreFile({ filename: 'a.docx' }).acceptable).toBe(false)
  })
  it('extensionFor', () => {
    expect(extensionFor('pdf', 'a.pdf')).toBe('.pdf')
    expect(extensionFor('image', 'pic.jpeg')).toBe('.jpg')
    expect(extensionFor('image', null)).toBe('.png')
    expect(extensionFor('link', null)).toBe('')
  })
})

describe('url 工具', () => {
  it('isHttpUrl 仅 http/https', () => {
    expect(isHttpUrl('https://a.com/b')).toBe(true)
    expect(isHttpUrl('http://a.com')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isHttpUrl('notaurl')).toBe(false)
  })
  it('hostOf', () => {
    expect(hostOf('https://imslp.org/wiki/x')).toBe('imslp.org')
    expect(hostOf('bad')).toBeNull()
  })
})

describe('aggregatePractice（设计 §5.4、§12）', () => {
  const now = new Date(2026, 5, 15, 10, 0, 0)
  it('空数据返回 30 天趋势', () => {
    const r = aggregatePractice([], new Map(), now)
    expect(r.todaySeconds).toBe(0)
    expect(r.trend).toHaveLength(30)
    expect(r.trend[0].seconds).toBe(0)
  })
  it('今日多歌曲聚合 + 排序', () => {
    const songs = new Map([
      ['s1', { id: 's1', title: 'A', artist: 'x' }],
      ['s2', { id: 's2', title: 'B', artist: 'y' }]
    ])
    const sessions = [
      { songId: 's1', startedAt: new Date(2026, 5, 15, 9, 0).toISOString(), durationSeconds: 600 },
      { songId: 's2', startedAt: new Date(2026, 5, 15, 9, 30).toISOString(), durationSeconds: 300 },
      { songId: 's1', startedAt: new Date(2026, 4, 10, 9, 0).toISOString(), durationSeconds: 1200 }
    ]
    const r = aggregatePractice(sessions, songs, now, 30)
    expect(r.todaySeconds).toBe(900)
    expect(r.monthSeconds).toBe(900) // 5 月的不算本月（6 月）
    expect(r.todayBySong).toHaveLength(2)
    expect(r.todayBySong[0].songId).toBe('s1') // 600 > 300
    expect(r.byArtist.find((a) => a.artist === 'x')?.seconds).toBe(1800)
  })
  it('趋势填充无练习日为 0', () => {
    const songs = new Map([['s1', { id: 's1', title: 'A', artist: null }]])
    const sessions = [
      { songId: 's1', startedAt: new Date(2026, 5, 15, 9, 0).toISOString(), durationSeconds: 60 }
    ]
    const r = aggregatePractice(sessions, songs, now, 5)
    expect(r.trend).toHaveLength(5)
    expect(r.trend[0].date).toBe('2026-06-15')
    expect(r.trend[0].seconds).toBe(60)
    expect(r.trend[1].seconds).toBe(0)
  })
})
