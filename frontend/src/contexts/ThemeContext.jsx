import { createContext, useContext, useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

const ThemeContext = createContext(null)

// O app é usado em rouparia e corredor de serviço, com muita luz e a tela
// longe dos olhos. Claro lê melhor ali, e não há alternador na visão do
// operador para ele escolher.
const temaInicial = () =>
  Capacitor.isNativePlatform() ? 'light' : (localStorage.getItem('tema') || 'dark')

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(temaInicial)

  useEffect(() => {
    document.body.classList.toggle('light', tema === 'light')
    localStorage.setItem('tema', tema)
  }, [tema])

  const toggleTema = () => setTema(t => t === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ tema, toggleTema }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
