/**
 * 文件 / 字节流的 SHA-256 哈希。
 * 用于去重（重复导入同一文件）与来源记录（设计 §4.2、§7.2）。
 */
import { createHash } from 'node:crypto'
import { createReadStream, type Stats } from 'node:fs'

export function hashBuffer(buf: Buffer | ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : Buffer.from(buf)
  return createHash('sha256').update(b).digest('hex')
}

/** 流式计算文件 SHA-256，避免大 PDF 一次性进内存 */
export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk: Buffer) => h.update(chunk))
    stream.on('end', () => resolve(h.digest('hex')))
    stream.on('error', reject)
  })
}

export type { Stats }
