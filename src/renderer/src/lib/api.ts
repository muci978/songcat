/** Renderer 端 API 封装：unwrap 把 IpcResult 转为抛异常或返回 data。 */
import type { IpcResult } from '@shared'

export interface ApiError extends Error {
  code?: string
  details?: unknown
}

/** 成功返回 data；失败抛 ApiError（含 code/message/details），由调用方 catch 后 toast 提示 */
export async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const r = await p
  if (r.ok) return r.data
  const e = new Error(r.error.message) as ApiError
  e.code = r.error.code
  e.details = r.error.details
  throw e
}

export const api = window.songcat
