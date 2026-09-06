import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addHistoryEntry,
  clearPermanentlySkippedSentences,
  loadHistory,
  loadPermanentlySkippedSentenceIds,
  permanentlySkipSentence,
} from './storage'
import type { HistoryEntry } from '../types'

const values = new Map<string, string>()
const historyEntry: HistoryEntry = {
  id: 'session-1',
  completedAt: '2026-09-05T00:00:00.000Z',
  lessonId: 'ja-basic',
  sentenceCount: 1,
  elapsedMs: 1000,
}

beforeEach(() => {
  values.clear()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('practice history', () => {
  it('keeps another tab\'s saved session when the caller has stale history', () => {
    addHistoryEntry([], historyEntry)
    const second = { ...historyEntry, id: 'session-2' }

    expect(addHistoryEntry([], second)).toEqual([second, historyEntry])
    expect(loadHistory()).toEqual([second, historyEntry])
  })

  it('deduplicates merged history and retains the latest 20 sessions', () => {
    let current: HistoryEntry[] = []
    for (let index = 0; index < 25; index += 1) {
      current = addHistoryEntry(current, { ...historyEntry, id: `session-${index}` })
    }

    expect(loadHistory()).toHaveLength(20)
    expect(loadHistory().map((entry) => entry.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `session-${24 - index}`),
    )
  })

  it('filters invalid dates while preserving valid records', () => {
    values.set('typelingo.history.ja.v2', JSON.stringify([
      { ...historyEntry, id: 'bad-date', completedAt: 'not-a-date' },
      { ...historyEntry, id: 'empty-date', completedAt: '' },
      historyEntry,
    ]))

    expect(loadHistory()).toEqual([historyEntry])
  })

  it('keeps in-memory sessions when storage writes fail', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage full')
    })
    const first = addHistoryEntry([], historyEntry)
    const second = { ...historyEntry, id: 'session-2' }

    expect(addHistoryEntry(first, second)).toEqual([second, historyEntry])
  })
})

describe('permanently skipped sentences', () => {
  it('stores sentence ids without duplicates and loads them again', () => {
    const first = permanentlySkipSentence([], 'sentence-1')
    const duplicate = permanentlySkipSentence(first, 'sentence-1')
    permanentlySkipSentence(duplicate, 'sentence-2')

    expect(first).toEqual(['sentence-1'])
    expect(loadPermanentlySkippedSentenceIds()).toEqual([
      'sentence-1',
      'sentence-2',
    ])
  })

  it('clears every permanently skipped sentence', () => {
    permanentlySkipSentence([], 'sentence-1')

    expect(clearPermanentlySkippedSentences()).toEqual([])
    expect(loadPermanentlySkippedSentenceIds()).toEqual([])
  })

  it('restores one deck without changing skips in another deck', () => {
    permanentlySkipSentence([], 'deck-a:1')
    permanentlySkipSentence([], 'deck-b:1')
    expect(clearPermanentlySkippedSentences(['deck-a:1'])).toEqual(['deck-b:1'])
    expect(loadPermanentlySkippedSentenceIds()).toEqual(['deck-b:1'])
  })

  it('merges a new skip with another tab\'s saved ids', () => {
    permanentlySkipSentence([], 'sentence-1')

    expect(permanentlySkipSentence([], 'sentence-2')).toEqual([
      'sentence-1',
      'sentence-2',
    ])
    expect(loadPermanentlySkippedSentenceIds()).toEqual(['sentence-1', 'sentence-2'])
  })

  it('does not resurrect ids restored in another tab', () => {
    const stale = permanentlySkipSentence([], 'sentence-1')
    clearPermanentlySkippedSentences()

    expect(permanentlySkipSentence(stale, 'sentence-2')).toEqual(['sentence-2'])
    expect(loadPermanentlySkippedSentenceIds()).toEqual(['sentence-2'])
  })

  it('keeps in-memory skips when storage writes fail', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage full')
    })
    const first = permanentlySkipSentence([], 'sentence-1')

    expect(permanentlySkipSentence(first, 'sentence-2')).toEqual([
      'sentence-1',
      'sentence-2',
    ])
  })
})
