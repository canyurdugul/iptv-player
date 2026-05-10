# 📺 IPTV Player

A modern, feature-rich IPTV / M3U playlist player built with **React + Vite + Tailwind CSS**.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)

---

## ✨ Features

### 🎬 Playback
- **HLS streams** — via [Video.js](https://videojs.com/)
- **Live IPTV / MPEG-TS** — via [mpegts.js](https://github.com/xqq/mpegts.js)
- **VOD (MP4, MKV, WebM…)** — via [Shaka Player](https://github.com/shaka-project/shaka-player) with native fallback
- Auto-advances to the next channel when a VOD ends

### 📋 Playlist Management
- Load any M3U playlist by URL
- Playlists are **cached in IndexedDB** — load instantly on revisit
- Rename, delete, or **update** a saved playlist from its original URL
- Multiple playlists supported simultaneously

### 🗂️ Channel Organisation
- Group-based navigation with channel count badges
- **Global search** across all groups (≥ 3 characters)
- **Favourites** — star any channel; pinned at the top
- **Recently Played** — per-playlist history (newest first, up to 30 entries); remove individual entries or clear all
- **Custom Groups** — build your own group by searching and picking channels
- **Hidden Groups** — hide groups you don't use; optionally protect them with a PIN
- **Series auto-detection** — channels matching `S01E01`, `1x01`, `Sezon N`, `- Episode N` patterns are collapsed into accordion sub-groups

### 🎞️ Subtitles
- **Manual loader** — drag-and-drop or browse for `.srt` / `.vtt` files
- **Online search** — powered by [OpenSubtitles](https://www.opensubtitles.com/)
- **MKV embedded subtitles** — extracted in the browser via range requests (no server needed)
- Shaka Player native text-track selector for multi-subtitle streams

### ⌨️ Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `←` / `→` | Previous / Next channel |
| `↑` / `↓` | Volume up / down |
| `F` | Toggle fullscreen |

### 🎨 UI & UX
- **Dark / Light mode** toggle (persisted in localStorage)
- Smooth theme transitions
- Responsive layout — works on desktop and tablet
- Prev / Next channel buttons in the top bar
- Channel info panel with VOD / LIVE badge

### 🔒 Security
- **PIN protection** for hidden groups (SHA-256, browser-native `crypto.subtle`)
- PIN is stored as a hash — never in plaintext

---

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/canyurdugul/iptv-player.git
cd iptv-player

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and enter an M3U playlist URL.

### Build for production

```bash
npm run build
# Output in dist/
```

A `Dockerfile` + `nginx.conf` are included for containerised deployment:

```bash
docker build -t iptv-player .
docker run -p 80:80 iptv-player
```

---

## 🛠️ Tech Stack

| Library | Purpose |
|---------|---------|
| [React 18](https://react.dev/) | UI framework |
| [Vite 5](https://vitejs.dev/) | Build tool & dev server |
| [Tailwind CSS 3](https://tailwindcss.com/) | Styling |
| [Video.js](https://videojs.com/) | HLS playback |
| [mpegts.js](https://github.com/xqq/mpegts.js) | Live MPEG-TS playback |
| [Shaka Player](https://github.com/shaka-project/shaka-player) | VOD / adaptive streaming |
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | Playlist cache & history |
| [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) | User preferences & favourites |

---

## 📁 Project Structure

```
src/
├── App.jsx                  # Root state machine (initial → loading → loaded)
├── main.jsx                 # React entry point, AppProvider wrapper
├── index.css                # Tailwind directives + dark/light mode overrides
├── context/
│   └── AppContext.jsx        # Global state: theme, settings, favourites, groups…
├── components/
│   ├── Dashboard.jsx         # Main 2-column layout + keyboard shortcuts
│   ├── SidePanel.jsx         # Group list, channel list, search, modals
│   ├── VideoPlayer.jsx       # Engine selector + Shaka / mpegts / Video.js mount
│   ├── InitialScreen.jsx     # Playlist URL input + saved playlist list
│   ├── LoadingScreen.jsx     # Animated loading screen
│   ├── SettingsModal.jsx     # Settings sheet (subtitle toggle, PIN)
│   ├── SubtitleLoader.jsx    # Manual SRT/VTT file loader
│   ├── SubtitleSearch.jsx    # OpenSubtitles search UI
│   └── MkvPanel.jsx          # MKV embedded subtitle extractor
└── lib/
    ├── playlistStore.js      # IndexedDB: playlists + recently played
    ├── userStore.js          # localStorage: theme, settings, PIN, favourites…
    └── subtitleTrack.js      # Reliable <track> injection helper
```

---

## License

MIT
