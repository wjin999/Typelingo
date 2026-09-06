import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_BACKUP_BYTES, parseProgress, restoreProgress, serializeProgress } from './progress-backup'
import { HISTORY_KEY, PERMANENTLY_SKIPPED_KEY, loadHistory, loadPermanentlySkippedSentenceIds } from './storage'
import type { HistoryEntry } from '../types'

const history: HistoryEntry = {
  id: 'phone-session', lessonId: 'eggrolls-jlpt-v3.5', lessonTitle: 'egg rolls · 日本語',
  completedAt: '2026-09-06T01:00:00.000Z', sentenceCount: 8, elapsedMs: 120000,
}
const progress = { history: [history], permanentlySkippedSentenceIds: ['eggrolls-jlpt-v3.5:note:10'] }
const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } })
})
afterEach(() => vi.unstubAllGlobals())

describe('portable progress backups', () => {
  it('round-trips history, Unicode titles and stable sentence ids', () => {
    expect(parseProgress(serializeProgress(progress))).toEqual(progress)
  })

  it('restores into a new browser and persists both types of progress', () => {
    expect(restoreProgress(serializeProgress(progress))).toEqual(progress)
    expect(loadHistory()).toEqual(progress.history)
    expect(loadPermanentlySkippedSentenceIds()).toEqual(progress.permanentlySkippedSentenceIds)
  })

  it('merges rather than replaces local data and is idempotent', () => {
    const local = { ...history, id: 'desktop-session', completedAt: '2026-09-06T02:00:00.000Z' }
    values.set(HISTORY_KEY, JSON.stringify([local]))
    values.set(PERMANENTLY_SKIPPED_KEY, JSON.stringify(['another-deck:1']))
    const first = restoreProgress(serializeProgress(progress))
    expect(first.history).toEqual([local, history])
    expect(first.permanentlySkippedSentenceIds).toEqual(['another-deck:1', ...progress.permanentlySkippedSentenceIds])
    expect(restoreProgress(serializeProgress(progress))).toEqual(first)
  })

  it('retains the latest 20 records across both browsers', () => {
    values.set(HISTORY_KEY, JSON.stringify(Array.from({ length: 20 }, (_, index) => ({
      ...history, id: `desktop-${index}`, completedAt: `2026-09-${String(index + 7).padStart(2, '0')}T01:00:00Z`,
    }))))
    const merged = restoreProgress(serializeProgress(progress))
    expect(merged.history).toHaveLength(20)
    expect(merged.history[0]?.id).toBe('desktop-19')
    expect(merged.history.some((entry) => entry.id === history.id)).toBe(false)
  })

  it('rejects malformed, unsupported or invalid records before changing storage', () => {
    const valid = JSON.parse(serializeProgress(progress))
    const invalid = [
      'not json', 'null', JSON.stringify(progress),
      JSON.stringify({ ...valid, version: 2 }),
      JSON.stringify({ ...valid, history: [{ ...history, completedAt: 'invalid' }] }),
      JSON.stringify({ ...valid, history: [{ ...history, sentenceCount: -1 }] }),
      JSON.stringify({ ...valid, history: [{ ...history, elapsedMs: null }] }),
      JSON.stringify({ ...valid, history: [{ ...history, lessonTitle: {} }] }),
      JSON.stringify({ ...valid, permanentlySkippedSentenceIds: [null] }),
      ' '.repeat(MAX_BACKUP_BYTES + 1),
    ]
    values.set(HISTORY_KEY, JSON.stringify([history]))
    for (const source of invalid) {
      expect(() => restoreProgress(source)).toThrow()
      expect(loadHistory()).toEqual([history])
      expect(loadPermanentlySkippedSentenceIds()).toEqual([])
    }
  })

  it('rolls back the history write when saving skipped ids fails', () => {
    const local = { ...history, id: 'local-session' }
    values.set(HISTORY_KEY, JSON.stringify([local]))
    const write = vi.spyOn(window.localStorage, 'setItem')
    write.mockImplementationOnce((key, value) => { values.set(key, value) })
      .mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    expect(() => restoreProgress(serializeProgress(progress))).toThrow('恢复失败')
    expect(loadHistory()).toEqual([local])
    expect(values.has(PERMANENTLY_SKIPPED_KEY)).toBe(false)
  })
})
