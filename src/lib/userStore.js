/**
 * userStore.js
 * All user preferences stored in localStorage (fast, synchronous, small data).
 *
 * Key schema:
 *   tvp_theme              → 'dark' | 'light'
 *   tvp_settings           → JSON: Settings object
 *   tvp_pin                → SHA-256 hex of the PIN (or absent = no PIN)
 *   tvp_fav_{playlistId}   → JSON: Channel[]
 *   tvp_hg_{playlistId}    → JSON: string[]  (hidden group names)
 *   tvp_cg_{playlistId}    → JSON: CustomGroup[]
 */

// ── Helpers ───────────────────────────────────────────────────
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)) }

// ── Theme ─────────────────────────────────────────────────────
export function getTheme()       { return localStorage.getItem('tvp_theme') ?? 'dark' }
export function saveTheme(theme) { localStorage.setItem('tvp_theme', theme) }

// ── Settings ──────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  showSubtitlePanel: true,    // show/hide subtitle controls in VOD player
}
export function getSettings()       { return { ...DEFAULT_SETTINGS, ...load('tvp_settings', {}) } }
export function saveSettings(patch) { save('tvp_settings', { ...getSettings(), ...patch }) }

// ── PIN (SHA-256, browser native crypto.subtle) ───────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function hasPIN() { return !!localStorage.getItem('tvp_pin') }

export async function setPIN(raw) {
  if (!raw) { localStorage.removeItem('tvp_pin'); return }
  localStorage.setItem('tvp_pin', await sha256(String(raw)))
}

export async function checkPIN(raw) {
  const stored = localStorage.getItem('tvp_pin')
  if (!stored) return true                    // no PIN → always pass
  return (await sha256(String(raw))) === stored
}

// ── Favorites (per playlist) ──────────────────────────────────
// Stored as full channel objects: { url, name, logo, group }
const favKey = id => `tvp_fav_${id}`

export function getFavorites(playlistId) {
  return load(favKey(playlistId), [])
}
export function addFavorite(playlistId, channel) {
  const prev = getFavorites(playlistId).filter(f => f.url !== channel.url)
  save(favKey(playlistId), [{ url: channel.url, name: channel.name, logo: channel.logo ?? '', group: channel.group ?? '' }, ...prev])
}
export function removeFavorite(playlistId, channelUrl) {
  save(favKey(playlistId), getFavorites(playlistId).filter(f => f.url !== channelUrl))
}
export function isFavorite(playlistId, channelUrl) {
  return getFavorites(playlistId).some(f => f.url === channelUrl)
}

// ── Hidden groups (per playlist) ─────────────────────────────
const hgKey = id => `tvp_hg_${id}`

export function getHiddenGroups(playlistId) { return load(hgKey(playlistId), []) }
export function hideGroup(playlistId, group) {
  const prev = getHiddenGroups(playlistId)
  if (!prev.includes(group)) save(hgKey(playlistId), [...prev, group])
}
export function unhideGroup(playlistId, group) {
  save(hgKey(playlistId), getHiddenGroups(playlistId).filter(g => g !== group))
}

// ── Custom groups (per playlist) ──────────────────────────────
// CustomGroup: { id: string, name: string, channels: Channel[] }
const cgKey = id => `tvp_cg_${id}`

export function getCustomGroups(playlistId) { return load(cgKey(playlistId), []) }
export function saveCustomGroups(playlistId, groups) { save(cgKey(playlistId), groups) }
