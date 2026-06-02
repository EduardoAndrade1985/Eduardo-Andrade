import { useState, useRef, useEffect } from 'react'
import { useEmpresa } from '../contexts/EmpresaContext'

export default function EmpresaSwitcher({ collapsed }) {
  const { empresaAtiva, minhasEmpresas, trocarEmpresa } = useEmpresa()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!empresaAtiva) return null

  const temMultiplas = minhasEmpresas.length > 1
  const nome = empresaAtiva.nome_fantasia || empresaAtiva.nome

  return (
    <div ref={ref} className="relative px-2 mb-1">
      <button
        onClick={() => temMultiplas && setOpen(o => !o)}
        className={`
          w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
          ${temMultiplas ? 'hover:bg-bg3 cursor-pointer' : 'cursor-default'}
          ${open ? 'bg-bg3' : ''}
        `}
        title={collapsed ? nome : ''}
      >
        <span className="text-base flex-shrink-0">🏨</span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-xs font-semibold text-primary truncate">
              {nome}
            </span>
            {temMultiplas && (
              <span className="text-muted text-[10px]">{open ? '▲' : '▼'}</span>
            )}
          </>
        )}
      </button>

      {open && !collapsed && (
        <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-bg2 border border-border rounded-lg shadow-lg overflow-hidden">
          {minhasEmpresas.map(emp => (
            <button
              key={emp.id}
              onClick={() => { trocarEmpresa(emp.id); setOpen(false) }}
              className={`
                w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left transition
                ${emp.id === empresaAtiva.id
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-dim hover:bg-bg3 hover:text-primary'}
              `}
            >
              <span className="flex-1 truncate">{emp.nome_fantasia || emp.nome}</span>
              {emp.id === empresaAtiva.id && <span className="text-primary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
