import { useRef, useState } from 'react'
import type { HistoryEntry } from '../types'
import { MAX_BACKUP_BYTES, restoreProgress, serializeProgress, type ProgressData } from '../lib/progress-backup'

interface Props {
  history: HistoryEntry[]
  skippedIds: string[]
  onRestore: (progress: ProgressData) => void
}

export function ProgressBackup({ history, skippedIds, onRestore }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function download() {
    setError('')
    setMessage('')
    try {
      const source = serializeProgress({ history, permanentlySkippedSentenceIds: skippedIds })
      const blob = new Blob([source], { type: 'application/json;charset=utf-8' })
      if (blob.size > MAX_BACKUP_BYTES) throw new Error('进度数据超过备份文件的 5 MB 上限。')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `typelingo-progress-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      setMessage('已请求下载进度备份，请在浏览器的下载记录或“文件”中保存 JSON 文件。')
    } catch (error) { setError(error instanceof Error ? error.message : '导出失败，请重试。') }
  }

  async function restore(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('进度文件超过 5 MB，无法恢复。')
      const progress = restoreProgress(await file.text())
      onRestore(progress)
      setMessage(`进度已合并：保留最近 ${progress.history.length} 条成绩、${progress.permanentlySkippedSentenceIds.length} 条永久跳过记录。`)
    } catch (error) { setError(error instanceof Error ? error.message : '恢复失败，请检查备份文件。') }
    finally { setBusy(false) }
  }

  return <div className="progress-backup">
    <div className="backup-actions">
      <button className="text-button" type="button" disabled={busy} onClick={download}>导出进度</button>
      <button className="text-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? '正在恢复…' : '恢复进度'}</button>
      <input ref={inputRef} type="file" accept=".json,application/json" hidden aria-label="选择进度备份文件" onChange={(event) => {
        void restore(event.target.files?.[0]); event.target.value = ''
      }} />
    </div>
    <p className="backup-help">备份最近 20 条成绩与全部永久跳过记录。恢复时与现有进度合并；自定义卡组请另存原 APKG 文件。</p>
    {message && <p role="status" className="backup-status">{message}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </div>
}
