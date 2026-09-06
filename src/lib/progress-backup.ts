import type { HistoryEntry } from '../types'
import { HISTORY_KEY, PERMANENTLY_SKIPPED_KEY, loadHistory, loadPermanentlySkippedSentenceIds } from './storage'

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024
export interface ProgressData {
  history: HistoryEntry[]
  permanentlySkippedSentenceIds: string[]
}
interface ProgressFile extends ProgressData {
  format: 'typelingo-progress'
  version: 1
  exportedAt: string
}

function mergeHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>()
  for (const entry of entries) if (!byId.has(entry.id)) byId.set(entry.id, entry)
  return [...byId.values()].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, 20)
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1000
}

export function serializeProgress(progress: ProgressData): string {
  const file: ProgressFile = {
    format: 'typelingo-progress', version: 1, exportedAt: new Date().toISOString(),
    history: mergeHistory(progress.history),
    permanentlySkippedSentenceIds: [...new Set(progress.permanentlySkippedSentenceIds)],
  }
  return JSON.stringify(file, null, 2)
}

export function parseProgress(source: string): ProgressData {
  if (new TextEncoder().encode(source).length > MAX_BACKUP_BYTES) throw new Error('进度文件超过 5 MB，无法恢复。')
  let value: Partial<ProgressFile> | null
  try { value = JSON.parse(source) as Partial<ProgressFile> | null } catch { throw new Error('文件不是有效的 JSON 进度备份。') }
  if (!value || value.format !== 'typelingo-progress' || value.version !== 1) {
    throw new Error('请选择 TypeLingo 导出的进度备份（版本 1）。')
  }
  if (!Array.isArray(value.history) || !Array.isArray(value.permanentlySkippedSentenceIds)
    || value.history.length > 10000 || value.permanentlySkippedSentenceIds.length > 100000) {
    throw new Error('进度文件结构或记录数量无效。')
  }
  const history = value.history.map((entry) => {
    if (!entry || !validId(entry.id) || !validId(entry.lessonId)
      || typeof entry.completedAt !== 'string' || !Number.isFinite(Date.parse(entry.completedAt))
      || !Number.isSafeInteger(entry.sentenceCount) || entry.sentenceCount < 0
      || typeof entry.elapsedMs !== 'number' || !Number.isFinite(entry.elapsedMs) || entry.elapsedMs < 0
      || (entry.lessonTitle !== undefined && (typeof entry.lessonTitle !== 'string' || entry.lessonTitle.length > 1000))) {
      throw new Error('进度文件包含无效的练习记录。')
    }
    return {
      id: entry.id, lessonId: entry.lessonId, completedAt: entry.completedAt,
      sentenceCount: entry.sentenceCount, elapsedMs: entry.elapsedMs,
      ...(entry.lessonTitle !== undefined ? { lessonTitle: entry.lessonTitle } : {}),
    }
  })
  if (!value.permanentlySkippedSentenceIds.every(validId)) throw new Error('进度文件包含无效的跳过记录。')
  return { history: mergeHistory(history), permanentlySkippedSentenceIds: [...new Set(value.permanentlySkippedSentenceIds)] }
}

export function restoreProgress(source: string): ProgressData {
  const imported = parseProgress(source)
  const storage = window.localStorage
  const previousHistory = storage.getItem(HISTORY_KEY)
  const previousSkipped = storage.getItem(PERMANENTLY_SKIPPED_KEY)
  const merged = {
    history: mergeHistory([...loadHistory(), ...imported.history]),
    permanentlySkippedSentenceIds: [...new Set([...loadPermanentlySkippedSentenceIds(), ...imported.permanentlySkippedSentenceIds])],
  }
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(merged.history))
    storage.setItem(PERMANENTLY_SKIPPED_KEY, JSON.stringify(merged.permanentlySkippedSentenceIds))
  } catch {
    try {
      if (previousHistory === null) storage.removeItem(HISTORY_KEY)
      else storage.setItem(HISTORY_KEY, previousHistory)
      if (previousSkipped === null) storage.removeItem(PERMANENTLY_SKIPPED_KEY)
      else storage.setItem(PERMANENTLY_SKIPPED_KEY, previousSkipped)
    } catch { /* Storage may have become unavailable; report failure to the user. */ }
    throw new Error('恢复失败，浏览器存储不可用或空间不足。请保留备份文件后重试。')
  }
  return merged
}
