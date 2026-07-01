/**
 * 路径安全校验：防止 renderer 传入的相对路径通过 `..` 或绝对路径越界，
 * 逃出 SongCat 曲库根目录（设计 §17.4 安全边界）。
 *
 * 所有"由外部输入拼接到曲库路径"的操作都应经 safeJoin / assertWithin。
 */
import { resolve, relative, isAbsolute, normalize, sep } from 'node:path'

/** target 是否位于 root 目录之内（含 root 自身之外的子路径） */
export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target)
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

/** 将若干段安全拼接到 root 之下；若结果逃出 root 则抛错 */
export function safeJoin(root: string, ...segments: string[]): string {
  const joined = resolve(root, ...segments.map((s) => normalize(String(s))))
  if (!isWithin(root, joined)) {
    throw new Error(`Path escapes library root: ${joined}`)
  }
  return joined
}

/** 仅校验，不拼接 */
export function assertWithin(root: string, target: string): void {
  if (!isWithin(root, target)) {
    throw new Error(`Path escapes library root: ${target}`)
  }
}

/** 统一路径分隔符为 POSIX，便于跨平台比较与存储 */
export function toPosix(p: string): string {
  return p.split(sep).join('/')
}
