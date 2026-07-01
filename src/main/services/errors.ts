/**
 * service 层统一错误。IPC handler 捕获 AppError 并映射为 IpcError。
 */
import type { ErrorCode } from '@shared'

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (msg: string, details?: unknown): AppError => new AppError('NOT_FOUND', msg, details)
export const validation = (msg: string, details?: unknown): AppError =>
  new AppError('VALIDATION', msg, details)
export const unsupported = (msg: string, details?: unknown): AppError =>
  new AppError('UNSUPPORTED_TYPE', msg, details)
export const unauthorized = (msg: string, details?: unknown): AppError =>
  new AppError('UNAUTHORIZED', msg, details)
export const networkErr = (msg: string, details?: unknown): AppError =>
  new AppError('NETWORK', msg, details)
export const aiErr = (msg: string, details?: unknown): AppError => new AppError('AI', msg, details)
export const ioErr = (msg: string, details?: unknown): AppError => new AppError('IO', msg, details)
export const blocked = (msg: string, details?: unknown): AppError =>
  new AppError('BLOCKED', msg, details)
export const conflict = (msg: string, details?: unknown): AppError =>
  new AppError('CONFLICT', msg, details)
export const internalErr = (msg: string, details?: unknown): AppError =>
  new AppError('INTERNAL', msg, details)

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
