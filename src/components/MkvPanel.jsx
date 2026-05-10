import { useState, useRef, useEffect } from 'react'
import { getSubtitleTracks, extractSubtitles } from '../lib/mkvSubtitles'
import { injectSubtitle, removeSubtitle } from '../lib/subtitleTrack'

function ProgressBar({ value }) {
  return (
    <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
      <div
        className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export default function MkvPanel({ url, videoElRef }) {
  // phase: 'idle' | 'detecting' | 'ready' | 'extracting' | 'error'
  const [phase,    setPhase]    = useState('idle')
  const [progress, setProgress] = useState(0)
  const [status,   setStatus]   = useState('')
  const [subs,     setSubs]     = useState([])
  const [activeSub, setActiveSub] = useState(-1)   // -1 = off

  const metaRef    = useRef(null)   // { segOff, seeks, tcScale }
  const blobsRef   = useRef([])     // blob URLs we own
  const trackElRef = useRef(null)   // <track> injected into <video>

  // ── Cleanup helpers ───────────────────────────────────────
  function revokeBlobs() {
    blobsRef.current.forEach(u => URL.revokeObjectURL(u))
    blobsRef.current = []
  }

  function removeTrack() {
    removeSubtitle(trackElRef.current)
    trackElRef.current = null
  }

  useEffect(() => () => { revokeBlobs(); removeTrack() }, [])

  // Reset whenever URL changes
  useEffect(() => {
    setPhase('idle')
    setProgress(0)
    setStatus('')
    setSubs([])
    setActiveSub(-1)
    metaRef.current = null
    revokeBlobs()
    removeTrack()
  }, [url])

  // ── Step 1: detect tracks (≤ 256 KB) ─────────────────────
  async function detect() {
    setPhase('detecting')
    setProgress(0)
    setStatus('Dosya başlığı okunuyor…')
    try {
      const { subtitleTracks, ...meta } = await getSubtitleTracks(url)
      metaRef.current = meta
      setSubs(subtitleTracks)
      setPhase('ready')
      setStatus('')
    } catch (e) {
      console.error('MKV detect error', e)
      setPhase('error')
      setStatus('Altyazı tespiti başarısız: ' + e.message)
    }
  }

  // ── Step 2: extract chosen track ─────────────────────────
  async function handleSubChange(idx) {
    removeTrack()
    if (idx === -1) { setActiveSub(-1); return }

    const track = subs[idx]
    if (!track) return

    setPhase('extracting')
    setProgress(0)
    setStatus('Altyazı akışı çıkarılıyor…')
    try {
      const blobUrl = await extractSubtitles(url, track, metaRef.current, p => {
        setProgress(p)
        if (p < 72)       setStatus('Dosya indiriliyor…')
        else if (p < 88)  setStatus('Altyazı blokları işleniyor…')
        else              setStatus('WebVTT oluşturuluyor…')
      })
      blobsRef.current.push(blobUrl)

      const videoEl = videoElRef.current
      if (!videoEl) return

      trackElRef.current = injectSubtitle(videoEl, {
        blobUrl,
        label: track.label,
        lang:  track.lang || 'und',
        attr:  'data-mkv',
      })

      setActiveSub(idx)
      setPhase('ready')
      setStatus('')
      setProgress(0)
    } catch (e) {
      console.error('MKV extract error', e)
      setPhase('ready')     // stay on ready so user can retry
      setStatus('Çıkarma başarısız: ' + e.message)
      setProgress(0)
    }
  }

  const isBusy = phase === 'detecting' || phase === 'extracting'

  // ── Render: idle ──────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="shrink-0 px-1 py-1">
        <button
          onClick={detect}
          className="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded transition-colors"
        >
          Altyazı Seçeneklerini Yükle
        </button>
      </div>
    )
  }

  // ── Render: busy ──────────────────────────────────────────
  if (isBusy) {
    return (
      <div className="shrink-0 bg-gray-800 rounded-lg border border-gray-700 px-3 py-2 space-y-1.5">
        <p className="text-xs text-gray-400">{status || 'İşleniyor…'}</p>
        <ProgressBar value={progress} />
      </div>
    )
  }

  // ── Render: error ─────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="shrink-0 bg-gray-800 rounded-lg border border-red-800 px-3 py-2 flex items-center justify-between gap-3">
        <p className="text-xs text-red-400 truncate">{status}</p>
        <button
          onClick={detect}
          className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  // ── Render: ready (no subs found) ─────────────────────────
  if (!subs.length) {
    return (
      <div className="shrink-0 bg-gray-800 rounded-lg border border-gray-700 px-3 py-2">
        <p className="text-xs text-gray-500">Bu dosyada metin altyazı bulunamadı.</p>
      </div>
    )
  }

  // ── Render: ready (subs available) ───────────────────────
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700">
      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
      <span className="text-xs text-gray-400 shrink-0">Altyazı</span>
      <select
        value={activeSub}
        onChange={e => handleSubChange(Number(e.target.value))}
        className="bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
      >
        <option value={-1}>Kapalı</option>
        {subs.map((t, i) => (
          <option key={i} value={i}>{t.label} ({t.codec.replace('S_TEXT/', '')})</option>
        ))}
      </select>
      {status && <p className="text-xs text-red-400">{status}</p>}
    </div>
  )
}
