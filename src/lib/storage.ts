import type { HistoryEntry } from '../types'

export const HISTORY_KEY = 'typelingo.history.ja.v2'
export const PERMANENTLY_SKIPPED_KEY = 'typelingo.skipped-sentences.ja.v1'
const MAX_HISTORY_ENTRIES = 20

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as Partial<HistoryEntry>

  return (
    typeof entry.id === 'string' &&
    typeof entry.completedAt === 'string' &&
    Number.isFinite(Date.parse(entry.completedAt)) &&
    typeof entry.lessonId === 'string' &&
    typeof entry.sentenceCount === 'number' &&
    typeof entry.elapsedMs === 'number'
  )
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)

    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : []
  } catch {
    return []
  }
}

export function addHistoryEntry(
  current: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  const seen = new Set<string>()
  const next = [entry, ...loadHistory(), ...current]
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .slice(0, MAX_HISTORY_ENTRIES)

  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // The session still works when storage is unavailable or full.
  }

  return next
}

export function loadPermanentlySkippedSentenceIds(): string[] {
  try {
    const raw = window.localStorage.getItem(PERMANENTLY_SKIPPED_KEY)

    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))]
  } catch {
    return []
  }
}

export function permanentlySkipSentence(
  current: string[],
  sentenceId: string,
): string[] {
  // Stored ids are authoritative: another tab may have restored old skips.
  const next = [...new Set([...loadPermanentlySkippedSentenceIds(), sentenceId])]

  try {
    window.localStorage.setItem(
      PERMANENTLY_SKIPPED_KEY,
      JSON.stringify(next),
    )
  } catch {
    // The current session still works when storage is unavailable or full.
    return [...new Set([...current, ...next])]
  }

  return next
}

export function clearPermanentlySkippedSentences(sentenceIds?: string[]): string[] {
  const restored = sentenceIds ? new Set(sentenceIds) : undefined
  const next = restored ? loadPermanentlySkippedSentenceIds().filter((id) => !restored.has(id)) : []
  try {
    if (next.length) window.localStorage.setItem(PERMANENTLY_SKIPPED_KEY, JSON.stringify(next))
    else window.localStorage.removeItem(PERMANENTLY_SKIPPED_KEY)
  } catch {
    // The page state can still be cleared when storage is unavailable.
  }

  return next
}
