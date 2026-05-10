import { useRef, useCallback, useEffect } from 'react'
import SidePanel from './SidePanel'
import VideoPlayer from './VideoPlayer'
import SettingsModal from './SettingsModal'
import { useApp } from '../context/AppContext'

export default function Dashboard({
  groupMap,
  groups,
  selectedChannel,
  setSelectedChannel,
  recentChannels,
  setRecentChannels,
  onReset,
}) {
  const { theme, toggleTheme, settingsOpen, setSettingsOpen } = useApp()

  // Ref so handleEnded / keyboard never capture stale values
  const activeListRef    = useRef([])
  const selectedRef      = useRef(selectedChannel)
  useEffect(() => { selectedRef.current = selectedChannel }, [selectedChannel])

  const handleListChange = useCallback((list) => {
    activeListRef.current = list
  }, [])

  const handleEnded = useCallback(() => {
    const list = activeListRef.current
    setSelectedChannel(prev => {
      if (!prev || !list.length) return prev
      const idx = list.findIndex(ch => ch.url === prev.url)
      if (idx < 0 || idx >= list.length - 1) return prev
      return list[idx + 1]
    })
  }, [setSelectedChannel])

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.target.isContentEditable) return

      const list    = activeListRef.current
      const current = selectedRef.current
      const videoEl = document.querySelector('video')

      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault()
          if (!list.length || !current) return
          const idx = list.findIndex(c => c.url === current.url)
          if (idx > 0) setSelectedChannel(list[idx - 1])
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          if (!list.length || !current) return
          const idx = list.findIndex(c => c.url === current.url)
          if (idx >= 0 && idx < list.length - 1) setSelectedChannel(list[idx + 1])
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          if (videoEl) videoEl.volume = Math.min(1, +(videoEl.volume + 0.05).toFixed(2))
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          if (videoEl) videoEl.volume = Math.max(0, +(videoEl.volume - 0.05).toFixed(2))
          break
        }
        case 'f':
        case 'F': {
          if (!videoEl) break
          if (!document.fullscreenElement) {
            const container = document.querySelector('[data-player]') ?? videoEl
            container.requestFullscreen?.()
          } else {
            document.exitFullscreen?.()
          }
          break
        }
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSelectedChannel])

  // ── Prev / Next helpers ────────────────────────────────────
  function goRelative(delta) {
    const list = activeListRef.current
    const cur  = selectedRef.current
    if (!list.length || !cur) return
    const idx  = list.findIndex(c => c.url === cur.url)
    const next = list[idx + delta]
    if (next) setSelectedChannel(next)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden">

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        {/* Logo / home */}
        <button onClick={onReset} className="flex items-center gap-2 group" title="Ana sayfaya dön">
          <div className="w-6 h-6 border-2 border-blue-400 rounded flex items-center justify-center group-hover:border-blue-300 transition-colors">
            <svg className="w-3 h-3 text-blue-400 group-hover:text-blue-300 transition-colors" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v9A2.5 2.5 0 0115.5 16h-11A2.5 2.5 0 012 13.5v-9z"/>
            </svg>
          </div>
          <span className="text-xs font-semibold text-gray-300 group-hover:text-white tracking-widest uppercase transition-colors hidden sm:block">
            IPTV Player
          </span>
        </button>

        {/* Centre: prev / next channel */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => goRelative(-1)}
            disabled={!selectedChannel}
            title="Önceki kanal  (←)"
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="text-xs text-gray-500 max-w-[160px] truncate px-1" title={selectedChannel?.name ?? ''}>
            {selectedChannel?.name ?? '—'}
          </span>
          <button
            onClick={() => goRelative(1)}
            disabled={!selectedChannel}
            title="Sonraki kanal  (→)"
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        {/* Right: theme toggle + settings + new playlist */}
        <div className="flex items-center gap-1">
          {/* Dark / Light toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            {theme === 'dark'
              ? /* Sun */
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-5.66l-.71.71M6.34 17.66l-.71.71M17.66 17.66l-.71-.71M6.34 6.34l-.71-.71M12 7a5 5 0 100 10A5 5 0 0012 7z"/>
                </svg>
              : /* Moon */
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                </svg>
            }
          </button>

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Ayarlar"
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </button>

          {/* New playlist */}
          <button
            onClick={onReset}
            className="text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 px-2 py-1 rounded transition-colors hidden sm:block"
          >
            Yeni Playlist
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: SidePanel */}
        <div className="w-64 shrink-0 bg-gray-800 border-r border-gray-700 overflow-hidden flex flex-col">
          <SidePanel
            groups={groups}
            groupMap={groupMap}
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
            onListChange={handleListChange}
            recentChannels={recentChannels}
            onRecentUpdate={setRecentChannels}
          />
        </div>

        {/* Right: Player */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          <VideoPlayer
            channel={selectedChannel}
            onEnded={handleEnded}
          />
        </div>
      </div>

      {/* ── Settings Modal ── */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
