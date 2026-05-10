import { useState, useRef } from 'react'
import {
  getApiKey, saveApiKey,
  extractTitle, searchSubtitles, downloadSubtitle,
} from '../lib/opensubtitles'
import { injectSubtitle, removeSubtitle } from '../lib/subtitleTrack'

// ── Icons ─────────────────────────────────────────────────────
function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
    </svg>
  )
}

function SubIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
  )
}

// ── Language badge ────────────────────────────────────────────
const LANG_LABEL = { tr: 'TR', en: 'EN', de: 'DE', fr: 'FR', es: 'ES' }
function LangBadge({ lang }) {
  return (
    <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded font-mono shrink-0">
      {LANG_LABEL[lang] ?? lang?.toUpperCase() ?? '??'}
    </span>
  )
}

// ── Single result row ─────────────────────────────────────────
function ResultRow({ item, onPick, loading }) {
  return (
    <button
      onClick={() => onPick(item)}
      disabled={loading}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 hover:border-blue-600 hover:bg-gray-800 transition-colors text-left group disabled:opacity-50"
    >
      <LangBadge lang={item.language} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-200 truncate" title={item.release}>{item.release}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.downloads.toLocaleString('tr-TR')} indirme
          {item.fromTrusted && ' · ✓ Güvenilir'}
          {item.aiTranslated && ' · 🤖 AI'}
        </p>
      </div>
      <svg className="w-4 h-4 text-gray-600 group-hover:text-blue-400 shrink-0 transition-colors"
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
      </svg>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────
export default function SubtitleSearch({ channel, videoElRef }) {
  const [open,      setOpen]      = useState(false)
  const [apiKey,    setApiKey]    = useState(getApiKey)
  const [draftKey,  setDraftKey]  = useState(getApiKey)
  const [query,     setQuery]     = useState('')
  const [lang,      setLang]      = useState('tr')
  const [phase,     setPhase]     = useState('idle')  // idle|searching|results|downloading|done|error
  const [results,   setResults]   = useState([])
  const [errorMsg,  setErrorMsg]  = useState('')
  const [activeSub, setActiveSub] = useState(null)
  const blobRef  = useRef(null)
  const trackRef = useRef(null)

  const hasKey = apiKey.length > 0

  // ── Auto-fill query from channel name ─────────────────────
  function openPanel() {
    if (!open) {
      setQuery(extractTitle(channel?.name ?? ''))
      setPhase('idle')
      setResults([])
      setErrorMsg('')
    }
    setOpen(v => !v)
  }

  // ── Save API key ──────────────────────────────────────────
  function commitKey() {
    saveApiKey(draftKey)
    setApiKey(draftKey.trim())
  }

  // ── Search ────────────────────────────────────────────────
  async function handleSearch() {
    if (!query.trim()) return
    setPhase('searching')
    setResults([])
    setErrorMsg('')
    try {
      const res = await searchSubtitles(query.trim(), lang)
      setResults(res)
      setPhase('results')
    } catch (e) {
      setErrorMsg(e.message)
      setPhase('error')
    }
  }

  // ── Download & inject ─────────────────────────────────────
  async function handlePick(item) {
    setPhase('downloading')
    setErrorMsg('')
    try {
      const { blobUrl, fileName } = await downloadSubtitle(item.fileId)

      // Cleanup previous auto-loaded subtitle
      removeSubtitle(trackRef.current); trackRef.current = null
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }

      blobRef.current = blobUrl

      const videoEl = videoElRef.current
      if (!videoEl) throw new Error('Video elementi bulunamadı')

      trackRef.current = injectSubtitle(videoEl, {
        blobUrl,
        label: fileName,
        lang:  item.language,
        attr:  'data-os',
      })

      setActiveSub(fileName)
      setPhase('done')
    } catch (e) {
      setErrorMsg(e.message)
      setPhase('error')
    }
  }

  // ── Remove active subtitle ────────────────────────────────
  function removeActive() {
    removeSubtitle(trackRef.current); trackRef.current = null
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
    setActiveSub(null)
    setPhase('results')
  }

  const isBusy = phase === 'searching' || phase === 'downloading'

  // ── Collapsed button ──────────────────────────────────────
  return (
    <div className="shrink-0">
      {/* Toggle button */}
      <button
        onClick={openPanel}
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors w-full justify-between ${
          open
            ? 'bg-gray-700 border-gray-600 text-white'
            : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <SearchIcon className="w-3.5 h-3.5" />
          {activeSub
            ? <span className="truncate max-w-[180px]" title={activeSub}>{activeSub}</span>
            : 'İnternetten Altyazı Bul'}
        </span>
        <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="mt-1.5 bg-gray-800 rounded-lg border border-gray-700 p-3 flex flex-col gap-3">

          {/* ── API key setup ─────────────────────────────── */}
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={draftKey}
              onChange={e => setDraftKey(e.target.value)}
              onBlur={commitKey}
              onKeyDown={e => e.key === 'Enter' && commitKey()}
              placeholder="OpenSubtitles API anahtarı…"
              className={`flex-1 bg-gray-900 border rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none transition-colors ${
                hasKey ? 'border-green-700 focus:border-green-500' : 'border-gray-600 focus:border-blue-500'
              }`}
            />
            {hasKey
              ? <span className="text-green-500 shrink-0" title="Anahtar kaydedildi">✓</span>
              : <a href="https://www.opensubtitles.com/consumers" target="_blank" rel="noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 shrink-0 whitespace-nowrap">
                  Ücretsiz al →
                </a>
            }
          </div>

          {/* ── Search bar ───────────────────────────────── */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isBusy && hasKey && handleSearch()}
              placeholder="Film / dizi adı…"
              disabled={isBusy}
              className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              disabled={isBusy}
              className="bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer disabled:opacity-50"
            >
              <option value="tr">Türkçe</option>
              <option value="en">İngilizce</option>
              <option value="de">Almanca</option>
              <option value="fr">Fransızca</option>
              <option value="es">İspanyolca</option>
            </select>
            <button
              onClick={handleSearch}
              disabled={isBusy || !hasKey || !query.trim()}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs px-3 py-1.5 rounded transition-colors"
            >
              {phase === 'searching'
                ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>
                : <SearchIcon className="w-3 h-3"/>
              }
              Ara
            </button>
          </div>

          {/* ── Status messages ───────────────────────────── */}
          {phase === 'downloading' && (
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin shrink-0"/>
              Altyazı indiriliyor…
            </p>
          )}
          {phase === 'error' && (
            <p className="text-xs text-red-400">{errorMsg}</p>
          )}
          {phase === 'done' && activeSub && (
            <div className="flex items-center justify-between gap-2 bg-green-900/30 border border-green-800 rounded px-2 py-1.5">
              <span className="text-xs text-green-400 flex items-center gap-1.5">
                <SubIcon className="w-3.5 h-3.5"/>
                <span className="truncate max-w-[200px]" title={activeSub}>{activeSub}</span>
              </span>
              <button onClick={removeActive} className="text-gray-500 hover:text-red-400 shrink-0 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          )}

          {/* ── Results ──────────────────────────────────── */}
          {phase === 'results' && results.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">Sonuç bulunamadı.</p>
          )}
          {(phase === 'results' || phase === 'done') && results.length > 0 && (
            <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5">
              {results.map(item => (
                <ResultRow
                  key={item.fileId}
                  item={item}
                  onPick={handlePick}
                  loading={isBusy}
                />
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
