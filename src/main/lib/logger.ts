/**
 * 日志（electron-log）。设计 §15.2：不记录完整 API key、Authorization、本地文件内容、完整 AI 响应。
 * 该约束由各 service 在打日志时遵守；此处只提供机制与文件位置。
 */
import log from 'electron-log'
import { join } from 'node:path'
import { getLogsDir } from './paths'

let initialized = false

export function initLogger(): void {
  if (initialized) return
  log.transports.file.resolvePathFn = () => join(getLogsDir(), 'main.log')
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.level = 'info'
  log.transports.console.level = 'info'
  log.errorHandler.startCatching()
  initialized = true
}

export { log as logger }
