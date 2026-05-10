import { useState, useRef, useEffect, useCallback } from 'react'

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

function TVIcon() {
  return (
    <div className="w-8 h-8 border-2 border-blue-400 rounded flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v9A2.5 2.5 0 0115.5 16h-11A2.5 2.5 0 012 13.5v-9zM4.5 4a.5.5 0 00-.5.5v9a.5.5 0 00.5.5h11a.5.5 0 00.5-.5v-9a.5.5 0 00-.5-.5h-11z"/>
        <path d="M6 17h8v1H6v-1z"/>
      </svg>
    </div>
  )
}

// ── Saved playlist row ────────────────────────────────────────
function SavedRow({ item, onLoad, onDelete, onRename, onUpdate }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing,       setEditing]       = useState(false)
  const [draft,         setDraft]         = useState(item.name)
  const inputRef = useRef(null)

  // Focus & select all when edit mode opens
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function commitRename() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.name) onRename(item.id, trimmed)
    else setDraft(item.name)   // revert if empty / unchanged
    setEditing(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setDraft(item.name); setEditing(false) }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 hover:border-gray-600 transition-colors group">
      {/* Icon */}
      <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 6h16M4 10h16M4 14h10M4 18h6"/>
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitRename}
            className="w-full bg-gray-800 border border-blue-500 rounded px-1.5 py-0.5 text-sm text-white focus:outline-none"
          />
        ) : (
          <div className="flex items-center gap-1 min-w-0">
            <p className="text-sm text-white font-medium truncate" title={item.url}>
              {item.name}
            </p>
            {/* Pencil — visible on hover */}
            <button
              onClick={() => { setDraft(item.name); setEditing(true) }}
              title="İsmi düzenle"
              className="opacity-0 group-hover:opacity-100 shrink-0 text-gray-600 hover:text-gray-300 transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z"/>
              </svg>
            </button>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-0.5">
          {item.channelCount.toLocaleString('tr-TR')} kanal
          &nbsp;·&nbsp;
          {item.groupCount} grup
          &nbsp;·&nbsp;
          {formatDate(item.savedAt)}
        </p>
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-400 mr-1">Emin misin?</span>
              <button
                onClick={() => onDelete(item.id)}
                className="text-xs bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded transition-colors"
              >
                Sil
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition-colors"
              >
                İptal
              </button>
            </>
          ) : (
            <>
              {/* Delete (only visible on hover) */}
              <button
                onClick={() => setConfirmDelete(true)}
                title="Önbellekten sil"
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 p-1.5 rounded transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>

              {/* Update from URL — hidden for local files */}
              {!item.url.startsWith('local://') && <button
                onClick={() => onUpdate(item.id, item.url)}
                title="Playlist'i linkinden güncelle"
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-blue-400 p-1.5 rounded transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>}

              {/* Load */}
              <button
                onClick={() => onLoad(item.id)}
                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Aç
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function InitialScreen({ url, setUrl, onLoad, onLoadFile, error, savedList = [], onLoadSaved, onDeleteSaved, onRenameSaved, onUpdateSaved }) {
  const [showNew, setShowNew] = useState(savedList.length === 0)
  const fileInputRef = useRef(null)

  const hasSaved = savedList.length > 0

  function handleKey(e) {
    if (e.key === 'Enter') onLoad(url)
  }

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) onLoadFile(file)
    e.target.value = ''   // reset so same file can be re-selected
  }, [onLoadFile])

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-2xl flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center gap-2">
          <TVIcon />
          <span className="text-sm font-semibold text-gray-300 tracking-widest uppercase">
            IPTV Player
          </span>
        </div>

        {/* ── Saved playlists ─────────────────────────────── */}
        {hasSaved && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Kayıtlı Playlistler
            </p>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5">
              {savedList.map(item => (
                <SavedRow
                  key={item.id}
                  item={item}
                  onLoad={onLoadSaved}
                  onRename={onRenameSaved}
                  onUpdate={onUpdateSaved}
                  onDelete={id => {
                    onDeleteSaved(id)
                    if (savedList.length === 1) setShowNew(true)
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── New playlist section ─────────────────────────── */}
        {hasSaved && !showNew ? (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Yeni Playlist Ekle
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            {hasSaved && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-700"/>
                <span className="text-xs text-gray-500">Yeni Playlist</span>
                <div className="flex-1 h-px bg-gray-700"/>
              </div>
            )}

            {/* URL input */}
            <div>
              {!hasSaved && (
                <label className="block text-sm text-gray-400 mb-2">
                  M3U Playlist URL Girin:
                </label>
              )}
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={handleKey}
                placeholder="https://ornek.com/playlist.m3u"
                autoFocus={!hasSaved || showNew}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => onLoad(url)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                YÜKLE
              </button>
              {hasSaved && (
                <button
                  onClick={() => { setShowNew(false); setUrl('') }}
                  className="px-4 py-2.5 rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors"
                >
                  İptal
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-700" />
              <span className="text-xs text-gray-600">ya da</span>
              <div className="flex-1 h-px bg-gray-700" />
            </div>

            {/* Local file picker — reads the file in-browser, no upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".m3u,.m3u8,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 7a2 2 0 012-2h3l2 3h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
              </svg>
              Bilgisayardan M3U Seç
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
