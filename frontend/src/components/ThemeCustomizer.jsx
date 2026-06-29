import { useEffect, useRef } from 'react'
import { useTheme, CORES_DARK, CORES_LIGHT } from '../contexts/ThemeContext'

const CAMPOS = [
  { key: 'bg',      label: 'Background' },
  { key: 'bg2',     label: 'Painel / Sidebar' },
  { key: 'bg3',     label: 'Inputs / Cards' },
  { key: 'border',  label: 'Bordas' },
  { key: 'primary', label: 'Cor primária' },
  { key: 'muted',   label: 'Texto secundário' },
  { key: 'dim',     label: 'Texto principal' },
]

const PANEL_W = 260

export function ThemeCustomizer({ open, onClose, sidebarW }) {
  const { coresCustom, atualizarCoresCustom } = useTheme()
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const atualizar = (key, value) => {
    atualizarCoresCustom({ ...coresCustom, [key]: value })
  }

  const resetar = (preset) => {
    atualizarCoresCustom(preset === 'light' ? CORES_LIGHT : CORES_DARK)
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30"
          onClick={onClose}
        />
      )}

      <div
        ref={panelRef}
        className="fixed top-0 bottom-0 z-40 flex flex-col bg-bg2 border-r border-border shadow-2xl"
        style={{
          width: PANEL_W,
          left: 0,
          transform: open
            ? `translateX(${sidebarW}px)`
            : `translateX(-${PANEL_W}px)`,
          transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
              className="w-4 h-4 text-primary flex-shrink-0">
              <circle cx="13.5" cy="6.5" r="2.5"/>
              <circle cx="17.5" cy="10.5" r="2.5"/>
              <circle cx="8.5" cy="7.5" r="2.5"/>
              <circle cx="6.5" cy="12.5" r="2.5"/>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
            </svg>
            <span className="text-[13px] font-semibold text-dim">Personalizar Tema</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-dim transition p-1 rounded hover:bg-primary/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Color fields */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {CAMPOS.map(({ key, label }) => (
            <div key={key}>
              <span className="text-[11px] text-muted mb-1.5 block">{label}</span>
              <div className="flex items-center gap-2">
                <label className="relative w-8 h-8 rounded-lg overflow-hidden border border-border cursor-pointer flex-shrink-0 hover:border-primary/40 transition">
                  <div
                    className="w-full h-full"
                    style={{ background: coresCustom[key] }}
                  />
                  <input
                    type="color"
                    value={coresCustom[key]}
                    onChange={e => atualizar(key, e.target.value)}
                    className="absolute opacity-0 inset-0 w-full h-full cursor-pointer"
                  />
                </label>
                <input
                  type="text"
                  value={coresCustom[key]}
                  onChange={e => {
                    const v = e.target.value
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) atualizar(key, v)
                  }}
                  onBlur={e => {
                    if (!/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                      e.target.value = coresCustom[key]
                    }
                  }}
                  className="flex-1 text-xs bg-bg3 border border-border rounded-lg px-2.5 py-1.5
                    text-dim font-mono focus:outline-none focus:border-primary/50 transition"
                  maxLength={7}
                  spellCheck={false}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer: reset buttons */}
        <div className="border-t border-border px-4 py-3 flex gap-2 flex-shrink-0">
          <button
            onClick={() => resetar('dark')}
            className="flex-1 text-[11px] py-1.5 rounded-lg bg-bg3 border border-border
              text-muted hover:text-dim hover:border-primary/30 transition"
          >
            Padrão escuro
          </button>
          <button
            onClick={() => resetar('light')}
            className="flex-1 text-[11px] py-1.5 rounded-lg bg-bg3 border border-border
              text-muted hover:text-dim hover:border-primary/30 transition"
          >
            Padrão claro
          </button>
        </div>
      </div>
    </>
  )
}
