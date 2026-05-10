import { useState, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { checkPIN, hasPIN } from '../lib/userStore'
import { clearRecentlyPlayed, removeFromRecentlyPlayed } from '../lib/playlistStore'

// ── Constants ──────────────────────────────────────────────────
const RECENT_KEY   = '__recent__'
const FAVS_KEY     = '__favs__'
const MIN_SERIES   = 2          // min episodes to form a sub-group

// ── Series detection ───────────────────────────────────────────
function extractSeriesName(title) {
  const t = title.trim()
  // S01E01 / s1e1
  let m = t.match(/^(.+?)\s+[Ss]\d{1,2}\s*[Ee]\d{1,3}/)
  if (m) return m[1].trim()
  // 01x01 / 1x01
  m = t.match(/^(.+?)\s+\d{1,2}[xX]\d{2,3}/)
  if (m) return m[1].trim()
  // Turkish: Sezon N Bölüm N
  m = t.match(/^(.+?)\s+[Ss]ezon\s*\d+/i)
  if (m) return m[1].trim()
  // "Name - Bölüm N" / "Name - Episode N"
  m = t.match(/^(.+?)\s*[-–]\s*(?:Bölüm|Bolum|Episode|Ep\.?)\s*\d+/i)
  if (m) return m[1].trim()
  return null
}

function buildSeriesMap(channels) {
  const map   = {}    // seriesName → Channel[]
  const loose = []    // channels that don't match any pattern

  for (const ch of channels) {
    const key = extractSeriesName(ch.name)
    if (key) { (map[key] = map[key] ?? []).push(ch) }
    else      { loose.push(ch) }
  }

  const subGroups = []
  for (const [name, chs] of Object.entries(map)) {
    if (chs.length >= MIN_SERIES) subGroups.push({ name, channels: chs })
    else                          loose.push(...chs)
  }
  return { subGroups, loose }
}

// ── VOD / LIVE badge ──────────────────────────────────────────
function isVod(url) {
  if (!url) return false
  return /\.(mp4|mkv|webm|mov|avi|flv|ts|wmv|mpg|mpeg|m4v|3gp)$/i
    .test(url.split('?')[0])
}

function Badge({ url }) {
  return isVod(url)
    ? <span className="text-xs bg-violet-900 text-violet-300 px-1.5 py-0.5 rounded font-semibold shrink-0">VOD</span>
    : <span className="text-xs bg-green-900 text-green-300 px-1.5 py-0.5 rounded font-semibold shrink-0">CANLI</span>
}

// ── PIN unlock modal (inline) ─────────────────────────────────
function PinPrompt({ group, onUnlock, onCancel }) {
  const { unlockGroup } = useApp()
  const [val, setVal]   = useState('')
  const [err, setErr]   = useState('')
  const inputRef        = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function attempt() {
    const ok = await checkPIN(val)
    if (ok) { unlockGroup(group); onUnlock() }
    else    { setErr('Yanlış PIN'); setVal('') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 bg-gray-800 rounded-xl border border-gray-700 p-5 w-72 space-y-3 shadow-2xl">
        <p className="text-sm font-semibold text-white">Grup kilidi: <span className="text-blue-400">{group}</span></p>
        <input
          ref={inputRef}
          type="password"
          value={val}
          onChange={e => { setVal(e.target.value); setErr('') }}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          placeholder="PIN girin"
          className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded transition-colors">
            İptal
          </button>
          <button onClick={attempt}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors">
            Aç
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Custom group creation modal ───────────────────────────────
function CreateGroupModal({ groups, groupMap, onSave, onCancel }) {
  const [name,     setName]     = useState('')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(new Set())

  const results = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    const out = []
    for (const g of groups) {
      for (const ch of groupMap[g] ?? []) {
        if (ch.name.toLowerCase().includes(q)) { out.push(ch); if (out.length >= 80) return out }
      }
    }
    return out
  }, [search, groups, groupMap])

  function toggle(url) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  }

  function handleSave() {
    if (!name.trim()) return
    const channels = []
    for (const g of groups) {
      for (const ch of groupMap[g] ?? []) {
        if (selected.has(ch.url)) channels.push(ch)
      }
    }
    onSave({ id: Date.now().toString(), name: name.trim(), channels })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 bg-gray-800 rounded-xl border border-gray-700 p-4 w-80 space-y-3 shadow-2xl max-h-[80vh] flex flex-col">
        <p className="text-sm font-semibold text-white shrink-0">Yeni Özel Grup</p>

        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Grup adı"
          className="w-full shrink-0 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Kanal ara ve ekle…"
          className="w-full shrink-0 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />

        {selected.size > 0 && (
          <p className="text-xs text-blue-400 shrink-0">{selected.size} kanal seçildi</p>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
          {results.map((ch, i) => (
            <button key={ch.url ?? i} onClick={() => toggle(ch.url)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                selected.has(ch.url) ? 'bg-blue-600/20 text-blue-300' : 'text-gray-300 hover:bg-gray-700'
              }`}>
              {selected.has(ch.url)
                ? <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                : <span className="w-3.5 h-3.5 shrink-0 border border-gray-600 rounded-sm" />
              }
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
          {search.trim() && results.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-3">Kanal bulunamadı</p>
          )}
          {!search.trim() && (
            <p className="text-xs text-gray-500 text-center py-3">Kanal aramak için yazmaya başlayın</p>
          )}
        </div>

        <div className="flex gap-2 justify-end shrink-0">
          <button onClick={onCancel}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded transition-colors">
            İptal
          </button>
          <button onClick={handleSave} disabled={!name.trim() || selected.size === 0}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-1.5 rounded transition-colors">
            Oluştur ({selected.size})
          </button>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// Main SidePanel
// ═════════════════════════════════════════════════════════════
export default function SidePanel({
  groups, groupMap, selectedChannel, onSelectChannel, onListChange,
  recentChannels = [], onRecentUpdate,
}) {
  const {
    isFav, toggleFavorite, favorites,
    isGroupVisible, hideGroup, showGroup,
    customGroups, saveCustomGroups,
    activePlaylistId,
  } = useApp()

  const [view,        setView]        = useState('groups')   // groups | channels
  const [activeGroup, setActiveGroup] = useState(null)
  const [searchText,  setSearchText]  = useState('')
  const [query,       setQuery]       = useState('')
  // Series sub-group expanded state: { [seriesName]: bool }
  const [expanded,    setExpanded]    = useState({})
  // PIN prompt
  const [pinTarget,   setPinTarget]   = useState(null)
  // Custom group modal
  const [showCreate,  setShowCreate]  = useState(false)
  // Context-menu-like group options (right-click / long-press)
  const [groupMenu,   setGroupMenu]   = useState(null)  // group name | null

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchText.trim()), 300)
    return () => clearTimeout(t)
  }, [searchText])

  const isSearching = query.length >= 3

  // ── Derive active group from currently playing channel ────
  const playingGroup = useMemo(() => selectedChannel?.group ?? null, [selectedChannel])

  // ── Search results ────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!isSearching) return []
    const q = query.toLowerCase()
    const out = []
    for (const g of groups) {
      if (!isGroupVisible(g)) continue
      for (const ch of groupMap[g] ?? []) {
        if (ch.name.toLowerCase().includes(q)) {
          out.push({ ...ch, group: g })
          if (out.length >= 150) return out
        }
      }
    }
    return out
  }, [query, isSearching, groups, groupMap, isGroupVisible])

  // ── Notify Dashboard of visible channel list ──────────────
  useEffect(() => {
    if (!onListChange) return
    if (isSearching)               return onListChange(searchResults)
    if (view !== 'channels')       return onListChange([])
    if (activeGroup === RECENT_KEY) return onListChange(recentChannels)
    if (activeGroup === FAVS_KEY)  return onListChange(favorites)
    const cg = customGroups.find(g => g.id === activeGroup)
    if (cg)                        return onListChange(cg.channels)
    onListChange(groupMap[activeGroup] ?? [])
  }, [isSearching, searchResults, view, activeGroup, recentChannels, favorites]) // eslint-disable-line

  // ── Group navigation ──────────────────────────────────────
  function handleSelectGroup(group) {
    setActiveGroup(group)
    setView('channels')
    setExpanded({})
    // FIX: do NOT auto-play first channel on group switch
  }

  function handleBack() {
    setView('groups')
    // keep activeGroup so the playing group stays highlighted
  }

  // ── Handle hidden group click ─────────────────────────────
  function handleHiddenGroupClick(group) {
    if (!hasPIN()) { showGroup(group); return }
    setPinTarget(group)
  }

  // ── Channel-list derived state (hooks must be before early returns) ──
  const isRecent  = activeGroup === RECENT_KEY
  const isFavs    = activeGroup === FAVS_KEY
  const customGrp = !isRecent && !isFavs
    ? customGroups.find(g => g.id === activeGroup)
    : null

  let rawChannels
  if (isRecent)       rawChannels = recentChannels
  else if (isFavs)    rawChannels = favorites
  else if (customGrp) rawChannels = customGrp.channels
  else                rawChannels = groupMap[activeGroup] ?? []

  // Series sub-grouping — useMemo must live before any early return
  const { subGroups, loose } = useMemo(() => {
    if (isRecent || isFavs || customGrp || rawChannels.length < 6) {
      return { subGroups: [], loose: rawChannels }
    }
    return buildSeriesMap(rawChannels)
  }, [rawChannels, isRecent, isFavs, customGrp]) // eslint-disable-line

  // ── Channel row ───────────────────────────────────────────
  function ChannelRow({ channel, showGroup: showGrp, onRemoveRecent }) {
    const active = selectedChannel?.url === channel.url
    const fav    = isFav(channel.url)
    return (
      <div className={`flex items-center gap-1 border-l-4 transition-colors ${
        active ? 'border-blue-500 bg-gray-700' : 'border-transparent hover:bg-gray-700'
      }`}>
        <button
          title={channel.name}
          onClick={() => onSelectChannel(channel)}
          className="flex-1 flex items-center gap-2 px-2 py-2.5 text-left min-w-0"
        >
          <div className="w-7 h-7 rounded bg-gray-600 flex items-center justify-center shrink-0 overflow-hidden">
            {channel.logo
              ? <img src={channel.logo} alt="" className="w-full h-full object-contain"
                  onError={e => { e.target.style.display = 'none' }} />
              : <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v9A2.5 2.5 0 0115.5 16h-11A2.5 2.5 0 012 13.5v-9z"/>
                </svg>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 truncate">{channel.name}</p>
            {showGrp && <p className="text-xs text-gray-500 truncate">{channel.group}</p>}
          </div>
          <Badge url={channel.url} />
        </button>

        {/* Favourite star */}
        <button
          onClick={() => toggleFavorite(channel)}
          title={fav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          className={`shrink-0 p-1.5 transition-colors ${fav ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
        >
          <svg className="w-3.5 h-3.5" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
          </svg>
        </button>

        {/* Remove from recent */}
        {onRemoveRecent && (
          <button
            onClick={onRemoveRecent}
            title="Geçmişten kaldır"
            className="shrink-0 p-1.5 text-gray-600 hover:text-red-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>
    )
  }

  // ── Search bar ────────────────────────────────────────────
  const searchBar = (
    <div className="px-3 py-2 border-b border-gray-700 shrink-0">
      <div className="relative">
        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
        </svg>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Kanal ara… (min. 3 karakter)"
          className="w-full bg-gray-900 border border-gray-600 rounded pl-7 pr-7 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        {searchText && (
          <button onClick={() => setSearchText('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )

  // ── SEARCH VIEW ───────────────────────────────────────────
  if (isSearching) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {searchBar}
        <div className="px-3 py-1.5 border-b border-gray-700 shrink-0">
          <span className="text-xs text-gray-500">{searchResults.length} sonuç</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {searchResults.length === 0
            ? <p className="text-gray-500 text-xs p-4 text-center">Sonuç bulunamadı</p>
            : searchResults.map(ch => (
                <ChannelRow key={ch.url} channel={ch} showGroup />
              ))
          }
        </div>
      </div>
    )
  }

  // ── GROUP LIST VIEW ───────────────────────────────────────
  if (view === 'groups') {
    const visibleGroups  = groups.filter(g => isGroupVisible(g))
    const hiddenGrpNames = groups.filter(g => !isGroupVisible(g))

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {searchBar}
        <div className="px-3 py-2 border-b border-gray-700 shrink-0 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gruplar</span>
            <span className="text-xs text-gray-500 ml-2">{visibleGroups.length}</span>
          </div>
          {/* Create custom group */}
          <button onClick={() => setShowCreate(true)}
            title="Özel grup oluştur"
            className="text-gray-500 hover:text-blue-400 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Favoriler (pinned) ── */}
          {favorites.length > 0 && (
            <GroupRow
              icon={
                <svg className="w-3.5 h-3.5 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                </svg>
              }
              label="Favoriler"
              count={favorites.length}
              labelClass="text-yellow-300"
              countClass="bg-yellow-900 text-yellow-400"
              borderClass="hover:border-yellow-500"
              active={activeGroup === FAVS_KEY && view === 'channels'}
              onClick={() => handleSelectGroup(FAVS_KEY)}
            />
          )}

          {/* ── Son Oynatılanlar (pinned) ── */}
          {recentChannels.length > 0 && (
            <GroupRow
              icon={
                <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              }
              label="Son Oynatılanlar"
              count={recentChannels.length}
              labelClass="text-amber-300"
              countClass="bg-amber-900 text-amber-400"
              borderClass="hover:border-amber-500"
              active={activeGroup === RECENT_KEY && view === 'channels'}
              onClick={() => handleSelectGroup(RECENT_KEY)}
            />
          )}

          {/* ── Custom groups ── */}
          {customGroups.map(cg => (
            <GroupRow
              key={cg.id}
              icon={
                <svg className="w-3.5 h-3.5 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              }
              label={cg.name}
              count={cg.channels.length}
              labelClass="text-purple-300"
              countClass="bg-purple-900 text-purple-400"
              borderClass="hover:border-purple-500"
              active={activeGroup === cg.id && view === 'channels'}
              onClick={() => handleSelectGroup(cg.id)}
              onDelete={() => {
                const next = customGroups.filter(g => g.id !== cg.id)
                saveCustomGroups(next)
              }}
            />
          ))}

          {/* ── Regular visible groups ── */}
          {visibleGroups.map(group => (
            <GroupRow
              key={group}
              label={group}
              count={groupMap[group]?.length ?? 0}
              active={activeGroup === group && view === 'channels'}
              playing={playingGroup === group}
              onClick={() => handleSelectGroup(group)}
              onHide={() => {
                hideGroup(group)
                if (activeGroup === group) handleBack()
              }}
            />
          ))}

          {/* ── Hidden groups (locked) ── */}
          {hiddenGrpNames.length > 0 && (
            <div className="px-3 pt-3 pb-1">
              <p className="text-xs text-gray-600 uppercase tracking-wider">Gizli Gruplar</p>
            </div>
          )}
          {hiddenGrpNames.map(group => (
            <button key={group} onClick={() => handleHiddenGroupClick(group)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left border-l-4 border-transparent hover:border-gray-500 hover:bg-gray-700 transition-colors opacity-50">
              <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <span className="flex-1 text-sm text-gray-500 truncate">{group}</span>
            </button>
          ))}
        </div>

        {pinTarget && (
          <PinPrompt
            group={pinTarget}
            onUnlock={() => setPinTarget(null)}
            onCancel={() => setPinTarget(null)}
          />
        )}

        {showCreate && (
          <CreateGroupModal
            groups={groups}
            groupMap={groupMap}
            onSave={cg => {
              saveCustomGroups([...customGroups, cg])
              setShowCreate(false)
            }}
            onCancel={() => setShowCreate(false)}
          />
        )}
      </div>
    )
  }

  // ── CHANNEL LIST VIEW ─────────────────────────────────────

  async function removeRecent(ch) {
    if (activePlaylistId == null) return
    await removeFromRecentlyPlayed(activePlaylistId, ch.url).catch(() => {})
    onRecentUpdate?.(prev => prev.filter(c => c.url !== ch.url))
  }

  async function clearAllRecent() {
    if (activePlaylistId == null) return
    await clearRecentlyPlayed(activePlaylistId).catch(() => {})
    onRecentUpdate?.(() => [])
  }

  const headerLabel = isRecent ? 'Son Oynatılanlar'
    : isFavs ? 'Favoriler'
    : customGrp ? customGrp.name
    : activeGroup

  const isSpecial = isRecent || isFavs || !!customGrp

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {searchBar}

      {/* List header */}
      <div className={`flex items-center gap-2 px-2 py-2 border-b shrink-0 ${
        isRecent ? 'border-amber-900/50' : isFavs ? 'border-yellow-900/50' : 'border-gray-700'
      }`}>
        <button onClick={handleBack}
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <span className={`flex-1 text-sm font-semibold truncate ${
          isRecent ? 'text-amber-300' : isFavs ? 'text-yellow-300' : customGrp ? 'text-purple-300' : 'text-white'
        }`} title={headerLabel}>
          {headerLabel}
        </span>
        <span className="text-xs text-gray-500 shrink-0">{rawChannels.length}</span>

        {/* Clear all recent */}
        {isRecent && rawChannels.length > 0 && (
          <button onClick={clearAllRecent}
            title="Tümünü temizle"
            className="p-1 text-gray-600 hover:text-red-400 transition-colors shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        )}
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {/* Sub-groups (series) */}
        {subGroups.map(sg => (
          <div key={sg.name}>
            <button
              onClick={() => setExpanded(p => ({ ...p, [sg.name]: !p[sg.name] }))}
              className="w-full flex items-center gap-2 px-3 py-2 text-left bg-gray-700/50 hover:bg-gray-700 transition-colors border-l-4 border-transparent hover:border-blue-400"
            >
              <svg className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${expanded[sg.name] ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
              <span className="flex-1 text-xs font-semibold text-gray-300 truncate">{sg.name}</span>
              <span className="text-xs bg-gray-600 text-gray-400 rounded px-1.5 py-0.5 shrink-0">{sg.channels.length}</span>
            </button>
            {expanded[sg.name] && sg.channels.map(ch => (
              <div key={ch.url} className="pl-4">
                <ChannelRow channel={ch} showGroup={false} />
              </div>
            ))}
          </div>
        ))}

        {/* Loose / regular channels */}
        {loose.map(ch => (
          <ChannelRow
            key={ch.url}
            channel={ch}
            showGroup={isSpecial}
            onRemoveRecent={isRecent ? () => removeRecent(ch) : undefined}
          />
        ))}

        {rawChannels.length === 0 && (
          <p className="text-gray-500 text-xs p-4 text-center">
            {isRecent ? 'Henüz kanal oynatılmadı.' : isFavs ? 'Favori kanal yok.' : 'Kanal yok.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Reusable group row ─────────────────────────────────────────
function GroupRow({
  icon, label, count, labelClass = 'text-gray-200', countClass = 'bg-gray-600 text-gray-400',
  borderClass = 'hover:border-blue-500', active, playing, onClick, onHide, onDelete,
}) {
  return (
    <div className={`flex items-center border-l-4 transition-colors ${
      active ? 'border-blue-500 bg-gray-700' : `border-transparent ${borderClass} hover:bg-gray-700`
    }`}>
      <button onClick={onClick} className="flex-1 flex items-center gap-2 px-3 py-2.5 text-left min-w-0">
        {icon}
        <span className={`flex-1 text-sm truncate ${labelClass}`} title={label}>
          {playing && !active && <span className="mr-1 text-blue-400">▶</span>}
          {label}
        </span>
        <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${countClass}`}>{count}</span>
        <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
        </svg>
      </button>

      {/* Hide group button */}
      {onHide && (
        <button onClick={e => { e.stopPropagation(); onHide() }}
          title="Grubu gizle"
          className="shrink-0 p-1.5 text-gray-600 hover:text-gray-300 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
          </svg>
        </button>
      )}

      {/* Delete custom group */}
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          title="Özel grubu sil"
          className="shrink-0 p-1.5 text-gray-600 hover:text-red-400 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  )
}
