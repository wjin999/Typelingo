import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { parseProgress, restoreProgress, serializeProgress } from './progress-backup'
import { exportProgress, type ProgressData } from './storage'
import { reviewSentence } from './scheduler'
import type { HistoryEntry } from '../types'

const history: HistoryEntry = { id: 'phone-session', lessonId: 'deck', lessonTitle: '日本語',
  completedAt: '2026-09-13T01:00:00.000Z', sentenceCount: 1, elapsedMs: 1000 }
const item = { id: 'sentence', text: '猫', nativeText: '猫', ruby: [{ text: '猫', reading: 'ねこ' }] }
const card = reviewSentence(undefined, 'deck', item, 3, new Date(history.completedAt))
const progress: ProgressData = { history: [history], permanentlySkippedSentenceIds: ['deck:skip'], cards: [card],
  reviews: [{ id: 'review', lessonId: 'deck', sentenceId: item.id, reviewedAt: history.completedAt,
    mode: 'memory', rating: 3, hintUsed: false, elapsedMs: 1000 }] }

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: vi.fn() } })
})
afterEach(() => vi.unstubAllGlobals())

describe('complete progress backups', () => {
  it('round trips dates, memory states and all reviews into another browser', async () => {
    expect(parseProgress(serializeProgress(progress))).toEqual(progress)
    expect(await restoreProgress(serializeProgress(progress))).toEqual(progress)
  })

  it('accepts version 1 without inventing per-sentence memories', () => {
    const parsed = parseProgress(JSON.stringify({ format: 'typelingo-progress', version: 1,
      history: [history], permanentlySkippedSentenceIds: ['old:1'] }))
    expect(parsed.cards).toEqual([])
    expect(parsed.reviews).toEqual([])
    expect(parsed.history).toEqual([history])
  })

  it('merges all history, deduplicates logs, and keeps the newer memory state', async () => {
    await restoreProgress(serializeProgress(progress))
    const later = reviewSentence(card, 'deck', item, 4, new Date('2026-09-14T01:00:00.000Z'))
    const newer = { ...progress, cards: [later], history: Array.from({ length: 30 }, (_, index) => ({
      ...history, id: `session-${index}`,
    })) }
    await restoreProgress(serializeProgress(newer))
    await restoreProgress(serializeProgress(progress))
    const data = await exportProgress()
    expect(data.history).toHaveLength(31)
    expect(data.reviews).toHaveLength(1)
    expect(data.cards).toEqual([later])
  })

  it('rejects invalid data before mutating any store', async () => {
    await restoreProgress(serializeProgress(progress))
    const valid = JSON.parse(serializeProgress(progress))
    const invalid = ['null', 'no json', JSON.stringify({ ...valid, version: 99 }),
      JSON.stringify({ ...valid, history: [{ ...history, completedAt: 'no date' }] }),
      JSON.stringify({ ...valid, cards: [{ ...card, card: { ...card.card, stability: null } }] }),
      JSON.stringify({ ...valid, cards: [{ ...card, id: 'wrong-key' }] }),
      JSON.stringify({ ...valid, reviews: [{ ...progress.reviews[0], rating: 0 }] }),
      JSON.stringify({ ...valid, permanentlySkippedSentenceIds: [null] })]
    for (const source of invalid) {
      await expect(restoreProgress(source)).rejects.toThrow()
      expect(await exportProgress()).toEqual(progress)
    }
  })
})
