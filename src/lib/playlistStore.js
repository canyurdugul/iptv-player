/**
 * playlistStore.js
 * IndexedDB-backed playlist history.
 *
 * Two object stores:
 *   playlists_meta  – small metadata rows (no channel data)
 *   playlists_data  – full { groupMap, groups } blobs
 *
 * This split lets listPlaylists() stay fast even for huge playlists,
 * because reading metadata never touches the large channel data.
 */

const DB_NAME    = 'tvplayer-db'
const DB_VERSION = 2
const META       = 'playlists_meta'
const DATA       = 'playlists_data'
const RECENT     = 'recently_played'

// ── DB open (singleton) ───────────────────────────────────────
let _db = null

function openDb() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(META)) {
        const ms = db.createObjectStore(META, { keyPath: 'id', autoIncrement: true })
        ms.createIndex('url', 'url', { unique: true })
      }
      if (!db.objectStoreNames.contains(DATA)) {
        db.createObjectStore(DATA, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(RECENT)) {
        const rs = db.createObjectStore(RECENT, { keyPath: 'id', autoIncrement: true })
        rs.createIndex('playlistId', 'playlistId')
        rs.createIndex('playlistId_url', ['playlistId', 'url'], { unique: true })
      }
    }
    req.onsuccess  = e => { _db = e.target.result; resolve(_db) }
    req.onerror    = e => reject(e.target.error)
  })
}

// ── Transaction helper ────────────────────────────────────────
function run(stores, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode)
    t.onerror = e => reject(e.target.error)
    fn(t, resolve)
  }))
}

// ── Derive display name from URL ──────────────────────────────
export function playlistName(url) {
  if (url.startsWith('local://')) return url.slice(8)   // just the filename
  try {
    const u = new URL(url)
    return u.hostname + (u.port ? `:${u.port}` : '')
  } catch {
    return url.slice(0, 40)
  }
}

// ── Save (insert or overwrite by URL) ─────────────────────────
export function savePlaylist({ url, groupMap, groups }) {
  const channelCount = groups.reduce((s, g) => s + (groupMap[g]?.length ?? 0), 0)
  const meta = {
    url,
    name:         playlistName(url),
    savedAt:      Date.now(),
    channelCount,
    groupCount:   groups.length,
  }

  return run([META, DATA], 'readwrite', (t, resolve) => {
    const ms = t.objectStore(META)
    const ds = t.objectStore(DATA)
    let savedId = null

    // Check if URL already exists → update in place
    ms.index('url').getKey(url).onsuccess = e => {
      const existingId = e.target.result

      if (existingId != null) {
        savedId = existingId
        ms.put({ ...meta, id: existingId })
        ds.put({ id: existingId, groupMap, groups })
      } else {
        ms.add(meta).onsuccess = ev => {
          savedId = ev.target.result
          ds.add({ id: savedId, groupMap, groups })
        }
      }
    }

    t.oncomplete = () => resolve(savedId)
  })
}

/** Returns metadata rows sorted newest-first. Never includes groupMap. */
export function listPlaylists() {
  return run([META], 'readonly', (t, resolve) => {
    t.objectStore(META).getAll().onsuccess = e => {
      resolve((e.target.result ?? []).sort((a, b) => b.savedAt - a.savedAt))
    }
  })
}

/** Returns the full { groupMap, groups } for a playlist id. */
export function loadPlaylist(id) {
  return run([DATA], 'readonly', (t, resolve) => {
    t.objectStore(DATA).get(id).onsuccess = e => resolve(e.target.result ?? null)
  })
}

/** Updates only the display name of a playlist (meta store only). */
export function renamePlaylist(id, name) {
  return run([META], 'readwrite', (t, resolve) => {
    const ms = t.objectStore(META)
    ms.get(id).onsuccess = e => {
      const row = e.target.result
      if (row) ms.put({ ...row, name: name.trim() || row.name })
    }
    t.oncomplete = () => resolve()
  })
}

/** Removes a playlist from both stores. */
export function deletePlaylist(id) {
  return run([META, DATA], 'readwrite', (t, resolve) => {
    t.objectStore(META).delete(id)
    t.objectStore(DATA).delete(id)
    t.oncomplete = () => resolve()
  })
}

// ── Recently played ───────────────────────────────────────────

const RECENT_LIMIT = 30

/**
 * Upserts a channel into the recently-played list for a playlist.
 * If the channel was already played before, only playedAt is updated.
 */
export function addRecentlyPlayed(playlistId, channel) {
  return run([RECENT], 'readwrite', (t, resolve) => {
    const rs = t.objectStore(RECENT)
    rs.index('playlistId_url').getKey([playlistId, channel.url]).onsuccess = e => {
      const existingId = e.target.result
      if (existingId != null) {
        rs.get(existingId).onsuccess = ev => {
          const row = ev.target.result
          if (row) rs.put({ ...row, playedAt: Date.now() })
        }
      } else {
        rs.add({
          playlistId,
          url:      channel.url,
          name:     channel.name,
          logo:     channel.logo  ?? '',
          group:    channel.group ?? '',
          playedAt: Date.now(),
        })
      }
    }
    t.oncomplete = () => resolve()
  })
}

/** Returns up to RECENT_LIMIT channels for a playlist, newest first. */
export function getRecentlyPlayed(playlistId) {
  return run([RECENT], 'readonly', (t, resolve) => {
    t.objectStore(RECENT).index('playlistId').getAll(playlistId).onsuccess = e => {
      const rows = (e.target.result ?? [])
        .sort((a, b) => b.playedAt - a.playedAt)
        .slice(0, RECENT_LIMIT)
      resolve(rows)
    }
  })
}

/** Removes a single channel from the recently-played list. */
export function removeFromRecentlyPlayed(playlistId, channelUrl) {
  return run([RECENT], 'readwrite', (t, resolve) => {
    t.objectStore(RECENT).index('playlistId_url').getKey([playlistId, channelUrl]).onsuccess = e => {
      if (e.target.result != null) t.objectStore(RECENT).delete(e.target.result)
    }
    t.oncomplete = () => resolve()
  })
}

/** Clears the entire recently-played list for a playlist. */
export function clearRecentlyPlayed(playlistId) {
  return run([RECENT], 'readwrite', (t, resolve) => {
    const index  = t.objectStore(RECENT).index('playlistId')
    const req    = index.openCursor(IDBKeyRange.only(playlistId))
    req.onsuccess = e => {
      const cursor = e.target.result
      if (cursor) { cursor.delete(); cursor.continue() }
    }
    t.oncomplete = () => resolve()
  })
}
