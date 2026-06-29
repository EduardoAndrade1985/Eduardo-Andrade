import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext(null)

export const CORES_DARK = {
  bg: '#0d1117', bg2: '#161b27', bg3: '#1c2235',
  border: '#232b3e', primary: '#2dd4a0',
  muted: '#7a8fa8', dim: '#dde3ed',
}

export const CORES_LIGHT = {
  bg: '#f1f5f9', bg2: '#ffffff', bg3: '#f8fafc',
  border: '#e2e8f0', primary: '#0ea574',
  muted: '#64748b', dim: '#475569',
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function aplicarCoresCustom(cores) {
  Object.entries(cores).forEach(([k, v]) => {
    document.body.style.setProperty(`--color-${k}`, v)
  })
  const rgb = hexToRgb(cores.primary)
  document.body.style.setProperty('--glow-primary', `0 0 16px rgba(${rgb},0.18)`)
  document.body.style.setProperty('--glow-sm', `0 0 8px rgba(${rgb},0.12)`)
}

function limparCoresCustom() {
  ;['bg', 'bg2', 'bg3', 'border', 'primary', 'muted', 'dim'].forEach(k => {
    document.body.style.removeProperty(`--color-${k}`)
  })
  document.body.style.removeProperty('--glow-primary')
  document.body.style.removeProperty('--glow-sm')
}

export function ThemeProvider({ children }) {
  const [tema, setTema_] = useState(() => localStorage.getItem('tema') || 'dark')
  const [coresCustom, setCoresCustom] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tema-custom-cores')) || CORES_DARK
    } catch {
      return CORES_DARK
    }
  })

  useEffect(() => {
    document.body.classList.remove('light')
    limparCoresCustom()

    if (tema === 'light') {
      document.body.classList.add('light')
    } else if (tema === 'custom') {
      aplicarCoresCustom(coresCustom)
    }

    localStorage.setItem('tema', tema)
  }, [tema, coresCustom])

  const setTema = useCallback((modo) => setTema_(modo), [])

  const toggleTema = useCallback(
    () => setTema_(t => (t === 'dark' ? 'light' : 'dark')),
    []
  )

  const atualizarCoresCustom = useCallback((novasCores) => {
    setCoresCustom(novasCores)
    localStorage.setItem('tema-custom-cores', JSON.stringify(novasCores))
  }, [])

  return (
    <ThemeContext.Provider value={{ tema, setTema, toggleTema, coresCustom, atualizarCoresCustom }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
