import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL, fetchFile } from '@ffmpeg/util'

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

const LANG_MAP = {
  tur: 'Türkçe', eng: 'İngilizce', deu: 'Almanca', fra: 'Fransızca',
  spa: 'İspanyolca', ita: 'İtalyanca', por: 'Portekizce', rus: 'Rusça',
  ara: 'Arapça', jpn: 'Japonca', kor: 'Korece', zho: 'Çince',
  und: 'Bilinmiyor',
}
function langName(code) { return LANG_MAP[code?.toLowerCase()] ?? code ?? 'Bilinmiyor' }

// ── Singleton FFmpeg instance ─────────────────────────────────
let ffmpegPromise = null

export async function getFFmpeg() {
  if (ffmpegPromise) return ffmpegPromise
  ffmpegPromise = (async () => {
    const ff = new FFmpeg()
    await ff.load({
      coreURL:   await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL:   await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    return ff
  })()
  return ffmpegPromise
}

// ── Parse stream lines from ffmpeg stderr log ─────────────────
// e.g. "    Stream #0:1(tur): Audio: aac, 48000 Hz, stereo, fltp, 128 kb/s"
//      "    Stream #0:2(eng): Subtitle: subrip"
const STREAM_RE = /Stream #0:(\d+)(?:\((\w+)\))?[^:]*:\s*(Audio|Subtitle):\s*(\S+)/i

function parseStreams(log) {
  const audio = []
  const subs  = []
  for (const line of log.split('\n')) {
    const m = line.match(STREAM_RE)
    if (!m) continue
    const [, idx, lang, kind, codec] = m
    const streamIdx = parseInt(idx, 10)
    if (kind.toLowerCase() === 'audio') {
      audio.push({ streamIdx, lang: lang ?? 'und', label: langName(lang), codec })
    } else {
      subs.push({ streamIdx, lang: lang ?? 'und', label: langName(lang), codec })
    }
  }
  return { audio, subs }
}

// ── Analyze MKV at URL ────────────────────────────────────────
export async function analyzeMkv(url, { onPhase, onProgress } = {}) {
  onPhase?.('loading')

  const ff = await getFFmpeg()

  // Download the file (first ~8 MB is enough to read streams header)
  const response = await fetch(url, { headers: { Range: 'bytes=0-8388607' } })
  const buffer   = await response.arrayBuffer()
  onProgress?.(30)

  onPhase?.('probing')
  await ff.writeFile('probe.mkv', new Uint8Array(buffer))
  onProgress?.(50)

  // Capture log output
  let logOutput = ''
  const logHandler = ({ message }) => { logOutput += message + '\n' }
  ff.on('log', logHandler)

  // Run ffmpeg -i to get stream info (it will "fail" because no output file — that's fine)
  try {
    await ff.exec(['-i', 'probe.mkv'])
  } catch (_) {
    // expected — ffmpeg exits non-zero when no output file specified
  }

  ff.off('log', logHandler)
  await ff.deleteFile('probe.mkv')
  onProgress?.(80)

  const tracks = parseStreams(logOutput)
  onProgress?.(100)
  onPhase?.('ready')
  return tracks
}

// ── Extract a single audio stream to an opus Blob URL ─────────
export async function extractAudioTrack(url, streamIdx, onProgress) {
  const ff = await getFFmpeg()

  onProgress?.(5)
  const data = await fetchFile(url)
  await ff.writeFile('src.mkv', data)
  onProgress?.(50)

  await ff.exec([
    '-i', 'src.mkv',
    '-map', `0:${streamIdx}`,
    '-c:a', 'libopus',
    '-b:a', '128k',
    'out.opus',
  ])
  onProgress?.(90)

  const out  = await ff.readFile('out.opus')
  const blob = new Blob([out.buffer], { type: 'audio/ogg; codecs=opus' })
  await ff.deleteFile('src.mkv')
  await ff.deleteFile('out.opus')
  onProgress?.(100)
  return URL.createObjectURL(blob)
}

// ── Extract a subtitle stream to a WebVTT Blob URL ───────────
export async function extractSubtitleTrack(url, streamIdx, onProgress) {
  debugger;
  const ff = await getFFmpeg()

  onProgress?.(5)
  const data = await fetchFile(url)
  await ff.writeFile('src.mkv', data)
  onProgress?.(50)

  await ff.exec([
    '-i', 'src.mkv',
    '-map', `0:${streamIdx}`,
    '-c:s', 'webvtt',
    'out.vtt',
  ])
  onProgress?.(90)

  const out  = await ff.readFile('out.vtt')
  const blob = new Blob([out.buffer], { type: 'text/vtt' })
  await ff.deleteFile('src.mkv')
  await ff.deleteFile('out.vtt')
  onProgress?.(100)
  return URL.createObjectURL(blob)
}
