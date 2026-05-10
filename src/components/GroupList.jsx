export default function GroupList({ groups, channels, selectedGroup, onSelect }) {
  const all = [{ name: 'TÜMÜ', count: channels.length }]
  const rows = groups.map(g => ({
    name: g,
    count: channels.filter(c => c.group === g).length,
  }))
  const items = [...all, ...rows]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-750 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kanal Grupları</span>
        <span className="text-xs text-gray-500">{groups.length}</span>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {items.map(item => {
          const active = item.name === selectedGroup
          return (
            <button
              key={item.name}
              onClick={() => onSelect(item.name)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors border-l-4 ${
                active
                  ? 'border-blue-500 bg-gray-700 text-white'
                  : 'border-transparent hover:bg-gray-750 text-gray-300 hover:text-white'
              }`}
            >
              <span className="text-sm truncate pr-2">{item.name}</span>
              <span className="text-xs bg-gray-600 text-gray-300 rounded px-1.5 py-0.5 shrink-0">
                {item.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
