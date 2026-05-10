import { useRef, useState, useEffect } from 'react'
import { injectSubtitle, removeSubtitle } from '../lib/subtitleTrack'

// ── Encoding-aware text decoder ───────────────────────────────
// Many Turkish SRT files are Windows-1254 (cp1254), not UTF-8.
// Strategy: read as ArrayBuffer, try UTF-8 first; if replacement
// characters appear fall back to windows-1254, then iso-8859-9.
function decodeFile(buffer) {
  const bytes = new Uint8Array(buffer)

  // Strip UTF-8 BOM if present (EF BB BF)
  const start = (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) ? 3 : 0
  const slice = start ? bytes.slice(start) : bytes

  // Try UTF-8 — TextDecoder replaces bad sequences with U+FFFD
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(slice)
  if (!utf8.includes('�')) return utf8

  // Fall back: windows-1254 covers all Turkish characters
  for (const enc of ['windows-1254', 'iso-8859-9', 'iso-8859-1']) {
    try {
      return new TextDecoder(enc).decode(slice)
    } catch { /* encoding not supported in this browser, try next */ }
  }
  return utf8   // last resort
}

// ── SRT → WebVTT converter ────────────────────────────────────
function srtToVtt(raw) {
  const text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()

  const blocks = text.split(/\n{2,}/)
  const cues = blocks
    .map(block => {
      const lines = block.trim().split('\n')
      // Drop leading sequence-number line
      const start = /^\d+$/.test(lines[0].trim()) ? 1 : 0
      return lines.slice(start).join('\n').trim()
    })
    .filter(c => c.includes('-->'))
    // Convert SRT timestamps: 00:00:01,234 → 00:00:01.234
    .map(c => c.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'))

  return 'WEBVTT\n\n' + cues.join('\n\n')
}

// ── Component ─────────────────────────────────────────────────
export default function SubtitleLoader({ videoElRef }) {
  const inputRef  = useRef(null)
  const trackRef  = useRef(null)
  const blobRef   = useRef(null)

  const [fileName, setFileName] = useState(null)
  const [active,   setActive]   = useState(false)

  // Cleanup on unmount
  useEffect(() => () => { removeCurrent() }, [])

  function removeCurrent() {
    removeSubtitle(trackRef.current); trackRef.current = null
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // allow re-picking same file

    const reader = new FileReader()
    reader.onload = ev => {
      const raw   = decodeFile(ev.target.result)
      const isSrt = file.name.toLowerCase().endsWith('.srt')
      const vtt   = isSrt ? srtToVtt(raw) : raw

      removeCurrent()

      const blob    = new Blob([vtt], { type: 'text/vtt' })
      const blobUrl = URL.createObjectURL(blob)
      blobRef.current = blobUrl

      const videoEl = videoElRef.current
      if (!videoEl) return

      trackRef.current = injectSubtitle(videoEl, {
        blobUrl,
        label: file.name,
        lang:  'und',
        attr:  'data-srt',
      })

      // The 'load' event fires as soon as all cues are parsed, but
      // we also need to update React state at that moment.
      trackRef.current.addEventListener('load', () => setActive(true), { once: true })

      setFileName(file.name)
    }
    reader.readAsArrayBuffer(file)
  }

  function toggleActive() {
    if (!trackRef.current?.track) return
    const next = !active
    trackRef.current.track.mode = next ? 'showing' : 'hidden'
    setActive(next)
  }

  function remove() {
    removeCurrent()
    setFileName(null)
    setActive(false)
  }

  // ── Render: no file loaded ────────────────────────────────
  if (!fileName) {
    return (
      <div className="shrink-0 px-1 py-1">
        <input
          ref={inputRef}
          type="file"
          accept=".srt,.vtt"
          className="hidden"
          onChange={handleFile}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          SRT / VTT Yükle
        </button>
      </div>
    )
  }

  // ── Render: file loaded ───────────────────────────────────
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700">
      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>

      {/* File name — truncated */}
      <span className="text-xs text-gray-300 truncate flex-1 min-w-0" title={fileName}>
        {fileName}
      </span>

      {/* Toggle on/off */}
      <button
        onClick={toggleActive}
        title={active ? 'Altyazıyı gizle' : 'Altyazıyı göster'}
        className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium transition-colors ${
          active
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
        }`}
      >
        {active ? 'Açık' : 'Kapalı'}
      </button>

      {/* Change file */}
      <input
        ref={inputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        title="Başka dosya seç"
        className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
        </svg>
      </button>

      {/* Remove */}
      <button
        onClick={remove}
        title="Altyazıyı kaldır"
        className="shrink-0 text-gray-500 hover:text-red-400 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}
