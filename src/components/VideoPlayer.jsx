import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import mpegts from 'mpegts.js'
import MkvPanel from './MkvPanel'
import SubtitleLoader from './SubtitleLoader'
import SubtitleSearch from './SubtitleSearch'
import { savePosition, loadPosition, clearPosition } from '../lib/userStore'

// ── Lazy Shaka singleton ──────────────────────────────────────
// Loaded once on first VOD play; polyfills installed immediately after.
let shakaPromise = null
function getShaka() {
  if (!shakaPromise) {
    shakaPromise = import('shaka-player').then(mod => {
      const shaka = mod.default ?? mod
      shaka.polyfill.installAll()
      return shaka
    }).catch(err => {
      shakaPromise = null     // allow retry
      return Promise.reject(err)
    })
  }
  return shakaPromise
}

// ── Engine selection ──────────────────────────────────────────
function getEngine(url) {
  if (!url) return 'none'
  const clean = url.toLowerCase().split('?')[0]
  if (clean.includes('m3u8'))                              return 'hls'
  if (/\.(mp4|mkv|webm|mov|avi|flv)$/.test(clean))        return 'shaka'
  return 'mpegts'
}

const VOD_RE = /\.(mp4|mkv|webm|mov|avi|flv|ts|wmv|mpg|mpeg|m4v|3gp)$/i

// ── Video.js options ──────────────────────────────────────────
const VJS_OPTIONS = {
  controls: true,
  autoplay: true,
  preload: 'auto',
  liveui: true,
  fill: true,
  controlBar: {
    children: [
      'playToggle',
      'volumePanel',
      'currentTimeDisplay',
      'timeDivider',
      'durationDisplay',
      'progressControl',
      'liveDisplay',
      'remainingTimeDisplay',
      'customControlSpacer',
      'audioTrackButton',
      'subsCapsButton',
      'fullscreenToggle',
    ],
  },
  html5: {
    vhs: {
      overrideNative: !videojs.browser.IS_SAFARI,
      enableLowInitialPlaylist: true,
      smoothQualityChange: true,
      allowSeeksWithinUnsafeLiveWindow: true,
    },
    nativeVideoTracks: false,
    nativeAudioTracks: false,
    nativeTextTracks: false,
  },
}

function applyVideoStyles(el) {
  el.style.width           = '100%'
  el.style.height          = '100%'
  el.style.display         = 'block'
  el.style.objectFit       = 'contain'
  el.style.backgroundColor = '#000'
}

// ── Track label helper ────────────────────────────────────────
function trackLabel(t, i) {
  if (t.label) return t.label
  if (t.language && t.language !== 'und') return t.language.toUpperCase()
  return `Altyazı ${i + 1}`
}

export default function VideoPlayer({ channel, onEnded }) {
  const { settings } = useApp()
  const containerRef    = useRef(null)
  const activeRef       = useRef(null)
  const onEndedRef      = useRef(onEnded)
  const videoElRef      = useRef(null)   // raw <video> element for SubtitleLoader
  const posCleanupRef   = useRef(null)   // cleanup fn for position-tracking listeners
  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  // Shaka text-track state
  const [shakaTracks, setShakaTracks] = useState([])  // shaka.extern.Track[]
  const [shakaSub,    setShakaSub]    = useState(-1)  // track.id or -1

  // Reset on channel switch
  useEffect(() => {
    setShakaTracks([])
    setShakaSub(-1)
  }, [channel])

  // ── Position tracking setup ───────────────────────────────
  // Attaches timeupdate/ended listeners to a video element for VOD resume.
  // Returns a cleanup function to remove those listeners.
  function setupPositionTracking(videoEl, url) {
    let lastSave = 0

    function onTimeUpdate() {
      const now = Date.now()
      // Save at most once every 5 seconds; ignore the first 3 seconds
      if (videoEl.currentTime > 3 && now - lastSave > 5000) {
        lastSave = now
        savePosition(url, videoEl.currentTime)
      }
    }

    function onEnded() {
      clearPosition(url)   // finished watching → forget position
    }

    function tryResume() {
      const saved = loadPosition(url)
      // Only seek if saved position is meaningful and not near the end
      if (saved > 3 && isFinite(videoEl.duration) && saved < videoEl.duration - 5) {
        videoEl.currentTime = saved
      }
    }

    videoEl.addEventListener('timeupdate', onTimeUpdate)
    videoEl.addEventListener('ended',      onEnded, { once: true })

    // If metadata already available (e.g. native fallback with direct src=), seek now
    if (videoEl.readyState >= HTMLVideoElement.HAVE_METADATA) {
      tryResume()
    } else {
      videoEl.addEventListener('loadedmetadata', tryResume, { once: true })
    }

    return () => {
      videoEl.removeEventListener('timeupdate',     onTimeUpdate)
      videoEl.removeEventListener('ended',          onEnded)
      videoEl.removeEventListener('loadedmetadata', tryResume)
    }
  }

  // ── Destroy active player ─────────────────────────────────
  function destroyActive() {
    posCleanupRef.current?.()
    posCleanupRef.current = null
    const a = activeRef.current
    if (!a) return
    try {
      if (a.type === 'hls' && !a.instance.isDisposed()) a.instance.dispose()
      if (a.type === 'mpegts') {
        a.instance.pause(); a.instance.unload()
        a.instance.detachMediaElement(); a.instance.destroy()
      }
      if (a.type === 'shaka')  a.instance.destroy()   // returns Promise — fire-and-forget
      if (a.type === 'native') {
        a.videoEl.pause(); a.videoEl.removeAttribute('src'); a.videoEl.load()
      }
    } catch (_) {}
    if (a.type !== 'hls' && a.videoEl?.parentNode)
      a.videoEl.parentNode.removeChild(a.videoEl)
    activeRef.current  = null
    videoElRef.current = null
  }

  // ── Build player (async for Shaka) ────────────────────────
  async function buildPlayer(ch, isCancelled) {
    const container = containerRef.current
    if (!container || !ch) return
    const engine = getEngine(ch.url)
    const ended  = () => onEndedRef.current?.()

    // ── HLS via Video.js ────────────────────────────────────
    if (engine === 'hls') {
      const videoEl = document.createElement('video')
      videoEl.className = 'video-js vjs-big-play-centered'
      container.appendChild(videoEl)
      const player = videojs(videoEl, VJS_OPTIONS)
      player.src({ src: ch.url, type: 'application/x-mpegURL' })
      player.on('ended', ended)
      player.play().catch(() => {})
      videoElRef.current = videoEl
      activeRef.current  = { type: 'hls', instance: player, videoEl }
      return
    }

    // ── Live IPTV via mpegts.js ─────────────────────────────
    if (engine === 'mpegts') {
      const videoEl = document.createElement('video')
      videoEl.controls = true
      applyVideoStyles(videoEl)
      videoEl.addEventListener('ended', ended)
      container.appendChild(videoEl)
      videoElRef.current = videoEl
      if (mpegts.isSupported()) {
        const player = mpegts.createPlayer(
          { type: 'mpegts', url: ch.url, isLive: true },
          { enableWorker: true, lazyLoadMaxDuration: 180, seekType: 'range' }
        )
        player.attachMediaElement(videoEl)
        player.load()
        videoEl.play().catch(() => {})
        activeRef.current = { type: 'mpegts', instance: player, videoEl }
      } else {
        videoEl.src = ch.url
        videoEl.play().catch(() => {})
        activeRef.current = { type: 'native', instance: null, videoEl }
      }
      return
    }

    // ── VOD via Shaka Player ────────────────────────────────
    // Load Shaka module (cached after first call)
    let shaka
    try {
      shaka = await getShaka()
    } catch (e) {
      console.error('Shaka unavailable, falling back to native', e)
      // Native fallback
      const videoEl = document.createElement('video')
      videoEl.controls = true
      applyVideoStyles(videoEl)
      videoEl.addEventListener('ended', ended)
      videoEl.src = ch.url
      container.appendChild(videoEl)
      videoEl.play().catch(() => {})
      videoElRef.current = videoEl
      activeRef.current  = { type: 'native', instance: null, videoEl }
      posCleanupRef.current = setupPositionTracking(videoEl, ch.url)
      return
    }

    if (isCancelled()) return

    const videoEl = document.createElement('video')
    videoEl.controls = true
    applyVideoStyles(videoEl)
    videoEl.addEventListener('ended', ended)
    container.appendChild(videoEl)
    videoElRef.current = videoEl

    // If MSE not supported, play natively (e.g. Safari with H.264 MKV)
    if (!shaka.Player.isBrowserSupported()) {
      videoEl.src = ch.url
      videoEl.play().catch(() => {})
      activeRef.current = { type: 'native', instance: null, videoEl }
      posCleanupRef.current = setupPositionTracking(videoEl, ch.url)
      return
    }

    const player = new shaka.Player()
    await player.attach(videoEl)

    if (isCancelled()) { player.destroy(); return }

    // Expose text tracks whenever Shaka re-parses them
    player.addEventListener('trackschanged', () => {
      if (isCancelled()) return
      const txt = player.getTextTracks()
      setShakaTracks(txt)
      // Auto-select first subtitle track if exactly one exists
      if (txt.length === 1) {
        player.selectTextTrack(txt[0])
        player.setTextTrackVisibility(true)
        setShakaSub(txt[0].id)
      }
    })

    player.configure({
      streaming: {
        bufferingGoal:   60,
        rebufferingGoal: 2,
      },
    })

    try {
      await player.load(ch.url)
    } catch (e) {
      // Shaka couldn't demux (e.g. H.264 in MKV) — try native src=
      console.warn('Shaka load failed, falling back to native src=', e.message)
      player.destroy()
      if (isCancelled()) return
      videoEl.src = ch.url
      videoEl.play().catch(() => {})
      activeRef.current = { type: 'native', instance: null, videoEl }
      posCleanupRef.current = setupPositionTracking(videoEl, ch.url)
      return
    }

    if (isCancelled()) { player.destroy(); return }

    videoEl.play().catch(() => {})
    activeRef.current = { type: 'shaka', instance: player, videoEl }
    posCleanupRef.current = setupPositionTracking(videoEl, ch.url)
  }

  // ── Effect: rebuild player on channel change ──────────────
  useEffect(() => {
    destroyActive()
    let cancelled = false
    buildPlayer(channel, () => cancelled)
    return () => {
      cancelled = true
      destroyActive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  // ── Shaka subtitle selection ──────────────────────────────
  function handleShakaSubChange(idStr) {
    const id = Number(idStr)
    const a  = activeRef.current
    if (!a || a.type !== 'shaka') return
    if (id === -1) {
      a.instance.setTextTrackVisibility(false)
    } else {
      const track = shakaTracks.find(t => t.id === id)
      if (track) {
        a.instance.selectTextTrack(track)
        a.instance.setTextTrackVisibility(true)
      }
    }
    setShakaSub(id)
  }

  const engine             = channel ? getEngine(channel.url) : 'none'
  const isShaka            = engine === 'shaka'
  const hasShakaTextTracks = isShaka && shakaTracks.length > 0
  const MKV_RE             = /\.mkv$/i
  // Show MkvPanel for .mkv when Shaka found no tracks (H.264 fallback to native src=)
  const showMkvPanel = channel && MKV_RE.test(channel.url.split('?')[0]) && !hasShakaTextTracks

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden gap-3">

      {/* Video container */}
      <div
        ref={containerRef}
        data-player
        className={`rounded-lg overflow-hidden bg-black ${channel ? 'flex-1' : 'hidden'}`}
        style={{ minHeight: '180px' }}
      />

      {/* Placeholder */}
      {!channel && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
          <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">Oynatmak için bir kanal seçin</p>
        </div>
      )}

      {/* Shaka subtitle selector */}
      {hasShakaTextTracks && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <span className="text-xs text-gray-400 shrink-0">Altyazı</span>
          <select
            value={shakaSub}
            onChange={e => handleShakaSubChange(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value={-1}>Kapalı</option>
            {shakaTracks.map((t, i) => (
              <option key={t.id} value={t.id}>{trackLabel(t, i)}</option>
            ))}
          </select>
        </div>
      )}

      {/* Subtitle tools — bounded height so they never crush the video */}
      {channel && settings.showSubtitlePanel && (
        <div className="shrink-0 flex flex-col gap-2 overflow-y-auto max-h-64">
          {/* MKV embedded subtitle extractor (Range-based, H.264 fallback) */}
          {showMkvPanel && <MkvPanel url={channel.url} videoElRef={videoElRef} />}

          {/* Online subtitle search — VOD only */}
          {VOD_RE.test(channel.url.split('?')[0]) && (
            <SubtitleSearch key={`search-${channel.url}`} channel={channel} videoElRef={videoElRef} />
          )}

          {/* Manual SRT / VTT loader — always available when a channel is playing */}
          <SubtitleLoader key={`loader-${channel.url}`} videoElRef={videoElRef} />
        </div>
      )}

      {/* Channel info */}
      {channel && (
        <div className="shrink-0 space-y-2">
          <div className="flex items-center gap-3 px-1">
            {channel.logo && (
              <div className="w-9 h-9 rounded bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                <img src={channel.logo} alt="" className="w-full h-full object-contain"
                  onError={e => { e.target.style.display = 'none' }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{channel.name}</p>
              <p className="text-gray-400 text-xs truncate">{channel.group}</p>
            </div>
            {VOD_RE.test(channel.url.split('?')[0])
              ? <span className="text-xs bg-violet-900 text-violet-300 px-2 py-1 rounded font-semibold shrink-0">VOD</span>
              : <span className="text-xs bg-green-700 text-green-200 px-2 py-1 rounded font-semibold shrink-0">CANLI</span>
            }
          </div>
          <div className="bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Şu An Yayınlanıyor</p>
            <p className="text-sm text-gray-300 truncate">{channel.name}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{channel.group} · {
              VOD_RE.test(channel.url.split('?')[0]) ? 'Video Dosyası' : 'Canlı Yayın'
            }</p>
          </div>
        </div>
      )}
    </div>
  )
}
