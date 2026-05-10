import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { setPIN, hasPIN, checkPIN } from '../lib/userStore'

// ── Toggle row ────────────────────────────────────────────────
function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-700">
      <div className="min-w-0">
        <p className="text-sm text-white font-medium">{label}</p>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
      {/* Inline styles bypass global CSS transition override */}
      <button
        onClick={() => onChange(!checked)}
        aria-label={label}
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          width: 44,
          height: 24,
          borderRadius: 9999,
          padding: 2,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: checked ? '#2563eb' : '#4b5563',
          transition: 'background-color 0.2s ease',
        }}
      >
        <span style={{
          display: 'block',
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 0.2s ease',
        }} />
      </button>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────
function Section({ title }) {
  return (
    <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider pt-4 pb-1">
      {title}
    </p>
  )
}

// ── Main component ────────────────────────────────────────────
export default function SettingsModal({ onClose }) {
  const { settings, updateSetting, hiddenGroups, showGroup } = useApp()

  // PIN management state
  const [pinPhase,   setPinPhase]   = useState('idle')   // idle | set | change | verify-remove
  const [pinInput,   setPinInput]   = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError,   setPinError]   = useState('')
  const [pinSuccess, setPinSuccess] = useState('')

  // ── PIN handlers ──────────────────────────────────────────
  async function handleSetPIN() {
    if (pinInput.length < 4) { setPinError('En az 4 karakter giriniz'); return }
    if (pinInput !== pinConfirm) { setPinError('PIN\'ler uyuşmuyor'); return }
    await setPIN(pinInput)
    setPinError('')
    setPinSuccess('PIN kaydedildi ✓')
    setPinInput(''); setPinConfirm('')
    setTimeout(() => { setPinSuccess(''); setPinPhase('idle') }, 1500)
  }

  async function handleRemovePIN() {
    const ok = await checkPIN(pinInput)
    if (!ok) { setPinError('Yanlış PIN'); return }
    await setPIN(null)
    setPinError('')
    setPinSuccess('PIN kaldırıldı ✓')
    setPinInput('')
    setTimeout(() => { setPinSuccess(''); setPinPhase('idle') }, 1500)
  }

  const pinSet = hasPIN()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm bg-gray-800 rounded-t-2xl sm:rounded-2xl border border-gray-700 shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-semibold text-white">Ayarlar</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">

          {/* ── Player ── */}
          <Section title="Oynatıcı" />
          <ToggleRow
            label="Altyazı araçlarını göster"
            desc="VOD içeriklerde altyazı yükleme panelini göster/gizle"
            checked={settings.showSubtitlePanel}
            onChange={v => updateSetting('showSubtitlePanel', v)}
          />

          {/* ── Güvenlik / PIN ── */}
          <Section title="Güvenlik" />
          <div className="py-3 border-b border-gray-700 space-y-2">
            <p className="text-sm text-white font-medium">
              Gizli Grup PIN'i
              {pinSet && <span className="ml-2 text-xs text-green-400">● Ayarlı</span>}
            </p>
            <p className="text-xs text-gray-500">
              Gizlenen grupları açmak için PIN koru.
            </p>

            {pinPhase === 'idle' && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setPinPhase('set'); setPinError(''); setPinSuccess('') }}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors"
                >
                  {pinSet ? 'PIN Değiştir' : 'PIN Ayarla'}
                </button>
                {pinSet && (
                  <button
                    onClick={() => { setPinPhase('verify-remove'); setPinError(''); setPinSuccess('') }}
                    className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded transition-colors"
                  >
                    PIN Kaldır
                  </button>
                )}
              </div>
            )}

            {pinPhase === 'set' && (
              <div className="space-y-2">
                <input
                  type="password"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetPIN()}
                  placeholder="Yeni PIN (min. 4 karakter)"
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  value={pinConfirm}
                  onChange={e => setPinConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetPIN()}
                  placeholder="PIN tekrar"
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                {pinError   && <p className="text-xs text-red-400">{pinError}</p>}
                {pinSuccess && <p className="text-xs text-green-400">{pinSuccess}</p>}
                <div className="flex gap-2">
                  <button onClick={handleSetPIN}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors">
                    Kaydet
                  </button>
                  <button onClick={() => { setPinPhase('idle'); setPinInput(''); setPinConfirm(''); setPinError('') }}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded transition-colors">
                    İptal
                  </button>
                </div>
              </div>
            )}

            {pinPhase === 'verify-remove' && (
              <div className="space-y-2">
                <input
                  type="password"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRemovePIN()}
                  placeholder="Mevcut PIN"
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                {pinError   && <p className="text-xs text-red-400">{pinError}</p>}
                {pinSuccess && <p className="text-xs text-green-400">{pinSuccess}</p>}
                <div className="flex gap-2">
                  <button onClick={handleRemovePIN}
                    className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded transition-colors">
                    Kaldır
                  </button>
                  <button onClick={() => { setPinPhase('idle'); setPinInput(''); setPinError('') }}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded transition-colors">
                    İptal
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Gizli gruplar ── */}
          {hiddenGroups.length > 0 && (
            <>
              <Section title="Gizli Gruplar" />
              <div className="space-y-1 py-2">
                {hiddenGroups.map(group => (
                  <div key={group}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-700 rounded-lg">
                    <span className="text-sm text-gray-300 truncate flex-1">{group}</span>
                    <button
                      onClick={() => showGroup(group)}
                      className="text-xs text-blue-400 hover:text-blue-300 shrink-0 transition-colors"
                    >
                      Göster
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
