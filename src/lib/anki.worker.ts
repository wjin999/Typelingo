import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { convertAnki, readApkg, suggestMappings, type AnkiPackage, type FieldMappings } from './anki'

let pkg: AnkiPackage | undefined
self.onmessage = async (event: MessageEvent<{ bytes?: ArrayBuffer; fileName?: string; mappings?: FieldMappings }>) => {
  try {
    if (event.data.bytes) {
      const SQL = await initSqlJs({ locateFile: () => wasmUrl })
      pkg = await readApkg(new Uint8Array(event.data.bytes), event.data.fileName!, SQL)
    }
    if (!pkg) throw new Error('请先选择一个 Anki 卡组。')
    const mappings = event.data.mappings ?? suggestMappings(pkg.info)
    self.postMessage({ info: pkg.info, mappings, lesson: convertAnki(pkg, mappings) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '解析失败，请检查文件。' })
  }
}
