/**
 * ID 生成（UUID v4）。
 * 文件名、行主键统一用 UUID，避免非法字符与冲突（设计 §4.2）。
 */
import { randomUUID } from 'node:crypto'

export const newId = (): string => randomUUID()
