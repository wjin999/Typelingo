import { useEffect, useMemo, useRef, useState } from 'react'
import { loadDefaultDeck } from './lib/default-deck'
import { DeckPicker } from './components/DeckPicker'
import { AnkiImport } from './components/AnkiImport'
import { ProgressBackup } from './components/ProgressBackup'
import { DECKS_UPDATED_KEY, loadImportedDecks, saveImportedDeck } from './lib/deck-storage'
import { formatDuration, sampleItems } from './lib/practice'
import {
  addHistoryEntry,
  clearPermanentlySkippedSentences,
  HISTORY_KEY,
  loadHistory,
  loadPermanentlySkippedSentenceIds,
  PERMANENTLY_SKIPPED_KEY,
  permanentlySkipSentence,
} from './lib/storage'
import type {
  HistoryEntry,
  Lesson,
  LessonItem,
  PracticeSummary,
} from './types'

const SESSION_SIZE = 10
const SELECTED_DECK_KEY = 'typelingo.selected-deck.v1'

type Screen = 'home' | 'practice' | 'result'

function createHistoryEntry(summary: PracticeSummary, lesson: Lesson): HistoryEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    completedAt: new Date().toISOString(),
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    sentenceCount: summary.sentenceCount,
    elapsedMs: summary.elapsedMs,
  }
}

function App() {
  const [defaultLesson, setDefaultLesson] = useState<Lesson | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    void loadDefaultDeck().then((deck) => { if (active) setDefaultLesson(deck) })
      .catch(() => { if (active) setError('默认卡组加载失败，请检查连接后重试。') })
    return () => { active = false }
  }, [attempt])
  if (!defaultLesson) return <div className="app-shell"><main className="main-content loading-screen">
    <span className="eyebrow">TypeLingo</span><h1>打字，记住日语。</h1>
    <p role={error ? 'alert' : 'status'}>{error || '正在加载 egg rolls 例句库…'}</p>
    {error && <button className="primary-button" type="button" onClick={() => setAttempt((current) => current + 1)}>重试</button>}
  </main></div>
  return <PracticeApp defaultLesson={defaultLesson} />
}

function PracticeApp({ defaultLesson }: { defaultLesson: Lesson }) {
  const [importedDecks, setImportedDecks] = useState<Lesson[]>([])
  const [selectedId, setSelectedId] = useState(() => {
    try { return localStorage.getItem(SELECTED_DECK_KEY) || defaultLesson.id } catch { return defaultLesson.id }
  })
  const [level, setLevel] = useState('all')
  const [importOpen, setImportOpen] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const lessons = useMemo(() => {
    const byId = new Map([[defaultLesson.id, defaultLesson]])
    for (const deck of importedDecks) byId.set(deck.id, deck.id === defaultLesson.id
      ? { ...deck, metadata: { ...deck.metadata!, builtIn: true } } : deck)
    return [...byId.values()]
  }, [importedDecks, defaultLesson])
  const lesson = lessons.find((deck) => deck.id === selectedId) ?? defaultLesson
  const [screen, setScreen] = useState<Screen>('home')
  const [queue, setQueue] = useState<LessonItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [completedSentenceCount, setCompletedSentenceCount] = useState(0)
  const [summary, setSummary] = useState<PracticeSummary | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [permanentlySkippedIds, setPermanentlySkippedIds] = useState<string[]>(
    loadPermanentlySkippedSentenceIds,
  )
  const [showFurigana, setShowFurigana] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)

  const currentItem = queue[currentIndex]
  const isSentenceComplete = currentItem?.text === typed
  const skippedIds = useMemo(() => new Set(permanentlySkippedIds), [permanentlySkippedIds])
  const availableItems = useMemo(() => lesson.items.filter(
    (item) => !skippedIds.has(item.id) && (level === 'all' || item.level === level),
  ), [lesson, skippedIds, level])
  const skippedCount = useMemo(() => lesson.items.filter((item) => skippedIds.has(item.id)).length, [lesson, skippedIds])

  useEffect(() => {
    let active = true
    function refresh() {
      void loadImportedDecks().then((decks) => {
        if (active) { setImportedDecks(decks); setLibraryError('') }
      }).catch((error) => { if (active) setLibraryError(error instanceof Error ? error.message : '读取卡组失败。') })
    }
    function handleStorage(event: StorageEvent) {
      if (event.storageArea === window.localStorage && (event.key === DECKS_UPDATED_KEY || event.key === null)) refresh()
    }
    refresh()
    window.addEventListener('storage', handleStorage)
    return () => { active = false; window.removeEventListener('storage', handleStorage) }
  }, [])

  function selectDeck(id: string) {
    setSelectedId(id)
    setLevel('all')
    try { localStorage.setItem(SELECTED_DECK_KEY, id) } catch { /* Selection still works in memory. */ }
  }

  async function importDeck(deck: Lesson) {
    await saveImportedDeck(deck)
    setImportedDecks((current) => [...current.filter((item) => item.id !== deck.id), deck])
    setLibraryError('')
    selectDeck(deck.id)
  }

  useEffect(() => {
    if (screen === 'practice') {
      inputRef.current?.focus()
    }
  }, [currentIndex, screen])

  useEffect(() => {
    function syncStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage) return

      if (event.key === null || event.key === HISTORY_KEY) {
        setHistory(loadHistory())
      }
      if (event.key === null || event.key === PERMANENTLY_SKIPPED_KEY) {
        setPermanentlySkippedIds(loadPermanentlySkippedSentenceIds())
      }
    }

    window.addEventListener('storage', syncStorage)
    return () => window.removeEventListener('storage', syncStorage)
  }, [])

  function startPractice() {
    const items = sampleItems(availableItems, SESSION_SIZE)

    if (items.length === 0) {
      return
    }

    setQueue(items)
    setCurrentIndex(0)
    setTyped('')
    setStartedAt(Date.now())
    setCompletedSentenceCount(0)
    setSummary(null)
    setShowFurigana(true)
    isComposingRef.current = false
    setScreen('practice')
  }

  function handleInputChange(nextValue: string) {
    if (!currentItem) {
      return
    }

    setTyped(nextValue)
  }

  function handleCompositionStart() {
    isComposingRef.current = true
  }

  function handleCompositionEnd(nextValue: string) {
    if (!currentItem) {
      return
    }

    isComposingRef.current = false
    setTyped(nextValue)
  }

  function completePractice(sentenceCount: number) {
    const elapsedMs = Math.max(1, Date.now() - (startedAt ?? Date.now()))
    const nextSummary: PracticeSummary = {
      elapsedMs,
      sentenceCount,
    }

    setSummary(nextSummary)
    setHistory(addHistoryEntry(history, createHistoryEntry(nextSummary, lesson)))
    setScreen('result')
  }

  function advanceFromCurrent(sentenceCount: number) {
    if (currentIndex + 1 >= queue.length) {
      completePractice(sentenceCount)
      return
    }

    setCurrentIndex((current) => current + 1)
    setTyped('')
    isComposingRef.current = false
  }

  function goToNextSentence() {
    if (!isSentenceComplete) {
      return
    }

    const nextCompletedCount = completedSentenceCount + 1
    setCompletedSentenceCount(nextCompletedCount)
    advanceFromCurrent(nextCompletedCount)
  }

  function skipCurrentSentence(permanent: boolean) {
    if (!currentItem) {
      return
    }

    if (permanent) {
      setPermanentlySkippedIds(
        permanentlySkipSentence(permanentlySkippedIds, currentItem.id),
      )
    }

    advanceFromCurrent(completedSentenceCount)
  }

  function restorePermanentlySkippedSentences() {
    setPermanentlySkippedIds(clearPermanentlySkippedSentences(lesson.items.map((item) => item.id)))
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const isImeAction =
      event.nativeEvent.isComposing ||
      isComposingRef.current ||
      event.key === 'Process' ||
      event.keyCode === 229

    if (event.key === 'Enter' && !isImeAction) {
      event.preventDefault()
      goToNextSentence()
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" type="button" onClick={() => setScreen('home')}>
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <span>TypeLingo</span>
        </button>
      </header>

      <main className="main-content">
        {screen === 'home' && libraryError && <p role="alert" className="error-message">{libraryError} 默认卡组仍可练习。</p>}
        {screen === 'home' && (
          <HomeScreen
            history={history}
            availableSentenceCount={availableItems.length}
            permanentlySkippedCount={skippedCount}
            onStart={startPractice}
            onRestoreSkipped={restorePermanentlySkippedSentences}
            progressBackup={<ProgressBackup history={history} skippedIds={permanentlySkippedIds} onRestore={(progress) => {
              setHistory(progress.history)
              setPermanentlySkippedIds(progress.permanentlySkippedSentenceIds)
            }} />}
            deckPicker={<DeckPicker lessons={lessons} lesson={lesson} onSelect={selectDeck} onImport={() => setImportOpen(true)} level={level} onLevel={setLevel} />}
          />
        )}

        {screen === 'practice' && currentItem && (
          <section className="practice-screen" aria-label="日语跟打练习">
            <div className="practice-meta">
              <span className="eyebrow">{lesson.title}{currentItem.level ? ` · ${currentItem.level}` : ''}</span>
              <span className="progress-count">
                {currentIndex + 1} / {queue.length}
              </span>
            </div>

            <div className="progress-track" aria-hidden="true">
              <span
                style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
              />
            </div>

            <div className="typing-card">
              <div className="practice-line native-line">
                <p className="native-sentence" lang="zh-CN">
                  {currentItem.nativeText}
                </p>
              </div>

              <div className="practice-line japanese-line">
                <div className="line-heading">
                  <button
                    className="furigana-toggle"
                    type="button"
                    aria-pressed={showFurigana}
                    onClick={() => setShowFurigana((current) => !current)}
                  >
                    汉字注音：{showFurigana ? '开' : '关'}
                  </button>
                </div>
                <p className="sentence" lang="ja" aria-label={currentItem.text}>
                  <JapaneseSentence
                    item={currentItem}
                    typed={typed}
                    showFurigana={showFurigana}
                  />
                </p>
              </div>

              <div className="practice-line input-line">
                <input
                  ref={inputRef}
                  id="typing-input"
                  className={isSentenceComplete ? 'typing-input is-complete' : 'typing-input'}
                  type="text"
                  lang="ja"
                  value={typed}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => handleInputChange(event.target.value)}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={(event) => handleCompositionEnd(event.currentTarget.value)}
                  onKeyDown={handleInputKeyDown}
                  onPaste={(event) => event.preventDefault()}
                  aria-label="你的输入"
                  aria-describedby="typing-help"
                />

                <div className="typing-footer" id="typing-help">
                  <span>
                    请使用日语输入法；汉字、假名和标点必须一致，Backspace 可修正。
                  </span>
                  <strong className={isSentenceComplete ? 'ready-message is-visible' : 'ready-message'}>
                    输入完成，按 Enter 继续
                  </strong>
                </div>
              </div>
            </div>

            <div className="skip-actions" aria-label="跳过当前句子">
              <button
                className="skip-button"
                type="button"
                onClick={() => skipCurrentSentence(false)}
              >
                本次跳过该句
              </button>
              <button
                className="skip-button skip-button--permanent"
                type="button"
                onClick={() => skipCurrentSentence(true)}
              >
                永远跳过该句
              </button>
            </div>
          </section>
        )}

        {screen === 'result' && summary && (
          <ResultScreen
            summary={summary}
            canRestart={availableItems.length > 0}
            onRestart={startPractice}
            onHome={() => setScreen('home')}
          />
        )}
      </main>

      {importOpen && <AnkiImport onClose={() => setImportOpen(false)} onSave={importDeck} />}

      <footer className="site-footer">
        卡组、记录和永久跳过的句子仅保存在当前浏览器中 · TypeLingo v0.3
      </footer>
    </div>
  )
}

interface JapaneseSentenceProps {
  item: LessonItem
  typed: string
  showFurigana: boolean
}

function JapaneseSentence({ item, typed, showFurigana }: JapaneseSentenceProps) {
  let offset = 0

  return item.ruby.map((part, partIndex) => {
    const startIndex = offset
    offset += part.text.length
    const base = part.text.split('').map((character, characterIndex) => {
      const index = startIndex + characterIndex
      const enteredCharacter = typed[index]
      const state =
        enteredCharacter === undefined
          ? 'pending'
          : enteredCharacter === character
            ? 'correct'
            : 'incorrect'

      return (
        <span className={`character character--${state}`} key={index}>
          {character}
        </span>
      )
    })

    if (showFurigana && part.reading) {
      return (
        <ruby className="ruby-group" key={partIndex}>
          {base}
          <rt>{part.reading}</rt>
        </ruby>
      )
    }

    return (
      <span className="ruby-group" key={partIndex}>
        {base}
      </span>
    )
  })
}

interface HomeScreenProps {
  history: HistoryEntry[]
  availableSentenceCount: number
  permanentlySkippedCount: number
  onStart: () => void
  onRestoreSkipped: () => void
  deckPicker: React.ReactNode
  progressBackup: React.ReactNode
}

function HomeScreen({
  history,
  availableSentenceCount,
  permanentlySkippedCount,
  onStart,
  onRestoreSkipped,
  deckPicker,
  progressBackup,
}: HomeScreenProps) {
  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title">
            打字，记住日语。
          </h1>
          <p>
            以假名输入联结汉字、读音与语义，沿助词与句型梳理表达结构。<br />
            让每次敲击，都成为有语境的日语练习。
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={onStart}
            disabled={availableSentenceCount === 0}
          >
            {availableSentenceCount === 0 ? '没有可练习句子' : '开始练习'}
            <span aria-hidden="true">→</span>
          </button>
          {permanentlySkippedCount > 0 && (
            <button
              className="restore-skipped-button"
              type="button"
              onClick={onRestoreSkipped}
            >
              已永久跳过 {permanentlySkippedCount} 句 · 恢复全部
            </button>
          )}
        </div>

        {deckPicker}
      </section>

      <section className="history-section" aria-labelledby="history-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">练习记录</span>
            <h2 id="history-title">最近成绩</h2>
          </div>
          <span className="storage-note">最多保存 20 条</span>
        </div>

        {progressBackup}

        {history.length === 0 ? (
          <div className="empty-history">
            <span>—</span>
            <p>完成第一次练习后，成绩会显示在这里。</p>
          </div>
        ) : (
          <div className="history-list">
            {history.slice(0, 5).map((entry) => (
              <article className="history-row" key={entry.id}>
                <time dateTime={entry.completedAt}>
                  {new Intl.DateTimeFormat('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(entry.completedAt))}
                  {entry.lessonTitle && <small className="history-deck">{entry.lessonTitle}</small>}
                </time>
                <strong>完成 {entry.sentenceCount} 句</strong>
                <span>{formatDuration(entry.elapsedMs)}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

interface ResultScreenProps {
  summary: PracticeSummary
  canRestart: boolean
  onRestart: () => void
  onHome: () => void
}

function ResultScreen({ summary, canRestart, onRestart, onHome }: ResultScreenProps) {
  return (
    <section className="result-screen" aria-labelledby="result-title">
      <span className="result-check" aria-hidden="true">
        ✓
      </span>
      <span className="eyebrow">本轮完成</span>
      <h1 id="result-title">练习完成</h1>
      <p className="result-subtitle">
        {!canRestart
          ? '没有可练习句子，请返回主页恢复已跳过的句子。'
          : summary.sentenceCount > 0
            ? `完成 ${summary.sentenceCount} 个句子，继续保持这份节奏。`
            : '本轮已结束，你可以返回主页或再来一组。'}
      </p>

      <div className="result-grid">
        <article>
          <span>本轮完成</span>
          <strong>{summary.sentenceCount}</strong>
          <small>句</small>
        </article>
        <article>
          <span>练习用时</span>
          <strong>{formatDuration(summary.elapsedMs)}</strong>
          <small>分:秒</small>
        </article>
      </div>

      <div className="result-actions">
        <button className="secondary-button" type="button" onClick={onHome}>
          回到主页
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={onRestart}
          disabled={!canRestart}
        >
          再来一组
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}

export default App
