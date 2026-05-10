import { createContext, useContext, useState, useEffect } from 'react'
import {
  getTheme, saveTheme,
  getSettings, saveSettings,
  getFavorites, addFavorite, removeFavorite, isFavorite,
  getHiddenGroups, hideGroup as storeHide, unhideGroup as storeUnhide,
  getCustomGroups, saveCustomGroups,
} from '../lib/userStore'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [theme,           setThemeState]    = useState(getTheme)
  const [settings,        setSettings]      = useState(getSettings)
  const [activePlaylistId, setActivePlaylistId] = useState(null)
  const [favorites,       setFavorites]     = useState([])
  const [hiddenGroups,    setHiddenGroups]  = useState([])
  const [customGroups,    setCustomGroups]  = useState([])
  // Groups the user unlocked during this session (not persisted)
  const [unlockedGroups,  setUnlockedGroups] = useState([])
  // Settings modal visibility
  const [settingsOpen,    setSettingsOpen]  = useState(false)

  // ── Apply theme class to <html> ───────────────────────────
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('light', theme === 'light')
    root.classList.toggle('dark',  theme === 'dark')
    saveTheme(theme)
  }, [theme])

  // ── Reload per-playlist data when playlist changes ────────
  useEffect(() => {
    if (activePlaylistId == null) return
    setFavorites(getFavorites(activePlaylistId))
    setHiddenGroups(getHiddenGroups(activePlaylistId))
    setCustomGroups(getCustomGroups(activePlaylistId))
    setUnlockedGroups([])
  }, [activePlaylistId])

  // ── Theme ─────────────────────────────────────────────────
  function toggleTheme() {
    setThemeState(t => (t === 'dark' ? 'light' : 'dark'))
  }

  // ── Settings ──────────────────────────────────────────────
  function updateSetting(key, value) {
    const patch = { [key]: value }
    saveSettings(patch)
    setSettings(prev => ({ ...prev, ...patch }))
  }

  // ── Favorites ─────────────────────────────────────────────
  function toggleFavorite(channel) {
    if (activePlaylistId == null || !channel) return
    if (isFavorite(activePlaylistId, channel.url)) {
      removeFavorite(activePlaylistId, channel.url)
      setFavorites(prev => prev.filter(f => f.url !== channel.url))
    } else {
      addFavorite(activePlaylistId, channel)
      setFavorites(prev => [channel, ...prev])
    }
  }
  function isFav(url) { return favorites.some(f => f.url === url) }

  // ── Hidden groups ─────────────────────────────────────────
  function hideGroupFn(group) {
    storeHide(activePlaylistId, group)
    setHiddenGroups(prev => [...new Set([...prev, group])])
  }
  function showGroupFn(group) {
    storeUnhide(activePlaylistId, group)
    setHiddenGroups(prev => prev.filter(g => g !== group))
    setUnlockedGroups(prev => prev.filter(g => g !== group))
  }
  function unlockGroup(group) {
    setUnlockedGroups(prev => [...new Set([...prev, group])])
  }
  function isGroupVisible(group) {
    return !hiddenGroups.includes(group) || unlockedGroups.includes(group)
  }

  // ── Custom groups ─────────────────────────────────────────
  function saveCustomGroupsFn(groups) {
    if (activePlaylistId == null) return
    saveCustomGroups(activePlaylistId, groups)
    setCustomGroups(groups)
  }

  return (
    <AppContext.Provider value={{
      // Theme
      theme, toggleTheme,
      // Settings
      settings, updateSetting,
      settingsOpen, setSettingsOpen,
      // Playlist context
      activePlaylistId, setActivePlaylistId,
      // Favorites
      favorites, toggleFavorite, isFav,
      // Hidden groups
      hiddenGroups, hideGroup: hideGroupFn, showGroup: showGroupFn,
      unlockGroup, isGroupVisible,
      // Custom groups
      customGroups, saveCustomGroups: saveCustomGroupsFn,
    }}>
      {children}
    </AppContext.Provider>
  )
}
