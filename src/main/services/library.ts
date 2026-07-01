/**
 * Library 服务：歌曲 CRUD + 详情组合 + 原曲链接溯源（设计 §5.1、§7）。
 */
import { rm } from 'node:fs/promises'
import {
  assetsRepository,
  recordingsRepository,
  songsRepository,
  sourceLinksRepository,
  practiceSessionsRepository
} from '../db/repositories'
import { rowToPracticeSession, rowToSourceLink } from '../db/mappers'
import type {
  CreateSongInput,
  Song,
  SongDetail,
  SongSearchQuery,
  SongSummary,
  UpdateSongInput
} from '@shared'
import { getSongDir } from '../lib/paths'
import { logger } from '../lib/logger'
import { notFound } from './errors'

export function searchSongs(q: SongSearchQuery = {}): SongSummary[] {
  return songsRepository.search(q)
}

export function createSong(input: CreateSongInput): Song {
  const row = songsRepository.create({
    title: input.title,
    artist: input.artist,
    status: input.status,
    isFavorite: input.isFavorite,
    difficulty: input.difficulty,
    notes: input.notes,
    originalAudioUrl: input.originalAudioUrl
  })
  // 设置原曲链接时，若无对应来源记录则写入一条 kind=audio 用于溯源（设计 §5.1）
  if (input.originalAudioUrl) {
    maybeAddAudioSourceLink(row.id, input.originalAudioUrl)
  }
  return songsRepository.toModel(row)!
}

export function updateSong(id: string, input: UpdateSongInput): Song {
  const row = songsRepository.update(id, {
    title: input.title,
    artist: input.artist,
    status: input.status,
    isFavorite: input.isFavorite,
    difficulty: input.difficulty,
    notes: input.notes,
    originalAudioUrl: input.originalAudioUrl
  })
  if (!row) throw notFound(`歌曲不存在：${id}`)
  if (input.originalAudioUrl !== undefined && input.originalAudioUrl) {
    maybeAddAudioSourceLink(id, input.originalAudioUrl)
  }
  return songsRepository.toModel(row)!
}

export function touchSong(id: string): void {
  songsRepository.touchOpenedAt(id)
}

export async function deleteSong(id: string): Promise<boolean> {
  const songDir = getSongDir(id)
  const ok = songsRepository.delete(id) // FK 级联删 assets/links/sessions/recordings
  if (ok) {
    try {
      await rm(songDir, { recursive: true, force: true })
    } catch (e) {
      logger.warn(`清理歌曲目录失败 ${songDir}`, e)
    }
  }
  return ok
}

export function getSongDetail(id: string): SongDetail {
  const summary = songsRepository.getSummaryById(id)
  if (!summary) throw notFound(`歌曲不存在：${id}`)
  const scores = assetsRepository.toModels(assetsRepository.listBySong(id))
  const sourceLinks = sourceLinksRepository.listBySong(id).map(rowToSourceLink)
  const recording = recordingsRepository.toModel(recordingsRepository.getBySong(id))
  const recentSessions = practiceSessionsRepository
    .recentBySong(id, 10)
    .map(rowToPracticeSession)
  return { ...summary, scores, sourceLinks, recording, recentSessions }
}

function maybeAddAudioSourceLink(songId: string, url: string): void {
  const existing = sourceLinksRepository.findBySongAndUrl(songId, url)
  if (!existing) {
    sourceLinksRepository.create({
      songId,
      url,
      kind: 'audio',
      sourceName: null,
      title: null,
      notes: '原曲播放链接'
    })
  }
}
