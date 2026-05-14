import { useState, useEffect } from 'react'
import InitialScreen from './components/InitialScreen'
import LoadingScreen from './components/LoadingScreen'
import Dashboard     from './components/Dashboard'
import { savePlaylist, listPlaylists, loadPlaylist, deletePlaylist, renamePlaylist,
         addRecentlyPlayed, getRecentlyPlayed } from './lib/playlistStore'
import { useApp } from './context/AppContext'

const tick = () => new Promise(r => setTimeout(r, 0))

// ── Adult-content guard ───────────────────────────────────────
// Channels whose name or group matches any of these patterns are
// silently excluded from the recently-played history.
const ADULT_RE = /\b(18\s*\+|\+\s*18|xxx|x{2,}|porn|porno|eroti[ck]|adult|sex\b|x-rated)\b/i

function isAdultChannel(channel) {
  return ADULT_RE.test(channel.name ?? '') || ADULT_RE.test(channel.group ?? '')
}


function resolveUrl(raw, base) {
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return 'http:' + raw
  try { return new URL(raw, base).href } catch { return raw }
}

function parseM3U(text, baseUrl) {
  const lines = text.split('\n')
  const groupMap = {}
  const groups   = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXTINF')) continue
    const rawUrl = lines[i + 1]?.trim()
    if (!rawUrl || rawUrl.startsWith('#')) continue
    const streamUrl = resolveUrl(rawUrl, baseUrl)
    if (!streamUrl) continue
    const name  = line.match(/,(.+)$/)?.[1]?.trim()                   ?? 'Kanal'
    const logo  = line.match(/tvg-logo="([^"]+)"/)?.[1]               ?? ''
    const group = line.match(/group-title="([^"]+)"/)?.[1]            ?? 'Diğer'
    if (!groupMap[group]) { groupMap[group] = []; groups.push(group) }
    groupMap[group].push({ name, logo, url: streamUrl, group })
  }
  return { groupMap, groups }
}

export default function App() {
  const { setActivePlaylistId: ctxSetPlaylistId } = useApp()
  const [appState,  setAppState]  = useState('initial')
  const [url,       setUrl]       = useState('')
  const [groupMap,  setGroupMap]  = useState({})
  const [groups,    setGroups]    = useState([])
  const [selected,  setSelected]  = useState(null)
  const [error,     setError]     = useState('')
  const [loadingMsg,    setLoadingMsg]    = useState('')
  const [loadingDetail, setLoadingDetail] = useState('')
  const [savedList,       setSavedList]       = useState([])
  const [activePlaylistId, setActivePlaylistId] = useState(null)
  const [recentChannels,   setRecentChannels]   = useState([])

  // Load saved-playlist list on mount
  useEffect(() => {
    listPlaylists().then(setSavedList).catch(() => {})
  }, [])

  // Persist recently played whenever the selected channel changes
  useEffect(() => {
    if (!selected || activePlaylistId == null) return
    if (isAdultChannel(selected)) return          // skip +18 / XXX channels
    addRecentlyPlayed(activePlaylistId, selected).catch(() => {})
    setRecentChannels(prev => {
      const filtered = prev.filter(c => c.url !== selected.url)
      return [{ ...selected, playedAt: Date.now() }, ...filtered].slice(0, 30)
    })
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load from URL ─────────────────────────────────────────
  async function handleLoad(inputUrl) {
    const trimmed = inputUrl.trim()
    if (!trimmed) return
    setError('')
    setLoadingMsg('Playlist indiriliyor...')
    setLoadingDetail(trimmed)
    setAppState('loading')
    await tick()

    try {
      const res = await fetch(trimmed)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      setLoadingMsg('İçerik okunuyor...')
      setLoadingDetail('Dosya boyutu hesaplanıyor')
      await tick()

      const text = await res.text()
      const kb   = Math.round(text.length / 1024)

      setLoadingMsg('İçerik işleniyor...')
      setLoadingDetail(`${kb.toLocaleString()} KB veri alındı`)
      await tick()

      setLoadingMsg('Gruplar oluşturuluyor...')
      setLoadingDetail('Kanal grupları ayrıştırılıyor')
      await tick()

      const { groupMap: gm, groups: gs } = parseM3U(text, trimmed)
      if (gs.length === 0) throw new Error('Playlist boş veya geçersiz format.')

      const total = gs.reduce((s, g) => s + gm[g].length, 0)
      setLoadingMsg('Kanallar yükleniyor...')
      setLoadingDetail(`${gs.length} grup, ${total.toLocaleString()} kanal bulundu`)
      await tick()

      // Persist to IndexedDB (fire-and-forget, update sidebar list when done)
      savePlaylist({ url: trimmed, groupMap: gm, groups: gs })
        .then(id => {
          setActivePlaylistId(id)
          ctxSetPlaylistId(id)
          getRecentlyPlayed(id).then(setRecentChannels).catch(() => {})
          return listPlaylists().then(setSavedList)
        })
        .catch(() => {})

      setGroupMap(gm)
      setGroups(gs)
      setSelected(null)
      setAppState('loaded')
    } catch (err) {
      setError(err.message || 'Playlist yüklenemedi.')
      setAppState('initial')
    }
  }

  // ── Load from cache ───────────────────────────────────────
  async function handleLoadSaved(id) {
    setLoadingMsg('Playlist yükleniyor...')
    setLoadingDetail('Önbellekten okunuyor…')
    setAppState('loading')
    await tick()

    try {
      const data = await loadPlaylist(id)
      if (!data || !data.groups?.length) throw new Error('Önbellek verisi bulunamadı.')

      setActivePlaylistId(id)
      ctxSetPlaylistId(id)
      setGroupMap(data.groupMap)
      setGroups(data.groups)
      setSelected(null)
      setRecentChannels([])
      getRecentlyPlayed(id).then(setRecentChannels).catch(() => {})
      setAppState('loaded')
    } catch (err) {
      setError(err.message)
      setAppState('initial')
    }
  }

  // ── Re-fetch & update saved playlist from its URL ────────
  async function handleUpdateSaved(id, url) {
    setLoadingMsg('Playlist güncelleniyor...')
    setLoadingDetail(url)
    setAppState('loading')
    await tick()
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const { groupMap: gm, groups: gs } = parseM3U(text, url)
      if (gs.length === 0) throw new Error('Playlist boş veya geçersiz format.')
      // Overwrite with same id by re-saving (savePlaylist upserts by URL)
      await savePlaylist({ url, groupMap: gm, groups: gs })
      const list = await listPlaylists()
      setSavedList(list)
      setAppState('initial')
    } catch (err) {
      setError(err.message || 'Playlist güncellenemedi.')
      setAppState('initial')
    }
  }

  // ── Load from local file (no upload — FileReader only) ───────
  async function handleLoadFile(file) {
    setError('')
    setLoadingMsg('Dosya okunuyor...')
    setLoadingDetail(file.name)
    setAppState('loading')
    await tick()

    try {
      const text = await file.text()
      const kb   = Math.round(text.length / 1024)

      setLoadingMsg('İçerik işleniyor...')
      setLoadingDetail(`${kb.toLocaleString()} KB`)
      await tick()

      const { groupMap: gm, groups: gs } = parseM3U(text, '')
      if (gs.length === 0) throw new Error('Geçerli M3U kanalı bulunamadı.')

      const total = gs.reduce((s, g) => s + gm[g].length, 0)
      setLoadingMsg('Kanallar yükleniyor...')
      setLoadingDetail(`${gs.length} grup, ${total.toLocaleString()} kanal bulundu`)
      await tick()

      const pseudoUrl = `local://${file.name}`
      savePlaylist({ url: pseudoUrl, groupMap: gm, groups: gs })
        .then(id => {
          setActivePlaylistId(id)
          ctxSetPlaylistId(id)
          getRecentlyPlayed(id).then(setRecentChannels).catch(() => {})
          return listPlaylists().then(setSavedList)
        })
        .catch(() => {})

      setGroupMap(gm)
      setGroups(gs)
      setSelected(null)
      setAppState('loaded')
    } catch (err) {
      setError(err.message || 'Dosya okunamadı.')
      setAppState('initial')
    }
  }

  // ── Delete from cache ─────────────────────────────────────
  async function handleDeleteSaved(id) {
    await deletePlaylist(id).catch(() => {})
    setSavedList(prev => prev.filter(p => p.id !== id))
  }

  // ── Rename in cache ───────────────────────────────────────
  async function handleRenameSaved(id, newName) {
    await renamePlaylist(id, newName).catch(() => {})
    setSavedList(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p))
  }

  // ── Render ────────────────────────────────────────────────
  if (appState === 'initial') {
    return (
      <InitialScreen
        url={url}
        setUrl={setUrl}
        onLoad={handleLoad}
        error={error}
        savedList={savedList}
        onLoadSaved={handleLoadSaved}
        onDeleteSaved={handleDeleteSaved}
        onRenameSaved={handleRenameSaved}
        onUpdateSaved={handleUpdateSaved}
        onLoadFile={handleLoadFile}
      />
    )
  }
  if (appState === 'loading') {
    return <LoadingScreen message={loadingMsg} detail={loadingDetail} />
  }
  return (
    <Dashboard
      groupMap={groupMap}
      groups={groups}
      selectedChannel={selected}
      setSelectedChannel={setSelected}
      recentChannels={recentChannels}
      setRecentChannels={setRecentChannels}
      onReset={() => { setAppState('initial'); setUrl('') }}
    />
  )
}
