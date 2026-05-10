/**
 * iptv-proxy — Cloudflare Worker
 *
 * Çözdüğü problemler:
 *   1. Mixed content  : HTTPS sayfasından HTTP playlist/stream çekilememe
 *   2. CORS           : Provider sunucuları CORS header dönmüyor
 *   3. HLS rewrite    : M3U8 içindeki HTTP segment URL'lerini de HTTPS proxy'den geçir
 *
 * Kullanım:
 *   https://<worker>.workers.dev/?url=<encoded-url>
 *
 * Özellikler:
 *   - M3U / M3U8 playlist içindeki TÜM URL'leri worker üzerinden geçecek şekilde rewrite eder
 *   - #EXT-X-KEY, #EXT-X-MAP direktiflerindeki URI'ları da rewrite eder
 *   - Binary TS segmentlerini ve diğer kaynakları doğrudan pipe eder
 *   - CORS preflight (OPTIONS) destekler
 *   - Yalnızca kendi GitHub Pages domain'inden gelen isteklere izin verir (isteğe bağlı)
 */

// ── İzin verilen origin'ler (boş bırakılırsa herkese açık olur) ─────────────
const ALLOWED_ORIGINS = [
  'https://canyurdugul.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

// ── CORS response header'ları ────────────────────────────────────────────────
function corsHeaders(origin) {
  const allowed =
    ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)
      ? origin || '*'
      : 'null'
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age':       '86400',
  }
}

function textResponse(body, status, contentType, origin) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': contentType },
  })
}

// ── Playlist rewriter ────────────────────────────────────────────────────────
// M3U / M3U8 içindeki tüm URL'leri "?url=..." formatına çevirir
function rewritePlaylist(text, baseUrl, workerOrigin) {
  const base = new URL(baseUrl)

  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return line

      // #EXT-X-KEY:METHOD=...,URI="http://..."  →  URI rewrite
      // #EXT-X-MAP:URI="http://..."             →  URI rewrite
      if (
        trimmed.startsWith('#EXT-X-KEY') ||
        trimmed.startsWith('#EXT-X-MAP') ||
        trimmed.startsWith('#EXT-X-MEDIA')
      ) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          try {
            const abs = new URL(uri, base).href
            return `URI="${workerOrigin}/?url=${encodeURIComponent(abs)}"`
          } catch {
            return `URI="${uri}"`
          }
        })
      }

      // Diğer direktifler ve boş satırlar → dokunma
      if (trimmed.startsWith('#')) return line

      // Segment / alt-playlist URL satırı → rewrite
      try {
        const abs = new URL(trimmed, base).href
        return `${workerOrigin}/?url=${encodeURIComponent(abs)}`
      } catch {
        return line
      }
    })
    .join('\n')
}

// ── M3U (kanal listesi) rewriter ─────────────────────────────────────────────
// Düz M3U'da stream URL'leri #EXTINF sonrası gelir; yukarıdaki rewriter bunu
// zaten halleder çünkü yorum satırı olmayan her satır rewrite edilir.

// ── Content-type'a göre playlist mi karar ver ────────────────────────────────
function isPlaylist(contentType, url) {
  if (!contentType) return false
  const ct = contentType.toLowerCase()
  if (
    ct.includes('mpegurl') ||
    ct.includes('x-mpegurl') ||
    ct.includes('x-m3u')
  ) return true
  // Content-type güvenilmez olabilir; URL'e de bak
  const u = url.split('?')[0].toLowerCase()
  return u.endsWith('.m3u') || u.endsWith('.m3u8')
}

// ── Ana handler ──────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ''

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // Yalnızca GET / HEAD
    if (!['GET', 'HEAD'].includes(request.method)) {
      return textResponse('Method not allowed', 405, 'text/plain', origin)
    }

    // ?url= parametresini al
    const reqUrl   = new URL(request.url)
    const targetUrl = reqUrl.searchParams.get('url')

    if (!targetUrl) {
      return textResponse(
        'iptv-proxy: kullanım → ?url=<encoded-url>',
        400, 'text/plain', origin,
      )
    }

    // URL doğrula
    let target
    try {
      target = new URL(targetUrl)
    } catch {
      return textResponse('Geçersiz URL', 400, 'text/plain', origin)
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
      return textResponse('Sadece HTTP/HTTPS desteklenir', 400, 'text/plain', origin)
    }

    // Upstream isteği yap
    let upstream
    try {
      upstream = await fetch(targetUrl, {
        method:   request.method,
        redirect: 'follow',
        headers: {
          // Gerçek bir tarayıcı gibi görün (bazı provider'lar bot koruması yapar)
          'User-Agent':
            request.headers.get('User-Agent') ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept':          '*/*',
          'Accept-Language': 'tr,en;q=0.9',
          // Range isteği varsa ilet (bazı VOD sunucuları için gerekli)
          ...(request.headers.get('Range')
            ? { Range: request.headers.get('Range') }
            : {}),
        },
      })
    } catch (err) {
      return textResponse(
        `Upstream fetch hatası: ${err.message}`,
        502, 'text/plain', origin,
      )
    }

    const contentType = upstream.headers.get('Content-Type') || ''

    // Playlist → rewrite et
    if (isPlaylist(contentType, targetUrl)) {
      const text     = await upstream.text()
      const rewritten = rewritePlaylist(text, targetUrl, reqUrl.origin)
      return textResponse(
        rewritten, upstream.status,
        'application/vnd.apple.mpegurl; charset=utf-8',
        origin,
      )
    }

    // Binary (TS segment, MP4, vb.) → doğrudan pipe et
    const headers = new Headers({
      ...corsHeaders(origin),
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    if (upstream.headers.get('Content-Length'))
      headers.set('Content-Length', upstream.headers.get('Content-Length'))
    if (upstream.headers.get('Content-Range'))
      headers.set('Content-Range', upstream.headers.get('Content-Range'))

    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
