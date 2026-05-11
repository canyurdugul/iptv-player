/**
 * opensubtitles.js
 * Thin client for the OpenSubtitles REST API v1.
 * API key is stored in localStorage under 'os_api_key'.
 * Free tier: 5 req/s, 20 subtitle downloads/day per key.
 * Docs: https://opensubtitles.stoplight.io/
 */

const BASE        = 'https://api.opensubtitles.com/api/v1'
const KEY_STORAGE = 'os_api_key'
const APP_NAME    = 'TVPlaylistPlayer v1'

// ── API key helpers ───────────────────────────────────────────
export function getApiKey()          { return localStorage.getItem(KEY_STORAGE) ?? '' }
export function saveApiKey(key)      { localStorage.setItem(KEY_STORAGE, key.trim()) }
export function clearApiKey()        { localStorage.removeItem(KEY_STORAGE) }

function headers() {
  const key = getApiKey()
  return {
    'Api-Key':      key,
    'Content-Type': 'application/json',
    'User-Agent':   APP_NAME,
  }
}

// ── Title cleaner ─────────────────────────────────────────────
// Strips quality/codec tags and normalises separators so channel
// names like "Money.Heist.S01E01.1080p.WEB-DL" become searchable.
export function extractTitle(raw) {
  if (!raw) return ''
  let t = raw
    .replace(/[._]/g, ' ')
    // cut at first quality/codec token
    .replace(/\b(1080p?|720p?|480p?|4K|UHD|BluRay|BDRip|WEBRip|WEB[\s-]DL|HDRip|DVDRip|HDTV|AMZN|DSNP|NF|HMAX)\b.*/i, '')
    .replace(/\b(x264|x265|HEVC|AVC|AAC|AC3|DTS|H[\s.]?264|H[\s.]?265|REMUX)\b.*/i, '')
    .replace(/\b(YIFY|YTS|RARBG|FGT|NTb|EVO|FLUX|CMRG)\b.*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return t
}

// ── Search subtitles ──────────────────────────────────────────
/**
 * @param {string} query    cleaned title (may include SxxExx)
 * @param {string} language ISO 639-1 code, e.g. 'tr', 'en'
 * @returns {Array}  normalised subtitle objects
 */
export async function searchSubtitles(query, language = 'tr') {
  const params = new URLSearchParams({
    query,
    languages:  language,
    per_page:   '15',
    order_by:   'download_count',
    order_direction: 'desc',
  })

  const res = await fetch(`${BASE}/subtitles?${params}`, { headers: headers() })

  if (res.status === 401) throw new Error('Geçersiz API anahtarı')
  if (res.status === 429) throw new Error('İstek limiti aşıldı, biraz bekle')
  if (!res.ok)            throw new Error(`OpenSubtitles HTTP ${res.status}`)

  const json = await res.json()
  return (json.data ?? []).map(item => {
    const attr = item.attributes ?? {}
    const file = (attr.files ?? [])[0] ?? {}
    return {
      id:            item.id,
      fileId:        file.file_id,
      fileName:      file.file_name ?? 'subtitle',
      language:      attr.language,
      release:       attr.release ?? attr.feature_details?.title ?? query,
      downloads:     attr.download_count ?? 0,
      year:          attr.feature_details?.year,
      rating:        attr.ratings ?? 0,
      fromTrusted:   attr.from_trusted ?? false,
      aiTranslated:  attr.ai_translated ?? false,
    }
  }).filter(s => s.fileId)
}

// ── Request download link ─────────────────────────────────────
export async function requestDownload(fileId) {
  const res = await fetch(`${BASE}/download`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ file_id: fileId }),
  })

  if (res.status === 401) throw new Error('Geçersiz API anahtarı')
  if (res.status === 406) throw new Error('Günlük indirme limitine ulaştın (20/gün)')
  if (res.status === 429) throw new Error('İstek limiti aşıldı, biraz bekle')
  if (!res.ok)            throw new Error(`İndirme isteği başarısız: HTTP ${res.status}`)

  return res.json()   // { link, file_name, requests, allowed, reset_time }
}

// ── Download subtitle file → Blob URL ────────────────────────
export async function downloadSubtitle(fileId) {
  const { link, file_name } = await requestDownload(fileId)

  const r = await fetch(link)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const text = await r.text()

  // Convert SRT → VTT if needed
  const isSrt = /\.srt$/i.test(file_name) || !file_name.endsWith('.vtt')
  const vtt   = isSrt ? srtToVtt(text) : text

  return {
    blobUrl:  URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })),
    fileName: file_name,
  }
}

// ── SRT → WebVTT ──────────────────────────────────────────────
function srtToVtt(raw) {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const cues = text
    .split(/\n{2,}/)
    .map(block => {
      const lines = block.trim().split('\n')
      const start = /^\d+$/.test(lines[0].trim()) ? 1 : 0
      return lines.slice(start).join('\n').trim()
    })
    .filter(c => c.includes('-->'))
    .map(c => c.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'))

  return 'WEBVTT\n\n' + cues.join('\n\n')
}
