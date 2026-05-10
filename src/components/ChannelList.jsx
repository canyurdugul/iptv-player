export default function ChannelList({ channels, selectedChannel, onSelect }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kanallar</span>
        <span className="text-xs text-gray-500">{channels.length}</span>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {channels.map(channel => {
          const active = selectedChannel?.id === channel.id
          return (
            <button
              key={channel.id}
              onClick={() => onSelect(channel)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors border-l-4 ${
                active
                  ? 'border-blue-500 bg-gray-700'
                  : 'border-transparent hover:bg-gray-750 hover:text-white'
              }`}
            >
              {/* Logo */}
              <div className="w-8 h-8 rounded bg-gray-600 flex items-center justify-center shrink-0 overflow-hidden">
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt=""
                    className="w-full h-full object-contain"
                    onError={e => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v9A2.5 2.5 0 0115.5 16h-11A2.5 2.5 0 012 13.5v-9z"/>
                  </svg>
                )}
              </div>

              {/* Name */}
              <span className="flex-1 text-sm text-gray-200 truncate">{channel.name}</span>

              {/* Live badge */}
              <span className="text-xs bg-green-700 text-green-200 px-1.5 py-0.5 rounded font-semibold shrink-0">
                CANLI
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
