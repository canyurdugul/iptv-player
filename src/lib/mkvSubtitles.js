/**
 * mkvSubtitles.js
 * MKV subtitle extractor powered by matroska-subtitles.
 * Track detection reads only the first 256 KB via a Range request.
 * Extraction feeds the file in 2 MB Range chunks — no full download.
 */

import { SubtitleParser } from 'matroska-subtitles'

// ── Language display names ────────────────────────────────────
const LANG = {
  tur:'Türkçe', eng:'İngilizce', deu:'Almanca', fra:'Fransızca',
  spa:'İspanyolca', ita:'İtalyanca', por:'Portekizce', rus:'Rusça',
  ara:'Arapça', jpn:'Japonca', kor:'Korece', zho:'Çince',
}
const langName = c =>
  !c ? 'Bilinmiyor' : (LANG[c.toLowerCase().split(/[-_]/)[0]] ?? c)

// ── WebVTT timestamp ──────────────────────────────────────────
function vttTime(ms) {
  const t  = Math.max(0, Math.round(ms))
  const h  = Math.floor(t / 3_600_000)
  const m  = Math.floor(t % 3_600_000 / 60_000)
  const s  = Math.floor(t % 60_000 / 1_000)
  const cs = t % 1_000
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(3,'0')}`
}

// ── ASS/SSA override-tag strip ────────────────────────────────
// matroska-subtitles already isolates the text field from Dialogue lines;
// we still need to remove inline style tags like {\an8} {\c&HFF&}.
function cleanAss(text) {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .trim()
}

// ── Feed an ArrayBuffer into a SubtitleParser (push-based) ───
function feedBuffer(parser, arrayBuffer) {
  // matroska-subtitles expects a Node-style Buffer / Uint8Array
  parser.write(new Uint8Array(arrayBuffer))
}

// ── PUBLIC: detect subtitle tracks (≤ 256 KB download) ───────
export async function getSubtitleTracks(url) {
  const res = await fetch(url, { headers: { Range: 'bytes=0-262143' } })
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
  const buf = await res.arrayBuffer()

  return new Promise((resolve, reject) => {
    const parser = new SubtitleParser()
    let settled  = false

    function done(tracks) {
      if (settled) return
      settled = true
      resolve({
        subtitleTracks: tracks
          // skip bitmap-only formats
          .filter(t => !/pgssub|vobsub|dvbsub/i.test(t.type ?? ''))
          .map((t, i) => ({
            trackNum: t.number,
            codec:    `S_TEXT/${(t.type || 'utf8').toUpperCase()}`,
            lang:     t.language || '',
            label:    t.name || langName(t.language) || `Altyazı ${i + 1}`,
          })),
      })
    }

    parser.once('tracks', done)
    // finish fires after end() — resolve with empty if no tracks found
    parser.once('finish', () => done([]))
    parser.once('error',  reject)

    feedBuffer(parser, buf)
    parser.end()
  })
}

// ── PUBLIC: extract subtitles for one track ───────────────────
/**
 * Downloads the MKV in 2 MB Range chunks, feeds each into a fresh
 * SubtitleParser, and returns a WebVTT Blob URL.
 *
 * @param {string}   url        MKV file URL
 * @param {object}   trackInfo  { trackNum, codec, label }
 * @param {object}   _meta      (unused — kept for API compat with MkvPanel)
 * @param {Function} onProgress called with 0–100
 * @returns {string} Blob URL for a text/vtt file
 */
export async function extractSubtitles(url, trackInfo, _meta, onProgress) {
  const { trackNum, codec } = trackInfo
  const isAss = /ASS|SSA/i.test(codec)

  onProgress?.(2)

  const parser = new SubtitleParser()
  const frames = []

  parser.on('subtitle', (sub, num) => {
    if (num !== trackNum) return
    const text = isAss ? cleanAss(sub.text) : sub.text.replace(/\r\n?/g, '\n').trim()
    if (!text) return
    frames.push({
      startMs: sub.time,
      endMs:   sub.time + (sub.duration ?? 3_000),
    text,
    })
  })

  // ── Chunked Range fetch ───────────────────────────────────
  const CHUNK    = 2 * 1024 * 1024
  let   pos      = 0
  let   fileSize = 0
  let   downloaded = 0

  onProgress?.(5)

  while (true) {
    const res = await fetch(url, { headers: { Range: `bytes=${pos}-${pos + CHUNK - 1}` } })
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)

    // Grab total once from Content-Range: bytes A-B/TOTAL
    if (!fileSize) {
      const m = (res.headers.get('Content-Range') || '').match(/\/(\d+)$/)
      if (m) fileSize = parseInt(m[1], 10)
    }

    const raw = new Uint8Array(await res.arrayBuffer())
    if (!raw.length) break

    downloaded += raw.length
    if (fileSize) onProgress?.(5 + Math.round(63 * downloaded / fileSize))

    parser.write(raw)

    pos += raw.length
    if (raw.length < CHUNK) break          // last chunk
    if (fileSize && pos >= fileSize) break
  }

  // Signal end-of-stream and wait for the parser to flush
  await new Promise(resolve => { parser.once('finish', resolve); parser.end() })

  onProgress?.(72)

  // ── Sort & deduplicate ────────────────────────────────────
  frames.sort((a, b) => a.startMs - b.startMs)
  const seen  = new Set()
  const dedup = frames.filter(f => {
    const k = `${Math.round(f.startMs)}|${f.text}`
    return seen.has(k) ? false : (seen.add(k), true)
  })

  onProgress?.(90)

  // ── Emit WebVTT ───────────────────────────────────────────
  const lines = ['WEBVTT', '']
  for (const f of dedup) {
    lines.push(`${vttTime(f.startMs)} --> ${vttTime(f.endMs)}`)
    lines.push(f.text, '')
  }

  onProgress?.(100)
  return URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/vtt' }))
}
