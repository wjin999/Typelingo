import type { HistoryEntry, LessonItem } from '../types'
import { reviewSentence, sentenceKey, type ReviewEntry, type SentenceProgress } from './scheduler'

export const HISTORY_KEY = 'typelingo.history.ja.v2'
export const PERMANENTLY_SKIPPED_KEY = 'typelingo.skipped-sentences.ja.v1'
export const PROGRESS_UPDATED_KEY = 'typelingo.progress.updated.v3'
export const PROGRESS_DATABASE = 'typelingo.progress'
const STORES = ['history', 'cards', 'reviews', 'skips', 'meta']
export interface ProgressData {
  history: HistoryEntry[]
  permanentlySkippedSentenceIds: string[]
  cards: SentenceProgress[]
  reviews: ReviewEntry[]
}

export function validHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as HistoryEntry
  return typeof entry.id === 'string' && !!entry.id && typeof entry.lessonId === 'string' && !!entry.lessonId
    && typeof entry.completedAt === 'string' && Number.isFinite(Date.parse(entry.completedAt))
    && Number.isSafeInteger(entry.sentenceCount) && entry.sentenceCount >= 0
    && Number.isFinite(entry.elapsedMs) && entry.elapsedMs >= 0
    && (entry.lessonTitle === undefined || typeof entry.lessonTitle === 'string')
    && (entry.mode === undefined || entry.mode === 'memory' || entry.mode === 'free')
    && (entry.partial === undefined || typeof entry.partial === 'boolean')
}

function legacyValues(key: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROGRESS_DATABASE, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of STORES) db.createObjectStore(name, { keyPath: 'id' })
      request.transaction!.objectStore('history').createIndex('completedAt', 'completedAt')
    }
    request.onerror = () => reject(new Error('无法读取学习记录，请检查浏览器是否允许本地存储。'))
    request.onblocked = () => reject(new Error('请关闭其他 TypeLingo 页面后重试。'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      const tx = db.transaction(['meta', 'history', 'skips'], 'readwrite')
      const marker = tx.objectStore('meta').get('legacy-migrated')
      marker.onsuccess = () => {
        if (marker.result) return
        for (const entry of legacyValues(HISTORY_KEY).filter(validHistoryEntry)) tx.objectStore('history').put(entry)
        for (const id of legacyValues(PERMANENTLY_SKIPPED_KEY)) {
          if (typeof id === 'string') tx.objectStore('skips').put({ id })
        }
        tx.objectStore('meta').put({ id: 'legacy-migrated' })
      }
      tx.oncomplete = () => resolve(db)
      tx.onabort = () => { db.close(); reject(new Error('旧进度迁移失败，原数据已保留，请重试。')) }
    }
  })
}

function announce() {
  try { window.localStorage.setItem(PROGRESS_UPDATED_KEY, crypto.randomUUID()) } catch { /* IndexedDB is authoritative. */ }
}

async function transaction<T>(names: string[], mode: IDBTransactionMode,
  work: (tx: IDBTransaction, result: (value: T) => void, fail: (message: string) => void) => void): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode)
    let value: T
    let message = '学习记录未能保存，请检查浏览器存储空间后重试。'
    tx.oncomplete = () => { db.close(); if (mode === 'readwrite') announce(); resolve(value) }
    tx.onabort = () => { db.close(); reject(new Error(message)) }
    try { work(tx, (next) => { value = next }, (reason) => { message = reason; tx.abort() }) }
    catch { tx.abort() }
  })
}

export async function loadHistory(limit = 5, offset = 0): Promise<HistoryEntry[]> {
  return transaction(['history'], 'readonly', (tx, done) => {
    const entries: HistoryEntry[] = []
    const cursor = tx.objectStore('history').index('completedAt').openCursor(null, 'prev')
    let skipped = false
    cursor.onsuccess = () => {
      const current = cursor.result
      if (!current || entries.length >= limit) { done(entries); return }
      if (offset && !skipped) { skipped = true; current.advance(offset); return }
      entries.push(current.value as HistoryEntry)
      current.continue()
    }
  })
}

export async function historyCount(): Promise<number> {
  return transaction(['history'], 'readonly', (tx, done) => {
    const request = tx.objectStore('history').count(); request.onsuccess = () => done(request.result)
  })
}

export async function addHistoryEntry(_current: HistoryEntry[], entry: HistoryEntry): Promise<HistoryEntry[]> {
  await transaction<void>(['history'], 'readwrite', (tx) => { tx.objectStore('history').put(entry) })
  return loadHistory()
}

export async function loadCards(): Promise<SentenceProgress[]> {
  return transaction(['cards'], 'readonly', (tx, done) => {
    const request = tx.objectStore('cards').getAll(); request.onsuccess = () => done(request.result)
  })
}

export async function loadPermanentlySkippedSentenceIds(): Promise<string[]> {
  return transaction(['skips'], 'readonly', (tx, done) => {
    const request = tx.objectStore('skips').getAllKeys(); request.onsuccess = () => done(request.result as string[])
  })
}

export async function permanentlySkipSentence(_current: string[], sentenceId: string): Promise<string[]> {
  await transaction<void>(['skips'], 'readwrite', (tx) => { tx.objectStore('skips').put({ id: sentenceId }) })
  return loadPermanentlySkippedSentenceIds()
}

export async function clearPermanentlySkippedSentences(sentenceIds?: string[]): Promise<string[]> {
  await transaction<void>(['skips'], 'readwrite', (tx) => {
    const store = tx.objectStore('skips')
    if (sentenceIds) for (const id of sentenceIds) store.delete(id)
    else store.clear()
  })
  return loadPermanentlySkippedSentenceIds()
}

export async function recordReview(review: ReviewEntry, item: LessonItem, history: HistoryEntry,
  expectedUpdatedAt?: string): Promise<SentenceProgress | undefined> {
  return transaction(['reviews', 'cards', 'history'], 'readwrite', (tx, done, fail) => {
    const logs = tx.objectStore('reviews')
    const existing = logs.get(review.id)
    existing.onsuccess = () => {
      const request = tx.objectStore('cards').get(sentenceKey(review.lessonId, item.id))
      request.onsuccess = () => {
        try {
        const previous = request.result as SentenceProgress | undefined
        if (existing.result) { done(previous); return }
        if (review.mode === 'memory' && previous?.updatedAt !== expectedUpdatedAt) {
          fail('这句的复习计划已在其他页面或备份中更新，请返回主页重新开始。'); return
        }
        if (previous && Date.parse(previous.updatedAt) > Date.parse(review.reviewedAt)) {
          fail('设备时间早于上次复习时间，请检查系统日期。'); return
        }
        let next = previous
        if (review.rating !== null) {
          next = reviewSentence(previous, review.lessonId, item, review.rating, new Date(review.reviewedAt))
          tx.objectStore('cards').put(next)
        }
        logs.put(review)
        tx.objectStore('history').put(history)
        done(next)
        } catch { fail('学习记录未能保存，请检查浏览器存储空间后重试。') }
      }
    }
  })
}

export async function exportProgress(): Promise<ProgressData> {
  return transaction(['history', 'skips', 'cards', 'reviews'], 'readonly', (tx, done) => {
    const data: ProgressData = { history: [], permanentlySkippedSentenceIds: [], cards: [], reviews: [] }
    const history = tx.objectStore('history').getAll(); history.onsuccess = () => { data.history = history.result }
    const skips = tx.objectStore('skips').getAllKeys(); skips.onsuccess = () => { data.permanentlySkippedSentenceIds = skips.result as string[] }
    const cards = tx.objectStore('cards').getAll(); cards.onsuccess = () => { data.cards = cards.result }
    const reviews = tx.objectStore('reviews').getAll(); reviews.onsuccess = () => { data.reviews = reviews.result }
    done(data)
  })
}

export async function mergeProgress(imported: ProgressData): Promise<void> {
  await transaction<void>(['history', 'skips', 'cards', 'reviews'], 'readwrite', (tx) => {
    for (const entry of imported.history) {
      const store = tx.objectStore('history'); const request = store.get(entry.id)
      request.onsuccess = () => {
        const previous = request.result as HistoryEntry | undefined
        if (!previous || Date.parse(entry.completedAt) > Date.parse(previous.completedAt)
          || (entry.completedAt === previous.completedAt && previous.partial && !entry.partial)) store.put(entry)
      }
    }
    for (const id of imported.permanentlySkippedSentenceIds) tx.objectStore('skips').put({ id })
    for (const entry of imported.cards) {
      const store = tx.objectStore('cards'); const request = store.get(entry.id)
      request.onsuccess = () => {
        const previous = request.result as SentenceProgress | undefined
        if (!previous || Date.parse(entry.updatedAt) > Date.parse(previous.updatedAt)) store.put(entry)
      }
    }
    for (const entry of imported.reviews) {
      const store = tx.objectStore('reviews'); const request = store.get(entry.id)
      request.onsuccess = () => { if (!request.result) store.put(entry) }
    }
  })
}
