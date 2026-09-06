import { useEffect, useRef, useState } from 'react'
import type { Lesson } from '../types'
import type { AnkiInfo, FieldMappings } from '../lib/anki'
import { Modal } from './Modal'

interface Preview { info: AnkiInfo; mappings: FieldMappings; lesson: Lesson }

export function AnkiImport({ onClose, onSave }: { onClose: () => void; onSave: (lesson: Lesson) => Promise<void> }) {
  const worker = useRef<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mappings, setMappings] = useState<FieldMappings>({})
  const [dirty, setDirty] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  useEffect(() => () => worker.current?.terminate(), [])

  async function readFile(file?: File) {
    if (!file) return
    setError('')
    if (!/\.apkg$/i.test(file.name)) { setError('请选择 .apkg 格式的 Anki 卡组。'); return }
    if (file.size > 512 * 1024 * 1024) { setError('文件超过 512 MB，请拆分卡组后导入。'); return }
    worker.current?.terminate()
    setBusy(true)
    setPreview(null)
    setDirty(false)
    try {
      const nextWorker = new Worker(new URL('../lib/anki.worker.ts', import.meta.url), { type: 'module' })
      worker.current = nextWorker
      nextWorker.onmessage = (event: MessageEvent<Preview & { error?: string }>) => {
        setBusy(false)
        if (event.data.error) { setError(event.data.error); return }
        setPreview(event.data)
        setMappings(event.data.mappings)
        setTitle((current) => current || event.data.lesson.title)
        setDescription((current) => current || event.data.lesson.metadata?.description || '')
        setDirty(false)
      }
      nextWorker.onerror = () => { setBusy(false); setError('解析未能完成，请检查文件或尝试重新导出。') }
      setTitle('')
      setDescription('')
      const bytes = await file.arrayBuffer()
      if (worker.current !== nextWorker) return
      nextWorker.postMessage({ bytes, fileName: file.name }, [bytes])
    } catch (error) { setBusy(false); setError(error instanceof Error ? error.message : '读取文件失败。') }
  }

  async function save() {
    if (!preview || !preview.lesson.items.length || dirty) return
    setSaving(true)
    setError('')
    try {
      await onSave({ ...preview.lesson, title: title.trim() || preview.lesson.title,
        metadata: { ...preview.lesson.metadata!, description: description.trim(), builtIn: false } })
      onClose()
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试。'); setSaving(false) }
  }

  return (
    <Modal title="添加 Anki 卡组" onClose={saving ? () => {} : onClose}>
      <p className="detail-description">选择 .apkg 文件，预览日语原句、中文翻译和假名注音。卡组在本机解析，保存后可在此浏览器继续练习。</p>
      <label className="file-picker">选择 Anki 文件
        <input type="file" accept=".apkg" disabled={busy || saving} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = '' }} />
      </label>
      {busy && <p role="status" className="import-status">正在解析卡组和整理例句…</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      {preview && <>
        <p className="import-status">{preview.info.fileName} · {preview.info.noteCount.toLocaleString('zh-CN')} 条笔记 · 可导入 {preview.lesson.items.length.toLocaleString('zh-CN')} 条例句 / 短语</p>
        <label className="field-label">卡组名称<input value={title} maxLength={120} disabled={saving} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="field-label">简单介绍<textarea value={description} maxLength={2000} rows={3} disabled={saving} onChange={(event) => setDescription(event.target.value)} /></label>
        <details className="mapping-options" open={preview.lesson.items.length === 0 || undefined}>
          <summary>查看 / 调整字段对应关系</summary>
          <p>请选择包含完整例句和中文句译的字段。注音可以留空；未识别的笔记类型可手动指定。</p>
          {preview.info.models.map((model) => <fieldset key={model.id} disabled={busy || saving}>
            <legend>{model.name} · {model.noteCount.toLocaleString('zh-CN')} 条笔记</legend>
            {(mappings[model.id] ?? []).map((mapping, index) => <div className="mapping-row" key={index}>
              {(['sentence', 'translation', 'furigana'] as const).map((key) => <label key={key}>
                {{ sentence: '日语原句', translation: '中文翻译', furigana: '假名注音（可选）' }[key]} {index + 1}
                <select value={mapping[key]} onChange={(event) => {
                  setMappings((current) => ({ ...current, [model.id]: current[model.id]!.map((value, slot) => slot === index ? { ...value, [key]: Number(event.target.value) } : value) }))
                  setDirty(true)
                }}>
                  <option value={-1}>不使用</option>
                  {model.fields.map((field, fieldIndex) => <option key={fieldIndex} value={fieldIndex}>{field}</option>)}
                </select>
              </label>)}
            </div>)}
          </fieldset>)}
          <button className="secondary-button" type="button" disabled={!dirty || busy || saving} onClick={() => {
            setBusy(true); setError(''); worker.current?.postMessage({ mappings })
          }}>更新预览</button>
        </details>
        {dirty && <p role="status">字段已修改，请先更新预览。</p>}
        {!dirty && preview.lesson.items.length > 0 && <section className="import-examples" aria-label="例句预览">
          <h3>例句预览</h3>
          {preview.lesson.items.slice(0, 3).map((item) => <article key={item.id}>
            <p lang="ja">{item.ruby.map((part, index) => part.reading
              ? <ruby key={index}>{part.text}<rt>{part.reading}</rt></ruby> : <span key={index}>{part.text}</span>)}</p>
            <span>{item.nativeText}</span>
          </article>)}
        </section>}
        {preview.lesson.items.length === 0 && <p className="error-message">未找到可练习的日中句对，请调整字段。缺少原句或翻译的条目不会导入。</p>}
        {preview.lesson.metadata?.license && <p className="deck-credit">制作：{preview.lesson.metadata.author} · {preview.lesson.metadata.license}。作者、来源与许可说明会随卡组保留。</p>}
        <p className="deck-credit">导入例句、译文和注音，不导入媒体文件及 Anki 复习进度。同一文件再次导入将更新已有卡组。</p>
        <div className="modal-actions"><button className="primary-button" type="button" disabled={busy || saving || dirty || !preview.lesson.items.length} onClick={() => void save()}>{saving ? '正在保存…' : '添加并选择此卡组'}</button></div>
      </>}
    </Modal>
  )
}
