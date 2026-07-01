import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { closeDatabase, setDbForTesting } from '@main/db/connection'
import { runMigrations } from '@main/db/migrate'
import { seedBuiltinSources } from '@main/db/seed'
import {
  assetsRepository,
  downloadJobsRepository,
  practiceSessionsRepository,
  recordingsRepository,
  resourceSourcesRepository,
  settingsRepository,
  songsRepository,
  sourceLinksRepository
} from '@main/db/repositories'
import { nowIso } from '@main/utils/time'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  setDbForTesting(db)
})
afterEach(() => {
  closeDatabase()
})

describe('songs repository', () => {
  it('create 预计算拼音首字母与 artist_normalized', () => {
    const s = songsRepository.create({ title: '简单爱', artist: '周杰伦' })
    expect(s.title_pinyin_initial).toBe('JDA')
    expect(s.artist_normalized).toBe('周杰伦') // 中文不变
    expect(s.status).toBe('to-learn')
    expect(s.is_favorite).toBe(0)
  })

  it('search 按拼音首字母', () => {
    songsRepository.create({ title: '简单爱' })
    songsRepository.create({ title: '青花瓷' })
    songsRepository.create({ title: 'Yesterday' })
    expect(songsRepository.search({ text: 'jd' })).toHaveLength(1)
    expect(songsRepository.search({ text: 'QH' })).toHaveLength(1)
    expect(songsRepository.search({ text: 'y' })).toHaveLength(1) // Yesterday
  })

  it('search 按标题包含（中文）', () => {
    songsRepository.create({ title: '简单爱' })
    expect(songsRepository.search({ text: '简单' })).toHaveLength(1)
  })

  it('search 按状态/收藏/艺人/难度/有无资源筛选', () => {
    const a = songsRepository.create({ title: 'A', status: 'learning', isFavorite: true, difficulty: 3 })
    const b = songsRepository.create({ title: 'B', status: 'learned', artist: 'Jay' })
    songsRepository.create({ title: 'C', status: 'to-learn' })

    expect(songsRepository.search({ status: 'learning' })).toHaveLength(1)
    expect(songsRepository.search({ isFavorite: true })).toHaveLength(1)
    expect(songsRepository.search({ artist: 'jay' })).toHaveLength(1)
    expect(songsRepository.search({ minDifficulty: 3 })).toHaveLength(1)

    // 给 A 加 PDF + 录音 + 练习
    assetsRepository.create({ songId: a.id, type: 'pdf' })
    recordingsRepository.upsert({ songId: a.id, localPath: '/a.webm', recordedAt: nowIso() })
    const sess = practiceSessionsRepository.create({ songId: a.id, startedAt: nowIso() })
    practiceSessionsRepository.finish(sess.id, { endedAt: nowIso(), durationSeconds: 60, stopReason: 'manual' })

    const withPdf = songsRepository.search({ hasPdf: true })
    expect(withPdf).toHaveLength(1)
    expect(withPdf[0].id).toBe(a.id)
    expect(withPdf[0].hasPdf).toBe(true)
    expect(withPdf[0].hasRecording).toBe(true)
    expect(withPdf[0].hasPractice).toBe(true)
    expect(withPdf[0].totalPracticeSeconds).toBe(60)

    void b
  })

  it('update 改标题重算拼音', () => {
    const s = songsRepository.create({ title: 'Old' })
    const updated = songsRepository.update(s.id, { title: '简单爱', status: 'learned', isFavorite: true })
    expect(updated!.title_pinyin_initial).toBe('JDA')
    expect(updated!.status).toBe('learned')
    expect(updated!.is_favorite).toBe(1)
  })

  it('delete 级联删除子表（FK CASCADE）', () => {
    const s = songsRepository.create({ title: 'A' })
    assetsRepository.create({ songId: s.id, type: 'pdf' })
    sourceLinksRepository.create({ songId: s.id, url: 'https://x.com', kind: 'score' })
    expect(songsRepository.delete(s.id)).toBe(true)
    expect(assetsRepository.listBySong(s.id)).toHaveLength(0)
    expect(sourceLinksRepository.listBySong(s.id)).toHaveLength(0)
  })
})

describe('assets repository', () => {
  it('setPrimary 同歌曲仅一个主资源', () => {
    const s = songsRepository.create({ title: 'A' })
    const a1 = assetsRepository.create({ songId: s.id, type: 'pdf', isPrimary: true })
    const a2 = assetsRepository.create({ songId: s.id, type: 'image' })
    assetsRepository.setPrimary(a2.id)
    expect(assetsRepository.getById(a1.id)!.is_primary).toBe(0)
    expect(assetsRepository.getById(a2.id)!.is_primary).toBe(1)
  })

  it('getByHash 去重', () => {
    const s = songsRepository.create({ title: 'A' })
    const a = assetsRepository.create({ songId: s.id, type: 'pdf', fileHash: 'abc123' })
    expect(assetsRepository.getByHash('abc123')!.id).toBe(a.id)
    expect(assetsRepository.getByHash('nope')).toBeUndefined()
  })
})

describe('practice sessions', () => {
  it('findActiveBySong / finish', () => {
    const s = songsRepository.create({ title: 'A' })
    const sess = practiceSessionsRepository.create({ songId: s.id, startedAt: nowIso() })
    expect(practiceSessionsRepository.findActiveBySong(s.id)).toBeDefined()
    practiceSessionsRepository.finish(sess.id, {
      endedAt: nowIso(),
      durationSeconds: 120,
      stopReason: 'manual'
    })
    expect(practiceSessionsRepository.findActiveBySong(s.id)).toBeUndefined()
    expect(practiceSessionsRepository.findAllActive()).toHaveLength(0)
  })

  it('recentBySong 只返回已结束', () => {
    const s = songsRepository.create({ title: 'A' })
    const a = practiceSessionsRepository.create({ songId: s.id, startedAt: nowIso() })
    practiceSessionsRepository.finish(a.id, { endedAt: nowIso(), durationSeconds: 10, stopReason: 'manual' })
    const b = practiceSessionsRepository.create({ songId: s.id, startedAt: nowIso() }) // 进行中
    expect(practiceSessionsRepository.recentBySong(s.id)).toHaveLength(1)
    void b
  })
})

describe('recordings（每首歌唯一，设计 §11）', () => {
  it('upsert 同 song 替换，不新增行', () => {
    const s = songsRepository.create({ title: 'A' })
    recordingsRepository.upsert({ songId: s.id, localPath: '/a.webm', recordedAt: nowIso() })
    recordingsRepository.upsert({ songId: s.id, localPath: '/b.webm', recordedAt: nowIso() })
    const r = recordingsRepository.getBySong(s.id)
    expect(r!.local_path).toBe('/b.webm')
    const count = db.prepare('SELECT COUNT(*) AS c FROM recordings').get() as { c: number }
    expect(count.c).toBe(1)
  })
})

describe('resource_sources + seed', () => {
  it('seed 幂等：重复调用不重复插入', () => {
    seedBuiltinSources(db)
    const n = resourceSourcesRepository.list().length
    expect(n).toBeGreaterThan(0)
    seedBuiltinSources(db)
    expect(resourceSourcesRepository.list().length).toBe(n)
  })

  it('CRUD', () => {
    const s = resourceSourcesRepository.create({
      name: 'Test',
      kind: 'score',
      policy: 'link-only',
      enabled: false
    })
    expect(s.enabled).toBe(0)
    const updated = resourceSourcesRepository.update(s.id, { enabled: true, policy: 'direct-download' })
    expect(updated!.enabled).toBe(1)
    expect(updated!.policy).toBe('direct-download')
    expect(resourceSourcesRepository.delete(s.id)).toBe(true)
  })
})

describe('download_jobs', () => {
  it('markStatus + findUnfinished', () => {
    const j = downloadJobsRepository.create({ sourceUrl: 'https://x.com/a.pdf' })
    downloadJobsRepository.markStatus(j.id, 'running')
    expect(downloadJobsRepository.findUnfinished()).toHaveLength(1)
    downloadJobsRepository.markStatus(j.id, 'completed', { targetAssetId: 'a1' })
    expect(downloadJobsRepository.findUnfinished()).toHaveLength(0)
    expect(downloadJobsRepository.getById(j.id)!.target_asset_id).toBe('a1')
  })
})

describe('settings', () => {
  it('get/set/delete', () => {
    expect(settingsRepository.get('k')).toBeUndefined()
    settingsRepository.set('k', { a: 1 })
    expect(settingsRepository.get('k')).toEqual({ a: 1 })
    settingsRepository.set('k', 'str')
    expect(settingsRepository.get('k')).toBe('str')
    expect(settingsRepository.delete('k')).toBe(true)
    expect(settingsRepository.get('k')).toBeUndefined()
  })
})
