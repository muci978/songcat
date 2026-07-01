/**
 * MIME / 扩展名校验与资源类型推断（设计 §8.3：只接受 PDF/图片）。
 */
import {
  IMAGE_EXTENSIONS,
  IMAGE_MIMES,
  PDF_EXTENSIONS,
  PDF_MIMES
} from '@shared'
import type { ScoreAssetType } from '@shared'

export function normalizeMime(mime: string | null | undefined): string | null {
  if (!mime) return null
  const base = mime.split(';')[0]?.trim().toLowerCase()
  return base || null
}

export function isPdfMime(mime: string | null | undefined): boolean {
  const m = normalizeMime(mime)
  return !!m && (PDF_MIMES as readonly string[]).includes(m)
}

export function isImageMime(mime: string | null | undefined): boolean {
  const m = normalizeMime(mime)
  return !!m && (IMAGE_MIMES as readonly string[]).includes(m)
}

export function inferTypeByExt(filename: string | null | undefined): ScoreAssetType | null {
  if (!filename) return null
  const lower = filename.toLowerCase()
  if ((PDF_EXTENSIONS as readonly string[]).some((e) => lower.endsWith(e))) return 'pdf'
  if ((IMAGE_EXTENSIONS as readonly string[]).some((e) => lower.endsWith(e))) return 'image'
  return null
}

export function inferTypeByMime(mime: string | null | undefined): ScoreAssetType | null {
  if (isPdfMime(mime)) return 'pdf'
  if (isImageMime(mime)) return 'image'
  return null
}

/** 综合 MIME 与文件名，判断是否为可接受的曲谱文件，并给出推断类型 */
export function classifyScoreFile(opts: {
  mime?: string | null
  filename?: string | null
}): { acceptable: boolean; type: ScoreAssetType | null } {
  const type = inferTypeByMime(opts.mime ?? null) ?? inferTypeByExt(opts.filename ?? null)
  return { acceptable: type !== null, type }
}

/** 落盘时使用的扩展名（type=link 时返回空串） */
export function extensionFor(
  type: ScoreAssetType,
  fallbackFilename: string | null
): string {
  if (type === 'pdf') return '.pdf'
  if (type === 'image') {
    if (fallbackFilename) {
      const m = fallbackFilename.toLowerCase().match(/\.(png|jpe?g|gif|webp|bmp)$/)
      if (m) return '.' + m[1]!.replace('jpeg', 'jpg')
    }
    return '.png'
  }
  return ''
}
